/**
 * Record presentation · plain-language labels for kernel records on the 오늘
 * and 인박스 surfaces. Internal vocabulary (status enum, schema ids) never
 * reaches the screen; this maps it to Korean-first copy.
 */
import type { BaseStatusBadgeTone } from "../../components/ui/BaseStatusBadge";
import type { MoriRecord, RecordStatus } from "../../lib/record-kernel/kernelTypes";
import type { SchemaRegistry } from "../../lib/record-kernel/schemaRegistry";

export function schemaLabel(record: MoriRecord, registry: SchemaRegistry): string {
  return registry.get(record.schemaId)?.name ?? record.schemaId;
}

/** A status badge only when the status carries a signal the user should see.
 *  `active` is the calm normal state and shows nothing. */
export function statusBadge(
  status: RecordStatus,
): { label: string; tone: BaseStatusBadgeTone } | null {
  switch (status) {
    case "provisional":
      return { label: "잠정", tone: "info" };
    case "candidate":
      return { label: "확인 필요", tone: "warning" };
    case "archived":
      return { label: "보관됨", tone: "neutral" };
    case "active":
    case "discarded":
      return null;
  }
}

/** The activity time to show, or the capture time when the activity time is
 *  unknown (labelled honestly so the two are never conflated). */
export function displayTime(record: MoriRecord): { iso: string; isCaptureFallback: boolean } {
  if (record.occurredStart) return { iso: record.occurredStart, isCaptureFallback: false };
  return { iso: record.capturedAt, isCaptureFallback: true };
}
