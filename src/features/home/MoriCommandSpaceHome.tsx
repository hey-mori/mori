import type { CSSProperties, FormEvent } from "react";
import { useMemo, useState } from "react";
import {
  ArrowRight,
  GitBranch,
  Layers3,
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

type CommandModeId = "find" | "shape" | "create" | "review" | "connect";

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
    placeholder: "인증 정책 결정 찾아줘",
  },
  {
    id: "shape",
    label: "정리",
    icon: Layers3,
    placeholder: "최근 대화를 스펙 초안으로 정리해줘",
  },
  {
    id: "create",
    label: "만들기",
    icon: Plus,
    placeholder: "새 워크벤치 만들어줘",
  },
  {
    id: "review",
    label: "검토",
    icon: ShieldCheck,
    placeholder: "이 계획에서 빠진 리스크 찾아줘",
  },
  {
    id: "connect",
    label: "연결",
    icon: GitBranch,
    placeholder: "이 레포지토리를 Mori에 연결해줘",
  },
];

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
  const navigate = useAppStore((state) => state.navigate);
  const openCommandPalette = useAppStore((state) => state.openCommandPalette);
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
  const matchingSessions = useMemo(
    () => filterSessions(sessions, query).slice(0, 4),
    [query, sessions],
  );
  const projectCount = useMemo(
    () => new Set(sessions.map((session) => session.sourceLabel || session.projectName)).size,
    [sessions],
  );

  function runModeAction(modeId: CommandModeId = activeModeId): void {
    switch (modeId) {
      case "find":
        openCommandPalette();
        break;
      case "shape":
        navigate("memory");
        break;
      case "create":
        navigate("start");
        break;
      case "review":
        navigate("continue");
        break;
      case "connect":
        navigate("connections");
        break;
    }
  }

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

  function submitCommand(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (query.trim() && matchingSessions[0]) {
      openSessionById(matchingSessions[0].sessionId);
      return;
    }
    runModeAction();
  }

  return (
    <div className="mori-command-space" data-intent={activeModeId}>
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

            <form className="mcs-command-bar" onSubmit={submitCommand}>
              <Search size={20} aria-hidden="true" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={activeMode.placeholder}
                aria-label="Mori에 요청하기"
              />
              <button type="submit" aria-label="실행">
                <ArrowRight size={18} aria-hidden="true" />
              </button>
            </form>

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
                    onClick={() => setActiveModeId(mode.id)}
                  >
                    <Icon size={16} aria-hidden="true" />
                    <span>{mode.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

        </section>
      </div>
    </div>
  );
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

function filterSessions(sessions: StoredSessionSummary[], query: string): StoredSessionSummary[] {
  const term = query.trim().toLowerCase();
  if (!term) return sessions.slice(0, 4);
  return sessions.filter((session) =>
    [session.title, session.projectName, session.sourceLabel]
      .filter((value): value is string => Boolean(value))
      .some((value) => value.toLowerCase().includes(term)),
  );
}
