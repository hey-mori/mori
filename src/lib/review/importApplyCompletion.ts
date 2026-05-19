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
  const eventLabel = input.appliedCount === 1 ? "event" : "events";
  const actions: ImportApplyCompletionAction[] = [
    { id: "timeline", label: "Open Timeline", primary: true },
  ];

  if (!input.hasAnalysis) {
    actions.push({ id: "quickPass", label: "Run Quick Pass", primary: false });
  }

  actions.push({ id: "memory", label: "Open Project Memory", primary: false });

  return {
    headline: `${input.appliedCount} timeline ${eventLabel} applied.`,
    detail: input.hasAnalysis
      ? "The session timeline is updated; Project Memory can use this evidence when you review durable memory."
      : "Run Quick Pass next to derive issues, decisions, next actions, and a stronger Resume Prompt from the imported evidence.",
    actions,
  };
}
