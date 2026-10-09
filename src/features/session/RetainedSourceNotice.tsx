/**
 * One quiet line when the session on screen is Mori's kept copy because its
 * source file is gone: the agent deleted the transcript (Claude Code clears old
 * ones after 30 days by default) or it was moved.
 *
 * The copy stays on screen because it is real evidence of what was said up to
 * its last turn. What it is not is the session as it stands, so this says so,
 * with how far the copy runs. The why lives in the InfoHint.
 */
import { FileWarning } from "lucide-react";
import { InfoHint } from "../../components/ui/InfoHint";
import { selectRetainedSourceLastEventAt, useSessionStore } from "../../app/sessionStore";
import { formatClaudeRelativeKo } from "../../lib/claude/claudeTauri";

export function RetainedSourceNotice({ now }: { now?: number } = {}) {
  const lastEventAt = useSessionStore(selectRetainedSourceLastEventAt);
  if (!lastEventAt) return null;
  return (
    <p className="session-retained-notice" role="status">
      <FileWarning size={13} aria-hidden="true" />
      원본 대화 파일을 찾을 수 없어 Mori가 가져온 기록을 보여줍니다 · 마지막 대화{" "}
      {formatClaudeRelativeKo(lastEventAt, now)}
      <InfoHint label="가져온 기록 설명">
        에이전트가 대화 파일을 지우거나 옮기면 Mori는 전에 가져온 내용만 보여줄 수 있습니다. 예를
        들어 Claude Code는 기본 설정에서 30일이 지난 대화 파일을 지웁니다. 가져온 뒤에 이어진
        대화는 여기에 없을 수 있습니다.
      </InfoHint>
    </p>
  );
}
