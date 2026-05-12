import { describe, expect, it } from "vitest";
import { normalizeAiConversationText, normalizeManualNote, normalizeUrlSource } from "../import";
import type { StoredSessionDraft, StoredSessionImport } from "../storage/storageTypes";
import { composeSessionView } from "./composeSessionView";

const baseDraft: StoredSessionDraft = {
  project: {
    id: "proj-test",
    name: "Test Project",
    description: "Local-first Mori work memory project.",
    createdAt: "2026-05-12T13:00:00+09:00",
    updatedAt: "2026-05-12T13:00:00+09:00",
  },
  session: {
    id: "sess-test",
    projectId: "proj-test",
    title: "Test Session",
    startedAt: "2026-05-12T13:00:00+09:00",
    endedAt: "2026-05-12T13:00:00+09:00",
    recordingMode: "summary",
    llmProvider: "ollama",
    llmModel: "llama3.1:8b",
    storageLocation: "~/Mori/Records",
    selectedSourceIds: [],
    status: "recording",
  },
  savedAt: "2026-05-12T13:05:00+09:00",
  adapter: "browser-local-storage",
};

function importToStored(candidate: ReturnType<typeof normalizeManualNote>, savedAt: string): StoredSessionImport {
  return {
    id: candidate.source.id,
    sessionId: candidate.source.sessionId,
    source: candidate.source,
    events: candidate.events,
    savedAt,
    adapter: "browser-local-storage",
  };
}

describe("composeSessionView", () => {
  it("returns an empty session shell when no imports are present", () => {
    const view = composeSessionView({ draft: baseDraft, imports: [] });
    expect(view.isDemo).toBe(false);
    expect(view.sources).toHaveLength(0);
    expect(view.events).toHaveLength(0);
    expect(view.issues).toHaveLength(0);
    expect(view.session.startedAt).toBe(baseDraft.session.startedAt);
    expect(view.summary.sessionSummary).toContain("No imports yet");
  });

  it("composes imports into sources and events and updates the session window", () => {
    const note = normalizeManualNote({
      projectId: baseDraft.project.id,
      sessionId: baseDraft.session.id,
      title: "Kickoff note",
      note: "Mori is work-flow reconstruction, not searchable memory.",
      capturedAt: "2026-05-12T13:10:00+09:00",
    });
    const url = normalizeUrlSource({
      projectId: baseDraft.project.id,
      sessionId: baseDraft.session.id,
      title: "screenpipe",
      url: "https://github.com/mediar-ai/screenpipe",
      capturedAt: "2026-05-12T14:00:00+09:00",
    });
    const ai = normalizeAiConversationText({
      projectId: baseDraft.project.id,
      sessionId: baseDraft.session.id,
      provider: "Claude",
      text: "User: What is Mori?\n\nAssistant: Mori remembers how the work happened.",
      capturedAt: "2026-05-12T15:30:00+09:00",
    });

    const view = composeSessionView({
      draft: baseDraft,
      imports: [
        importToStored(note, "2026-05-12T13:10:00+09:00"),
        importToStored(url, "2026-05-12T14:00:00+09:00"),
        importToStored(ai, "2026-05-12T15:30:00+09:00"),
      ],
    });

    expect(view.sources).toHaveLength(3);
    expect(view.events).toHaveLength(3);
    expect(view.session.startedAt).toBe("2026-05-12T13:10:00+09:00");
    expect(view.session.endedAt).toBe("2026-05-12T15:30:00+09:00");
    expect(view.summary.sessionSummary).toContain("3 imported events");
    expect(view.events.map((event) => event.type)).toEqual(
      expect.arrayContaining(["documentNote", "webResearch", "aiConversation"]),
    );
  });
});
