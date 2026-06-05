import type { RuntimeMode } from "../../lib/settings/settingsStatus";
import {
  SettingsInlineAction,
  SettingsRow,
  SettingsSection,
} from "./SettingsPrimitives";

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
  onOpenReports,
}: {
  mode: RuntimeMode;
  sqliteKind: "ok" | "checking" | "error" | "unavailable";
  sqliteSessionCount: number;
  onOpenReports: () => void;
}) {
  const location =
    mode === "tauri-desktop"
      ? sqliteKind === "ok"
        ? `데스크톱 SQLite · 세션 ${sqliteSessionCount}개 저장됨`
        : sqliteKind === "checking"
          ? "데스크톱 SQLite · 확인 중…"
          : "데스크톱 SQLite · 사용 불가"
      : "브라우저 임시 저장 (localStorage)";

  return (
    <SettingsSection
      title="저장과 백업"
      action={<SettingsInlineAction onClick={onOpenReports}>보고서 열기</SettingsInlineAction>}
    >
      <div className="settings-row-list">
        <SettingsRow compact label="저장 위치" description={location} />
        <SettingsRow
          compact
          label="내보내기"
          description="Markdown·JSON 내보내기는 보고서 화면에서 만듭니다."
        />
      </div>
    </SettingsSection>
  );
}
