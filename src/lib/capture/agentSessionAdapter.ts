/**
 * Agent-session adapter · converts an agent work session INTO ledger record
 * proposals (architecture doc §9 Adapt, §18 no-leak). The session pipeline
 * becomes one producer of activity, not the center of the product.
 *
 * Deliberately takes a minimal structural input, never the legacy `Session`
 * domain type, so the kernel and capture layers stay free of the
 * session-centric model: a session becomes an `agent-session` record plus,
 * later, the activity / decision records for what happened during it.
 */
import type { RecordProposal } from "./captureTypes";

export type AgentSessionInput = {
  sessionId: string;
  title: string;
  /** True when `title` is the user's first request (see `Session`). */
  titleFromRequest?: boolean;
  /** The agent that ran the session (claude / codex / …), or a fallback. */
  agentId: string;
  /** The project the session belongs to (its context key + display name). */
  projectKey?: string;
  projectName?: string;
  /** Session window; real observed times from the source. */
  occurredStart?: string;
  occurredEnd?: string;
  /** One-line description of the session's work. */
  summary?: string;
  /** Number of events / steps in the session, when known. */
  stepCount?: number;
  /** Decisions surfaced in the session, promoted to their own records. */
  decisions?: Array<{ title: string; rationale?: string }>;
};

/**
 * Builds the record proposals for a session: the `agent-session` record
 * itself, then a `decision` record per surfaced decision. Times are
 * `source-observed` (the session timestamps are real, but a timestamp is not
 * proof the user worked at that exact moment).
 */
export function agentSessionToProposals(input: AgentSessionInput): RecordProposal[] {
  const timeBasis: RecordProposal["timeBasis"] = input.occurredStart ? "source-observed" : "unknown";
  const properties: RecordProposal["properties"] = { agentId: input.agentId };
  if (typeof input.stepCount === "number") properties.stepCount = input.stepCount;
  if (input.titleFromRequest) properties.titleFromRequest = true;

  const proposals: RecordProposal[] = [
    {
      schemaId: "agent-session",
      title: input.title,
      body: input.summary ?? input.title,
      properties,
      occurredStart: input.occurredStart,
      timeBasis,
      confidence: 0.9,
      rationale: "에이전트 세션을 활동으로 기록합니다",
      entityMentions: [],
    },
  ];

  for (const decision of input.decisions ?? []) {
    if (decision.title.trim().length === 0) continue;
    proposals.push({
      schemaId: "decision",
      title: decision.title,
      body: decision.rationale ?? decision.title,
      properties: decision.rationale ? { rationale: decision.rationale } : {},
      occurredStart: input.occurredStart,
      timeBasis,
      // A decision extracted from a session is a proposal, not a certainty, so
      // it lands provisional / confirm rather than auto (confidence < auto).
      confidence: 0.6,
      rationale: "세션에서 내린 결정을 기록합니다",
      entityMentions: [],
    });
  }

  return proposals;
}
