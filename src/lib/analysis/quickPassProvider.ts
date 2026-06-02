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
