import type { MoriRecord } from "./kernelTypes";
import type { RecordPatch } from "./recordFactory";

/**
 * A user edit as it applies to the stored record. A title the user writes is
 * their own, so a session record's first-request mark goes with the old title.
 * Worked out on the fresh stored record, never a render copy, so no property
 * that changed since (a live session's counts and evidence) is written back.
 */
export function userEditOf(base: Pick<MoriRecord, "title" | "properties">, patch: RecordPatch): RecordPatch {
  if (patch.title === undefined || patch.title === base.title || base.properties?.titleFromRequest !== true) return patch;
  const { titleFromRequest: _fromRequest, ...properties } = patch.properties ?? base.properties;
  return { ...patch, properties };
}
