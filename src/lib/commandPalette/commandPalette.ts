import type { SettingsTab } from "../../app/store";
import type { ViewKey } from "../../domain/types";
import type { StoredSessionSummary } from "../storage/storageTypes";
import { sessionLastActiveAt } from "../session/sessionActivity";
import type { ThemeId } from "../settings/themePreference";
import { lookAlikeHints } from "../sidebar/lookAlike";

/**
 * Command palette — pure helpers.
 *
 * The palette is a producer-neutral surface: every command is a small,
 * serialisable record so a renderer can group, filter, and act on it
 * without knowing where it came from. Keeping this module a pure
 * derivation of "current sessions" + "current view" + "settings handle"
 * means tests can exercise filter + ranking behaviour without touching
 * the React tree, and a future producer (e.g. memory shortcuts) can
 * plug in by emitting more `CommandEntry` records.
 */

export type CommandGroup =
  | "navigate"
  | "record"
  | "session"
  | "action"
  | "theme"
  | "settings";

/** The intent the renderer should act on when the user picks a command. */
export type CommandTarget =
  | { kind: "navigate"; view: ViewKey }
  | { kind: "newRecord" }
  | { kind: "openRecord"; recordId: string }
  // An agent-session record: open the session, falling back to the record.
  | { kind: "openAgentSession"; sessionId: string }
  | { kind: "openSession"; sessionId: string; tab?: "overview" | "flow" | "evidence" | "insights" | "report" }
  | { kind: "openSettings"; segment?: SettingsTab }
  | { kind: "toggleSidebarCollapsed" }
  // Opens a surface in place rather than routing · the language tool is a
  // dialog, so it stays a distinct kind instead of a invented view key.
  | { kind: "openLanguageTool" }
  | { kind: "setTheme"; theme: ThemeId };

export type CommandEntry = {
  /** Stable id so React keys + dedupe never depend on label collisions. */
  id: string;
  group: CommandGroup;
  /** Korean primary label shown in the row. */
  label: string;
  /** Optional muted detail (project path, "ctrl+1" shortcut hint, …). */
  hint?: string;
  /** Extra strings to match against the query — project name, view aliases. */
  keywords?: string[];
  target: CommandTarget;
};

const NAVIGATE_COMMANDS: ReadonlyArray<{ id: string; label: string; view: ViewKey; keywords?: string[] }> = [
  { id: "nav-home", label: "홈 열기", view: "home", keywords: ["dashboard", "검색", "명령"] },
  { id: "nav-continue", label: "이어가기 열기", view: "continue", keywords: ["continue", "이어가기", "검토", "resume", "최근 작업"] },
  { id: "nav-graph", label: "작업 그래프 열기", view: "graph", keywords: ["graph", "그래프", "맵", "map", "관계"] },
  { id: "nav-dashboard", label: "대시보드 열기", view: "dashboard", keywords: ["dashboard", "대시보드", "요약", "개요"] },
  { id: "nav-workbench", label: "워크벤치 열기", view: "workbench", keywords: ["workbench", "워크벤치", "도구", "tools"] },
  { id: "nav-sessions", label: "세션 열기", view: "sessions", keywords: ["세션", "session", "라이브", "live", "히스토리", "history", "검토"] },
  { id: "nav-live-session", label: "라이브 피드 열기", view: "liveSession", keywords: ["live", "라이브", "실시간", "세션", "session", "따라가기", "미션 컨트롤"] },
  { id: "nav-session", label: "프로젝트", view: "workspace", keywords: ["projects", "sessions", "프로젝트", "세션", "워크스페이스"] },
  { id: "nav-ask", label: "Mori에게 묻기", view: "ask", keywords: ["ask", "질문", "질의", "묻기", "메모리 검색"] },
  { id: "nav-connections", label: "연동 열기", view: "connections", keywords: ["import", "connectors", "연동", "연결", "수집", "소스"] },
  { id: "nav-start", label: "새 세션 시작", view: "start", keywords: ["new"] },
  // Retired from the rail, not removed. The project rule is to unwire a surface
  // from navigation and keep it reachable, and this was left routed with no way
  // in at all, which is neither retired nor live (#4).
  {
    id: "nav-memory-hub",
    label: "메모리 허브 열기",
    view: "memoryHub",
    keywords: ["memory", "메모리", "허브", "hub", "기억", "누적"],
  },
];

const SETTINGS_COMMANDS: ReadonlyArray<{
  id: string;
  label: string;
  segment: SettingsTab;
  keywords?: string[];
}> = [
  { id: "settings-open", label: "설정 열기", segment: "localAi", keywords: ["settings", "환경 설정"] },
  { id: "settings-profile", label: "프로필 열기", segment: "profile", keywords: ["account"] },
  { id: "settings-about", label: "정보 열기", segment: "about", keywords: ["version", "update", "diagnostics"] },
];

const ACTION_COMMANDS: ReadonlyArray<{
  id: string;
  label: string;
  hint?: string;
  target: CommandTarget;
  keywords?: string[];
}> = [
  {
    id: "action-new-record",
    label: "새 기록 쓰기",
    hint: "n",
    target: { kind: "newRecord" },
    keywords: ["new", "capture", "기록", "메모", "작성", "note"],
  },
  {
    id: "action-open-language-tool",
    label: "언어 도구 열기",
    hint: "이해하기 · 표현하기",
    target: { kind: "openLanguageTool" },
    keywords: ["언어", "번역", "이해", "표현", "영어", "language", "translate", "express"],
  },
  {
    id: "action-toggle-sidebar",
    label: "사이드바 접기/펼치기",
    hint: "작업 영역 넓히기",
    target: { kind: "toggleSidebarCollapsed" },
    keywords: ["sidebar", "collapse", "focus"],
  },
];

const THEME_COMMANDS: ReadonlyArray<{
  id: string;
  label: string;
  theme: ThemeId;
  keywords?: string[];
}> = [
  { id: "theme-formal", label: "라이트 (Formal)", theme: "formal", keywords: ["light", "default", "라이트"] },
  { id: "theme-forest", label: "포레스트 (Sage)", theme: "forest", keywords: ["green", "sage", "forest"] },
  { id: "theme-nightlake", label: "다크 (Night Lake)", theme: "nightLake", keywords: ["dark", "night", "다크"] },
];

export type BuildCommandsInput = {
  sessions: ReadonlyArray<StoredSessionSummary>;
  /** Hide rows for the current view so the palette never offers a no-op. */
  currentView?: ViewKey;
  /** Hide the row for the currently-applied theme — picking it would be a no-op. */
  currentTheme?: ThemeId;
};

/**
 * Build the full command list. Sessions are listed most-recent-first and
 * capped so the input feels responsive on first paint — the query filter
 * then re-ranks down to the active match set.
 */
export function buildCommands(input: BuildCommandsInput): CommandEntry[] {
  const navigate: CommandEntry[] = NAVIGATE_COMMANDS.filter(
    (cmd) => cmd.view !== input.currentView,
  ).map((cmd) => ({
    id: cmd.id,
    group: "navigate",
    label: cmd.label,
    keywords: cmd.keywords,
    target: { kind: "navigate", view: cmd.view },
  }));

  // Every session becomes a searchable entry (not just the recent few), so a
  // typed query reaches the whole history. The renderer trims the *browse* list
  // (empty query) with `capBrowseCommands`; searching sees them all.
  // Same-titled sessions read apart by when they started (see lookAlikeHints).
  const lookAlike = lookAlikeHints(
    input.sessions.map((summary) => ({
      id: summary.sessionId,
      title: summary.title?.trim() || "제목 없음",
      startedAt: summary.startedAt,
      at: sessionLastActiveAt(summary),
    })),
  );
  const sessions: CommandEntry[] = [...input.sessions]
    .sort(
      (a, b) =>
        new Date(sessionLastActiveAt(b)).getTime() -
        new Date(sessionLastActiveAt(a)).getTime(),
    )
    .map((summary) => ({
      id: `session:${summary.sessionId}`,
      group: "session",
      label: summary.title?.trim() || "제목 없음",
      hint: [summary.sourceLabel || summary.projectName, lookAlike.get(summary.sessionId)].filter(Boolean).join(" · "),
      keywords: [summary.projectName, summary.sourceLabel ?? ""].filter(Boolean),
      target: { kind: "openSession", sessionId: summary.sessionId, tab: "flow" },
    }));

  const actions: CommandEntry[] = ACTION_COMMANDS.map((cmd) => ({
    id: cmd.id,
    group: "action",
    label: cmd.label,
    hint: cmd.hint,
    keywords: cmd.keywords,
    target: cmd.target,
  }));

  const themes: CommandEntry[] = THEME_COMMANDS.filter(
    (cmd) => cmd.theme !== input.currentTheme,
  ).map((cmd) => ({
    id: cmd.id,
    group: "theme",
    label: cmd.label,
    keywords: cmd.keywords,
    target: { kind: "setTheme", theme: cmd.theme },
  }));

  const settings: CommandEntry[] = SETTINGS_COMMANDS.map((cmd) => ({
    id: cmd.id,
    group: "settings",
    label: cmd.label,
    keywords: cmd.keywords,
    target: { kind: "openSettings", segment: cmd.segment },
  }));

  return [...navigate, ...sessions, ...actions, ...themes, ...settings];
}

/**
 * Filter + rank commands by a free-text query. Matches are case-insensitive
 * and check label + hint + keywords; empty query passes through every entry
 * in the input order so the palette opens with a populated list.
 *
 * Ranking is a small but useful heuristic so a typed query lands the most
 * obvious match at the top: prefix matches on the label outrank substring
 * matches; label hits outrank keyword hits.
 */
export function filterCommands(
  commands: ReadonlyArray<CommandEntry>,
  query: string,
): CommandEntry[] {
  const term = query.trim().toLowerCase();
  if (!term) return [...commands];
  const scored: { entry: CommandEntry; score: number }[] = [];
  for (const entry of commands) {
    const score = scoreCommand(entry, term);
    if (score > 0) scored.push({ entry, score });
  }
  return scored.sort((a, b) => b.score - a.score).map((row) => row.entry);
}

/**
 * Trim the *browse* list shown for an empty query so opening the palette is a
 * short, calm menu rather than the whole session history. Only the unbounded
 * groups (sessions) are capped; navigate / action / theme / settings are already
 * small and pass through whole. Sessions are pre-sorted most-recent-first by
 * `buildCommands`, so the cap keeps the freshest. A typed query bypasses this
 * (the renderer calls `filterCommands` instead), so nothing is unsearchable.
 */
export function capBrowseCommands(
  commands: ReadonlyArray<CommandEntry>,
  options: { sessionLimit?: number } = {},
): CommandEntry[] {
  const sessionLimit = options.sessionLimit ?? 8;
  let sessionsSeen = 0;
  const out: CommandEntry[] = [];
  for (const entry of commands) {
    if (entry.group === "session") {
      if (sessionsSeen >= sessionLimit) continue;
      sessionsSeen += 1;
    }
    out.push(entry);
  }
  return out;
}

function scoreCommand(entry: CommandEntry, term: string): number {
  const label = entry.label.toLowerCase();
  if (label.startsWith(term)) return 100;
  if (label.includes(term)) return 60;
  const hint = entry.hint?.toLowerCase() ?? "";
  if (hint.includes(term)) return 30;
  for (const kw of entry.keywords ?? []) {
    if (kw.toLowerCase().includes(term)) return 20;
  }
  return 0;
}

/** Korean label shown above each group in the palette renderer. */
export const COMMAND_GROUP_LABEL: Record<CommandGroup, string> = {
  navigate: "이동",
  record: "기록",
  session: "세션",
  action: "작업",
  theme: "테마",
  settings: "설정",
};

/**
 * Group an ordered command list into the bucketed shape the renderer
 * consumes. Groups appear in `COMMAND_GROUP_ORDER` order; empty buckets
 * are dropped so the renderer never shows a hollow header.
 */
export const COMMAND_GROUP_ORDER: ReadonlyArray<CommandGroup> = [
  "navigate",
  "record",
  "session",
  "action",
  "theme",
  "settings",
];

export type CommandSection = {
  group: CommandGroup;
  label: string;
  entries: CommandEntry[];
};

export function groupCommands(
  commands: ReadonlyArray<CommandEntry>,
): CommandSection[] {
  const map = new Map<CommandGroup, CommandEntry[]>();
  for (const entry of commands) {
    const list = map.get(entry.group);
    if (list) list.push(entry);
    else map.set(entry.group, [entry]);
  }
  const sections: CommandSection[] = [];
  for (const group of COMMAND_GROUP_ORDER) {
    const entries = map.get(group);
    if (entries && entries.length > 0) {
      sections.push({ group, label: COMMAND_GROUP_LABEL[group], entries });
    }
  }
  return sections;
}
