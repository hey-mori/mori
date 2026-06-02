import { describe, expect, it } from "vitest";
import {
  buildImportCandidatesFromAgentWorkSession,
  buildPrimaryImportCandidateFromAgentWorkSession,
  reviewOriginForAgentWorkSession,
  type AgentWorkImportKind,
  type AgentWorkSessionDetail,
} from "./workSessions";
import type { ClaudeMessage } from "../claude/types";

const buildInput = {
  projectId: "proj-1",
  sessionId: "sess-1",
  capturedAt: "2026-05-14T03:00:00.000Z",
};

function messages(): ClaudeMessage[] {
  return [
    { id: "m1", role: "human", content: "Add a retry to the fetch helper", createdAt: "2026-05-14T03:00:00.000Z", subkind: "" },
    { id: "m2", role: "assistant", content: "Done, wrapped it in exponential backoff", createdAt: "2026-05-14T03:00:05.000Z", subkind: "" },
  ];
}

function detail(
  importKind: AgentWorkImportKind,
  overrides: Partial<AgentWorkSessionDetail> = {},
): AgentWorkSessionDetail {
  return {
    agentId: importKind === "codex-session" ? "codex" : importKind === "antigravity-session" ? "antigravity" : "opencode",
    agentName: importKind === "codex-session" ? "Codex" : importKind === "antigravity-session" ? "Antigravity" : "OpenCode",
    importKind,
    id: "id-1",
    sessionId: "sess-1",
    projectPath: "C:/dev/demo",
    projectName: "demo",
    filePath: "C:/dev/demo/session.jsonl",
    sourceFilePath: "C:/dev/demo/session.jsonl",
    startedAt: "2026-05-14T03:00:00.000Z",
    updatedAt: "2026-05-14T03:00:05.000Z",
    messageCount: 2,
    title: "Retry helper work",
    messages: messages(),
    ...overrides,
  };
}

describe("reviewOriginForAgentWorkSession", () => {
  it("routes connector sessions to the connector-jsonl review origin", () => {
    expect(reviewOriginForAgentWorkSession({ importKind: "connector-jsonl" })).toBe(
      "connector-jsonl",
    );
  });

  it("routes native agent sessions to the ai-transcript review origin", () => {
    for (const kind of ["claude-code", "codex-session", "antigravity-session"] as const) {
      expect(reviewOriginForAgentWorkSession({ importKind: kind })).toBe("ai-transcript");
    }
  });
});

describe("buildImportCandidatesFromAgentWorkSession", () => {
  it("maps a Codex session to a codexTranscript candidate with the agent label in the transcript", () => {
    const [candidate] = buildImportCandidatesFromAgentWorkSession(
      detail("codex-session"),
      buildInput,
    );
    expect(candidate.source.kind).toBe("codexTranscript");
    expect(candidate.source.title).toBe("Retry helper work");
  });

  it("maps an Antigravity session to a generic aiConversation candidate", () => {
    const [candidate] = buildImportCandidatesFromAgentWorkSession(
      detail("antigravity-session"),
      buildInput,
    );
    // Antigravity has no dedicated transcript integration, so it normalizes
    // through the platform-neutral "other" path.
    expect(candidate.source.kind).toBe("aiConversation");
  });

  it("throws when a Claude session is missing its parsed detail", () => {
    expect(() =>
      buildImportCandidatesFromAgentWorkSession(detail("claude-code"), buildInput),
    ).toThrow(/Claude session detail is missing/);
  });

  it("throws when a connector session carries no importable events", () => {
    expect(() =>
      buildImportCandidatesFromAgentWorkSession(
        detail("connector-jsonl", { connectorEvents: [] }),
        buildInput,
      ),
    ).toThrow(/no importable events/);
  });
});

describe("buildPrimaryImportCandidateFromAgentWorkSession", () => {
  it("returns the first candidate for a native session", () => {
    const candidate = buildPrimaryImportCandidateFromAgentWorkSession(
      detail("codex-session"),
      buildInput,
    );
    expect(candidate.source.kind).toBe("codexTranscript");
  });
});
