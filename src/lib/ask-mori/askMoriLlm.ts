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
import type { OllamaProviderConfig } from "../analysis/ollamaProvider";
import type { OpenAiCompatibleProviderConfig } from "../analysis/openAiCompatibleProvider";
import {
  buildProviderConfigFromSettings,
  type ProviderConfigOverrides,
  type QuickPassProviderConfig,
} from "../analysis/quickPassProvider";
import type { AskMoriLlm, AskMoriPrompt } from "./askMoriTypes";

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

function ollamaAskMoriLlm(config: OllamaProviderConfig): AskMoriLlm {
  return async ({ systemPrompt, userPrompt }: AskMoriPrompt) => {
    const fetchImpl = config.fetchImpl ?? globalFetch();
    if (!fetchImpl) throw new Error("Ask Mori Ollama LLM requires fetch; none available.");

    return withTimeout(config.timeoutMs, async (signal) => {
      const response = await fetchImpl(`${stripTrailingSlash(config.endpoint)}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal,
        // Prose mode: no `format: "json"` (that is Quick Pass only).
        body: JSON.stringify({
          model: config.model,
          system: systemPrompt,
          prompt: userPrompt,
          stream: false,
        }),
      });
      if (!response.ok) throw new Error(`Ollama request failed with HTTP ${response.status}`);
      const payload = (await response.json()) as { response?: string };
      if (typeof payload.response !== "string") {
        throw new Error("Ollama response missing 'response' string field");
      }
      return payload.response;
    });
  };
}

function openAiAskMoriLlm(config: OpenAiCompatibleProviderConfig): AskMoriLlm {
  return async ({ systemPrompt, userPrompt }: AskMoriPrompt) => {
    const fetchImpl = config.fetchImpl ?? globalFetch();
    if (!fetchImpl) throw new Error("Ask Mori OpenAI-compatible LLM requires fetch; none available.");

    return withTimeout(config.timeoutMs, async (signal) => {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (config.apiKey?.trim()) headers.Authorization = `Bearer ${config.apiKey.trim()}`;

      const response = await fetchImpl(`${stripTrailingSlash(config.baseUrl)}/chat/completions`, {
        method: "POST",
        headers,
        signal,
        body: JSON.stringify({
          model: config.model,
          temperature: 0.2,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
        }),
      });
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
  };
}

// ─── helpers ──────────────────────────────────────────────────────────

async function withTimeout(
  timeoutMs: number | undefined,
  run: (signal: AbortSignal | undefined) => Promise<string>,
): Promise<string> {
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = controller
    ? setTimeout(() => controller.abort(), timeoutMs ?? DEFAULT_TIMEOUT_MS)
    : null;
  try {
    return await run(controller?.signal);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function stripTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function globalFetch(): typeof fetch | null {
  if (typeof fetch === "function") return fetch.bind(globalThis);
  return null;
}
