import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  BookOpen,
  Bot,
  ChevronDown,
  Globe,
  Info,
  ListChecks,
  Pause,
  PenLine,
  Play,
  Radio,
  Search,
  Sparkles,
  Terminal,
  User,
  Wrench,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { PageShell } from "../../components/layout/PageShell";
import { ActionBar } from "../../components/layout/ActionBar";
import { EmptyState } from "../../components/layout/EmptyState";
import { isClaudeBridgeAvailable, formatClaudeRelativeKo } from "../../lib/claude/claudeTauri";
import type { EventActor, FileTouch } from "../../domain/types";
import {
  buildLiveFeed,
  sessionShortLabel,
  type LiveFeedItem,
  type LiveFeedRequest,
} from "./liveFeed";
import { useLiveSessions } from "./useLiveSessions";

/** A finished request folds into the past-work disclosure once it has been quiet
 *  this long, so the live feed stays about the present. */
const PAST_AFTER_MS = 30 * 60 * 1000;

/**
 * 라이브 세션: a mission-control view that tails every currently-active Claude
 * Code session at once and streams their work as one feed. Requests are ordered
 * by latest activity; a request is "working" only while its session is truly
 * mid-turn (from the last message's stop_reason, not a time guess), so a
 * finished answer stops pulsing at once. Working requests stay open at the top
 * and push older ones to a folded line. Every step keeps its full text.
 * Reads only already-connected session logs, foreground-only, never writes.
 */
export function LiveSessionView() {
  const available = isClaudeBridgeAvailable();
  const [watching, setWatching] = useState(true);
  const [diagOpen, setDiagOpen] = useState(false);
  const [sessionsOpen, setSessionsOpen] = useState(false);
  const snapshot = useLiveSessions(watching && available);
  const feed = useMemo(
    () => buildLiveFeed(snapshot.sessions, { now: Date.now() }),
    // Recompute each poll (lastPolledAt bumps) so live status stays fresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [snapshot.sessions, snapshot.lastPolledAt],
  );

  // A finished request drops out of the live feed once it has been quiet a
  // while, folding into a "past work" disclosure instead of piling up. The feed
  // stays about the present, and nothing is lost (the record lives in the
  // session). This also keeps the rendered feed small however long it sits open.
  const { active, past } = useMemo(() => {
    const cutoff = Date.now() - PAST_AFTER_MS;
    const a: LiveFeedRequest[] = [];
    const p: LiveFeedRequest[] = [];
    for (const request of feed) {
      if (request.status !== "working" && (Date.parse(request.updatedAt) || 0) < cutoff) {
        p.push(request);
      } else {
        a.push(request);
      }
    }
    return { active: a, past: p };
  }, [feed]);

  const workingKeys = useMemo(
    () => new Set(feed.filter((r) => r.status === "working").map((r) => r.sessionKey)),
    [feed],
  );
  const sessionRows = useMemo(
    () =>
      snapshot.sessions
        .map((s) => {
          const last = s.follow.messages[s.follow.messages.length - 1];
          return {
            key: s.meta.filePath,
            label: sessionShortLabel(s.meta),
            steps: s.follow.messages.length,
            lastAt: last?.createdAt || s.meta.startedAt,
            working: workingKeys.has(s.meta.filePath),
          };
        })
        .sort((a, b) => Number(b.working) - Number(a.working) || (Date.parse(b.lastAt) || 0) - (Date.parse(a.lastAt) || 0)),
    [snapshot.sessions, workingKeys],
  );

  const statusEl = (
    <div className="lsv-pop-anchor">
      <button
        type="button"
        className="lsv-status-btn"
        onClick={() => setSessionsOpen((o) => !o)}
        aria-expanded={sessionsOpen}
      >
        <span className={`lsv-dot is-${watching ? snapshot.status : "idle"}`} aria-hidden="true" />
        <span className="lsv-status-text">
          {watching
            ? snapshot.activeCount > 0
              ? `${snapshot.activeCount}개 세션 실시간`
              : "세션을 찾는 중"
            : "일시정지됨"}
          {snapshot.lastPolledAt && watching ? (
            <span className="lsv-poll"> · {formatClaudeRelativeKo(snapshot.lastPolledAt)}</span>
          ) : null}
        </span>
      </button>
      {sessionsOpen ? (
        <Popover align="start" onClose={() => setSessionsOpen(false)}>
          <div className="lsv-pop-title">실시간 세션 {snapshot.activeCount}</div>
          {sessionRows.length === 0 ? (
            <p className="lsv-pop-empty">활성 세션이 없습니다</p>
          ) : (
            <ul className="lsv-sess-list">
              {sessionRows.map((s) => (
                <li key={s.key} className="lsv-sess-row" title={s.key}>
                  <span className={`lsv-dot is-${s.working ? "watching" : "idle"}`} aria-hidden="true" />
                  <span className="lsv-sess-label">{s.label}</span>
                  <span className="lsv-sess-sub">
                    {s.steps.toLocaleString()}단계 · {formatClaudeRelativeKo(s.lastAt)}
                  </span>
                  {s.working ? <span className="lsv-sess-badge">작업 중</span> : null}
                </li>
              ))}
            </ul>
          )}
        </Popover>
      ) : null}
    </div>
  );

  const controls = (
    <>
      <button
        type="button"
        className="lsv-ctl-icon"
        onClick={() => setWatching((on) => !on)}
        aria-label={watching ? "일시정지" : "재개"}
        title={watching ? "일시정지" : "재개"}
      >
        {watching ? <Pause size={15} aria-hidden="true" /> : <Play size={15} aria-hidden="true" />}
      </button>
      <div className="lsv-pop-anchor">
        <button
          type="button"
          className={`lsv-ctl-icon ${diagOpen ? "is-on" : ""}`}
          onClick={() => setDiagOpen((o) => !o)}
          aria-label="진단"
          title="진단"
          aria-expanded={diagOpen}
        >
          <Info size={15} aria-hidden="true" />
        </button>
        {diagOpen ? (
          <Popover align="end" onClose={() => setDiagOpen(false)}>
            <div className="lsv-pop-title">읽어들인 데이터</div>
            <div className="lsv-diag">
              <Diag label="원본 줄" value={snapshot.aggregate.rawLines} />
              <Diag label="이벤트" value={snapshot.aggregate.parsed} tone="good" />
              <Diag label="건너뜀" value={snapshot.aggregate.skipped} />
              <Diag
                label="파싱 실패"
                value={snapshot.aggregate.unparseable}
                tone={snapshot.aggregate.unparseable > 0 ? "warn" : undefined}
              />
              <Diag label="세션" value={snapshot.activeCount} />
            </div>
            {snapshot.nextDelayMs != null ? (
              <p className="lsv-diag-cadence">다음 폴링 {Math.round(snapshot.nextDelayMs / 1000)}초</p>
            ) : null}
          </Popover>
        ) : null}
      </div>
    </>
  );

  if (!available) {
    return (
      <PageShell maxWidth="full" actionBar={<ActionBar label="라이브 세션" start={statusEl} />}>
        <EmptyState
          icon={Radio}
          title="라이브 세션은 데스크톱 앱에서만 동작합니다"
          description="실행 중인 세션 파일을 실시간으로 읽어야 하므로 데스크톱 앱이 필요합니다. 브라우저에서는 세션 저장소에 접근할 수 없습니다."
        />
      </PageShell>
    );
  }

  return (
    <PageShell
      maxWidth="full"
      actionBar={<ActionBar label="라이브 세션 컨트롤" start={statusEl} end={controls} />}
    >
      <div className="lsv">
        {snapshot.lastError ? (
          <div className="lsv-error" role="alert">
            {snapshot.lastError}
          </div>
        ) : null}

        {feed.length === 0 ? (
          <EmptyState
            compact
            icon={Radio}
            title={watching ? "실시간 요청을 기다리는 중" : "일시정지됨"}
            description={
              watching
                ? "실행 중인 세션의 요청과 작업이 실시간으로 여기에 모입니다."
                : "재개를 누르면 다시 실행 중인 세션을 따라갑니다."
            }
          />
        ) : (
          <div className="lsv-feed">
            {active.map((request) => (
              <RequestBlock key={request.id} request={request} />
            ))}
            {past.length > 0 ? <PastSection requests={past} /> : null}
          </div>
        )}
      </div>
    </PageShell>
  );
}

/** A small click-dismissed floating panel: a backdrop closes it, so it overlays
 *  the page instead of taking a layout region. */
function Popover({
  align,
  onClose,
  children,
}: {
  align: "start" | "end";
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <>
      <div className="lsv-pop-backdrop" onClick={onClose} aria-hidden="true" />
      <div className={`lsv-pop is-${align}`} role="dialog">
        {children}
      </div>
    </>
  );
}

const RequestBlock = memo(
  RequestBlockImpl,
  (prev, next) =>
    prev.request.id === next.request.id &&
    prev.request.status === next.request.status &&
    prev.request.updatedAt === next.request.updatedAt &&
    prev.request.items.length === next.request.items.length,
);

function RequestBlockImpl({ request }: { request: LiveFeedRequest }) {
  const items = request.items;
  const [pinnedId, setPinnedId] = useState<string | null>(null);
  // Every card can be folded / unfolded. Default: working stays open, everything
  // else folds, so a new request pushes the previous one shut on its own. A
  // manual toggle overrides that default.
  const [override, setOverride] = useState<boolean | null>(null);
  const expanded = override ?? request.status === "working";

  // A one-shot light sweep the moment a request stops working, so a finish reads
  // as a small event rather than a card blinking shut.
  const [finished, setFinished] = useState(false);
  const prevStatus = useRef(request.status);
  useEffect(() => {
    const was = prevStatus.current;
    prevStatus.current = request.status;
    if (was === "working" && request.status !== "working") {
      setFinished(true);
      const timer = setTimeout(() => setFinished(false), 1000);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [request.status]);

  const latest = items[items.length - 1];
  const selected = (pinnedId ? items.find((item) => item.id === pinnedId) : undefined) ?? latest;
  const showCursor = request.status === "working" && selected?.id === latest?.id;

  return (
    <article className={`lsv-block is-${request.status} ${expanded ? "is-open" : "is-collapsed"}`}>
      {finished ? <span className="lsv-sweep" aria-hidden="true" /> : null}
      <header className="lsv-block-head">
        <span className="lsv-session" title={request.sessionKey}>
          {request.sessionLabel}
        </span>
        {request.status === "working" ? (
          <span className="lsv-working">
            작업 중
            <span className="lsv-typing" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
          </span>
        ) : null}
        <span className="lsv-block-meta">
          {items.length}단계 · {formatClaudeRelativeKo(request.updatedAt)}
        </span>
        <button
          type="button"
          className={`lsv-fold ${expanded ? "is-open" : ""}`}
          onClick={() => setOverride(!expanded)}
          aria-label={expanded ? "접기" : "펼치기"}
          aria-expanded={expanded}
        >
          <ChevronDown size={15} aria-hidden="true" />
        </button>
      </header>

      <p
        className={`lsv-request base-scroll ${expanded ? "is-full" : "is-clamped"}`}
        title={request.requestTitle}
      >
        {request.requestTitle}
      </p>

      <div className="lsv-body">
        <div className="lsv-body-inner">
          {items.length > 0 ? (
            <>
              <div className="lsv-strip" role="tablist" aria-label="작업 단계">
                {items.map((item, index) => {
                  const Icon = iconForItem(item);
                  const active = item.id === selected?.id;
                  const isLatest = index === items.length - 1;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      className={`lsv-chip is-${item.actor} ${active ? "is-active" : ""} ${isLatest ? "is-latest is-fresh" : ""}`}
                      title={chipTitle(item, index)}
                      onClick={() => setPinnedId((current) => (current === item.id ? null : item.id))}
                    >
                      <Icon size={13} aria-hidden="true" />
                      {item.repeatCount > 1 ? <span className="lsv-chip-x">×{item.repeatCount}</span> : null}
                    </button>
                  );
                })}
              </div>
              {selected ? <ItemDetail key={selected.id} item={selected} cursor={showCursor} /> : null}
            </>
          ) : (
            <p className="lsv-items-pending">
              작업을 기다리는 중
              <span className="lsv-typing" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
            </p>
          )}
        </div>
      </div>
    </article>
  );
}

/** Finished requests, folded into one disclosure. Each is a lightweight one-line
 *  row (no step strip / detail), so a long history stays cheap to render. */
function PastSection({ requests }: { requests: LiveFeedRequest[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="lsv-past">
      <button
        type="button"
        className={`lsv-past-toggle ${open ? "is-open" : ""}`}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <ChevronDown size={14} aria-hidden="true" />
        지난 작업 {requests.length}개
      </button>
      {open ? (
        <div className="lsv-past-list">
          {requests.map((request) => (
            <div key={request.id} className="lsv-past-row" title={request.requestTitle}>
              <span className="lsv-session" title={request.sessionKey}>
                {request.sessionLabel}
              </span>
              <span className="lsv-past-title">{request.requestTitle}</span>
              <span className="lsv-past-meta">
                {request.items.length}단계 · {formatClaudeRelativeKo(request.updatedAt)}
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ItemDetail({ item, cursor }: { item: LiveFeedItem; cursor: boolean }) {
  return (
    <div className={`lsv-detail is-${item.actor}`}>
      <span className="lsv-detail-actor">
        {actorLabel(item.actor)}
        {item.toolName ? <span className="lsv-detail-tool"> · {item.toolName}</span> : null}
        {item.repeatCount > 1 ? <span className="lsv-detail-repeat">{item.repeatCount}회 반복</span> : null}
      </span>
      <p className="lsv-detail-text base-scroll">
        {item.text}
        {cursor ? <span className="lsv-cursor" aria-hidden="true" /> : null}
      </p>
      {item.fileTouches.length > 0 ? (
        <div className="lsv-touches">
          {item.fileTouches.map((touch, index) => (
            <TouchChip key={`${touch.path}-${index}`} touch={touch} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function TouchChip({ touch }: { touch: FileTouch }) {
  const additions = touch.additions ?? 0;
  const deletions = touch.deletions ?? 0;
  return (
    <span className="lsv-touch" title={touch.path}>
      {basename(touch.path)}
      {additions > 0 ? <span className="lsv-add">+{additions}</span> : null}
      {deletions > 0 ? <span className="lsv-del">-{deletions}</span> : null}
    </span>
  );
}

function Diag({ label, value, tone }: { label: string; value: number; tone?: "good" | "warn" }) {
  return (
    <span className={`lsv-diag-stat ${tone ? `is-${tone}` : ""}`}>
      <span className="lsv-diag-value">{value.toLocaleString()}</span>
      <span className="lsv-diag-label">{label}</span>
    </span>
  );
}

function chipTitle(item: LiveFeedItem, index: number): string {
  const head = item.toolName ? `${actorLabel(item.actor)} · ${item.toolName}` : actorLabel(item.actor);
  return `${index + 1}. ${head}`;
}

function actorLabel(actor: EventActor): string {
  switch (actor) {
    case "user":
      return "요청";
    case "assistant":
      return "응답";
    case "tool":
      return "도구";
    case "file":
      return "파일";
    default:
      return "시스템";
  }
}

/** Distinct icons per tool so a wall of steps reads as a story, not identical wrenches. */
const TOOL_ICONS: Record<string, LucideIcon> = {
  read: BookOpen,
  edit: PenLine,
  write: PenLine,
  multiedit: PenLine,
  notebookedit: PenLine,
  bash: Terminal,
  powershell: Terminal,
  grep: Search,
  glob: Search,
  task: Bot,
  agent: Bot,
  webfetch: Globe,
  websearch: Globe,
  todowrite: ListChecks,
};

function iconForItem(item: LiveFeedItem): LucideIcon {
  if (item.actor === "assistant") return Sparkles;
  if (item.actor === "user") return User;
  if (item.actor === "tool") {
    const key = (item.toolName ?? "").toLowerCase().replace(/[^a-z]/g, "");
    return TOOL_ICONS[key] ?? Wrench;
  }
  return Sparkles;
}

function basename(path: string): string {
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] || path;
}
