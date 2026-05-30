import { CheckCircle2, Circle, Flag } from "lucide-react";
import { Badge } from "../../components/ui/Badge";
import { priorityLabels } from "../../domain/constants";
import type { DecisionTimelinePoint } from "../../lib/project-memory/projectMemory";
import { formatDateTime } from "../../lib/formatting/time";

const TONE: Record<string, "red" | "orange" | "blue"> = {
  high: "red",
  medium: "orange",
  low: "blue",
};

export function DecisionTimelineCard({ timeline }: { timeline: DecisionTimelinePoint[] }) {
  return (
    <section className="memory-decisions" aria-label="결정 흐름">
      <header className="memory-section-head">
        <div>
          <h3>결정 흐름</h3>
          <p>이번 세션에서 결정이 어떤 순서로, 어떤 중요도로 누적되었는지 보여줍니다.</p>
        </div>
        <Badge tone={timeline.length ? "purple" : "gray"}>{timeline.length}건 결정</Badge>
      </header>
      {timeline.length === 0 ? (
        <p className="memory-empty">결정 후보가 없습니다. Review에서 결정을 확인하거나 Quick Pass를 실행하세요.</p>
      ) : (
        <ol className="memory-decisions-list">
          {timeline.map((point) => (
            <li key={point.decisionId}>
              <span className={`memory-decisions-dot tone-${TONE[point.importance] ?? "blue"}`}>
                {point.confirmed ? <CheckCircle2 size={12} aria-hidden="true" /> : <Circle size={10} aria-hidden="true" />}
              </span>
              <div>
                <strong title={point.title}>{point.title}</strong>
                <span>
                  {formatShort(point.createdAt)} ·{" "}
                  <Badge tone={TONE[point.importance] ?? "blue"}>
                    <Flag size={10} aria-hidden="true" /> {priorityLabels[point.importance]}
                  </Badge>
                </span>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function formatShort(iso: string): string {
  try {
    return formatDateTime(iso);
  } catch {
    return iso;
  }
}
