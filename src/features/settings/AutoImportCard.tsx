import { useEffect, useState } from "react";
import { Radio } from "lucide-react";
import { InfoHint } from "../../components/ui/InfoHint";
import { isTauriRuntime } from "../../lib/desktop";
import {
  AUTO_IMPORT_SETTINGS_CHANGED_EVENT,
  loadAutoImportSettings,
  saveAutoImportSettings,
} from "../../lib/session/autoImportSettings";
import { PreferenceToggle, SettingsRow, SettingsSection } from "./SettingsPrimitives";

/**
 * 세션 자동 수집 — the opt-out for continuous auto-import.
 *
 * On by default (desktop): connected agents' sessions are registered into the
 * 세션 workspace's 과거 list automatically and kept fresh, so the user never
 * hand-imports each one. The honest boundary — reads only connected agents'
 * logs, makes sessions visible but does NOT apply anything to durable memory
 * (the review gate still governs analyze→apply), and every registration is
 * reversible — lives in the InfoHint, not an always-visible paragraph.
 */
export function AutoImportCard() {
  const desktop = isTauriRuntime();
  const [enabled, setEnabled] = useState(() => loadAutoImportSettings().enabled);

  // Reflect changes made elsewhere (or in another tab).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const sync = () => setEnabled(loadAutoImportSettings().enabled);
    window.addEventListener(AUTO_IMPORT_SETTINGS_CHANGED_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(AUTO_IMPORT_SETTINGS_CHANGED_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const toggle = () => {
    const next = !enabled;
    setEnabled(next);
    saveAutoImportSettings({ enabled: next });
  };

  return (
    <SettingsSection
      title="세션 자동 수집"
      action={
        <InfoHint align="end" label="세션 자동 수집 안내">
          앱이 켜져 있는 동안, 연동한 에이전트(Claude · Codex · OpenCode 등)의
          세션을 자동으로 세션 목록에 등록하고 최신화합니다. 연동한 에이전트의
          로그만 읽으며, 목록에 보이게 할 뿐 메모리에는 자동으로 반영하지 않습니다.
          분석과 반영은 검토 후에만 이뤄집니다.
        </InfoHint>
      }
    >
      <div className="settings-row-list">
        <SettingsRow
          label="연동한 세션 자동 수집"
          description={
            desktop
              ? "새 세션과 이어진 작업이 세션 목록의 과거에 자동으로 쌓입니다. 새로 수집되면 알림으로 알려드립니다."
              : "데스크톱 앱에서 동작합니다. 브라우저에서는 세션 저장소에 접근할 수 없습니다."
          }
          control={
            <PreferenceToggle
              label="연동한 세션 자동 수집"
              active={enabled}
              disabled={!desktop}
              onToggle={toggle}
            />
          }
        />
        {enabled && desktop ? (
          <SettingsRow
            label="상태"
            meta={
              <span className="settings-row-meta-icon">
                <Radio size={13} aria-hidden="true" />
                자동 수집 켜짐
              </span>
            }
          />
        ) : null}
      </div>
    </SettingsSection>
  );
}
