import { useEffect, useMemo, useState } from "react";
import { FolderCog } from "lucide-react";
import { isTauriRuntime, tauriCommands } from "../../lib/desktop";
import { SettingsRow, SettingsSection } from "./SettingsPrimitives";

type StoragePathState =
  | { status: "idle" | "loading"; path: string | null }
  | { status: "ready"; path: string }
  | { status: "error"; path: string | null; message: string };

export function StorageCard() {
  const [storagePath, setStoragePath] = useState<StoragePathState>({
    status: "idle",
    path: null,
  });

  useEffect(() => {
    if (!isTauriRuntime()) return;
    let cancelled = false;
    setStoragePath({ status: "loading", path: null });
    tauriCommands
      .getStorageLocation()
      .then((location) => {
        if (!cancelled) setStoragePath({ status: "ready", path: location.path });
      })
      .catch((error) => {
        if (!cancelled) {
          setStoragePath({
            status: "error",
            path: getExpectedAppDataPath(),
            message: error instanceof Error ? error.message : String(error),
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const fallbackPath = useMemo(() => getExpectedAppDataPath(), []);
  const pathLabel =
    storagePath.status === "ready"
      ? storagePath.path
      : storagePath.path ?? fallbackPath;

  return (
    <SettingsSection title="저장 위치">
      <div className="settings-row-list">
        <SettingsRow
          compact
          label="현재 저장소"
          meta={
            <span className="settings-storage-path">
              <FolderCog size={13} aria-hidden="true" />
              <code>{pathLabel}</code>
            </span>
          }
        />
        {storagePath.status === "error" ? (
          <p className="settings-storage-error" role="alert">
            저장 위치를 확인하지 못했습니다. 예상 경로를 표시합니다: {storagePath.message}
          </p>
        ) : null}
      </div>
    </SettingsSection>
  );
}

function getExpectedAppDataPath(): string {
  if (typeof navigator === "undefined") return "~/.mori";
  const platform = navigator.userAgent.toLowerCase();
  if (platform.includes("windows")) return "%APPDATA%\\Mori";
  if (platform.includes("mac os")) return "~/Library/Application Support/Mori";
  return "~/.local/share/mori";
}
