import { Ban, KeyRound, Lock, ShieldCheck } from "lucide-react";
import { PageHeader } from "../../components/layout/PageHeader";
import { Button } from "../../components/ui/Button";
import { SectionHeader } from "../../components/ui/SectionHeader";
import { MoriStatusBadge } from "../../components/ui/MoriStatusBadge";
import { useMoriAppStore } from "../../app/store";

const LOCAL_MODE_POINTS = [
  "세션 기록 · Timeline · Evidence · Review · Project Memory 전부 사용 가능",
  "데이터는 이 기기의 브라우저 저장소(데스크톱 앱에서는 SQLite)에만 보관",
  "캡처는 항상 명시적이고, 메모리는 검토 후에만 저장",
];

const AUTH_DOES = [
  "Mori 계정에 신원(identity)을 확인합니다",
  "동기화 · 백업 · 팀 공유 같은 계정 기능을 켭니다",
];

const AUTH_DOES_NOT = [
  "Drive · Gmail · Calendar 등 외부 데이터를 읽지 않습니다",
  "브라우저 기록이나 다른 앱의 데이터를 읽지 않습니다",
  "외부 데이터 접근은 커넥터별로 따로 명시적으로 승인합니다",
];

const SIGN_IN_METHODS = [
  { id: "google", label: "Google" },
  { id: "github", label: "GitHub" },
  { id: "email", label: "이메일" },
];

/**
 * Login / Local-first entry.
 *
 * Mori never shows a login wall — it opens straight into Local Mode and
 * stays usable with no account. This screen exists so the local-first
 * choice is explicit: it explains what Local Mode already gives the
 * user, states the hard authentication ≠ data-access boundary, and
 * lists the planned sign-in methods. Reached from Account & Profile,
 * never as a gate.
 */
export function LoginView() {
  const setCurrentView = useMoriAppStore((state) => state.setCurrentView);

  return (
    <div className="page account-profile">
      <PageHeader
        title="로그인 · Local-first"
        subtitle="Mori는 계정 없이 바로 쓸 수 있습니다. 로그인은 선택이며, 신원 확인일 뿐 데이터 접근 권한이 아닙니다."
      />
      <div className="account-grid">
        <section className="account-main">
          <section className="settings-card" aria-label="Local mode">
            <header className="settings-card-head">
              <div>
                <h3>계정 없이 바로 시작</h3>
                <p>
                  지금 이미 Local Mode로 동작 중입니다. 계정을 만들지 않아도 Mori의 핵심 작업
                  흐름을 모두 사용할 수 있습니다.
                </p>
              </div>
              <MoriStatusBadge tone="success">사용 중</MoriStatusBadge>
            </header>
            <ul className="settings-trust-list tone-active">
              {LOCAL_MODE_POINTS.map((point) => (
                <li key={point}>
                  <ShieldCheck size={12} aria-hidden="true" />
                  <span>{point}</span>
                </li>
              ))}
            </ul>
            <div className="account-identity-actions">
              <Button variant="primary" onClick={() => setCurrentView("home")}>
                Local Mode로 계속
              </Button>
            </div>
          </section>

          <section className="settings-card" aria-label="Authentication boundary">
            <header className="settings-card-head">
              <div>
                <h3>로그인 ≠ 데이터 접근</h3>
                <p>
                  Mori 계정으로 로그인하더라도 외부 서비스의 데이터를 읽지 않습니다. 이 경계는
                  설정이 아니라 Mori의 설계입니다.
                </p>
              </div>
            </header>
            <SectionHeader title="로그인이 하는 것" />
            <ul className="settings-trust-list tone-active">
              {AUTH_DOES.map((line) => (
                <li key={line}>
                  <ShieldCheck size={12} aria-hidden="true" />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
            <SectionHeader title="로그인이 하지 않는 것" />
            <ul className="settings-privacy-never">
              {AUTH_DOES_NOT.map((line) => (
                <li key={line}>
                  <Ban size={13} aria-hidden="true" />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="settings-card" aria-label="Sign-in methods">
            <header className="settings-card-head">
              <div>
                <h3>로그인 방법</h3>
                <p>Mori 계정 백엔드가 도착하면 아래 방법으로 로그인할 수 있습니다.</p>
              </div>
            </header>
            <ul className="account-linked-list">
              {SIGN_IN_METHODS.map((method) => (
                <li key={method.id}>
                  <span className="account-linked-mark" aria-hidden="true">
                    {method.label.charAt(0)}
                  </span>
                  <div>
                    <strong>{method.label}로 로그인</strong>
                    <small>아직 사용할 수 없음</small>
                  </div>
                  <MoriStatusBadge status="planned">Planned</MoriStatusBadge>
                </li>
              ))}
            </ul>
          </section>
        </section>

        <aside className="account-rail" aria-label="Current mode">
          <section className="settings-card account-state-card">
            <header className="settings-card-head">
              <div>
                <h3>현재 모드</h3>
              </div>
              <MoriStatusBadge tone="neutral">로컬 모드</MoriStatusBadge>
            </header>
            <p className="account-state-line">
              <KeyRound size={14} aria-hidden="true" />
              <span>계정 없음</span>
            </p>
            <p className="account-state-note">
              Mori는 로그인 없이 열리고, 로그인 없이 끝까지 동작합니다. 계정은 여러 기기에서
              메모리를 잇고 싶을 때만 선택하세요.
            </p>
          </section>

          <section className="account-local-note">
            <Lock size={14} aria-hidden="true" />
            <p>
              로그인 백엔드는 아직 구현되지 않았습니다. 위 항목은 예정 상태로 표시되며, 어떤
              계정도 자동으로 연결되지 않습니다.
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}
