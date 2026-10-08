/**
 * The review control beside a session on the 프로젝트 page: turns the page's
 * suggestion into the operator's decision, or undoes one.
 *
 * A suggestion is only shown; nothing is written until 확정. 확정 files the
 * session's record under this project, 아님 records that it does not belong
 * here, 해제 unfiles it. Each is one reviewed `user` revision, applied to the
 * record as it is now (`projectMembership.ts`), so a decision made against a
 * record that moved meanwhile is refused instead of overwriting.
 */
import { useState } from "react";
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

export function SessionMembershipControl({
  sessionId,
  inclusion,
  project,
  ledger,
}: {
  sessionId: string;
  inclusion: SessionInclusion | undefined;
  /** The project this page shows. */
  project: KernelContext | null;
  ledger: Pick<RecordLedger, "reviewSessionProject">;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!inclusion || !project) return null;

  const decide = async (decision: "confirm" | "reject" | "unfile", expectedProjectId: string | null) => {
    setBusy(true);
    setError(null);
    const outcome = await ledger.reviewSessionProject({
      recordId: sessionId,
      decision,
      contextId: project.id,
      expectedProjectId,
    });
    setBusy(false);
    if (!outcome.ok) setError(REFUSAL[outcome.reason]);
  };

  const errorLine = error ? <span className="context-review-error">{error}</span> : null;

  if (inclusion.project === "member") {
    return (
      <span className="context-review">
        <span className="context-review-chip is-member">확정됨</span>
        <button
          type="button"
          className="context-review-btn"
          disabled={busy}
          onClick={() => void decide("unfile", project.id)}
        >
          해제
        </button>
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
          프로젝트로 옮기지 않습니다. 세션 화면에서 프로젝트를 다시 고르세요.
        </InfoHint>
      </span>
    );
  }

  if (inclusion.review === "suggested") {
    return (
      <span className="context-review">
        <span className="context-review-chip">제안</span>
        <InfoHint label="제안 근거">
          {inclusion.project === "alias" ? "사용자가 확인한 폴더 연결로 이 프로젝트에 묶였습니다." : BASIS[inclusion.identity]}{" "}
          확정하면 이 세션 기록이 이 프로젝트에 속합니다. 이 세션이 프로젝트의 작업을 했다는 뜻은 아닙니다.
        </InfoHint>
        <button type="button" className="context-review-btn is-primary" disabled={busy} onClick={() => void decide("confirm", null)}>
          확정
        </button>
        <button type="button" className="context-review-btn" disabled={busy} onClick={() => void decide("reject", null)}>
          아님
        </button>
        {errorLine}
      </span>
    );
  }

  return null;
}
