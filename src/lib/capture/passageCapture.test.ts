import { describe, expect, it } from "vitest";
import type { ClaudeMessage } from "../claude/types";
import { createSchemaRegistry } from "../record-kernel/schemaRegistry";
import type { KernelSource, MoriRecord, SourceLink } from "../record-kernel/kernelTypes";
import {
  MAX_EXCERPT_CHARS,
  buildPassageDraft,
  findExistingPassageRecord,
  formatPassageLocator,
  parsePassageLocator,
  passageSourceKey,
  planPassageCommit,
  quoteExcerpt,
  sha256Hex,
  titleFrom,
  type PassageDraft,
} from "./passageCapture";

const registry = createSchemaRegistry();
const NOW = () => new Date("2026-10-09T09:00:00.000Z");

const message = (overrides: Partial<ClaudeMessage> = {}): ClaudeMessage => ({
  id: "msg-1",
  role: "assistant",
  content: "## Decision\nCandidate B: SMB served from nuc-srv.\nRejected: NFS.",
  createdAt: "2026-10-01T03:04:05.000Z",
  subkind: "",
  record: { start: 1200, end: 1460, anchor: "00ff00ff00ff00ff" },
  ...overrides,
});

async function draftOf(overrides: Partial<ClaudeMessage> = {}, selection?: string, from?: number): Promise<PassageDraft> {
  const result = await buildPassageDraft({
    sessionId: "auto-claude-abc",
    sourceId: "src-fp",
    message: message(overrides),
    selection: selection === undefined ? undefined : { text: selection, from },
  });
  if (!("draft" in result)) throw new Error(`refused: ${result.refused}`);
  return result.draft;
}

describe("what a passage keeps", () => {
  it("keeps the message's visible text verbatim, named by its record", async () => {
    const draft = await draftOf();
    expect(draft.excerpt).toBe(message().content);
    expect(draft.partial).toBe(false);
    expect(draft.locator).toMatchObject({
      sessionId: "auto-claude-abc",
      sourceId: "src-fp",
      start: 1200,
      end: 1460,
      anchor: "00ff00ff00ff00ff",
      messageId: "msg-1",
      from: 0,
      to: message().content.length,
    });
    expect(draft.locator.excerptHash).toBe(await sha256Hex(message().content));
    expect(draft.messageAt).toBe("2026-10-01T03:04:05.000Z");
  });

  it("keeps only a selection made inside the message, with its range", async () => {
    const draft = await draftOf({}, "Candidate B: SMB served from nuc-srv.");
    expect(draft.excerpt).toBe("Candidate B: SMB served from nuc-srv.");
    expect(draft.partial).toBe(true);
    expect(message().content.slice(draft.locator.from, draft.locator.to)).toBe(draft.excerpt);
  });

  it("keeps a repeated phrase at the occurrence the user selected", async () => {
    const content = "B wins here.\nLater: B wins here.";
    const second = content.lastIndexOf("B wins here.");
    const draft = await draftOf({ content }, "B wins here.", second);
    expect([draft.locator.from, draft.locator.to]).toEqual([second, second + "B wins here.".length]);
    // A position that does not hold the text falls back to the first occurrence.
    expect((await draftOf({ content }, "B wins here.", 3)).locator.from).toBe(0);
    // Leading whitespace in the selection moves its start, not its text.
    expect((await draftOf({ content }, "  B wins here.", second - 2)).locator.from).toBe(second);
  });

  it("asks for a selection when a message mixes text with a tool call", async () => {
    const content = "Reading the config now.\n🔧 Read: /home/u/secret/file";
    expect(await buildPassageDraft({ sessionId: "s", sourceId: "f", message: message({ content }) })).toEqual({ refused: "mixed-tool" });
    expect((await draftOf({ content }, "Reading the config now.")).excerpt).toBe("Reading the config now.");
  });

  it("refuses a selection that is not text of this message", async () => {
    const result = await buildPassageDraft({ sessionId: "s", sourceId: "f", message: message(), selection: { text: "text from another message" } });
    expect(result).toEqual({ refused: "selection-outside" });
  });

  it("refuses an oversized message unless the user narrows it", async () => {
    const long = "x".repeat(MAX_EXCERPT_CHARS + 1);
    expect(await buildPassageDraft({ sessionId: "s", sourceId: "f", message: message({ content: long }) })).toEqual({ refused: "too-long" });
    const narrowed = await buildPassageDraft({ sessionId: "s", sourceId: "f", message: message({ content: `${long}keep this` }), selection: { text: "keep this" } });
    expect("draft" in narrowed && narrowed.draft.excerpt).toBe("keep this");
  });

  it("refuses a message read without its record position", async () => {
    expect(await buildPassageDraft({ sessionId: "s", sourceId: "f", message: message({ record: undefined }) })).toEqual({ refused: "no-record" });
  });

  it("refuses tool output: it is not a message anyone wrote", async () => {
    expect(await buildPassageDraft({ sessionId: "s", sourceId: "f", message: message({ role: "human", subkind: "tool_result" }) })).toEqual({ refused: "not-a-message" });
    expect(await buildPassageDraft({ sessionId: "s", sourceId: "f", message: message({ role: "system" }) })).toEqual({ refused: "not-a-message" });
    expect(await buildPassageDraft({ sessionId: "s", sourceId: "f", message: message({ subkind: "tool_use" }) })).toEqual({ refused: "not-a-message" });
  });

  it("flags a likely secret for the user to decide on", async () => {
    const draft = await draftOf({ content: "use OPENAI_API_KEY=sk-abcdefghijklmnopqrstuvwxyz123456 here" });
    expect(draft.secretLikely).toBe(true);
  });
});

describe("the stored locator", () => {
  it("round-trips and rejects anything malformed", async () => {
    const draft = await draftOf();
    const text = formatPassageLocator(draft.locator);
    expect(parsePassageLocator(text)).toEqual(draft.locator);
    expect(parsePassageLocator(undefined)).toBeNull();
    expect(parsePassageLocator("L10-20")).toBeNull();
    expect(parsePassageLocator("mori-passage:v1:{not json")).toBeNull();
    expect(parsePassageLocator(formatPassageLocator({ ...draft.locator, end: 5 }))).toBeNull();
    expect(parsePassageLocator(formatPassageLocator({ ...draft.locator, excerptHash: "abc" }))).toBeNull();
    expect(parsePassageLocator(text.replace("mori-passage:v1:", "mori-passage:v2:"))).toBeNull();
  });

  it("never stores a file path", async () => {
    const draft = await draftOf();
    expect(formatPassageLocator(draft.locator)).not.toContain("/");
    expect(passageSourceKey(draft.locator)).toBe("mori:session/auto-claude-abc#1200:00ff00ff00ff00ff:0-" + message().content.length);
  });
});

describe("what one confirmed capture writes", () => {
  it("a user record, a retained excerpt source, and an origin link with the locator", async () => {
    const draft = await draftOf();
    const plan = planPassageCommit(
      draft,
      { schemaId: "decision", title: "SMB on nuc-srv", body: "Chosen for simplicity.\n\n" + quoteExcerpt(draft.excerpt), contextId: "ctx-infra", redact: false },
      registry,
      NOW,
    );
    expect(plan.source).toMatchObject({
      kind: "agent-session",
      rawBody: draft.excerpt,
      retention: "retained",
      contentHash: draft.locator.excerptHash,
      publishedAt: "2026-10-01T03:04:05.000Z",
      capturedAt: "2026-10-09T09:00:00.000Z",
    });
    expect(plan.created.record).toMatchObject({
      schemaId: "decision",
      title: "SMB on nuc-srv",
      status: "active",
      origin: "user",
      contextIds: ["ctx-infra"],
      occurredStart: "2026-10-01T03:04:05.000Z",
      timeBasis: "source-exact",
    });
    expect(plan.created.revision).toMatchObject({ actor: "user", operation: "create" });
    expect(plan.link).toMatchObject({ sourceId: plan.source.id, recordId: plan.created.record.id, role: "origin" });
    expect(parsePassageLocator(plan.link.locator)).toEqual(draft.locator);
  });

  it("files only the new record; an unfiled choice stays unfiled", async () => {
    const plan = planPassageCommit(await draftOf(), { schemaId: "note", title: "t", body: "b", contextId: null, redact: false }, registry, NOW);
    expect(plan.created.record.contextIds).toEqual([]);
  });

  it("starts a task open, never done", async () => {
    const plan = planPassageCommit(await draftOf(), { schemaId: "task", title: "Run Gate 4", body: "", contextId: null, redact: false }, registry, NOW);
    expect(plan.created.record.properties.done).toBe(false);
  });

  it("keeps nothing derived from a hidden secret: text and both hashes are of the redacted form", async () => {
    const draft = await draftOf({ content: "token: ghp_abcdefghijklmnopqrstuvwxyz0123456789 done" });
    const plan = planPassageCommit(draft, { schemaId: "note", title: "t", body: "b", contextId: null, redact: true }, registry, NOW);
    expect(plan.source.retention).toBe("redacted");
    expect(plan.source.rawBody).not.toContain("ghp_abcdefghijklmnopqrstuvwxyz0123456789");
    const keptHash = await sha256Hex(plan.source.rawBody!);
    expect(plan.source.contentHash).toBe(keptHash);
    expect(plan.source.contentHash).not.toBe(draft.locator.excerptHash);
    const stored = parsePassageLocator(plan.link.locator)!;
    expect(stored).toMatchObject({ excerptHash: keptHash, redacted: true });
    expect(JSON.stringify(plan)).not.toContain(draft.locator.excerptHash);
  });

  it("keeps the text as is when the user leaves 가리기 off", async () => {
    const draft = await draftOf({ content: "token: ghp_abcdefghijklmnopqrstuvwxyz0123456789 done" });
    const plan = planPassageCommit(draft, { schemaId: "note", title: "t", body: "b", contextId: null, redact: false }, registry, NOW);
    expect(plan.source).toMatchObject({ retention: "retained", rawBody: draft.excerpt, contentHash: draft.locator.excerptHash });
    expect(parsePassageLocator(plan.link.locator)!.redacted).toBeUndefined();
  });

  it("recognises a redacted save of the same passage", async () => {
    const draft = await draftOf({ content: "token: ghp_abcdefghijklmnopqrstuvwxyz0123456789 done" });
    const plan = planPassageCommit(draft, { schemaId: "note", title: "t", body: "b", contextId: null, redact: true }, registry, NOW);
    expect(findExistingPassageRecord(draft, [plan.source], [plan.link], [plan.created.record])?.id).toBe(plan.created.record.id);
  });

  it("dates a message with no timestamp as unknown, never as the save time", async () => {
    const plan = planPassageCommit(await draftOf({ createdAt: "" }), { schemaId: "note", title: "t", body: "", contextId: null, redact: false }, registry, NOW);
    expect(plan.created.record.timeBasis).toBe("unknown");
    expect(plan.created.record.occurredStart).toBeUndefined();
  });

  it("refuses an empty title, as every record does", async () => {
    const draft = await draftOf();
    expect(() => planPassageCommit(draft, { schemaId: "note", title: "  ", body: "", contextId: null, redact: false }, registry, NOW)).toThrow();
  });
});

describe("saving the same passage twice", () => {
  it("finds the live record made from this exact passage", async () => {
    const draft = await draftOf();
    const plan = planPassageCommit(draft, { schemaId: "note", title: "t", body: "", contextId: null, redact: false }, registry, NOW);
    const sources: KernelSource[] = [plan.source];
    const links: SourceLink[] = [plan.link];
    const records: MoriRecord[] = [plan.created.record];
    expect(findExistingPassageRecord(draft, sources, links, records)?.id).toBe(plan.created.record.id);
    // Discarded: offer a fresh capture instead.
    expect(findExistingPassageRecord(draft, sources, links, [{ ...plan.created.record, status: "discarded" }])).toBeNull();
  });

  it("does not confuse a different selection, a changed text, or another session", async () => {
    const draft = await draftOf();
    const plan = planPassageCommit(draft, { schemaId: "note", title: "t", body: "", contextId: null, redact: false }, registry, NOW);
    const store = { sources: [plan.source], links: [plan.link], records: [plan.created.record] };
    const narrower = await draftOf({}, "Rejected: NFS.");
    expect(findExistingPassageRecord(narrower, store.sources, store.links, store.records)).toBeNull();
    const changed = await draftOf({ content: message().content + " (edited)" });
    expect(findExistingPassageRecord(changed, store.sources, store.links, store.records)).toBeNull();
    const elsewhere = { ...draft, locator: { ...draft.locator, sessionId: "auto-claude-other" } };
    expect(findExistingPassageRecord(elsewhere, store.sources, store.links, store.records)).toBeNull();
  });
});

describe("prefill", () => {
  it("titles from the first readable line, without markdown", () => {
    expect(titleFrom("## Decision\nCandidate B")).toBe("Decision");
    expect(titleFrom("\n\n- **SMB** on nuc-srv")).toBe("SMB on nuc-srv");
    expect(titleFrom("a".repeat(100)).length).toBeLessThanOrEqual(80);
  });

  it("quotes the excerpt line by line", () => {
    expect(quoteExcerpt("one\n\ntwo")).toBe("> one\n>\n> two");
  });
});
