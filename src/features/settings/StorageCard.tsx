import type { RuntimeMode } from "../../lib/settings/settingsStatus";
import { SettingsRow, SettingsSection } from "./SettingsPrimitives";

/**
 * Storage & backup — the calm, essential view.
 *
 * Earlier this surface listed every storage format and exposed raw SQLite
 * migration controls, which read as developer noise. It now states only what
 * a user needs: where this device keeps data, and where to make an export.
 */
export function StorageCard({
  mode,
  sqliteKind,
  sqliteSessionCount,
}: {
  mode: RuntimeMode;
  sqliteKind: "ok" | "checking" | "error" | "unavailable";
  sqliteSessionCount: number;
}) {
  const location =
    mode === "tauri-desktop"
      ? sqliteKind === "ok"
        ? `데스크톱 저장 · 세션 ${sqliteSessionCount}개 저장됨`
        : sqliteKind === "checking"
          ? "데스크톱 저장 · 확인 중…"
          : "데스크톱 저장 · 사용 불가"
      : "브라우저 저장";

  return (
    <SettingsSection title="저장 위치">
      <div className="settings-row-list">
        <SettingsRow
          compact
          label="이 기기"
          description={`${location} · 데이터는 외부 서버로 동기화되지 않습니다.`}
        />
      </div>
    </SettingsSection>
  );
}
