import { useMemo, useState } from "react";
import { FileText, Pause, Play, Radio, Sparkles, User, Wrench } from "lucide-react";
import { PageShell } from "../../components/layout/PageShell";
import { PageHeader } from "../../components/layout/PageHeader";
import { EmptyState } from "../../components/layout/EmptyState";
import { isClaudeBridgeAvailable, formatClaudeRelativeKo } from "../../lib/claude/claudeTauri";
import type { EventActor, FileTouch } from "../../domain/types";
import { buildLiveFeed, type LiveFeedItem, type LiveFeedRequest } from "./liveFeed";
import { useLiveSessions } from "./useLiveSessions";

/**
 * 라이브 세션: a live dashboard that tails every currently-active Claude Code
 * session at once and streams their work as one feed, ordered by each request's
 * latest activity so the request being worked right now sits on top. Each
 * request is a card: a horizontal strip of work-step icons with the selected
 * step's detail below (following the newest step by default). Reads only
 * already-connected session logs, foreground-only, and never writes memory.
 */
export function LiveSessionView() {
  const available = isClaudeBridgeAvailable();
  const [watching, setWatching] = useState(true);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const snapshot = useLiveSessions(watching && available);
  const feed = useMemo(() => buildLiveFeed(snapshot.sessions), [snapshot.sessions]);

  const headerActions = (
    <div className="lsv-head-actions">
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
    </div>
  );

  if (!available) {
    return (
      <PageShell maxWidth="wide" header={<PageHeader title="라이브 세션" subtitle="지금 진행 중인 작업" />}>
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
      maxWidth="wide"
      header={<PageHeader title="라이브 세션" subtitle="지금 진행 중인 작업" right={headerActions} />}
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
                ? "실행 중인 Claude 세션에서 요청이 오가면, 활동 중인 요청이 맨 위로 올라오고 그 안에서 작업이 실시간으로 이어집니다."
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

function RequestBlock({ request }: { request: LiveFeedRequest }) {
  const items = request.items;
  // null = follow the newest step; a set id pins that step until re-clicked.
  const [pinnedId, setPinnedId] = useState<string | null>(null);

  const latest = items[items.length - 1];
  const selected = (pinnedId ? items.find((item) => item.id === pinnedId) : undefined) ?? latest;

  return (
    <article className="lsv-block">
      <header className="lsv-block-head">
        <span className="lsv-session" title={request.sessionKey}>
          {request.sessionLabel}
        </span>
        <time className="lsv-time" dateTime={request.updatedAt}>
          {formatClaudeRelativeKo(request.updatedAt)}
        </time>
      </header>
      <h3 className="lsv-request" title={request.requestTitle}>
        {request.requestTitle}
      </h3>
      {items.length > 0 ? (
        <>
          <div className="lsv-strip" role="tablist" aria-label="작업 단계">
            {items.map((item, index) => {
              const Icon = actorIcon(item.actor);
              const active = item.id === selected?.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  className={`lsv-chip is-${item.actor} ${active ? "is-active" : ""}`}
                  title={chipTitle(item, index)}
                  onClick={() => setPinnedId((current) => (current === item.id ? null : item.id))}
                >
                  <Icon size={13} aria-hidden="true" />
                  {item.repeatCount > 1 ? <span className="lsv-chip-x">×{item.repeatCount}</span> : null}
                </button>
              );
            })}
          </div>
          {selected ? <ItemDetail key={selected.id} item={selected} /> : null}
        </>
      ) : (
        <p className="lsv-items-pending">작업을 기다리는 중…</p>
      )}
    </article>
  );
}

function ItemDetail({ item }: { item: LiveFeedItem }) {
  return (
    <div className={`lsv-detail is-${item.actor}`}>
      <span className="lsv-detail-actor">
        {actorLabel(item.actor)}
        {item.toolName ? <span className="lsv-detail-tool"> · {item.toolName}</span> : null}
        {item.repeatCount > 1 ? <span className="lsv-detail-repeat">{item.repeatCount}회 반복</span> : null}
      </span>
      <p className="lsv-detail-text">{item.text}</p>
      {item.fileTouches.length > 0 ? (
        <div className="lsv-touches">
          {item.fileTouches.slice(0, 6).map((touch, index) => (
            <TouchChip key={`${touch.path}-${index}`} touch={touch} />
          ))}
          {item.fileTouches.length > 6 ? (
            <span className="lsv-touch-more">+{item.fileTouches.length - 6}</span>
          ) : null}
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
  const label = actorLabel(item.actor);
  const head = item.toolName ? `${label} · ${item.toolName}` : label;
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

function actorIcon(actor: EventActor) {
  switch (actor) {
    case "user":
      return User;
    case "assistant":
      return Sparkles;
    case "tool":
      return Wrench;
    case "file":
      return FileText;
    default:
      return Sparkles;
  }
}

function basename(path: string): string {
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] || path;
}
