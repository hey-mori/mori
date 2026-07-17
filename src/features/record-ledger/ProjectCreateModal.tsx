/**
 * 새 프로젝트 · the create dialog for a project context (기록 v8 §4).
 *
 * It replaces an inline name field in the rail, which could not show where the
 * project was about to land or say what a "/" in the name would do, and which
 * answered a name collision by silently doing nothing.
 *
 * Shape is the house modal exactly (`ProjectFormModal`'s scrim, headed bar,
 * round close, Esc, focus trap), so it reads as one family. The FIELDS are this
 * screen's own: a `KernelContext` has a name and a parent and no description, so
 * offering a 설명 box here would be offering a field that goes nowhere.
 *
 * 상위 프로젝트 and a path typed into the name compose rather than compete: the
 * parent is where the walk STARTS, and a "회사/mori" name is the path from there.
 * The live preview under the fields is what makes that one visible thing instead
 * of two rules to hold in your head.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { trapTabKey } from "../../components/ui/focusTrap";
import type { KernelContext } from "../../lib/record-kernel/kernelTypes";
import {
  contextPath,
  contextTreeOrder,
  CONTEXT_PATH_SEPARATOR,
  inArchivedSubtree,
  siblingNameTaken,
} from "./contextTree";

export function ProjectCreateModal({
  contexts,
  initialParentId,
  onSubmit,
  onClose,
}: {
  contexts: KernelContext[];
  /** Pre-selected parent when opened from a project's 하위 프로젝트. */
  initialParentId: string | null;
  onSubmit: (name: string, parentId: string | undefined) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState<string>(initialParentId ?? "");
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

  // An archived project is not a place to put new work, so it is not offered.
  const parents = useMemo(
    () =>
      contextTreeOrder(
        contexts.filter(
          (context) => context.type === "project" && !inArchivedSubtree(context.id, contexts),
        ),
      ),
    [contexts],
  );

  const segments = useMemo(
    () =>
      name
        .split(CONTEXT_PATH_SEPARATOR)
        .map((segment) => segment.trim())
        .filter((segment) => segment.length > 0),
    [name],
  );

  const parentPath = parentId ? contextPath(parentId, contexts) : "";
  const preview = [parentPath, ...segments].filter(Boolean).join(` ${CONTEXT_PATH_SEPARATOR} `);

  // Say it up front rather than refusing afterwards. Two siblings with one name
  // derive one path, and the path is the key that a project's records are
  // gathered by, so the write refuses it: the user should learn that here, while
  // they can still fix it, not by pressing 생성 and watching nothing happen.
  const collision =
    segments.length === 1 && siblingNameTaken(contexts, parentId || undefined, segments[0]);

  const canSubmit = segments.length > 0 && !collision;

  const submit = () => {
    if (!canSubmit) return;
    onSubmit(name, parentId || undefined);
  };

  return (
    <div className="settings-sheet-layer" role="presentation">
      <div className="settings-sheet-scrim" onClick={onClose} aria-hidden="true" />
      <div
        ref={dialogRef}
        className="project-modal"
        role="dialog"
        aria-modal="true"
        aria-label="새 프로젝트"
        tabIndex={-1}
      >
        <header className="settings-sheet-head">
          <div className="settings-sheet-title">
            <strong>새 프로젝트</strong>
          </div>
          <button type="button" className="settings-sheet-close" onClick={onClose} aria-label="닫기">
            <X size={16} aria-hidden="true" />
          </button>
        </header>

        <div className="project-modal-body">
          <label className="project-modal-field">
            <span>
              이름 <em className="is-required">필수</em>
            </span>
            <input
              autoFocus
              style={{ margin: 0 }}
              value={name}
              maxLength={80}
              placeholder="예: mori"
              aria-describedby="project-create-hint"
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  submit();
                }
              }}
            />
            <span id="project-create-hint" className="project-modal-hint">
              회사/mori 처럼 적으면 한 번에 하위까지 만듭니다
            </span>
          </label>

          <label className="project-modal-field">
            <span>
              상위 프로젝트 <em className="is-optional">선택</em>
            </span>
            <select
              style={{ margin: 0 }}
              value={parentId}
              onChange={(event) => setParentId(event.target.value)}
            >
              <option value="">없음 (최상위)</option>
              {parents.map(({ context, depth }) => (
                <option key={context.id} value={context.id}>
                  {`${"  ".repeat(depth)}${context.name}`}
                </option>
              ))}
            </select>
          </label>

          {preview ? (
            <p className="project-modal-preview">
              <span>여기에 만듭니다</span>
              <strong>{preview}</strong>
            </p>
          ) : null}

          {collision ? (
            <p className="project-modal-error" role="alert">
              같은 위치에 같은 이름의 프로젝트가 이미 있습니다.
            </p>
          ) : null}
        </div>

        <footer className="project-modal-foot">
          <Button variant="ghost" onClick={onClose}>
            취소
          </Button>
          <Button variant="primary" disabled={!canSubmit} onClick={submit}>
            생성
          </Button>
        </footer>
      </div>
    </div>
  );
}
