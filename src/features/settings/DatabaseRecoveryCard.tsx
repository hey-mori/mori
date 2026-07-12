import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, DatabaseBackup, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { useSqliteStore } from "../../app/sqliteStore";
import { isTauriRuntime, tauriCommands } from "../../lib/desktop";
import {
  buildBackupDisplayRows,
  type BackupDisplayRow,
} from "../../lib/storage/databaseRecovery";
import { SettingsRow, SettingsSection } from "./SettingsPrimitives";

/**
 * Recovery surface for a broken desktop database.
 *
 * When a SQLite migration fails, saves and loads silently no-op today, with no
 * message and no way out. This card renders only in that error state and turns
 * the automatic pre-migration backups into a way back: restore a snapshot,
 * retry, or (confirm-gated) start fresh. Non-destructive actions lead;
 * "처음부터 시작" is last and always confirmed.
 */
export function DatabaseRecoveryCard() {
  const kind = useSqliteStore((state) => state.kind);
  const error = useSqliteStore((state) => state.error);
  const refresh = useSqliteStore((state) => state.refresh);

  const [rows, setRows] = useState<BackupDisplayRow[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmingClear, setConfirmingClear] = useState(false);

  const inErrorState = isTauriRuntime() && kind === "error";

  const loadBackups = useCallback(() => {
    tauriCommands
      .listSqliteBackups()
      .then((backups) => setRows(buildBackupDisplayRows(backups)))
      .catch(() => setRows([]));
  }, []);

  useEffect(() => {
    if (inErrorState) loadBackups();
  }, [inErrorState, loadBackups]);

  if (!inErrorState) return null;

  async function handleRestore(row: BackupDisplayRow) {
    if (busy) return;
    setBusy(row.path);
    setNotice(null);
    try {
      await tauriCommands.restoreSqliteBackup(row.path);
      await refresh();
      setNotice(`${row.takenAtLabel} 백업으로 복원했습니다.`);
    } catch (restoreError) {
      setNotice(`복원하지 못했습니다: ${messageOf(restoreError)}`);
    } finally {
      setBusy(null);
    }
  }

  async function handleRetry() {
    if (busy) return;
    setBusy("retry");
    setNotice(null);
    try {
      await refresh();
      loadBackups();
    } finally {
      setBusy(null);
    }
  }

  async function handleClear() {
    if (busy) return;
    setBusy("clear");
    setNotice(null);
    try {
      await tauriCommands.clearAllSqliteData();
      await refresh();
      setConfirmingClear(false);
      setNotice("데이터베이스를 비우고 새로 시작했습니다.");
    } catch (clearError) {
      setNotice(`초기화하지 못했습니다: ${messageOf(clearError)}`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <SettingsSection title="데이터베이스 복구">
      <div className="db-recovery">
        <div className="db-recovery-alert" role="alert">
          <AlertTriangle size={15} aria-hidden="true" />
          <div>
            <strong>저장소를 열지 못했습니다.</strong>
            <p>
              마이그레이션이 완료되지 않아 저장과 불러오기가 멈췄습니다. 아래에서 마이그레이션
              직전 백업으로 복원하거나 다시 시도할 수 있습니다.
            </p>
            {error ? <code className="db-recovery-detail">{error}</code> : null}
          </div>
        </div>

        <SettingsRow
          compact
          label="다시 시도"
          meta="파일을 고쳤거나 앱을 업데이트했다면 다시 열어봅니다."
          control={
            <Button
              variant="secondary"
              size="sm"
              icon={RotateCcw}
              disabled={busy !== null}
              onClick={handleRetry}
            >
              {busy === "retry" ? "여는 중" : "다시 열기"}
            </Button>
          }
        />

        {rows.length > 0 ? (
          <div className="db-recovery-backups">
            <p className="db-recovery-backups-title">자동 백업에서 복원</p>
            <ul className="db-recovery-list">
              {rows.map((row) => (
                <li key={row.path} className="db-recovery-item">
                  <span className="db-recovery-item-main">
                    <DatabaseBackup size={14} aria-hidden="true" />
                    <span className="db-recovery-item-when">{row.takenAtLabel}</span>
                    <span className="db-recovery-item-size">{row.sizeLabel}</span>
                  </span>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={busy !== null}
                    onClick={() => handleRestore(row)}
                  >
                    {busy === row.path ? "복원 중" : "복원"}
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="db-recovery-empty">
            복원할 자동 백업이 없습니다. 마이그레이션 전에 만들어진 백업만 여기에 표시됩니다.
          </p>
        )}

        <SettingsRow
          compact
          label="처음부터 시작"
          meta="복구가 안 될 때 데이터베이스를 비웁니다. 이 기기의 저장 내용은 사라집니다."
          control={
            confirmingClear ? (
              <span className="db-recovery-confirm">
                <Button
                  variant="primary"
                  size="sm"
                  icon={Trash2}
                  disabled={busy !== null}
                  onClick={handleClear}
                >
                  {busy === "clear" ? "비우는 중" : "비우기"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy !== null}
                  onClick={() => setConfirmingClear(false)}
                >
                  취소
                </Button>
              </span>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                disabled={busy !== null}
                onClick={() => setConfirmingClear(true)}
              >
                초기화
              </Button>
            )
          }
        />

        {notice ? <p className="db-recovery-notice">{notice}</p> : null}
      </div>
    </SettingsSection>
  );
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
