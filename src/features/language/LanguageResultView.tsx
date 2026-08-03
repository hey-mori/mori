/**
 * Language result surface · shell-agnostic on purpose.
 *
 * Renders the whole language experience (capture provenance, action switch,
 * results, copy, honest failure states) WITHOUT owning a window, drawer, or
 * inspector rail. The Context Inspector and the language dialog wrap it inside
 * Mori today; the Windows mini overlay will wrap the same component over
 * another app. Binding this to a shell would have made the global panel a
 * rewrite instead of a reuse.
 *
 * Provenance is always visible: which app the text came from, how it was
 * obtained (`acquiredBy`), which provider answered, where it was processed, and
 * how long it took. A capture that silently used a fallback path, or silently
 * went to a cloud vendor, is exactly what the product forbids.
 */
import { useState } from "react";
import { Check, Copy, Languages, Lock, PenLine, RotateCcw, ShieldAlert } from "lucide-react";
import {
  captureText,
  describeCaptureSource,
  type LanguageCaptureRequest,
} from "../../lib/language/languageCapture";
import {
  processingLocationLabel,
  type LanguageProviderInfo,
} from "../../lib/language/languageProvider";
import { selectionKindLabel } from "../../lib/language/selectionKind";
import type { ConsentScope } from "../../lib/language/languageConsent";
import type { LanguageActionState } from "./useLanguageAction";

/** Plain-Korean label for how the text was obtained. Never hidden: a fallback
 *  path must be visible, not silent. */
export function acquiredByLabel(acquiredBy: string): string {
  switch (acquiredBy) {
    case "dom-selection":
      return "화면에서 선택한 텍스트";
    case "manual-input":
      return "직접 입력";
    case "ui-automation":
      return "앱에서 읽은 선택 텍스트";
    case "clipboard-on-invoke":
      return "사용자가 호출한 시점의 클립보드";
    default:
      return acquiredBy;
  }
}

export function LanguageResultView({
  request,
  state,
  provider,
  onSelectAction,
  onRetry,
  onAllowProvider,
  onBlockApp,
}: {
  request: LanguageCaptureRequest;
  state: LanguageActionState;
  provider: LanguageProviderInfo | null;
  onSelectAction: (action: "understand" | "express") => void;
  onRetry: () => void;
  /** Absent in surfaces that cannot grant consent; the prompt then explains
   *  where to allow it instead of offering a button that does nothing. */
  onAllowProvider?: (scope: ConsentScope) => void;
  onBlockApp?: (applicationId: string) => void;
}) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const text = captureText(request);
  const preview = text.length > 160 ? `${text.slice(0, 160)}…` : text;
  const source = describeCaptureSource(request.context);
  const action = request.action === "express" ? "express" : "understand";
  const metadata = state.phase === "done" ? state.run.metadata : null;
  const location = metadata?.processingLocation ?? provider?.processingLocation ?? "unknown";
  const applicationId = request.context.processName ?? request.context.appName;
  const streaming = state.phase === "streaming";
  // One section list for both phases: a partial answer and a finished one are
  // the same shape, so rendering them twice would let them drift apart.
  const sections =
    state.phase === "done"
      ? state.run.result.sections
      : state.phase === "streaming" && state.partial.sections.length > 0
        ? state.partial.sections
        : null;

  const copy = (key: string, body: string) => {
    void navigator.clipboard
      .writeText(body)
      .then(() => {
        setCopiedKey(key);
        window.setTimeout(() => setCopiedKey((c) => (c === key ? null : c)), 1500);
      })
      .catch(() => {});
  };

  const copyAll = () => {
    if (state.phase !== "done") return;
    copy(
      "__all__",
      state.run.result.sections.map((s) => `${s.label}: ${s.body}`).join("\n\n"),
    );
  };

  return (
    <div className="language-result">
      <div className="language-capture">
        <p className="language-capture-text">{preview}</p>
        <p className="language-capture-meta">
          {source ? <span>{source}</span> : null}
          <span>{acquiredByLabel(request.context.acquiredBy)}</span>
          {/* The provider name is dropped when it would just repeat the
              location label (the fixture is called the same thing twice). */}
          {provider && provider.providerDisplayName !== processingLocationLabel(location) ? (
            <span>{provider.providerDisplayName}</span>
          ) : null}
          <span className={`language-engine is-${location}`}>
            {processingLocationLabel(location)}
          </span>
          {metadata ? <span>{selectionKindLabel(metadata.selectionKind)}</span> : null}
          {metadata ? <span>{metadata.latencyMs.toLocaleString()}ms</span> : null}
          {request.retentionIntent === "ephemeral" ? <span>일회성 처리</span> : null}
        </p>
      </div>

      <div className="language-actions" role="group" aria-label="언어 동작">
        <button
          type="button"
          className={`language-action${action === "understand" ? " is-active" : ""}`}
          onClick={() => onSelectAction("understand")}
        >
          <Languages size={13} aria-hidden="true" />
          이해
        </button>
        <button
          type="button"
          className={`language-action${action === "express" ? " is-active" : ""}`}
          onClick={() => onSelectAction("express")}
        >
          <PenLine size={13} aria-hidden="true" />
          표현
        </button>
        {state.phase === "done" && state.run.result.sections.length > 0 ? (
          <button type="button" className="language-copy-all" onClick={copyAll}>
            {copiedKey === "__all__" ? (
              <Check size={12} aria-hidden="true" />
            ) : (
              <Copy size={12} aria-hidden="true" />
            )}
            전체 복사
          </button>
        ) : null}
      </div>

      {state.phase === "blocked" ? (
        <div className="language-blocked" role="alert">
          <p className="language-blocked-head">
            <Lock size={13} aria-hidden="true" />
            {state.reason === "secure-input"
              ? "비밀번호 입력란입니다. 읽지 않았습니다."
              : `${state.applicationId ?? "이 앱"}에서는 사용하지 않도록 설정했습니다.`}
          </p>
          <p className="language-blocked-body">
            {state.reason === "secure-input"
              ? "보안 입력란의 내용은 어떤 경우에도 엔진으로 보내지 않습니다."
              : "설정에서 이 앱의 차단을 해제하면 다시 사용할 수 있습니다."}
          </p>
        </div>
      ) : state.phase === "consent-required" ? (
        <div className="language-consent" role="alert">
          <p className="language-consent-head">
            <ShieldAlert size={13} aria-hidden="true" />
            {state.provider.providerDisplayName}은(는) 외부로 전송됩니다.
          </p>
          <p className="language-consent-body">
            선택한 텍스트가 이 기기를 떠납니다. 허용하기 전에는 아무것도 보내지 않았습니다.
          </p>
          {onAllowProvider ? (
            <div className="language-consent-actions">
              <button
                type="button"
                className="language-consent-allow"
                onClick={() => onAllowProvider("once")}
              >
                이번만 허용
              </button>
              <button
                type="button"
                className="language-consent-allow"
                onClick={() => onAllowProvider("session")}
              >
                이번 실행 동안 허용
              </button>
              <button
                type="button"
                className="language-consent-allow is-broad"
                onClick={() => onAllowProvider("provider")}
              >
                이 엔진 계속 허용
              </button>
            </div>
          ) : (
            <p className="language-consent-body">
              설정에서 이 엔진의 외부 전송을 허용할 수 있습니다.
            </p>
          )}
          {onBlockApp && applicationId ? (
            <button
              type="button"
              className="language-consent-block"
              onClick={() => onBlockApp(applicationId)}
            >
              {applicationId}에서는 사용 안 함
            </button>
          ) : null}
        </div>
      ) : state.phase === "no-engine" ? (
        <p className="language-empty">
          연결된 분석 엔진이 없습니다. 설정에서 Ollama 또는 OpenAI 호환 엔진을 연결하면
          이해와 표현을 사용할 수 있습니다.
        </p>
      ) : state.phase === "no-text" ? (
        <p className="language-empty">읽어 온 텍스트가 없습니다.</p>
      ) : state.phase === "loading" ? (
        <p className="language-loading" role="status">
          문맥을 읽는 중
          <span className="language-loading-dots" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
        </p>
      ) : state.phase === "error" ? (
        <div className="language-error" role="alert">
          <p>{state.message}</p>
          <button type="button" className="language-retry" onClick={onRetry}>
            <RotateCcw size={13} aria-hidden="true" />
            다시 시도
          </button>
        </div>
      ) : state.phase === "done" && state.run.result.sections.length === 0 ? (
        <p className="language-empty">엔진이 빈 답을 돌려주었습니다.</p>
      ) : sections ? (
        <>
          <ul className="language-sections">
            {sections.map((section, index) => {
              const key = `${section.key}-${index}`;
              // While streaming, the last section is still being written. Its
              // copy button is withheld: copying half a sentence looks like a
              // bug rather than a partial result.
              const incomplete = streaming && index === sections.length - 1;
              return (
                <li key={key} className="language-section">
                  <p className="language-section-label">
                    {section.label}
                    {/* An invented example must never read as a quotation from
                        the source the user selected. */}
                    {section.synthetic ? (
                      <span className="language-section-synthetic">엔진이 만든 예시</span>
                    ) : null}
                    {incomplete ? null : (
                      <button
                        type="button"
                        className="language-copy"
                        aria-label={`${section.label} 복사`}
                        onClick={() => copy(key, section.body)}
                      >
                        {copiedKey === key ? (
                          <Check size={12} aria-hidden="true" />
                        ) : (
                          <Copy size={12} aria-hidden="true" />
                        )}
                      </button>
                    )}
                  </p>
                  <p className="language-section-body">
                    {section.body}
                    {incomplete ? <span className="language-cursor" aria-hidden="true" /> : null}
                  </p>
                </li>
              );
            })}
          </ul>
          {streaming ? (
            <p className="language-streaming-note" role="status">
              생성 중
            </p>
          ) : null}
        </>
      ) : streaming ? (
        // Streaming has started but no labelled section has completed yet.
        <p className="language-loading" role="status">
          답변을 쓰는 중
          <span className="language-loading-dots" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
        </p>
      ) : null}
    </div>
  );
}
