import { useState } from "react";
import { Lock } from "lucide-react";
import { PageHeader } from "../../components/layout/PageHeader";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { useMoriProfileStore } from "../../app/profileStore";
import {
  getProfileInitials,
  normalizeDisplayName,
} from "../../lib/profile/localProfile";

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
  const profile = useMoriProfileStore((state) => state.profile);
  const setDisplayName = useMoriProfileStore((state) => state.setDisplayName);
  const [draftName, setDraftName] = useState(profile.displayName);

  const trimmed = normalizeDisplayName(draftName);
  const dirty = trimmed.length > 0 && trimmed !== profile.displayName;

  return (
    <div className="page account-profile">
      <PageHeader
        title="프로필"
        subtitle="Mori의 신원은 이 기기에 저장되는 로컬 프로필 하나뿐입니다. 계정도, 로그인도, 서버도 없습니다."
      />
      <section className="settings-card account-identity" aria-label="Local profile">
        <header className="settings-card-head">
          <div>
            <h3>로컬 프로필</h3>
            <p>이 기기에만 저장되는 표시 이름입니다. 서버로 전송되지 않습니다.</p>
          </div>
          <Badge tone="purple">로컬 모드</Badge>
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
        <p className="account-local-note">
          <Lock size={14} aria-hidden="true" />
          <span>
            프로필은 이 기기의 브라우저 저장소에만 보관됩니다. 계정 백엔드가 없으므로 외부로
            전송되거나 동기화되지 않습니다.
          </span>
        </p>
      </section>
    </div>
  );
}
