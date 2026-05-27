import { ChevronRight, Compass } from "lucide-react";
import type { ViewKey } from "../../domain/types";
import {
  companionSeverityTone,
  type CompanionSignal,
} from "../../lib/companion/companionSignals";

/**
 * Compact Companion affordance for canvas surfaces.
 *
 * The Timeline is a swimlane canvas with no card column, so the full "알림"
 * card does not fit. This one-line strip surfaces only the single
 * highest-priority signal plus a "+N" count, and on click opens the
 * Companion inbox — the full signal feed. Calm and serious — no avatar,
 * no chat. Renders nothing when there is nothing worth surfacing.
 */
export function CompanionStrip({
  signals,
  onNavigate,
}: {
  signals: CompanionSignal[];
  onNavigate: (view: ViewKey) => void;
}) {
  if (signals.length === 0) return null;
  const top = signals[0]!;
  const more = signals.length - 1;

  return (
    <button
      type="button"
      className="companion-strip"
      data-mori-tone={companionSeverityTone(top.severity)}
      onClick={() => onNavigate("companion")}
      title="알림 — 전체 신호 보기"
    >
      <span className="companion-strip-mark" aria-hidden="true">
        <Compass size={14} />
      </span>
      <span className="companion-strip-label">알림</span>
      <span className="companion-strip-dot" aria-hidden="true" />
      <span className="companion-strip-title">{top.title}</span>
      {more > 0 ? <span className="companion-strip-more">+{more}</span> : null}
      <ChevronRight size={14} aria-hidden="true" className="companion-strip-chevron" />
    </button>
  );
}
