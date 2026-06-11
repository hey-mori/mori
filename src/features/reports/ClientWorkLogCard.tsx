/**
 * 작업 로그 — the client-safe scope + billable work log for a session.
 *
 * Rendered in the Reports surface when external sharing (the client-safe report)
 * is on, so a freelancer can hand a client "here is what was worked on, when,
 * for how long" without exposing internal raw detail. The numbers come from the
 * pure `buildClientWorkLog` (real event timestamps via the work phases), so they
 * are honest and never invented. Stays quiet when there is nothing dated to log.
 */
import { useMemo } from "react";
import type { MockSession } from "../../domain/types";
import { buildClientWorkLog } from "../../lib/report/clientWorkLog";

export function ClientWorkLogCard({
  view,
}: {
  view: Pick<MockSession, "events" | "decisions" | "issues">;
}) {
  const log = useMemo(
    () =>
      buildClientWorkLog({
        events: view.events,
        decisions: view.decisions,
        issues: view.issues,
      }),
    [view.events, view.decisions, view.issues],
  );

  if (log.entries.length === 0) return null;

  return (
    <section className="client-work-log" aria-label="작업 로그">
      <header className="client-work-log-head">
        <h3>작업 로그</h3>
        {log.totalDurationLabel ? (
          <span className="client-work-log-total">총 {log.totalDurationLabel}</span>
        ) : null}
      </header>
      <p className="client-work-log-scope">
        <strong>범위</strong> {log.scope.opening}
        {log.scope.additions.length > 0 ? ` · 추가 요청 ${log.scope.additions.length}건` : ""}
      </p>
      <ol className="client-work-log-entries">
        {log.entries.map((entry, index) => (
          <li key={index} className="client-work-log-entry">
            <span className="client-work-log-when">
              {entry.dateLabel}
              {entry.spanLabel ? ` · ${entry.spanLabel}` : ""}
              {entry.durationLabel ? ` · ${entry.durationLabel}` : ""}
            </span>
            <span className="client-work-log-summary">{entry.summary}</span>
            <span className="client-work-log-meta">
              결정 {entry.decisionCount} · 파일 {entry.changedFiles}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
