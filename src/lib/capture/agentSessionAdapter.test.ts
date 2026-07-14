import { describe, expect, it } from "vitest";
import { createSchemaRegistry } from "../record-kernel/schemaRegistry";
import { runCapturePipeline } from "./capturePipeline";
import { agentSessionToProposals, type AgentSessionInput } from "./agentSessionAdapter";

const registry = createSchemaRegistry();
const now = () => new Date("2026-07-14T09:00:00.000Z");

const base: AgentSessionInput = {
  sessionId: "sess-1",
  title: "Auth 미들웨어 마이그레이션",
  agentId: "claude",
  occurredStart: "2026-07-14T08:00:00Z",
  occurredEnd: "2026-07-14T08:45:00Z",
  summary: "인증을 미들웨어로 옮기고 토큰 갱신 경로를 단일화했다.",
  stepCount: 12,
};

describe("agentSessionToProposals", () => {
  it("builds one agent-session proposal with observed time and agent metadata", () => {
    const [proposal, ...rest] = agentSessionToProposals(base);
    expect(rest).toHaveLength(0);
    expect(proposal.schemaId).toBe("agent-session");
    expect(proposal.title).toBe("Auth 미들웨어 마이그레이션");
    expect(proposal.properties.agentId).toBe("claude");
    expect(proposal.properties.stepCount).toBe(12);
    expect(proposal.timeBasis).toBe("source-observed");
    expect(proposal.occurredStart).toBe("2026-07-14T08:00:00Z");
  });

  it("promotes each decision to its own lower-confidence proposal", () => {
    const proposals = agentSessionToProposals({
      ...base,
      decisions: [
        { title: "미들웨어로 인증 일원화", rationale: "중복 제거" },
        { title: "토큰 검증 실패는 401로 통일" },
      ],
    });
    expect(proposals).toHaveLength(3);
    expect(proposals[1].schemaId).toBe("decision");
    expect(proposals[1].properties.rationale).toBe("중복 제거");
    expect(proposals[1].confidence).toBeLessThan(proposals[0].confidence);
  });

  it("marks time unknown when the session has no start", () => {
    const [proposal] = agentSessionToProposals({ ...base, occurredStart: undefined });
    expect(proposal.timeBasis).toBe("unknown");
    expect(proposal.occurredStart).toBeUndefined();
  });
});

describe("agent session through the capture pipeline", () => {
  it("persists an agent-session record with the session id as the source locator", () => {
    const outcome = runCapturePipeline(
      { kind: "agent-session", content: base.summary ?? base.title, locator: base.sessionId },
      registry,
      { now, propose: () => agentSessionToProposals(base) },
    );
    expect(outcome.source.kind).toBe("agent-session");
    expect(outcome.source.locator).toBe("sess-1");
    const record = outcome.records[0].created.record;
    expect(record.schemaId).toBe("agent-session");
    // confidence 0.9 + no new entity + auto → active
    expect(record.status).toBe("active");
    expect(record.occurredStart).toBe("2026-07-14T08:00:00Z");
  });
});
