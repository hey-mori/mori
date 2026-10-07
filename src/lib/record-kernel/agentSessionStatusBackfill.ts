/**
 * Provisional → active backfill for observed agent sessions (owner decision 2,
 * 2026-10-07: policy approved, execution not).
 *
 * From 2026-07-16 to 2026-10-07 every discovered session was written
 * `provisional`. New ones are `active` now, and rediscovery never changes status
 * (`agentSessionRecordAdapter`), so the old ones stay provisional until something
 * explicit promotes them. This module is that something, in two separate steps:
 *
 *   planAgentSessionStatusBackfill   a dry run: reads, never writes, and says
 *                                    which records qualify and why others do not
 *   applyAgentSessionStatusBackfill  the write: one `rule` status-change revision
 *                                    per promoted record, re-checking each one
 *
 * A record qualifies only while it is still entirely automation's: schema
 * `agent-session`, status `provisional`, origin `automation`, and a revision
 * trail written by rules alone (no user edit, no AI edit). Applying is
 * idempotent: a promoted record is `active`, so a second run finds nothing.
 *
 * Nothing calls this at startup or on a schedule. It runs only when the owner
 * runs it, on the machine that holds the real data.
 */
import { applyRecordPatch } from "./recordFactory";
import type { KernelRepository } from "./kernelRepository";
import type { MoriRecord } from "./kernelTypes";
import type { SchemaRegistry } from "./schemaRegistry";

export type BackfillSkipReason =
  /** A user revision exists: the user has touched this record. */
  | "user-touched"
  /** An AI revision exists, or the record was not written by automation. */
  | "not-automation-owned"
  /** The revision trail could not be read from the real store. */
  | "unreadable";

export type AgentSessionBackfillPlan = {
  /** Provisional agent-session records examined. */
  scanned: number;
  /** Records that would be promoted to `active`. */
  eligible: Array<{ recordId: string; title: string }>;
  skipped: Array<{ recordId: string; reason: BackfillSkipReason }>;
};

export type AgentSessionBackfillResult = {
  promoted: number;
  /** Planned records that no longer qualified when the write came. */
  skipped: number;
  failed: number;
};

type BackfillRepository = Pick<
  KernelRepository,
  "listRecords" | "getRecord" | "listRevisions" | "saveRecord"
>;

export class BackfillReadError extends Error {
  constructor() {
    super("kernel records could only be read from the fallback store; refusing to plan");
    this.name = "BackfillReadError";
  }
}

function isCandidate(record: MoriRecord): boolean {
  return record.schemaId === "agent-session" && record.status === "provisional";
}

async function verdict(
  repo: BackfillRepository,
  record: MoriRecord,
): Promise<BackfillSkipReason | "eligible"> {
  if (record.origin !== "automation") return "not-automation-owned";
  const revisions = await repo.listRevisions(record.id);
  if (revisions.fellBack) return "unreadable";
  if (revisions.data.some((revision) => revision.actor === "user")) return "user-touched";
  if (revisions.data.some((revision) => revision.actor !== "rule")) return "not-automation-owned";
  return "eligible";
}

/** The dry run. Reads only. Throws `BackfillReadError` when the record list
 *  itself came from the fallback store, since a plan over the wrong store would
 *  report a count that means nothing. */
export async function planAgentSessionStatusBackfill(
  repo: BackfillRepository,
): Promise<AgentSessionBackfillPlan> {
  const records = await repo.listRecords();
  if (records.fellBack) throw new BackfillReadError();
  const plan: AgentSessionBackfillPlan = { scanned: 0, eligible: [], skipped: [] };
  for (const record of records.data) {
    if (!isCandidate(record)) continue;
    plan.scanned += 1;
    const outcome = await verdict(repo, record);
    if (outcome === "eligible") plan.eligible.push({ recordId: record.id, title: record.title });
    else plan.skipped.push({ recordId: record.id, reason: outcome });
  }
  return plan;
}

/** The write. Takes a plan and re-checks every record against the store before
 *  touching it, because time passes between a dry run and its application. */
export async function applyAgentSessionStatusBackfill(
  repo: BackfillRepository,
  registry: SchemaRegistry,
  plan: AgentSessionBackfillPlan,
  now: () => Date = () => new Date(),
): Promise<AgentSessionBackfillResult> {
  const result: AgentSessionBackfillResult = { promoted: 0, skipped: 0, failed: 0 };
  for (const { recordId } of plan.eligible) {
    try {
      const current = await repo.getRecord(recordId);
      if (current.fellBack) {
        result.failed += 1;
        continue;
      }
      if (!current.data || !isCandidate(current.data)) {
        result.skipped += 1;
        continue;
      }
      if ((await verdict(repo, current.data)) !== "eligible") {
        result.skipped += 1;
        continue;
      }
      const { record, revision } = applyRecordPatch(
        current.data,
        { status: "active" },
        "rule",
        registry,
        now,
      );
      await repo.saveRecord(record, revision);
      result.promoted += 1;
    } catch {
      result.failed += 1;
    }
  }
  return result;
}
