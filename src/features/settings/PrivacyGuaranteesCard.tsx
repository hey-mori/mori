import { Ban, ShieldCheck } from "lucide-react";
import { getPrivacyGuarantees } from "../../lib/settings/settingsStatus";
import { SettingsNotice, SettingsSection, StatusPill } from "./SettingsPrimitives";

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
    <SettingsSection
      title="Mori가 하지 않는 일"
      description="프로필, 가져온 소스, 리포지토리 경로, 리포트, 메모리는 기본으로 전송되지 않습니다."
      action={<StatusPill tone="green">기본 차단</StatusPill>}
    >
      <ul className="settings-privacy-never">
        {guarantees.map((line) => (
          <li key={line}>
            <Ban size={13} aria-hidden="true" />
            <span>{line}</span>
          </li>
        ))}
      </ul>
      <SettingsNotice icon={ShieldCheck} title="제공자 요청">
        Ollama를 선택한 경우에만 현재 세션 증거를 사용자가 입력한 endpoint로 보냅니다.
      </SettingsNotice>
    </SettingsSection>
  );
}
