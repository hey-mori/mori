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
  enforced: "Guaranteed now",
  default: "Current defaults",
  planned: "Planned controls",
};

const GROUP_NOTE: Record<PrivacyPolicyRow["state"], string> = {
  enforced: "These are product boundaries, not toggles.",
  default: "These settings are available in the relevant workflow.",
  planned: "Shown for direction only; these controls do not run yet.",
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
          <h3>Privacy and data flow</h3>
          <p>
            Mori stores local profile, sessions, imports, analysis results, repository settings,
            and reports on this device. Data leaves the device only after you configure and select
            a provider endpoint.
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
