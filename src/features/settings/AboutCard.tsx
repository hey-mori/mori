import { getVersion } from "@tauri-apps/api/app";
import { useEffect, useMemo, useState } from "react";
import { isTauriRuntime } from "../../lib/desktop";
import type { RuntimeMode } from "../../lib/settings/settingsStatus";
import { SettingsRow, SettingsSection } from "./SettingsPrimitives";

const FALLBACK_APP_VERSION = "0.1.0";
const UPDATE_CHANNEL = "stable";

type VersionState =
  | { status: "loading"; version: string }
  | { status: "ready"; version: string }
  | { status: "error"; version: string; message: string };

export function AboutCard({
  mode,
  sqliteSessionCount,
}: {
  mode: RuntimeMode;
  sqliteSessionCount: number;
}) {
  const desktopRuntime = useMemo(() => isTauriRuntime(), []);
  const [version, setVersion] = useState<VersionState>({
    status: "loading",
    version: FALLBACK_APP_VERSION,
  });

  useEffect(() => {
    let cancelled = false;
    if (!desktopRuntime) {
      setVersion({ status: "ready", version: FALLBACK_APP_VERSION });
      return;
    }
    getVersion()
      .then((appVersion) => {
        if (!cancelled) setVersion({ status: "ready", version: appVersion });
      })
      .catch((error) => {
        if (!cancelled) {
          setVersion({
            status: "error",
            version: FALLBACK_APP_VERSION,
            message: error instanceof Error ? error.message : String(error),
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [desktopRuntime]);

  return (
    <div className="settings-content-stack settings-about">
      <SettingsSection title="정보">
        <div className="settings-about-grid">
          <SettingsRow
            compact
            label="버전"
            meta={<span className="settings-about-meta">{version.version}</span>}
          />
          <SettingsRow
            compact
            label="업데이트"
            meta={<span className="settings-about-meta">{UPDATE_CHANNEL}</span>}
          />
          <SettingsRow
            compact
            label="데이터"
            meta={
              <span className="settings-about-meta">
                저장된 세션 {sqliteSessionCount}개
              </span>
            }
          />
          <SettingsRow
            compact
            label="실행 환경"
            meta={
              <span className="settings-about-meta">
                {mode === "tauri-desktop" ? "Desktop" : "Browser"}
              </span>
            }
          />
        </div>
      </SettingsSection>
    </div>
  );
}
