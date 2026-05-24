import { Sparkles } from "lucide-react";
import { Button } from "../../components/ui/Button";
import {
  selectSessionMode,
  selectSessionSource,
  useMoriSessionStore,
} from "../../app/sessionStore";
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
  const mode = useMoriSessionStore(selectSessionMode);
  const source = useMoriSessionStore(selectSessionSource);
  const imports = useMoriSessionStore((state) => state.imports);
  const resetToDemo = useMoriSessionStore((state) => state.resetToDemo);

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
      </div>
    </SettingsSection>
  );
}
