/**
 * Ask Mori — Local LLM adapter (Slice 2a).
 *
 * Turns the user's existing Quick Pass engine settings into an
 * `AskMoriLlm` port that returns *prose* (not the Quick Pass JSON). It
 * reuses the shipped settings → provider-config mapping
 * (`buildProviderConfigFromSettings`) but does its own HTTP call, because
 * Ask Mori wants a free-form Korean answer rather than a strict JSON
 * object. The existing Quick Pass providers are left untouched, so there
 * is zero regression risk to analysis.
 *
 * `deterministic` → returns `null` (no LLM); the caller
 * (`answerFromMemory`) then uses its deterministic listing fallback.
 *
 * Fetch is injectable for tests; nothing here runs on a timer or watches
 * anything (no A-surface capture).
 */
import type { QuickPassAnalysisSettings } from "../analysis/analysisSettings";
import { describeOllamaFailure } from "../analysis/ollamaProvider";
import type { OllamaProviderConfig } from "../analysis/ollamaProvider";
import type { OpenAiCompatibleProviderConfig } from "../analysis/openAiCompatibleProvider";
import {
  buildProviderConfigFromSettings,
  type ProviderConfigOverrides,
  type QuickPassProviderConfig,
} from "../analysis/quickPassProvider";
import { streamText } from "../desktop/llmStreamBridge";
import { OllamaStreamParser, OpenAiStreamParser } from "./streamParsers";
import type { AskMoriLlm, AskMoriLlmOptions, AskMoriPrompt } from "./askMoriTypes";

const DEFAULT_TIMEOUT_MS = 60_000;

/**
 * Build an `AskMoriLlm` from a resolved provider config. Returns `null`
 * for the deterministic provider (Ask Mori then falls back to listing).
 */
export function createAskMoriLlm(config: QuickPassProviderConfig): AskMoriLlm | null {
  if (config.kind === "ollama") return ollamaAskMoriLlm(config.config);
  if (config.kind === "openAiCompatible") return openAiAskMoriLlm(config.config);
  return null;
}

/** Convenience: map persisted Quick Pass settings to an `AskMoriLlm`. */
export function createAskMoriLlmFromSettings(
  settings: QuickPassAnalysisSettings,
  overrides: ProviderConfigOverrides = {},
): AskMoriLlm | null {
  return createAskMoriLlm(buildProviderConfigFromSettings(settings, overrides));
}

/** How long to keep the model resident after a call.
 *
 *  Measured caveat: this does NOT remove the per-call cost. With the model
 *  confirmed resident in VRAM, Ollama still reports 800-990ms of
 *  `load_duration` per request on this hardware. It is set because unloading
 *  between calls would be strictly worse (a cold load measured ~9.9s), not
 *  because it makes calls fast. */
const KEEP_ALIVE = "10m";

function ollamaAskMoriLlm(config: OllamaProviderConfig): AskMoriLlm {
  return async ({ systemPrompt, userPrompt }: AskMoriPrompt, options?: AskMoriLlmOptions) => {
    const streaming = typeof options?.onChunk === "function";
    const url = `${stripTrailingSlash(config.endpoint)}/api/generate`;
    const body = JSON.stringify({
      model: config.model,
      system: systemPrompt,
      prompt: userPrompt,
      // Prose mode: no `format: "json"` (that is Quick Pass only).
      stream: streaming,
      keep_alive: KEEP_ALIVE,
      ...(options?.maxOutputTokens
        ? { options: { num_predict: options.maxOutputTokens } }
        : {}),
    });

    if (!streaming) {
      const fetchImpl = config.fetchImpl ?? globalFetch();
      if (!fetchImpl) throw new Error("Ask Mori Ollama LLM requires fetch; none available.");
      return withTimeout(config.timeoutMs, options?.signal, async (signal) => {
        const response = await fetchImpl(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal,
          body,
        });
        if (!response.ok) {
          const bodyText = await response.text().catch(() => "");
          throw new Error(describeOllamaFailure(response.status, bodyText));
        }
        const payload = (await response.json()) as { response?: string };
        if (typeof payload.response !== "string") {
          throw new Error("Ollama response missing 'response' string field");
        }
        return payload.response;
      });
    }

    return withTimeout(config.timeoutMs, options?.signal, async (signal) => {
      const parser = new OllamaStreamParser();
      let text = "";
      const result = await streamText(
        { url, method: "POST", headers: { "Content-Type": "application/json" }, body },
        (chunk) => {
          const delta = parser.push(chunk);
          if (delta) {
            text += delta;
            options?.onChunk?.(delta);
          }
        },
        signal,
      );
      const tail = parser.finish();
      if (tail) {
        text += tail;
        options?.onChunk?.(tail);
      }
      if (result.cancelled) throw abortError();
      if (!result.ok) throw new Error(describeOllamaFailure(result.status, text));
      const stats = parser.statistics;
      if (stats) options?.onTiming?.(stats);
      return text;
    });
  };
}

function openAiAskMoriLlm(config: OpenAiCompatibleProviderConfig): AskMoriLlm {
  return async ({ systemPrompt, userPrompt }: AskMoriPrompt, options?: AskMoriLlmOptions) => {
    const streaming = typeof options?.onChunk === "function";
    const url = `${stripTrailingSlash(config.baseUrl)}/chat/completions`;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (config.apiKey?.trim()) headers.Authorization = `Bearer ${config.apiKey.trim()}`;

    const body = JSON.stringify({
      model: config.model,
      temperature: 0.2,
      stream: streaming,
      ...(options?.maxOutputTokens ? { max_tokens: options.maxOutputTokens } : {}),
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });

    if (!streaming) {
      const fetchImpl = config.fetchImpl ?? globalFetch();
      if (!fetchImpl) {
        throw new Error("Ask Mori OpenAI-compatible LLM requires fetch; none available.");
      }
      return withTimeout(config.timeoutMs, options?.signal, async (signal) => {
        const response = await fetchImpl(url, { method: "POST", headers, signal, body });
        if (!response.ok) {
          throw new Error(`OpenAI-compatible request failed with HTTP ${response.status}`);
        }
        const payload = (await response.json()) as {
          choices?: Array<{ message?: { content?: string | Array<{ text?: string }> } }>;
        };
        const content = payload.choices?.[0]?.message?.content;
        if (typeof content === "string") return content;
        if (Array.isArray(content)) {
          const joined = content.map((part) => part.text).filter(Boolean).join("\n");
          if (joined) return joined;
        }
        throw new Error("OpenAI-compatible response missing choices[0].message.content");
      });
    }

    return withTimeout(config.timeoutMs, options?.signal, async (signal) => {
      const parser = new OpenAiStreamParser();
      let text = "";
      const result = await streamText(
        { url, method: "POST", headers, body },
        (chunk) => {
          const delta = parser.push(chunk);
          if (delta) {
            text += delta;
            options?.onChunk?.(delta);
          }
        },
        signal,
      );
      const tail = parser.finish();
      if (tail) {
        text += tail;
        options?.onChunk?.(tail);
      }
      if (result.cancelled) throw abortError();
      if (!result.ok) {
        throw new Error(`OpenAI-compatible request failed with HTTP ${result.status}`);
      }
      return text;
    });
  };
}

// ─── helpers ──────────────────────────────────────────────────────────

/**
 * Run with a timeout that does not discard the caller's cancellation.
 *
 * The previous version created its own controller and passed only that down, so
 * the UI's `AbortSignal` never reached `fetch` and a superseded generation ran
 * to completion. Both signals now abort the same derived controller, so
 * whichever fires first stops the request.
 */
async function withTimeout(
  timeoutMs: number | undefined,
  callerSignal: AbortSignal | undefined,
  run: (signal: AbortSignal | undefined) => Promise<string>,
): Promise<string> {
  if (callerSignal?.aborted) throw abortError();
  if (typeof AbortController === "undefined") return run(callerSignal);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const onCallerAbort = () => controller.abort();
  callerSignal?.addEventListener("abort", onCallerAbort, { once: true });

  try {
    return await run(controller.signal);
  } finally {
    clearTimeout(timer);
    // Removed explicitly: the caller's signal outlives this call, and leaving
    // listeners on it would accumulate one per request for the whole session.
    callerSignal?.removeEventListener("abort", onCallerAbort);
  }
}

function abortError(): DOMException {
  return new DOMException("The operation was aborted.", "AbortError");
}

function stripTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function globalFetch(): typeof fetch | null {
  if (typeof fetch === "function") return fetch.bind(globalThis);
  return null;
}
