import { useEffect, useMemo } from "react";
import { Layers, PlugZap, Sparkles } from "lucide-react";
import { EmptyState } from "../../components/layout/EmptyState";
import { PageShell } from "../../components/layout/PageShell";
import { Button } from "../../components/ui/Button";
import { MoriLogo } from "../../components/brand/MoriLogo";
import { useAppStore } from "../../app/store";
import {
  loadStoredSessionSummaries,
  selectSessionMode,
  selectSessionView,
  useSessionStore,
} from "../../app/sessionStore";
import { createBrowserDraftRepository } from "../../lib/storage/localStorageAdapter";
import { mergeDemoSessionSummaries, isDemoSessionId } from "../../lib/demo/demoSessionFixtures";
import { buildDemoSessionContent } from "../../lib/demo/demoSessionContent";
import { isNextActionCompleted } from "../../lib/session/nextActionCompletion";
import {
  buildHomeOverview,
  formatRelativeKo,
  type HomeSessionMetricSnapshot,
} from "../../lib/home/homeOverview";
import { HomeFocalCard, type HomeCarryEntry } from "./HomeFocalCard";
import { HomeResumeList } from "./HomeResumeList";
import { HomeDecisions, type HomeDecisionItem } from "./HomeDecisions";

/** How many extra "이어갈 다른 작업" rows to surface beside the memory rail. */
const HOME_OTHER_LIMIT = 4;

/** How many concrete carry-forward items to list on the focal card. */
const HOME_CARRY_LIMIT = 4;

/** How many recent decisions to surface in the memory rail. */
const HOME_DECISION_LIMIT = 6;

/**
 * Home — the calm landing surface and the app's 간판.
 *
 * Mori is a work-memory app: its payoff is *continuing* remembered work, so
 * Home leads with exactly that. A premium brand hero (lavender panel + the Mori
 * mark) states what Mori holds, then one focal "이어갈 작업" card resumes the most
 * recent session with the context it carries forward (next actions, decisions to
 * confirm, open issues), with a few lighter rows for the next resumable sessions.
 *
 * It is deliberately NOT the notification feed (that is the 알림 page), NOT the
 * analytics dashboard (대시보드), and NOT the raw session list (the sidebar).
 * Everything is derived from already-stored sessions and their reviewed memory
 * bodies — no fabricated data; a truly empty install shows the import nudge.
 */
export function HomeView() {
  const navigate = useAppStore((state) => state.navigate);
  const openSession = useAppStore((state) => state.openSession);
  const loadBrowserSession = useSessionStore((state) => state.loadBrowserSession);
  const hydrate = useSessionStore((state) => state.hydrate);
  const initialized = useSessionStore((state) => state.initialized);
  const mode = useSessionStore(selectSessionMode);
  const view = useSessionStore(selectSessionView);

  useEffect(() => {
    if (!initialized) hydrate();
  }, [initialized, hydrate]);

  const repository = useMemo(() => createBrowserDraftRepository(), []);
  const activeSessionId = view.session.id;

  const { overview, sessionCount, decisions } = useMemo(() => {
    let realSessions: ReturnType<typeof loadStoredSessionSummaries>;
    try {
      realSessions = loadStoredSessionSummaries();
    } catch {
      realSessions = [];
    }
    const storedSessions = mergeDemoSessionSummaries(realSessions);
    const sessionMetrics = gatherSessionMetrics(storedSessions, repository);
    const built = buildHomeOverview({
      storedSessions,
      sessionMetrics,
      realSessionCount: realSessions.length,
      isDemo: mode === "demo",
      metric: "sessions",
    });
    const recentDecisions = gatherRecentDecisions(storedSessions, repository);
    return { overview: built, sessionCount: storedSessions.length, decisions: recentDecisions };
    // `initialized` re-reads storage after hydrate; `mode` covers demo↔real.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repository, mode, initialized]);

  const focal = overview.currentSessions[0] ?? null;
  const others = overview.recentSessions
    .filter((session) => session.sessionId !== focal?.sessionId)
    .slice(0, HOME_OTHER_LIMIT);

  // The focal session's concrete carry-forward items (titles, not just counts),
  // so the card shows what is genuinely waiting. Read once, keyed to the focal.
  const { carry, carryMore } = useMemo(() => {
    if (!focal) return { carry: [] as HomeCarryEntry[], carryMore: 0 };
    return buildFocalCarry(focal.sessionId, repository);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focal?.sessionId, repository, initialized]);

  const pulse = buildPulse(sessionCount);

  function resume(sessionId: string, kind: "resume" | "open"): void {
    const ready = sessionId === activeSessionId || loadBrowserSession(sessionId);
    if (kind === "resume" && ready) {
      navigate("reports");
    } else {
      openSession("flow");
    }
  }

  return (
    <PageShell className="home-page" maxWidth="wide">
      {overview.isEmpty || !focal ? (
        <EmptyState
          icon={Layers}
          title="아직 기억된 작업이 없습니다"
          description="연결에서 작업 세션을 가져오면, 무엇을 했고 다음에 무엇을 이어가면 좋을지 여기에 정리됩니다."
          actions={
            <>
              <Button variant="primary" icon={PlugZap} onClick={() => navigate("connections")}>
                연결에서 작업 가져오기
              </Button>
              <Button variant="ghost" icon={Sparkles} onClick={() => openSession("flow")}>
                체험용 데모 세션 살펴보기
              </Button>
            </>
          }
        />
      ) : (
        <div className="home-landing">
          <header className="home-hero">
            <div className="home-hero-content">
              <span className="home-hero-kicker">{pulse.kicker}</span>
              <h1 className="home-hero-title">{pulse.headline}</h1>
            </div>
            <MoriLogo variant="mark" tone="mono" size={156} className="home-hero-mark" />
          </header>

          <HomeFocalCard
            focal={focal}
            carry={carry}
            carryMore={carryMore}
            onResume={resume}
          />

          {others.length > 0 || decisions.length > 0 ? (
            <div className={`home-body${others.length > 0 && decisions.length > 0 ? "" : " is-single"}`}>
              {others.length > 0 ? (
                <HomeResumeList sessions={others} onOpen={(id) => resume(id, "open")} />
              ) : null}
              {decisions.length > 0 ? (
                <HomeDecisions decisions={decisions} onOpen={(id) => resume(id, "open")} />
              ) : null}
            </div>
          ) : null}
        </div>
      )}
    </PageShell>
  );
}

/**
 * A calm landing pulse: today's date + a one-line summary of how much work Mori
 * is holding. Warm but never a name greeting, and never mentions demo state; the
 * count is simply how many sessions the surface is showing.
 */
function buildPulse(
  sessionCount: number,
  now: number = Date.now(),
): { kicker: string; headline: string } {
  const date = new Date(now);
  const weekday = ["일", "월", "화", "수", "목", "금", "토"][date.getDay()];
  const kicker = `${date.getMonth() + 1}월 ${date.getDate()}일 ${weekday}요일`;
  const headline = `${sessionCount}개의 작업을 기억하고 있어요`;
  return { kicker, headline };
}

/**
 * Build the focal card's concrete carry-forward list: the actual pending next
 * actions, then decisions to confirm, then open issues — titles, not counts.
 * Capped to `HOME_CARRY_LIMIT`, with the remainder reported as `carryMore`.
 * Reads the demo fixture for demo sessions and the stored memory body otherwise.
 */
function buildFocalCarry(
  sessionId: string,
  repository: ReturnType<typeof createBrowserDraftRepository>,
): { carry: HomeCarryEntry[]; carryMore: number } {
  const all: HomeCarryEntry[] = [];

  const collect = (work: {
    nextActions: { id: string; title: string }[];
    decisions: { id: string; title: string }[];
    issues: { id: string; title: string }[];
  }) => {
    for (const a of work.nextActions) all.push({ key: a.id, kind: "next", text: a.title });
    for (const d of work.decisions) all.push({ key: d.id, kind: "decision", text: d.title });
    for (const i of work.issues) all.push({ key: i.id, kind: "issue", text: i.title });
  };

  if (isDemoSessionId(sessionId)) {
    const demo = buildDemoSessionContent(sessionId);
    if (demo) {
      collect({
        nextActions: demo.nextActions.filter((a) => !isNextActionCompleted(a)),
        decisions: demo.decisions.filter((d) => !d.confirmed),
        issues: demo.issues.filter((i) => i.status === "open"),
      });
    }
  } else {
    let body;
    try {
      body = repository.loadSessionMemoryBody(sessionId);
    } catch {
      body = null;
    }
    if (body) {
      collect({
        nextActions: body.nextActions.filter((a) => !isNextActionCompleted(a)),
        decisions: body.decisions.filter((d) => !d.confirmed),
        issues: body.issues.filter((i) => i.status === "open"),
      });
    }
  }

  return { carry: all.slice(0, HOME_CARRY_LIMIT), carryMore: Math.max(all.length - HOME_CARRY_LIMIT, 0) };
}

/** Trailing path segment of a source label, e.g. "C:/dev/ng-gw" → "ng-gw". */
function shortProject(label: string | undefined): string | null {
  const trimmed = label?.trim();
  if (!trimmed) return null;
  const parts = trimmed.split(/[\\/]/).filter(Boolean);
  const tail = parts.length > 0 ? parts[parts.length - 1]! : trimmed;
  return tail.length <= 20 ? tail : `${tail.slice(0, 19)}…`;
}

/**
 * Gather the most recent decisions across every stored session — Mori's durable
 * "what was decided" memory — for the right rail. Reads demo fixtures for demo
 * sessions and stored memory bodies otherwise; sorts newest-first by the
 * decision's own timestamp and caps to `HOME_DECISION_LIMIT`.
 */
function gatherRecentDecisions(
  storedSessions: ReturnType<typeof mergeDemoSessionSummaries>,
  repository: ReturnType<typeof createBrowserDraftRepository>,
): HomeDecisionItem[] {
  const all: (HomeDecisionItem & { createdAt: string })[] = [];

  for (const session of storedSessions) {
    const projectLabel = shortProject(session.sourceLabel);
    let decisions: { id: string; title: string; createdAt: string; confirmed?: boolean }[] = [];
    if (isDemoSessionId(session.sessionId)) {
      decisions = buildDemoSessionContent(session.sessionId)?.decisions ?? [];
    } else {
      try {
        decisions = repository.loadSessionMemoryBody(session.sessionId)?.decisions ?? [];
      } catch {
        decisions = [];
      }
    }
    for (const decision of decisions) {
      all.push({
        id: decision.id,
        title: decision.title,
        projectLabel,
        sessionId: session.sessionId,
        timeLabel: formatRelativeKo(decision.createdAt),
        createdAt: decision.createdAt,
      });
    }
  }

  all.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  return all.slice(0, HOME_DECISION_LIMIT).map(({ createdAt: _createdAt, ...rest }) => rest);
}

/**
 * Gather the cheap per-session carry-forward counts from each stored memory
 * body (issues / decisions / next actions). Never re-parses raw imports; a
 * session with no analysis simply contributes nothing.
 */
function gatherSessionMetrics(
  storedSessions: ReturnType<typeof mergeDemoSessionSummaries>,
  repository: ReturnType<typeof createBrowserDraftRepository>,
): HomeSessionMetricSnapshot[] {
  return storedSessions.map((session) => {
    // Demo sessions carry their reviewed work in the bundled fixtures, not in
    // localStorage, so read counts from there — otherwise a fresh (demo-only)
    // install would show an empty continuation card despite "분석 완료".
    if (isDemoSessionId(session.sessionId)) {
      const demo = buildDemoSessionContent(session.sessionId);
      if (demo) {
        return {
          sessionId: session.sessionId,
          hasReconstructedWork: true,
          issues: demo.issues.length,
          openIssues: demo.issues.filter((issue) => issue.status === "open").length,
          decisions: demo.decisions.length,
          unconfirmedDecisions: demo.decisions.filter((d) => !d.confirmed).length,
          pendingNextActions: demo.nextActions.filter((a) => !isNextActionCompleted(a)).length,
        };
      }
    }

    let body;
    try {
      body = repository.loadSessionMemoryBody(session.sessionId);
    } catch {
      body = null;
    }
    if (!body) return { sessionId: session.sessionId };

    const openIssues = body.issues.filter((issue) => issue.status === "open").length;
    const unconfirmedDecisions = body.decisions.filter((d) => !d.confirmed).length;
    const pendingNextActions = body.nextActions.filter((a) => !isNextActionCompleted(a)).length;
    const hasReconstructedWork =
      body.issues.length > 0 ||
      body.decisions.length > 0 ||
      body.nextActions.length > 0 ||
      Boolean(body.summarySnapshot);

    return {
      sessionId: session.sessionId,
      hasReconstructedWork,
      issues: body.issues.length,
      openIssues,
      decisions: body.decisions.length,
      unconfirmedDecisions,
      pendingNextActions,
    };
  });
}
