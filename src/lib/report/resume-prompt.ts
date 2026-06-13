import type { MockSession } from "../../domain/types";
import { isNextActionCompleted } from "../session/nextActionCompletion";

/**
 * A pre-analysis fallback resume prompt, grounded in the session's OWN project,
 * title, decisions, issues, and next actions, so it works for any session, not
 * just the Mori product. The previous version hardcoded "you are continuing a
 * session for Mori" and described the Mori app, which actively misled a new AI
 * session opened for a JWT-middleware or invoicing session that has nothing to
 * do with Mori.
 *
 * Once a Quick Pass runs, the analysis provider's richer resume prompt
 * (highlights + grounds) supersedes this; this is the honest raw hand-off shown
 * before that. It states it is pre-analysis so the next session does not treat
 * the raw context as confirmed.
 */
export function buildResumePrompt(data: MockSession): string {
  const title = data.session.title?.trim() || "이 세션";
  const projectName = data.project?.name?.trim();

  const decisions = data.decisions
    .slice(0, 5)
    .map((decision) => `- ${decision.title}${decision.decision ? `: ${decision.decision}` : ""}`)
    .join("\n");
  const openIssues = data.issues
    .filter((issue) => issue.status !== "resolved")
    .slice(0, 5)
    .map(
      (issue, index) =>
        `${index + 1}. ${issue.title}${issue.suggestedNextAction ? `: ${issue.suggestedNextAction}` : ""}`,
    )
    .join("\n");
  const files = data.artifacts
    .filter((artifact) => artifact.path)
    .map((artifact) => `- ${artifact.path}`)
    .join("\n");
  // Completed actions are not future work — keep them out of the resume.
  const nextActions = data.nextActions
    .filter((action) => !isNextActionCompleted(action))
    .map((action) => `- ${action.title}`)
    .join("\n");

  const header = projectName
    ? `"${projectName}" 프로젝트의 세션 "${title}"을(를) 이어서 진행합니다.`
    : `세션 "${title}"을(를) 이어서 진행합니다.`;

  const blocks: string[] = [header];
  blocks.push(`최근 결정:\n${decisions || "- (없음)"}`);
  blocks.push(`미해결 이슈:\n${openIssues || "- (없음)"}`);
  if (files) blocks.push(`변경된 파일:\n${files}`);
  blocks.push(`다음 액션:\n${nextActions || "- (없음)"}`);
  blocks.push(
    "위 맥락을 이어받아 다음 작업을 진행하고, 변경은 검증된 코드로 만들어 주세요. 아직 분석 전 원본 맥락이므로 추정이 섞여 있을 수 있습니다.",
  );
  return blocks.join("\n\n");
}
