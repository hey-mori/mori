/**
 * Record presentation · plain-language labels for kernel records on the 오늘
 * and 인박스 surfaces. Internal vocabulary (status enum, schema ids) never
 * reaches the screen; this maps it to Korean-first copy.
 */
import type { BaseStatusBadgeTone } from "../../components/ui/BaseStatusBadge";
import type {
  MoriRecord,
  SourceKind,
  RecordStatus,
  TimeBasis,
} from "../../lib/record-kernel/kernelTypes";
import type { SchemaRegistry } from "../../lib/record-kernel/schemaRegistry";

export function schemaLabel(record: MoriRecord, registry: SchemaRegistry): string {
  return registry.get(record.schemaId)?.name ?? record.schemaId;
}

/** Records that belong on the ledger surfaces (오늘 · 캘린더): applied work.
 *  Candidates live in 인박스; discarded / archived are hidden. */
export function ledgerVisibleRecords(records: MoriRecord[]): MoriRecord[] {
  return records.filter((record) => record.status === "active" || record.status === "provisional");
}

/** Plain-language label for how an activity time was established. */
export function timeBasisLabel(basis: TimeBasis): string {
  switch (basis) {
    case "source-exact":
      return "출처에 기록된 정확한 시각";
    case "source-observed":
      return "출처에서 관찰한 시각";
    case "user-provided":
      return "직접 입력한 날짜";
    case "ai-inferred":
      return "표현에서 추론한 날짜";
    case "capture-fallback":
      return "기록한 시점";
    case "unknown":
      return "날짜 미정";
  }
}

export function sourceKindLabel(kind: SourceKind): string {
  switch (kind) {
    case "text":
      return "직접 입력";
    case "url":
      return "URL";
    case "file":
      return "파일";
    case "pasted-conversation":
      return "붙여넣은 대화";
    case "git":
      return "Git";
    case "agent-session":
      return "에이전트 세션";
    case "connected-sync":
      return "자동 수집";
  }
}

export type DisplayProperty = { label: string; value: string };

/** Schema-driven property rows for the inspector, skipping empty values and
 *  rendering json / duration in a readable way. */
export function displayProperties(record: MoriRecord, registry: SchemaRegistry): DisplayProperty[] {
  const schema = registry.get(record.schemaId);
  if (!schema) return [];
  const rows: DisplayProperty[] = [];
  for (const property of schema.properties) {
    const value = record.properties[property.key];
    if (value === undefined || value === null || value === "") continue;
    rows.push({ label: property.label, value: formatValue(value, property.unit) });
  }
  return rows;
}

function formatValue(value: unknown, unit?: string): string {
  if (typeof value === "number") return unit ? `${value}${unit}` : String(value);
  if (typeof value === "boolean") return value ? "예" : "아니오";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return `${value.length}개`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (Array.isArray(record.items)) return `${(record.items as unknown[]).length}개`;
    return "…";
  }
  return String(value);
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
