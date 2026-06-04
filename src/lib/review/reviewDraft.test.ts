import { describe, expect, it } from "vitest";
import type { NormalizedImportCandidate } from "../import";
import type { SourceRef, TimelineEvent } from "../../domain/types";
import {
  buildAcceptedCandidate,
  createImportReviewDraft,
  editReviewEvent,
  getReviewCounts,
  isReviewApplyable,
  setAllItemsStatus,
  setReviewItemStatus,
} from "./reviewDraft";

function makeEvent(id: string, title = "Event"): TimelineEvent {
  return {
    id,
    sessionId: "sess-1",
    projectId: "proj-1",
    start: "2026-05-14T10:00:00Z",
    type: "aiConversation",
    title,
    summary: `summary-${id}`,
    sourceRefs: ["src-1"],
    linkedIssueIds: [],
    linkedDecisionIds: [],
    relationshipIds: [],
    trustLevel: "verified",
    confidence: 0.9,
    createdBy: "import",
    userModified: false,
  };
}

function makeSource(eventIds: string[]): SourceRef {
  return {
    id: "src-1",
    sessionId: "sess-1",
    kind: "claudeTranscript",
    title: "Claude transcript",
    detail: "Claude transcript: 3 turns",
    trustLevel: "verified",
    redactionStatus: "notNeeded",
    rawRetention: "summaryOnly",
    capturedAt: "2026-05-14T10:00:00Z",
    relatedEventIds: eventIds,
  };
}

function makeCandidate(eventCount: number): NormalizedImportCandidate {
  const events = Array.from({ length: eventCount }, (_, i) => makeEvent(`evt-${i + 1}`));
  return {
    source: makeSource(events.map((event) => event.id)),
    events,
  };
}

describe("createImportReviewDraft", () => {
  it("marks events pending for a connector import that needs inspection", () => {
    const draft = createImportReviewDraft(makeCandidate(2), "connector-jsonl");
    expect(draft.events).toHaveLength(2);
    expect(draft.events.every((item) => item.status === "pending")).toBe(true);
    expect(draft.origin).toBe("connector-jsonl");
    expect(draft.source.id).toBe("src-1");
  });

  it("auto-accepts events for an explicitly-connected AI conversation", () => {
    const draft = createImportReviewDraft(makeCandidate(3), "ai-transcript");
    expect(draft.events.every((item) => item.status === "accepted")).toBe(true);
  });

  it("preserves the original candidate", () => {
    const candidate = makeCandidate(1);
    const draft = createImportReviewDraft(candidate, "git-diff");
    expect(draft.candidate).toBe(candidate);
  });

  it("starts with empty issue / decision / next-action arrays", () => {
    const draft = createImportReviewDraft(makeCandidate(1), "ai-transcript");
    expect(draft.issues).toEqual([]);
    expect(draft.decisions).toEqual([]);
    expect(draft.nextActions).toEqual([]);
  });
});

describe("setReviewItemStatus", () => {
  it("flips a single event without touching the others", () => {
    const draft = createImportReviewDraft(makeCandidate(3), "connector-jsonl");
    const next = setReviewItemStatus(draft, "event", "evt-2", "accepted");
    expect(next.events[0].status).toBe("pending");
    expect(next.events[1].status).toBe("accepted");
    expect(next.events[2].status).toBe("pending");
  });

  it("returns a new draft (immutable)", () => {
    const draft = createImportReviewDraft(makeCandidate(2), "ai-transcript");
    const next = setReviewItemStatus(draft, "event", "evt-1", "discarded");
    expect(next).not.toBe(draft);
    expect(next.events[0]).not.toBe(draft.events[0]);
  });
});

describe("setAllItemsStatus", () => {
  it("applies the same status across every item kind", () => {
    const draft = createImportReviewDraft(makeCandidate(2), "ai-transcript");
    const next = setAllItemsStatus(draft, "accepted");
    expect(next.events.every((item) => item.status === "accepted")).toBe(true);
  });
});

describe("editReviewEvent", () => {
  it("merges edits without changing status", () => {
    const draft = createImportReviewDraft(makeCandidate(1), "connector-jsonl");
    const next = editReviewEvent(draft, "evt-1", { title: "  edited  " });
    expect(next.events[0].edits?.title).toBe("  edited  ");
    expect(next.events[0].status).toBe("pending");
  });

  it("preserves earlier edits when merging new ones", () => {
    const draft = createImportReviewDraft(makeCandidate(1), "ai-transcript");
    const once = editReviewEvent(draft, "evt-1", { title: "edited title" });
    const twice = editReviewEvent(once, "evt-1", { summary: "edited summary" });
    expect(twice.events[0].edits?.title).toBe("edited title");
    expect(twice.events[0].edits?.summary).toBe("edited summary");
  });
});

describe("getReviewCounts", () => {
  it("counts pending, accepted, discarded, and total across every kind", () => {
    let draft = createImportReviewDraft(makeCandidate(3), "connector-jsonl");
    draft = setReviewItemStatus(draft, "event", "evt-1", "accepted");
    draft = setReviewItemStatus(draft, "event", "evt-2", "discarded");
    const counts = getReviewCounts(draft);
    expect(counts).toEqual({ pending: 1, accepted: 1, discarded: 1, total: 3 });
  });
});

describe("buildAcceptedCandidate", () => {
  it("returns null when nothing has been accepted yet", () => {
    const draft = createImportReviewDraft(makeCandidate(2), "connector-jsonl");
    expect(buildAcceptedCandidate(draft)).toBeNull();
  });

  it("filters to only accepted events and keeps the source relatedEventIds in sync", () => {
    let draft = createImportReviewDraft(makeCandidate(3), "connector-jsonl");
    draft = setReviewItemStatus(draft, "event", "evt-1", "accepted");
    draft = setReviewItemStatus(draft, "event", "evt-3", "accepted");
    const candidate = buildAcceptedCandidate(draft);
    expect(candidate).not.toBeNull();
    expect(candidate?.events.map((event) => event.id)).toEqual(["evt-1", "evt-3"]);
    expect(candidate?.source.relatedEventIds).toEqual(["evt-1", "evt-3"]);
  });

  it("applies title / summary / type edits and flips userModified", () => {
    let draft = createImportReviewDraft(makeCandidate(1), "ai-transcript");
    draft = setReviewItemStatus(draft, "event", "evt-1", "accepted");
    draft = editReviewEvent(draft, "evt-1", {
      title: "user title",
      summary: "user summary",
      type: "decision",
    });
    const candidate = buildAcceptedCandidate(draft);
    expect(candidate?.events[0].title).toBe("user title");
    expect(candidate?.events[0].summary).toBe("user summary");
    expect(candidate?.events[0].type).toBe("decision");
    expect(candidate?.events[0].userModified).toBe(true);
  });

  it("does not flip userModified when no edits are applied", () => {
    let draft = createImportReviewDraft(makeCandidate(1), "ai-transcript");
    draft = setReviewItemStatus(draft, "event", "evt-1", "accepted");
    const candidate = buildAcceptedCandidate(draft);
    expect(candidate?.events[0].userModified).toBe(false);
  });

  it("trims whitespace-only edits and falls back to the original event field", () => {
    let draft = createImportReviewDraft(makeCandidate(1), "ai-transcript");
    draft = setReviewItemStatus(draft, "event", "evt-1", "accepted");
    draft = editReviewEvent(draft, "evt-1", { title: "   ", summary: "" });
    const candidate = buildAcceptedCandidate(draft);
    expect(candidate?.events[0].title).toBe("Event");
    expect(candidate?.events[0].summary).toBe("summary-evt-1");
    expect(candidate?.events[0].userModified).toBe(false);
  });
});

describe("isReviewApplyable", () => {
  it("is false until at least one event is accepted", () => {
    const draft = createImportReviewDraft(makeCandidate(2), "connector-jsonl");
    expect(isReviewApplyable(draft)).toBe(false);
    const next = setReviewItemStatus(draft, "event", "evt-1", "accepted");
    expect(isReviewApplyable(next)).toBe(true);
  });

  it("is false when every accepted event is later discarded", () => {
    let draft = createImportReviewDraft(makeCandidate(2), "connector-jsonl");
    draft = setReviewItemStatus(draft, "event", "evt-1", "accepted");
    draft = setReviewItemStatus(draft, "event", "evt-1", "discarded");
    expect(isReviewApplyable(draft)).toBe(false);
  });
});
