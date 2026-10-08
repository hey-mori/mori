/**
 * The review control beside a session on the 프로젝트 page: turns the page's
 * suggestion into the operator's decision, or undoes one.
 *
 * A suggestion is only shown; nothing is written until 확정. 확정 files the
 * session's record under this project, 아님 records that it does not belong
 * here, 해제 unfiles it. Each is one reviewed `user` revision, applied to the
 * record as it is now (`projectMembership.ts`), so a decision made against a
 * record that moved meanwhile is refused instead of overwriting.
 *
 * 프로젝트 지정 files (or moves) the session under any live project by hand,
 * the same reviewed decision without a suggestion behind it: the door back
 * after 아님 or 해제, and the way to correct a wrong filing.
 */
import { useEffect, useRef, useState } from "react";
import { InfoHint } from "../../components/ui/InfoHint";
import type { KernelContext } from "../../lib/record-kernel/kernelTypes";
import type { MembershipOutcome } from "../../lib/record-kernel/projectMembership";
import type { SessionInclusion } from "./projectGroups";
import type { RecordLedger } from "./useRecordLedger";

const BASIS: Record<SessionInclusion["identity"], string> = {
  "worktree-record": "세션 기록에 이 프로젝트 checkout의 Git worktree에서 진행했다고 남아 있습니다.",
  "git-worktree": "세션 폴더가 이 프로젝트 checkout의 Git worktree입니다.",
  "git-checkout": "세션 폴더가 이 프로젝트의 Git checkout 안에 있습니다.",
  folder: "세션 폴더 이름이 이 프로젝트 이름과 같습니다.",
};

const REFUSAL: Record<Exclude<MembershipOutcome, { ok: true }>["reason"], string> = {
  stale: "그사이 다른 프로젝트로 바뀌었습니다",
  "missing-context": "프로젝트가 없어졌습니다",
  "archived-context": "보관된 프로젝트입니다",
  "not-a-project": "프로젝트가 아닙니다",
  unchanged: "이미 반영되어 있습니다",
  "not-found": "세션 기록을 찾지 못했습니다",
  "unreliable-read": "저장소를 읽지 못했습니다",
  "fell-back": "저장하지 못했습니다",
};

/** A small menu of live projects to file the session under by hand. */
function ProjectChooser({
  projects,
  currentId,
  disabled,
  onChoose,
}: {
  projects: KernelContext[];
  currentId: string | null;
  disabled: boolean;
  onChoose: (contextId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);
  const choices = projects.filter((entry) => entry.id !== currentId);
  if (choices.length === 0) return null;
  return (
    <span className="ctx-picker" ref={ref}>
      <button
        type="button"
        className="context-review-btn"
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {currentId ? "옮기기" : "프로젝트 지정"}
      </button>
      {open ? (
        <div className="ctx-picker-menu" role="menu">
          <div className="ctx-picker-scroll base-scroll">
            {choices.map((entry) => (
              <button
                key={entry.id}
                type="button"
                role="menuitem"
                className="ctx-picker-opt"
                onClick={() => {
                  setOpen(false);
                  onChoose(entry.id);
                }}
              >
                {entry.name}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </span>
  );
}

export function SessionMembershipControl({
  sessionId,
  inclusion,
  project,
  projects,
  filable,
  ledger,
}: {
  sessionId: string;
  inclusion: SessionInclusion | undefined;
  /** The project this page shows, or null for a folder group. */
  project: KernelContext | null;
  /** Live (not archived) projects the session can be filed under by hand. */
  projects: KernelContext[];
  /** The session has a kernel record (an auto-imported agent session). */
  filable: boolean;
  ledger: Pick<RecordLedger, "reviewSessionProject">;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!inclusion || !filable) return null;

  const decide = async (
    decision: "confirm" | "reject" | "unfile",
    contextId: string,
    expectedProjectId: string | null,
  ) => {
    setBusy(true);
    setError(null);
    const outcome = await ledger.reviewSessionProject({
      recordId: sessionId,
      decision,
      contextId,
      expectedProjectId,
    });
    setBusy(false);
    if (!outcome.ok) setError(REFUSAL[outcome.reason]);
  };

  const errorLine = error ? <span className="context-review-error">{error}</span> : null;
  const memberOf = inclusion.project === "member" ? project : null;
  const chooser = (
    <ProjectChooser
      projects={projects}
      currentId={memberOf?.id ?? null}
      disabled={busy}
      onChoose={(contextId) => void decide("confirm", contextId, memberOf?.id ?? null)}
    />
  );

  if (memberOf) {
    return (
      <span className="context-review">
        <span className="context-review-chip is-member">확정됨</span>
        <button
          type="button"
          className="context-review-btn"
          disabled={busy}
          onClick={() => void decide("unfile", memberOf.id, memberOf.id)}
        >
          해제
        </button>
        {chooser}
        {errorLine}
      </span>
    );
  }

  if (inclusion.review === "invalid") {
    return (
      <span className="context-review">
        <span className="context-review-chip is-warning">프로젝트 확인 필요</span>
        <InfoHint label="확인 필요 설명">
          이 세션은 지금 없거나 보관된 프로젝트로 확정되어 있습니다. Mori는 이름이 같은 다른
          프로젝트로 옮기지 않습니다. 옮길 프로젝트를 직접 고르세요.
        </InfoHint>
        <ProjectChooser
          projects={projects}
          currentId={null}
          disabled={busy}
          onChoose={(contextId) => void decide("confirm", contextId, inclusion.invalidContextId ?? null)}
        />
        {errorLine}
      </span>
    );
  }

  if (inclusion.review === "suggested" && project) {
    return (
      <span className="context-review">
        <span className="context-review-chip">제안</span>
        <InfoHint label="제안 근거">
          {inclusion.project === "alias" ? "사용자가 확인한 폴더 연결로 이 프로젝트에 묶였습니다." : BASIS[inclusion.identity]}{" "}
          확정하면 이 세션 기록이 이 프로젝트에 속합니다. 이 세션이 프로젝트의 작업을 했다는 뜻은 아닙니다.
        </InfoHint>
        <button type="button" className="context-review-btn is-primary" disabled={busy} onClick={() => void decide("confirm", project.id, null)}>
          확정
        </button>
        <button type="button" className="context-review-btn" disabled={busy} onClick={() => void decide("reject", project.id, null)}>
          아님
        </button>
        {errorLine}
      </span>
    );
  }

  // No suggestion here (a folder group, or a project the operator rejected):
  // filing by hand is still one click away.
  return (
    <span className="context-review">
      {chooser}
      {errorLine}
    </span>
  );
}
