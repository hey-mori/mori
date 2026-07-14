/**
 * 기록 · the single record-workspace surface (IA consolidation 2026-07-14).
 *
 * One surface over the record kernel with a view switcher (오늘 · 캘린더 ·
 * 트래커), a fixed quick-capture header, and the confirm queue as a 확인 필요
 * chip. Replaces the separate 오늘 / 캘린더 / 트래커 / 인박스 menus: they were
 * all lenses on the same ledger, so they unify at the navigation level while
 * each keeps its own body (architecture doc §8, "specialize at content,
 * unify at navigation").
 */
import { useMemo, useState } from "react";
import { CalendarDays, Check, Inbox, LineChart, Repeat, RotateCcw, Sparkles, Sun, X } from "lucide-react";
import { PageShell } from "../../components/layout/PageShell";
import { ActionBar } from "../../components/layout/ActionBar";
import { EmptyState } from "../../components/layout/EmptyState";
import { Button } from "../../components/ui/Button";
import { formatClaudeRelativeKo } from "../../lib/claude/claudeTauri";
import type { MoriRecord } from "../../lib/record-kernel/kernelTypes";
import { useRecordLedger, type RecordLedger } from "./useRecordLedger";
import { LedgerRow } from "./LedgerRow";
import { RecordInspector } from "./RecordInspector";
import { dayLabel, groupByActivityDay } from "./calendarGrouping";
import { aggregateTrackers } from "./trackerAggregation";
import { discoverRoutines, routineEntityIds } from "./routineDiscovery";
import { displayTime, ledgerVisibleRecords, schemaLabel } from "./recordPresentation";

type LedgerMode = "today" | "calendar" | "tracker" | "inbox";

const MODES: Array<{ key: Exclude<LedgerMode, "inbox">; label: string; icon: typeof Sun }> = [
  { key: "today", label: "오늘", icon: Sun },
  { key: "calendar", label: "캘린더", icon: CalendarDays },
  { key: "tracker", label: "트래커", icon: LineChart },
];

export function LedgerWorkspace() {
  const ledger = useRecordLedger();
  const [mode, setMode] = useState<LedgerMode>("today");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const candidateCount = useMemo(
    () => ledger.records.filter((record) => record.status === "candidate").length,
    [ledger.records],
  );
  const selected = useMemo(
    () =>
      mode === "today" || mode === "calendar"
        ? ledger.records.find((record) => record.id === selectedId) ?? null
        : null,
    [mode, ledger.records, selectedId],
  );

  const switchMode = (next: LedgerMode) => {
    setMode(next);
    setSelectedId(null);
  };
  const onSelect = (recordId: string) =>
    setSelectedId((current) => (current === recordId ? null : recordId));

  const modeSwitch = (
    <div className="ledger-modes" role="tablist" aria-label="기록 보기">
      {MODES.map((option) => (
        <button
          key={option.key}
          type="button"
          role="tab"
          aria-selected={mode === option.key}
          className={`ledger-mode${mode === option.key ? " is-active" : ""}`}
          onClick={() => switchMode(option.key)}
        >
          <option.icon size={14} aria-hidden="true" />
          {option.label}
        </button>
      ))}
    </div>
  );

  const inboxChip = (
    <Button
      variant={mode === "inbox" ? "primary" : "secondary"}
      icon={Inbox}
      onClick={() => switchMode("inbox")}
    >
      확인 필요{candidateCount > 0 ? ` ${candidateCount}` : ""}
    </Button>
  );

  return (
    <PageShell
      maxWidth="full"
      actionBar={<ActionBar label="기록" start={modeSwitch} end={inboxChip} />}
    >
      <div className={`ledger${selected ? " has-inspector" : ""}`}>
        <div className="ledger-main">
          <QuickCapture capture={ledger.capture} />
          {ledger.loading ? null : mode === "today" ? (
            <TodayBody ledger={ledger} selectedId={selectedId} onSelect={onSelect} />
          ) : mode === "calendar" ? (
            <CalendarBody ledger={ledger} selectedId={selectedId} onSelect={onSelect} />
          ) : mode === "tracker" ? (
            <TrackerBody ledger={ledger} />
          ) : (
            <InboxBody ledger={ledger} />
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
          <span className="ledger-capture-hint">운동 · 학습 · 자료 · 메모를 알아서 정리합니다</span>
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

function TodayBody({
  ledger,
  selectedId,
  onSelect,
}: {
  ledger: RecordLedger;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const rows = useMemo(
    () =>
      ledgerVisibleRecords(ledger.records).sort(
        (a, b) => displayTime(b).iso.localeCompare(displayTime(a).iso),
      ),
    [ledger.records],
  );
  if (rows.length === 0) {
    return (
      <EmptyState
        compact
        icon={Sparkles}
        title="아직 기록이 없습니다"
        description="위에 무엇이든 적으면 Mori가 활동·지식·기록으로 정리해 여기에 쌓습니다."
      />
    );
  }
  return (
    <ul className="ledger-list">
      {rows.map((record) => (
        <LedgerRow
          key={record.id}
          record={record}
          registry={ledger.registry}
          selected={record.id === selectedId}
          onSelect={() => onSelect(record.id)}
        />
      ))}
    </ul>
  );
}

function CalendarBody({
  ledger,
  selectedId,
  onSelect,
}: {
  ledger: RecordLedger;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const groups = useMemo(
    () => groupByActivityDay(ledgerVisibleRecords(ledger.records)),
    [ledger.records],
  );
  const now = useMemo(() => new Date(), []);
  if (groups.length === 0) {
    return (
      <EmptyState
        compact
        icon={CalendarDays}
        title="아직 기록이 없습니다"
        description="무엇이든 적으면 활동한 날짜를 기준으로 날짜별로 모입니다."
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

function TrackerBody({ ledger }: { ledger: RecordLedger }) {
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

  if (groups.length === 0) {
    return (
      <EmptyState
        compact
        icon={LineChart}
        title="아직 모을 기록이 없습니다"
        description="운동·학습 같은 기록을 남기면 유형과 항목별로 합계가 여기에 쌓입니다."
      />
    );
  }
  return (
    <ul className="tracker-list">
      {groups.map((group) => {
        const total = group.hasMetric && group.totalMetric > 0 ? `${group.totalMetric}${group.metricUnit ?? ""}` : null;
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
                        {isRoutine ? (
                          <span className="tracker-routine-badge">
                            <Repeat size={11} aria-hidden="true" />
                            루틴
                          </span>
                        ) : null}
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
  );
}

function InboxBody({ ledger }: { ledger: RecordLedger }) {
  const candidates = useMemo(() => byNewest(ledger.records.filter((r) => r.status === "candidate")), [ledger.records]);
  const provisional = useMemo(() => byNewest(ledger.records.filter((r) => r.status === "provisional")), [ledger.records]);

  if (candidates.length === 0 && provisional.length === 0) {
    return (
      <EmptyState
        compact
        icon={Inbox}
        title="확인할 항목이 없습니다"
        description="Mori가 정리하다가 확인이 필요하다고 본 것만 여기에 모입니다."
      />
    );
  }
  return (
    <div className="inbox">
      {candidates.length > 0 ? (
        <section className="inbox-section">
          <header className="inbox-section-head">
            <h2>확인이 필요한 항목</h2>
            <span className="inbox-section-count">{candidates.length}</span>
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
      ) : null}

      {provisional.length > 0 ? (
        <section className="inbox-section">
          <header className="inbox-section-head">
            <h2>자동으로 정리됨</h2>
            <span className="inbox-section-count">{provisional.length}</span>
          </header>
          <p className="inbox-section-note">
            Mori가 정리해 이미 쓰고 있는 잠정 기록입니다. 확정하거나 되돌릴 수 있습니다.
          </p>
          <ul className="inbox-list">
            {provisional.map((record) => (
              <li key={record.id} className="inbox-card is-provisional">
                <div className="inbox-card-body">
                  <div className="inbox-card-head">
                    <span className="inbox-card-kind">{schemaLabel(record, ledger.registry)}</span>
                    <span className="inbox-card-title">{record.title}</span>
                  </div>
                  <span className="inbox-card-time">{formatClaudeRelativeKo(displayTime(record).iso)}</span>
                </div>
                <div className="inbox-card-actions">
                  <Button variant="secondary" size="sm" icon={Check} onClick={() => void ledger.setStatus(record, "active")}>
                    확정
                  </Button>
                  <Button variant="ghost" size="sm" icon={RotateCcw} onClick={() => void ledger.setStatus(record, "discarded")}>
                    되돌리기
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function byNewest(records: MoriRecord[]): MoriRecord[] {
  return [...records].sort((a, b) => displayTime(b).iso.localeCompare(displayTime(a).iso));
}

function describeOutcome(decisions: Array<"auto" | "provisional" | "confirm">): string {
  if (decisions.length === 0) return "기록할 내용을 찾지 못했습니다.";
  if (decisions.every((decision) => decision === "confirm")) {
    return "확인이 필요한 항목으로 두었습니다. 인박스에서 검토하세요.";
  }
  if (decisions.some((decision) => decision === "confirm")) {
    return "일부는 정리하고, 일부는 확인이 필요해 인박스에 두었습니다.";
  }
  if (decisions.some((decision) => decision === "provisional")) {
    return "정리했습니다. 잠정으로 표시된 항목은 언제든 되돌릴 수 있습니다.";
  }
  return "정리했습니다.";
}
