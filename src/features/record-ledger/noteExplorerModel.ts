/**
 * Note explorer model · groups ledger records for the document explorer (v2):
 * by project (context) like Obsidian folders, with a 기타 bucket for records
 * that belong to no context, sortable by date or title. Pure over records +
 * contexts + relations so the explorer holds no derivation.
 */
import type {
  KernelContext,
  KernelRelation,
  MoriRecord,
} from "../../lib/record-kernel/kernelTypes";
import type { SchemaRegistry } from "../../lib/record-kernel/schemaRegistry";
import { displayTime, schemaLabel } from "./recordPresentation";
import { stripInlineMarkdown } from "./noteWorkspace";
import { recordProject } from "./projectScope";

export type ExplorerSort = "date" | "title";
export type ExplorerGroupMode = "day" | "project" | "recent";

export const RECENT_GROUP_ID = "__recent__";
const RECENT_ID = RECENT_GROUP_ID;

/**
 * The ledger's native lens (v3): records grouped by the day they happened
 * (display time: activity time, else capture time). 오늘 · 어제 · "7월 14일
 * 화요일" · other-year "2025년 12월 3일". Newest day first.
 */
export function dayGroupLabel(isoDay: string, now: Date): string {
  const [year, month, day] = isoDay.split("-").map(Number);
  const todayIso = localIsoDay(now);
  if (isoDay === todayIso) return "오늘";
  if (isoDay === localIsoDay(new Date(now.getTime() - 86_400_000))) return "어제";
  const weekday = new Intl.DateTimeFormat("ko-KR", { weekday: "long" }).format(
    new Date(year, (month ?? 1) - 1, day ?? 1),
  );
  const base = `${month}월 ${day}일 ${weekday}`;
  return year === now.getFullYear() ? base : `${year}년 ${base}`;
}

function localIsoDay(date: Date): string {
  const pad = (value: number) => value.toString().padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** ISO day (local) a record displays on: activity time, else capture time. */
export function recordDisplayDay(record: MoriRecord): string {
  return displayTime(record).iso.slice(0, 10);
}

/** HH:mm for a day-grouped row's trailing time. */
export function timeOfDayLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime()) || !iso.includes("T")) return "";
  const pad = (value: number) => value.toString().padStart(2, "0");
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** M/D for a project-grouped row's trailing date. */
export function shortDateLabel(iso: string): string {
  const [, month, day] = iso.slice(0, 10).split("-").map(Number);
  return month && day ? `${month}/${day}` : "";
}

/**
 * One quiet content preview line for a list row: the record body's first
 * line that adds something beyond the title. Empty when the body has
 * nothing to add, so a bare row stays a single line.
 */
export function recordSnippet(record: MoriRecord, query?: string): string {
  const title = record.title.trim();
  const clip = (line: string) => (line.length > 96 ? `${line.slice(0, 96)}…` : line);
  // Strip inline markdown so the row reads as prose (**다음 주** → 다음 주),
  // matching the already-stripped title it is compared against.
  const lines = record.body
    .split(/\r?\n/)
    .map((raw) => stripInlineMarkdown(raw).replace(/\s+/g, " ").trim());

  // While searching, surface the first body line that actually holds the query
  // so the match is visible in the row (and can be highlighted), not buried.
  const q = query?.trim().toLowerCase();
  if (q) {
    const hit = lines.find((line) => line && line !== title && line.toLowerCase().includes(q));
    if (hit) return clip(hit);
  }

  for (const line of lines) {
    if (!line || line === title) continue;
    // The proposer often titles a record with its (clipped) first line; a
    // snippet that just repeats it adds noise, not scent.
    if (title.length > 8 && (line.startsWith(title) || title.startsWith(line))) continue;
    return clip(line);
  }
  return "";
}

/**
 * Split `source` into segments around each case-insensitive occurrence of
 * `query`, so a list row can wrap the hits in <mark>. No query (or no match)
 * yields a single non-hit segment, so callers render the plain string.
 */
export function matchSegments(source: string, query: string): { text: string; hit: boolean }[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [{ text: source, hit: false }];
  const haystack = source.toLowerCase();
  const out: { text: string; hit: boolean }[] = [];
  let cursor = 0;
  for (let at = haystack.indexOf(needle); at !== -1; at = haystack.indexOf(needle, cursor)) {
    if (at > cursor) out.push({ text: source.slice(cursor, at), hit: false });
    out.push({ text: source.slice(at, at + needle.length), hit: true });
    cursor = at + needle.length;
  }
  if (cursor < source.length) out.push({ text: source.slice(cursor), hit: false });
  return out.length ? out : [{ text: source, hit: false }];
}

/** A record type present in the list, for the 종류 filter. `count` orders the
 *  chips by how common the type is, so the filter grows with the schema
 *  taxonomy (extensible: a new schema is just another facet). */
export type TypeFacet = { schemaId: string; name: string; count: number };

export function recordTypeFacets(records: MoriRecord[], registry: SchemaRegistry): TypeFacet[] {
  const counts = new Map<string, number>();
  for (const record of records) counts.set(record.schemaId, (counts.get(record.schemaId) ?? 0) + 1);
  return [...counts.entries()]
    .map(([schemaId, count]) => ({ schemaId, name: schemaLabel({ schemaId } as MoriRecord, registry), count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

export type ExplorerGroup = {
  /** Context id, or "__none__" for the 기타 bucket. */
  id: string;
  name: string;
  records: MoriRecord[];
};

const NONE_ID = "__none__";
const NONE_NAME = "기타";

/** contextId -> record ids that belong to it (explicit `contextIds` plus
 *  `belongs-to` relations), mirroring `contextGrouping`. */
function membershipByRecord(records: MoriRecord[], relations: KernelRelation[]): Map<string, Set<string>> {
  const byRecord = new Map<string, Set<string>>();
  const add = (recordId: string, contextId: string) => {
    const set = byRecord.get(recordId);
    if (set) set.add(contextId);
    else byRecord.set(recordId, new Set([contextId]));
  };
  for (const record of records) for (const contextId of record.contextIds) add(record.id, contextId);
  for (const relation of relations) {
    if (relation.type === "belongs-to" && relation.toContextId) {
      add(relation.fromRecordId, relation.toContextId);
    }
  }
  return byRecord;
}

function sortRecords(records: MoriRecord[], sort: ExplorerSort): MoriRecord[] {
  const copy = [...records];
  if (sort === "title") {
    copy.sort((a, b) => a.title.localeCompare(b.title));
  } else {
    copy.sort((a, b) => displayTime(b).iso.localeCompare(displayTime(a).iso));
  }
  return copy;
}

/**
 * Groups records by context. A record in several contexts appears under its
 * project when it has one (a routine listed first never wins over the project),
 * else its first known context; a record in none lands in 기타. Groups are ordered by
 * their newest record (기타 always last); records within a group follow the
 * sort. Contexts with no records are omitted.
 */
export function buildExplorerGroups(
  records: MoriRecord[],
  contexts: KernelContext[],
  relations: KernelRelation[],
  sort: ExplorerSort,
  groupMode: ExplorerGroupMode = "day",
  now: Date = new Date(),
): ExplorerGroup[] {
  // 날짜별 (v3 default): the ledger read as days accumulating, newest day
  // first; rows within a day follow the sort (최신순 = latest first).
  if (groupMode === "day") {
    const byDay = new Map<string, MoriRecord[]>();
    for (const record of records) {
      const day = recordDisplayDay(record);
      const bucket = byDay.get(day);
      if (bucket) bucket.push(record);
      else byDay.set(day, [record]);
    }
    return [...byDay.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([day, group]) => ({
        id: `day:${day}`,
        name: dayGroupLabel(day, now),
        records: sortRecords(group, sort),
      }));
  }

  // 최근순: one flat list, newest first, no project headers.
  if (groupMode === "recent") {
    return records.length > 0
      ? [{ id: RECENT_ID, name: "최근", records: sortRecords(records, sort) }]
      : [];
  }

  const membership = membershipByRecord(records, relations);
  const contextName = new Map(contexts.map((context) => [context.id, context.name]));
  const buckets = new Map<string, MoriRecord[]>();

  for (const record of records) {
    const contextIds = membership.get(record.id);
    // The record's project wins; else the first known context; none → 기타.
    let target = recordProject(record, contexts, relations)?.id ?? NONE_ID;
    if (target === NONE_ID && contextIds) {
      for (const id of contextIds) {
        if (contextName.has(id)) {
          target = id;
          break;
        }
      }
    }
    const bucket = buckets.get(target);
    if (bucket) bucket.push(record);
    else buckets.set(target, [record]);
  }

  const groups: ExplorerGroup[] = [];
  for (const [id, groupRecords] of buckets) {
    if (id === NONE_ID) continue;
    groups.push({ id, name: contextName.get(id) ?? id, records: sortRecords(groupRecords, sort) });
  }
  // Newest-activity group first.
  groups.sort((a, b) => newestIso(b.records).localeCompare(newestIso(a.records)));

  const none = buckets.get(NONE_ID);
  if (none) groups.push({ id: NONE_ID, name: NONE_NAME, records: sortRecords(none, sort) });

  return groups;
}

function newestIso(records: MoriRecord[]): string {
  return records.reduce((latest, record) => {
    const iso = displayTime(record).iso;
    return iso > latest ? iso : latest;
  }, "");
}
