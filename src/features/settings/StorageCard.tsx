import { useEffect, useMemo, useState } from "react";
import { FolderCog } from "lucide-react";
import type { RuntimeMode } from "../../lib/settings/settingsStatus";
import { isTauriRuntime, tauriCommands } from "../../lib/desktop";
import { SettingsRow, SettingsSection, StatusPill } from "./SettingsPrimitives";

type StoragePathState =
  | { status: "idle" | "loading"; path: string | null }
  | { status: "ready"; path: string }
  | { status: "error"; path: string | null; message: string };

export function StorageCard({
  mode,
  sqliteKind,
  sqliteSessionCount,
}: {
  mode: RuntimeMode;
  sqliteKind: "ok" | "checking" | "error" | "unavailable";
  sqliteSessionCount: number;
}) {
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

  const sqliteLabel =
    mode === "tauri-desktop"
      ? sqliteKind === "ok"
        ? `SQLite 사용 중 · 저장된 세션 ${sqliteSessionCount}개`
        : sqliteKind === "checking"
          ? "SQLite 확인 중"
          : "SQLite를 사용할 수 없음"
      : "브라우저 localStorage";

  return (
    <SettingsSection
      title="저장 위치"
      action={
        <StatusPill tone={mode === "tauri-desktop" && sqliteKind === "ok" ? "green" : "gray"}>
          {mode === "tauri-desktop" ? "이 기기" : "브라우저"}
        </StatusPill>
      }
    >
      <div className="settings-row-list">
        <SettingsRow
          compact
          label="기본 저장소"
          description={`${sqliteLabel}. 작업 데이터는 외부 서버로 동기화되지 않습니다.`}
          meta={
            <span className="settings-storage-path">
              <FolderCog size={13} aria-hidden="true" />
              <code>{pathLabel}</code>
            </span>
          }
        />
        <SettingsRow
          compact
          label="사용자 지정 저장"
          description="세션 데이터베이스는 OS별 앱 데이터 폴더를 기본값으로 사용합니다. 내보내기 파일(.mori JSON/ZIP)은 저장할 때 원하는 경로를 직접 선택할 수 있습니다."
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
