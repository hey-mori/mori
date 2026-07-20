/**
 * Language action runner · drives one capture through an engine, with honest
 * states and no UI shell of its own.
 *
 * Deliberately surface-independent: it takes a `LanguageCaptureRequest` (which
 * already hides whether the text came from a DOM selection, direct input, or a
 * future OS selection) and returns state. The Context Inspector renders it
 * today; the global mini overlay will render the same states without this hook
 * changing, which is the point of splitting capture from action from surface.
 *
 * States are honest, never faked: with no engine configured (규칙 기반) it says
 * so instead of inventing an answer, and an engine error keeps its reason and a
 * retry. Running an action never persists anything — retention stays whatever
 * the capture asked for, and `ephemeral` is the default everywhere.
 */
import { useCallback, useEffect, useState } from "react";
import { useSessionStore } from "../../app/sessionStore";
import { createAskMoriLlmFromSettings } from "../../lib/ask-mori";
import {
  buildLanguagePrompt,
  parseLanguageResponse,
  DEFAULT_LANGUAGE_PROFILE,
  type LanguageActionResult,
  type LanguageProfile,
} from "../../lib/language/languageAction";
import {
  hasActionableText,
  type LanguageCaptureRequest,
} from "../../lib/language/languageCapture";

export type LanguageActionState =
  | { phase: "idle" }
  | { phase: "no-text" }
  | { phase: "no-engine" }
  | { phase: "loading" }
  | { phase: "done"; result: LanguageActionResult }
  | { phase: "error"; message: string };

/** Where the answer is computed, shown so the user always knows whether their
 *  captured text left the machine. */
export type EngineTransport = "local" | "external" | "none";

export type EngineDescriptor = {
  /** Display name, e.g. "Ollama" or "OpenAI 호환". */
  label: string;
  transport: EngineTransport;
};

/** Read the configured engine as a user-facing descriptor. Local providers keep
 *  captured text on the machine; an OpenAI-compatible endpoint may not, so the
 *  distinction is surfaced rather than buried in settings. */
export function describeEngine(provider: string | undefined): EngineDescriptor {
  switch (provider) {
    case "ollama":
      return { label: "Ollama", transport: "local" };
    case "openai-compatible":
      return { label: "OpenAI 호환", transport: "external" };
    default:
      return { label: "규칙 기반", transport: "none" };
  }
}

export function useLanguageAction(
  request: LanguageCaptureRequest | null,
  profile: LanguageProfile = DEFAULT_LANGUAGE_PROFILE,
): {
  state: LanguageActionState;
  engine: EngineDescriptor;
  retry: () => void;
} {
  const settings = useSessionStore((state) => state.analysisSettings);
  const [state, setState] = useState<LanguageActionState>({ phase: "idle" });
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((count) => count + 1), []);
  const engine = describeEngine(settings?.provider);

  useEffect(() => {
    if (!request) {
      setState({ phase: "idle" });
      return;
    }
    if (!hasActionableText(request)) {
      setState({ phase: "no-text" });
      return;
    }
    const llm = createAskMoriLlmFromSettings(settings);
    if (!llm) {
      setState({ phase: "no-engine" });
      return;
    }

    let cancelled = false;
    setState({ phase: "loading" });
    const prompt = buildLanguagePrompt(request, profile);
    llm({ systemPrompt: prompt.systemPrompt, userPrompt: prompt.userPrompt })
      .then((reply) => {
        if (cancelled) return;
        setState({
          phase: "done",
          result: parseLanguageResponse(reply, prompt.action, prompt.detectedLanguage),
        });
      })
      .catch((error) => {
        if (cancelled) return;
        setState({
          phase: "error",
          message: error instanceof Error ? error.message : "엔진 호출에 실패했습니다.",
        });
      });
    // A superseded request (the user switched action or selected new text) must
    // not land after the newer one.
    return () => {
      cancelled = true;
    };
  }, [request, profile, settings, attempt]);

  return { state, engine, retry };
}
