import type { ViewKey } from "../../domain/types";
import type { StoredSessionSummary } from "../storage/storageTypes";
import { expandSemanticTerms } from "../project-memory/semanticTerms";

/**
 * Mori Command Space: pure result derivation.
 *
 * The home command bar is not a dead search box: the moment the field is
 * engaged it becomes a small work surface. This module turns the three live
 * inputs (the active mode, the typed query, the user's real sessions) into a
 * flat, keyboard-navigable row list. Keeping it a pure derivation means the
 * interaction (tokenize / match / rank / cap / mode wording) is unit-testable
 * without mounting React, and the component stays a thin renderer.
 *
 * The search is honest and local: it tokenizes the query, drops command filler
 * ("찾아줘", "보여줘", ...) so a typed sentence still matches, then looks for
 * those keywords in the user's real sessions and projects. No semantic model,
 * no network. Decision / evidence search over session bodies is a later layer
 * that reuses these tokens.
 *
 * Two row families:
 *   - `action`: the verb the active mode performs, worded with the query.
 *     Always present, so the panel is never empty.
 *   - context: `session` / `project` rows drawn from the user's real data,
 *     filtered by the keywords (or the most-recent few when idle).
 */

export type CommandModeId = "find" | "ask" | "shape" | "create" | "review" | "connect";

/** Where activating an action row routes. Sessions / projects carry their own id. */
export type CommandSpaceActionTarget =
  | { type: "palette" }
  | { type: "navigate"; view: ViewKey }
  /**
   * Ask Mori in place: answer the question from reviewed memory without
   * leaving Home. Carries the raw (un-tokenized) question so the consumer
   * asks the natural sentence, not the filler-stripped keywords. An empty
   * question is a no-op the consumer guards.
   */
  | { type: "ask"; question: string };

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
  /** Flat row list in display order, ready for keyboard navigation. */
  rows: CommandSpaceRow[];
  /** True when the query carries at least one real keyword (filler removed). */
  hasQuery: boolean;
};

/**
 * One idle-state suggestion for a mode. A `prompt` fills the input (the mode
 * then acts on the typed text); a `feature` runs the mode's related action.
 * Splitting these two is what removes the old ambiguity — a mode that reads
 * the input leads with example prompts, a mode that just navigates leads with
 * its feature, so the input's role is never in doubt.
 */
export type CommandSpaceGuideItem =
  | { kind: "prompt"; id: string; label: string }
  | { kind: "feature"; id: string; label: string; hint?: string; target: CommandSpaceActionTarget };

/** What a mode shows on focus before anything is typed: what it does + how. */
export type CommandSpaceGuide = {
  /** One line naming what this mode does. No trailing punctuation. */
  headline: string;
  /** Group label above the example prompts (mode-specific verb). */
  promptsLabel: string;
  /** Example prompts that fill the input (empty for feature-led modes). */
  prompts: Extract<CommandSpaceGuideItem, { kind: "prompt" }>[];
  /** The mode's related feature action(s). Always at least one. */
  features: Extract<CommandSpaceGuideItem, { kind: "feature" }>[];
};

const SESSION_LIMIT_QUERY = 5;
const SESSION_LIMIT_RECENT = 3;
const PROJECT_LIMIT = 3;

/**
 * Command / filler words that ride along a natural request. Dropping them
 * before matching is what lets a typed sentence like "인증 정책 결정 찾아줘"
 * still find work instead of matching the literal sentence (zero hits).
 */
const FILLER_TOKENS = new Set([
  // Korean command verbs + polite endings, written as their own word
  "찾아줘", "찾아", "찾아주세요", "보여줘", "보여", "보여주세요", "알려줘", "알려",
  "알려주세요", "정리해줘", "만들어줘", "검토해줘", "연결해줘", "해줘", "해주세요",
  "줘", "주세요", "좀", "관련", "관련된", "대한", "대해", "그리고", "또",
  // Common standalone particles / stopwords
  "의", "를", "을", "는", "은", "이", "가", "에", "에서",
  // English
  "find", "show", "me", "the", "a", "an", "please", "search", "for", "about",
  "get", "list", "to",
]);

/** Lowercased, filler-stripped keywords from a raw query. */
export function tokenizeQuery(query: string): string[] {
  return query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter((token) => token.length > 0 && !FILLER_TOKENS.has(token));
}

export function buildCommandSpaceResults(input: {
  modeId: CommandModeId;
  query: string;
  sessions: ReadonlyArray<StoredSessionSummary>;
}): CommandSpaceResults {
  const tokens = tokenizeQuery(input.query);
  const hasQuery = tokens.length > 0;
  const seed = tokens.join(" ");
  // Bridge the keywords across Korean / English so "auth" finds a 인증 session
  // and "라우팅" finds a routing one. The seed (action label) stays the user's
  // own words; only matching widens.
  const matchTokens = expandSemanticTerms(tokens);

  const actions = buildModeActions(input.modeId, seed, input.query);
  const projectRows = hasQuery
    ? matchProjects(input.sessions, matchTokens).slice(0, PROJECT_LIMIT)
    : [];
  const sessionRows = matchSessions(input.sessions, matchTokens).slice(
    0,
    hasQuery ? SESSION_LIMIT_QUERY : SESSION_LIMIT_RECENT,
  );

  const context = [...projectRows, ...sessionRows];
  // In 찾기 the matches are the point, so they lead and "전체 검색" trails. In
  // the doing modes the verb leads and matches are supporting context.
  const rows =
    input.modeId === "find" ? [...context, ...actions] : [...actions, ...context];

  return { rows, hasQuery };
}

/**
 * The idle guide for a mode: a one-line headline of what it does, example
 * prompts for the input-led modes (찾기 / 묻기), and the related feature
 * action for every mode. Situation-aware — examples are seeded with the
 * user's most recent project when there is one, so the suggestions read like
 * the user's own work rather than generic filler.
 */
export function buildModeGuide(input: {
  modeId: CommandModeId;
  sessions: ReadonlyArray<StoredSessionSummary>;
}): CommandSpaceGuide {
  const project = recentProjectLabel(input.sessions);
  switch (input.modeId) {
    case "find":
      return {
        headline: "세션과 프로젝트에서 키워드로 찾기",
        promptsLabel: "이렇게 찾아보세요",
        prompts: prompts([project, "인증", "라우팅"]),
        features: [
          feature("guide-find-all", "전체 검색 열기", {
            hint: "세션 · 프로젝트 · 명령",
            target: { type: "palette" },
          }),
        ],
      };
    case "ask":
      return {
        headline: "검토된 메모리에 묻고 근거와 함께 답받기",
        promptsLabel: "이렇게 물어보세요",
        prompts: prompts([
          project ? `${project}에서 무엇을 결정했나요?` : "이 프로젝트에서 무엇을 결정했나요?",
          "아직 해결되지 않은 이슈는 무엇인가요?",
          "다음에 무엇부터 이어가면 될까요?",
        ]),
        features: [
          feature("guide-ask-memory", "프로젝트 메모리 열기", {
            hint: "확정된 기억 모아 보기",
            target: { type: "navigate", view: "memory" },
          }),
        ],
      };
    case "shape":
      return {
        headline: "검토한 작업을 durable 메모리로 정리",
        promptsLabel: "",
        prompts: [],
        features: [
          feature("guide-shape-consolidation", "메모리 통합 검토", {
            hint: "리뷰한 작업을 기억으로",
            target: { type: "navigate", view: "consolidation" },
          }),
          feature("guide-shape-memory", "프로젝트 메모리 열기", {
            target: { type: "navigate", view: "memory" },
          }),
        ],
      };
    case "create":
      return {
        headline: "새 작업 세션 시작",
        promptsLabel: "",
        prompts: [],
        features: [
          feature("guide-create-start", "새 세션 시작", {
            hint: "대화 불러오기 · 빈 세션",
            target: { type: "navigate", view: "start" },
          }),
        ],
      };
    case "review":
      return {
        headline: "최근 작업을 검토하고 이어가기",
        promptsLabel: "",
        prompts: [],
        features: [
          feature("guide-review-continue", "이어가기 열기", {
            hint: "최근 작업 검토",
            target: { type: "navigate", view: "continue" },
          }),
        ],
      };
    case "connect":
      return {
        headline: "Claude · Codex · Git 같은 소스 연결",
        promptsLabel: "",
        prompts: [],
        features: [
          feature("guide-connect-sources", "소스 연결 열기", {
            hint: "Claude · Codex · Git · 메모",
            target: { type: "navigate", view: "connections" },
          }),
        ],
      };
  }
}

function prompts(
  labels: ReadonlyArray<string | null>,
): Extract<CommandSpaceGuideItem, { kind: "prompt" }>[] {
  const out: Extract<CommandSpaceGuideItem, { kind: "prompt" }>[] = [];
  const seen = new Set<string>();
  for (const label of labels) {
    const text = label?.trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    out.push({ kind: "prompt", id: `prompt-${out.length}`, label: text });
  }
  return out;
}

function feature(
  id: string,
  label: string,
  rest: { hint?: string; target: CommandSpaceActionTarget },
): Extract<CommandSpaceGuideItem, { kind: "feature" }> {
  return { kind: "feature", id, label, ...rest };
}

/** Most-recent session's project label, used to seed situation-aware examples. */
function recentProjectLabel(sessions: ReadonlyArray<StoredSessionSummary>): string | null {
  let best: StoredSessionSummary | null = null;
  for (const session of sessions) {
    if (!best) {
      best = session;
      continue;
    }
    const a = new Date(session.startedAt || session.savedAt).getTime();
    const b = new Date(best.startedAt || best.savedAt).getTime();
    if (a > b) best = session;
  }
  if (!best) return null;
  const raw = best.projectName || best.sourceLabel || "";
  // sourceLabel is often a full path ("C:/dev/ng-gw"); a seeded example reads
  // better as the project's leaf name ("ng-gw") than the whole path.
  const leaf = raw.split(/[/\\]/).filter(Boolean).pop();
  return leaf ?? null;
}

/**
 * The mode's primary verb(s), worded with the cleaned keywords. Routes to the
 * real surface that performs the intent. Returned as `action` rows so Enter
 * always has an obvious target even when nothing matches.
 */
function buildModeActions(
  modeId: CommandModeId,
  seed: string,
  rawQuery: string,
): CommandSpaceRow[] {
  const quoted = seed ? `‘${seed}’` : "";
  switch (modeId) {
    case "find":
      return [
        action("act-find", seed ? `${quoted} 전체에서 찾기` : "전체 검색 열기", {
          hint: "세션 · 프로젝트 · 명령",
          target: { type: "palette" },
        }),
      ];
    case "ask": {
      // Ask uses the raw sentence, not the filler-stripped keywords: the
      // question's grammar is what the LLM answers. Tokens still drive the
      // supporting session/project context rows below.
      const question = rawQuery.trim();
      const label = question ? `‘${question}’ 물어보기` : "메모리에 무엇이든 물어보기";
      return [
        action("act-ask", label, {
          hint: "검토된 메모리 · 활성 세션 근거",
          target: { type: "ask", question },
        }),
      ];
    }
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
        action("act-create", seed ? `${quoted} 세션 시작` : "새 세션 시작", {
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

/**
 * Sessions whose title / project / source contains the keywords, ranked by how
 * many keywords hit (then recency). With no keywords, the most-recent sessions
 * pass through so a focused-but-empty field still offers somewhere to resume.
 */
function matchSessions(
  sessions: ReadonlyArray<StoredSessionSummary>,
  tokens: readonly string[],
): CommandSpaceRow[] {
  const sorted = [...sessions].sort(
    (a, b) =>
      new Date(b.startedAt || b.savedAt).getTime() -
      new Date(a.startedAt || a.savedAt).getTime(),
  );
  if (tokens.length === 0) return sorted.map(toSessionRow);

  const scored: { session: StoredSessionSummary; hits: number }[] = [];
  for (const session of sorted) {
    const haystack = sessionHaystack(session);
    const hits = tokens.reduce(
      (count, token) => (haystack.includes(token) ? count + 1 : count),
      0,
    );
    if (hits > 0) scored.push({ session, hits });
  }
  // Stable sort keeps the recency order for sessions with the same hit count.
  scored.sort((a, b) => b.hits - a.hits);
  return scored.map((row) => toSessionRow(row.session));
}

/**
 * Distinct projects the sessions belong to, keyed by the raw `sourceLabel`
 * (falling back to `projectName`) so `openProject` resolves them the same way
 * the sidebar and workspace do. Kept only when a keyword hits, ranked by how
 * many sessions reference each.
 */
function matchProjects(
  sessions: ReadonlyArray<StoredSessionSummary>,
  tokens: readonly string[],
): CommandSpaceRow[] {
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
    .filter((project) => {
      const haystack = `${project.label} ${project.key}`.toLowerCase();
      return tokens.some((token) => haystack.includes(token));
    })
    .sort((a, b) => b.count - a.count)
    .map((project) => ({
      kind: "project",
      id: `project:${project.key}`,
      label: project.label,
      // A path hint only when it adds information beyond the display name,
      // never a redundant session count.
      hint: project.key !== project.label ? project.key : undefined,
      projectKey: project.key,
    }));
}

function toSessionRow(session: StoredSessionSummary): CommandSpaceRow {
  return {
    kind: "session",
    id: `session:${session.sessionId}`,
    label: session.title?.trim() || "제목 없음",
    hint: session.sourceLabel || session.projectName || undefined,
    sessionId: session.sessionId,
  };
}

function sessionHaystack(session: StoredSessionSummary): string {
  return [session.title, session.projectName, session.sourceLabel]
    .filter((value): value is string => Boolean(value))
    .join(" ")
    .toLowerCase();
}
