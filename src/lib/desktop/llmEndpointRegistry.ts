import type { QuickPassAnalysisSettings } from "../analysis/analysisSettings";
import { isTauriRuntime } from "./environment";
import { invokeTauriCommand } from "./tauriCommands";

/**
 * Registers the engine endpoints with the Rust-side allowlist that gates the
 * native LLM HTTP bridge (`llm_http_request`).
 *
 * The bridge bypasses browser CORS, so Rust only serves origins that came
 * through this registration, which runs exactly on the settings lifecycle
 * (hydrate + save in `sessionStore`). Only the OpenAI-compatible endpoint is
 * flagged to accept an `Authorization` header, so the configured API key can
 * never be replayed against the Ollama origin (or anywhere else). See
 * `docs/design/local-llm-lifecycle.md` §5.2 and `src-tauri/src/llm_endpoints.rs`.
 */

/** Mirrors the Rust `LlmEndpointEntry` (camelCase). */
export type LlmEndpointEntry = {
  url: string;
  allowsAuthorization: boolean;
};

/** The endpoints a settings snapshot authorizes, in registration shape. */
export function buildLlmEndpointEntries(
  settings: Pick<QuickPassAnalysisSettings, "ollamaEndpoint" | "openAiBaseUrl">,
): LlmEndpointEntry[] {
  const entries: LlmEndpointEntry[] = [];
  const ollama = settings.ollamaEndpoint.trim();
  if (ollama) entries.push({ url: ollama, allowsAuthorization: false });
  const openAi = settings.openAiBaseUrl.trim();
  if (openAi) entries.push({ url: openAi, allowsAuthorization: true });
  return entries;
}

/**
 * Fire-and-forget sync of the allowlist. A no-op outside the Tauri runtime
 * (the browser build never reaches the native bridge). Failures are logged,
 * not thrown: settings persistence must not fail because the bridge is
 * unavailable, and the bridge itself rejects unregistered origins anyway.
 */
export async function syncLlmAllowedEndpoints(
  settings: Pick<QuickPassAnalysisSettings, "ollamaEndpoint" | "openAiBaseUrl">,
): Promise<void> {
  if (!isTauriRuntime()) return;
  try {
    await invokeTauriCommand("set_llm_allowed_endpoints", {
      entries: buildLlmEndpointEntries(settings),
    });
  } catch (error) {
    console.warn("LLM endpoint allowlist sync failed", error);
  }
}
