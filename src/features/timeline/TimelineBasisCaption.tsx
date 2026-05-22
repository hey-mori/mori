import { Clock, MessagesSquare } from "lucide-react";
import { formatTimeRange } from "../../lib/formatting/time";
import type { ConversationContext } from "../../lib/timeline/conversationFlow";

/**
 * The "what am I looking at" caption that sits above the timeline body.
 *
 * The user's complaint was that they could not tell what the timeline was
 * organised by. This states it plainly — "시간순으로 배치됨" — and, for a
 * conversation session, names the conversation (title · project · turn count
 * · time span) so the basis is never ambiguous.
 */
export function TimelineBasisCaption({
  context,
  isConversation,
  start,
  end,
}: {
  context: ConversationContext | null;
  isConversation: boolean;
  start: string;
  end: string;
}) {
  return (
    <div className="timeline-basis" aria-label="타임라인 기준">
      <span className="timeline-basis-axis">
        <Clock size={13} aria-hidden="true" />
        시간순으로 배치됨
        <span className="timeline-basis-range">{formatTimeRange(start, end)}</span>
      </span>
      {isConversation && context ? (
        <span className="timeline-basis-conversation">
          <MessagesSquare size={13} aria-hidden="true" />
          <span className="timeline-basis-title">{context.title}</span>
          {context.projectLabel ? (
            <span className="timeline-basis-project">{context.projectLabel}</span>
          ) : null}
          <span className="timeline-basis-turns">대화 턴 {context.turnCount}개</span>
        </span>
      ) : null}
    </div>
  );
}
