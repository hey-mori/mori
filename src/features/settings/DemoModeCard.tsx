import { useState } from "react";
import { FilePlus2, Sparkles, Trash2 } from "lucide-react";
import { Button } from "../../components/ui/Button";
import {
  selectSessionMode,
  selectSessionSource,
  useSessionStore,
} from "../../app/sessionStore";
import { useSqliteStore } from "../../app/sqliteStore";
import { SettingsRow, SettingsSection } from "./SettingsPrimitives";

export function DemoModeCard({
  onGoToConnections,
  onOpenSession,
}: {
  onGoToConnections: () => void;
  onOpenSession: () => void;
}) {
  const mode = useSessionStore(selectSessionMode);
  const source = useSessionStore(selectSessionSource);
  const imports = useSessionStore((state) => state.imports);
  const resetToDemo = useSessionStore((state) => state.resetToDemo);
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

  function handleBeginEmptySession() {
    beginEmptySession();
    onOpenSession();
  }

  function handleGoToRealImport() {
    if (isDemo) beginEmptySession();
    onGoToConnections();
  }

  return (
    <SettingsSection title="데이터 관리">
      <div className="settings-row-list">
        <SettingsRow
          label={isDemo ? "현재: 데모 보기" : storageLabel}
          description={
            isDemo
              ? "샘플 데이터만 보고 있습니다. 실제 작업을 가져오거나, 가져올 항목이 없으면 빈 실제 세션으로 시작할 수 있습니다."
              : `이 기기에 저장된 실제 작업 세션입니다. 현재 세션에 연결된 가져오기 기록은 ${imports.length}건입니다.`
          }
          control={
            isDemo ? (
              <div className="demo-mode-card-actions">
                <Button variant="primary" icon={Sparkles} onClick={handleGoToRealImport}>
                  실제 작업 가져오기
                </Button>
                <Button variant="secondary" icon={FilePlus2} onClick={handleBeginEmptySession}>
                  빈 실제 세션
                </Button>
              </div>
            ) : (
              <Button
                variant="ghost"
                icon={Sparkles}
                onClick={resetToDemo}
                title="샘플 데이터로 잠시 돌아갑니다. 저장된 실제 작업은 삭제되지 않습니다."
              >
                데모 보기
              </Button>
            )
          }
        />
        <SettingsRow
          label="데이터 전체 초기화"
          description={
            confirmingReset
              ? "저장된 세션, 가져오기, 프로젝트 메모리, 보고서 초안을 영구 삭제합니다. AI 엔진과 Git 저장소 설정은 유지됩니다."
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
