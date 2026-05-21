import { Save, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "../../components/ui/Button";

export type InlineEditField = {
  id: string;
  label: string;
  value: string;
  multiline?: boolean;
  required?: boolean;
};

export function InlineEditForm({
  fields,
  onSave,
  onCancel,
}: {
  fields: InlineEditField[];
  onSave: (values: Record<string, string>) => void;
  onCancel: () => void;
}) {
  const initialValues = useMemo(
    () =>
      Object.fromEntries(fields.map((field) => [field.id, field.value])),
    [fields],
  );
  const [values, setValues] = useState<Record<string, string>>(initialValues);
  const firstInputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);

  // Reset values whenever the target item changes (e.g. user selects a
  // different issue while the form is still open).
  useEffect(() => {
    setValues(initialValues);
  }, [initialValues]);

  // Auto-focus the first input/textarea when the form mounts.
  useEffect(() => {
    firstInputRef.current?.focus();
  }, []);

  const hasChanges = fields.some((field) => values[field.id]?.trim() !== field.value.trim());
  const missingRequired = fields.some(
    (field) => field.required && !values[field.id]?.trim(),
  );

  function handleKeyDown(event: React.KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault();
      onCancel();
    }
  }

  return (
    <form
      className="review-inline-edit"
      onKeyDown={handleKeyDown}
      onSubmit={(event) => {
        event.preventDefault();
        if (!hasChanges || missingRequired) return;
        onSave(values);
      }}
    >
      {fields.map((field, index) => (
        <label className="review-inline-edit-field" key={field.id}>
          <span>{field.label}</span>
          {field.multiline ? (
            <textarea
              ref={index === 0 ? (el) => { firstInputRef.current = el; } : undefined}
              value={values[field.id] ?? ""}
              rows={field.id === "rationale" ? 4 : 3}
              onChange={(event) =>
                setValues((current) => ({ ...current, [field.id]: event.target.value }))
              }
            />
          ) : (
            <input
              ref={index === 0 ? (el) => { firstInputRef.current = el; } : undefined}
              value={values[field.id] ?? ""}
              onChange={(event) =>
                setValues((current) => ({ ...current, [field.id]: event.target.value }))
              }
            />
          )}
        </label>
      ))}
      <div className="review-inline-edit-actions">
        <Button
          type="submit"
          variant="primary"
          icon={Save}
          disabled={!hasChanges || missingRequired}
        >
          저장
        </Button>
        <Button type="button" variant="ghost" icon={X} onClick={onCancel}>
          취소
        </Button>
      </div>
    </form>
  );
}
