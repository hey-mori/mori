import { useEffect, useMemo } from "react";
import {
  Activity,
  CalendarClock,
  CalendarPlus,
  Flag,
  FolderClock,
  FolderKanban,
  Lightbulb,
} from "lucide-react";
import { PageHeader } from "../../components/layout/PageHeader";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { MoriStatusBadge } from "../../components/ui/MoriStatusBadge";
import { useMoriAppStore } from "../../app/store";
import {
  selectSessionMode,
  selectSessionView,
  useMoriSessionStore,
} from "../../app/sessionStore";
import { createBrowserDraftRepository } from "../../lib/storage/localStorageAdapter";
import { formatDate } from "../../lib/formatting/time";
import {
  buildWorkspaceSummary,
  describeWorkspaceSessionStatus,
} from "../../lib/workspace/workspaceSummary";

/**
 * Workspace & Projects.
 *
 * Mori is single-project-local: every session recorded on this device
 * belongs to one project. This page surfaces that project honestly —
 * its real metadata, the locally stored sessions inside it, and a
 * reconstruction snapshot of the active session. Multiple-project
 * management renders as planned because no project store exists yet.
 */
export function WorkspaceView() {
  const view = useMoriSessionStore(selectSessionView);
  const mode = useMoriSessionStore(selectSessionMode);
  const hydrate = useMoriSessionStore((state) => state.hydrate);
  const initialized = useMoriSessionStore((state) => state.initialized);
  const setCurrentView = useMoriAppStore((state) => state.setCurrentView);

  useEffect(() => {
    if (!initialized) hydrate();
  }, [initialized, hydrate]);

  const repository = useMemo(() => createBrowserDraftRepository(), []);
  const summary = useMemo(
    () =>
      buildWorkspaceSummary({
        view,
        mode,
        storedSessions: repository.listStoredSessions(),
      }),
    [view, mode, repository],
  );

  return (
    <div className="page account-profile">
      <PageHeader
        title="워크스페이스 및 프로젝트"
        subtitle="Mori는 단일 프로젝트로 동작합니다. 이 기기에서 기록한 세션은 모두 하나의 프로젝트에 모이며, 외부로 동기화되지 않습니다."
      />
      <div className="account-grid">
        <section className="account-main">
          <section className="settings-card" aria-label="Current project">
            <header className="settings-card-head">
              <div>
                <h3>현재 프로젝트</h3>
                <p>이 기기에서 기록한 모든 세션이 이 프로젝트 하나에 모입니다.</p>
              </div>
              <MoriStatusBadge tone={summary.isDemoProject ? "neutral" : "success"}>
                {summary.isDemoProject ? "데모 프로젝트" : "활성"}
              </MoriStatusBadge>
            </header>
            <div className="account-identity-row">
              <span className="account-avatar" aria-hidden="true">
                {summary.projectName.charAt(0) || "M"}
              </span>
              <div>
                <strong>{summary.projectName}</strong>
                {summary.projectDescription ? (
                  <p>{summary.projectDescription}</p>
                ) : null}
              </div>
            </div>
            <p className="account-state-line">
              <CalendarPlus size={14} aria-hidden="true" />
              <span>생성 {formatDate(summary.createdAt)}</span>
            </p>
            <p className="account-state-line">
              <CalendarClock size={14} aria-hidden="true" />
              <span>최근 활동 {formatDate(summary.updatedAt)}</span>
            </p>
          </section>

          <section className="settings-card account-linked" aria-label="Project sessions">
            <header className="settings-card-head">
              <div>
                <h3>이 프로젝트의 세션</h3>
                <p>이 기기에 저장된 세션 기록입니다. 진행 중인 세션이 가장 위에 표시됩니다.</p>
              </div>
              <Badge tone="purple">{summary.sessionCount}개</Badge>
            </header>
            <ul className="account-linked-list">
              {summary.sessions.map((entry) => {
                const status = describeWorkspaceSessionStatus(entry.status);
                return (
                  <li key={entry.sessionId}>
                    <span className="account-linked-mark" aria-hidden="true">
                      {entry.title.charAt(0)}
                    </span>
                    <div>
                      <strong>{entry.title}</strong>
                      <small>
                        {entry.isActive
                          ? "진행 중인 세션"
                          : entry.savedAt
                            ? `저장 ${formatDate(entry.savedAt)}`
                            : "아직 저장되지 않음"}
                      </small>
                    </div>
                    <MoriStatusBadge tone={status.tone}>
                      {status.label}
                    </MoriStatusBadge>
                  </li>
                );
              })}
            </ul>
            <div className="account-identity-actions">
              <Button onClick={() => setCurrentView("timeline")}>
                활성 세션 타임라인 열기
              </Button>
            </div>
          </section>

          <section className="settings-card" aria-label="Multiple projects">
            <header className="settings-card-head">
              <div>
                <h3>여러 프로젝트</h3>
                <p>
                  지금 Mori는 단일 프로젝트로 동작합니다. 프로젝트를 나누어 전환 · 생성 ·
                  보관하는 기능은 예정되어 있습니다.
                </p>
              </div>
              <MoriStatusBadge status="planned">Planned</MoriStatusBadge>
            </header>
            <p className="account-linked-note">
              <FolderKanban size={13} aria-hidden="true" />
              <span>
                다중 프로젝트는 프로젝트 저장소가 추가되면 함께 도착하며, 기존 세션은 그대로
                현재 프로젝트에 남습니다.
              </span>
            </p>
          </section>
        </section>

        <aside className="account-rail" aria-label="Workspace summary">
          <section className="settings-card account-state-card">
            <header className="settings-card-head">
              <div>
                <h3>활성 세션 요약</h3>
              </div>
              <MoriStatusBadge tone="neutral">
                {summary.isDemoProject ? "데모" : "로컬"}
              </MoriStatusBadge>
            </header>
            <p className="account-state-line">
              <Activity size={14} aria-hidden="true" />
              <span>이벤트 {summary.counts.events}개</span>
            </p>
            <p className="account-state-line">
              <Flag size={14} aria-hidden="true" />
              <span>이슈 {summary.counts.issues}개</span>
            </p>
            <p className="account-state-line">
              <Lightbulb size={14} aria-hidden="true" />
              <span>결정 {summary.counts.decisions}개</span>
            </p>
            <p className="account-state-note">
              「{view.session.title}」 세션에서 재구성된 항목 수입니다. 세션을 분석하면 이
              숫자가 갱신됩니다.
            </p>
          </section>

          <section className="account-local-note">
            <FolderClock size={14} aria-hidden="true" />
            <p>
              워크스페이스 데이터는 이 기기의 로컬 저장소에만 보관됩니다. 프로젝트와 세션은
              계정 백엔드 없이 외부로 전송되거나 동기화되지 않습니다.
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}
