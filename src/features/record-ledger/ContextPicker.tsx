/**
 * ContextPicker · files a record under a project.
 *
 * The kernel has supported this all along (contextIds on the record, patchable,
 * SQLite round-tripped, read by every grouping consumer); there was simply no
 * control, so a written note was born unfiled and could never appear on the
 * 프로젝트 screen. Filing goes through contextIds rather than a belongs-to
 * relation because that is the patch-supported path: one updateRecord call is an
 * audited revision the existing 되돌리기 can undo, whereas relations have no
 * update or delete, so un-filing would need new persistence.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Check, FolderPlus } from "lucide-react";
import type { KernelContext, MoriRecord } from "../../lib/record-kernel/kernelTypes";
import type { RecordLedger } from "./useRecordLedger";

/** The project a record is filed under, or null. A record carries contextIds of
 *  every type (routine, topic…), so this resolves against project contexts only. */
export function recordProject(
  record: MoriRecord,
  contexts: KernelContext[],
): KernelContext | null {
  for (const id of record.contextIds) {
    const context = contexts.find((candidate) => candidate.id === id);
    if (context?.type === "project") return context;
  }
  return null;
}

/** Replace a record's project while leaving its other memberships alone. */
export function withProject(
  record: MoriRecord,
  contexts: KernelContext[],
  projectId: string | null,
): string[] {
  const projectIds = new Set(
    contexts.filter((context) => context.type === "project").map((context) => context.id),
  );
  const kept = record.contextIds.filter((id) => !projectIds.has(id));
  return projectId ? [...kept, projectId] : kept;
}

export function ContextPicker({
  record,
  ledger,
}: {
  record: MoriRecord;
  ledger: RecordLedger;
}) {
  const [open, setOpen] = useState(false);
  const [naming, setNaming] = useState(false);
  const [draft, setDraft] = useState("");
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
        setNaming(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        setNaming(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const projects = useMemo(
    () => ledger.contexts.filter((context) => context.type === "project"),
    [ledger.contexts],
  );
  const current = useMemo(
    () => recordProject(record, ledger.contexts),
    [record, ledger.contexts],
  );

  const file = (projectId: string | null) => {
    void ledger.updateRecord(record, {
      contextIds: withProject(record, ledger.contexts, projectId),
    });
    setOpen(false);
  };

  const createAndFile = async () => {
    const created = await ledger.createProjectContext(draft);
    setDraft("");
    setNaming(false);
    if (!created) return;
    void ledger.updateRecord(record, {
      contextIds: withProject(record, ledger.contexts, created.id),
    });
    setOpen(false);
  };

  return (
    <span className="ctx-picker" ref={ref}>
      <button
        type="button"
        className={`ctx-picker-btn${current ? " is-filed" : ""}`}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="프로젝트"
      >
        {current ? current.name : "프로젝트 없음"}
        <ChevronDown size={11} aria-hidden="true" />
      </button>
      {open ? (
        <div className="ctx-picker-menu" role="menu">
          <div className="ctx-picker-scroll base-scroll">
            <button
              type="button"
              role="menuitemradio"
              aria-checked={!current}
              className={`ctx-picker-opt${!current ? " is-on" : ""}`}
              onClick={() => file(null)}
            >
              프로젝트 없음
              {!current ? <Check size={12} aria-hidden="true" /> : null}
            </button>
            {projects.map((project) => (
              <button
                key={project.id}
                type="button"
                role="menuitemradio"
                aria-checked={project.id === current?.id}
                className={`ctx-picker-opt${project.id === current?.id ? " is-on" : ""}`}
                onClick={() => file(project.id)}
              >
                {project.name}
                {project.id === current?.id ? <Check size={12} aria-hidden="true" /> : null}
              </button>
            ))}
          </div>
          {naming ? (
            <form
              className="ctx-picker-new"
              onSubmit={(event) => {
                event.preventDefault();
                void createAndFile();
              }}
            >
              <input
                autoFocus
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="프로젝트 이름"
                aria-label="새 프로젝트 이름"
              />
            </form>
          ) : (
            <button type="button" className="ctx-picker-add" onClick={() => setNaming(true)}>
              <FolderPlus size={12} aria-hidden="true" />
              새 프로젝트
            </button>
          )}
        </div>
      ) : null}
    </span>
  );
}
