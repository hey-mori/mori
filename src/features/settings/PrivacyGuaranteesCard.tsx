import { Ban, ShieldCheck } from "lucide-react";
import { getPrivacyGuarantees } from "../../lib/settings/settingsStatus";

/**
 * Privacy & Data Control — the hard "what Mori never does" guarantees.
 *
 * These are not user settings; they are properties of Mori's design
 * (`docs/mori-project-goal.md` §6 / §14). The card states them plainly
 * so the privacy surface answers "what is Mori NOT doing" directly,
 * not only "what policy is on".
 */
export function PrivacyGuaranteesCard() {
  const guarantees = getPrivacyGuarantees();
  return (
    <section className="settings-card settings-privacy-guarantees" aria-label="Privacy guarantees">
      <header className="settings-card-head">
        <div>
          <h3>What never leaves by default</h3>
          <p>
            Mori does not send profile data, imports, repository paths, reports, or memory
            anywhere by default.
          </p>
        </div>
      </header>
      <ul className="settings-privacy-never">
        {guarantees.map((line) => (
          <li key={line}>
            <Ban size={13} aria-hidden="true" />
            <span>{line}</span>
          </li>
        ))}
      </ul>
      <footer className="settings-privacy-never-foot">
        <ShieldCheck size={13} aria-hidden="true" />
        <span>
          Provider requests are explicit: if you select Ollama, Mori sends the current session
          evidence only to the endpoint you entered.
        </span>
      </footer>
    </section>
  );
}
