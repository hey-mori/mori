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
    detail: "로컬 모델",
    model: "",
    featureId: "settings.localAi.ollama",
  },
  {
    provider: "lmStudio",
    label: "LM Studio",
    detail: "로컬 서버",
    model: "",
    featureId: "settings.localAi.lmStudio",
  },
  {
    provider: "openAiCompatible",
    label: "OpenAI 호환",
    detail: "고급 endpoint",
    model: "",
    featureId: "settings.localAi.openAiCompatible",
  },
  {
    provider: "cloudApi",
    label: "Cloud API",
    detail: "외부 API",
    model: "",
    featureId: "settings.localAi.cloudApi",
  },
];

const START_SESSION_DISABLED_REASON: Partial<Record<LlmProvider, string>> = {
  lmStudio: "아직 연결되지 않았습니다.",
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
