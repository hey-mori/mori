import { Lock, ShieldCheck, Sparkles } from "lucide-react";
import { Badge } from "../../components/ui/Badge";
import { getPrivacyPolicy, type PrivacyPolicyRow } from "../../lib/settings/settingsStatus";

const STATE_TONE: Record<PrivacyPolicyRow["state"], "green" | "blue" | "gray"> = {
  enforced: "green",
  default: "blue",
  planned: "gray",
};

const STATE_LABEL: Record<PrivacyPolicyRow["state"], string> = {
  enforced: "Enforced",
  default: "Default on",
  planned: "Planned",
};

const STATE_ICON: Record<PrivacyPolicyRow["state"], typeof ShieldCheck> = {
  enforced: ShieldCheck,
  default: Lock,
  planned: Sparkles,
};

export function PrivacyDefaultsCard() {
  const policy = getPrivacyPolicy();
  return (
    <section className="settings-card" aria-label="Privacy defaults">
      <header className="settings-card-head">
        <div>
          <h3>Privacy Defaults</h3>
          <p>
            Mori의 개인정보 posture는 사용자가 토글하는 설정이 아니라 앱 아키텍처에 baked-in 되어 있습니다.
            아래 항목은 status 카드이며, "Enforced"는 코드 차원에서 보장되는 동작입니다.
          </p>
        </div>
      </header>
      <ul className="settings-privacy-list">
        {policy.map((row) => {
          const Icon = STATE_ICON[row.state];
          return (
            <li key={row.id}>
              <span className={`settings-privacy-icon tone-${STATE_TONE[row.state]}`}>
                <Icon size={14} aria-hidden="true" />
              </span>
              <div>
                <header>
                  <strong>{row.label}</strong>
                  <Badge tone={STATE_TONE[row.state]}>{STATE_LABEL[row.state]}</Badge>
                </header>
                <p>{row.detail}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
