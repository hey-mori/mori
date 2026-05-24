import { FileText, Plug, RefreshCw, Save } from "lucide-react";
import { moriConceptIcon } from "../../components/brand/moriIcons";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import type { DatabaseStatus, PersistSessionSnapshotOutput, SqliteSessionListEntry } from "../../lib/sqlite/repositoryContracts";
import { getStorageStatusRows, type RuntimeMode, type StorageStatusRow } from "../../lib/settings/settingsStatus";
import {
  SettingsInlineAction,
  SettingsNotice,
  SettingsRow,
  SettingsSection,
  StatusPill,
} from "./SettingsPrimitives";

const STATE_TONE: Record<StorageStatusRow["state"], "green" | "blue" | "purple" | "gray" | "orange"> = {
  active: "green",
  available: "blue",
  unavailable: "gray",
  planned: "gray",
};

const STATE_LABEL: Record<StorageStatusRow["state"], string> = {
  active: "활성",
  available: "사용 가능",
  unavailable: "사용 불가",
  planned: "예정",
};

// SQLite connection state — Korean copy with "SQLite" left as a product term.
const SQLITE_KIND_LABEL: Record<"ok" | "checking" | "error" | "unavailable", string> = {
  ok: "정상",
  checking: "확인 중",
  error: "오류",
  unavailable: "사용 불가",
};

export function StorageCard({
  mode,
  sqliteAvailable,
  sqliteKind,
  sqliteStatus,
  sqliteSessions,
  sqliteError,
  lastPersist,
  packageDraftCount,
  canPersist,
  onInitializeSqlite,
  onRefreshSqlite,
  onPersistSession,
  onOpenReports,
}: {
  mode: RuntimeMode;
  sqliteAvailable: boolean;
  sqliteKind: "ok" | "checking" | "error" | "unavailable";
  sqliteStatus: DatabaseStatus | null;
  sqliteSessions: SqliteSessionListEntry[];
  sqliteError: string | null;
  lastPersist: PersistSessionSnapshotOutput | null;
  packageDraftCount: number;
  canPersist: boolean;
  onInitializeSqlite: () => void;
  onRefreshSqlite: () => void;
  onPersistSession: () => void;
  onOpenReports: () => void;
}) {
  const rows = getStorageStatusRows({
    mode,
    sqliteAvailable,
    sqliteKind,
    sqliteSessionCount: sqliteSessions.length,
    packageDraftCount,
  });
  return (
    <SettingsSection
      title="저장소와 백업"
      eyebrow="Local data"
      description="현재 저장 경로와 내보내기 옵션입니다. SQLite는 Tauri 데스크톱 앱에서만 활성화됩니다."
      action={
        <SettingsInlineAction onClick={onOpenReports}>
          Reports 열기
        </SettingsInlineAction>
      }
    >
      <div className="settings-row-list">
        {rows.map((row) => (
          <SettingsRow
            key={row.id}
            label={row.label}
            description={row.description}
            meta={
              <>
                <StatusPill tone={STATE_TONE[row.state]}>{STATE_LABEL[row.state]}</StatusPill>
                <span>{row.hint}</span>
              </>
            }
          />
        ))}
      </div>

      {mode === "tauri-desktop" && sqliteAvailable ? (
        <div className="settings-sqlite-panel">
          <header>
            <h4>
              <moriConceptIcon.desktopSqlite size={14} aria-hidden="true" /> 데스크톱 SQLite
            </h4>
            <Badge
              tone={
                sqliteKind === "ok"
                  ? "green"
                  : sqliteKind === "checking"
                    ? "blue"
                    : sqliteKind === "error"
                      ? "red"
                      : "gray"
              }
            >
              {SQLITE_KIND_LABEL[sqliteKind]}
            </Badge>
          </header>
          <div className="settings-row-list">
            <SettingsRow
              compact
              label="적용된 마이그레이션"
              meta={<span>{sqliteStatus?.appliedMigrations.join(", ") || "(없음)"}</span>}
            />
            <SettingsRow
              compact
              label="대기 중 마이그레이션"
              meta={<span>{sqliteStatus?.pendingMigrations.join(", ") || "(없음)"}</span>}
            />
            <SettingsRow
              compact
              label="테이블"
              meta={<span>{sqliteStatus?.tables?.length ?? 0}</span>}
            />
            <SettingsRow
              compact
              label="저장된 세션"
              meta={<span>{sqliteSessions.length}</span>}
            />
          </div>
          <div className="settings-sqlite-actions">
            <Button icon={Plug} onClick={onInitializeSqlite}>마이그레이션 적용</Button>
            <Button icon={RefreshCw} onClick={onRefreshSqlite}>새로고침</Button>
            <Button
              icon={Save}
              onClick={onPersistSession}
              disabled={!canPersist}
              title={canPersist ? "현재 세션을 SQLite에 저장합니다." : "저장 가능한 활성 세션이 없습니다."}
            >
              현재 세션 저장
            </Button>
          </div>
          {sqliteError ? (
            <p className="settings-sqlite-error" role="alert">
              {sqliteError}
            </p>
          ) : null}
          {lastPersist ? (
            <p className="settings-sqlite-last">
              마지막 저장 · 세션 <code>{lastPersist.sessionId}</code> · 이벤트{" "}
              {lastPersist.eventsPersisted}개 · 출처 {lastPersist.sourcesPersisted}개
            </p>
          ) : null}
        </div>
      ) : null}

      <SettingsNotice icon={FileText} title="내보내기">
        Markdown / .mori v0 JSON은 Reports에서 사용할 수 있습니다. PDF, HTML, zip 패키지는 예정입니다.
      </SettingsNotice>
    </SettingsSection>
  );
}
