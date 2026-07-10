import { useEffect, useMemo, useState } from "react";
import { Radio, RefreshCw } from "lucide-react";
import { PageShell } from "../../components/layout/PageShell";
import { EmptyState } from "../../components/layout/EmptyState";
import {
  discoverClaudeCodeSessions,
  isClaudeBridgeAvailable,
} from "../../lib/claude/claudeTauri";
import type { ClaudeCodeSessionMeta } from "../../lib/claude/types";
import { buildImportCandidateFromClaudeCodeSession } from "../../lib/claude/claudeImport";
import { buildFollowSubject } from "../../lib/live-follow";
import type { EventActor, TimelineEvent } from "../../domain/types";
import { formatClaudeRelativeKo } from "../../lib/claude/claudeTauri";
import { buildLabColumns } from "./labColumns";
import { useAgentStoreFollow } from "./useAgentStoreFollow";

const LAB_PROJECT_ID = "live-follow-lab";

/**
 * Live Follow Lab (dev-only, palette-only).
 *
 * A verification harness for the delta-read live-follow pipeline: pick a Claude
 * Code session, follow it in real time, and watch the work land under each
 * request as horizontal columns while a fidelity panel shows exactly how many
 * raw JSONL lines parsed vs were dropped. This screen is intentionally
 * developer-facing (byte offsets, parse counters); once the pipeline is trusted
 * the same plumbing graduates into the session 활동 tab and the lab retires.
 */
export function LiveFollowLabView() {
  const available = isClaudeBridgeAvailable();
  const [sessions, setSessions] = useState<ClaudeCodeSessionMeta[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [following, setFollowing] = useState(false);

  async function loadSessions() {
    if (!available) return;
    setLoading(true);
    setLoadError(null);
    try {
      const found = await discoverClaudeCodeSessions();
      setSessions(found);
      // Auto-select the most recently modified session (the list is sorted
      // newest-first) so "follow the session I'm working in now" is one click.
      setSelectedPath((current) => current ?? found[0]?.filePath ?? null);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "세션 목록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadSessions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedMeta = useMemo(
    () => sessions.find((session) => session.filePath === selectedPath) ?? null,
    [sessions, selectedPath],
  );

  const snapshot = useAgentStoreFollow({
    sessionPath: following ? selectedPath : null,
    enabled: following,
  });

  // Project the accumulated tail through the SAME import path a one-shot import
  // uses, then segment into request columns, so what the lab shows matches what
  // the session would show once imported.
  const columns = useMemo(() => {
    if (!selectedMeta || snapshot.follow.messages.length === 0) return [];
    const subject = buildFollowSubject(snapshot.follow, {
      sessionId: selectedMeta.sessionId,
      title: selectedMeta.title,
      startedAt: selectedMeta.startedAt,
      projectName: selectedMeta.projectName,
      filePath: selectedMeta.filePath,
      projectPath: selectedMeta.projectPath,
      tokenUsage: selectedMeta.tokenUsage,
    });
    const { events } = buildImportCandidateFromClaudeCodeSession(subject, {
      projectId: LAB_PROJECT_ID,
      sessionId: selectedMeta.sessionId,
      capturedAt: selectedMeta.startedAt,
    });
    return buildLabColumns(events);
  }, [selectedMeta, snapshot.follow]);

  if (!available) {
    return (
      <PageShell>
        <EmptyState
          icon={Radio}
          title="Live Follow Lab은 데스크톱 앱에서만 동작합니다"
          description="실행 중인 Claude Code 세션 파일을 실시간으로 읽어야 하므로 Tauri 데스크톱 앱이 필요합니다. 브라우저 프로토타입에서는 세션 저장소에 접근할 수 없습니다."
        />
      </PageShell>
    );
  }

  const stats = snapshot.follow.stats;

  return (
    <PageShell>
      <div className="lfl">
        <header className="lfl-head">
          <div className="lfl-head-title">
            <Radio size={16} className="lfl-live-glyph" aria-hidden="true" />
            <span>Live Follow Lab</span>
            <span className="lfl-head-note">델타 읽기 검증 화면</span>
          </div>
          <div className="lfl-controls">
            <select
              className="lfl-picker"
              value={selectedPath ?? ""}
              onChange={(event) => {
                setSelectedPath(event.target.value || null);
                setFollowing(false);
              }}
              aria-label="따라갈 세션"
            >
              {sessions.length === 0 ? <option value="">세션 없음</option> : null}
              {sessions.map((session) => (
                <option key={session.filePath} value={session.filePath}>
                  {session.title} · {formatClaudeRelativeKo(session.startedAt)}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="lfl-refresh"
              onClick={() => void loadSessions()}
              disabled={loading}
              aria-label="세션 목록 새로고침"
            >
              <RefreshCw size={14} className={loading ? "is-spinning" : ""} aria-hidden="true" />
            </button>
            <button
              type="button"
              className={`lfl-follow-btn ${following ? "is-on" : ""}`}
              onClick={() => setFollowing((on) => !on)}
              disabled={!selectedPath}
            >
              {following ? "따라가기 중지" : "실시간 따라가기"}
            </button>
          </div>
        </header>

        {loadError ? (
          <div className="lfl-error" role="alert">
            {loadError}
          </div>
        ) : null}

        <section className="lfl-fidelity" aria-label="파싱 충실도">
          <FidelityStat label="원본 줄" value={stats.rawLines} />
          <FidelityStat label="이벤트" value={stats.parsed} tone="good" />
          <FidelityStat label="건너뜀" value={stats.skipped} />
          <FidelityStat label="파싱 실패" value={stats.unparseable} tone={stats.unparseable > 0 ? "warn" : undefined} />
          <FidelityStat label="오프셋" value={snapshot.follow.offset} suffix="B" />
          <div className="lfl-fidelity-meta">
            <StatusDot status={snapshot.status} />
            <span>
              {snapshot.lastPolledAt
                ? `마지막 폴링 ${formatClaudeRelativeKo(snapshot.lastPolledAt)}`
                : following
                  ? "폴링 시작 중…"
                  : "대기 중"}
            </span>
            {snapshot.nextDelayMs != null && snapshot.status === "following" ? (
              <span className="lfl-cadence">다음 {Math.round(snapshot.nextDelayMs / 1000)}초</span>
            ) : null}
          </div>
        </section>

        {snapshot.lastError ? (
          <div className="lfl-error" role="alert">
            {snapshot.lastError}
          </div>
        ) : null}

        {columns.length === 0 ? (
          <EmptyState
            compact
            icon={Radio}
            title={following ? "이벤트를 기다리는 중" : "따라가기를 시작하세요"}
            description={
              following
                ? "선택한 세션에서 새 작업이 도착하면 요청별로 여기에 쌓입니다."
                : "세션을 고르고 실시간 따라가기를 켜면, 각 요청 아래로 Claude가 한 작업이 순서대로 쌓입니다."
            }
          />
        ) : (
          <div className="lfl-columns base-scroll">
            {columns.map((column) => (
              <div key={column.id} className={`lfl-column ${column.kind === "orphan" ? "is-orphan" : ""}`}>
                <div className="lfl-column-head" title={column.title}>
                  <span className="lfl-column-index">
                    {column.kind === "orphan" ? "·" : column.index + 1}
                  </span>
                  <span className="lfl-column-title">{column.title}</span>
                  <span className="lfl-column-count">{column.events.length}</span>
                </div>
                <div className="lfl-column-body">
                  {column.events.map((event) => (
                    <WorkRow key={event.id} event={event} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </PageShell>
  );
}

function FidelityStat({
  label,
  value,
  suffix,
  tone,
}: {
  label: string;
  value: number;
  suffix?: string;
  tone?: "good" | "warn";
}) {
  return (
    <div className={`lfl-stat ${tone ? `is-${tone}` : ""}`}>
      <span className="lfl-stat-value">
        {value.toLocaleString()}
        {suffix ? <span className="lfl-stat-suffix">{suffix}</span> : null}
      </span>
      <span className="lfl-stat-label">{label}</span>
    </div>
  );
}

function StatusDot({ status }: { status: string }) {
  return <span className={`lfl-status-dot is-${status}`} aria-hidden="true" />;
}

function WorkRow({ event }: { event: TimelineEvent }) {
  const actor = event.actor ?? "system";
  const touches = event.fileTouches ?? [];
  return (
    <div className={`lfl-row is-${actor}`}>
      <span className="lfl-row-actor">{actorLabel(actor, event.toolName)}</span>
      <span className="lfl-row-title">{event.title}</span>
      {touches.length > 0 ? (
        <span className="lfl-row-touches">
          {touches.slice(0, 3).map((touch, index) => {
            const additions = touch.additions ?? 0;
            const deletions = touch.deletions ?? 0;
            return (
              <span key={`${touch.path}-${index}`} className="lfl-touch">
                {basename(touch.path)}
                {additions > 0 ? <span className="lfl-add">+{additions}</span> : null}
                {deletions > 0 ? <span className="lfl-del">-{deletions}</span> : null}
              </span>
            );
          })}
          {touches.length > 3 ? <span className="lfl-touch-more">+{touches.length - 3}</span> : null}
        </span>
      ) : null}
    </div>
  );
}

function actorLabel(actor: EventActor, toolName?: string): string {
  switch (actor) {
    case "user":
      return "요청";
    case "assistant":
      return "응답";
    case "tool":
      return toolName ? `도구 · ${toolName}` : "도구";
    case "file":
      return "파일";
    case "decision":
      return "결정";
    default:
      return "시스템";
  }
}

function basename(path: string): string {
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] || path;
}
