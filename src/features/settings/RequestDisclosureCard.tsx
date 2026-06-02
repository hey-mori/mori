import { useSessionStore } from "../../app/sessionStore";
import {
  DISCLOSURE_DESCRIPTIONS,
  DISCLOSURE_LABELS,
  DISCLOSURE_LEVELS,
} from "../../lib/disclosure";
import {
  SettingsOption,
  SettingsOptionGroup,
  SettingsSection,
  StatusPill,
} from "./SettingsPrimitives";

/**
 * Privacy & Data Control — request disclosure level.
 *
 * The canonical home for the "store everything, show by setting" choice:
 * how a user's own request messages are rendered in detail views. The
 * same persisted `requestDisclosureLevel` backs the inline control in the
 * Event Inspector, so the two stay in lockstep. Storage is unaffected,
 * only the projection changes.
 */
export function RequestDisclosureCard() {
  const level = useSessionStore((state) => state.analysisSettings.requestDisclosureLevel);
  const updateAnalysisSettings = useSessionStore((state) => state.updateAnalysisSettings);

  return (
    <SettingsSection
      title="내 요청 표시 수준"
      description="대화에서 내가 보낸 요청 메시지를 상세 보기에서 어떻게 표시할지 정합니다. 데이터는 항상 그대로 저장되고, 표시 방식만 바뀝니다."
      action={<StatusPill tone="green">기본 로컬</StatusPill>}
    >
      <SettingsOptionGroup label="표시 수준" columns="single">
        {DISCLOSURE_LEVELS.map((option) => (
          <SettingsOption
            key={option}
            selected={option === level}
            label={DISCLOSURE_LABELS[option]}
            description={DISCLOSURE_DESCRIPTIONS[option]}
            onClick={() => updateAnalysisSettings({ requestDisclosureLevel: option })}
          />
        ))}
      </SettingsOptionGroup>
    </SettingsSection>
  );
}
