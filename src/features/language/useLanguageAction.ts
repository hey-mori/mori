/**
 * Language action runner · drives one capture through a provider, with honest
 * states, real cancellation, a consent gate, and full run metadata. Owns no UI.
 *
 * Surface-independent by design: it takes a `LanguageCaptureRequest` (which
 * already hides whether the text came from a DOM selection, direct input, or an
 * OS selection) and returns state. The Context Inspector, the language dialog,
 * and the global overlay all render the same states.
 *
 * Two properties this hook is responsible for, and the reasons they are here
 * rather than in a surface:
 *
 *  - **Cancellation is real, not a flag.** Each run gets an `AbortController`, so
 *    a superseded request (the user switched action, edited the input, closed
 *    the surface) is aborted and can never land on top of a newer one. A run is
 *    additionally stamped with a monotonic id, because an abort signal does not
 *    stop a promise that already resolved a microtask earlier.
 *  - **Consent gates execution, not display.** The check happens BEFORE
 *    `execute`, so a cloud provider cannot receive text while the UI is still
 *    deciding what to render. Secure input and blocked apps are refused ahead of
 *    any grant.
 *
 * Running an action never persists anything. Retention stays whatever the
 * capture asked for, and `ephemeral` is the default everywhere.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useSessionStore } from "../../app/sessionStore";
import { createAskMoriLlmFromSettings } from "../../lib/ask-mori";
import {
  buildLanguagePrompt,
  parseLanguageResponse,
  DEFAULT_LANGUAGE_PROFILE,
  type LanguageActionResult,
  type LanguageProfile,
  type SelectionKind,
} from "../../lib/language/languageAction";
import {
  hasActionableText,
  type LanguageCaptureRequest,
} from "../../lib/language/languageCapture";
import { evaluateConsent, type ConsentScope } from "../../lib/language/languageConsent";
import {
  grantConsent,
  isAppBlocked,
  listGrants,
} from "../../lib/language/consentStore";
import {
  classifyProviderError,
  processingLocationLabel,
  type LanguageProvider,
  type LanguageProviderInfo,
  type LanguageRun,
  type LanguageRunTiming,
} from "../../lib/language/languageProvider";
import {
  createFixtureProvider,
  isFixtureProviderAvailable,
} from "../../lib/language/fixtureProvider";

export type LanguageActionState =
  | { phase: "idle" }
  | { phase: "no-text" }
  | { phase: "no-engine" }
  /** A cloud or unknown-location provider needs an explicit allow first. */
  | { phase: "consent-required"; provider: LanguageProviderInfo; applicationId?: string }
  /** A hard block. No grant can lift it and no retry is offered. */
  | { phase: "blocked"; reason: "secure-input" | "blocked-app"; applicationId?: string }
  | { phase: "loading" }
  /** Text is arriving. `partial` is parsed on every chunk so completed sections
   *  render while the rest is still generating, rather than after. */
  | { phase: "streaming"; partial: LanguageActionResult }
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
      // Every option is forwarded, including the signal. The old version
      // destructured only the prompts, so the caller's cancellation had
      // nowhere to go and a superseded generation ran to completion.
      execute: ({ systemPrompt, userPrompt, signal, onChunk, maxOutputTokens, onTiming }) =>
        llm({ systemPrompt, userPrompt }, { signal, onChunk, maxOutputTokens, onTiming }),
    };
  }
  return isFixtureProviderAvailable() ? createFixtureProvider() : null;
}

/**
 * Output budget by how much was selected.
 *
 * Output length is the dominant cost once a model is warm: on this hardware
 * generation ran ~400ms for a 23-token translation and 13s for a full
 * multi-section explanation. Capping by selection size keeps a word lookup from
 * being billed like an essay.
 */
function outputBudgetFor(kind: SelectionKind): number {
  switch (kind) {
    case "word":
      return 320;
    case "phrase":
      return 400;
    case "sentence":
      return 560;
    default:
      return 700;
  }
}

/** The app a capture came from, used as the consent and blocklist key. The
 *  process name is preferred over a display name because it does not change
 *  with the document being read. */
function applicationIdOf(request: LanguageCaptureRequest): string | undefined {
  return request.context.processName ?? request.context.appName;
}

export function useLanguageAction(
  request: LanguageCaptureRequest | null,
  profile: LanguageProfile = DEFAULT_LANGUAGE_PROFILE,
): {
  state: LanguageActionState;
  provider: LanguageProviderInfo | null;
  retry: () => void;
  /** Record an allow and immediately re-run. Only reachable from the
   *  consent-required state, and never for a blocked capture. */
  allowProvider: (scope: ConsentScope) => void;
} {
  const settings = useSessionStore((state) => state.analysisSettings);
  const [state, setState] = useState<LanguageActionState>({ phase: "idle" });
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((count) => count + 1), []);
  const provider = resolveProvider(settings);

  // Monotonic run id. `AbortController` stops a fetch, but a provider that
  // already resolved cannot be un-resolved; comparing ids on the way in is what
  // actually prevents a late reply from overwriting a newer one.
  const runIdRef = useRef(0);

  const allowProvider = useCallback(
    (scope: ConsentScope) => {
      if (state.phase !== "consent-required") return;
      grantConsent({
        providerId: state.provider.providerId,
        scope,
        applicationId: state.applicationId,
      });
      setAttempt((count) => count + 1);
    },
    [state],
  );

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

    const applicationId = applicationIdOf(request);
    // Evaluated before anything is built or sent. The two hard blocks are
    // checked inside `evaluateConsent` ahead of any grant.
    const decision = evaluateConsent(
      {
        providerId: active.info.providerId,
        processingLocation: active.info.processingLocation,
        applicationId,
        isSecureInput: request.context.isSecureInput,
        isBlockedApp: isAppBlocked(applicationId),
      },
      listGrants(),
    );

    if (decision.outcome === "blocked") {
      setState({ phase: "blocked", reason: decision.reason, applicationId });
      return;
    }
    if (decision.outcome === "ask") {
      setState({ phase: "consent-required", provider: active.info, applicationId });
      return;
    }

    const controller = new AbortController();
    const runId = ++runIdRef.current;
    setState({ phase: "loading" });
    const prompt = buildLanguagePrompt(request, profile);
    const startedAt = new Date();

    let streamed = "";
    let firstChunkMs: number | undefined;
    let timing: LanguageRunTiming | undefined;

    active
      .execute({
        systemPrompt: prompt.systemPrompt,
        userPrompt: prompt.userPrompt,
        signal: controller.signal,
        maxOutputTokens: outputBudgetFor(prompt.selectionKind),
        onTiming: (reported) => {
          timing = reported;
        },
        onChunk: (delta) => {
          // Guarded like the final result: a chunk from a superseded run must
          // not paint over the newer one.
          if (controller.signal.aborted || runId !== runIdRef.current) return;
          if (firstChunkMs === undefined) firstChunkMs = Date.now() - startedAt.getTime();
          streamed += delta;
          setState({
            phase: "streaming",
            partial: parseLanguageResponse(
              streamed,
              prompt.action,
              prompt.detectedLanguage,
              prompt.selectionKind,
            ),
          });
        },
      })
      .then((reply) => {
        if (controller.signal.aborted || runId !== runIdRef.current) return;
        const completedAt = new Date();
        setState({
          phase: "done",
          run: {
            result: parseLanguageResponse(
              reply,
              prompt.action,
              prompt.detectedLanguage,
              prompt.selectionKind,
            ),
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
              selectionKind: prompt.selectionKind,
              timing,
              firstChunkMs,
            },
          },
        });
      })
      .catch((error) => {
        if (controller.signal.aborted || runId !== runIdRef.current) return;
        const classified = classifyProviderError(error);
        setState({ phase: "error", message: classified.message, kind: classified.kind });
      });

    // Abort the in-flight run when the request, profile, engine, or mount
    // changes, so a stale reply can never overwrite a newer one.
    return () => controller.abort();
  }, [request, profile, settings, attempt]);

  return { state, provider: provider?.info ?? null, retry, allowProvider };
}

export { processingLocationLabel };
