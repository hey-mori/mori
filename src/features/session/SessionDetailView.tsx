import { useEffect, useMemo } from "react";
import {
  Activity,
  FileText,
  GanttChartSquare,
  GitBranch,
  Lightbulb,
  ListChecks,
  ScrollText,
  Sparkles,
} from "lucide-react";
import { PageShell } from "../../components/layout/PageShell";
import { MoriStatusBadge } from "../../components/ui/MoriStatusBadge";
import { useMoriAppStore, type SessionTab } from "../../app/store";
import {
  selectHasRealAnalysis,
  selectSessionMode,
  selectSessionSource,
  selectSessionView,
  useMoriSessionStore,
} from "../../app/sessionStore";
import { moriMockSession } from "../../domain/mock-data";
import { buildWorkContext } from "../../lib/session/workContext";
import { isNextActionCompleted } from "../../lib/session/nextActionCompletion";
import type { MoriStatusBadgeTone } from "../../components/ui/MoriStatusBadge";
import type { WorkContext } from "../../lib/session/workContext";
import { TimelineView } from "../timeline/TimelineView";
import { EvidenceView } from "../evidence/EvidenceView";
import { ReviewView } from "../review/ReviewView";
import { ReportsView } from "../reports/ReportsView";

/**
 * Session Detail — the unified, tabbed workspace for one session (P3).
 *
 * The big de-fragmentation: opening a session no longer scatters the user
 * across separate 타임라인 / 증거 / 검토 / Flow pages. Instead this single
 * surface owns one calm header (session context + key metrics) and a tab bar:
 *
 *   - **흐름**   — what happened (Timeline + conversation thread + Flow Focus)
 *   - **증거**   — the session's imported sources / evidence
 *   - **인사이트** — value-framed issues / decisions / next actions to confirm
 *
 * It owns the **single `PageShell`** and header; each tab's view renders only
 * its content so there is never a double shell or duplicate
 * header. Tab state lives in the app store (`sessionTab`) so other surfaces
 * (Home next-actions, the Companion inbox, the event inspector) can deep-link
 * a session straight to the right tab and the user returns to the same tab.
 */
export function SessionDetailView() {
  const hydrate = useMoriSessionStore((state) => state.hydrate);
  const initialized = useMoriSessionStore((state) => state.initialized);

  useEffect(() => {
    if (!initialized) hydrate();
  }, [initialized, hydrate]);

  const sessionTab = useMoriAppStore((state) => state.sessionTab);
  const setSessionTab = useMoriAppStore((state) => state.setSessionTab);

  return (
    <PageShell className="session-detail-page" header={<SessionDetailHeader />}>
      <div className="session-detail-tabs-band">
        <SessionTabBar activeTab={sessionTab} onChange={setSessionTab} />
      </div>
      <SessionTabContent tab={sessionTab} />
    </PageShell>
  );
}

// ─── Header (session context + metrics) ───────────────────────────────────────

/**
 * Calm, dense session header — title + context chips (project / origin / span)
 * + key metric chips. Deliberately NOT a big title band (P1 principle): it
 * reads as a desktop-app context strip, using `buildWorkContext` and the live
 * session view so the framing stays honest (origin, span — never a stopwatch).
 */
function SessionDetailHeader() {
  const view = useMoriSessionStore(selectSessionView);
  const draft = useMoriSessionStore((state) => state.draft);
  const mode = useMoriSessionStore(selectSessionMode);
  const source = useMoriSessionStore(selectSessionSource);
  const analysisStatus = useMoriSessionStore((state) => state.analysisStatus);
  const imports = useMoriSessionStore((state) => state.imports);

  const context = useMemo(
    () =>
      buildWorkContext({
        draft,
        demoSession: moriMockSession.session,
        analysisStatus,
      }),
    [draft, analysisStatus],
  );

  const openIssues = view.issues.filter((issue) => issue.status !== "resolved").length;
  const pendingNextActions = view.nextActions.filter((a) => !isNextActionCompleted(a)).length;

  const sourceLabel =
    mode === "demo"
      ? "데모 데이터"
      : source === "desktop-sqlite"
        ? "Desktop SQLite"
        : "브라우저 저장";

  // The "작업 세션" catch-all origin label adds no information on the session
  // screen — the user already knows they are inside a session. Suppress it
  // for manual / catch-all origins so the header only shows meaningful chips
  // (a Claude import, a live capture, an in-progress analysis, etc).
  const showOriginChip = context.origin !== "manual" || context.originLabel !== "작업 세션";

  return (
    <div className="session-detail-header">
      <div className="session-detail-headline">
        <h1 title={context.sessionTitle}>{context.sessionTitle}</h1>
        <div className="session-detail-chips">
          {context.projectLabel ? (
            <span className="session-detail-chip session-detail-project" title={context.projectLabel}>
              {context.projectLabel}
            </span>
          ) : null}
          {showOriginChip ? (
            <MoriStatusBadge tone={originBadgeTone(context.tone)}>
              {context.originLabel}
            </MoriStatusBadge>
          ) : null}
          {context.timeDescriptor ? (
            <span className="session-detail-chip">
              {context.timeDescriptor}
              {context.timeCaption ? ` ${context.timeCaption}` : ""}
            </span>
          ) : null}
          <span className="session-detail-chip session-detail-storage">{sourceLabel}</span>
        </div>
      </div>
      {view.events.length > 0 || imports.length > 0 ? (
        <dl className="session-detail-metrics" aria-label="세션 지표">
          <SessionMetric icon={Activity} label="이벤트" value={view.events.length} />
          <SessionMetric
            icon={FileText}
            label="소스"
            value={mode === "demo" ? view.sources.length : imports.length}
          />
          <SessionMetric icon={Lightbulb} label="결정" value={view.decisions.length} />
          <SessionMetric
            icon={ListChecks}
            label="다음 작업"
            value={pendingNextActions}
            hint={pendingNextActions > 0 ? "남은" : undefined}
          />
          {openIssues > 0 ? (
            <SessionMetric icon={GitBranch} label="열린 이슈" value={openIssues} tone="warn" />
          ) : null}
        </dl>
      ) : null}
    </div>
  );
}

/** Map the work-context origin tone onto the shared product-state badge tones. */
function originBadgeTone(tone: WorkContext["tone"]): MoriStatusBadgeTone {
  switch (tone) {
    case "purple":
      return "accent";
    case "green":
      return "success";
    case "orange":
      return "warning";
    case "gray":
    default:
      return "neutral";
  }
}

function SessionMetric({
  icon: Icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: typeof Activity;
  label: string;
  value: number;
  hint?: string;
  tone?: "warn";
}) {
  return (
    <div className={`session-detail-metric${tone === "warn" ? " is-warn" : ""}`}>
      <span className="session-detail-metric-icon" aria-hidden="true">
        <Icon size={14} />
      </span>
      <dt>{hint ? `${hint} ${label}` : label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

// ─── Tab bar ──────────────────────────────────────────────────────────────────

const SESSION_TABS: Array<{ id: SessionTab; label: string; icon: typeof GanttChartSquare }> = [
  { id: "flow", label: "흐름", icon: GanttChartSquare },
  { id: "evidence", label: "증거", icon: FileText },
  { id: "insights", label: "인사이트", icon: Sparkles },
  { id: "report", label: "리포트", icon: ScrollText },
];

function SessionTabBar({
  activeTab,
  onChange,
}: {
  activeTab: SessionTab;
  onChange: (tab: SessionTab) => void;
}) {
  return (
    <nav
      className="session-tabs"
      role="tablist"
      aria-label="세션 상세 탭"
      onKeyDown={(event) => {
        const ids = SESSION_TABS.map((t) => t.id);
        const current = ids.indexOf(activeTab);
        let next = -1;
        if (event.key === "ArrowRight") next = (current + 1) % ids.length;
        else if (event.key === "ArrowLeft") next = (current - 1 + ids.length) % ids.length;
        else if (event.key === "Home") next = 0;
        else if (event.key === "End") next = ids.length - 1;
        if (next !== -1) {
          event.preventDefault();
          const nextId = ids[next]!;
          onChange(nextId);
          event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
        }
      }}
    >
      {SESSION_TABS.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            tabIndex={isActive ? 0 : -1}
            aria-selected={isActive}
            className={`session-tab${isActive ? " is-active" : ""}`}
            onClick={() => onChange(tab.id)}
          >
            <Icon size={15} aria-hidden="true" />
            <span>{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

// ─── Tab content ────────────────────────────────────────────────────────────

/**
 * Renders the active tab's view (content only — the Session Detail owns the
 * shell + header). The inactive tabs are unmounted, so heavy canvases are not
 * kept alive off-screen. Cross-tab persistent state (selected event, search,
 * active insights tab) already lives in the app store, so switching tabs and
 * returning preserves what the user cares about.
 */
function SessionTabContent({ tab }: { tab: SessionTab }) {
  if (tab === "evidence") {
    return <EvidenceView />;
  }
  if (tab === "insights") {
    return <ReviewView />;
  }
  if (tab === "report") {
    return <ReportsView embedded />;
  }
  return <TimelineView mode="timeline" />;
}
