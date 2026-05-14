import { FileText, HardDrive, Plug, RefreshCw, Save } from "lucide-react";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import type { DatabaseStatus, PersistSessionSnapshotOutput, SqliteSessionListEntry } from "../../lib/sqlite/repositoryContracts";
import { getStorageStatusRows, type RuntimeMode, type StorageStatusRow } from "../../lib/settings/settingsStatus";

const STATE_TONE: Record<StorageStatusRow["state"], "green" | "blue" | "purple" | "gray" | "orange"> = {
  active: "green",
  available: "blue",
  unavailable: "gray",
  planned: "gray",
};

const STATE_LABEL: Record<StorageStatusRow["state"], string> = {
  active: "Active",
  available: "Available",
  unavailable: "Unavailable",
  planned: "Planned",
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
    <section className="settings-card" aria-label="Storage and export">
      <header className="settings-card-head">
        <div>
          <h3>Storage / Export</h3>
          <p>현재 활성화된 저장 경로와 내보내기 옵션을 한곳에서 확인합니다. SQLite는 Tauri 데스크톱 모드에서만 동작합니다.</p>
        </div>
        <Button onClick={onOpenReports}>Reports로 이동</Button>
      </header>
      <ul className="settings-storage-list">
        {rows.map((row) => (
          <li key={row.id} className={`tone-${row.badgeTone}`}>
            <header>
              <strong>{row.label}</strong>
              <Badge tone={STATE_TONE[row.state]}>{STATE_LABEL[row.state]}</Badge>
            </header>
            <p>{row.description}</p>
            <small>{row.hint}</small>
          </li>
        ))}
      </ul>

      {mode === "tauri-desktop" && sqliteAvailable ? (
        <div className="settings-sqlite-panel">
          <header>
            <h4>
              <HardDrive size={14} aria-hidden="true" /> Desktop SQLite
            </h4>
            <Badge
              tone={
                sqliteKind === "ok"
                  ? "green"
                  : sqliteKind === "checking"
                    ? "purple"
                    : sqliteKind === "error"
                      ? "red"
                      : "gray"
              }
            >
              {sqliteKind}
            </Badge>
          </header>
          <dl className="settings-sqlite-meta">
            <div>
              <dt>Applied migrations</dt>
              <dd>{sqliteStatus?.appliedMigrations.join(", ") || "(none)"}</dd>
            </div>
            <div>
              <dt>Pending migrations</dt>
              <dd>{sqliteStatus?.pendingMigrations.join(", ") || "(none)"}</dd>
            </div>
            <div>
              <dt>Tables</dt>
              <dd>{sqliteStatus?.tables?.length ?? 0}</dd>
            </div>
            <div>
              <dt>Saved sessions</dt>
              <dd>{sqliteSessions.length}</dd>
            </div>
          </dl>
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
              마지막 저장 · session <code>{lastPersist.sessionId}</code> · events {lastPersist.eventsPersisted} · sources{" "}
              {lastPersist.sourcesPersisted}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="settings-export-hint">
        <FileText size={12} aria-hidden="true" />
        <span>
          Markdown / .mori v0 JSON 내보내기는 Reports 화면에 있습니다. PDF · HTML · zip 형식 패키지는 Planned 입니다.
        </span>
      </div>
    </section>
  );
}
