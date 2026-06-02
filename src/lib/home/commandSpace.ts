import type { ViewKey } from "../../domain/types";
import type { StoredSessionSummary } from "../storage/storageTypes";

/**
 * Mori Command Space — pure result derivation.
 *
 * The home command bar is not a dead search box: the moment the field is
 * engaged it becomes a small work surface. This module turns the three live
 * inputs (the active mode, the typed query, the user's real sessions) into a
 * flat, keyboard-navigable row list. Keeping it a pure derivation means the
 * interaction (filter / rank / cap / mode-action wording) is unit-testable
 * without mounting React, and the component stays a thin renderer.
 *
 * Two row families:
 *   - `action`  — the verb the active mode performs, worded with the query.
 *                 Always present, so the panel is never empty.
 *   - context   — `session` / `project` rows drawn from the user's real data,
 *                 filtered by the query (or the most-recent few when idle).
 */

export type CommandModeId = "find" | "shape" | "create" | "review" | "connect";

/** Where activating an action row routes. Sessions / projects carry their own id. */
export type CommandSpaceActionTarget =
  | { type: "palette" }
  | { type: "navigate"; view: ViewKey };

export type CommandSpaceRow =
  | {
      kind: "action";
      id: string;
      label: string;
      hint?: string;
      target: CommandSpaceActionTarget;
    }
  | {
      kind: "session";
      id: string;
      label: string;
      hint?: string;
      sessionId: string;
    }
  | {
      kind: "project";
      id: string;
      label: string;
      hint?: string;
      projectKey: string;
    };

export type CommandSpaceResults = {
  /** Flat row list in display order: actions, then projects, then sessions. */
  rows: CommandSpaceRow[];
  /** True when the trimmed query is non-empty (renderer labels the groups). */
  hasQuery: boolean;
};

const SESSION_LIMIT_QUERY = 5;
const SESSION_LIMIT_RECENT = 3;
const PROJECT_LIMIT = 3;

export function buildCommandSpaceResults(input: {
  modeId: CommandModeId;
  query: string;
  sessions: ReadonlyArray<StoredSessionSummary>;
}): CommandSpaceResults {
  const query = input.query.trim();
  const hasQuery = query.length > 0;

  const actions = buildModeActions(input.modeId, query);
  const projectRows = hasQuery
    ? matchProjects(input.sessions, query).slice(0, PROJECT_LIMIT)
    : [];
  const sessionRows = matchSessions(input.sessions, query).slice(
    0,
    hasQuery ? SESSION_LIMIT_QUERY : SESSION_LIMIT_RECENT,
  );

  return { rows: [...actions, ...projectRows, ...sessionRows], hasQuery };
}

/**
 * The mode's primary verb(s), worded with the live query. Routes to the real
 * surface that performs the intent; the query refines context, not routing, so
 * no new view plumbing is needed. Returned as `action` rows so they sit at the
 * top of the flat list and Enter always lands the obvious action.
 */
function buildModeActions(
  modeId: CommandModeId,
  query: string,
): CommandSpaceRow[] {
  const q = query.trim();
  const seed = q ? `‘${q}’` : "";
  switch (modeId) {
    case "find":
      return [
        action("act-find", q ? `${seed} 전체에서 찾기` : "전체 검색 열기", {
          hint: "세션 · 프로젝트 · 명령",
          target: { type: "palette" },
        }),
      ];
    case "shape":
      return [
        action("act-shape-consolidation", "메모리 통합 검토", {
          hint: "리뷰한 작업을 기억으로",
          target: { type: "navigate", view: "consolidation" },
        }),
        action("act-shape-memory", "프로젝트 메모리 열기", {
          target: { type: "navigate", view: "memory" },
        }),
      ];
    case "create":
      return [
        action("act-create", q ? `${seed} 세션 시작` : "새 세션 시작", {
          hint: "대화 불러오기 · 빈 세션",
          target: { type: "navigate", view: "start" },
        }),
      ];
    case "review":
      return [
        action("act-review", "이어가기 열기", {
          hint: "최근 작업 검토",
          target: { type: "navigate", view: "continue" },
        }),
      ];
    case "connect":
      return [
        action("act-connect", "소스 연결 열기", {
          hint: "Claude · Codex · Git · 메모",
          target: { type: "navigate", view: "connections" },
        }),
      ];
  }
}

function action(
  id: string,
  label: string,
  rest: { hint?: string; target: CommandSpaceActionTarget },
): CommandSpaceRow {
  return { kind: "action", id, label, ...rest };
}

function matchSessions(
  sessions: ReadonlyArray<StoredSessionSummary>,
  query: string,
): CommandSpaceRow[] {
  const term = query.trim().toLowerCase();
  const sorted = [...sessions].sort(
    (a, b) =>
      new Date(b.startedAt || b.savedAt).getTime() -
      new Date(a.startedAt || a.savedAt).getTime(),
  );
  const matched = term
    ? sorted.filter((session) => sessionHaystack(session).includes(term))
    : sorted;
  return matched.map((session) => ({
    kind: "session",
    id: `session:${session.sessionId}`,
    label: session.title?.trim() || "제목 없음",
    hint: session.sourceLabel || session.projectName || undefined,
    sessionId: session.sessionId,
  }));
}

/**
 * Distinct projects the sessions belong to, keyed by the raw `sourceLabel`
 * (falling back to `projectName`) so `openProject` resolves them the same way
 * the sidebar and workspace do. Ranked by how many sessions reference each, so
 * the project the user works in most surfaces first.
 */
function matchProjects(
  sessions: ReadonlyArray<StoredSessionSummary>,
  query: string,
): CommandSpaceRow[] {
  const term = query.trim().toLowerCase();
  const groups = new Map<
    string,
    { key: string; label: string; count: number }
  >();
  for (const session of sessions) {
    const key = session.sourceLabel || session.projectName;
    if (!key) continue;
    const existing = groups.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      groups.set(key, {
        key,
        label: session.projectName || session.sourceLabel || key,
        count: 1,
      });
    }
  }
  return [...groups.values()]
    .filter((project) =>
      `${project.label} ${project.key}`.toLowerCase().includes(term),
    )
    .sort((a, b) => b.count - a.count)
    .map((project) => ({
      kind: "project",
      id: `project:${project.key}`,
      label: project.label,
      // A path hint only when it adds information beyond the display name —
      // never a redundant session count.
      hint: project.key !== project.label ? project.key : undefined,
      projectKey: project.key,
    }));
}

function sessionHaystack(session: StoredSessionSummary): string {
  return [session.title, session.projectName, session.sourceLabel]
    .filter((value): value is string => Boolean(value))
    .join(" ")
    .toLowerCase();
}
