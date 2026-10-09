/**
 * One quiet line when the session on screen is Mori's kept copy because its
 * source could not be read just now: the agent deleted the transcript (Claude
 * Code clears old ones after 30 days by default), moved it, or replaced it.
 *
 * The copy stays on screen because it is real evidence of what was said up to
 * the moment Mori read it. What it is not is the session as it stands, so this
 * says so, with when the copy was taken. The why lives in the InfoHint.
 */
import { FileWarning } from "lucide-react";
import { InfoHint } from "../../components/ui/InfoHint";
import {
  selectRetainedSourceCapturedAt,
  selectRetainedSourceKind,
  useSessionStore,
} from "../../app/sessionStore";
import { formatClaudeRelativeKo } from "../../lib/claude/claudeTauri";

export function RetainedSourceNotice({ now }: { now?: number } = {}) {
  const kind = useSessionStore(selectRetainedSourceKind);
  const capturedAt = useSessionStore(selectRetainedSourceCapturedAt);
  if (!kind || !capturedAt) return null;
  const what = kind === "missing" ? "원본 대화 파일을 찾을 수 없어" : "원본 대화를 지금 읽지 못해";
  return (
    <p className="session-retained-notice" role="status">
      <FileWarning size={13} aria-hidden="true" />
      {what} {formatClaudeRelativeKo(capturedAt, now)}에 가져온 기록을 보여줍니다
      <InfoHint label="가져온 기록 설명">
        에이전트가 대화 파일을 지우거나 옮기면 Mori는 전에 가져온 내용만 보여줄 수 있습니다. Claude
        Code는 기본 설정에서 30일이 지난 대화 파일을 지웁니다. 가져온 뒤에 이어진 대화는 여기에
        없을 수 있습니다.
      </InfoHint>
    </p>
  );
}
