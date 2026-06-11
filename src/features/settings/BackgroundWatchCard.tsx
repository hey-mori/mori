import { Radar } from "lucide-react";
import { InfoHint } from "../../components/ui/InfoHint";
import { isTauriRuntime } from "../../lib/desktop";
import { useBackgroundWatchStore } from "../../app/backgroundWatchStore";
import { PreferenceToggle, SettingsRow, SettingsSection } from "./SettingsPrimitives";

/**
 * 백그라운드 감지 — the opt-in for the connector-inbox watcher.
 *
 * Off by default. When on (desktop only), Mori watches the connected sources'
 * inbox while the app is open and surfaces newly-arrived agent work into the
 * notification feed for review. The "why / how" — local-only, review-gated, no
 * silent writes — lives in the InfoHint, not an always-visible paragraph
 * (copy-diet). Browser has no inbox, so the toggle reads as desktop-only there.
 */
export function BackgroundWatchCard() {
  const enabled = useBackgroundWatchStore((state) => state.settings.enabled);
  const autoAnalyze = useBackgroundWatchStore((state) => state.settings.autoAnalyze);
  const setEnabled = useBackgroundWatchStore((state) => state.setEnabled);
  const setAutoAnalyze = useBackgroundWatchStore((state) => state.setAutoAnalyze);
  const desktop = isTauriRuntime();

  return (
    <SettingsSection
      title="백그라운드 감지"
      action={
        <InfoHint align="end" label="백그라운드 감지 안내">
          앱이 켜져 있는 동안에만 동작하며, 연결된 소스의 inbox만 읽습니다. 기기
          밖으로 전송하지 않고, 감지된 작업은 자동으로 적용되지 않습니다. 검토 후
          가져오는 흐름은 그대로입니다.
        </InfoHint>
      }
    >
      <div className="settings-row-list">
        <SettingsRow
          label="새 작업 자동 감지"
          description={
            desktop
              ? "앱이 켜져 있는 동안 연결된 소스에 새 작업이 들어오면 알림으로 올립니다."
              : "데스크톱 앱에서 연결된 소스를 감시합니다. 브라우저에서는 동작하지 않습니다."
          }
          control={
            <PreferenceToggle
              label="새 작업 자동 감지"
              active={enabled}
              disabled={!desktop}
              onToggle={() => setEnabled(!enabled)}
            />
          }
        />
        {enabled ? (
          <>
            <SettingsRow
              label="자동 분석"
              description="새 작업이 감지되면 설정된 분석 엔진으로 바로 분석합니다. 결과는 검토 후 적용됩니다."
              control={
                <PreferenceToggle
                  label="자동 분석"
                  active={autoAnalyze}
                  onToggle={() => setAutoAnalyze(!autoAnalyze)}
                />
              }
            />
            <SettingsRow
              label="상태"
              meta={
                <span className="settings-row-meta-icon">
                  <Radar size={13} aria-hidden="true" />
                  {autoAnalyze ? "감시 중 · 자동 분석 켜짐" : "감시 중"}
                </span>
              }
            />
          </>
        ) : null}
      </div>
    </SettingsSection>
  );
}
