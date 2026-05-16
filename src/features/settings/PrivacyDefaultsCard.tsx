import { Lock, ShieldCheck, Sparkles } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Badge } from "../../components/ui/Badge";
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
  enforced: "아키텍처 보장",
  default: "기본값",
  planned: "예정",
};

const STATE_ICON: Record<PrivacyPolicyRow["state"], LucideIcon> = {
  enforced: ShieldCheck,
  default: Lock,
  planned: Sparkles,
};

const GROUP_TITLE: Record<PrivacyPolicyRow["state"], string> = {
  enforced: "아키텍처로 보장되는 동작",
  default: "기본값으로 켜진 정책",
  planned: "예정된 정책",
};

const GROUP_NOTE: Record<PrivacyPolicyRow["state"], string> = {
  enforced: "코드 차원에서 보장되며 사용자가 끌 수 있는 설정이 아닙니다.",
  default: "현재 세션 설정에서 기본으로 켜져 있습니다.",
  planned: "설계되었지만 아직 동작하지 않습니다.",
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
    <section className="settings-card" aria-label="Privacy and data policy">
      <header className="settings-card-head">
        <div>
          <h3>개인정보 · 데이터 정책</h3>
          <p>
            Mori의 개인정보 posture는 사용자가 토글하는 설정이 아니라 앱 아키텍처에 baked-in 되어
            있습니다. 아래 항목은 상태 카드이며, "아키텍처 보장"은 코드 차원에서 보장되는 동작입니다.
          </p>
        </div>
      </header>
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
            <ul className="settings-privacy-list">
              {rows.map((row) => {
                const Icon = STATE_ICON[row.state];
                return (
                  <li key={row.id}>
                    <span className={`settings-privacy-icon tone-${STATE_TONE[row.state]}`}>
                      <Icon size={14} aria-hidden="true" />
                    </span>
                    <div>
                      <strong>{row.label}</strong>
                      <p>{row.detail}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </section>
  );
}
