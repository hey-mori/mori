import type { ViewKey } from "../../domain/types";
import type { StoredSessionSummary } from "../storage/storageTypes";
import type { MoriThemeId } from "../settings/themePreference";

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
  | "session"
  | "action"
  | "theme"
  | "settings";

/** The intent the renderer should act on when the user picks a command. */
export type CommandTarget =
  | { kind: "navigate"; view: ViewKey }
  | { kind: "openSession"; sessionId: string; tab?: "flow" | "evidence" | "insights" | "report" }
  | { kind: "openSettings"; segment?: "profile" | "localAi" }
  | { kind: "toggleSidebarCollapsed" }
  | { kind: "setTheme"; theme: MoriThemeId };

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
  { id: "nav-home", label: "홈 열기", view: "home", keywords: ["dashboard"] },
  { id: "nav-session", label: "프로젝트", view: "workspace", keywords: ["projects", "sessions", "프로젝트", "세션", "워크스페이스"] },
  { id: "nav-memory", label: "메모리", view: "memory" },
  { id: "nav-consolidation", label: "메모리 통합 검토", view: "consolidation", keywords: ["consolidation"] },
  { id: "nav-connections", label: "연결 (가져오기)", view: "connections", keywords: ["import", "connectors"] },
  { id: "nav-start", label: "새 세션 시작", view: "start", keywords: ["new"] },
];

const SETTINGS_COMMANDS: ReadonlyArray<{
  id: string;
  label: string;
  segment: "profile" | "localAi";
  keywords?: string[];
}> = [
  { id: "settings-open", label: "설정 열기", segment: "localAi", keywords: ["settings", "환경 설정"] },
  { id: "settings-profile", label: "프로필 열기", segment: "profile", keywords: ["account"] },
];

const ACTION_COMMANDS: ReadonlyArray<{
  id: string;
  label: string;
  hint?: string;
  target: CommandTarget;
  keywords?: string[];
}> = [
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
  theme: MoriThemeId;
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
  currentTheme?: MoriThemeId;
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

  const sessions: CommandEntry[] = [...input.sessions]
    .sort(
      (a, b) =>
        new Date(b.startedAt || b.savedAt).getTime() -
        new Date(a.startedAt || a.savedAt).getTime(),
    )
    .slice(0, 25)
    .map((summary) => ({
      id: `session:${summary.sessionId}`,
      group: "session",
      label: summary.title?.trim() || "제목 없음",
      hint: summary.sourceLabel || summary.projectName,
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
