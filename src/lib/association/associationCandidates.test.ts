import { describe, expect, it } from "vitest";
import type { AgentWorkSessionMeta } from "../agents/workSessions";
import type { ConnectorEvent } from "../connectors/types";
import {
  agentWorkSessionToSpine,
  connectorEventsToCandidates,
} from "./associationCandidates";
import { buildEvidenceAssociationProposals } from "./evidenceAssociation";

function connectorEvent(overrides: Partial<ConnectorEvent>): ConnectorEvent {
  return {
    id: "evt",
    connectorId: "git",
    kind: "git_diff_captured",
    occurredAt: "2026-05-29T09:30:00.000Z",
    summary: "diff",
    privacy: { captureMethod: "local_hook", rawDataPolicy: "summary_only" },
    provenance: { toolName: "test" },
    ...overrides,
  };
}

function agentMeta(overrides: Partial<AgentWorkSessionMeta>): AgentWorkSessionMeta {
  return {
    agentId: "claude",
    agentName: "Claude",
    importKind: "claude-code",
    id: "agent-sess-1",
    sessionId: "claude-sess-abc",
    projectPath: "C:/dev/mori",
    projectName: "mori",
    filePath: "/x.jsonl",
    sourceFilePath: "/x.jsonl",
    startedAt: "2026-05-29T09:00:00.000Z",
    updatedAt: "2026-05-29T10:00:00.000Z",
    messageCount: 12,
    title: "work",
    connectorId: "claudeCodeHook",
    ...overrides,
  };
}

describe("agentWorkSessionToSpine", () => {
  it("maps the conversation's project, window, and connector identity", () => {
    const spine = agentWorkSessionToSpine(agentMeta({}));
    expect(spine).toEqual({
      id: "agent-sess-1",
      projectPath: "C:/dev/mori",
      windowStart: "2026-05-29T09:00:00.000Z",
      windowEnd: "2026-05-29T10:00:00.000Z",
      connectorId: "claudeCodeHook",
      externalSessionId: "claude-sess-abc",
    });
  });

  it("drops an empty project path and session id to undefined", () => {
    const spine = agentWorkSessionToSpine(
      agentMeta({ projectPath: "", sessionId: "", connectorId: undefined }),
    );
    expect(spine.projectPath).toBeUndefined();
    expect(spine.externalSessionId).toBeUndefined();
    expect(spine.connectorId).toBeUndefined();
  });
});

describe("connectorEventsToCandidates", () => {
  it("groups events into one candidate per connector + session", () => {
    const candidates = connectorEventsToCandidates([
      connectorEvent({ id: "g1", connectorId: "git", sessionId: "s1" }),
      connectorEvent({ id: "g2", connectorId: "git", sessionId: "s1" }),
      connectorEvent({ id: "t1", connectorId: "terminal", sessionId: "s2" }),
    ]);
    expect(candidates.map((c) => c.id)).toEqual(["git::s1", "terminal::s2"]);
  });

  it("computes the time span from the bucket's events", () => {
    const [candidate] = connectorEventsToCandidates([
      connectorEvent({ id: "a", sessionId: "s1", occurredAt: "2026-05-29T09:10:00.000Z" }),
      connectorEvent({ id: "b", sessionId: "s1", occurredAt: "2026-05-29T09:50:00.000Z" }),
      connectorEvent({ id: "c", sessionId: "s1", occurredAt: "2026-05-29T09:30:00.000Z" }),
    ]);
    expect(candidate.spanStart).toBe("2026-05-29T09:10:00.000Z");
    expect(candidate.spanEnd).toBe("2026-05-29T09:50:00.000Z");
  });

  it("takes the project path from the event, then the git repo path", () => {
    const [fromEvent] = connectorEventsToCandidates([
      connectorEvent({ sessionId: "s1", projectPath: "C:/dev/mori" }),
    ]);
    expect(fromEvent.projectPath).toBe("C:/dev/mori");

    const [fromGit] = connectorEventsToCandidates([
      connectorEvent({
        sessionId: "s2",
        projectPath: undefined,
        git: { repoPath: "C:/dev/other" },
      }),
    ]);
    expect(fromGit.projectPath).toBe("C:/dev/other");
  });

  it("maps known connectors to a coarse source kind and defaults the rest", () => {
    const [git] = connectorEventsToCandidates([
      connectorEvent({ connectorId: "gitCommand", sessionId: "s1" }),
    ]);
    expect(git.kind).toBe("gitDiff");
    const [hook] = connectorEventsToCandidates([
      connectorEvent({ connectorId: "claudeCodeHook", sessionId: "s2" }),
    ]);
    expect(hook.kind).toBe("connectorJsonl");
  });

  it("carries the connector identity through for the strong scoring signal", () => {
    const [candidate] = connectorEventsToCandidates([
      connectorEvent({ connectorId: "git", sessionId: "s1" }),
    ]);
    expect(candidate.connectorId).toBe("git");
    expect(candidate.externalSessionId).toBe("s1");
  });
});

describe("adapters feed the P1 scorer", () => {
  it("proposes a same-project, in-window git connector as high confidence", () => {
    const spine = agentWorkSessionToSpine(agentMeta({}));
    const candidates = connectorEventsToCandidates([
      connectorEvent({
        connectorId: "git",
        sessionId: "git-run-1",
        projectPath: "C:/dev/mori",
        occurredAt: "2026-05-29T09:30:00.000Z",
      }),
    ]);
    const [proposal] = buildEvidenceAssociationProposals(spine, candidates);
    expect(proposal.candidateId).toBe("git::git-run-1");
    expect(proposal.confidence).toBe("high");
    expect(proposal.signals).toEqual(["projectPath", "timeWindow"]);
  });
});
