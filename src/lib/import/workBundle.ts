/**
 * Work Bundle — composite multi-source preview.
 *
 * A single AI coding work session is rarely one artifact. The same hour of
 * work leaves a Claude / Codex / OpenCode transcript, a Codex run log, a git
 * diff, a few terminal commands, and a note-to-self. Each of these already
 * has a normalizer in `src/lib/import` / `src/lib/connectors` that turns it
 * into a {@link NormalizedImportCandidate}. What was missing is a layer that
 * treats several of those candidates as *one work unit* and shows the user a
 * reconstructed understanding of it before anything is applied.
 *
 * `buildWorkBundlePreview` is that layer. It is a pure derivation — it never
 * persists, never calls an LLM, never reaches the network. It answers the
 * product-validation questions directly from the already-normalized evidence:
 *
 *  - What happened during this work session? → events + span + families.
 *  - Which source produced which event?      → per-source breakdown.
 *  - What files / commands appeared?          → detectedFiles + per-source.
 *  - What should be reviewed before applying? → trust / fidelity / redaction.
 *  - Are there duplicates?                    → cross-source dedup counts.
 *  - What will be created if applied?         → willCreate.
 *
 * Applying a bundle persists each source as its own session import (see
 * `addImportBatch`), so per-source provenance survives into the Evidence Hub
 * and Timeline. This preview is the explicit review-before-apply gate for the
 * composite assembly.
 */
import type {
  CaptureFidelityLevel,
  SourceKind,
  SourceRef,
  TimelineEvent,
  TrustLevel,
} from "../../domain/types";
import {
  deriveSourceFamily,
  getSourceFamilyVisuals,
  type TimelineSourceFamily,
} from "../timeline/activityModel";
import { containsLikelySecret } from "../connectors/redaction";
import type { NormalizedImportCandidate } from "./types";

/** Where a staged bundle source came from — mirrors the Import Review origin tags. */
export type WorkBundleSourceOrigin =
  | "ai-transcript"
  | "git-diff"
  | "manual-note"
  | "url"
  | "connector-jsonl";

/** One staged source inside a work bundle: a normalized candidate plus its origin. */
export type WorkBundleItem = {
  /** Stable id for React keys / removal. Distinct from the source id. */
  id: string;
  origin: WorkBundleSourceOrigin;
  candidate: NormalizedImportCandidate;
};

export type WorkBundleSourcePreview = {
  itemId: string;
  origin: WorkBundleSourceOrigin;
  sourceId: string;
  title: string;
  detail: string;
  kind: SourceKind;
  family: TimelineSourceFamily;
  familyLabel: string;
  familyShortLabel: string;
  /** Events the source contributes, before cross-bundle dedup. */
  eventCount: number;
  /** Events unique to the bundle (this source seen first). */
  newEventCount: number;
  /** Events dropped because another staged source already carried them. */
  duplicateEventCount: number;
  trustLevel: TrustLevel;
  fidelityLevel: CaptureFidelityLevel;
  rawRetention: SourceRef["rawRetention"];
  redactionStatus: SourceRef["redactionStatus"];
  fileRefs: string[];
  spanStart: string | null;
  spanEnd: string | null;
};

export type WorkBundleTrustSummary = {
  verified: number;
  observed: number;
  inferred: number;
};

export type WorkBundleFidelitySummary = {
  full: number;
  partial: number;
  fragment: number;
  unknown: number;
};

export type WorkBundlePreview = {
  isEmpty: boolean;
  sourceCount: number;
  /** Unique events across the whole bundle (after cross-source dedup). */
  totalEventCount: number;
  /** Events dropped as cross-source duplicates. */
  duplicateEventCount: number;
  detectedFamilies: TimelineSourceFamily[];
  familyLabels: string[];
  sources: WorkBundleSourcePreview[];
  /** Shared work area inferred from the files the sources touch (e.g. `src/sync`). */
  workContextHint: string | null;
  proposedTitle: string;
  detectedFiles: string[];
  spanStart: string | null;
  spanEnd: string | null;
  trustSummary: WorkBundleTrustSummary;
  fidelitySummary: WorkBundleFidelitySummary;
  /** Any staged source still needs a redaction pass before it is durable. */
  redactionPending: boolean;
  /** A staged event title / summary tripped the local secret-pattern heuristic. */
  secretFlagged: boolean;
  willCreate: {
    sourceCount: number;
    eventCount: number;
    fileCount: number;
  };
};

/** Stable per-event identity for cross-source dedup. */
function eventDedupKey(event: TimelineEvent): string {
  return event.connectorEventId ?? event.id;
}

function minIso(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return new Date(a).getTime() <= new Date(b).getTime() ? a : b;
}

function maxIso(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return new Date(a).getTime() >= new Date(b).getTime() ? a : b;
}

function eventSpan(events: TimelineEvent[]): { start: string | null; end: string | null } {
  let start: string | null = null;
  let end: string | null = null;
  for (const event of events) {
    start = minIso(start, event.start);
    end = maxIso(end, event.end ?? event.start);
  }
  return { start, end };
}

const CODE_EXTENSIONS =
  "ts|tsx|js|jsx|mjs|cjs|py|rs|go|java|rb|php|css|scss|less|html|json|md|sql|sh|bash|zsh|yml|yaml|toml|lock|env|txt|vue|svelte|c|cpp|h|hpp|kt|swift";

// A path with at least one slash + extension, OR a bare filename with a known
// code extension. Numeric-only "extensions" (version strings like 0.0.0) are
// not matched by the bare-filename branch because the extension must be a known
// code suffix.
const FILE_PATH_RE = new RegExp(
  `(?:[A-Za-z0-9_.-]+\\/)+[A-Za-z0-9_.-]+\\.[A-Za-z0-9]{1,6}|[A-Za-z0-9_-]+(?:\\.[A-Za-z0-9_-]+)*\\.(?:${CODE_EXTENSIONS})\\b`,
  "g",
);

/** Best-effort file-path extraction from captured titles / summaries. */
export function extractFilePaths(text: string): string[] {
  const found = new Set<string>();
  for (const match of text.matchAll(FILE_PATH_RE)) {
    const token = match[0];
    if (token.includes("://")) continue; // skip URLs
    found.add(token);
  }
  return [...found];
}

/**
 * Drop a bare filename (`queue.ts`) when a fuller path to the same file
 * (`src/sync/queue.ts`) is also present, so the file count is not inflated by
 * the same file mentioned two ways across captured summaries.
 */
function dedupeFilePaths(files: string[]): string[] {
  const pathed = files.filter((file) => file.includes("/"));
  return files.filter((file) => {
    if (file.includes("/")) return true;
    return !pathed.some((path) => path.endsWith(`/${file}`));
  });
}

/** Longest shared leading directory across the touched files (≥2 must agree). */
function deriveWorkContextHint(files: string[]): string | null {
  const dirs = files
    .filter((file) => file.includes("/"))
    .map((file) => file.slice(0, file.lastIndexOf("/")));
  if (dirs.length < 2) return null;
  const split = dirs.map((dir) => dir.split("/"));
  const first = split[0]!;
  let prefixLen = first.length;
  for (const segments of split) {
    let i = 0;
    while (i < prefixLen && i < segments.length && segments[i] === first[i]) i += 1;
    prefixLen = i;
  }
  if (prefixLen === 0) return null;
  return first.slice(0, prefixLen).join("/");
}

function cleanTitle(value: string): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > 72 ? `${normalized.slice(0, 69)}…` : normalized;
}

/**
 * Propose a single work-unit title. Prefer the goal expressed by the first AI
 * turn (its summary is the first user message), then a connector session
 * title, then a family-based fallback so the title is never empty.
 */
function proposeWorkBundleTitle(
  items: WorkBundleItem[],
  familyLabels: string[],
): string {
  const aiItem = items.find((item) => item.origin === "ai-transcript");
  const aiEventSummary = aiItem?.candidate.events[0]?.summary?.trim();
  if (aiEventSummary) return cleanTitle(aiEventSummary);

  const connectorItem = items.find((item) => item.origin === "connector-jsonl");
  const connectorTitle = connectorItem?.candidate.source.title?.trim();
  if (connectorTitle) return cleanTitle(connectorTitle);

  const noteTitle = items.find((item) => item.origin === "manual-note")?.candidate.source.title?.trim();
  if (noteTitle) return cleanTitle(noteTitle);

  if (familyLabels.length > 0) return `${familyLabels.join(" + ")} 작업 번들`;
  return "작업 번들";
}

/**
 * Build a composite preview from staged work-bundle items. Pure — no I/O.
 * Returns an empty preview (`isEmpty: true`) when there are no items.
 */
export function buildWorkBundlePreview(items: WorkBundleItem[]): WorkBundlePreview {
  if (items.length === 0) {
    return {
      isEmpty: true,
      sourceCount: 0,
      totalEventCount: 0,
      duplicateEventCount: 0,
      detectedFamilies: [],
      familyLabels: [],
      sources: [],
      workContextHint: null,
      proposedTitle: "작업 번들",
      detectedFiles: [],
      spanStart: null,
      spanEnd: null,
      trustSummary: { verified: 0, observed: 0, inferred: 0 },
      fidelitySummary: { full: 0, partial: 0, fragment: 0, unknown: 0 },
      redactionPending: false,
      secretFlagged: false,
      willCreate: { sourceCount: 0, eventCount: 0, fileCount: 0 },
    };
  }

  const seenEventKeys = new Set<string>();
  const familyOrder: TimelineSourceFamily[] = [];
  const familySeen = new Set<TimelineSourceFamily>();
  const trustSummary: WorkBundleTrustSummary = { verified: 0, observed: 0, inferred: 0 };
  const fidelitySummary: WorkBundleFidelitySummary = { full: 0, partial: 0, fragment: 0, unknown: 0 };
  const allFiles = new Set<string>();

  let totalUniqueEvents = 0;
  let totalDuplicateEvents = 0;
  let redactionPending = false;
  let secretFlagged = false;
  let bundleStart: string | null = null;
  let bundleEnd: string | null = null;

  const sources: WorkBundleSourcePreview[] = items.map((item) => {
    const { source, events } = item.candidate;
    const family = deriveSourceFamily(source.kind);
    if (!familySeen.has(family)) {
      familySeen.add(family);
      familyOrder.push(family);
    }
    const visuals = getSourceFamilyVisuals(family);

    let newEventCount = 0;
    let duplicateEventCount = 0;
    const fileRefs = new Set<string>();
    for (const event of events) {
      const key = eventDedupKey(event);
      if (seenEventKeys.has(key)) {
        duplicateEventCount += 1;
      } else {
        seenEventKeys.add(key);
        newEventCount += 1;
      }
      const haystack = `${event.title} ${event.summary}`;
      for (const path of extractFilePaths(haystack)) {
        fileRefs.add(path);
        allFiles.add(path);
      }
      if (containsLikelySecret(haystack)) secretFlagged = true;
    }
    totalUniqueEvents += newEventCount;
    totalDuplicateEvents += duplicateEventCount;

    trustSummary[source.trustLevel] += 1;
    const fidelityLevel: CaptureFidelityLevel = source.captureFidelity?.level ?? "unknown";
    fidelitySummary[fidelityLevel] += 1;
    if (source.redactionStatus === "pending") redactionPending = true;

    const span = eventSpan(events);
    bundleStart = minIso(bundleStart, span.start);
    bundleEnd = maxIso(bundleEnd, span.end);

    return {
      itemId: item.id,
      origin: item.origin,
      sourceId: source.id,
      title: source.title,
      detail: source.detail,
      kind: source.kind,
      family,
      familyLabel: visuals.label,
      familyShortLabel: visuals.shortLabel,
      eventCount: events.length,
      newEventCount,
      duplicateEventCount,
      trustLevel: source.trustLevel,
      fidelityLevel,
      rawRetention: source.rawRetention,
      redactionStatus: source.redactionStatus,
      fileRefs: dedupeFilePaths([...fileRefs]),
      spanStart: span.start,
      spanEnd: span.end,
    };
  });

  const detectedFiles = dedupeFilePaths([...allFiles]).sort((a, b) => a.localeCompare(b));
  const familyLabels = familyOrder.map((family) => getSourceFamilyVisuals(family).label);

  return {
    isEmpty: false,
    sourceCount: items.length,
    totalEventCount: totalUniqueEvents,
    duplicateEventCount: totalDuplicateEvents,
    detectedFamilies: familyOrder,
    familyLabels,
    sources,
    workContextHint: deriveWorkContextHint(detectedFiles),
    proposedTitle: proposeWorkBundleTitle(items, familyLabels),
    detectedFiles,
    spanStart: bundleStart,
    spanEnd: bundleEnd,
    trustSummary,
    fidelitySummary,
    redactionPending,
    secretFlagged,
    willCreate: {
      sourceCount: items.length,
      eventCount: totalUniqueEvents,
      fileCount: detectedFiles.length,
    },
  };
}
