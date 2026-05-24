import { Lock, ShieldCheck, Sparkles } from "lucide-react";
import type { LucideIcon } from "lucide-react";
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

const STATE_ICON: Record<PrivacyPolicyRow["state"], LucideIcon> = {
  enforced: ShieldCheck,
  default: Lock,
  planned: Sparkles,
};

const GROUP_TITLE: Record<PrivacyPolicyRow["state"], string> = {
  enforced: "항상 지키는 경계",
  default: "현재 기본값",
  planned: "준비 중인 제어",
};

const GROUP_NOTE: Record<PrivacyPolicyRow["state"], string> = {
  enforced: "토글이 아니라 제품 동작입니다.",
  default: "관련 워크플로에서 명시적으로 선택합니다.",
  planned: "방향만 표시하며 아직 실행되지 않습니다.",
};

/**
 * Privacy & Data Control — policy card.
 *
 * The privacy posture is baked into the app's architecture, not a set of
 * toggles. Rows are grouped by state so the surface clearly separates
 * code-guaranteed behaviour from default-on policy from planned controls.
 */
export function PrivacyDefaultsCard() {
  const groups = groupPrivacyPolicyByState();
  const order: PrivacyPolicyRow["state"][] = ["enforced", "default", "planned"];
  return (
    <SettingsSection
      title="데이터 흐름"
      eyebrow="Local-first"
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
            <p className="settings-privacy-group-note">{GROUP_NOTE[state]}</p>
            <div className="settings-row-list">
              {rows.map((row) => {
                const Icon = STATE_ICON[row.state];
                return (
                  <SettingsRow
                    key={row.id}
                    label={row.label}
                    description={row.detail}
                    meta={
                      <>
                        <span className={`settings-privacy-icon tone-${STATE_TONE[row.state]}`}>
                          <Icon size={13} aria-hidden="true" />
                        </span>
                        <StatusPill tone={STATE_TONE[row.state]}>{STATE_LABEL[row.state]}</StatusPill>
                      </>
                    }
                  />
                );
              })}
            </div>
          </section>
        );
      })}
    </SettingsSection>
  );
}
