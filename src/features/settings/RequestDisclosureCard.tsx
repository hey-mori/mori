import { useSessionStore } from "../../app/sessionStore";
import { SegmentedControl } from "../../components/ui/SegmentedControl";
import {
  DISCLOSURE_LABELS,
  DISCLOSURE_LEVELS,
  type DisclosureLevel,
} from "../../lib/disclosure";
import { SettingsSection } from "./SettingsPrimitives";

/** One-line meaning shown under the selected level. */
const LEVEL_DESC: Record<DisclosureLevel, string> = {
  raw: "가져온 요청 원문을 그대로 보여줍니다.",
  summary: "핵심만 요약해 보여주고 원문은 감춥니다.",
  abstract: "요청의 종류만 보여주고 구체적인 내용은 감춥니다.",
  hidden: "상세 보기에 표시하지 않습니다. 데이터는 그대로 저장됩니다.",
};

/**
 * Privacy & Data Control — request disclosure level.
 *
 * How a user's own request messages render in detail views. The four levels
 * form a privacy gradient (보임 → 비공개), so a single segmented control with
 * the selected level's meaning underneath reads better than a grid of cards.
 * Storage is unaffected; only the projection changes. The same persisted
 * `requestDisclosureLevel` backs the inline control in the Event Inspector.
 */
export function RequestDisclosureCard() {
  const level = useSessionStore((state) => state.analysisSettings.requestDisclosureLevel);
  const updateAnalysisSettings = useSessionStore((state) => state.updateAnalysisSettings);

  return (
    <SettingsSection
      title="내 요청 표시 수준"
      description="내가 보낸 요청 메시지를 상세 보기에서 어떻게 표시할지 정합니다. 데이터는 항상 그대로 저장되고 표시 방식만 바뀝니다."
    >
      <div className="settings-disclosure">
        <SegmentedControl
          ariaLabel="요청 표시 수준"
          role="radiogroup"
          value={level}
          onChange={(next) => updateAnalysisSettings({ requestDisclosureLevel: next })}
          options={DISCLOSURE_LEVELS.map((option) => ({
            id: option,
            label: DISCLOSURE_LABELS[option],
          }))}
        />
        <div className="settings-disclosure-scale" aria-hidden="true">
          <span>더 많이 보임</span>
          <span>더 비공개</span>
        </div>
        <p className="settings-disclosure-desc">{LEVEL_DESC[level]}</p>
      </div>
    </SettingsSection>
  );
}
