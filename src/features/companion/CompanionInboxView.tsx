import { useMemo, useState } from "react";
import { ArrowRight, Compass, ShieldCheck } from "lucide-react";
import { PageHeader } from "../../components/layout/PageHeader";
import { Button } from "../../components/ui/Button";
import { useMoriAppStore } from "../../app/store";
import type { ViewKey } from "../../domain/types";
import {
  companionSeverityTone,
  describeCompanionBasis,
  describeCompanionSeverity,
  summarizeCompanionSignals,
  type CompanionSignal,
  type CompanionSignalSeverity,
  type CompanionSignalSummary,
} from "../../lib/companion/companionSignals";
import { useCompanionSignals } from "./useCompanionSignals";

const SEVERITY_ORDER: CompanionSignalSeverity[] = [
  "risk",
  "review",
  "suggestion",
  "info",
];

type SeverityFilter = CompanionSignalSeverity | "all";

/**
 * Companion Inbox — the Companion Layer's dedicated surface.
 *
 * The calm `CompanionCard` / `CompanionStrip` show a capped few signals
 * inline on work surfaces; this page is the full, filterable feed. Every
 * signal is derived from data the user already imported and reviewed —
 * the inbox never watches anything and never writes memory.
 */
export function CompanionInboxView() {
  const { feed, isDemo } = useCompanionSignals();
  const setCurrentView = useMoriAppStore((state) => state.setCurrentView);
  const [filter, setFilter] = useState<SeverityFilter>("all");

  const summary = useMemo(() => summarizeCompanionSignals(feed), [feed]);
  const visible = useMemo(
    () => (filter === "all" ? feed : feed.filter((signal) => signal.severity === filter)),
    [feed, filter],
  );

  return (
    <div className="page companion-inbox">
      <PageHeader
        title="Mori 노트"
        subtitle="이번 작업에서 살펴볼 신호를 한곳에서 검토합니다. 모두 사용자가 가져온 자료에서 도출되며, Mori가 메모리를 자동으로 쓰지 않습니다."
      />
      <div className="companion-inbox-grid">
        <section className="companion-inbox-main" aria-label="Companion signals">
          <div
            className="companion-inbox-filters"
            role="group"
            aria-label="심각도 필터"
          >
            <FilterChip
              label="전체"
              count={summary.total}
              active={filter === "all"}
              onClick={() => setFilter("all")}
            />
            {SEVERITY_ORDER.map((severity) => (
              <FilterChip
                key={severity}
                label={describeCompanionSeverity(severity)}
                count={summary[severity]}
                tone={severity}
                active={filter === severity}
                onClick={() => setFilter(severity)}
              />
            ))}
          </div>

          {visible.length === 0 ? (
            <p className="companion-inbox-empty">
              {feed.length === 0
                ? "지금은 살펴볼 신호가 없습니다. 새 자료를 가져오거나 Quick Pass를 실행하면 Mori가 다시 짚어 드립니다."
                : "선택한 심각도에 해당하는 신호가 없습니다."}
            </p>
          ) : (
            <ul className="companion-inbox-list">
              {visible.map((signal) => (
                <CompanionSignalRow
                  key={signal.id}
                  signal={signal}
                  onNavigate={setCurrentView}
                />
              ))}
            </ul>
          )}
        </section>

        <CompanionInboxRail summary={summary} isDemo={isDemo} />
      </div>
    </div>
  );
}

function FilterChip({
  label,
  count,
  tone,
  active,
  onClick,
}: {
  label: string;
  count: number;
  tone?: CompanionSignalSeverity;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`companion-inbox-filter ${active ? "is-active" : ""}`}
      aria-pressed={active}
      disabled={count === 0 && !active}
      data-mori-tone={tone ? companionSeverityTone(tone) : undefined}
      onClick={onClick}
    >
      {label} <span className="companion-inbox-filter-count">{count}</span>
    </button>
  );
}

function CompanionSignalRow({
  signal,
  onNavigate,
}: {
  signal: CompanionSignal;
  onNavigate: (view: ViewKey) => void;
}) {
  return (
    <li
      className="companion-signal companion-inbox-row"
      data-mori-tone={companionSeverityTone(signal.severity)}
    >
      <span className="companion-signal-dot" aria-hidden="true" />
      <div className="companion-signal-body">
        <div className="companion-signal-head">
          <strong>{signal.title}</strong>
          <span className="companion-inbox-row-severity">
            {describeCompanionSeverity(signal.severity)}
          </span>
          <span className={`companion-signal-basis basis-${signal.basis}`}>
            {describeCompanionBasis(signal.basis)}
          </span>
        </div>
        <p>{signal.message}</p>
      </div>
      {signal.destination ? (
        <Button onClick={() => onNavigate(signal.destination as ViewKey)}>
          {signal.actionLabel}
        </Button>
      ) : null}
    </li>
  );
}

function CompanionInboxRail({
  summary,
  isDemo,
}: {
  summary: CompanionSignalSummary;
  isDemo: boolean;
}) {
  return (
    <aside className="companion-inbox-rail" aria-label="Companion 요약">
      <section className="companion-inbox-rail-card">
        <header>
          <span className="companion-card-mark" aria-hidden="true">
            <Compass size={15} />
          </span>
          <h3>Companion 요약</h3>
        </header>
        <dl className="companion-inbox-rail-counts">
          {SEVERITY_ORDER.map((severity) => (
            <div key={severity} data-mori-tone={companionSeverityTone(severity)}>
              <dt>{describeCompanionSeverity(severity)}</dt>
              <dd>{summary[severity]}</dd>
            </div>
          ))}
        </dl>
        <p className="companion-inbox-rail-total">
          살펴볼 신호 <strong>{summary.total}</strong>건
        </p>
      </section>

      <section className="companion-inbox-rail-note">
        <ShieldCheck size={14} aria-hidden="true" />
        <p>
          {isDemo
            ? "데모 데이터 기준입니다. Mori는 사용자가 가져온 자료만 사용하며 백그라운드로 감시하지 않습니다."
            : "Mori는 사용자가 명시적으로 가져온 자료만 사용합니다. 메모리는 검토 후에만 저장되며, 자동으로 쓰지 않습니다."}
        </p>
      </section>

      <p className="companion-inbox-rail-hint">
        신호는 제안이며 사실이 아닙니다 <ArrowRight size={11} aria-hidden="true" /> 각 항목을
        검토 화면에서 직접 확인하세요.
      </p>
    </aside>
  );
}
