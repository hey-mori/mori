/**
 * Language result surface · shell-agnostic on purpose.
 *
 * This renders the whole language experience (capture provenance, action
 * switch, results, copy, honest failure states) WITHOUT owning a window, a
 * drawer, or an inspector rail. The Context Inspector wraps it inside Mori
 * today; the Windows mini overlay will wrap the same component over another
 * app. Binding this to `BaseInspectorPanel` would have made the global panel a
 * rewrite instead of a reuse.
 *
 * Provenance is always visible: which app the text came from, how it was
 * obtained (`acquiredBy`), which engine answers, and whether the text left the
 * machine. A global capture that silently used the clipboard, or silently went
 * to a cloud provider, would be exactly the surveillance-shaped behaviour the
 * product forbids.
 */
import { useState } from "react";
import { Check, Copy, Languages, PenLine, RotateCcw } from "lucide-react";
import {
  captureText,
  describeCaptureSource,
  type LanguageCaptureRequest,
} from "../../lib/language/languageCapture";
import type { EngineDescriptor, LanguageActionState } from "./useLanguageAction";

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

function engineNote(engine: EngineDescriptor): string {
  if (engine.transport === "local") return `${engine.label} · 이 기기에서 처리`;
  if (engine.transport === "external") return `${engine.label} · 외부로 전송`;
  return engine.label;
}

export function LanguageResultView({
  request,
  state,
  engine,
  onSelectAction,
  onRetry,
}: {
  request: LanguageCaptureRequest;
  state: LanguageActionState;
  engine: EngineDescriptor;
  onSelectAction: (action: "understand" | "express") => void;
  onRetry: () => void;
}) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const text = captureText(request);
  const preview = text.length > 160 ? `${text.slice(0, 160)}…` : text;
  const source = describeCaptureSource(request.context);
  const action = request.action === "express" ? "express" : "understand";

  const copy = (key: string, body: string) => {
    void navigator.clipboard
      .writeText(body)
      .then(() => {
        setCopiedKey(key);
        window.setTimeout(() => setCopiedKey((c) => (c === key ? null : c)), 1500);
      })
      .catch(() => {});
  };

  return (
    <div className="language-result">
      <div className="language-capture">
        <p className="language-capture-text">{preview}</p>
        <p className="language-capture-meta">
          {source ? <span>{source}</span> : null}
          <span>{acquiredByLabel(request.context.acquiredBy)}</span>
          <span className={`language-engine is-${engine.transport}`}>{engineNote(engine)}</span>
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
      </div>

      {state.phase === "no-engine" ? (
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
      ) : state.phase === "done" && state.result.sections.length === 0 ? (
        <p className="language-empty">엔진이 빈 답을 돌려주었습니다.</p>
      ) : state.phase === "done" ? (
        <ul className="language-sections">
          {state.result.sections.map((section, index) => {
            const key = `${section.key}-${index}`;
            return (
              <li key={key} className="language-section">
                <p className="language-section-label">
                  {section.label}
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
                </p>
                <p className="language-section-body">{section.body}</p>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
