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
          <h3>Mori가 절대 하지 않는 것</h3>
          <p>
            아래 동작은 설정 항목이 아니라 Mori의 설계 자체입니다. 어떤 세션 상태에서도
            일어나지 않습니다.
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
          캡처는 항상 명시적이고, 메모리는 검토 후에만 저장됩니다. 데이터는 이 기기를 벗어나지
          않습니다.
        </span>
      </footer>
    </section>
  );
}
