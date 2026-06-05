import { Badge } from "../../components/ui/Badge";
import { SettingsRow, SettingsSection, StatusPill } from "./SettingsPrimitives";
import {
  groupPrivacyPolicyByState,
  type PrivacyPolicyRow,
} from "../../lib/settings/settingsStatus";

const STATE_TONE: Record<PrivacyPolicyRow["state"], "green" | "blue" | "gray"> = {
  enforced: "green",
  default: "blue",
  planned: "gray",
};

const STATE_LABEL: Record<PrivacyPolicyRow["state"], string> = {
  enforced: "보장",
  default: "기본값",
  planned: "예정",
};

const GROUP_TITLE: Record<PrivacyPolicyRow["state"], string> = {
  enforced: "항상 지키는 경계",
  default: "현재 기본값",
  planned: "준비 중",
};

/**
 * Privacy & Data Control — policy card.
 *
 * The privacy posture is baked into the app's architecture, not a set of
 * toggles. Rows are grouped by state; the group header carries the single
 * state badge, so each row stays a calm label + one-line detail with no
 * redundant per-row chips.
 */
export function PrivacyDefaultsCard() {
  const groups = groupPrivacyPolicyByState();
  const order: PrivacyPolicyRow["state"][] = ["enforced", "default", "planned"];
  return (
    <SettingsSection
      title="데이터 흐름"
      description="세션과 소스는 이 기기에 저장됩니다. 외부 제공자는 사용자가 직접 설정한 경우에만 사용됩니다."
      action={<StatusPill tone="green">기본 로컬</StatusPill>}
    >
      {order.map((state) => {
        const rows = groups[state];
        if (rows.length === 0) return null;
        return (
          <section key={state} className="settings-privacy-group">
            <header className="settings-privacy-group-head">
              <h4>{GROUP_TITLE[state]}</h4>
              <Badge tone={STATE_TONE[state]}>{STATE_LABEL[state]}</Badge>
            </header>
            <div className="settings-row-list">
              {rows.map((row) => (
                <SettingsRow
                  key={row.id}
                  compact
                  label={row.label}
                  description={row.detail}
                />
              ))}
            </div>
          </section>
        );
      })}
    </SettingsSection>
  );
}
