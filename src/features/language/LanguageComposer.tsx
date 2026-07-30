/**
 * Direct-input capture adapter · the SECOND adapter for the Language Loop.
 *
 * Shell-agnostic like `LanguageResultView`: this owns no dialog, window, or
 * rail. Mori hosts it in a small dialog; the Windows mini overlay will host the
 * same component when UI Automation returns nothing and the user falls back to
 * typing. That is the whole reason capture, action, and surface are separate.
 *
 * Language detection never decides the action — the user does. Detection only
 * proposes defaults and warns when the configured pair looks wrong, so a Korean
 * sentence the user wants EXPLAINED stays reachable.
 */
import { useMemo, useState } from "react";
import { Languages, PenLine, Sparkles } from "lucide-react";
import {
  directInputCapture,
  MAX_CAPTURE_LENGTH,
  type LanguageCaptureRequest,
} from "../../lib/language/languageCapture";
import {
  DEFAULT_LANGUAGE_PROFILE,
  detectDominantLanguage,
  type LanguageProfile,
} from "../../lib/language/languageAction";
import { LanguageResultView } from "./LanguageResultView";
import { useLanguageAction } from "./useLanguageAction";

/** Languages offered as defaults. Not a domain limit · the profile is a pair of
 *  free codes, so this list is a convenience the user can outgrow. */
const LANGUAGE_OPTIONS: ReadonlyArray<{ code: string; label: string }> = [
  { code: "ko", label: "한국어" },
  { code: "en", label: "영어" },
  { code: "ja", label: "일본어" },
  { code: "zh", label: "중국어" },
];

function languageLabel(code: string): string {
  return LANGUAGE_OPTIONS.find((option) => option.code === code)?.label ?? code;
}

export function LanguageComposer() {
  const [draft, setDraft] = useState("");
  const [profile, setProfile] = useState<LanguageProfile>(DEFAULT_LANGUAGE_PROFILE);
  const [request, setRequest] = useState<LanguageCaptureRequest | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [purpose, setPurpose] = useState("");

  const { state, provider, retry, allowProvider } = useLanguageAction(request, profile);
  const running = state.phase === "loading";
  const trimmed = draft.trim();

  // A default suggestion only · never an action, never a silent override.
  const detected = useMemo(() => (trimmed ? detectDominantLanguage(trimmed) : "unknown"), [trimmed]);
  const pairWarning =
    detected !== "unknown" && detected === profile.targetLanguage
      ? `입력이 이미 ${languageLabel(detected)}로 보입니다. 표현하기는 목표 언어로 바꿔 줍니다.`
      : null;

  const run = (action: "understand" | "express") => {
    if (!trimmed || running) return;
    setRequest(
      directInputCapture(trimmed, action, {
        // Only what is actually known: the user typed this, and optionally said
        // what it is for. Nothing about an app or window is invented.
        projectHint: purpose.trim() || undefined,
      }),
    );
  };

  return (
    <div className="language-composer">
      <textarea
        className="language-composer-input"
        value={draft}
        onChange={(event) => setDraft(event.target.value.slice(0, MAX_CAPTURE_LENGTH))}
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
            event.preventDefault();
            run("understand");
          }
        }}
        placeholder="이해하고 싶은 문장을 붙여넣거나, 영어로 표현하고 싶은 말을 적으세요"
        aria-label="언어 입력"
        rows={3}
        disabled={running}
      />

      <div className="language-composer-bar">
        <button
          type="button"
          className="language-run"
          onClick={() => run("understand")}
          disabled={!trimmed || running}
        >
          <Languages size={13} aria-hidden="true" />
          이해하기
        </button>
        <button
          type="button"
          className="language-run"
          onClick={() => run("express")}
          disabled={!trimmed || running}
        >
          <PenLine size={13} aria-hidden="true" />
          표현하기
        </button>
        <span className="language-composer-count">
          {trimmed.length}/{MAX_CAPTURE_LENGTH}
        </span>
      </div>

      <div className="language-composer-pair">
        <label>
          설명 언어
          <select
            value={profile.explanationLanguage}
            onChange={(event) =>
              setProfile((current) => ({ ...current, explanationLanguage: event.target.value }))
            }
          >
            {LANGUAGE_OPTIONS.map((option) => (
              <option key={option.code} value={option.code}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          목표 언어
          <select
            value={profile.targetLanguage}
            onChange={(event) =>
              setProfile((current) => ({ ...current, targetLanguage: event.target.value }))
            }
          >
            {LANGUAGE_OPTIONS.map((option) => (
              <option key={option.code} value={option.code}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {pairWarning ? <p className="language-composer-warning">{pairWarning}</p> : null}

      {/* Advanced stays folded · the default path is two languages and a button. */}
      <details
        className="language-advanced"
        open={advancedOpen}
        onToggle={(event) => setAdvancedOpen((event.target as HTMLDetailsElement).open)}
      >
        <summary>목적 · 대상 · 톤</summary>
        <input
          type="text"
          className="language-advanced-input"
          value={purpose}
          onChange={(event) => setPurpose(event.target.value)}
          placeholder="예: 개발 에이전트에게 보내는 지시, 정중한 업무 요청"
          aria-label="목적과 대상"
        />
      </details>

      {request ? (
        <LanguageResultView
          request={request}
          state={state}
          provider={provider}
          onSelectAction={(action) =>
            setRequest((current) => (current ? { ...current, action } : current))
          }
          onRetry={retry}
          onAllowProvider={allowProvider}
        />
      ) : (
        <p className="language-composer-hint">
          <Sparkles size={12} aria-hidden="true" />
          결과는 저장되지 않습니다. 필요한 표현만 나중에 기억할 수 있습니다.
        </p>
      )}
    </div>
  );
}
