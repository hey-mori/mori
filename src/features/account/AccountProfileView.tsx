import { useState } from "react";
import { Lock, Sparkles } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { useMoriProfileStore } from "../../app/profileStore";
import {
  getProfileInitials,
  normalizeDisplayName,
} from "../../lib/profile/localProfile";
import {
  LocalOnlyNotice,
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
  const profile = useMoriProfileStore((state) => state.profile);
  const setDisplayName = useMoriProfileStore((state) => state.setDisplayName);
  const [draftName, setDraftName] = useState(profile.displayName);

  const trimmed = normalizeDisplayName(draftName);
  const dirty = trimmed.length > 0 && trimmed !== profile.displayName;

  return (
    <div className="settings-content-stack account-profile">
      <SettingsSection
        title="Local profile"
        eyebrow="Profile"
        description="A display name for this device. No Mori account, login, billing, or cloud identity exists today."
        action={<StatusPill tone="green">Local only</StatusPill>}
      >
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
      </SettingsSection>
      <SettingsSection
        title="Identity and sync"
        description="This is a product seam for future account or sync work. It is intentionally disabled until Mori has an explicit cloud design."
        action={<StatusPill tone="gray">Not connected</StatusPill>}
      >
        <div className="settings-row-list">
          <SettingsRow
            label="Account"
            description="No account backend is configured in Mori."
            meta={<StatusPill tone="gray">Unavailable</StatusPill>}
            disabled
          />
          <SettingsRow
            label="Sync"
            description="Profile and workspace data stay on this device."
            meta={<StatusPill tone="gray">Future opt-in only</StatusPill>}
            disabled
          />
        </div>
        <LocalOnlyNotice icon={Lock} title="What is stored">
          Mori stores the display name and initials in this device's browser storage.
          It is never used to prove identity to a server.
        </LocalOnlyNotice>
        <LocalOnlyNotice icon={Sparkles} title="Future account work">
          If sync arrives later, this surface should ask for explicit sign-in and clearly
          show what would leave the device before anything is sent.
        </LocalOnlyNotice>
      </SettingsSection>
    </div>
  );
}
