import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useSqliteStore } from "./sqliteStore";

function resetStore() {
  useSqliteStore.setState({
    available: false,
    status: null,
    sessions: [],
    kind: "unavailable",
    error: null,
    lastPersist: null,
  });
}

describe("useSqliteStore (web fallback)", () => {
  beforeEach(() => {
    resetStore();
  });

  afterEach(() => {
    resetStore();
  });

  it("reports unavailable in browser mode without throwing", async () => {
    await useSqliteStore.getState().refresh();
    const state = useSqliteStore.getState();
    expect(state.available).toBe(false);
    expect(state.kind).toBe("unavailable");
  });

  it("returns null and reports unavailable when persist is attempted in browser mode", async () => {
    const session = {
      project: { id: "p1", name: "P", description: "", createdAt: "x", updatedAt: "x" },
      session: {
        id: "s1",
        projectId: "p1",
        title: "S",
        startedAt: "x",
        endedAt: "x",
        recordingMode: "summary" as const,
        llmProvider: "ollama" as const,
        llmModel: "m",
        storageLocation: "",
        selectedSourceIds: [],
        status: "recording" as const,
      },
      sources: [],
      events: [],
      issues: [],
      decisions: [],
      relationships: [],
      artifacts: [],
      nextActions: [],
      summary: {
        id: "sum",
        sessionId: "s1",
        sessionSummary: "",
        resumePrompt: "",
        reportMarkdown: "",
        nextActionIds: [],
        generatedAt: "x",
      },
    };
    const result = await useSqliteStore.getState().persist(session);
    expect(result).toBeNull();
    const state = useSqliteStore.getState();
    expect(state.kind).toBe("unavailable");
    expect(state.error).toContain("Tauri");
  });
});
