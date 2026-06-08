import { useEffect, useMemo, useState } from "react";
import { FolderCog, FolderInput } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { useSqliteStore } from "../../app/sqliteStore";
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
  const [changing, setChanging] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const refreshSqlite = useSqliteStore((state) => state.refresh);
  const isDesktop = isTauriRuntime();

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

  async function handleChange() {
    if (changing) return;
    setChanging(true);
    setNotice(null);
    try {
      const result = await tauriCommands.setStorageLocation();
      if (result.cancelled || !result.path) return;
      setStoragePath({ status: "ready", path: result.path });
      setNotice(
        result.movedDb
          ? "저장 위치를 옮기고 기존 데이터도 이동했습니다."
          : "저장 위치를 변경했습니다.",
      );
      // The backend reopened the database at the new path, so re-read sessions.
      await refreshSqlite();
    } catch (error) {
      setNotice(
        `위치를 변경하지 못했습니다: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      setChanging(false);
    }
  }

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
          control={
            isDesktop ? (
              <Button
                variant="secondary"
                size="sm"
                icon={FolderInput}
                disabled={changing}
                onClick={() => void handleChange()}
              >
                {changing ? "변경 중" : "변경"}
              </Button>
            ) : undefined
          }
        />
        {notice ? <p className="settings-storage-notice">{notice}</p> : null}
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
