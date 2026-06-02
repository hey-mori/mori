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
    agentId:
      importKind === "codex-session"
        ? "codex"
        : importKind === "antigravity-session"
          ? "antigravity"
          : importKind === "continue-session"
            ? "continue"
            : importKind === "cline-session"
              ? "cline"
              : "opencode",
    agentName:
      importKind === "codex-session"
        ? "Codex"
        : importKind === "antigravity-session"
          ? "Antigravity"
          : importKind === "continue-session"
            ? "Continue"
            : importKind === "cline-session"
              ? "Cline"
              : "OpenCode",
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
    for (const kind of [
      "claude-code",
      "codex-session",
      "antigravity-session",
      "opencode-session",
      "continue-session",
      "cline-session",
    ] as const) {
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

  it("maps an Antigravity session to a dedicated antigravityTranscript candidate", () => {
    const [candidate] = buildImportCandidatesFromAgentWorkSession(
      detail("antigravity-session"),
      buildInput,
    );
    // Imported Antigravity sessions carry their own source kind so the
    // Evidence Hub reads "Antigravity", not the generic "AI 대화".
    expect(candidate.source.kind).toBe("antigravityTranscript");
  });

  it("maps an OpenCode session to a dedicated opencodeTranscript candidate", () => {
    const [candidate] = buildImportCandidatesFromAgentWorkSession(
      detail("opencode-session"),
      buildInput,
    );
    expect(candidate.source.kind).toBe("opencodeTranscript");
    expect(candidate.source.title).toBe("Retry helper work");
  });

  it("maps a Continue session to a dedicated continueTranscript candidate", () => {
    const [candidate] = buildImportCandidatesFromAgentWorkSession(
      detail("continue-session"),
      buildInput,
    );
    expect(candidate.source.kind).toBe("continueTranscript");
    expect(candidate.source.title).toBe("Retry helper work");
  });

  it("maps a Cline session to a dedicated clineTranscript candidate", () => {
    const [candidate] = buildImportCandidatesFromAgentWorkSession(
      detail("cline-session"),
      buildInput,
    );
    expect(candidate.source.kind).toBe("clineTranscript");
    expect(candidate.source.title).toBe("Retry helper work");
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
