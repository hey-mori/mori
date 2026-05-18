import type { FeatureId, FeatureStatus } from "../../app/featureStatus";
import { FEATURE_STATUS_LABEL, getFeature } from "../../app/featureStatus";
import type { LlmProvider } from "../../domain/types";

export type StartSessionEngineOption = {
  provider: LlmProvider;
  label: string;
  detail: string;
  model: string;
  featureId: FeatureId;
  status: FeatureStatus;
  statusLabel: string;
  selectable: boolean;
  disabledReason?: string;
};

const ENGINE_ROWS: Array<
  Omit<
    StartSessionEngineOption,
    "status" | "statusLabel" | "selectable" | "disabledReason"
  >
> = [
  {
    provider: "ollama",
    label: "Ollama",
    detail: "Settings에서 endpoint와 모델을 구성",
    model: "llama3.1:8b",
    featureId: "settings.localAi.ollama",
  },
  {
    provider: "lmStudio",
    label: "LM Studio",
    detail: "OpenAI-compatible local endpoint",
    model: "local-model",
    featureId: "settings.localAi.lmStudio",
  },
  {
    provider: "openAiCompatible",
    label: "OpenAI-compatible endpoint",
    detail: "vLLM / LocalAI 등 직접 입력 endpoint",
    model: "local-model",
    featureId: "settings.localAi.openAiCompatible",
  },
  {
    provider: "cloudApi",
    label: "Cloud API",
    detail: "명시적 opt-in 전까지 비활성",
    model: "",
    featureId: "settings.localAi.cloudApi",
  },
];

const START_SESSION_DISABLED_REASON: Partial<Record<LlmProvider, string>> = {
  lmStudio: "아직 연결되지 않았습니다.",
  openAiCompatible: "사용자 endpoint 연결은 예정입니다.",
  cloudApi: "명시적 opt-in 설계가 필요합니다.",
};

export function buildStartSessionEngineOptions(): StartSessionEngineOption[] {
  return ENGINE_ROWS.map((row) => {
    const feature = getFeature(row.featureId);
    return {
      ...row,
      status: feature.status,
      statusLabel: feature.userFacingStatus ?? FEATURE_STATUS_LABEL[feature.status],
      selectable: feature.actionEnabled,
      disabledReason: feature.actionEnabled
        ? undefined
        : START_SESSION_DISABLED_REASON[row.provider] ??
          feature.disabledReason ??
          FEATURE_STATUS_LABEL[feature.status],
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
