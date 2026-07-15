/**
 * WeeklyReviewView · the week read back as sentences (R6, screen M8). A body
 * takeover opened from the rail: per-day kind bars, then aggregate rows in
 * plain language (운동 2회 · 1시간 45분, 지난주보다 45분 증가), routine
 * suggestions with one-tap 루틴으로 만들기, and the week's insights. This is
 * where the tracker aggregation and routine discovery (kept as the data layer
 * since R3) finally surface.
 */
import { useMemo, useState } from "react";
import { ListTree, ChevronLeft, ChevronRight, Repeat } from "lucide-react";
import type {
  KernelContext,
  KernelEntity,
  KernelRelation,
  MoriRecord,
} from "../../lib/record-kernel/kernelTypes";
import type { SchemaRegistry } from "../../lib/record-kernel/schemaRegistry";
import { buildWeeklyReview, shiftWeeks } from "./weeklyReview";
import { discoverRoutines, routineEntityIds } from "./routineDiscovery";
import { kindColorClass, schemaLabel } from "./recordPresentation";

function formatMetric(total: number, unit?: string): string {
  if (unit === "분") {
    const hours = Math.floor(total / 60);
    const mins = total % 60;
    if (hours > 0) return `${hours}시간${mins > 0 ? ` ${mins}분` : ""}`;
    return `${mins}분`;
  }
  return `${total}${unit ?? ""}`;
}

export function WeeklyReviewView({
  records,
  registry,
  relations,
  entities,
  contexts,
  onSelectRecord,
  onCreateRoutine,
  onClose,
  now,
}: {
  records: MoriRecord[];
  registry: SchemaRegistry;
  relations: KernelRelation[];
  entities: KernelEntity[];
  contexts: KernelContext[];
  onSelectRecord: (recordId: string) => void;
  onCreateRoutine: (name: string, recordIds: string[]) => void;
  onClose: () => void;
  now: Date;
}) {
  const [anchor, setAnchor] = useState(() => now);
  const review = useMemo(
    () => buildWeeklyReview(records, registry, relations, entities, anchor),
    [records, registry, relations, entities, anchor],
  );
  const routines = useMemo(
    () => discoverRoutines(records, relations, entities, contexts),
    [records, relations, entities, contexts],
  );
  const alreadyRoutine = useMemo(
    () => routineEntityIds(records, relations, contexts),
    [records, relations, contexts],
  );
  const maxDay = Math.max(1, ...review.days.map((day) => day.total));
  const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  return (
    <div className="weekly-review">
      <header className="weekly-review-head">
        <button type="button" className="ledger-calendar-back" onClick={onClose}>
          <ListTree size={14} aria-hidden="true" />
          타임라인으로
        </button>
        <div className="ledger-calendar-nav">
          <button type="button" onClick={() => setAnchor((current) => shiftWeeks(current, -1))} aria-label="지난 주">
            <ChevronLeft size={16} aria-hidden="true" />
          </button>
          <span className="ledger-calendar-month">{review.rangeLabel}</span>
          <button type="button" onClick={() => setAnchor((current) => shiftWeeks(current, 1))} aria-label="다음 주">
            <ChevronRight size={16} aria-hidden="true" />
          </button>
        </div>
        <span className="ledger-calendar-count">기록 {review.total}건</span>
      </header>

      <div className="weekly-bars">
        {review.days.map((day) => (
          <div key={day.date} className="weekly-bar-col">
            <div className="weekly-bar-stack" aria-hidden="true">
              {day.kinds.map((kind) => (
                <span
                  key={kind.schemaId}
                  className={`weekly-bar-seg ${kindColorClass(kind.schemaId)}`}
                  style={{ height: `${(kind.count / maxDay) * 100}%` }}
                />
              ))}
            </div>
            <span className={`weekly-bar-day${day.date === todayIso ? " is-today" : ""}`}>{day.weekday}</span>
          </div>
        ))}
      </div>

      {review.total === 0 ? (
        <p className="weekly-empty">이 주에는 기록이 없습니다.</p>
      ) : (
        <section className="weekly-section">
          <h3 className="weekly-section-title">이번 주 흐름</h3>
          <ul className="weekly-list">
            {review.trackers.map(({ group, deltaMetric }) => {
              const metric = group.hasMetric && group.totalMetric > 0
                ? ` · ${formatMetric(group.totalMetric, group.metricUnit)}`
                : "";
              const delta =
                deltaMetric && deltaMetric !== 0
                  ? `지난주보다 ${formatMetric(Math.abs(deltaMetric), group.metricUnit)} ${deltaMetric > 0 ? "증가" : "감소"}`
                  : null;
              return (
                <li key={group.schemaId} className="weekly-row">
                  <span className={`ledger-cell-dot ${kindColorClass(group.schemaId)}`} aria-hidden="true" />
                  <span className="weekly-row-text">
                    <strong>{group.name} {group.recordCount}회</strong>
                    {metric}
                    {delta ? <span className="weekly-row-delta">{delta}</span> : null}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {routines.length > 0 ? (
        <section className="weekly-section">
          <h3 className="weekly-section-title">반복되는 활동</h3>
          <ul className="weekly-list">
            {routines
              .filter((suggestion) => !alreadyRoutine.has(suggestion.entity.id))
              .map((suggestion) => (
                <li key={suggestion.entity.id} className="weekly-routine">
                  <Repeat size={13} aria-hidden="true" />
                  <span className="weekly-routine-text">
                    {suggestion.entity.canonicalName} {suggestion.recordIds.length}회 반복
                  </span>
                  <button
                    type="button"
                    className="weekly-routine-make"
                    onClick={() => onCreateRoutine(suggestion.entity.canonicalName, suggestion.recordIds)}
                  >
                    루틴으로 만들기
                  </button>
                </li>
              ))}
          </ul>
        </section>
      ) : null}

      {review.insights.length > 0 ? (
        <section className="weekly-section">
          <h3 className="weekly-section-title">이번 주 생각</h3>
          <ul className="weekly-list">
            {review.insights.map((record) => (
              <li key={record.id} className="weekly-insight">
                <button type="button" className="weekly-insight-open" onClick={() => onSelectRecord(record.id)}>
                  <span className="weekly-insight-kind">{schemaLabel(record, registry)}</span>
                  <span className="weekly-insight-title">{record.title}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
