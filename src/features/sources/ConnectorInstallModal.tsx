import { Bot, Code2, Infinity, Rocket, Sparkles, X, type LucideIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { BaseStatusBadge } from "../../components/ui/BaseStatusBadge";
import { Button } from "../../components/ui/Button";
import { focusFirstElement, trapTabKey } from "../../components/ui/focusTrap";
import {
  connectClaudeHook,
  loadConnectorStatus,
  uninstallClaudeHook,
  type ConnectorInstallerId,
  type ConnectorStatusViewModel,
} from "../../lib/connectors/installers";

const ICONS: Record<ConnectorInstallerId, LucideIcon> = {
  "claude-code": Sparkles,
  "codex-cli": Code2,
  antigravity: Rocket,
  continue: Infinity,
  cline: Bot,
};

const TITLE_ID = "connector-install-modal-title";

/**
 * Agent connect modal. Detects each agent's status and, for the Claude hook
 * (the one connector that needs a config write), offers one-click 연결 / 연결
 * 해제 driven by the safe install/uninstall engine. Codex and Antigravity are
 * session-discovery, so they only show their auto-detected status. Desktop
 * only: in browser mode the bridge throws and the error is shown honestly.
 */
export function ConnectorInstallModal({ onClose }: { onClose: () => void }) {
  const [models, setModels] = useState<ConnectorStatusViewModel[] | null>(null);
  const [busyId, setBusyId] = useState<ConnectorInstallerId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const reload = useCallback(() => {
    void loadConnectorStatus().then(setModels);
  }, []);

  useEffect(() => {
    previousFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    reload();
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
    // Match SettingsSheet: focus the first focusable element on the next paint
    // so the modal is immediately keyboard-actionable.
    window.requestAnimationFrame(() => focusFirstElement(dialogRef.current));
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
      previousFocusRef.current?.focus();
    };
  }, [onClose, reload]);

  async function run(id: ConnectorInstallerId, action: () => Promise<unknown>) {
    setBusyId(id);
    setError(null);
    try {
      await action();
      reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="settings-sheet-layer" role="presentation">
      <div className="settings-sheet-scrim" onClick={onClose} aria-hidden="true" />
      <div
        ref={dialogRef}
        className="connector-install-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={TITLE_ID}
        tabIndex={-1}
      >
        <header className="settings-sheet-head">
          <div className="settings-sheet-title">
            <strong id={TITLE_ID}>에이전트 연동</strong>
          </div>
          <button
            type="button"
            className="settings-sheet-close"
            onClick={onClose}
            aria-label="닫기"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </header>
        <main className="connector-install-modal-body base-scroll">
          {models === null ? (
            <p className="connector-install-note">감지하는 중...</p>
          ) : (
            models.map((model) => {
              const Icon = ICONS[model.id] ?? Bot;
              const busy = busyId === model.id;
              return (
                <div className="connector-install-row" key={model.id}>
                  <span className="connector-install-icon">
                    <Icon size={16} aria-hidden="true" />
                  </span>
                  <div className="connector-install-text">
                    <span className="connector-install-name">
                      {model.displayName}
                      <BaseStatusBadge tone={model.display.tone}>
                        {model.display.label}
                      </BaseStatusBadge>
                    </span>
                    <span className="connector-install-detail">
                      {model.detail.join(" · ")}
                    </span>
                  </div>
                  <ConnectorAction
                    model={model}
                    busy={busy}
                    onConnect={() =>
                      run(model.id, () => connectClaudeHook({ scope: "global" }))
                    }
                    onDisconnect={() =>
                      run(model.id, () => uninstallClaudeHook({ scope: "global" }))
                    }
                  />
                </div>
              );
            })
          )}
          {error ? <p className="connector-install-error">{error}</p> : null}
          <p className="connector-install-note">
            훅 기반 에이전트는 전역 설정(`~/.claude/settings.json` 등)에 훅을
            연결합니다. 요약만 기록하고, 가져오기는 검토를 거칩니다. 기록 기반
            자동 감지 에이전트는 따로 연결할 필요가 없습니다.
          </p>
        </main>
      </div>
    </div>
  );
}

function ConnectorAction({
  model,
  busy,
  onConnect,
  onDisconnect,
}: {
  model: ConnectorStatusViewModel;
  busy: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
}) {
  // Session-discovery agents (Codex, Antigravity, future discovery anchors) are
  // captured automatically; there is nothing to wire.
  if (model.captureModel === "session-discovery") {
    return <span className="connector-install-auto">자동 감지</span>;
  }
  // config-hook (Claude, plus any future hook-based connector): if connected,
  // offer 연결 해제; if the tool is present but not hooked, offer 연결; else the
  // action is disabled with the honest reason from the product-state model.
  if (model.captureModel === "config-hook") {
    if (model.availability === "available") {
      return (
        <Button
          className="connector-install-action"
          variant="ghost"
          disabled={busy}
          onClick={onDisconnect}
        >
          연결 해제
        </Button>
      );
    }
    const canConnect = model.canInstall;
    return (
      <Button
        className="connector-install-action"
        variant="primary"
        disabled={busy || !canConnect}
        title={canConnect ? "훅을 연결합니다" : model.display.description}
        onClick={onConnect}
      >
        연결
      </Button>
    );
  }
  // Any future capture model: render nothing rather than guess at an action.
  return null;
}
