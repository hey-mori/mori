import { Layers } from "lucide-react";
import { Badge } from "../../components/ui/Badge";
import { getSourceDisplayStatus } from "../../lib/sources/traceability";
import type { ProjectMemoryKeyEvidence } from "../../lib/project-memory/projectMemoryModel";

export function KeyEvidenceCard({ rows }: { rows: ProjectMemoryKeyEvidence[] }) {
  return (
    <section className="memory-evidence" aria-label="Key evidence">
      <header className="memory-section-head">
        <div>
          <h3>핵심 Evidence</h3>
          <p>가져온 출처 중 Timeline 이벤트와 가장 많이 연결된 항목을 보여줍니다.</p>
        </div>
        <Badge tone={rows.length ? "purple" : "gray"}>{rows.length} sources</Badge>
      </header>
      {rows.length === 0 ? (
        <p className="memory-empty">아직 가져온 소스가 없습니다. Evidence Hub에서 자료를 추가하세요.</p>
      ) : (
        <ul className="memory-evidence-list">
          {rows.map((row) => {
            const display = getSourceDisplayStatus(row.source);
            return (
              <li key={`${row.sessionId}-${row.source.id}`}>
                <span className="memory-evidence-icon">
                  <Layers size={14} aria-hidden="true" />
                </span>
                <div>
                  <strong title={row.source.title}>{row.source.title}</strong>
                  <span>
                    <Badge tone="purple">{display.integrationLabel}</Badge>
                    <Badge tone={display.trustTone}>{display.trustLabel}</Badge>
                    <Badge tone={row.sessionIsActive ? "green" : "gray"}>
                      {row.sessionIsActive ? "현재 세션" : row.sessionTitle}
                    </Badge>
                    <small>{display.rawDataLabel}</small>
                  </span>
                  <small>
                    {row.relatedEventCount} events
                    {row.relatedIssueCount > 0 ? ` · ${row.relatedIssueCount} issues` : ""}
                    {row.relatedDecisionCount > 0 ? ` · ${row.relatedDecisionCount} decisions` : ""}
                  </small>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
