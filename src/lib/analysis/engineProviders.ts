/**
 * Analysis-engine provider registry.
 *
 * "분석 엔진" is the user-facing role: the thing that reads a conversation and
 * extracts issues / decisions / a summary. HOW it does that is a provider — a
 * connection method — and providers are DATA here, not hardcoded UI branches.
 *
 * This is the layer the rest of the system asks "what providers exist, what
 * does each need configured, can it auto-detect models?". Adding Anthropic, a
 * direct llama.cpp binding, or whatever replaces today's standards is a single
 * entry in `ENGINE_PROVIDERS` — no UI, label, or store edit. That keeps the
 * product from being locked to "Ollama" / "OpenAI 호환" as the only axes:
 * brand and protocol names live in this registry, and the abstraction above
 * them (built-in vs LLM connection) is stable.
 */
import type { QuickPassProviderKind } from "./analysisSettings";

/** A field a provider needs the user to configure. */
export type EngineProviderField = "endpoint" | "model" | "apiKey";

export type EngineProviderDescriptor = {
  kind: QuickPassProviderKind;
  /** Display label (brand or protocol). Data, never hardcoded in a component. */
  label: string;
  /** One-line role description, shown in the engine editor / info tooltip. */
  blurb: string;
  /**
   * Whether this provider connects to a language model. `false` is the built-in
   * no-model baseline (규칙 기반); `true` providers form the "LLM 연결" group.
   */
  isLlm: boolean;
  /** Which fields the editor shows for this provider. */
  fields: readonly EngineProviderField[];
  /** Whether installed models can be probed (Ollama, some OpenAI-compatible). */
  supportsModelDetection: boolean;
  /** Seed values when creating a fresh profile for this provider. */
  defaultEndpoint: string;
  defaultModel: string;
};

export const ENGINE_PROVIDERS: readonly EngineProviderDescriptor[] = [
  {
    kind: "deterministic",
    label: "규칙 기반",
    blurb: "모델 없이 기기에서 도는 휴리스틱. 빠르고 비공개이지만 요약은 단순합니다.",
    isLlm: false,
    fields: [],
    supportsModelDetection: false,
    defaultEndpoint: "",
    defaultModel: "",
  },
  {
    kind: "ollama",
    label: "Ollama",
    blurb: "기기에서 도는 로컬 LLM 런타임. 설치된 모델을 자동으로 감지합니다.",
    isLlm: true,
    fields: ["endpoint", "model"],
    supportsModelDetection: true,
    defaultEndpoint: "http://localhost:11434",
    defaultModel: "llama3.1:8b",
  },
  {
    kind: "openAiCompatible",
    label: "OpenAI 호환",
    blurb: "OpenAI 형식 API. 로컬 서버(LM Studio·llama.cpp)일 수도, 원격일 수도 있습니다.",
    isLlm: true,
    fields: ["endpoint", "model", "apiKey"],
    supportsModelDetection: true,
    defaultEndpoint: "http://localhost:1234/v1",
    defaultModel: "local-model",
  },
];

const BY_KIND: Record<QuickPassProviderKind, EngineProviderDescriptor> = Object.fromEntries(
  ENGINE_PROVIDERS.map((provider) => [provider.kind, provider]),
) as Record<QuickPassProviderKind, EngineProviderDescriptor>;

/** The descriptor for a provider kind. Falls back to the built-in engine. */
export function getEngineProvider(kind: QuickPassProviderKind): EngineProviderDescriptor {
  return BY_KIND[kind] ?? BY_KIND.deterministic;
}

/** The LLM-connection providers (everything except the built-in baseline). */
export function llmEngineProviders(): EngineProviderDescriptor[] {
  return ENGINE_PROVIDERS.filter((provider) => provider.isLlm);
}

/** Whether a provider kind connects to a language model. */
export function isLlmProvider(kind: QuickPassProviderKind): boolean {
  return getEngineProvider(kind).isLlm;
}

/** Whether a provider needs a given field configured. */
export function providerNeedsField(
  kind: QuickPassProviderKind,
  field: EngineProviderField,
): boolean {
  return getEngineProvider(kind).fields.includes(field);
}
