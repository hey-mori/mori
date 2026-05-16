import { useState } from "react";
import { Lock, ShieldCheck, UserRound } from "lucide-react";
import { PageHeader } from "../../components/layout/PageHeader";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { MoriStatusBadge } from "../../components/ui/MoriStatusBadge";
import { useMoriProfileStore } from "../../app/profileStore";
import { useMoriAppStore } from "../../app/store";
import {
  getProfileInitials,
  normalizeDisplayName,
} from "../../lib/profile/localProfile";

const LINKED_ACCOUNTS = [
  { id: "google", label: "Google" },
  { id: "github", label: "GitHub" },
  { id: "email", label: "이메일" },
];

/**
 * Account & Profile.
 *
 * Mori's default identity is a local profile — a display name held in
 * browser localStorage. This page makes that profile real and editable
 * and renders the optional Mori Account, plan, and linked sign-in
 * methods as honestly planned: a linked account would be identity only,
 * never data access. See `docs/account-profile-settings-references.md`.
 */
export function AccountProfileView() {
  const profile = useMoriProfileStore((state) => state.profile);
  const setDisplayName = useMoriProfileStore((state) => state.setDisplayName);
  const setCurrentView = useMoriAppStore((state) => state.setCurrentView);
  const [draftName, setDraftName] = useState(profile.displayName);

  const trimmed = normalizeDisplayName(draftName);
  const dirty = trimmed.length > 0 && trimmed !== profile.displayName;

  return (
    <div className="page account-profile">
      <PageHeader
        title="계정 및 프로필"
        subtitle="Mori의 기본 신원은 이 기기에 저장되는 로컬 프로필입니다. Mori 계정은 항상 선택 사항이며, 로그인은 신원 확인일 뿐 데이터 접근 권한이 아닙니다."
      />
      <div className="account-grid">
        <section className="account-main">
          <section className="settings-card account-identity" aria-label="Local profile">
            <header className="settings-card-head">
              <div>
                <h3>로컬 프로필</h3>
                <p>이 기기에만 저장되는 표시 이름입니다. 서버로 전송되지 않습니다.</p>
              </div>
              <Badge tone="purple">Local Profile</Badge>
            </header>
            <div className="account-identity-row">
              <span className="account-avatar" aria-hidden="true">
                {getProfileInitials(profile.displayName)}
              </span>
              <label className="account-name-field">
                표시 이름
                <input
                  value={draftName}
                  maxLength={60}
                  onChange={(event) => setDraftName(event.target.value)}
                  aria-label="표시 이름"
                />
              </label>
            </div>
            <div className="account-identity-actions">
              <Button
                variant="primary"
                disabled={!dirty}
                onClick={() => setDisplayName(trimmed)}
              >
                이름 저장
              </Button>
              {dirty ? (
                <button
                  type="button"
                  className="account-reset"
                  onClick={() => setDraftName(profile.displayName)}
                >
                  되돌리기
                </button>
              ) : null}
            </div>
          </section>

          <section className="settings-card account-linked" aria-label="Linked sign-in methods">
            <header className="settings-card-head">
              <div>
                <h3>로그인 방법</h3>
                <p>
                  Mori 계정이 도착하면 아래 방법으로 로그인할 수 있습니다. 로그인은 신원 확인일
                  뿐이며, Drive · Gmail · 브라우저 기록 같은 외부 데이터에 접근하지 않습니다.
                </p>
              </div>
            </header>
            <ul className="account-linked-list">
              {LINKED_ACCOUNTS.map((account) => (
                <li key={account.id}>
                  <span className="account-linked-mark" aria-hidden="true">
                    {account.label.charAt(0)}
                  </span>
                  <div>
                    <strong>{account.label}</strong>
                    <small>연결 안 됨</small>
                  </div>
                  <MoriStatusBadge status="planned">Planned</MoriStatusBadge>
                </li>
              ))}
            </ul>
            <p className="account-linked-note">
              <ShieldCheck size={13} aria-hidden="true" />
              <span>
                외부 앱의 데이터 접근은 로그인과 별개이며, 커넥터별로 따로 명시적으로 승인합니다.
              </span>
            </p>
            <div className="account-identity-actions">
              <Button onClick={() => setCurrentView("login")}>로그인 옵션 살펴보기</Button>
              <Button onClick={() => setCurrentView("security")}>보안 및 기기 세션</Button>
            </div>
          </section>
        </section>

        <aside className="account-rail" aria-label="Account state">
          <section className="settings-card account-state-card">
            <header className="settings-card-head">
              <div>
                <h3>Mori 계정</h3>
              </div>
              <MoriStatusBadge tone="neutral">로컬 모드</MoriStatusBadge>
            </header>
            <p className="account-state-line">
              <UserRound size={14} aria-hidden="true" />
              <span>{profile.displayName}</span>
            </p>
            <p className="account-state-note">
              지금은 계정 없이 로컬 모드로 동작합니다. Mori 계정은 동기화 · 백업 · 팀 공유를 위한
              선택 기능이며, 핵심 작업에는 필요하지 않습니다.
            </p>
          </section>

          <section className="settings-card account-plan-card">
            <header className="settings-card-head">
              <div>
                <h3>플랜</h3>
              </div>
              <MoriStatusBadge status="planned">Planned</MoriStatusBadge>
            </header>
            <p className="account-state-note">
              플랜과 결제는 Mori 계정과 함께 도착하는 예정 기능입니다. 로컬 모드의 모든 기능은
              플랜과 무관하게 계속 사용할 수 있습니다.
            </p>
          </section>

          <section className="account-local-note">
            <Lock size={14} aria-hidden="true" />
            <p>
              프로필은 이 기기의 브라우저 저장소에만 보관됩니다. 계정 백엔드가 없으므로 외부로
              전송되거나 동기화되지 않습니다.
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}
