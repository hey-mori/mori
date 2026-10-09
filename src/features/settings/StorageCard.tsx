import { useEffect, useMemo, useState } from "react";
import { FileDown, FolderCog, FolderInput } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { useSqliteStore } from "../../app/sqliteStore";
import { useStorageHealthStore } from "../../app/storageHealthStore";
import { getDocumentMirrorHealth } from "../../lib/storage/desktopDocumentMirror";
import { getLastAdoptionReport } from "../../app/useDurableDocumentAdoption";
import { getDurableReadSource } from "../../app/durableReads";
import {
  buildDiagnosticsReport,
  readDiagnosticsEntries,
} from "../../lib/diagnostics/diagnosticsLog";
import { isTauriRuntime, tauriCommands } from "../../lib/desktop";
import { SettingsRow, SettingsSection } from "./SettingsPrimitives";
import { InfoHint } from "../../components/ui/InfoHint";

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
  // Read once per mount; the log only grows on errors, and Settings is
  // re-mounted on navigation, so a live subscription would be noise.
  const [diagnosticsCount] = useState(
    () => readDiagnosticsEntries(window.localStorage).length,
  );

  function handleExportDiagnostics() {
    exportDiagnosticsReport();
  }
  const refreshSqlite = useSqliteStore((state) => state.refresh);
  const isDesktop = isTauriRuntime();
  // Persistent, not transient: a device whose store failed to open keeps
  // falling back on every write, so this is a standing condition of the
  // machine rather than an event. The notification tells the user once; this
  // is where they come to check.
  const lastFallback = useStorageHealthStore((state) => state.lastFallback);
  // Standing, like the fallback line: a copy that is behind stays behind until
  // something is done about it.
  const readFlipHeldBack = useStorageHealthStore((state) => state.readFlipHeldBack);

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
        {isDesktop ? (
          <SettingsRow
            compact
            label="백업"
            meta={
              <span>
                Mori를 끈 뒤 이 폴더를 통째로 다른 디스크에 복사하세요.{" "}
                <InfoHint label="백업 설명">
                  이 폴더에 기록, 저장한 구절, 프로젝트, 세션과 가져온 대화, 보관한 원본(archives), 복구용 스냅샷이
                  모두 들어 있습니다. Mori가 켜져 있을 때 복사하면 마지막 변경이 빠질 수 있습니다. 복원은 Mori를 끈
                  상태에서 폴더를 되돌려 놓거나 변경으로 고르면 됩니다. 테마, 분석 엔진 설정(API 키 포함), 알림 같은 기기
                  설정과 에이전트의 원본 대화 파일은 들어 있지 않습니다. 보관한 원본도 같은 디스크에 있으면 디스크가
                  고장 날 때 함께 잃습니다.
                </InfoHint>
              </span>
            }
          />
        ) : null}
        {notice ? <p className="settings-storage-notice">{notice}</p> : null}
        {lastFallback ? (
          <p className="settings-storage-error" role="alert">
            저장소를 열지 못해 기록을 앱 내부 저장소에 임시로 담고 있습니다. 용량이 작아
            공간이 곧 부족해질 수 있습니다. 원인: {lastFallback.reason}
          </p>
        ) : null}
        {readFlipHeldBack ? (
          <p className="settings-storage-notice">
            일부 기록이 새 저장소에 아직 옮겨지지 않아 이전 저장소에서 읽고 있습니다.
            {readFlipHeldBack.missingKeys > 0
              ? ` 남은 항목 ${readFlipHeldBack.missingKeys}개.`
              : ` 원인: ${readFlipHeldBack.reason}`}
          </p>
        ) : null}
        {storagePath.status === "error" ? (
          <p className="settings-storage-error" role="alert">
            저장 위치를 확인하지 못했습니다. 예상 경로를 표시합니다: {storagePath.message}
          </p>
        ) : null}
        <SettingsRow
          compact
          label="진단 로그"
          meta={`오류 기록 ${diagnosticsCount}건 · 로컬에만 저장, 세션 내용은 담기지 않음`}
          control={
            <Button
              variant="secondary"
              size="sm"
              icon={FileDown}
              disabled={diagnosticsCount === 0}
              onClick={handleExportDiagnostics}
            >
              내보내기
            </Button>
          }
        />
      </div>
    </SettingsSection>
  );
}

/** Serialise the diagnostics log and hand it to the user as a JSON download. */
function exportDiagnosticsReport(): void {
  const report = buildDiagnosticsReport({
    entries: readDiagnosticsEntries(window.localStorage),
    exportedAt: new Date().toISOString(),
    appVersion: "0.1.0",
    userAgent: navigator.userAgent,
    platform: isTauriRuntime() ? "desktop" : "browser",
    storage: describeRestingStorage(),
    mirror: describeMirror(),
    adoption: getLastAdoptionReport() ?? undefined,
    durableReads: describeDurableReads(),
  });
  const blob = new Blob([JSON.stringify(report, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `mori-diagnostics-${report.exportedAt.slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

/** Where durable reads came from this launch, and why, when held back. */
function describeDurableReads() {
  const resolved = getDurableReadSource();
  if (!resolved) return undefined;
  return {
    source: resolved.source,
    ...(resolved.heldBack
      ? { heldBackReason: resolved.heldBack.reason, missingKeys: resolved.heldBack.missingKeys }
      : {}),
  };
}

/** How far the SQLite copy is behind, while dual-write is on. */
function describeMirror() {
  const health = getDocumentMirrorHealth();
  if (!health) return undefined;
  return {
    written: health.written,
    failed: health.failed,
    ...(health.lastFailure ? { lastFailureReason: health.lastFailure.reason } : {}),
  };
}

/**
 * The one storage fact a diagnostics reader cannot get from the log: whether
 * this device is resting on its real store. Undefined when it is, so a report
 * without this field means the normal case.
 */
function describeRestingStorage() {
  const fallback = useStorageHealthStore.getState().lastFallback;
  if (!fallback) return undefined;
  return {
    fellBackTo: "browser-local-storage" as const,
    scope: fallback.scope,
    reason: fallback.reason,
    at: fallback.at,
  };
}

function getExpectedAppDataPath(): string {
  if (typeof navigator === "undefined") return "~/.mori";
  const platform = navigator.userAgent.toLowerCase();
  if (platform.includes("windows")) return "%APPDATA%\\Mori";
  if (platform.includes("mac os")) return "~/Library/Application Support/Mori";
  return "~/.local/share/mori";
}
