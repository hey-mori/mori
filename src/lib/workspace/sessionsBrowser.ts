import type { Session } from "../../domain/types";
import type { ProductStateTone } from "../product-state/productStateLabels";
import { spanLabel } from "../session/workContext";
import type { StoredSessionSummary } from "../storage/storageTypes";

/**
 * Sessions browser view model.
 *
 * Under the "1 Claude conversation = 1 Mori session" model the user
 * accumulates many small sessions. The Workspace is the first-class place to
 * see them all, grouped by their source project (`sourceLabel`, e.g. the
 * Claude project path), open one, and tidy them with safe lifecycle actions
 * (rename). This module turns the flat list of stored session summaries plus
 * the active session into that grouped, filterable model.
 *
 * It is a pure transform: it never invents sessions and never mutates storage.
 */

/** How a session entered Mori — drives the origin chip. */
export type SessionOrigin = "imported" | "manual" | "demo";

/** Which sessions the user wants to see. */
export type SessionOriginFilter = "all" | "imported" | "manual";

/** Sort order for the session list. */
export type SessionSort = "recent" | "title";

export type SessionsBrowserFilters = {
  query: string;
  origin: SessionOriginFilter;
  sort: SessionSort;
};

export const DEFAULT_SESSIONS_BROWSER_FILTERS: SessionsBrowserFilters = {
  query: "",
  origin: "all",
  sort: "recent",
};

export type SessionRow = {
  sessionId: string;
  title: string;
  status: Session["status"];
  origin: SessionOrigin;
  /** Grouping label (Claude project path) or `null` for manual / demo. */
  sourceLabel: string | null;
  /** ISO timestamp the draft was last saved; `null` for an unsaved session. */
  savedAt: string | null;
  /** Session window start (ISO), best-effort. */
  startedAt: string | null;
  /** Session window end (ISO), best-effort. */
  endedAt: string | null;
  /** Honest work-span descriptor ("2시간 45분" / "5월 21일"), never a clock. */
  spanLabel: string | null;
  isActive: boolean;
};

export type SessionProjectGroup = {
  /** Stable key for React lists. */
  key: string;
  /** Display label for the group header. */
  label: string;
  /** True for the catch-all manual / demo bucket (no real source project). */
  isUnsourced: boolean;
  sessions: SessionRow[];
};

export type SessionsBrowserModel = {
  groups: SessionProjectGroup[];
  /** Total rows after filtering. */
  visibleCount: number;
  /** Total stored + active sessions before filtering (for "n / m" copy). */
  totalCount: number;
  /** Whether any session exists at all. */
  hasAnySession: boolean;
  /**
   * How many real (non-demo) sessions exist before filtering. Zero means the
   * user has only the bundled demo — the honest "no sessions yet" state that
   * warrants the Connections call-to-action.
   */
  realSessionCount: number;
};

export type SessionsBrowserInput = {
  /** Active session metadata (always present — demo or draft). */
  active: {
    sessionId: string;
    title: string;
    status: Session["status"];
    sourceLabel: string | null;
    startedAt: string | null;
    endedAt: string | null;
    /** True when the active session is the bundled demo (no real draft). */
    isDemo: boolean;
    /** True when the active session is already persisted as a stored draft. */
    isStored: boolean;
  };
  /** Every stored session summary (any project, any archive state). */
  storedSessions: StoredSessionSummary[];
  filters: SessionsBrowserFilters;
};

const UNSOURCED_LABEL = "수동 세션";
const DEMO_LABEL = "데모";
const UNSOURCED_KEY = "__unsourced__";

/**
 * Build the grouped, filtered sessions-browser model. The active session is
 * always represented — even before its draft has been saved — so the user
 * never loses sight of what they are currently working on.
 */
export function buildSessionsBrowserModel(
  input: SessionsBrowserInput,
): SessionsBrowserModel {
  const { active, storedSessions, filters } = input;

  const rows: SessionRow[] = storedSessions.map((entry) =>
    rowFromStored(entry, active.sessionId),
  );

  // Ensure the active session is present even when it has no saved draft yet
  // (a freshly-created draft, or the demo). A stored row already covers the
  // case where the active session has been persisted.
  if (!rows.some((row) => row.sessionId === active.sessionId)) {
    rows.push({
      sessionId: active.sessionId,
      title: active.title,
      status: active.status,
      origin: active.isDemo ? "demo" : originFromSourceLabel(active.sourceLabel),
      sourceLabel: active.sourceLabel,
      savedAt: null,
      startedAt: active.startedAt,
      endedAt: active.endedAt,
      spanLabel: spanLabel(active.startedAt ?? undefined, active.endedAt ?? undefined),
      isActive: true,
    });
  }

  const totalCount = rows.length;
  const hasAnySession = rows.length > 0;
  const realSessionCount = rows.filter((row) => row.origin !== "demo").length;

  const filtered = rows.filter((row) => matchesFilters(row, filters));
  const sorted = sortRows(filtered, filters.sort);

  return {
    groups: groupRows(sorted),
    visibleCount: sorted.length,
    totalCount,
    hasAnySession,
    realSessionCount,
  };
}

function rowFromStored(
  entry: StoredSessionSummary,
  activeSessionId: string,
): SessionRow {
  const sourceLabel = entry.sourceLabel?.trim() ? entry.sourceLabel.trim() : null;
  const startedAt = entry.startedAt ?? entry.savedAt ?? null;
  return {
    sessionId: entry.sessionId,
    title: entry.title,
    status: entry.status,
    origin: originFromSourceLabel(sourceLabel),
    sourceLabel,
    savedAt: entry.savedAt,
    startedAt,
    endedAt: null,
    // Stored summaries don't carry `endedAt`; the span falls back to the
    // session's start date, which `spanLabel` renders as a single-day label.
    spanLabel: spanLabel(startedAt ?? undefined, undefined),
    isActive: entry.sessionId === activeSessionId,
  };
}

function originFromSourceLabel(sourceLabel: string | null): SessionOrigin {
  return sourceLabel ? "imported" : "manual";
}

function matchesFilters(row: SessionRow, filters: SessionsBrowserFilters): boolean {
  if (filters.origin === "imported" && row.origin !== "imported") return false;
  if (filters.origin === "manual" && row.origin === "imported") return false;

  const needle = filters.query.trim().toLowerCase();
  if (needle) {
    const haystack = `${row.title} ${row.sourceLabel ?? ""}`.toLowerCase();
    if (!haystack.includes(needle)) return false;
  }
  return true;
}

/**
 * Sort within the flat list before grouping. "recent" puts the active session
 * first, then newest saved drafts; "title" is a locale-aware A→Z. The active
 * session always leads in "recent" so the user's current work is anchored.
 */
function sortRows(rows: SessionRow[], sort: SessionSort): SessionRow[] {
  const next = [...rows];
  if (sort === "title") {
    next.sort((a, b) => a.title.localeCompare(b.title, "ko"));
    return next;
  }
  next.sort((a, b) => {
    if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
    const aKey = a.savedAt ?? a.startedAt;
    const bKey = b.savedAt ?? b.startedAt;
    if (aKey === null && bKey === null) return 0;
    if (aKey === null) return -1;
    if (bKey === null) return 1;
    return bKey.localeCompare(aKey);
  });
  return next;
}

/**
 * Group the sorted rows by their source project, preserving row order within
 * each group. Imported sessions group by `sourceLabel`; manual and demo
 * sessions fall into a single trailing unsourced bucket so they still appear.
 * Group order follows the first appearance of each label in the sorted list,
 * with the unsourced bucket pinned last.
 */
function groupRows(rows: SessionRow[]): SessionProjectGroup[] {
  const order: string[] = [];
  const byKey = new Map<string, SessionProjectGroup>();

  for (const row of rows) {
    const key = row.sourceLabel ?? UNSOURCED_KEY;
    let group = byKey.get(key);
    if (!group) {
      group = {
        key,
        label: row.sourceLabel ?? (row.origin === "demo" ? DEMO_LABEL : UNSOURCED_LABEL),
        isUnsourced: row.sourceLabel === null,
        sessions: [],
      };
      byKey.set(key, group);
      order.push(key);
    }
    // A demo session and a manual session can share the unsourced bucket; once
    // any non-demo session joins it, label it the manual bucket.
    if (group.isUnsourced && row.origin !== "demo") {
      group.label = UNSOURCED_LABEL;
    }
    group.sessions.push(row);
  }

  order.sort((a, b) => {
    if (a === UNSOURCED_KEY) return 1;
    if (b === UNSOURCED_KEY) return -1;
    return 0;
  });
  return order.map((key) => byKey.get(key)!);
}

// ─── Origin chip presentation ───────────────────────────────────────────────

const ORIGIN_LABEL: Record<SessionOrigin, string> = {
  imported: "가져옴",
  manual: "수동",
  demo: "데모",
};

/**
 * Tone for the origin chip. Imported / manual are neutral (gray) — they are
 * simply how the session was created, not a status. Demo is the brand accent
 * (it is reference data, consistent with the work-context widget). Status
 * tone (analyzing = amber, etc.) is carried separately by the status badge so
 * the two signals never collide.
 */
const ORIGIN_TONE: Record<SessionOrigin, ProductStateTone> = {
  imported: "neutral",
  manual: "neutral",
  demo: "accent",
};

export function describeSessionOrigin(origin: SessionOrigin): {
  label: string;
  tone: ProductStateTone;
} {
  return { label: ORIGIN_LABEL[origin], tone: ORIGIN_TONE[origin] };
}
