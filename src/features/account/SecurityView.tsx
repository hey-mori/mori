import { useMemo } from "react";
import { Ban, Laptop, Lock, ShieldCheck } from "lucide-react";
import { PageHeader } from "../../components/layout/PageHeader";
import { Button } from "../../components/ui/Button";
import { MoriStatusBadge } from "../../components/ui/MoriStatusBadge";
import { useMoriAppStore } from "../../app/store";
import { isTauriRuntime } from "../../lib/desktop";
import {
  buildDeviceSecuritySummary,
  LOCAL_SECURITY_POINTS,
} from "../../lib/account/deviceSecurity";

const REMOTE_SESSION_PLANNED = [
  "다른 기기에서 로그인한 활성 세션 목록",
  "기기별 로그아웃 · 모든 기기에서 로그아웃",
  "새 기기 로그인 알림",
];

/**
 * Security & Device Sessions.
 *
 * Mori has no account backend, so there is no server-side session list
 * and no fleet of devices to revoke. This page is honest about that:
 * it shows the real runtime the data lives in, states the local
 * security boundary as architectural guarantees, and renders remote
 * session management as planned — not as an empty list. Reached from
 * Account & Profile, never as a gate.
 */
export function SecurityView() {
  const setCurrentView = useMoriAppStore((state) => state.setCurrentView);
  const summary = useMemo(
    () => buildDeviceSecuritySummary({ isDesktop: isTauriRuntime() }),
    [],
  );

  return (
    <div className="page account-profile">
      <PageHeader
        title="보안 · 기기 세션"
        subtitle="Mori는 계정 백엔드가 없어 서버에 보관되는 세션이 없습니다. 보안은 설정이 아니라 로컬 우선 설계 그 자체입니다."
      />
      <div className="account-grid">
        <section className="account-main">
          <section className="settings-card" aria-label="This device">
            <header className="settings-card-head">
              <div>
                <h3>이 기기</h3>
                <p>현재 이 기기에서 Mori가 동작하는 런타임과 데이터 저장 위치입니다.</p>
              </div>
              <MoriStatusBadge tone={summary.runtime.tone}>
                {summary.runtime.label}
              </MoriStatusBadge>
            </header>
            <p className="account-state-line">
              <Laptop size={14} aria-hidden="true" />
              <span>{summary.isDesktop ? "데스크톱 앱" : "브라우저"}</span>
            </p>
            <p className="account-state-note">{summary.runtime.description}</p>
          </section>

          <section className="settings-card" aria-label="Local security boundary">
            <header className="settings-card-head">
              <div>
                <h3>로컬 보안 경계</h3>
                <p>
                  아래 항목은 사용자가 찾아서 켜는 설정이 아니라, Mori의 구조가 항상
                  보장하는 내용입니다.
                </p>
              </div>
            </header>
            <ul className="settings-trust-list tone-active">
              {LOCAL_SECURITY_POINTS.map((point) => (
                <li key={point}>
                  <ShieldCheck size={12} aria-hidden="true" />
                  <span>{point}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="settings-card" aria-label="Remote session management">
            <header className="settings-card-head">
              <div>
                <h3>원격 세션 · 기기 관리</h3>
                <p>
                  지금은 관리할 원격 세션이 없습니다. 서버에 저장되는 것이 없기 때문이며,
                  비어 있는 것이 아니라 구조적으로 존재하지 않습니다.
                </p>
              </div>
              <MoriStatusBadge status="planned">Planned</MoriStatusBadge>
            </header>
            <ul className="settings-privacy-never">
              {REMOTE_SESSION_PLANNED.map((line) => (
                <li key={line}>
                  <Ban size={13} aria-hidden="true" />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
            <p className="account-linked-note">
              <ShieldCheck size={13} aria-hidden="true" />
              <span>
                위 기능은 Mori 계정 백엔드가 도착하면 함께 제공되며, 그때도 로컬 데이터
                접근 권한과는 별개입니다.
              </span>
            </p>
          </section>
        </section>

        <aside className="account-rail" aria-label="Security state">
          <section className="settings-card account-state-card">
            <header className="settings-card-head">
              <div>
                <h3>현재 상태</h3>
              </div>
              <MoriStatusBadge tone="neutral">로컬 모드</MoriStatusBadge>
            </header>
            <p className="account-state-line">
              <Laptop size={14} aria-hidden="true" />
              <span>{summary.runtime.label}</span>
            </p>
            <p className="account-state-line">
              <ShieldCheck size={14} aria-hidden="true" />
              <span>원격 세션 {summary.remoteSessionCount}개</span>
            </p>
            <p className="account-state-note">
              관리할 원격 세션이 없는 것은 Mori가 안전한 상태로 동작하고 있다는 의미입니다.
            </p>
            <div className="account-identity-actions">
              <Button onClick={() => setCurrentView("profile")}>
                계정 및 프로필로 돌아가기
              </Button>
            </div>
          </section>

          <section className="account-local-note">
            <Lock size={14} aria-hidden="true" />
            <p>
              계정 백엔드가 없으므로 자격 증명이나 세션 토큰이 외부에 저장되지 않습니다.
              로그인 방법은 계정 기능이 도착할 때 함께 구현됩니다.
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}
