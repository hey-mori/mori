import { memo, useMemo, useState } from "react";
import {
  BookOpen,
  Bot,
  ChevronDown,
  FileText,
  Globe,
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
import { buildLiveFeed, type LiveFeedItem, type LiveFeedRequest } from "./liveFeed";
import { useLiveSessions } from "./useLiveSessions";

/**
 * 라이브 세션: a mission-control view that tails every currently-active Claude
 * Code session at once and streams their work as one feed. Requests are ordered
 * by latest activity, the working ones pulse at the top with a live cursor, and
 * finished ones fold to a quiet line so the present stays in focus. Each step
 * keeps its full text (no truncation). Reads only already-connected session
 * logs, foreground-only, and never writes memory.
 */
export function LiveSessionView() {
  const available = isClaudeBridgeAvailable();
  const [watching, setWatching] = useState(true);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const snapshot = useLiveSessions(watching && available);
  const feed = useMemo(
    () => buildLiveFeed(snapshot.sessions, { now: Date.now() }),
    // Recompute each poll (lastPolledAt bumps) so live status stays fresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [snapshot.sessions, snapshot.lastPolledAt],
  );

  const statusEl = (
    <span className="lsv-status">
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
    </span>
  );

  const controls = (
    <>
      <button
        type="button"
        className="lsv-ctl"
        onClick={() => setWatching((on) => !on)}
        aria-label={watching ? "일시정지" : "재개"}
      >
        {watching ? <Pause size={14} aria-hidden="true" /> : <Play size={14} aria-hidden="true" />}
        {watching ? "일시정지" : "재개"}
      </button>
      <button
        type="button"
        className={`lsv-ctl is-ghost ${showDiagnostics ? "is-on" : ""}`}
        onClick={() => setShowDiagnostics((on) => !on)}
      >
        진단
      </button>
    </>
  );

  if (!available) {
    return (
      <PageShell maxWidth="full" actionBar={<ActionBar label="라이브 세션" start={statusEl} />}>
        <EmptyState
          icon={Radio}
          title="라이브 세션은 데스크톱 앱에서만 동작합니다"
          description="실행 중인 Claude Code 세션 파일을 실시간으로 읽어야 하므로 Tauri 데스크톱 앱이 필요합니다. 브라우저 프로토타입에서는 세션 저장소에 접근할 수 없습니다."
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
        {showDiagnostics ? (
          <div className="lsv-diag" aria-label="파싱 충실도">
            <Diag label="원본 줄" value={snapshot.aggregate.rawLines} />
            <Diag label="이벤트" value={snapshot.aggregate.parsed} tone="good" />
            <Diag label="건너뜀" value={snapshot.aggregate.skipped} />
            <Diag
              label="파싱 실패"
              value={snapshot.aggregate.unparseable}
              tone={snapshot.aggregate.unparseable > 0 ? "warn" : undefined}
            />
            <Diag label="세션" value={snapshot.activeCount} />
            {snapshot.nextDelayMs != null ? (
              <span className="lsv-diag-cadence">다음 폴링 {Math.round(snapshot.nextDelayMs / 1000)}초</span>
            ) : null}
          </div>
        ) : null}

        {snapshot.lastError ? (
          <div className="lsv-error" role="alert">
            {snapshot.lastError}
          </div>
        ) : null}

        {feed.length === 0 ? (
          <EmptyState
            compact
            icon={Radio}
            title={watching ? "실시간 작업을 기다리는 중" : "일시정지됨"}
            description={
              watching
                ? "실행 중인 Claude 세션에서 요청이 오가면, 작업 중인 요청이 맨 위에서 살아 움직이고 그 안에서 단계가 실시간으로 이어집니다."
                : "재개를 누르면 다시 모든 활성 세션을 따라갑니다."
            }
          />
        ) : (
          <div className="lsv-feed">
            {feed.map((request) => (
              <RequestBlock key={request.id} request={request} />
            ))}
          </div>
        )}
      </div>
    </PageShell>
  );
}

const RequestBlock = memo(
  RequestBlockImpl,
  // Only re-render a card when something a viewer would see changed. Most cards
  // (finished, collapsed) are stable across polls, so the feed stays cheap even
  // with dozens of sessions worth of history on screen.
  (prev, next) =>
    prev.request.id === next.request.id &&
    prev.request.status === next.request.status &&
    prev.request.updatedAt === next.request.updatedAt &&
    prev.request.items.length === next.request.items.length,
);

function RequestBlockImpl({ request }: { request: LiveFeedRequest }) {
  const items = request.items;
  const [pinnedId, setPinnedId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const collapsed = request.status === "done" && !expanded;
  // Stagger the strip's cascade so the whole row floats in step-by-step and the
  // newest step lands last; bounded so a long strip still resolves quickly.
  const stagger = Math.max(6, Math.min(26, Math.round(360 / Math.max(items.length, 1))));

  if (collapsed) {
    return (
      <button
        type="button"
        className="lsv-block is-done is-collapsed"
        onClick={() => setExpanded(true)}
      >
        <span className="lsv-session" title={request.sessionKey}>
          {request.sessionLabel}
        </span>
        <span className="lsv-collapsed-title">{request.requestTitle}</span>
        <span className="lsv-collapsed-meta">
          {items.length}단계 · {formatClaudeRelativeKo(request.updatedAt)}
        </span>
        <ChevronDown size={15} className="lsv-collapsed-chevron" aria-hidden="true" />
      </button>
    );
  }

  const latest = items[items.length - 1];
  const selected = (pinnedId ? items.find((item) => item.id === pinnedId) : undefined) ?? latest;
  const showCursor = request.status === "working" && selected?.id === latest?.id;

  return (
    <article className={`lsv-block is-${request.status}`}>
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
        <time className="lsv-time" dateTime={request.updatedAt}>
          {formatClaudeRelativeKo(request.updatedAt)}
        </time>
        {request.status === "done" ? (
          <button
            type="button"
            className="lsv-fold"
            onClick={() => setExpanded(false)}
            aria-label="접기"
          >
            <ChevronDown size={15} aria-hidden="true" />
          </button>
        ) : null}
      </header>

      <p className="lsv-request">{request.requestTitle}</p>

      {items.length > 0 ? (
        <>
          <div className="lsv-strip" key={items.length} role="tablist" aria-label="작업 단계">
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
                  style={{ animationDelay: `${index * stagger}ms` }}
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
    </article>
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
      <p className="lsv-detail-text">
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
