/**
 * Session → kernel dual-write (S2). Every auto-registered agent session also
 * becomes a thin `agent-session` kernel record, so the cross-lenses (검색 ·
 * 캘린더 · 프로젝트) span AI work without the manual per-session button. This is
 * the §12 dual-run step of the architecture's Adapt verdict.
 *
 * The record is deliberately thin (spec §2): identity, time, agent, and project
 * binding, nothing more. Live status, timeline events, and analysis stay in the
 * 세션 workspace model. A new record is `active`: the agent's own log is a direct
 * observation of the session's identity and times, not an interpretation, so it
 * is not provisional (owner decision, 2026-10-07; `provisional` is reserved for
 * interpretations that could be wrong). Rediscovery never changes status, so a
 * record created provisional before that decision stays so until a backfill or
 * the user changes it.
 *
 * See `docs/design/session-kernel-dual-write-spec.md`.
 */
import type { AgentWorkSessionMeta } from "../trace/sources/ai/workSessions";
import { autoImportedSessionId } from "../session/autoImportSessions";
import { recordedSessionEvidence } from "./agentSessionEvidence";
import {
  applyRecordPatch,
  createRecord,
  type CreateRecordInput,
  type RecordPatch,
} from "./recordFactory";
import type {
  KernelContext,
  KernelRevision,
  MoriRecord,
  RecordPropertyValue,
} from "./kernelTypes";
import type { KernelRepository } from "./kernelRepository";
import type { SchemaRegistry } from "./schemaRegistry";

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
  // A count read from only the head of a long transcript is a lower bound, so it
  // is not written as the session's size: a wrong number is worse than none.
  const knownCount = meta.messageCountComplete !== false && meta.messageCount > 0;
  const countLine = knownCount ? ` · 메시지 ${meta.messageCount}개` : "";

  const properties: CreateRecordInput["properties"] = { agentId: meta.agentId };
  if (knownCount) properties.stepCount = meta.messageCount;
  // Source classifications and structural Git observations, never prose (see
  // `agentSessionEvidence.ts`). Absent when the reader does not report them.
  if (meta.activityClass) properties.activityClass = meta.activityClass;
  if (meta.interaction) properties.interaction = meta.interaction;
  const evidence = recordedSessionEvidence(meta.evidence, meta.sessionId);
  if (evidence) properties.sessionEvidence = evidence;

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
    status: "active",
    origin: "automation",
    contextIds: matchedContext ? [matchedContext.id] : [],
    properties,
  };
}

export type AgentSessionDualWriteResult = {
  /** New records written for sessions the kernel had not seen. */
  created: number;
  /** Existing records that took newly observed source facts. */
  updated: number;
  /** Existing records the observation would not change: nothing was written. */
  unchanged: number;
  /** Existing records left exactly as they are: discarded, archived, another
   *  schema under the same id, or user-edited with no automation baseline. */
  preserved: number;
  failed: number;
};

/** The fields discovery observes from the source, each merged as one unit. A
 *  session's time is a unit because the factory validates start, end, and basis
 *  together, and the user's date editor rewrites them together. */
export type ObservedFields = {
  title: string;
  body: string;
  time: Pick<MoriRecord, "occurredStart" | "occurredEnd" | "timeBasis">;
  contextIds: string[];
  agentId: RecordPropertyValue | undefined;
  stepCount: RecordPropertyValue | undefined;
  activityClass: RecordPropertyValue | undefined;
  interaction: RecordPropertyValue | undefined;
  sessionEvidence: RecordPropertyValue | undefined;
};

function observedFields(record: Pick<
  MoriRecord,
  "title" | "body" | "occurredStart" | "occurredEnd" | "timeBasis" | "contextIds" | "properties"
>): ObservedFields {
  return {
    title: record.title,
    body: record.body,
    time: {
      occurredStart: record.occurredStart,
      occurredEnd: record.occurredEnd,
      timeBasis: record.timeBasis,
    },
    // Revision snapshots are untyped JSON from storage; tolerate a missing list.
    contextIds: [...(record.contextIds ?? [])].sort(),
    agentId: record.properties?.agentId,
    stepCount: record.properties?.stepCount,
    activityClass: record.properties?.activityClass,
    interaction: record.properties?.interaction,
    sessionEvidence: record.properties?.sessionEvidence,
  };
}

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * What a rediscovery may change on an existing record, as a patch.
 *
 * Three-way per observed field: `written` holds, per field, the value
 * automation last wrote to it; `current` is the record now; `incoming` is the
 * fresh observation. A field whose current value still equals what automation
 * wrote is automation's, so it takes the observation; a field that differs was
 * changed by someone else (the user) and is kept. Status, schema, origin,
 * ownership, creation and capture times, and any other property are never
 * discovery's to change.
 */
/** The observed fields that live in `properties`, merged key by key. */
const PROPERTY_KEYS = ["agentId", "stepCount", "activityClass", "interaction", "sessionEvidence"] as const;

export function planAgentSessionRediscovery(
  written: ObservedFields,
  current: MoriRecord,
  incoming: CreateRecordInput,
): RecordPatch {
  const now = observedFields(current);
  const next = observedFields({
    title: incoming.title.normalize("NFC"),
    body: (incoming.body ?? "").normalize("NFC"),
    occurredStart: incoming.occurredStart,
    occurredEnd: incoming.occurredEnd,
    timeBasis: incoming.timeBasis ?? "unknown",
    contextIds: incoming.contextIds ?? [],
    properties: incoming.properties ?? {},
  });
  const takes = <K extends keyof ObservedFields>(key: K) =>
    same(now[key], written[key]) && !same(now[key], next[key]);

  const patch: RecordPatch = {};
  if (takes("title")) patch.title = next.title;
  if (takes("body")) patch.body = next.body;
  if (takes("time")) Object.assign(patch, next.time);
  if (takes("contextIds")) patch.contextIds = next.contextIds;

  const properties = { ...current.properties };
  let propertiesChanged = false;
  for (const key of PROPERTY_KEYS) {
    if (!takes(key)) continue;
    if (next[key] === undefined) delete properties[key];
    else properties[key] = next[key];
    propertiesChanged = true;
  }
  if (propertiesChanged) patch.properties = properties;
  return patch;
}

const OBSERVED_KEYS = [
  "title",
  "body",
  "time",
  "contextIds",
  "agentId",
  "stepCount",
  "activityClass",
  "interaction",
  "sessionEvidence",
] as const;

/**
 * Does a change between two observations only extend a session (its end time,
 * its message count, the body line that states the count)? Such growth is the
 * same fact getting newer, not a new decision, so consecutive growth writes can
 * share one revision. Anything else (title, project, agent, start, time basis)
 * stays its own entry.
 */
export function isGrowthOnly(before: ObservedFields, after: ObservedFields): boolean {
  return (
    same(before.title, after.title) &&
    same(before.contextIds, after.contextIds) &&
    same(before.agentId, after.agentId) &&
    before.time.occurredStart === after.time.occurredStart &&
    before.time.timeBasis === after.time.timeBasis
  );
}

/**
 * The revision to write for an automation update. When the record's newest
 * revision is itself a growth-only automation update, and this one is growth
 * only too, the new write supersedes it: same id, the original `before`, the
 * newest `after`. A live session polled every 90 seconds then costs one revision
 * per stretch of growth instead of one per poll, while the record always holds
 * the exact latest observation. A user edit, a status change, or any non-growth
 * change in between ends the stretch, so none of those is ever merged away.
 * Decided from stored revisions, so a restart neither loses nor duplicates it.
 */
export function supersedeGrowthRevision(
  revisions: readonly KernelRevision[],
  next: KernelRevision,
): KernelRevision {
  const latest = [...revisions].sort((a, b) => a.createdAt.localeCompare(b.createdAt)).at(-1);
  if (!latest || latest.actor !== "rule" || latest.operation !== "update") return next;
  if (!latest.before || !latest.after || !next.before || !next.after) return next;
  const latestGrowth = isGrowthOnly(
    observedFields(latest.before as MoriRecord),
    observedFields(latest.after as MoriRecord),
  );
  const nextGrowth = isGrowthOnly(
    observedFields(next.before as MoriRecord),
    observedFields(next.after as MoriRecord),
  );
  if (!latestGrowth || !nextGrowth) return next;
  return { ...next, id: latest.id, before: latest.before };
}

/**
 * Per observed field, the value automation last wrote to it, read from the
 * revisions a rule authored: a create sets every field, an update only the
 * fields it changed. A field an update merely carried over (because the user
 * owned it) is not a write, which is what keeps a user edit the user's on every
 * later poll. Null when no automation write is on record.
 */
export function automationWrittenFields(
  revisions: readonly KernelRevision[],
): ObservedFields | null {
  const authored = revisions
    .filter((revision) => revision.actor === "rule" && revision.after)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  if (authored.length === 0) return null;

  let written: ObservedFields | null = null;
  for (const revision of authored) {
    const after = observedFields(revision.after as MoriRecord);
    if (!written || !revision.before) {
      written = after;
      continue;
    }
    const before = observedFields(revision.before as MoriRecord);
    const merged: ObservedFields = { ...written };
    for (const key of OBSERVED_KEYS) {
      if (!same(before[key], after[key])) Object.assign(merged, { [key]: after[key] });
    }
    written = merged;
  }
  return written;
}

type DualWriteRepository = Pick<
  KernelRepository,
  "listContexts" | "getRecord" | "listRevisions" | "saveRecord"
>;

/**
 * Upsert an `agent-session` kernel record for each discovered session. A
 * session the kernel has not seen is created; one it has is merged, never
 * replaced (`planAgentSessionRediscovery`), so a status, project, title, or
 * date the user set survives the session growing. A real change writes one
 * automation `update` revision; an identical observation writes nothing.
 *
 * Best effort per record: one failure never blocks the rest, and a
 * context-load failure just leaves new records unbound. A record whose current
 * state cannot be read reliably is skipped rather than recreated over it. The
 * caller has already persisted the legacy drafts, so a kernel failure here
 * degrades to "legacy only", never a lost registration (dual-run doctrine).
 */
export async function upsertAgentSessionRecords(
  repo: DualWriteRepository,
  registry: SchemaRegistry,
  metas: readonly AgentWorkSessionMeta[],
  options: { now?: () => Date } = {},
): Promise<AgentSessionDualWriteResult> {
  const result: AgentSessionDualWriteResult = {
    created: 0,
    updated: 0,
    unchanged: 0,
    preserved: 0,
    failed: 0,
  };
  if (metas.length === 0) return result;
  const now = options.now ?? (() => new Date());

  let contexts: KernelContext[] = [];
  try {
    contexts = (await repo.listContexts()).data;
  } catch {
    contexts = [];
  }

  for (const meta of metas) {
    try {
      const input = buildAgentSessionRecordInput(meta, contexts);
      const existing = await repo.getRecord(input.id as string);
      // A desktop read that fell back answered from the browser store, which
      // may not hold what SQLite holds. A miss there is not proof of absence,
      // and creating would replace the real record whole.
      if (existing.fellBack) {
        result.failed += 1;
        continue;
      }

      if (!existing.data) {
        const { record, revision } = createRecord({ ...input, now }, registry);
        await repo.saveRecord(record, revision);
        result.created += 1;
        continue;
      }

      const current = existing.data;
      if (
        current.schemaId !== "agent-session" ||
        current.status === "discarded" ||
        current.status === "archived"
      ) {
        result.preserved += 1;
        continue;
      }

      const revisions = await repo.listRevisions(current.id);
      if (revisions.fellBack) {
        result.failed += 1;
        continue;
      }
      const written = automationWrittenFields(revisions.data);
      if (!written && revisions.data.some((revision) => revision.actor === "user")) {
        // The user edited a record whose automation write is not on record, so
        // no field can be shown to still be automation's.
        result.preserved += 1;
        continue;
      }

      const patch = planAgentSessionRediscovery(written ?? observedFields(current), current, input);
      if (Object.keys(patch).length === 0) {
        result.unchanged += 1;
        continue;
      }
      const { record, revision } = applyRecordPatch(current, patch, "rule", registry, now);
      await repo.saveRecord(record, supersedeGrowthRevision(revisions.data, revision));
      result.updated += 1;
    } catch {
      result.failed += 1;
    }
  }
  return result;
}
