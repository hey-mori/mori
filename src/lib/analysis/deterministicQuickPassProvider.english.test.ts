import { describe, expect, it } from "vitest";
import type { EventActor, Project, Session, TimelineEvent } from "../../domain/types";
import { extractFromInput } from "./deterministicQuickPassProvider";

const project: Project = {
  id: "p1",
  name: "P",
  description: "",
  createdAt: "2026-05-12T13:00:00Z",
  updatedAt: "2026-05-12T13:00:00Z",
};

const session: Session = {
  id: "s1",
  projectId: "p1",
  title: "S",
  startedAt: "2026-05-12T13:00:00Z",
  endedAt: "2026-05-12T14:00:00Z",
  recordingMode: "summary",
  llmProvider: "ollama",
  llmModel: "x",
  storageLocation: "",
  selectedSourceIds: [],
  status: "recording",
};

function ev(id: string, title: string, summary: string, actor?: EventActor): TimelineEvent {
  return {
    id,
    sessionId: "s1",
    projectId: "p1",
    start: "2026-05-12T13:30:00Z",
    type: "aiConversation",
    title,
    summary,
    sourceRefs: [],
    linkedIssueIds: [],
    linkedDecisionIds: [],
    relationshipIds: [],
    trustLevel: "observed",
    confidence: 0.9,
    createdBy: "import",
    userModified: false,
    ...(actor ? { actor } : {}),
  };
}

function run(events: TimelineEvent[]) {
  return extractFromInput({ project, session, sources: [], events, now: "2026-05-12T14:00:00Z" });
}

describe("deterministic Quick Pass on English transcripts", () => {
  it("extracts a decision stated with the noun", () => {
    const result = run([
      ev("e1", "Assistant", "Done. Decision: thumbnails at 320px with lazy loading, and one cart total per render.", "assistant"),
    ]);
    expect(result.decisions).toHaveLength(1);
  });

  it("extracts an open question as an issue", () => {
    const result = run([
      ev("e1", "Assistant", "Open question: should the thumbnail size depend on screen density?", "assistant"),
    ]);
    expect(result.issues).toHaveLength(1);
  });

  it("still finds nothing in a turn without either marker", () => {
    const result = run([ev("e1", "User", "The checkout page in our demo shop is slow.", "user")]);
    expect(result.decisions).toHaveLength(0);
    expect(result.issues).toHaveLength(0);
  });
});
