/**
 * Form proposer · builds a RecordProposal from a schema-driven quick form
 * (record-workspace spec §4: 형식 입력은 관문이 아니라 지름길).
 *
 * The user authored the structure directly, so the proposal carries
 * `origin: "user"` and full confidence; the apply policy still runs (a new
 * entity or sensitive content can still demand review). No per-schema
 * component exists anywhere: the form fields, and this proposal, derive from
 * `SchemaDefinition.properties`.
 */
import type { RecordPropertyValue } from "../record-kernel/kernelTypes";
import type { SchemaDefinition } from "../record-kernel/kernelTypes";
import type { RecordProposal } from "./captureTypes";

export type FormEntry = {
  schema: SchemaDefinition;
  /** Values keyed by property key; undefined / empty values are dropped. */
  values: Record<string, RecordPropertyValue | undefined>;
  /** Optional free-text line shown as the record body / title base. */
  text?: string;
  /** ISO date the user picked for the activity, if any. */
  occurredStart?: string;
};

/** Compact "라벨 값" line for the record body when no free text was given. */
function bodyFromValues(entry: FormEntry): string {
  const parts: string[] = [];
  for (const property of entry.schema.properties) {
    const value = entry.values[property.key];
    if (value === undefined || value === null || value === "") continue;
    const unit = property.unit ?? "";
    parts.push(`${property.label} ${String(value)}${unit}`);
  }
  return parts.join(" · ");
}

export function proposeFromForm(entry: FormEntry): RecordProposal {
  const properties: RecordProposal["properties"] = {};
  for (const property of entry.schema.properties) {
    const value = entry.values[property.key];
    if (value === undefined || value === null || value === "") continue;
    properties[property.key] = value;
  }

  const text = entry.text?.trim() ?? "";
  const body = text.length > 0 ? text : bodyFromValues(entry);
  const title = text.length > 0 ? text.split(/\r?\n/, 1)[0].slice(0, 60) : entry.schema.name;

  return {
    schemaId: entry.schema.id,
    title: title.length > 0 ? title : entry.schema.name,
    body,
    properties,
    occurredStart: entry.occurredStart,
    timeBasis: entry.occurredStart ? "user-provided" : "unknown",
    confidence: 1,
    rationale: "형식 입력으로 직접 작성했습니다",
    entityMentions: [],
    origin: "user",
  };
}
