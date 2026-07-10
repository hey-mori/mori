import { useMemo, useState } from "react";
import { FileText, Pause, Play, Radio, Sparkles, User, Wrench } from "lucide-react";
import { PageShell } from "../../components/layout/PageShell";
import { EmptyState } from "../../components/layout/EmptyState";
import { isClaudeBridgeAvailable, formatClaudeRelativeKo } from "../../lib/claude/claudeTauri";
import type { EventActor, FileTouch } from "../../domain/types";
import { buildLiveFeed, type LiveFeedItem, type LiveFeedRequest } from "./liveFeed";
import { useLiveSessions } from "./useLiveSessions";

/**
 * 라이브 세션: a live dashboard that tails every currently-active Claude Code
 * session at once and streams their work as one feed, newest request on top.
 * Each request is a block that grows as Claude works; a new request pops in at
 * the top and pushes older ones down. Reads only already-connected session logs,
 * foreground-only, and never writes memory.
 */
export function LiveSessionView() {
  const available = isClaudeBridgeAvailable();
  const [watching, setWatching] = useState(true);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const snapshot = useLiveSessions(watching && available);
  const feed = useMemo(() => buildLiveFeed(snapshot.sessions), [snapshot.sessions]);

  if (!available) {
    return (
      <PageShell>
        <EmptyState
          icon={Radio}
          title="라이브 세션은 데스크톱 앱에서만 동작합니다"
          description="실행 중인 Claude Code 세션 파일을 실시간으로 읽어야 하므로 Tauri 데스크톱 앱이 필요합니다. 브라우저 프로토타입에서는 세션 저장소에 접근할 수 없습니다."
        />
      </PageShell>
    );
  }

  return (
    <PageShell>
      <div className="lsv">
        <header className="lsv-head">
          <div className="lsv-title">
            <Radio size={17} className="lsv-live-glyph" aria-hidden="true" />
            <span>라이브 세션</span>
            <span className="lsv-sub">지금 진행 중인 작업</span>
          </div>
          <div className="lsv-status">
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
        </header>

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
                ? "실행 중인 Claude 세션에서 요청이 오가면, 새 요청이 맨 위에 나타나고 그 아래로 작업이 실시간으로 쌓입니다."
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
  return (
    <article className="lsv-block">
      <header className="lsv-block-head">
        <span className="lsv-session" title={request.sessionKey}>
          {request.sessionLabel}
        </span>
        <time className="lsv-time" dateTime={request.startedAt}>
          {formatClaudeRelativeKo(request.startedAt)}
        </time>
      </header>
      <h3 className="lsv-request" title={request.requestTitle}>
        {request.requestTitle}
      </h3>
      {request.items.length > 0 ? (
        <ol className="lsv-items">
          {request.items.map((item) => (
            <WorkItem key={item.id} item={item} />
          ))}
        </ol>
      ) : (
        <p className="lsv-items-pending">작업을 기다리는 중…</p>
      )}
    </article>
  );
}

function WorkItem({ item }: { item: LiveFeedItem }) {
  const Icon = actorIcon(item.actor);
  return (
    <li className={`lsv-item is-${item.actor}`}>
      <span className="lsv-item-glyph" aria-hidden="true">
        <Icon size={13} />
      </span>
      <div className="lsv-item-body">
        <p className="lsv-item-text">
          {item.toolName ? <span className="lsv-item-tool">{item.toolName}</span> : null}
          {item.text}
          {item.repeatCount > 1 ? <span className="lsv-item-repeat">×{item.repeatCount}</span> : null}
        </p>
        {item.fileTouches.length > 0 ? (
          <span className="lsv-touches">
            {item.fileTouches.slice(0, 4).map((touch, index) => (
              <TouchChip key={`${touch.path}-${index}`} touch={touch} />
            ))}
            {item.fileTouches.length > 4 ? (
              <span className="lsv-touch-more">+{item.fileTouches.length - 4}</span>
            ) : null}
          </span>
        ) : null}
      </div>
    </li>
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
