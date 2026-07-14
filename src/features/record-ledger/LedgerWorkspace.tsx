/**
 * 기록 · the single record-workspace surface.
 *
 * One screen, no mode tabs: quick capture, a search field, a collapsible
 * month calendar, a collapsible 합계 (tracker) panel, and a journal feed of
 * everything. Items needing review surface inline as a 확인 필요 strip above
 * the feed; provisional records sit in the feed marked 잠정. Search folds in
 * what the old 메모리 hub did (find your accumulated records). Calendar,
 * tracker, and confirm are integrated, not toggled.
 */
import { useMemo, useState } from "react";
import { Check, ChevronDown, LineChart, Sparkles, X } from "lucide-react";
import { PageShell } from "../../components/layout/PageShell";
import { ActionBar } from "../../components/layout/ActionBar";
import { EmptyState } from "../../components/layout/EmptyState";
import { Button } from "../../components/ui/Button";
import { ToolbarSearch } from "../../components/ui/ToolbarSearch";
import { formatClaudeRelativeKo } from "../../lib/claude/claudeTauri";
import type { MoriRecord } from "../../lib/record-kernel/kernelTypes";
import { useRecordLedger, type RecordLedger } from "./useRecordLedger";
import { LedgerRow } from "./LedgerRow";
import { LedgerCalendar } from "./LedgerCalendar";
import { RecordInspector } from "./RecordInspector";
import { dayLabel, groupByActivityDay } from "./calendarGrouping";
import { aggregateTrackers } from "./trackerAggregation";
import { discoverRoutines, routineEntityIds } from "./routineDiscovery";
import { displayTime, ledgerVisibleRecords, schemaLabel } from "./recordPresentation";

export function LedgerWorkspace() {
  const ledger = useRecordLedger();
  const [query, setQuery] = useState("");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [trackerOpen, setTrackerOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const candidates = useMemo(
    () => byNewest(ledger.records.filter((record) => record.status === "candidate")),
    [ledger.records],
  );
  const selected = useMemo(
    () => ledger.records.find((record) => record.id === selectedId) ?? null,
    [ledger.records, selectedId],
  );
  const onSelect = (recordId: string) =>
    setSelectedId((current) => (current === recordId ? null : recordId));

  const search = (
    <ToolbarSearch
      value={query}
      onChange={setQuery}
      ariaLabel="기록 검색"
      className="search-field-fixed"
    />
  );

  return (
    <PageShell maxWidth="full" actionBar={<ActionBar label="기록" start={search} />}>
      <div className={`ledger${selected ? " has-inspector" : ""}`}>
        <div className="ledger-main">
          <QuickCapture capture={ledger.capture} />
          {ledger.loading ? null : (
            <>
              {candidates.length > 0 ? (
                <CandidateStrip candidates={candidates} ledger={ledger} />
              ) : null}
              <LedgerCalendar
                records={ledgerVisibleRecords(ledger.records)}
                selectedDate={selectedDate}
                onSelectDate={setSelectedDate}
              />
              <TrackerPanel ledger={ledger} open={trackerOpen} onToggle={() => setTrackerOpen((v) => !v)} />
              <FeedBody
                ledger={ledger}
                query={query}
                selectedDate={selectedDate}
                selectedId={selectedId}
                onSelect={onSelect}
              />
            </>
          )}
        </div>
        {selected ? (
          <RecordInspector
            record={selected}
            registry={ledger.registry}
            entities={ledger.entities}
            onRenameEntity={(entityId, newName) => void ledger.renameEntity(entityId, newName)}
            onClose={() => setSelectedId(null)}
          />
        ) : null}
      </div>
    </PageShell>
  );
}

function QuickCapture({ capture }: { capture: RecordLedger["capture"] }) {
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const submit = async () => {
    const content = draft.trim();
    if (content.length === 0 || busy) return;
    setBusy(true);
    try {
      const outcome = await capture({ kind: "text", content });
      setDraft("");
      setNotice(describeOutcome(outcome.records.map((item) => item.decision)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <form
        className="ledger-capture"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <textarea
          className="ledger-capture-input"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
              event.preventDefault();
              void submit();
            }
          }}
          placeholder="오늘 한 일, 배운 것, 떠오른 생각을 그냥 적어보세요"
          aria-label="빠른 기록"
          rows={2}
        />
        <div className="ledger-capture-foot">
          <Button
            type="submit"
            variant="primary"
            icon={Sparkles}
            disabled={draft.trim().length === 0 || busy}
          >
            정리
          </Button>
        </div>
      </form>
      {notice ? (
        <p className="ledger-notice" role="status">
          {notice}
        </p>
      ) : null}
    </>
  );
}

/** Records the apply policy could not auto-organize, surfaced inline above the
 *  feed with 반영 / 무시 in place. No separate inbox mode. */
function CandidateStrip({ candidates, ledger }: { candidates: MoriRecord[]; ledger: RecordLedger }) {
  return (
    <section className="ledger-review">
      <header className="ledger-review-head">
        <h2>확인이 필요한 항목</h2>
        <span className="ledger-review-count">{candidates.length}</span>
      </header>
      <ul className="inbox-list">
        {candidates.map((record) => (
          <li key={record.id} className="inbox-card">
            <div className="inbox-card-body">
              <div className="inbox-card-head">
                <span className="inbox-card-kind">{schemaLabel(record, ledger.registry)}</span>
                <span className="inbox-card-title">{record.title}</span>
              </div>
              {record.body && record.body !== record.title ? (
                <p className="inbox-card-summary">{record.body}</p>
              ) : null}
              <span className="inbox-card-time">{formatClaudeRelativeKo(displayTime(record).iso)}</span>
            </div>
            <div className="inbox-card-actions">
              <Button variant="primary" size="sm" icon={Check} onClick={() => void ledger.setStatus(record, "active")}>
                반영
              </Button>
              <Button variant="ghost" size="sm" icon={X} onClick={() => void ledger.setStatus(record, "discarded")}>
                무시
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** A collapsible 합계 panel: the ledger rolled up by type and entity, with
 *  routine suggestions. Collapsed by default; an expandable summary, not a
 *  view mode. */
function TrackerPanel({ ledger, open, onToggle }: { ledger: RecordLedger; open: boolean; onToggle: () => void }) {
  const visible = useMemo(() => ledgerVisibleRecords(ledger.records), [ledger.records]);
  const groups = useMemo(
    () => aggregateTrackers(visible, ledger.relations, ledger.entities, ledger.registry),
    [visible, ledger.relations, ledger.entities, ledger.registry],
  );
  const suggestionByEntity = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const suggestion of discoverRoutines(visible, ledger.relations, ledger.entities, ledger.contexts)) {
      map.set(suggestion.entity.id, suggestion.recordIds);
    }
    return map;
  }, [visible, ledger.relations, ledger.entities, ledger.contexts]);
  const routineIds = useMemo(
    () => routineEntityIds(visible, ledger.relations, ledger.contexts),
    [visible, ledger.relations, ledger.contexts],
  );

  if (groups.length === 0) return null;

  return (
    <div className={`ledger-summary${open ? " is-open" : ""}`}>
      <button type="button" className="ledger-summary-toggle" onClick={onToggle} aria-expanded={open}>
        <LineChart size={14} aria-hidden="true" />
        <span>합계</span>
        <span className="ledger-summary-hint">{groups.length}종류</span>
        <ChevronDown size={14} aria-hidden="true" className="ledger-summary-chevron" />
      </button>
      {open ? (
        <ul className="tracker-list">
          {groups.map((group) => {
            const total =
              group.hasMetric && group.totalMetric > 0 ? `${group.totalMetric}${group.metricUnit ?? ""}` : null;
            return (
              <li key={group.schemaId} className="tracker-group">
                <div className="tracker-group-head">
                  <span className="tracker-group-name">{group.name}</span>
                  <span className="tracker-group-stat">
                    {group.recordCount}회{total ? ` · ${total}` : ""}
                  </span>
                </div>
                {group.entities.length > 0 ? (
                  <ul className="tracker-entities">
                    {group.entities.map((row) => {
                      const suggestion = suggestionByEntity.get(row.entity.id);
                      const isRoutine = routineIds.has(row.entity.id);
                      return (
                        <li key={row.entity.id} className="tracker-entity">
                          <span className="tracker-entity-name">
                            {row.entity.canonicalName}
                            {isRoutine ? <span className="tracker-routine-badge">루틴</span> : null}
                          </span>
                          <span className="tracker-entity-trailing">
                            {suggestion && !isRoutine ? (
                              <button
                                type="button"
                                className="tracker-routine-save"
                                onClick={() => void ledger.createRoutine(row.entity.canonicalName, suggestion)}
                              >
                                루틴으로 저장
                              </button>
                            ) : null}
                            <span className="tracker-entity-stat">
                              {row.count}회
                              {group.hasMetric && row.totalMetric > 0
                                ? ` · ${row.totalMetric}${group.metricUnit ?? ""}`
                                : ""}
                            </span>
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

/** The journal feed: applied records grouped by activity day, newest first,
 *  filtered by the selected calendar day and the search query. */
function FeedBody({
  ledger,
  query,
  selectedDate,
  selectedId,
  onSelect,
}: {
  ledger: RecordLedger;
  query: string;
  selectedDate: string | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const groups = useMemo(() => {
    let visible = ledgerVisibleRecords(ledger.records);
    if (selectedDate) {
      visible = visible.filter((record) => record.occurredStart?.slice(0, 10) === selectedDate);
    }
    const text = query.trim().toLowerCase();
    if (text) {
      visible = visible.filter(
        (record) =>
          record.title.toLowerCase().includes(text) ||
          record.body.toLowerCase().includes(text) ||
          schemaLabel(record, ledger.registry).toLowerCase().includes(text),
      );
    }
    return groupByActivityDay(visible);
  }, [ledger.records, ledger.registry, selectedDate, query]);
  const now = useMemo(() => new Date(), []);

  if (groups.length === 0) {
    const searching = query.trim().length > 0 || selectedDate;
    return searching ? (
      <EmptyState compact icon={Sparkles} title="조건에 맞는 기록이 없습니다" />
    ) : (
      <EmptyState
        compact
        icon={Sparkles}
        title="아직 기록이 없습니다"
        description="위에 무엇이든 적으면 Mori가 활동·지식·기록으로 정리해 여기에 쌓습니다."
      />
    );
  }
  return (
    <>
      {groups.map((group) => (
        <section key={group.date ?? "unknown"} className="calendar-day">
          <h2 className="calendar-day-head">
            {group.date ? dayLabel(group.date, now) : "날짜 미정"}
            <span className="calendar-day-count">{group.records.length}</span>
          </h2>
          <ul className="ledger-list">
            {group.records.map((record) => (
              <LedgerRow
                key={record.id}
                record={record}
                registry={ledger.registry}
                selected={record.id === selectedId}
                onSelect={() => onSelect(record.id)}
                showTime={false}
              />
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}

function byNewest(records: MoriRecord[]): MoriRecord[] {
  return [...records].sort((a, b) => displayTime(b).iso.localeCompare(displayTime(a).iso));
}

function describeOutcome(decisions: Array<"auto" | "provisional" | "confirm">): string {
  if (decisions.length === 0) return "기록할 내용을 찾지 못했습니다.";
  if (decisions.every((decision) => decision === "confirm")) {
    return "확인이 필요한 항목으로 두었습니다. 위에서 검토하세요.";
  }
  if (decisions.some((decision) => decision === "confirm")) {
    return "일부는 정리하고, 일부는 확인이 필요해 위에 두었습니다.";
  }
  if (decisions.some((decision) => decision === "provisional")) {
    return "정리했습니다. 잠정으로 표시된 항목은 언제든 되돌릴 수 있습니다.";
  }
  return "정리했습니다.";
}
