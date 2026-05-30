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
  const actions: ImportApplyCompletionAction[] = [
    { id: "timeline", label: "Timeline 열기", primary: true },
  ];

  if (!input.hasAnalysis) {
    actions.push({ id: "quickPass", label: "Quick Pass 실행", primary: false });
  }

  actions.push({ id: "memory", label: "Project Memory 열기", primary: false });

  return {
    headline: `타임라인 이벤트 ${input.appliedCount}건이 반영되었습니다.`,
    detail: input.hasAnalysis
      ? "세션 Timeline이 업데이트되었습니다. 영구 메모리를 검토할 때 Project Memory에서 이 근거를 활용할 수 있습니다."
      : "가져온 근거에서 이슈, 결정, 다음 액션, Resume Prompt를 도출하려면 Quick Pass를 실행하세요.",
    actions,
  };
}
