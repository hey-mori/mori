import { Info } from "lucide-react";
import type { ReactNode } from "react";

/**
 * One compact, consistent "this session has no data yet" prompt, shared by
 * every session tab (개요 / 흐름 / 자료 / 검토 / 공유). It sits as a slim banner
 * above each tab's own (empty) layout, so the structure stays visible and the
 * prompt + action read the same everywhere. Keep the title terse
 * ("세션에 가져온 자료 없음"); the hint and action are optional.
 */
export function SessionEmptyPrompt({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="session-empty-prompt" role="status">
      <Info size={15} className="session-empty-prompt-icon" aria-hidden="true" />
      <div className="session-empty-prompt-text">
        <strong>{title}</strong>
        {hint ? <span>{hint}</span> : null}
      </div>
      {action ? <div className="session-empty-prompt-action">{action}</div> : null}
    </div>
  );
}
