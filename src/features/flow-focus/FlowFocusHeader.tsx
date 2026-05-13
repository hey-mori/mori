import { Eye, Link } from "lucide-react";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";

export function FlowFocusHeader({
  onShowTimeline,
  hasFocus,
  onClearFocus,
}: {
  onShowTimeline: () => void;
  hasFocus: boolean;
  onClearFocus?: () => void;
}) {
  return (
    <div className="flow-header" role="region" aria-label="Flow Focus controls">
      <div>
        <h2>
          <Eye size={18} /> Flow Focus
        </h2>
        <p>
          Selected, related, and unrelated events are styled in three explicit tiers so you can read the path
          without losing surrounding context.
        </p>
      </div>
      <div className="flow-legend">
        <span><i className="flow-dot focus-selected" /> Selected</span>
        <span><i className="flow-dot focus-related" /> Related flow</span>
        <span><i className="flow-dot focus-context" /> Unrelated context</span>
      </div>
      <div className="flow-actions">
        {hasFocus ? (
          <Badge tone="purple">Trace active</Badge>
        ) : (
          <Badge tone="gray">No focus pinned</Badge>
        )}
        {hasFocus && onClearFocus ? (
          <Button onClick={onClearFocus}>Clear focus</Button>
        ) : null}
        <Button icon={Link} onClick={onShowTimeline}>
          Back to timeline
        </Button>
      </div>
    </div>
  );
}
