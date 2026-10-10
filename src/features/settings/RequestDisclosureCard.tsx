import { useSessionStore } from "../../app/sessionStore";
import { SegmentedControl } from "../../components/ui/SegmentedControl";
import {
  DISCLOSURE_LABELS,
  DISCLOSURE_LEVELS,
  type DisclosureLevel,
} from "../../lib/disclosure";
import { SettingsSection } from "./SettingsPrimitives";
import { InfoHint } from "../../components/ui/InfoHint";

/** One-line meaning shown under the selected level. */
const LEVEL_DESC: Record<DisclosureLevel, string> = {
  raw: "가져온 요청 원문을 그대로 보여줍니다.",
  summary: "핵심만 요약해 보여주고 원문은 감춥니다.",
  abstract: "요청의 종류만 보여주고 구체적인 내용은 감춥니다.",
  hidden: "화면에 보이는 요청 내용을 가립니다.",
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
    <SettingsSection title="내 요청 표시 수준">
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
        <p className="settings-disclosure-desc">
          {LEVEL_DESC[level]}
          <InfoHint label="이 설정이 바꾸는 것">
            화면에 보이는 방식만 바꿉니다. 저장된 데이터와 원본 대화 보기는 그대로이고, 암호화하거나 지우지
            않습니다. 보고서는 이 설정을 따르지만, .mori 내보내기와 백업에는 원본이 그대로 담깁니다.
          </InfoHint>
        </p>
      </div>
    </SettingsSection>
  );
}
