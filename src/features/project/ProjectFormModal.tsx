import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "../../components/ui/Button";
import { trapTabKey } from "../../components/ui/focusTrap";

export type ProjectFormValues = { name: string; description: string };

/**
 * Create / edit a project in a centered modal that mirrors the settings sheet's
 * shape (scrim + headed card + Esc / scrim-to-close + focus trap). Reuses the
 * shared `.mori-modal` styling so no new CSS is introduced.
 *
 * The project *name* is required (it is the project's identity); description is
 * optional. The submit verb is "생성" when creating and "저장" when editing.
 */
export function ProjectFormModal({
  mode,
  initialName = "",
  initialDescription = "",
  onSubmit,
  onClose,
}: {
  mode: "create" | "edit";
  initialName?: string;
  initialDescription?: string;
  onSubmit: (values: ProjectFormValues) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    previousFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      trapTabKey(event, dialogRef.current);
    };
    document.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
      previousFocusRef.current?.focus();
    };
  }, [onClose]);

  const trimmedName = name.trim();
  const canSubmit = trimmedName.length > 0;
  const title = mode === "create" ? "새 프로젝트" : "프로젝트 수정";
  const submitLabel = mode === "create" ? "생성" : "저장";

  function submit() {
    if (!canSubmit) return;
    onSubmit({ name: trimmedName, description: description.trim() });
  }

  return (
    <div
      className="mori-modal"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className="mori-modal-body"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header>
          <h3>{title}</h3>
          <Button icon={X} variant="ghost" onClick={onClose} aria-label="닫기" title="닫기 (Esc)" />
        </header>
        <label>
          <span>이름 (필수)</span>
          <input
            autoFocus
            value={name}
            maxLength={80}
            placeholder="예: Mori 앱"
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                submit();
              }
            }}
          />
        </label>
        <label>
          <span>설명 (선택)</span>
          <textarea
            value={description}
            rows={3}
            placeholder="이 프로젝트가 어떤 작업인지 적어두면 나중에 한눈에 알아볼 수 있어요."
            onChange={(event) => setDescription(event.target.value)}
          />
        </label>
        <footer>
          <Button variant="ghost" onClick={onClose}>
            취소
          </Button>
          <Button variant="primary" disabled={!canSubmit} onClick={submit}>
            {submitLabel}
          </Button>
        </footer>
      </div>
    </div>
  );
}
