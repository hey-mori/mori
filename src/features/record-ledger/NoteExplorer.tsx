/**
 * NoteExplorer · the left pane of the document workspace (v2). Records as
 * documents, grouped by project like Obsidian folders, searchable and
 * sortable by date or title. A pinned 확인할 것 group holds records that need
 * a decision (policy-held candidates and date-undecided notes). ＋ 새 기록
 * starts a capture in the editor.
 */
import { useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
import type { MoriRecord } from "../../lib/record-kernel/kernelTypes";
import type { RecordLedger } from "./useRecordLedger";
import {
  buildExplorerGroups,
  recordTypeFacets,
  RECENT_GROUP_ID,
  type ExplorerGroupMode,
  type ExplorerSort,
} from "./noteExplorerModel";
import { kindColorClass, ledgerVisibleRecords, schemaLabel } from "./recordPresentation";
import { dayLabel } from "./calendarGrouping";

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
  const [groupMode, setGroupMode] = useState<ExplorerGroupMode>("project");
  const [typeFilter, setTypeFilter] = useState<string | null>(null);

  const text = query.trim().toLowerCase();
  const matches = (record: MoriRecord) =>
    !text ||
    record.title.toLowerCase().includes(text) ||
    record.body.toLowerCase().includes(text) ||
    schemaLabel(record, ledger.registry).toLowerCase().includes(text);

  const visibleRecords = useMemo(() => ledgerVisibleRecords(ledger.records), [ledger.records]);
  // Facets over all groupable records so the 종류 filter is stable and grows
  // with the schema taxonomy (a new schema is just another chip).
  const facets = useMemo(() => recordTypeFacets(visibleRecords, ledger.registry), [visibleRecords, ledger.registry]);

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
        (typeFilter === null || record.schemaId === typeFilter),
    );
    return buildExplorerGroups(visible, ledger.contexts, ledger.relations, sort, groupMode);
    // matches closes over `text`.
  }, [visibleRecords, ledger.contexts, ledger.relations, sort, groupMode, typeFilter, text, pinnedIds, ledger.registry]);

  return (
    <div className="note-explorer">
      <div className="note-explorer-top">
        <button type="button" className={`note-new${composing ? " is-active" : ""}`} onClick={onNew}>
          <Plus size={14} aria-hidden="true" />새 기록
        </button>
        <label className="note-search">
          <Search size={13} aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(event) => onQuery(event.target.value)}
            placeholder="메모 검색"
            aria-label="메모 검색"
          />
        </label>
        <div className="note-controls">
          <div className="note-seg">
            <button type="button" className={groupMode === "project" ? "is-on" : ""} onClick={() => setGroupMode("project")}>
              프로젝트별
            </button>
            <button type="button" className={groupMode === "recent" ? "is-on" : ""} onClick={() => setGroupMode("recent")}>
              최근순
            </button>
          </div>
          <div className="note-seg">
            <button type="button" className={sort === "date" ? "is-on" : ""} onClick={() => onSort("date")} aria-label="날짜순 정렬">
              날짜
            </button>
            <button type="button" className={sort === "title" ? "is-on" : ""} onClick={() => onSort("title")} aria-label="제목순 정렬">
              제목
            </button>
          </div>
        </div>
        {facets.length > 1 ? (
          <div className="note-filters">
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
                now={now}
              />
            ))}
          </section>
        ) : null}

        {groups.map((group) => (
          <section key={group.id} className="note-group">
            {group.id === RECENT_GROUP_ID ? null : (
              <header className="note-group-head">
                {group.name}
                <span className="note-group-count">{group.records.length}</span>
              </header>
            )}
            {group.records.map((record) => (
              <NoteItem
                key={record.id}
                record={record}
                ledger={ledger}
                selected={record.id === selectedId}
                onSelect={onSelect}
                now={now}
              />
            ))}
          </section>
        ))}

        {pinned.length === 0 && groups.length === 0 ? (
          <p className="note-explorer-empty">
            {text ? "조건에 맞는 메모가 없습니다." : "아직 메모가 없습니다."}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function NoteItem({
  record,
  ledger,
  selected,
  onSelect,
  now,
}: {
  record: MoriRecord;
  ledger: RecordLedger;
  selected: boolean;
  onSelect: (recordId: string) => void;
  now: Date;
}) {
  const meta = record.occurredStart
    ? `${dayLabel(record.occurredStart.slice(0, 10), now).replace(/\s*\(.*\)$/, "")} · ${schemaLabel(record, ledger.registry)}`
    : `날짜 미정 · ${schemaLabel(record, ledger.registry)}`;
  return (
    <button
      type="button"
      className={`note-item${selected ? " is-selected" : ""}`}
      onClick={() => onSelect(record.id)}
    >
      <span className={`note-item-dot ${kindColorClass(record.schemaId)}`} aria-hidden="true" />
      <span className="note-item-body">
        <span className="note-item-title">{record.title}</span>
        <span className="note-item-meta">{meta}</span>
      </span>
    </button>
  );
}
