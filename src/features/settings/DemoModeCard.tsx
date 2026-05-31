import { useState } from "react";
import { Sparkles, Trash2 } from "lucide-react";
import { Button } from "../../components/ui/Button";
import {
  selectSessionMode,
  selectSessionSource,
  useSessionStore,
} from "../../app/sessionStore";
import { useSqliteStore } from "../../app/sqliteStore";
import { SettingsRow, SettingsSection, StatusPill } from "./SettingsPrimitives";

/**
 * Demo mode toggle card for the Settings storage tab (P6).
 *
 * Replaces the old `SessionModeBanner` that appeared as a persistent
 * band on every page. The banner's problem: it framed demo mode as a
 * persistent alert the user had to dismiss or live with on every surface,
 * and it duplicated the "데모 보기" affordance on unrelated pages.
 *
 * This card gathers that control in one deliberate place — Settings →
 * 저장소 — so it reads as a mode choice rather than a warning. The user
 * can switch to demo at any time without losing their current draft; the
 * switch resets the active session to the bundled demo data. Returning to
 * real work is as simple as importing a session again.
 *
 * In demo mode the card surface changes to nudge toward the import flow
 * instead of re-offering the same toggle (circular UX).
 */
export function DemoModeCard({
  onGoToConnections,
}: {
  onGoToConnections: () => void;
}) {
  const mode = useSessionStore(selectSessionMode);
  const source = useSessionStore(selectSessionSource);
  const imports = useSessionStore((state) => state.imports);
  const resetToDemo = useSessionStore((state) => state.resetToDemo);
  const clearAllDataAndViewDemo = useSessionStore(
    (state) => state.clearAllDataAndViewDemo,
  );
  const refreshSqlite = useSqliteStore((state) => state.refresh);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [resetting, setResetting] = useState(false);

  const isDemo = mode === "demo";

  const storageLabel =
    source === "desktop-sqlite"
      ? "Desktop SQLite"
      : source === "demo"
        ? "데모 데이터"
        : "브라우저 저장";

  return (
    <SettingsSection
      title="데이터 소스"
      description={
        isDemo
          ? "현재 Mori 데모 데이터를 보고 있습니다."
          : "실제 작업 데이터를 보고 있습니다. 데모는 기능 확인용으로만 전환됩니다."
      }
      action={
        <StatusPill tone={isDemo ? "gray" : "green"}>
          {isDemo ? "데모" : "실제 세션"}
        </StatusPill>
      }
    >
      <div className="settings-row-list">
        <SettingsRow
          label={isDemo ? "Mori 데모 메모리" : storageLabel}
          description={
            isDemo
              ? "참고용 데이터입니다. 실제 작업을 가져오면 현재 세션이 바뀝니다."
              : `가져오기 ${imports.length}건이 현재 세션에 연결되어 있습니다.`
          }
          meta={
            <span
              className={`demo-mode-card-dot ${isDemo ? "is-demo" : "is-live"}`}
              aria-hidden="true"
            />
          }
          control={
            isDemo ? (
              <Button variant="primary" icon={Sparkles} onClick={onGoToConnections}>
                실제 작업 가져오기
              </Button>
            ) : (
              <Button
                variant="ghost"
                icon={Sparkles}
                onClick={resetToDemo}
                title="데모 세션 메모리로 돌아가기. 현재 초안은 저장된 경우 그대로 유지됩니다."
              >
                데모 보기
              </Button>
            )
          }
        />
        <SettingsRow
          label="기존 데이터 모두 지우고 데모 보기"
          description={
            confirmingReset
              ? "저장된 모든 세션·메모리·보고서 초안이 영구히 삭제됩니다. 로컬 AI·리포지토리 설정은 유지됩니다."
              : "이 기기에 저장된 모든 세션·가져오기·프로젝트 메모리를 지우고 Mori 데모 데이터로 되돌립니다."
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
                  {resetting ? "지우는 중…" : "지우고 데모 보기"}
                </Button>
              </div>
            ) : (
              <Button
                variant="ghost"
                icon={Trash2}
                onClick={() => setConfirmingReset(true)}
                title="이 기기에 저장된 모든 작업 데이터를 지우고 데모로 되돌립니다. 되돌릴 수 없습니다."
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
