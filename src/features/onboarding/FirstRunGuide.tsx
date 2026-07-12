import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Radio, ShieldCheck, Sparkles, X } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { focusFirstElement, trapTabKey } from "../../components/ui/focusTrap";
import { useAppStore } from "../../app/store";
import { useOnboardingStore } from "../../app/onboardingStore";
import { loadStoredSessionSummaries } from "../../app/sessionStore";
import { isTauriRuntime } from "../../lib/desktop";
import {
  connectClaudeHook,
  loadConnectorStatus,
} from "../../lib/connectors/installers/connectorInstallerTauri";
import type { ConnectorStatusViewModel } from "../../lib/connectors/installers/connectorInstaller";

/**
 * First-run guide.
 *
 * The one surface a brand-new user needs: what Mori is (local-first, explicit,
 * reviewed) and the one action that matters, connecting an agent. It shows only
 * on a truly empty first run (no stored sessions and not yet completed), or when
 * explicitly reopened from Settings / the command palette. Completing or
 * dismissing it sets the durable `completed` flag so it never nags; any real
 * work makes the session count non-zero and also hides it. Honest about the
 * desktop-vs-browser split: detection and one-click connect are desktop-only,
 * and the browser build says so rather than showing a dead button.
 */
export function FirstRunGuide() {
  const completed = useOnboardingStore((state) => state.state.completed);
  const initialized = useOnboardingStore((state) => state.initialized);
  const reopened = useOnboardingStore((state) => state.reopened);
  const complete = useOnboardingStore((state) => state.complete);
  const closeReopened = useOnboardingStore((state) => state.closeReopened);

  const navigate = useAppStore((state) => state.navigate);
  const requestStartRecords = useAppStore((state) => state.requestStartRecords);

  // Read the session count once at mount: a fresh install has none. Any real
  // work later makes this non-zero, and completing the guide is durable anyway.
  const [hasSessions] = useState(() => {
    try {
      return loadStoredSessionSummaries().length > 0;
    } catch {
      return false;
    }
  });

  const desktop = isTauriRuntime();
  const visible = initialized && (reopened || (!completed && !hasSessions));

  if (!visible) return null;

  return (
    <FirstRunOverlay
      desktop={desktop}
      onFinish={(destination) => {
        if (reopened) closeReopened();
        complete();
        if (destination === "records") requestStartRecords();
        else if (destination === "live") navigate("liveSession");
        else if (destination === "connections") navigate("connections");
      }}
      onClose={() => {
        if (reopened) closeReopened();
        else complete();
      }}
    />
  );
}

type Destination = "records" | "live" | "connections" | "stay";

function FirstRunOverlay({
  desktop,
  onFinish,
  onClose,
}: {
  desktop: boolean;
  onFinish: (destination: Destination) => void;
  onClose: () => void;
}) {
  const [models, setModels] = useState<ConnectorStatusViewModel[] | null>(null);
  const [connecting, setConnecting] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const refreshStatus = useCallback(() => {
    if (!desktop) return;
    void loadConnectorStatus()
      .then(setModels)
      .catch(() => setModels([]));
  }, [desktop]);

  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  // Modal behavior parity with the app's other dialogs (SettingsSheet /
  // ConnectorInstallModal): the guide claims aria-modal, so it must trap Tab,
  // close on Escape, take initial focus, and lock background scroll. On a truly
  // empty first launch this is the only surface, so keyboard access matters.
  useEffect(() => {
    previousFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      trapTabKey(event, dialogRef.current);
    };
    document.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.requestAnimationFrame(() => focusFirstElement(dialogRef.current));
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
      previousFocusRef.current?.focus();
    };
  }, [onClose]);

  const detected = useMemo(
    () => (models ?? []).filter((model) => model.captureModel !== "planned"),
    [models],
  );

  async function handleConnectClaude(id: string) {
    if (connecting) return;
    setConnecting(id);
    try {
      await connectClaudeHook({ scope: "global" });
      refreshStatus();
    } catch {
      // Leave the row as-is; the 연동 hub surfaces detailed errors.
    } finally {
      setConnecting(null);
    }
  }

  return (
    <div className="settings-sheet-layer" role="presentation">
      <div className="settings-sheet-scrim" onClick={onClose} aria-hidden="true" />
      <div
        ref={dialogRef}
        className="first-run"
        role="dialog"
        aria-modal="true"
        aria-labelledby="first-run-title"
        tabIndex={-1}
      >
        <button
          type="button"
          className="first-run-close"
          onClick={onClose}
          aria-label="닫기"
        >
          <X size={16} aria-hidden="true" />
        </button>

        <div className="first-run-hero">
          <span className="first-run-mark" aria-hidden="true">
            <Sparkles size={22} />
          </span>
          <h1 id="first-run-title">작업의 기억을 남기는 곳</h1>
          <p className="first-run-lead">
            Mori는 AI 코딩 세션을 증거가 연결된 타임라인과 검토를 거친 기억으로 바꿉니다. 모든
            데이터는 이 기기에만 저장됩니다.
          </p>
        </div>

        <ul className="first-run-principles">
          <li>
            <ShieldCheck size={15} aria-hidden="true" />
            로컬 우선, 계정 없음. 데이터는 기기를 떠나지 않습니다.
          </li>
          <li>
            <ShieldCheck size={15} aria-hidden="true" />
            명시적으로 연결한 기록만 읽습니다. 몰래 지켜보지 않습니다.
          </li>
          <li>
            <ShieldCheck size={15} aria-hidden="true" />
            검토를 거친 것만 오래가는 기억이 됩니다.
          </li>
        </ul>

        {desktop ? (
          <div className="first-run-connect">
            <p className="first-run-step-title">에이전트 연결</p>
            {models === null ? (
              <p className="first-run-note">감지하는 중...</p>
            ) : detected.length === 0 ? (
              <p className="first-run-note">
                감지된 에이전트가 없습니다. Claude Code나 Codex로 작업한 뒤 다시 열어보세요.
              </p>
            ) : (
              <ul className="first-run-agents">
                {detected.map((model) => (
                  <li key={model.id} className="first-run-agent">
                    <span className="first-run-agent-main">
                      <span className="first-run-agent-name">{model.displayName}</span>
                      <span className="first-run-agent-detail">
                        {model.detail[0] ?? model.display.label}
                      </span>
                    </span>
                    {model.captureModel === "config-hook" && model.canInstall ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={connecting !== null}
                        onClick={() => handleConnectClaude(model.id)}
                      >
                        {connecting === model.id ? "연결 중" : "연결"}
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <p className="first-run-note first-run-desktop-only">
            에이전트 자동 감지와 한 번에 연결은 데스크톱 앱에서 동작합니다. 브라우저에서는 대화를
            직접 붙여넣어 가져올 수 있습니다.
          </p>
        )}

        <div className="first-run-actions">
          {desktop ? (
            <>
              <Button variant="primary" icon={ArrowRight} onClick={() => onFinish("records")}>
                작업 세션 가져오기
              </Button>
              <Button variant="secondary" icon={Radio} onClick={() => onFinish("live")}>
                라이브 세션 보기
              </Button>
            </>
          ) : (
            <Button variant="primary" icon={ArrowRight} onClick={() => onFinish("connections")}>
              연동 살펴보기
            </Button>
          )}
          <Button variant="ghost" onClick={() => onFinish("stay")}>
            둘러보기
          </Button>
        </div>
      </div>
    </div>
  );
}
