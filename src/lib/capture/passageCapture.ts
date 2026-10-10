/**
 * Passage capture: one message (or a selection inside it) from a transcript the
 * user is reading becomes a reviewed record, with the exact visible text kept as
 * its source. Design: docs/design/passage-capture.md.
 *
 * Two things are kept apart throughout:
 *
 * - the **excerpt**, a source fact: the viewer's visible text of that message,
 *   verbatim (or redacted, when the user chose to hide a likely secret). It is
 *   stored once as a retained `KernelSource` and never edited afterwards;
 * - the **record**, the user's interpretation: type, title, body, project. Its
 *   body starts as the excerpt quoted, so record search finds the words, and the
 *   user may rewrite it freely without touching the source.
 *
 * Nothing here writes. `buildPassageDraft` prepares the preview; `planPassageCommit`
 * turns the reviewed draft into the rows one commit writes. The write itself is
 * the caller's, and happens only when the user presses 저장.
 */
import type { ClaudeMessage } from "../claude/types";
import { containsLikelySecret, redactText } from "../connectors/redaction";
import type { KernelSource, MoriRecord, SourceLink } from "../record-kernel/kernelTypes";
import { createKernelId, createRecord, type CreatedRecord } from "../record-kernel/recordFactory";
import type { SchemaRegistry } from "../record-kernel/schemaRegistry";

/** A message longer than this must be narrowed to a selection: an oversized
 *  message is never kept whole by default. */
export const MAX_EXCERPT_CHARS = 20_000;

/** Record types a passage can become, in the order the preview offers them. */
export const PASSAGE_RECORD_TYPES = ["note", "decision", "task", "knowledge"] as const;
export type PassageRecordType = (typeof PASSAGE_RECORD_TYPES)[number];

/** Where a saved passage came from, precisely enough to read it again. */
export type PassageLocatorV1 = {
  v: 1;
  kind: "claude-code-record";
  /** Mori session id (`auto-claude-…`): resolves the transcript through its
   *  discovery descriptor, so no file path is stored. */
  sessionId: string;
  /** The transcript's content fingerprint at capture time (window `sourceId`). */
  sourceId: string;
  /** The record's byte span and anchor (as a window cursor carries). */
  start: number;
  end: number;
  anchor: string;
  messageId: string;
  /** Character range of the excerpt inside the message's visible text. */
  from: number;
  to: number;
  /** SHA-256 (hex) of the excerpt as kept: the source text, or its redacted
   *  form when `redacted` (a hash of the hidden original would let anyone
   *  confirm a guessed secret). */
  excerptHash: string;
  /** Set when the kept excerpt is redacted: a re-read is compared after the
   *  same redaction. */
  redacted?: true;
};

const LOCATOR_PREFIX = "mori-passage:v1:";

export function formatPassageLocator(locator: PassageLocatorV1): string {
  return `${LOCATOR_PREFIX}${JSON.stringify(locator)}`;
}

/** A stored locator, or null for anything that is not a well-formed v1 locator. */
export function parsePassageLocator(value: string | undefined): PassageLocatorV1 | null {
  if (!value || !value.startsWith(LOCATOR_PREFIX)) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(value.slice(LOCATOR_PREFIX.length));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const l = parsed as Record<string, unknown>;
  const isCount = (x: unknown) => typeof x === "number" && Number.isInteger(x) && x >= 0;
  const isText = (x: unknown) => typeof x === "string" && x.length > 0;
  if (l.v !== 1 || l.kind !== "claude-code-record") return null;
  if (!isText(l.sessionId) || !isText(l.sourceId) || !isText(l.anchor) || !isText(l.messageId)) return null;
  if (!isCount(l.start) || !isCount(l.end) || !isCount(l.from) || !isCount(l.to)) return null;
  if ((l.end as number) <= (l.start as number) || (l.to as number) <= (l.from as number)) return null;
  if (typeof l.excerptHash !== "string" || !/^[0-9a-f]{64}$/.test(l.excerptHash)) return null;
  if (l.redacted !== undefined && l.redacted !== true) return null;
  return l as unknown as PassageLocatorV1;
}

/** The source's own locator: names the passage without a path, and is the key
 *  a second save of the same passage is recognised by. */
export function passageSourceKey(locator: Pick<PassageLocatorV1, "sessionId" | "start" | "anchor" | "from" | "to">): string {
  return `mori:session/${locator.sessionId}#${locator.start}:${locator.anchor}:${locator.from}-${locator.to}`;
}

export async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export type PassageDraftInput = {
  sessionId: string;
  sourceId: string;
  message: ClaudeMessage;
  /**
   * Text the user selected inside this message, with where it starts in the
   * message's visible text when the viewer could tell (a repeated phrase is
   * then kept at the occurrence the user chose, not the first one).
   */
  selection?: { text: string; from?: number };
};

export type PassageDraft = {
  locator: PassageLocatorV1;
  /** The excerpt exactly as the source shows it. */
  excerpt: string;
  /** True when the excerpt is a selection, not the whole message. */
  partial: boolean;
  messageAt?: string;
  role: "human" | "assistant";
  secretLikely: boolean;
  /** Prefill for the editable record fields. */
  suggestedTitle: string;
  /** SHA-256 of the excerpt after redaction, when redaction changes it. */
  redactedHash?: string;
};

export type PassageDraftRefusal =
  | "no-record"
  | "not-a-message"
  | "empty"
  | "too-long"
  | "selection-outside"
  | "mixed-tool";

/** How the viewer renders a tool call inside a message's visible text. */
const TOOL_LINE = /(^|\n)🔧 /;

/**
 * The preview for one message, or why it cannot be captured. A selection must
 * be text of this message (the first occurrence names its range); without one
 * the whole visible message is the excerpt, refused when it is oversized.
 */
export async function buildPassageDraft(
  input: PassageDraftInput,
): Promise<{ draft: PassageDraft } | { refused: PassageDraftRefusal }> {
  const { message } = input;
  const record = message.record;
  if (!record) return { refused: "no-record" };
  if (
    (message.role !== "human" && message.role !== "assistant") ||
    message.subkind === "tool_result" ||
    message.subkind === "tool_use"
  ) {
    return { refused: "not-a-message" };
  }
  const content = message.content;
  const raw = input.selection?.text ?? "";
  const selection = raw.trim();
  let from = 0;
  let to = content.length;
  if (selection) {
    // Where the viewer says it starts, past any whitespace the trim dropped;
    // the first occurrence only when the viewer could not say.
    const hinted = input.selection?.from === undefined ? -1 : input.selection.from + (raw.length - raw.trimStart().length);
    const at = hinted >= 0 && content.slice(hinted, hinted + selection.length) === selection ? hinted : content.indexOf(selection);
    if (at < 0) return { refused: "selection-outside" };
    from = at;
    to = at + selection.length;
  } else if (TOOL_LINE.test(content)) {
    // A record that mixes text with a tool call: the call line (paths,
    // commands) is not something anyone wrote to keep. The user selects.
    return { refused: "mixed-tool" };
  }
  const excerpt = content.slice(from, to);
  if (!excerpt.trim()) return { refused: "empty" };
  if (excerpt.length > MAX_EXCERPT_CHARS) return { refused: "too-long" };
  const locator: PassageLocatorV1 = {
    v: 1,
    kind: "claude-code-record",
    sessionId: input.sessionId,
    sourceId: input.sourceId,
    start: record.start,
    end: record.end,
    anchor: record.anchor,
    messageId: message.id,
    from,
    to,
    excerptHash: await sha256Hex(excerpt),
  };
  const secretLikely = containsLikelySecret(excerpt);
  const redacted = secretLikely ? redactText(excerpt) : null;
  return {
    draft: {
      locator,
      excerpt,
      partial: from > 0 || to < content.length,
      messageAt: message.createdAt || undefined,
      role: message.role === "human" ? "human" : "assistant",
      secretLikely,
      suggestedTitle: titleFrom(excerpt),
      redactedHash: redacted && redacted.replacementCount > 0 ? await sha256Hex(redacted.redacted) : undefined,
    },
  };
}

/** A first line worth reading as a title: markdown markers dropped, clipped. */
export function titleFrom(excerpt: string): string {
  const line =
    excerpt
      .split("\n")
      .map((text) => text.replace(/^\s*(#{1,6}\s+|[-*+]\s+|>\s*|\d+[.)]\s+)/, "").replace(/[*_`]/g, "").trim())
      .find((text) => text.length > 0) ?? "";
  return line.length > 80 ? `${line.slice(0, 79).trimEnd()}…` : line;
}

/** The excerpt as a markdown quote, the body a new record starts from. */
export function quoteExcerpt(excerpt: string): string {
  return excerpt
    .split("\n")
    .map((line) => (line.length > 0 ? `> ${line}` : ">"))
    .join("\n");
}

export type PassageEdits = {
  schemaId: PassageRecordType;
  title: string;
  body: string;
  /** The project the NEW record is filed under; never the source session's. */
  contextId: string | null;
  /** Hide likely secrets in what is kept. */
  redact: boolean;
};

export type PassageCommitPlan = {
  source: KernelSource;
  created: CreatedRecord;
  link: SourceLink;
};

/**
 * The rows one confirmed capture writes. The record is the user's (origin
 * `user`, so it is active and its create revision is the user's); the source
 * keeps the excerpt (redacted when asked) and survives the transcript.
 */
export function planPassageCommit(
  draft: PassageDraft,
  edits: PassageEdits,
  registry: SchemaRegistry,
  now: () => Date = () => new Date(),
): PassageCommitPlan {
  const capturedAt = now().toISOString();
  const kept = edits.redact && draft.redactedHash ? redactText(draft.excerpt).redacted : null;
  // A redacted save keeps nothing derived from the hidden text: the stored
  // hash and the locator's both name the redacted form.
  const locator: PassageLocatorV1 = kept
    ? { ...draft.locator, excerptHash: draft.redactedHash!, redacted: true }
    : draft.locator;
  const source: KernelSource = {
    id: createKernelId("src"),
    kind: "agent-session",
    locator: passageSourceKey(locator),
    rawBody: kept ?? draft.excerpt,
    contentHash: locator.excerptHash,
    publishedAt: draft.messageAt,
    capturedAt,
    retention: kept ? "redacted" : "retained",
  };
  const properties: MoriRecord["properties"] = {};
  if (edits.schemaId === "task") properties.done = false;
  const created = createRecord(
    {
      schemaId: edits.schemaId,
      title: edits.title,
      body: edits.body,
      origin: "user",
      contextIds: edits.contextId ? [edits.contextId] : [],
      // When the message was written: a source timestamp, not when it was saved.
      ...(draft.messageAt
        ? { occurredStart: draft.messageAt, sourceCreatedAt: draft.messageAt, timeBasis: "source-exact" as const }
        : {}),
      properties,
      now,
    },
    registry,
  );
  const link: SourceLink = {
    sourceId: source.id,
    recordId: created.record.id,
    role: "origin",
    locator: formatPassageLocator(locator),
  };
  return { source, created, link };
}

/** A record kept from a session message, as the reader names it. */
export type KeptPassage = { recordId: string; title: string };

/**
 * The live records kept from each message of one session, keyed by the
 * message's place in the transcript (`start:anchor`, as a window message's
 * `record` carries it), newest first. Read from the passage sources' own
 * locators, so it needs no transcript read and no path.
 */
export function keptPassagesByMessage(
  sessionId: string,
  sources: readonly KernelSource[],
  links: readonly SourceLink[],
  records: readonly MoriRecord[],
): Map<string, KeptPassage[]> {
  const prefix = `mori:session/${sessionId}#`;
  const placeOfSource = new Map<string, string>();
  for (const source of sources) {
    if (source.kind !== "agent-session" || !source.locator?.startsWith(prefix)) continue;
    const rest = source.locator.slice(prefix.length);
    const rangeAt = rest.lastIndexOf(":");
    if (rangeAt <= 0) continue;
    placeOfSource.set(source.id, rest.slice(0, rangeAt));
  }
  const live = new Map(
    records
      .filter((record) => record.status !== "discarded" && record.status !== "archived")
      .map((record) => [record.id, record]),
  );
  const byPlace = new Map<string, MoriRecord[]>();
  for (const link of links) {
    const place = placeOfSource.get(link.sourceId);
    const record = live.get(link.recordId);
    if (!place || !record) continue;
    const kept = byPlace.get(place) ?? [];
    if (!kept.includes(record)) kept.push(record);
    byPlace.set(place, kept);
  }
  return new Map(
    [...byPlace].map(([place, kept]) => [
      place,
      kept
        .sort((a, b) => b.capturedAt.localeCompare(a.capturedAt))
        .map((record) => ({ recordId: record.id, title: record.title })),
    ]),
  );
}

/** The place key of a window message, matching `keptPassagesByMessage`. */
export function messagePlace(record: { start: number; anchor: string }): string {
  return `${record.start}:${record.anchor}`;
}

/**
 * A record already made from this exact passage, if any is still live: saving
 * the same passage twice offers that record instead of a duplicate.
 */
export function findExistingPassageRecord(
  draft: PassageDraft,
  sources: readonly KernelSource[],
  links: readonly SourceLink[],
  records: readonly MoriRecord[],
): MoriRecord | null {
  const key = passageSourceKey(draft.locator);
  // The same place AND the same text: a passage rewritten in place is new.
  const hashes = new Set([draft.locator.excerptHash, draft.redactedHash].filter(Boolean));
  const sourceIds = new Set(
    sources
      .filter((source) => source.kind === "agent-session" && source.locator === key && hashes.has(source.contentHash ?? ""))
      .map((source) => source.id),
  );
  if (sourceIds.size === 0) return null;
  const recordIds = new Set(links.filter((link) => sourceIds.has(link.sourceId)).map((link) => link.recordId));
  return records.find((record) => recordIds.has(record.id) && record.status !== "discarded" && record.status !== "archived") ?? null;
}
