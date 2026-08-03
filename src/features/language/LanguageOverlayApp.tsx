/**
 * The global mini overlay · a SHELL, not a second implementation.
 *
 * Everything the user reads here is `LanguageResultView` and `LanguageComposer`,
 * the same components the in-app dialog and the Context Inspector render. This
 * file owns only what is genuinely different about floating over another app:
 * receiving a native capture, deciding which honest state to show when there is
 * no text, and getting out of the way on Escape.
 *
 * Two properties the native window cannot provide on its own:
 *
 *  - **Nothing survives a close.** Every capture gets a fresh `sessionId`, and
 *    the body is keyed on it, so React unmounts the previous tree instead of
 *    reusing it. Reopening after a close can therefore never show the previous
 *    selection or its result, which is the behaviour the ephemeral rule demands.
 *  - **A late capture cannot overwrite a newer one.** The clipboard retry is
 *    async; its result is dropped unless the session it started in is still the
 *    current one.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ClipboardCopy,
  Keyboard,
  Languages,
  Lock,
  Pin,
  PinOff,
  RefreshCw,
  ShieldAlert,
  X,
} from "lucide-react";
import {
  captureViaClipboard,
  closeOverlay,
  recaptureSelection,
  setOverlayPinned,
  CAPTURE_EVENT,
  isNativeHost,
  outcomeContext,
  toCaptureRequest,
  type CaptureOutcome,
  type OverlayPayload,
} from "../../lib/language/nativeCapture";
import { blockApp } from "../../lib/language/consentStore";
import { prewarmLanguageModel } from "../../lib/language/prewarm";
import { availableDetails } from "../../lib/language/languageAction";
import { classifySelection } from "../../lib/language/selectionKind";
import { useLanguageDetail } from "./useLanguageDetail";
import { useSessionStore } from "../../app/sessionStore";
import { LanguageComposer } from "./LanguageComposer";
import { LanguageResultView } from "./LanguageResultView";
import { useLanguageAction } from "./useLanguageAction";

/** A source line built only from context the adapter actually observed. */
function sourceLine(outcome: CaptureOutcome): string | null {
  const context = outcomeContext(outcome);
  const parts = [context.appName, context.windowTitle]
    .map((part) => part?.trim())
    .filter((part): part is string => !!part);
  return parts.length ? parts.join(" · ") : null;
}

export function LanguageOverlayApp() {
  const [payload, setPayload] = useState<OverlayPayload | null>(null);
  const [action, setAction] = useState<"understand" | "express">("understand");
  const [retrying, setRetrying] = useState(false);
  const [pinned, setPinned] = useState(false);
  // Bumped on every capture. Keys the body so a close-and-reopen is a remount,
  // and guards the async clipboard retry against landing in a newer session.
  const [sessionId, setSessionId] = useState(0);
  const sessionRef = useRef(0);

  // This window renders no app shell, so nothing here ever calls the store's
  // full `hydrate`. Without this the overlay ran on default settings and
  // reported "연결된 분석 엔진이 없습니다" while the main window had a working
  // engine configured, and it also missed the native bridge's endpoint
  // allowlist, which would have rejected the request even once found.
  useEffect(() => {
    const settings = useSessionStore.getState().loadAnalysisSettings();
    // Pay the model load before the user asks. Measured cold: 9.9s of a 10.7s
    // first call was the load alone. Not awaited: the overlay must paint now.
    void prewarmLanguageModel(settings);
  }, []);

  const dismiss = useCallback(() => {
    // Cleared before hiding so the next open cannot paint the old capture for
    // even one frame while the window is coming back up.
    setPayload(null);
    setAction("understand");
    void closeOverlay();
  }, []);

  // One capture in, from the native side. Registered once; the listener is torn
  // down on unmount so a hot reload cannot stack two of them.
  useEffect(() => {
    if (!isNativeHost()) return;
    let unlisten: (() => void) | undefined;
    let cancelled = false;

    void import("@tauri-apps/api/event").then(({ listen }) =>
      listen<OverlayPayload>(CAPTURE_EVENT, (event) => {
        setPayload(event.payload);
        setAction("understand");
        setRetrying(false);
        // Mirrored from the native side rather than kept locally, so the toggle
        // can never disagree with what the window actually does.
        setPinned(event.payload.pinned);
        sessionRef.current += 1;
        setSessionId(sessionRef.current);
      }).then((stop) => {
        if (cancelled) stop();
        else unlisten = stop;
      }),
    );

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  // Escape closes from anywhere in the window, including from inside the
  // textarea, because this floats over someone else's work and must be cheap
  // to dismiss.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        dismiss();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [dismiss]);

  const outcome = payload?.outcome ?? null;
  const request = useMemo(
    () => (outcome ? toCaptureRequest(outcome, action) : null),
    [outcome, action],
  );
  const { state, provider, retry, allowProvider } = useLanguageAction(request);

  // The translation the user is already looking at, handed to a follow-up so it
  // grounds on the answer on screen rather than re-deriving it.
  const knownTranslation =
    state.phase === "done"
      ? state.run.result.sections.find((s) => s.key === "translation" || s.key === "meaning")?.body
      : undefined;
  const detail = useLanguageDetail(request, knownTranslation);
  const detailProps = request
    ? {
        available: availableDetails(classifySelection(request.content.text ?? "")),
        active: detail.active,
        loaded: detail.loaded,
        state: detail.state,
        onToggle: detail.toggle,
      }
    : undefined;

  const onClipboardRetry = useCallback(async () => {
    const startedIn = sessionRef.current;
    setRetrying(true);
    try {
      const next = await captureViaClipboard();
      // A retry that returns after the user closed and reopened belongs to a
      // capture that no longer exists.
      if (startedIn !== sessionRef.current) return;
      setPayload((current) =>
        current
          ? { ...current, outcome: next }
          : { outcome: next, clipboardFallbackAvailable: false, pinned },
      );
    } finally {
      if (startedIn === sessionRef.current) setRetrying(false);
    }
  }, [pinned]);

  const onBlockApp = useCallback(
    (applicationId: string) => {
      blockApp(applicationId);
      dismiss();
    },
    [dismiss],
  );

  const togglePin = useCallback(() => {
    setPinned((current) => {
      void setOverlayPinned(!current);
      return !current;
    });
  }, []);

  /** Re-read the selection without closing. The native side hides the window
   *  first, so focus returns to the app underneath before it reads. */
  const onRecapture = useCallback(async () => {
    const startedIn = sessionRef.current;
    setRetrying(true);
    try {
      const next = await recaptureSelection();
      if (startedIn !== sessionRef.current) return;
      setPayload((current) => (current ? { ...current, outcome: next } : current));
    } finally {
      if (startedIn === sessionRef.current) setRetrying(false);
    }
  }, []);

  const source = outcome ? sourceLine(outcome) : null;

  return (
    <div className="language-overlay" role="dialog" aria-modal="true" aria-label="Mori 언어">
      {/* The drag attribute only applies to the element carrying it, so the
          title and its icon repeat it: without that, dragging works on the
          header's bare padding and mysteriously dies over the text. */}
      <header className="language-overlay-head" data-tauri-drag-region>
        <span className="language-overlay-title" data-tauri-drag-region>
          <Languages size={14} aria-hidden="true" data-tauri-drag-region />
          {source ?? "Mori 언어"}
        </span>
        {isNativeHost() ? (
          <>
            <button
              type="button"
              className="language-overlay-icon"
              aria-label="선택 다시 읽기"
              title="선택 다시 읽기"
              onClick={() => void onRecapture()}
              disabled={retrying}
            >
              <RefreshCw size={13} aria-hidden="true" />
            </button>
            <button
              type="button"
              className={`language-overlay-icon${pinned ? " is-on" : ""}`}
              aria-label={pinned ? "위치 고정 해제" : "위치 고정"}
              aria-pressed={pinned}
              title={pinned ? "위치 고정됨 · 이 자리에 계속 열립니다" : "선택한 글 옆에 열립니다"}
              onClick={togglePin}
            >
              {pinned ? <Pin size={13} aria-hidden="true" /> : <PinOff size={13} aria-hidden="true" />}
            </button>
          </>
        ) : null}
        <button
          type="button"
          className="language-overlay-icon"
          aria-label="닫기 (Esc)"
          title="닫기 (Esc)"
          onClick={dismiss}
        >
          <X size={14} aria-hidden="true" />
        </button>
      </header>

      <div className="language-overlay-body base-scroll" key={sessionId}>
        {!outcome ? (
          <p className="language-overlay-empty">단축키를 눌러 선택한 텍스트를 읽어 옵니다.</p>
        ) : outcome.kind === "secureInput" ? (
          <div className="language-blocked" role="alert">
            <p className="language-blocked-head">
              <Lock size={13} aria-hidden="true" />
              비밀번호 입력란입니다. 읽지 않았습니다.
            </p>
            <p className="language-blocked-body">
              보안 입력란은 클립보드 방식으로도 읽지 않습니다.
            </p>
          </div>
        ) : outcome.kind === "permissionDenied" ? (
          <div className="language-blocked" role="alert">
            <p className="language-blocked-head">
              <ShieldAlert size={13} aria-hidden="true" />
              접근성 권한이 없어 선택을 읽지 못했습니다.
            </p>
            <p className="language-blocked-body">
              다른 앱의 선택 텍스트를 읽으려면 Windows 접근성(UI Automation) 접근이 필요합니다.
              아래에 직접 붙여넣으면 권한 없이도 사용할 수 있습니다.
            </p>
          </div>
        ) : null}

        {/* A real selection renders the shared result surface. Anything else
            falls through to the composer, which works on every platform and
            needs no permission. */}
        {request ? (
          <LanguageResultView
            request={request}
            state={state}
            provider={provider}
            onSelectAction={setAction}
            onRetry={retry}
            onAllowProvider={allowProvider}
            onBlockApp={onBlockApp}
            details={detailProps}
          />
        ) : (
          <>
            {outcome?.kind === "noSelection" ? (
              <p className="language-overlay-note">
                <Keyboard size={12} aria-hidden="true" />
                선택한 텍스트를 읽지 못했습니다. 직접 입력하거나 클립보드로 다시 시도하세요.
              </p>
            ) : null}
            {payload?.clipboardFallbackAvailable ? (
              <button
                type="button"
                className="language-overlay-clipboard"
                onClick={() => void onClipboardRetry()}
                disabled={retrying}
              >
                <ClipboardCopy size={13} aria-hidden="true" />
                {retrying ? "복사해서 읽는 중" : "클립보드로 다시 시도"}
              </button>
            ) : null}
            <LanguageComposer autoFocus />
          </>
        )}
      </div>
    </div>
  );
}
