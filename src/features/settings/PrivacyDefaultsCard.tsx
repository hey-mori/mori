import { SettingsRow, SettingsSection } from "./SettingsPrimitives";
import { getPrivacyPolicy } from "../../lib/settings/settingsStatus";

/**
 * Privacy & Data Control — policy card.
 *
 * The privacy posture is baked into the app's architecture, not a set of
 * toggles. Rows render as one calm list: label + one-line detail, with no
 * state-grouping jargon and no per-row badges. Not-yet-built items are
 * dimmed and tagged "예정" so the list stays honest without shouting.
 */
export function PrivacyDefaultsCard() {
  const rows = getPrivacyPolicy();
  return (
    <SettingsSection
      title="데이터 흐름"
      description="세션과 소스는 이 기기에 저장됩니다. 외부 제공자는 사용자가 직접 설정한 경우에만 사용됩니다."
    >
      <div className="settings-row-list">
        {rows.map((row) => {
          const planned = row.state === "planned";
          return (
            <SettingsRow
              key={row.id}
              compact
              disabled={planned}
              label={row.label}
              description={row.detail}
              meta={planned ? <span className="settings-soft-tag">예정</span> : undefined}
            />
          );
        })}
      </div>
    </SettingsSection>
  );
}
