/**
 * Follow-up runner · one detail at a time, cached per detail.
 *
 * Separate from `useLanguageAction` on purpose. The base answer and a follow-up
 * have different lifetimes: the base belongs to the capture and is replaced
 * when the selection changes, while a follow-up belongs to a button press and
 * has to survive the user pressing a second button.
 *
 * Caching matters here more than elsewhere. Pressing 구조, then 문법, then 구조
 * again is the normal way people read, and re-generating the first answer would
 * make the button feel broken. The cache is in-memory and dies with the
 * component, so nothing about it is durable content.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useSessionStore } from "../../app/sessionStore";
import { createAskMoriLlmFromSettings } from "../../lib/ask-mori";
import {
  buildLanguagePrompt,
  parseLanguageResponse,
  DEFAULT_LANGUAGE_PROFILE,
  type LanguageActionResult,
  type LanguageDetail,
  type LanguageProfile,
} from "../../lib/language/languageAction";
import type { LanguageCaptureRequest } from "../../lib/language/languageCapture";
import { classifyProviderError } from "../../lib/language/languageProvider";

export type DetailState =
  | { phase: "idle" }
  | { phase: "loading" }
  | { phase: "streaming"; partial: LanguageActionResult }
  | { phase: "done"; result: LanguageActionResult }
  | { phase: "error"; message: string };

/** A follow-up is one or two sections, so its budget is well under the base. */
const DETAIL_OUTPUT_TOKENS = 400;

export function useLanguageDetail(
  request: LanguageCaptureRequest | null,
  knownTranslation: string | undefined,
  profile: LanguageProfile = DEFAULT_LANGUAGE_PROFILE,
): {
  /** Which detail is on screen, if any. */
  active: LanguageDetail | null;
  state: DetailState;
  /** Press a detail button. Pressing the active one again closes it. */
  toggle: (detail: LanguageDetail) => void;
  /** Details already generated for this capture, for the button's affordance. */
  loaded: ReadonlySet<LanguageDetail>;
} {
  const settings = useSessionStore((state) => state.analysisSettings);
  const [active, setActive] = useState<LanguageDetail | null>(null);
  const [state, setState] = useState<DetailState>({ phase: "idle" });

  const cache = useRef(new Map<LanguageDetail, LanguageActionResult>());
  const controllerRef = useRef<AbortController | null>(null);
  const runIdRef = useRef(0);
  const [loaded, setLoaded] = useState<ReadonlySet<LanguageDetail>>(new Set());

  // A new capture invalidates everything: the follow-ups describe the previous
  // text and showing them against new text would be actively wrong.
  useEffect(() => {
    cache.current.clear();
    setLoaded(new Set());
    setActive(null);
    setState({ phase: "idle" });
    controllerRef.current?.abort();
    controllerRef.current = null;
  }, [request]);

  // Abort whatever is in flight when the surface goes away.
  useEffect(() => () => controllerRef.current?.abort(), []);

  const toggle = useCallback(
    (detail: LanguageDetail) => {
      if (!request) return;

      // Pressing the open one closes it, and stops it if it is still running.
      if (active === detail) {
        controllerRef.current?.abort();
        controllerRef.current = null;
        setActive(null);
        setState({ phase: "idle" });
        return;
      }

      setActive(detail);

      const cached = cache.current.get(detail);
      if (cached) {
        // Re-reading a detail must be instant, not a second generation.
        controllerRef.current?.abort();
        controllerRef.current = null;
        setState({ phase: "done", result: cached });
        return;
      }

      const llm = createAskMoriLlmFromSettings(settings);
      if (!llm) {
        setState({ phase: "error", message: "연결된 분석 엔진이 없습니다." });
        return;
      }

      // Switching details cancels the previous generation for real.
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      const runId = ++runIdRef.current;

      const prompt = buildLanguagePrompt(request, profile, { detail, knownTranslation });
      setState({ phase: "loading" });

      let streamed = "";
      const fresh = () => !controller.signal.aborted && runId === runIdRef.current;

      llm(
        { systemPrompt: prompt.systemPrompt, userPrompt: prompt.userPrompt },
        {
          signal: controller.signal,
          maxOutputTokens: DETAIL_OUTPUT_TOKENS,
          onChunk: (delta) => {
            if (!fresh()) return;
            streamed += delta;
            setState({
              phase: "streaming",
              partial: parseLanguageResponse(
                streamed,
                "understand",
                prompt.detectedLanguage,
                prompt.selectionKind,
              ),
            });
          },
        },
      )
        .then((reply) => {
          if (!fresh()) return;
          const result = parseLanguageResponse(
            reply,
            "understand",
            prompt.detectedLanguage,
            prompt.selectionKind,
          );
          cache.current.set(detail, result);
          setLoaded(new Set(cache.current.keys()));
          setState({ phase: "done", result });
        })
        .catch((error) => {
          if (!fresh()) return;
          setState({ phase: "error", message: classifyProviderError(error).message });
        });
    },
    [request, active, settings, profile, knownTranslation],
  );

  return { active, state, toggle, loaded };
}
