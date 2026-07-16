/**
 * Session → kernel dual-write (S2). Every auto-registered agent session also
 * becomes a thin `agent-session` kernel record, so the cross-lenses (검색 ·
 * 캘린더 · 프로젝트) span AI work without the manual per-session button. This is
 * the §12 dual-run step of the architecture's Adapt verdict.
 *
 * The record is deliberately thin (spec §2): identity, time, agent, and project
 * binding, nothing more. Live status, timeline events, and analysis stay in the
 * 세션 workspace model. Status is `provisional` — visible in the read surfaces,
 * but excluded from external outputs (reports / .mori) until the user confirms.
 *
 * See `docs/design/session-kernel-dual-write-spec.md`.
 */
import type { AgentWorkSessionMeta } from "./workSessions";
import { autoImportedSessionId } from "./autoImportSessions";
import { createRecord, type CreateRecordInput } from "../record-kernel/recordFactory";
import type { KernelContext } from "../record-kernel/kernelTypes";
import type { KernelRepository } from "../record-kernel/kernelRepository";
import type { SchemaRegistry } from "../record-kernel/schemaRegistry";

/**
 * Build the `CreateRecordInput` for the kernel record that mirrors a discovered
 * session. The record id **is** the session's `autoImportedSessionId`, so a
 * re-discovery upserts the same record and the manual capture path can converge
 * on it later instead of duplicating.
 *
 * Context binding is best-effort and conservative: bind to an existing context
 * whose name matches the session's project name, never auto-create one (a wrong
 * project guess is exactly the mutation the apply matrix protects). An unmatched
 * session stays unbound and still appears in 캘린더 / 검색.
 */
export function buildAgentSessionRecordInput(
  meta: AgentWorkSessionMeta,
  contexts: readonly KernelContext[],
): CreateRecordInput {
  const occurredStart = meta.startedAt || undefined;
  const updatedAt = meta.updatedAt || undefined;
  const occurredEnd =
    occurredStart && updatedAt && updatedAt >= occurredStart ? updatedAt : undefined;

  const projectName = (meta.projectName || "").trim();
  const matchedContext = projectName
    ? contexts.find((context) => !context.archived && context.name.trim() === projectName)
    : undefined;

  const agentLabel = (meta.agentName || meta.agentId || "에이전트").trim();
  const countLine = meta.messageCount > 0 ? ` · 메시지 ${meta.messageCount}개` : "";

  const properties: CreateRecordInput["properties"] = { agentId: meta.agentId };
  if (meta.messageCount > 0) properties.stepCount = meta.messageCount;

  return {
    id: autoImportedSessionId(meta),
    schemaId: "agent-session",
    title: meta.title.trim() || "제목 없음",
    // One honest line: the agent + a count, never a synthetic summary.
    body: `${agentLabel} 세션${countLine}`,
    occurredStart,
    occurredEnd,
    // The session timestamps are real, but a timestamp is not proof the user
    // worked at that exact moment — observed, not user-provided.
    timeBasis: occurredStart ? "source-observed" : "unknown",
    status: "provisional",
    origin: "automation",
    contextIds: matchedContext ? [matchedContext.id] : [],
    properties,
  };
}

export type AgentSessionDualWriteResult = { written: number; failed: number };

/**
 * Upsert an `agent-session` kernel record for each discovered session. Best
 * effort per record: one failure never blocks the rest, and a context-load
 * failure just leaves the batch unbound. The caller has already persisted the
 * legacy drafts, so a kernel failure here degrades to "legacy only", never a
 * lost registration (dual-run doctrine).
 */
export async function upsertAgentSessionRecords(
  repo: Pick<KernelRepository, "listContexts" | "saveRecord">,
  registry: SchemaRegistry,
  metas: readonly AgentWorkSessionMeta[],
): Promise<AgentSessionDualWriteResult> {
  if (metas.length === 0) return { written: 0, failed: 0 };

  let contexts: KernelContext[] = [];
  try {
    contexts = (await repo.listContexts()).data;
  } catch {
    contexts = [];
  }

  let written = 0;
  let failed = 0;
  for (const meta of metas) {
    try {
      const { record, revision } = createRecord(
        buildAgentSessionRecordInput(meta, contexts),
        registry,
      );
      await repo.saveRecord(record, revision);
      written += 1;
    } catch {
      failed += 1;
    }
  }
  return { written, failed };
}
