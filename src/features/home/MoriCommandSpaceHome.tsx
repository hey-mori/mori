import type {
  CSSProperties,
  FocusEvent,
  FormEvent,
  KeyboardEvent,
  MutableRefObject,
  ReactNode,
} from "react";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  Folder,
  GitBranch,
  Layers3,
  MessageCircleQuestion,
  MessageSquare,
  Plus,
  Search,
  ShieldCheck,
} from "lucide-react";
import { useAppStore, type SessionTab } from "../../app/store";
import {
  loadStoredSessionSummaries,
  selectSessionView,
  useSessionStore,
} from "../../app/sessionStore";
import { DEMO_SESSION_SUMMARIES } from "../../lib/demo/demoSessionFixtures";
import type { StoredSessionSummary } from "../../lib/storage/storageTypes";
import {
  buildCommandSpaceResults,
  buildModeGuide,
  type CommandModeId,
  type CommandSpaceActionTarget,
  type CommandSpaceRow,
} from "../../lib/home/commandSpace";

const HomeAskMoriPanel = lazy(() =>
  import("./HomeAskMoriPanel").then((module) => ({ default: module.HomeAskMoriPanel })),
);

type CommandMode = {
  id: CommandModeId;
  label: string;
  icon: typeof Search;
  placeholder: string;
};

type CommandNode = {
  id: string;
  label: string;
  meta: string;
  x: number;
  y: number;
  tone: "violet" | "green" | "blue" | "amber" | "slate";
  scale: number;
};

const IS_MAC =
  typeof navigator !== "undefined" &&
  /mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent || "");
const SHORTCUT_LABEL = IS_MAC ? "⌘ K" : "Ctrl K";

const COMMAND_MODES: CommandMode[] = [
  {
    id: "find",
    label: "찾기",
    icon: Search,
    placeholder: "찾을 세션이나 키워드",
  },
  {
    id: "ask",
    label: "묻기",
    icon: MessageCircleQuestion,
    placeholder: "메모리에 묻고 싶은 질문",
  },
  {
    id: "shape",
    label: "정리",
    icon: Layers3,
    placeholder: "정리할 작업 키워드",
  },
  {
    id: "create",
    label: "만들기",
    icon: Plus,
    placeholder: "새 세션 이름",
  },
  {
    id: "review",
    label: "검토",
    icon: ShieldCheck,
    placeholder: "이어갈 작업 키워드",
  },
  {
    id: "connect",
    label: "연결",
    icon: GitBranch,
    placeholder: "연결할 소스 이름",
  },
];

const ROW_ICON = {
  session: MessageSquare,
  project: Folder,
} as const;

const NODE_POSITIONS = [
  [17, 20, 1.08],
  [32, 13, 0.88],
  [58, 17, 1.02],
  [76, 25, 0.94],
  [22, 65, 0.96],
  [43, 77, 1.08],
  [66, 68, 0.92],
  [84, 58, 1],
  [13, 45, 0.82],
  [88, 42, 1.02],
  [80, 74, 0.84],
  [15, 56, 0.9],
] as const;

const NODE_TONES: CommandNode["tone"][] = ["violet", "green", "blue", "amber", "slate"];

export function MoriCommandSpaceHome() {
  const [activeModeId, setActiveModeId] = useState<CommandModeId>("find");
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [askRequest, setAskRequest] = useState<{ question: string; id: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const rowRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const navigate = useAppStore((state) => state.navigate);
  const openCommandPalette = useAppStore((state) => state.openCommandPalette);
  const openProject = useAppStore((state) => state.openProject);
  const openSession = useAppStore((state) => state.openSession);
  const source = useSessionStore((state) => state.source);
  const initialized = useSessionStore((state) => state.initialized);
  const dataResetNonce = useSessionStore((state) => state.dataResetNonce);
  const activeSessionId = useSessionStore((state) => selectSessionView(state).session.id);
  const loadBrowserSession = useSessionStore((state) => state.loadBrowserSession);
  const loadDesktopSession = useSessionStore((state) => state.loadDesktopSession);

  const sessions = useMemo(() => {
    const stored = loadStoredSessionSummaries();
    return stored.length > 0 ? stored : DEMO_SESSION_SUMMARIES;
  }, [initialized, dataResetNonce]);

  const activeMode = COMMAND_MODES.find((mode) => mode.id === activeModeId) ?? COMMAND_MODES[0];
  const sessionNodes = useMemo(() => buildCommandNodes(sessions), [sessions]);
  const results = useMemo(
    () => buildCommandSpaceResults({ modeId: activeModeId, query, sessions }),
    [activeModeId, query, sessions],
  );
  const guide = useMemo(
    () => buildModeGuide({ modeId: activeModeId, sessions }),
    [activeModeId, sessions],
  );
  const projectCount = useMemo(
    () => new Set(sessions.map((session) => session.sourceLabel || session.projectName)).size,
    [sessions],
  );

  const rows = results.rows;
  // While an answer (or its in-flight / error state) is showing in 묻기, the
  // answer panel below the console is the result surface, so the floating
  // context dropdown steps aside to avoid overlapping it.
  const showAnswerPanel =
    activeModeId === "ask" && askRequest !== null;
  // Idle (focused, nothing typed) shows the mode guide — what this mode does,
  // example prompts, and its related feature — so the input's role is clear
  // before the user commits a keystroke. Typing swaps to live results.
  const showGuide = focused && !results.hasQuery && !showAnswerPanel;
  const open = focused && results.hasQuery && rows.length > 0 && !showAnswerPanel;
  const safeIndex = Math.min(activeIndex, Math.max(0, rows.length - 1));
  // In 찾기, a query that hits nothing leaves only the full-search action. Say so
  // plainly instead of showing a lone action that reads like the search broke.
  const noMatches =
    activeModeId === "find" &&
    results.hasQuery &&
    !rows.some((row) => row.kind !== "action");

  // Re-home the highlight on the top row whenever the result set changes shape.
  useEffect(() => {
    setActiveIndex(0);
  }, [query, activeModeId]);

  // Leaving 묻기 clears the answer so a stale response never lingers under a
  // different lens; switching back starts fresh.
  useEffect(() => {
    if (activeModeId !== "ask") {
      setAskRequest(null);
    }
  }, [activeModeId]);

  // Editing the question retires the previous answer, so the live context
  // dropdown returns and the next Enter asks the new question.
  useEffect(() => {
    setAskRequest(null);
  }, [query]);

  // Keep the keyboard-highlighted row in view when the list scrolls.
  useEffect(() => {
    if (!open) return;
    rowRefs.current[safeIndex]?.scrollIntoView({ block: "nearest" });
  }, [open, safeIndex]);

  function openSessionById(sessionId: string, tab: SessionTab = "flow"): void {
    if (sessionId === activeSessionId) {
      openSession(tab);
      return;
    }
    if (source === "desktop-sqlite") {
      void loadDesktopSession(sessionId).then((ok) => {
        if (!ok) loadBrowserSession(sessionId);
        openSession(tab);
      });
      return;
    }
    loadBrowserSession(sessionId);
    openSession(tab);
  }

  function runAsk(question: string): void {
    const trimmed = question.trim();
    if (trimmed.length === 0) return;
    setAskRequest((previous) => ({ question: trimmed, id: (previous?.id ?? 0) + 1 }));
  }

  // A guide example fills the input; in 묻기 it also asks straight away, since
  // a question is meant to be answered, not just typed.
  function activateGuidePrompt(text: string): void {
    setQuery(text);
    if (activeModeId === "ask") {
      runAsk(text);
    } else {
      inputRef.current?.focus();
    }
  }

  function runActionTarget(target: CommandSpaceActionTarget): void {
    switch (target.type) {
      case "palette":
        openCommandPalette();
        return;
      case "navigate":
        navigate(target.view);
        return;
      case "ask":
        runAsk(target.question);
        return;
    }
  }

  function activateRow(row: CommandSpaceRow): void {
    switch (row.kind) {
      case "action":
        runActionTarget(row.target);
        break;
      case "session":
        openSessionById(row.sessionId);
        break;
      case "project":
        openProject(row.projectKey);
        break;
    }
  }

  function submitCommand(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const row = rows[safeIndex] ?? rows[0];
    if (row) activateRow(row);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => Math.min(index + 1, rows.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === "Escape") {
      if (query) {
        setQuery("");
      } else {
        inputRef.current?.blur();
      }
    }
  }

  function handleConsoleBlur(event: FocusEvent<HTMLDivElement>): void {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setFocused(false);
    }
  }

  return (
    <div
      className="mori-command-space"
      data-intent={activeModeId}
      data-focused={focused ? "true" : undefined}
    >
      <div className="mcs-background" aria-hidden="true">
        <span className="mcs-grid" />
        <span className="mcs-wave mcs-wave-a" />
        <span className="mcs-wave mcs-wave-b" />
        {sessionNodes.map((node, index) => (
          <span
            key={node.id}
            className={`mcs-context-node is-${node.tone}`}
            style={
              {
                "--mcs-x": `${node.x}%`,
                "--mcs-y": `${node.y}%`,
                "--mcs-scale": node.scale,
                "--mcs-delay": `${index * 130}ms`,
              } as CSSProperties
            }
          >
            <span>{node.label}</span>
            <small>{node.meta}</small>
          </span>
        ))}
      </div>

      <div className="mcs-scroll base-scroll">
        <section className="mcs-stage" aria-label="Mori Command Space">
          <div className="mcs-status-row" aria-label="작업 공간 상태">
            <span>{projectCount}개 프로젝트</span>
            <span>{sessions.length}개 세션</span>
            <button type="button" onClick={openCommandPalette}>
              {SHORTCUT_LABEL}
            </button>
          </div>

          <div className="mcs-center">
            <h1>무엇을 해볼까요?</h1>

            <div
              className="mcs-console"
              onFocus={() => setFocused(true)}
              onBlur={handleConsoleBlur}
            >
              <form className="mcs-command-bar" onSubmit={submitCommand}>
                <Search size={20} aria-hidden="true" />
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={activeMode.placeholder}
                  aria-label="Mori에 요청하기"
                  role="combobox"
                  aria-expanded={open || showGuide}
                  aria-controls="mcs-results"
                  aria-activedescendant={open ? `mcs-row-${safeIndex}` : undefined}
                  autoComplete="off"
                />
                <button type="submit" aria-label="실행">
                  <ArrowRight size={18} aria-hidden="true" />
                </button>
              </form>

              {open ? (
                <div className="mcs-results" id="mcs-results" role="listbox">
                  {noMatches ? (
                    <p className="mcs-result-empty">
                      일치하는 세션·프로젝트가 없어요
                    </p>
                  ) : null}
                  {renderRows(rows, {
                    activeMode,
                    safeIndex,
                    hasQuery: results.hasQuery,
                    rowRefs,
                    onActivate: activateRow,
                    onHover: setActiveIndex,
                  })}
                </div>
              ) : showGuide ? (
                <div className="mcs-results mcs-guide" id="mcs-results" role="listbox">
                  <p className="mcs-guide-headline">{guide.headline}</p>
                  {guide.prompts.length > 0 ? (
                    <>
                      <p className="mcs-result-head">{guide.promptsLabel}</p>
                      {guide.prompts.map((item) => (
                        <button
                          type="button"
                          key={item.id}
                          role="option"
                          aria-selected={false}
                          className="mcs-result-row"
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => activateGuidePrompt(item.label)}
                        >
                          <activeMode.icon size={15} aria-hidden="true" className="mcs-result-icon" />
                          <span className="mcs-result-label">{item.label}</span>
                          <ArrowRight size={14} aria-hidden="true" className="mcs-result-go" />
                        </button>
                      ))}
                    </>
                  ) : null}
                  <p className="mcs-result-head">관련 기능</p>
                  {guide.features.map((item) => (
                    <button
                      type="button"
                      key={item.id}
                      role="option"
                      aria-selected={false}
                      className="mcs-result-row"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => runActionTarget(item.target)}
                    >
                      <activeMode.icon size={15} aria-hidden="true" className="mcs-result-icon" />
                      <span className="mcs-result-label">{item.label}</span>
                      {item.hint ? <span className="mcs-result-hint">{item.hint}</span> : null}
                      <ArrowRight size={14} aria-hidden="true" className="mcs-result-go" />
                    </button>
                  ))}
                </div>
              ) : null}

              <div className="mcs-mode-rail" role="tablist" aria-label="명령 모드">
                {COMMAND_MODES.map((mode) => {
                  const Icon = mode.icon;
                  const active = mode.id === activeModeId;
                  return (
                    <button
                      key={mode.id}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      className={active ? "is-active" : undefined}
                      // Switching lens keeps the caret in the input, so an open
                      // result panel re-shapes under the new mode without losing
                      // focus, and clicking a lens from idle never pops a panel.
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => setActiveModeId(mode.id)}
                    >
                      <Icon size={16} aria-hidden="true" />
                      <span>{mode.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {showAnswerPanel ? (
              <div className="mcs-answer-panel" aria-live="polite">
                {askRequest ? (
                  <Suspense fallback={<p className="mcs-answer-status">메모리에서 답을 찾는 중...</p>}>
                    <HomeAskMoriPanel
                      question={askRequest.question}
                      requestId={askRequest.id}
                      onSelectMemory={() => navigate("memory")}
                      onNavigateEvent={() => openSession("flow")}
                    />
                  </Suspense>
                ) : null}
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}

function renderRows(
  rows: CommandSpaceRow[],
  options: {
    activeMode: CommandMode;
    safeIndex: number;
    hasQuery: boolean;
    rowRefs: MutableRefObject<Array<HTMLButtonElement | null>>;
    onActivate: (row: CommandSpaceRow) => void;
    onHover: (index: number) => void;
  },
) {
  const { activeMode, safeIndex, hasQuery, rowRefs, onActivate, onHover } = options;
  rowRefs.current = [];
  const out: ReactNode[] = [];
  let prevKind: CommandSpaceRow["kind"] | null = null;

  rows.forEach((row, index) => {
    if (row.kind !== prevKind) {
      out.push(
        <p className="mcs-result-head" key={`head-${row.kind}`}>
          {groupLabel(row.kind, hasQuery)}
        </p>,
      );
      prevKind = row.kind;
    }
    const Icon = row.kind === "action" ? activeMode.icon : ROW_ICON[row.kind];
    out.push(
      <button
        type="button"
        key={row.id}
        id={`mcs-row-${index}`}
        role="option"
        aria-selected={index === safeIndex}
        ref={(element) => {
          rowRefs.current[index] = element;
        }}
        className={`mcs-result-row${index === safeIndex ? " is-active" : ""}`}
        // Keep focus in the input so the dropdown survives the click, then act.
        onMouseDown={(event) => event.preventDefault()}
        onMouseEnter={() => onHover(index)}
        onClick={() => onActivate(row)}
      >
        <Icon size={15} aria-hidden="true" className="mcs-result-icon" />
        <span className="mcs-result-label">{row.label}</span>
        {row.hint ? <span className="mcs-result-hint">{row.hint}</span> : null}
        <ArrowRight size={14} aria-hidden="true" className="mcs-result-go" />
      </button>,
    );
  });

  return out;
}

function groupLabel(kind: CommandSpaceRow["kind"], hasQuery: boolean): string {
  if (kind === "action") return "바로 실행";
  if (kind === "project") return "프로젝트";
  return hasQuery ? "관련 세션" : "최근 세션";
}

function buildCommandNodes(sessions: StoredSessionSummary[]): CommandNode[] {
  const rows = sessions.slice(0, NODE_POSITIONS.length);
  return rows.map((session, index) => {
    const [x, y, scale] = NODE_POSITIONS[index % NODE_POSITIONS.length];
    return {
      id: session.sessionId,
      label: session.title || "제목 없음",
      meta: session.sourceLabel || session.projectName || "Mori",
      x,
      y,
      scale,
      tone: NODE_TONES[index % NODE_TONES.length],
    };
  });
}
