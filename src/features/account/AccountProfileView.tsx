import { useEffect, useState } from "react";
import { Lock, RotateCcw } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { useMoriProfileStore } from "../../app/profileStore";
import {
  getProfileInitials,
  normalizeDisplayName,
} from "../../lib/profile/localProfile";
import {
  SettingsInlineAction,
  SettingsNotice,
  SettingsRow,
  SettingsSection,
  StatusPill,
} from "../settings/SettingsPrimitives";

/**
 * Profile.
 *
 * Mori is local-first and has no account backend, so this surface is just
 * the real local profile: a display name held in this device's browser
 * storage. There is no login, no plan, no billing, and no linked sign-in
 * methods — the profile never leaves the device and never proves identity
 * to any server. See `docs/account-profile-settings-references.md` §2.
 */
export function AccountProfileView() {
  const initialized = useMoriProfileStore((state) => state.initialized);
  const hydrate = useMoriProfileStore((state) => state.hydrate);
  const profile = useMoriProfileStore((state) => state.profile);
  const setDisplayName = useMoriProfileStore((state) => state.setDisplayName);
  const [draftName, setDraftName] = useState(profile.displayName);

  useEffect(() => {
    if (!initialized) hydrate();
  }, [hydrate, initialized]);

  useEffect(() => {
    setDraftName(profile.displayName);
  }, [profile.displayName]);

  const trimmed = normalizeDisplayName(draftName);
  const dirty = trimmed.length > 0 && trimmed !== profile.displayName;

  return (
    <div className="settings-content-stack account-profile">
      <SettingsSection
        title="로컬 프로필"
        description="이름과 이니셜은 이 기기에서 Mori를 표시하는 데만 사용됩니다."
        action={<StatusPill tone="green">로컬 전용</StatusPill>}
      >
        <div className="account-identity-row">
          <span className="account-avatar" aria-hidden="true">
            {getProfileInitials(profile.displayName)}
          </span>
          <div className="account-identity-main">
            <label className="account-name-field">
              표시 이름
              <input
                value={draftName}
                maxLength={60}
                onChange={(event) => setDraftName(event.target.value)}
                aria-label="표시 이름"
              />
            </label>
            <div className="account-identity-actions">
              <Button
                variant="primary"
                disabled={!dirty}
                onClick={() => setDisplayName(trimmed)}
              >
                저장
              </Button>
              <SettingsInlineAction
                disabled={!dirty}
                onClick={() => setDraftName(profile.displayName)}
                title="저장하지 않은 이름 변경을 되돌립니다."
              >
                <RotateCcw size={13} aria-hidden="true" />
                되돌리기
              </SettingsInlineAction>
            </div>
          </div>
        </div>
        <div className="settings-row-list">
          <SettingsRow
            compact
            label="프로필 범위"
            description="계정, 결제, 동기화 신원으로 쓰이지 않습니다."
            meta={<StatusPill tone="green">이 기기</StatusPill>}
          />
          <SettingsRow
            compact
            label="저장 위치"
            description="브라우저 localStorage 또는 데스크톱 fallback 저장소에 남습니다."
            meta={<StatusPill tone="blue">로컬 설정</StatusPill>}
          />
        </div>
      </SettingsSection>
      <SettingsSection
        title="계정과 동기화"
        description="Mori Account는 아직 구현되지 않았습니다. 이 화면은 로컬 모드의 경계를 명확히 보여줍니다."
        action={<StatusPill tone="green">로그인 없이 열림</StatusPill>}
      >
        <div className="settings-row-list">
          <SettingsRow
            compact
            label="Mori Account"
            meta={<StatusPill tone="gray">예정</StatusPill>}
            disabled
          />
          <SettingsRow
            compact
            label="동기화"
            meta={<StatusPill tone="gray">비활성</StatusPill>}
            disabled
          />
        </div>
        <SettingsNotice icon={Lock} title="동기화가 생겨도 먼저 보여주고 켭니다" tone="success">
          지금은 로그인·플랜·결제·팀 권한이 없고, 프로필과 작업 데이터는 이 기기에만 남습니다.
          동기화가 추가되면 전송 대상과 데이터를 먼저 보여준 뒤 사용자가 직접 켜는 명시적 opt-in으로만 동작합니다.
        </SettingsNotice>
      </SettingsSection>
    </div>
  );
}
