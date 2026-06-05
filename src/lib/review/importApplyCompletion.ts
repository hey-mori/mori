export type ImportApplyCompletionActionId = "timeline" | "quickPass" | "memory";

export type ImportApplyCompletionInput = {
  appliedCount: number;
  hasAnalysis: boolean;
};

export type ImportApplyCompletionAction = {
  id: ImportApplyCompletionActionId;
  label: string;
  primary: boolean;
};

export type ImportApplyCompletionViewModel = {
  headline: string;
  detail: string;
  actions: ImportApplyCompletionAction[];
};

export function buildImportApplyCompletion(
  input: ImportApplyCompletionInput,
): ImportApplyCompletionViewModel {
  // Lead with the one meaningful next step. Without analysis that is running it;
  // once analysis exists, the only follow-up is viewing the timeline. The old
  // banner offered up to three actions (including a project-memory jump that is
  // always one nav click away), which buried the actual next move.
  const actions: ImportApplyCompletionAction[] = input.hasAnalysis
    ? [{ id: "timeline", label: "타임라인 열기", primary: true }]
    : [
        { id: "quickPass", label: "분석 실행", primary: true },
        { id: "timeline", label: "타임라인 열기", primary: false },
      ];

  return {
    headline: `타임라인 이벤트 ${input.appliedCount}건이 반영되었습니다.`,
    detail: input.hasAnalysis
      ? "세션 타임라인이 업데이트되었습니다."
      : "분석을 실행하면 이슈 · 결정 · 다음 액션이 정리됩니다.",
    actions,
  };
}
