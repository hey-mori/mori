/**
 * SchemaQuickForm · a quick-entry form generated from a SchemaDefinition
 * (record-workspace interaction spec §4).
 *
 * No per-schema component exists: fields derive from
 * `SchemaPropertyDefinition` (label, type, required, options, unit), so a
 * user-defined schema gets the same form with zero code changes. The form is
 * a shortcut for repeat entry, never a gate; the escape hatch back to free
 * text is always visible.
 */
import { useState } from "react";
import { Button } from "../../../components/ui/Button";
import type {
  RecordPropertyValue,
  SchemaDefinition,
  SchemaPropertyDefinition,
} from "../../../lib/record-kernel/kernelTypes";

type FormValues = Record<string, RecordPropertyValue | undefined>;

/** json-typed properties (structured blobs) stay out of the quick form; the
 *  free-text line and later detail editing cover them. */
function quickFormFields(schema: SchemaDefinition): SchemaPropertyDefinition[] {
  return schema.properties.filter((property) => property.type !== "json");
}

function FieldInput({
  property,
  value,
  onChange,
}: {
  property: SchemaPropertyDefinition;
  value: RecordPropertyValue | undefined;
  onChange: (value: RecordPropertyValue | undefined) => void;
}) {
  switch (property.type) {
    case "boolean":
      return (
        <input
          type="checkbox"
          checked={value === true}
          onChange={(event) => onChange(event.target.checked)}
        />
      );
    case "number":
    case "duration-minutes":
      return (
        <input
          type="number"
          min={0}
          value={typeof value === "number" ? value : ""}
          placeholder={property.unit ?? ""}
          onChange={(event) =>
            onChange(event.target.value === "" ? undefined : Number(event.target.value))
          }
        />
      );
    case "date":
      return (
        <input
          type="date"
          value={typeof value === "string" ? value : ""}
          onChange={(event) => onChange(event.target.value || undefined)}
        />
      );
    case "select":
      return (
        <select
          value={typeof value === "string" ? value : ""}
          onChange={(event) => onChange(event.target.value || undefined)}
        >
          <option value="">선택</option>
          {(property.options ?? []).map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      );
    default:
      return (
        <input
          type="text"
          value={typeof value === "string" ? value : ""}
          onChange={(event) => onChange(event.target.value || undefined)}
        />
      );
  }
}

export function SchemaQuickForm({
  schema,
  onSubmit,
  onDismiss,
}: {
  schema: SchemaDefinition;
  onSubmit: (values: FormValues, text: string, occurredStart?: string) => void;
  onDismiss: () => void;
}) {
  const [values, setValues] = useState<FormValues>({});
  const [text, setText] = useState("");
  const [occurredStart, setOccurredStart] = useState("");

  const fields = quickFormFields(schema);
  const requiredMissing = fields.some(
    (property) => property.required && (values[property.key] === undefined || values[property.key] === ""),
  );
  const hasAnything =
    text.trim().length > 0 || fields.some((property) => values[property.key] !== undefined);

  return (
    <form
      className="ledger-capture schema-form"
      aria-label={`${schema.name} 빠른 입력`}
      onSubmit={(event) => {
        event.preventDefault();
        if (!requiredMissing && hasAnything) {
          onSubmit(values, text, occurredStart || undefined);
        }
      }}
    >
      <header className="schema-form-head">
        <strong>{schema.name}</strong>
        <button type="button" className="composer-link" onClick={onDismiss}>
          그냥 문장으로 쓰기
        </button>
      </header>

      <div className="schema-form-grid">
        {fields.map((property) => (
          <label key={property.key} className="schema-form-field">
            <span>
              {property.label}
              {property.required ? null : <em className="schema-form-opt"> 선택</em>}
              {property.unit ? <em className="schema-form-opt"> ({property.unit})</em> : null}
            </span>
            <FieldInput
              property={property}
              value={values[property.key]}
              onChange={(value) => setValues((current) => ({ ...current, [property.key]: value }))}
            />
          </label>
        ))}
        <label className="schema-form-field">
          <span>
            날짜<em className="schema-form-opt"> 선택</em>
          </span>
          <input
            type="date"
            value={occurredStart}
            onChange={(event) => setOccurredStart(event.target.value)}
          />
        </label>
      </div>

      <label className="schema-form-field schema-form-text">
        <span>
          메모<em className="schema-form-opt"> 선택</em>
        </span>
        <input
          type="text"
          value={text}
          placeholder="예: 퇴근하고 한강에서"
          onChange={(event) => setText(event.target.value)}
        />
      </label>

      <div className="ledger-capture-foot">
        <Button type="submit" variant="primary" disabled={requiredMissing || !hasAnything}>
          저장
        </Button>
      </div>
    </form>
  );
}
