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
          선택한 이벤트, 관련 이벤트, 무관한 이벤트를 세 단계로 구분해 표시하므로 주변 맥락을 잃지 않고
          흐름을 따라갈 수 있습니다.
        </p>
      </div>
      <div className="flow-legend">
        <span><i className="flow-dot focus-selected" /> 선택됨</span>
        <span><i className="flow-dot focus-related" /> 관련 흐름</span>
        <span><i className="flow-dot focus-context" /> 무관한 맥락</span>
      </div>
      <div className="flow-actions">
        {hasFocus ? (
          <Badge tone="purple">추적 활성</Badge>
        ) : (
          <Badge tone="gray">고정된 포커스 없음</Badge>
        )}
        {hasFocus && onClearFocus ? (
          <Button onClick={onClearFocus}>포커스 해제</Button>
        ) : null}
        <Button icon={Link} onClick={onShowTimeline}>
          타임라인으로 돌아가기
        </Button>
      </div>
    </div>
  );
}
