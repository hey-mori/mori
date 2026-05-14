import { Layers } from "lucide-react";
import { Badge } from "../../components/ui/Badge";
import type { KeyEvidenceRow } from "../../lib/project-memory/projectMemory";

export function KeyEvidenceCard({ rows }: { rows: KeyEvidenceRow[] }) {
  return (
    <section className="memory-evidence" aria-label="Key evidence">
      <header className="memory-section-head">
        <div>
          <h3>핵심 Evidence</h3>
          <p>현재 세션에서 가장 많은 Timeline 이벤트와 연결된 출처입니다.</p>
        </div>
        <Badge tone={rows.length ? "purple" : "gray"}>{rows.length} sources</Badge>
      </header>
      {rows.length === 0 ? (
        <p className="memory-empty">아직 가져온 소스가 없습니다. Evidence Hub에서 자료를 추가하세요.</p>
      ) : (
        <ul className="memory-evidence-list">
          {rows.map(({ source, display, relatedEventCount, relatedIssueCount, relatedDecisionCount }) => (
            <li key={source.id}>
              <span className="memory-evidence-icon">
                <Layers size={14} aria-hidden="true" />
              </span>
              <div>
                <strong title={source.title}>{source.title}</strong>
                <span>
                  <Badge tone="purple">{display.integrationLabel}</Badge>
                  <Badge tone={display.trustTone}>{display.trustLabel}</Badge>
                  <small>{display.rawDataLabel}</small>
                </span>
                <small>
                  {relatedEventCount} events
                  {relatedIssueCount > 0 ? ` · ${relatedIssueCount} issues` : ""}
                  {relatedDecisionCount > 0 ? ` · ${relatedDecisionCount} decisions` : ""}
                </small>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
