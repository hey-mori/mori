import { describe, expect, it } from "vitest";
import type { TimelineEvent } from "../../domain/types";
import type { StoredSessionImport } from "../storage/storageTypes";
import type { NormalizedImportCandidate } from "./types";
import { logicalSourceKey, planSourceReopen, storedImportsOfSource } from "./autoSourceReopen";

const event = (id: string, extra: Partial<TimelineEvent> = {}): TimelineEvent =>
  ({ id, sessionId: "s", projectId: "p", start: "2026-10-08T09:00:00Z", type: "aiConversation", title: id, summary: id, sourceRefs: [], linkedIssueIds: [], linkedDecisionIds: [], relationshipIds: [], trustLevel: "observed", confidence: 0.9, createdBy: "import", userModified: false, ...extra }) as TimelineEvent;

function candidate(sourceId: string, ids: string[], title = "Claude Code · Same", kind = "claudeTranscript"): NormalizedImportCandidate {
  return {
    source: { id: sourceId, sessionId: "s", kind, title, detail: "", trustLevel: "observed", redactionStatus: "pending", rawRetention: "summaryOnly", capturedAt: "", relatedEventIds: ids },
    events: ids.map((id) => event(id, { sourceRefs: [sourceId] })),
  } as unknown as NormalizedImportCandidate;
}

function stored(c: NormalizedImportCandidate): StoredSessionImport {
  return { id: c.source.id, sessionId: "s", source: c.source, events: c.events, savedAt: "2026-10-08T00:00:00Z", adapter: "browser-local-storage" } as StoredSessionImport;
}

describe("logical source of an auto import", () => {
  it("is the source id without its capture time", () => {
    expect(logicalSourceKey("src-claude-code-38dd037d-06cd-20261008123837")).toBe("src-claude-code-38dd037d-06cd");
    expect(logicalSourceKey("src-manual-note")).toBeNull();
  });

  it("matches only the same conversation and kind, never a title", () => {
    const fresh = candidate("src-claude-code-aaa-20261009000000", ["e1"]);
    const sameTitleOtherConversation = stored(candidate("src-claude-code-bbb-20261008000000", ["x1"]));
    const otherKind = stored(candidate("src-claude-code-aaa-20261008000000", ["e1"], "Claude Code · Same", "manualNote"));
    expect(storedImportsOfSource([sameTitleOtherConversation, otherKind], fresh)).toEqual([]);
    expect(planSourceReopen([sameTitleOtherConversation, otherKind], fresh)).toEqual({ kind: "add" });
  });

  it("an id without a capture time is never taken for an auto import", () => {
    const fresh = candidate("src-manual", ["e1"]);
    expect(planSourceReopen([stored(candidate("src-manual", ["e1"]))], fresh)).toEqual({ kind: "add" });
  });

  it("several stored copies are left alone", () => {
    const fresh = candidate("src-claude-code-aaa-20261009000000", ["e1", "e2"]);
    const copies = ["20261001000000", "20261002000000"].map((time) => stored(candidate(`src-claude-code-aaa-${time}`, ["e1"])));
    expect(planSourceReopen(copies, fresh)).toMatchObject({ kind: "keep", reason: "ambiguous" });
  });

  it("an unchanged read is not a write", () => {
    const first = stored(candidate("src-claude-code-aaa-20261008000000", ["e1", "e2"]));
    expect(planSourceReopen([first], candidate("src-claude-code-aaa-20261009000000", ["e1", "e2"]))).toEqual({
      kind: "unchanged",
      importId: first.id,
    });
  });
});
