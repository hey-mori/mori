import { getVersion } from "@tauri-apps/api/app";
import { Clipboard, Database, ExternalLink, Info } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "../../components/ui/Button";
import { isTauriRuntime } from "../../lib/desktop";
import type { RuntimeMode } from "../../lib/settings/settingsStatus";
import {
  SettingsInlineAction,
  SettingsNotice,
  SettingsRow,
  SettingsSection,
} from "./SettingsPrimitives";

const FALLBACK_APP_VERSION = "0.1.0";
const DATA_SCHEMA_VERSION = "V006";
const UPDATE_CHANNEL = "stable";

type VersionState =
  | { status: "loading"; version: string }
  | { status: "ready"; version: string }
  | { status: "error"; version: string; message: string };

type CopyState = "idle" | "copied" | "error";

export function AboutCard({
  mode,
  sqliteKind,
  sqliteSessionCount,
  onOpenConnections,
}: {
  mode: RuntimeMode;
  sqliteKind: "ok" | "checking" | "error" | "unavailable";
  sqliteSessionCount: number;
  onOpenConnections: () => void;
}) {
  const desktopRuntime = useMemo(() => isTauriRuntime(), []);
  const [version, setVersion] = useState<VersionState>({
    status: "loading",
    version: FALLBACK_APP_VERSION,
  });
  const [copyState, setCopyState] = useState<CopyState>("idle");

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

  const diagnostics = useMemo(
    () =>
      [
        "Mori diagnostics",
        `App version: ${version.version}`,
        `Runtime: ${mode}`,
        `Update channel: ${UPDATE_CHANNEL}`,
        `Data schema: ${DATA_SCHEMA_VERSION}`,
        `SQLite: ${sqliteKind}`,
        `Saved sessions: ${sqliteSessionCount}`,
        `Generated: ${new Date().toISOString()}`,
      ].join("\n"),
    [mode, sqliteKind, sqliteSessionCount, version.version],
  );

  async function handleCopyDiagnostics() {
    try {
      await navigator.clipboard.writeText(diagnostics);
      setCopyState("copied");
      window.setTimeout(() => setCopyState("idle"), 2200);
    } catch {
      setCopyState("error");
      window.setTimeout(() => setCopyState("idle"), 2200);
    }
  }

  return (
    <div className="settings-content-stack settings-about">
      <SettingsSection title="정보">
        <div className="settings-about-grid">
          <SettingsRow
            compact
            label="Mori 버전"
            description="현재 실행 중인 앱 버전입니다."
            meta={<span className="settings-about-meta">{version.version}</span>}
          />
          <SettingsRow
            compact
            label="업데이트"
            description="자동 업데이트 확인은 아직 연결되지 않았습니다. 지금은 릴리즈를 수동으로 적용합니다."
            meta={<span className="settings-about-meta">{UPDATE_CHANNEL}</span>}
          />
          <SettingsRow
            compact
            label="데이터"
            description={`로컬 데이터 schema ${DATA_SCHEMA_VERSION}. 저장된 세션 ${sqliteSessionCount}개.`}
            meta={
              <span className="settings-about-meta">
                <Database size={13} aria-hidden="true" />
                {sqliteKind === "ok" ? "SQLite 사용 중" : "저장소 확인 필요"}
              </span>
            }
          />
          <SettingsRow
            compact
            label="연동"
            description="Claude, Codex, Git, 터미널 같은 외부 도구 설정은 연동 페이지에서 관리합니다."
            control={
              <SettingsInlineAction onClick={onOpenConnections}>
                <ExternalLink size={13} aria-hidden="true" />
                연동으로 이동
              </SettingsInlineAction>
            }
          />
        </div>

        {version.status === "error" ? (
          <SettingsNotice icon={Info} title="버전 확인 제한" tone="warning">
            데스크톱 버전을 읽지 못해 기본 버전을 표시합니다. {version.message}
          </SettingsNotice>
        ) : null}
      </SettingsSection>

      <SettingsSection
        title="진단"
        action={
          <Button icon={Clipboard} size="sm" onClick={handleCopyDiagnostics}>
            {copyState === "copied"
              ? "복사됨"
              : copyState === "error"
                ? "복사 실패"
                : "진단 정보 복사"}
          </Button>
        }
      >
        <pre className="settings-about-diagnostics">{diagnostics}</pre>
      </SettingsSection>
    </div>
  );
}
