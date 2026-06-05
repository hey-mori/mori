import { Check } from "lucide-react";
import { useSessionStore } from "../../app/sessionStore";
import {
  DISCLOSURE_LABELS,
  DISCLOSURE_LEVELS,
  type DisclosureLevel,
} from "../../lib/disclosure";
import { SettingsSection } from "./SettingsPrimitives";

/** Compact, single-line descriptions for the settings radio (the canonical
 *  DISCLOSURE_DESCRIPTIONS read long here). */
const SHORT_DESC: Record<DisclosureLevel, string> = {
  raw: "가져온 원문을 그대로 표시",
  summary: "핵심만 요약하고 원문은 감춤",
  abstract: "요청 종류만 표시하고 내용은 감춤",
  hidden: "표시하지 않음 (저장은 그대로 유지)",
};

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
      description="내가 보낸 요청 메시지를 상세 보기에서 어떻게 표시할지 정합니다. 데이터는 항상 그대로 저장되고 표시 방식만 바뀝니다."
    >
      <div className="settings-disclosure-list" role="radiogroup" aria-label="표시 수준">
        {DISCLOSURE_LEVELS.map((option) => {
          const selected = option === level;
          return (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={selected}
              className={`settings-disclosure-option${selected ? " is-selected" : ""}`}
              onClick={() => updateAnalysisSettings({ requestDisclosureLevel: option })}
            >
              <span className="settings-disclosure-option-text">
                <strong>{DISCLOSURE_LABELS[option]}</strong>
                <small>{SHORT_DESC[option]}</small>
              </span>
              {selected ? <Check size={15} aria-hidden="true" /> : null}
            </button>
          );
        })}
      </div>
    </SettingsSection>
  );
}
