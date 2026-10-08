/**
 * The record a user edit should be applied to: the stored one, read fresh.
 *
 * A UI holds a snapshot from its last render. Patching that snapshot writes
 * back every field it carries, so an edit made from a stale copy silently
 * reverts whatever changed since (a project filing a moment earlier, an agent
 * session's newer end time). A patch names only the fields it changes, so it
 * belongs on top of the record as it is now. When the read cannot be trusted
 * (a desktop fallback) or finds nothing, the caller's snapshot is the base.
 */
import type { MoriRecord } from "./kernelTypes";
import type { KernelRepository } from "./kernelRepository";

export async function latestRecordFor(
  repo: Pick<KernelRepository, "getRecord">,
  record: MoriRecord,
): Promise<MoriRecord> {
  try {
    const fresh = await repo.getRecord(record.id);
    if (fresh.fellBack || !fresh.data) return record;
    return fresh.data;
  } catch {
    return record;
  }
}
