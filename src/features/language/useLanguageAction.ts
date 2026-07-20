/**
 * Language action runner · drives one capture through a provider, with honest
 * states, real cancellation, and full run metadata. Owns no UI shell.
 *
 * Surface-independent by design: it takes a `LanguageCaptureRequest` (which
 * already hides whether the text came from a DOM selection, direct input, or a
 * future OS selection) and returns state. The Context Inspector and the
 * language dialog render it today; the global overlay will render the same
 * states without this hook changing.
 *
 * Cancellation is real, not a flag: each run gets an `AbortController`, so a
 * superseded request (the user switched action, edited the input, or closed the
 * surface) is aborted and can never land on top of a newer one.
 *
 * Running an action never persists anything. Retention stays whatever the
 * capture asked for, and `ephemeral` is the default everywhere.
 */
import { useCallback, useEffect, useState } from "react";
import { useSessionStore } from "../../app/sessionStore";
import { createAskMoriLlmFromSettings } from "../../lib/ask-mori";
import {
  buildLanguagePrompt,
  parseLanguageResponse,
  DEFAULT_LANGUAGE_PROFILE,
  type LanguageProfile,
} from "../../lib/language/languageAction";
import {
  hasActionableText,
  type LanguageCaptureRequest,
} from "../../lib/language/languageCapture";
import {
  classifyProviderError,
  processingLocationLabel,
  type LanguageProvider,
  type LanguageProviderInfo,
  type LanguageRun,
} from "../../lib/language/languageProvider";
import {
  createFixtureProvider,
  isFixtureProviderAvailable,
} from "../../lib/language/fixtureProvider";

export type LanguageActionState =
  | { phase: "idle" }
  | { phase: "no-text" }
  | { phase: "no-engine" }
  | { phase: "loading" }
  | { phase: "done"; run: LanguageRun }
  | { phase: "error"; message: string; kind: string };

/** Resolve the provider for this run: a configured engine first, and the test
 *  fixture only when none exists AND this is a dev/test build. */
function resolveProvider(
  settings: ReturnType<typeof useSessionStore.getState>["analysisSettings"],
): LanguageProvider | null {
  const llm = createAskMoriLlmFromSettings(settings);
  if (llm) {
    const provider = settings?.provider;
    const isLocal = provider === "ollama";
    return {
      info: {
        providerId: provider ?? "unknown",
        providerDisplayName: isLocal ? "Ollama" : "OpenAI 호환",
        // Only a provider we know runs locally is called local; anything else
        // is cloud. We never optimistically assume text stayed on the machine.
        processingLocation: isLocal ? "local" : "cloud",
        supportedActions: ["understand", "express"],
        // Model name only · never the endpoint and never the API key, so a
        // secret can not reach result metadata or a diagnostics view.
        model: (isLocal ? settings?.ollamaModel : settings?.openAiModel) || undefined,
      },
      execute: ({ systemPrompt, userPrompt }) => llm({ systemPrompt, userPrompt }),
    };
  }
  return isFixtureProviderAvailable() ? createFixtureProvider() : null;
}

export function useLanguageAction(
  request: LanguageCaptureRequest | null,
  profile: LanguageProfile = DEFAULT_LANGUAGE_PROFILE,
): {
  state: LanguageActionState;
  provider: LanguageProviderInfo | null;
  retry: () => void;
} {
  const settings = useSessionStore((state) => state.analysisSettings);
  const [state, setState] = useState<LanguageActionState>({ phase: "idle" });
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((count) => count + 1), []);
  const provider = resolveProvider(settings);

  useEffect(() => {
    if (!request) {
      setState({ phase: "idle" });
      return;
    }
    if (!hasActionableText(request)) {
      setState({ phase: "no-text" });
      return;
    }
    const active = resolveProvider(settings);
    if (!active) {
      setState({ phase: "no-engine" });
      return;
    }

    const controller = new AbortController();
    setState({ phase: "loading" });
    const prompt = buildLanguagePrompt(request, profile);
    const startedAt = new Date();

    active
      .execute({
        systemPrompt: prompt.systemPrompt,
        userPrompt: prompt.userPrompt,
        signal: controller.signal,
      })
      .then((reply) => {
        if (controller.signal.aborted) return;
        const completedAt = new Date();
        setState({
          phase: "done",
          run: {
            result: parseLanguageResponse(reply, prompt.action, prompt.detectedLanguage),
            metadata: {
              providerId: active.info.providerId,
              providerDisplayName: active.info.providerDisplayName,
              processingLocation: active.info.processingLocation,
              model: active.info.model,
              startedAt: startedAt.toISOString(),
              completedAt: completedAt.toISOString(),
              latencyMs: completedAt.getTime() - startedAt.getTime(),
              action: prompt.action,
              sourceLanguage: prompt.detectedLanguage,
              targetLanguage: profile.targetLanguage,
              explanationLanguage: profile.explanationLanguage,
              captureOrigin: request.origin,
              acquiredBy: request.context.acquiredBy,
            },
          },
        });
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        const classified = classifyProviderError(error);
        setState({ phase: "error", message: classified.message, kind: classified.kind });
      });

    // Abort the in-flight run when the request, profile, engine, or mount
    // changes, so a stale reply can never overwrite a newer one.
    return () => controller.abort();
  }, [request, profile, settings, attempt]);

  return { state, provider: provider?.info ?? null, retry };
}

export { processingLocationLabel };
