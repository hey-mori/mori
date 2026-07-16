/**
 * NoteExplorer · the ledger list of the 기록 workspace (v3 · Daily Ledger,
 * docs/design/record-workspace/v3-daily-ledger.md).
 *
 * The list reads as days accumulating: sticky 오늘/어제/dated headers over
 * two-line rows (kind dot · title · body snippet · trailing time). 프로젝트별
 * remains the alternative lens behind the single 보기 menu; the pinned 확인할
 * 것 group holds records that need a decision. ＋ starts a capture in the
 * canvas.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Plus, Search, SlidersHorizontal } from "lucide-react";
import type { MoriRecord } from "../../lib/record-kernel/kernelTypes";
import type { RecordLedger } from "./useRecordLedger";
import {
  buildExplorerGroups,
  recordSnippet,
  recordTypeFacets,
  shortDateLabel,
  timeOfDayLabel,
  type ExplorerGroupMode,
  type ExplorerSort,
} from "./noteExplorerModel";
import { kindColorClass, ledgerVisibleRecords, schemaLabel } from "./recordPresentation";

export function NoteExplorer({
  ledger,
  query,
  onQuery,
  sort,
  onSort,
  selectedId,
  candidates,
  dateUnknown,
  composing,
  onSelect,
  onNew,
  now,
}: {
  ledger: RecordLedger;
  query: string;
  onQuery: (value: string) => void;
  sort: ExplorerSort;
  onSort: (sort: ExplorerSort) => void;
  selectedId: string | null;
  candidates: MoriRecord[];
  dateUnknown: MoriRecord[];
  composing: boolean;
  onSelect: (recordId: string) => void;
  onNew: () => void;
  now: Date;
}) {
  const [groupMode, setGroupMode] = useState<ExplorerGroupMode>("day");
  const [typeFilter, setTypeFilter] = useState<string | null>(null);

  const text = query.trim().toLowerCase();
  const matches = (record: MoriRecord) =>
    !text ||
    record.title.toLowerCase().includes(text) ||
    record.body.toLowerCase().includes(text) ||
    schemaLabel(record, ledger.registry).toLowerCase().includes(text);

  const visibleRecords = useMemo(() => ledgerVisibleRecords(ledger.records), [ledger.records]);
  // Extractions (records derived-from a note) live inside their note's 추출
  // panel, not as separate list rows — so the list stays one row per note.
  const derivedIds = useMemo(
    () =>
      new Set(
        ledger.relations
          .filter((relation) => relation.type === "derived-from")
          .map((relation) => relation.fromRecordId),
      ),
    [ledger.relations],
  );
  // Facets over the same set the list can show (derived excluded), so a chip
  // never counts rows that cannot appear. Still schema-driven and extensible.
  const facets = useMemo(
    () =>
      recordTypeFacets(
        visibleRecords.filter((record) => !derivedIds.has(record.id)),
        ledger.registry,
      ),
    [visibleRecords, derivedIds, ledger.registry],
  );

  const pinnedIds = useMemo(
    () => new Set([...candidates, ...dateUnknown].map((record) => record.id)),
    [candidates, dateUnknown],
  );
  const pinned = useMemo(
    () => [...candidates, ...dateUnknown].filter(matches),
    // matches closes over `text`; recompute when records or query change.
    [candidates, dateUnknown, text, ledger.registry],
  );

  const groups = useMemo(() => {
    const visible = visibleRecords.filter(
      (record) =>
        matches(record) &&
        !pinnedIds.has(record.id) &&
        !derivedIds.has(record.id) &&
        // 기록 is the notes experience; AI work has its own home (세션). Agent
        // sessions are excluded from the default view so a 400-session backfill
        // never floods it, but the 에이전트 세션 facet chip still opts them in.
        (typeFilter === null
          ? record.schemaId !== "agent-session"
          : record.schemaId === typeFilter),
    );
    return buildExplorerGroups(visible, ledger.contexts, ledger.relations, sort, groupMode, now);
    // matches closes over `text`.
  }, [visibleRecords, ledger.contexts, ledger.relations, sort, groupMode, typeFilter, text, pinnedIds, derivedIds, ledger.registry, now]);

  return (
    <div className="note-explorer">
      <div className="note-explorer-top">
        <div className="note-explorer-controls">
          <button
            type="button"
            className={`note-new${composing ? " is-active" : ""}`}
            onClick={onNew}
            title="새 기록 (n)"
            aria-label="새 기록"
          >
            <Plus size={15} aria-hidden="true" />
          </button>
          <label className="note-search">
            <Search size={13} aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(event) => onQuery(event.target.value)}
              placeholder="기록 검색"
              aria-label="기록 검색"
            />
          </label>
          <ViewMenu groupMode={groupMode} onGroupMode={setGroupMode} sort={sort} onSort={onSort} />
        </div>
        {facets.length > 1 ? (
          <div className="note-filters base-scroll">
            <button
              type="button"
              className={`note-fchip${typeFilter === null ? " is-on" : ""}`}
              onClick={() => setTypeFilter(null)}
            >
              전체
            </button>
            {facets.map((facet) => (
              <button
                key={facet.schemaId}
                type="button"
                className={`note-fchip${typeFilter === facet.schemaId ? " is-on" : ""}`}
                onClick={() => setTypeFilter((current) => (current === facet.schemaId ? null : facet.schemaId))}
              >
                {facet.name}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="note-explorer-body base-scroll">
        {pinned.length > 0 ? (
          <section className="note-group">
            <header className="note-group-head is-pinned">
              <span className="note-group-dot" aria-hidden="true" />
              확인할 것
              <span className="note-group-count">{pinned.length}</span>
            </header>
            {pinned.map((record) => (
              <NoteItem
                key={record.id}
                record={record}
                ledger={ledger}
                selected={record.id === selectedId}
                onSelect={onSelect}
                groupMode={groupMode}
                now={now}
              />
            ))}
          </section>
        ) : null}

        {groups.map((group) => (
          <section key={group.id} className="note-group">
            <header className="note-group-head is-sticky">
              {group.name}
              <span className="note-group-count">{group.records.length}</span>
            </header>
            {group.records.map((record) => (
              <NoteItem
                key={record.id}
                record={record}
                ledger={ledger}
                selected={record.id === selectedId}
                onSelect={onSelect}
                groupMode={groupMode}
                now={now}
              />
            ))}
          </section>
        ))}

        {pinned.length === 0 && groups.length === 0 ? (
          ledger.loading && !text ? (
            // First load from SQLite is async: stay quiet until it resolves so a
            // returning user with real data never sees a false "no records" flash.
            <p className="note-explorer-empty note-explorer-loading">기록을 불러오는 중…</p>
          ) : (
            <p className="note-explorer-empty">
              {text ? "조건에 맞는 기록이 없습니다." : "아직 기록이 없습니다."}
            </p>
          )
        ) : null}
      </div>
    </div>
  );
}

/** The single 보기 control: grouping lens + sort, one icon, one popover. */
function ViewMenu({
  groupMode,
  onGroupMode,
  sort,
  onSort,
}: {
  groupMode: ExplorerGroupMode;
  onGroupMode: (mode: ExplorerGroupMode) => void;
  sort: ExplorerSort;
  onSort: (sort: ExplorerSort) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const option = (label: string, active: boolean, onPick: () => void) => (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={active}
      className={`note-view-opt${active ? " is-on" : ""}`}
      onClick={() => {
        onPick();
        setOpen(false);
      }}
    >
      {label}
      {active ? <Check size={12} aria-hidden="true" /> : null}
    </button>
  );

  return (
    <div className="note-view" ref={ref}>
      <button
        type="button"
        className={`note-view-btn${open ? " is-open" : ""}`}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="보기 방식"
        title="보기 방식"
      >
        <SlidersHorizontal size={14} aria-hidden="true" />
      </button>
      {open ? (
        <div className="note-view-menu" role="menu">
          <p className="note-view-label">보기</p>
          {option("날짜별", groupMode === "day", () => onGroupMode("day"))}
          {option("프로젝트별", groupMode === "project", () => onGroupMode("project"))}
          <p className="note-view-label">정렬</p>
          {option("최신순", sort === "date", () => onSort("date"))}
          {option("제목순", sort === "title", () => onSort("title"))}
        </div>
      ) : null}
    </div>
  );
}

function NoteItem({
  record,
  ledger,
  selected,
  onSelect,
  groupMode,
  now,
}: {
  record: MoriRecord;
  ledger: RecordLedger;
  selected: boolean;
  onSelect: (recordId: string) => void;
  groupMode: ExplorerGroupMode;
  now: Date;
}) {
  const snippet = recordSnippet(record);
  // Trailing signal: the one thing the group does not already imply. Day
  // groups carry the date, so rows show the time of day; project groups show
  // the short date. Pinned (undecided) rows read their honest state instead.
  const trailing = record.occurredStart
    ? groupMode === "day"
      ? timeOfDayLabel(record.occurredStart)
      : shortDateLabel(record.occurredStart)
    : record.status === "candidate"
      ? "확인"
      : "";
  // A date-less record has no time to show; its state line takes the
  // snippet slot so the pinned group stays honest without extra chrome.
  const pinnedMeta =
    !record.occurredStart && !snippet
      ? `날짜 미정 · ${schemaLabel(record, ledger.registry)}`
      : null;
  return (
    <button
      type="button"
      className={`note-item${selected ? " is-selected" : ""}`}
      onClick={() => onSelect(record.id)}
    >
      <span className={`note-item-dot ${kindColorClass(record.schemaId)}`} aria-hidden="true" />
      <span className="note-item-body">
        <span className="note-item-title">{record.title}</span>
        {snippet ? <span className="note-item-snippet">{snippet}</span> : null}
        {pinnedMeta ? <span className="note-item-snippet is-meta">{pinnedMeta}</span> : null}
      </span>
      {trailing ? <span className="note-item-time">{trailing}</span> : null}
    </button>
  );
}
