import { describe, expect, it } from "vitest";
import type { SourceRef, TimelineEvent } from "../../domain/types";
import {
  buildEventActivityDescriptor,
  deriveActivityKind,
  deriveSourceFamily,
  getEventEvidenceRefs,
  getEventImportance,
  getTimelineLaneForEvent,
  groupEventsByActivityLane,
} from "./activityModel";

function event(overrides: Partial<TimelineEvent> = {}): TimelineEvent {
  return {
    id: "evt-1",
    sessionId: "s1",
    projectId: "p1",
    start: "2026-05-22T09:00:00Z",
    type: "aiConversation",
    title: "Investigate issue",
    summary: "Assistant reply",
    sourceRefs: [],
    linkedIssueIds: [],
    linkedDecisionIds: [],
    relationshipIds: [],
    trustLevel: "observed",
    confidence: 0.9,
    createdBy: "import",
    userModified: false,
    ...overrides,
  };
}

function source(overrides: Partial<SourceRef> = {}): SourceRef {
  return {
    id: "src-1",
    sessionId: "s1",
    kind: "claudeTranscript",
    title: "Claude transcript",
    detail: "",
    trustLevel: "observed",
    redactionStatus: "notNeeded",
    rawRetention: "summaryOnly",
    capturedAt: "2026-05-22T09:00:00Z",
    relatedEventIds: [],
    ...overrides,
  };
}

describe("deriveSourceFamily", () => {
  it("classifies broad source families without requiring schema changes", () => {
    expect(deriveSourceFamily("claudeTranscript")).toBe("ai");
    expect(deriveSourceFamily("gitDiff")).toBe("git");
    expect(deriveSourceFamily("figma")).toBe("design");
    expect(deriveSourceFamily("linear")).toBe("tracker");
    expect(deriveSourceFamily("buildLog")).toBe("build");
    expect(deriveSourceFamily("deployLog")).toBe("deploy");
    expect(deriveSourceFamily("futureThing")).toBe("unknown");
  });
});

describe("deriveActivityKind", () => {
  it("keeps AI conversation as one activity kind when source data says AI", () => {
    const ev = event({ sourceRefs: ["src-ai"] });
    const sources = [source({ id: "src-ai", kind: "claudeTranscript" })];
    expect(deriveActivityKind({ event: ev, sources })).toBe("conversation");
    expect(getTimelineLaneForEvent({ event: ev, sources })).toBe("conversation");
  });

  it("turns git and design sources into first-class activity lanes", () => {
    const git = event({ id: "git", type: "fileCode", sourceRefs: ["src-git"] });
    const design = event({ id: "figma", type: "artifact", sourceRefs: ["src-figma"] });
    expect(
      deriveActivityKind({
        event: git,
        sources: [source({ id: "src-git", kind: "gitDiff" })],
      }),
    ).toBe("diff");
    expect(
      getTimelineLaneForEvent({
        event: design,
        sources: [source({ id: "src-figma", kind: "figma" })],
      }),
    ).toBe("design");
  });

  it("classifies terminal and build/test activity from source and text", () => {
    const command = event({ type: "aiConversation", actor: "tool", sourceRefs: ["src-term"] });
    expect(
      getTimelineLaneForEvent({
        event: command,
        sources: [source({ id: "src-term", kind: "terminal" })],
      }),
    ).toBe("command");

    const testRun = event({ title: "npm test", summary: "vitest passed", sourceRefs: ["src-build"] });
    expect(
      deriveActivityKind({
        event: testRun,
        sources: [source({ id: "src-build", kind: "buildLog" })],
      }),
    ).toBe("testRun");
  });
});

describe("activity descriptors", () => {
  it("derives evidence chips and a compact metadata line", () => {
    const ev = event({
      sourceRefs: ["src-ai", "src-git"],
      linkedDecisionIds: ["d1"],
    });
    const descriptor = buildEventActivityDescriptor({
      event: ev,
      sources: [
        source({ id: "src-ai", kind: "claudeTranscript", title: "Claude" }),
        source({ id: "src-git", kind: "gitDiff", title: "C:/dev/mori" }),
      ],
      density: "compact",
    });

    expect(descriptor.sourceFamilies).toEqual(["ai", "git"]);
    expect(descriptor.evidenceChips.map((chip) => chip.shortLabel)).toEqual(["Claude", "mori"]);
    expect(descriptor.metadataLine).toContain("evidence 2");
    expect(getEventImportance({ event: ev, sources: [] })).toBe("high");
  });

  it("falls back to connector identity when no SourceRef exists", () => {
    const chips = getEventEvidenceRefs({
      event: event({ connectorEventId: "codex-cli::run-1::evt-1" }),
      sources: [],
    });
    expect(chips).toHaveLength(1);
    expect(chips[0]!.shortLabel).toBe("codex-cli");
  });

  it("groups events by normalized activity lane", () => {
    const events = [
      event({ id: "talk", type: "aiConversation" }),
      event({ id: "file", type: "fileCode" }),
      event({ id: "decision", type: "decision" }),
    ];
    const groups = groupEventsByActivityLane({ events, sources: [] });
    expect(groups.conversation.map((ev) => ev.id)).toEqual(["talk"]);
    expect(groups.files.map((ev) => ev.id)).toEqual(["file"]);
    expect(groups.review.map((ev) => ev.id)).toEqual(["decision"]);
  });
});
