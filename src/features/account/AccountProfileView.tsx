import { useEffect, useState } from "react";
import { RotateCcw } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { useProfileStore } from "../../app/profileStore";
import {
  getProfileInitials,
  normalizeDisplayName,
} from "../../lib/profile/localProfile";
import {
  SettingsInlineAction,
  SettingsSection,
} from "../settings/SettingsPrimitives";

/**
 * Profile.
 *
 * Mori is local-first and has no account backend, so this surface is just
 * the real local profile: a display name held in this device's browser
 * storage. There is no login, no plan, no billing, and no linked sign-in
 * methods. The profile never leaves the device and never proves identity
 * to any server. See `docs/account-profile-settings-references.md` §2.
 */
export function AccountProfileView() {
  const initialized = useProfileStore((state) => state.initialized);
  const hydrate = useProfileStore((state) => state.hydrate);
  const profile = useProfileStore((state) => state.profile);
  const setDisplayName = useProfileStore((state) => state.setDisplayName);
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
        title="프로필"
        description="이름과 이니셜은 이 기기에서 Mori를 표시하는 데만 쓰입니다. 계정, 결제, 동기화 신원으로는 사용되지 않습니다."
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
              >
                <RotateCcw size={13} aria-hidden="true" />
                되돌리기
              </SettingsInlineAction>
            </div>
          </div>
        </div>
        <p className="account-sync-note">
          계정과 동기화는 예정입니다. 지금은 로그인 없이 이 기기에서만 동작합니다.
        </p>
      </SettingsSection>
    </div>
  );
}
