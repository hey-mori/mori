import { Sparkles } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import {
  selectSessionMode,
  selectSessionSource,
  useMoriSessionStore,
} from "../../app/sessionStore";
import { useMoriAppStore } from "../../app/store";

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
  const setCurrentView = useMoriAppStore((state) => state.setCurrentView);

  const isDemo = mode === "demo";

  const storageLabel =
    source === "desktop-sqlite"
      ? "Desktop SQLite"
      : source === "demo"
        ? "데모 데이터"
        : "브라우저 저장";

  return (
    <section className="settings-card demo-mode-card" aria-label="데이터 소스">
      <header className="settings-card-head">
        <div>
          <h3>데이터 소스</h3>
          <p>
            {isDemo
              ? "현재 Mori 데모 데이터를 보고 있습니다. 실제 Claude 작업을 가져오면 이 화면이 채워집니다."
              : "실제 작업 데이터를 보고 있습니다. 데모 데이터로 전환해 Mori의 기능을 미리 살펴볼 수 있습니다."}
          </p>
        </div>
        <Badge tone={isDemo ? "gray" : "green"}>
          {isDemo ? "데모" : "실제 세션"}
        </Badge>
      </header>

      <div className="demo-mode-card-body">
        {isDemo ? (
          <div className="demo-mode-card-status">
            <span className="demo-mode-card-dot is-demo" aria-hidden="true" />
            <span>
              <strong>Mori 데모 메모리</strong>
              <span className="demo-mode-card-detail">참고용 데이터 · 저장되지 않음</span>
            </span>
            <Button variant="primary" icon={Sparkles} onClick={onGoToConnections}>
              실제 작업 가져오기
            </Button>
          </div>
        ) : (
          <div className="demo-mode-card-status">
            <span className="demo-mode-card-dot is-live" aria-hidden="true" />
            <span>
              <strong>{storageLabel}</strong>
              <span className="demo-mode-card-detail">
                가져오기 {imports.length}건
              </span>
            </span>
            <Button
              variant="ghost"
              icon={Sparkles}
              onClick={resetToDemo}
              title="데모 세션 메모리로 돌아가기. 현재 초안은 저장된 경우 그대로 유지됩니다."
            >
              데모 보기
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}
