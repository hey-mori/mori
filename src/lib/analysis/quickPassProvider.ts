import {
  createDeterministicQuickPassProvider,
  DeterministicQuickPassProvider,
} from "./deterministicQuickPassProvider";
import {
  createOllamaQuickPassProvider,
  OllamaQuickPassProvider,
  type OllamaProviderConfig,
} from "./ollamaProvider";
import {
  createOpenAiCompatibleQuickPassProvider,
  OpenAiCompatibleQuickPassProvider,
  type OpenAiCompatibleProviderConfig,
} from "./openAiCompatibleProvider";
import type { QuickPassAnalysisSettings } from "./analysisSettings";
import type { AnalysisProvider, AnalysisProviderName } from "./analysisTypes";

export type QuickPassProviderConfig =
  | { kind: "deterministic" }
  | { kind: "ollama"; config: OllamaProviderConfig }
  | { kind: "openAiCompatible"; config: OpenAiCompatibleProviderConfig };

export function resolveQuickPassProvider(config: QuickPassProviderConfig): AnalysisProvider {
  if (config.kind === "ollama") return createOllamaQuickPassProvider(config.config);
  if (config.kind === "openAiCompatible") {
    return createOpenAiCompatibleQuickPassProvider(config.config);
  }
  return createDeterministicQuickPassProvider();
}

/** Optional per-call overrides when turning settings into a provider config. */
export type ProviderConfigOverrides = {
  /** Inject a custom fetch (tests, capability probes). */
  fetchImpl?: typeof fetch;
  /** Cap the request timeout instead of the user-configured value. */
  timeoutMs?: number;
};

/**
 * Map the persisted Quick Pass settings onto the discriminated provider
 * config the resolver understands. One source of truth for "selected
 * provider → live config" so the store, the capability check, and any
 * future caller agree on endpoint / model / timeout wiring.
 */
export function buildProviderConfigFromSettings(
  settings: QuickPassAnalysisSettings,
  overrides: ProviderConfigOverrides = {},
): QuickPassProviderConfig {
  if (settings.provider === "ollama") {
    return {
      kind: "ollama",
      config: {
        endpoint: settings.ollamaEndpoint,
        model: settings.ollamaModel,
        timeoutMs: overrides.timeoutMs ?? settings.ollamaTimeoutMs,
        ...(overrides.fetchImpl ? { fetchImpl: overrides.fetchImpl } : {}),
      },
    };
  }
  if (settings.provider === "openAiCompatible") {
    return {
      kind: "openAiCompatible",
      config: {
        baseUrl: settings.openAiBaseUrl,
        model: settings.openAiModel,
        apiKey: settings.openAiApiKey,
        timeoutMs: overrides.timeoutMs ?? settings.openAiTimeoutMs,
        ...(overrides.fetchImpl ? { fetchImpl: overrides.fetchImpl } : {}),
      },
    };
  }
  return { kind: "deterministic" };
}

export function providerNameLabel(name: AnalysisProviderName): string {
  if (name === "ollama-quick-pass-v1") return "Ollama Quick Pass";
  if (name === "openai-compatible-quick-pass-v1") return "OpenAI-compatible Quick Pass";
  return "규칙 기반 Quick Pass";
}

export {
  DeterministicQuickPassProvider,
  OllamaQuickPassProvider,
  OpenAiCompatibleQuickPassProvider,
  createDeterministicQuickPassProvider,
  createOllamaQuickPassProvider,
  createOpenAiCompatibleQuickPassProvider,
};
