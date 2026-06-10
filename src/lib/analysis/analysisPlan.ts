/**
 * Analysis plan — a deterministic description of *what* a Quick Pass run will
 * analyze, so the 자료 tab can show "분석 대상: 대화 N턴 (도구 M개 제외) · 추출:
 * 이슈·결정·다음 액션·요약·관계 · 엔진: …" instead of an opaque spinner. Pure,
 * no LLM; mirrors what `buildQuickPassPrompt` actually sends.
 */
import type { TimelineEvent } from "../../domain/types";
import type { QuickPassAnalysisSettings } from "./analysisSettings";
import { providerKindLabel } from "./providerLabels";
import { MAX_LLM_CONVERSATION_EVENTS } from "./promptTemplates";

export type AnalysisPlan = {
  /** Engine the run will use, e.g. "Ollama · gemma4:e4b" or "규칙 기반 (로컬)". */
  engineLabel: string;
  /** Conversation turns the analysis reads (tool events are excluded). */
  targetTurns: number;
  /** Tool events excluded from analysis (machine output). */
  omittedToolEvents: number;
  /** When an LLM engine truncates to the most recent N turns, that N; else null. */
  cappedAt: number | null;
  /** Sources feeding the run. */
  sourceCount: number;
  /** The items the run extracts. */
  extractItems: string[];
};

const EXTRACT_ITEMS = ["이슈", "결정", "다음 액션", "요약", "관계"];

export function buildAnalysisPlan(args: {
  events: readonly TimelineEvent[];
  sourceCount: number;
  settings: QuickPassAnalysisSettings;
}): AnalysisPlan {
  const targetTurns = args.events.filter((event) => event.actor !== "tool").length;
  const omittedToolEvents = args.events.length - targetTurns;
  const usesSingleLlmPrompt = args.settings.provider === "openAiCompatible";
  const cappedAt =
    usesSingleLlmPrompt && targetTurns > MAX_LLM_CONVERSATION_EVENTS
      ? MAX_LLM_CONVERSATION_EVENTS
      : null;

  return {
    engineLabel: engineLabel(args.settings),
    targetTurns,
    omittedToolEvents,
    cappedAt,
    sourceCount: args.sourceCount,
    extractItems: EXTRACT_ITEMS,
  };
}

function engineLabel(settings: QuickPassAnalysisSettings): string {
  if (settings.provider === "ollama") {
    return `${providerKindLabel("ollama")} · ${settings.ollamaModel}`;
  }
  if (settings.provider === "openAiCompatible") {
    return `${providerKindLabel("openAiCompatible")} · ${settings.openAiModel}`;
  }
  return `${providerKindLabel("deterministic")} (로컬)`;
}

/** One-line Korean summary of the plan for the analysis panel. */
export function describeAnalysisPlan(plan: AnalysisPlan): string {
  const target =
    plan.cappedAt !== null
      ? `대화 최근 ${plan.cappedAt}턴`
      : `대화 ${plan.targetTurns}턴`;
  const omitted = plan.omittedToolEvents > 0 ? ` (도구 ${plan.omittedToolEvents}개 제외)` : "";
  return `분석 대상: ${target}${omitted} · 추출: ${plan.extractItems.join(" · ")}`;
}
