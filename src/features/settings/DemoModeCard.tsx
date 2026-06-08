import { useState } from "react";
import { Database, Sparkles, Trash2 } from "lucide-react";
import { Button } from "../../components/ui/Button";
import {
  loadStoredSessionSummaries,
  selectSessionMode,
  selectSessionSource,
  useSessionStore,
} from "../../app/sessionStore";
import { useSqliteStore } from "../../app/sqliteStore";
import { SettingsRow, SettingsSection } from "./SettingsPrimitives";

export function DemoModeCard() {
  const mode = useSessionStore(selectSessionMode);
  const source = useSessionStore(selectSessionSource);
  const imports = useSessionStore((state) => state.imports);
  const resetToDemo = useSessionStore((state) => state.resetToDemo);
  const loadBrowserSession = useSessionStore((state) => state.loadBrowserSession);
  const beginEmptySession = useSessionStore((state) => state.beginEmptySession);
  const clearAllDataAndViewDemo = useSessionStore(
    (state) => state.clearAllDataAndViewDemo,
  );
  const refreshSqlite = useSqliteStore((state) => state.refresh);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [resetting, setResetting] = useState(false);

  const isDemo = mode === "demo";
  const storageLabel =
    source === "desktop-sqlite"
      ? "데스크톱 저장"
      : source === "browser-draft"
        ? "로컬 초안"
        : "데모 데이터";

  // Switching to real data exits demo in place (no navigation), so the toggle
  // stays a simple two-way view switch. Demo never deletes saved real work.
  function showRealData() {
    if (!isDemo) return;
    const latest = loadStoredSessionSummaries()[0];
    if (latest && loadBrowserSession(latest.sessionId)) return;
    beginEmptySession();
  }

  return (
    <SettingsSection title="데이터 관리">
      <div className="settings-row-list">
        <SettingsRow
          label="보기 모드"
          description={
            isDemo
              ? "데모 데이터는 보기용입니다. 실제 데이터로 전환해도 저장된 작업은 삭제되지 않습니다."
              : `${storageLabel} · 가져오기 기록 ${imports.length}건`
          }
          control={
            <div className="demo-mode-switch" role="group" aria-label="데이터 보기 모드">
              <button
                type="button"
                className={!isDemo ? "is-selected" : ""}
                aria-pressed={!isDemo}
                onClick={showRealData}
              >
                <Database size={13} aria-hidden="true" />
                실제 데이터
              </button>
              <button
                type="button"
                className={isDemo ? "is-selected" : ""}
                aria-pressed={isDemo}
                onClick={resetToDemo}
              >
                <Sparkles size={13} aria-hidden="true" />
                데모
              </button>
            </div>
          }
        />
        <SettingsRow
          label="데이터 전체 초기화"
          description={
            confirmingReset
              ? "저장된 세션, 가져오기, 프로젝트 메모리, 보고서 초안을 영구 삭제합니다. 분석 엔진 설정은 유지됩니다."
              : "이 기기에 저장된 작업 데이터를 모두 삭제합니다. 설정은 유지됩니다."
          }
          control={
            confirmingReset ? (
              <div className="demo-mode-card-confirm">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={resetting}
                  onClick={() => setConfirmingReset(false)}
                >
                  취소
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  icon={Trash2}
                  disabled={resetting}
                  onClick={async () => {
                    setResetting(true);
                    try {
                      await clearAllDataAndViewDemo();
                      await refreshSqlite();
                    } finally {
                      setResetting(false);
                      setConfirmingReset(false);
                    }
                  }}
                >
                  {resetting ? "초기화 중" : "초기화"}
                </Button>
              </div>
            ) : (
              <Button
                variant="ghost"
                icon={Trash2}
                onClick={() => setConfirmingReset(true)}
                title="이 기기에 저장된 작업 데이터를 삭제합니다. 되돌릴 수 없습니다."
              >
                전체 초기화
              </Button>
            )
          }
        />
      </div>
    </SettingsSection>
  );
}
