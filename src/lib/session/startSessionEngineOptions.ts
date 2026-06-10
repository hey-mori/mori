import type { FeatureId, FeatureStatus } from "../../app/featureStatus";
import { FEATURE_STATUS_LABEL, getFeature } from "../../app/featureStatus";
import type { LlmProvider } from "../../domain/types";

/**
 * The Start Session engine picker offers the same three analysis engines as
 * Settings → 분석 엔진, in the same order and vocabulary: a no-model baseline
 * first, then the two model protocols. Engines are categorized by how Mori
 * connects (protocol), not by where they run — an OpenAI-compatible endpoint
 * can be a local server (LM Studio, llama.cpp) or a remote API. 규칙 기반 needs
 * no connection so it is always selectable; the model engines follow the
 * feature-status registry.
 */
export type StartSessionEngineOption = {
  provider: LlmProvider;
  label: string;
  detail: string;
  model: string;
  featureId?: FeatureId;
  status: FeatureStatus;
  statusLabel: string;
  selectable: boolean;
  disabledReason?: string;
};

type EngineRow = {
  provider: LlmProvider;
  label: string;
  detail: string;
  model: string;
  featureId?: FeatureId;
  /** 규칙 기반 runs without any connection, so it is always available. */
  alwaysSelectable?: boolean;
};

const ENGINE_ROWS: EngineRow[] = [
  {
    provider: "deterministic",
    label: "규칙 기반",
    detail: "모델 없이 · 외부 전송 없음",
    model: "",
    alwaysSelectable: true,
  },
  {
    provider: "ollama",
    label: "Ollama",
    detail: "기기에서 도는 로컬 LLM 런타임",
    model: "llama3.1:8b",
    featureId: "settings.localAi.ollama",
  },
  {
    provider: "openAiCompatible",
    label: "OpenAI 호환",
    detail: "OpenAI 호환 엔드포인트 · 로컬 또는 외부",
    model: "local-model",
    featureId: "settings.localAi.openAiCompatible",
  },
];

export function buildStartSessionEngineOptions(): StartSessionEngineOption[] {
  return ENGINE_ROWS.map((row) => {
    if (row.alwaysSelectable || !row.featureId) {
      return {
        ...row,
        status: "implemented",
        statusLabel: FEATURE_STATUS_LABEL.implemented,
        selectable: true,
      };
    }
    const feature = getFeature(row.featureId);
    return {
      ...row,
      status: feature.status,
      statusLabel: feature.userFacingStatus ?? FEATURE_STATUS_LABEL[feature.status],
      selectable: feature.actionEnabled,
      disabledReason: feature.actionEnabled
        ? undefined
        : feature.disabledReason ?? FEATURE_STATUS_LABEL[feature.status],
    };
  });
}

export function getDefaultStartSessionEngineOption(): StartSessionEngineOption {
  const options = buildStartSessionEngineOptions();
  const selectable = options.find((option) => option.selectable);
  if (!selectable) {
    throw new Error("Start Session requires at least one selectable engine option.");
  }
  return selectable;
}

export function coerceStartSessionEngineProvider(
  provider: LlmProvider,
): LlmProvider {
  const options = buildStartSessionEngineOptions();
  const option = options.find((candidate) => candidate.provider === provider);
  return option?.selectable
    ? option.provider
    : getDefaultStartSessionEngineOption().provider;
}
