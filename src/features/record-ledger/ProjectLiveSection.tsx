/**
 * 프로젝트 · the current-state section, above everything else on the page.
 *
 * The v8 spec ordered this page "by what a returning user asks", and started at
 * 하위 프로젝트. The question actually asked first is what is happening now and
 * what changed since they last looked, so this sits at position 0 (execution
 * plan D7 / S4).
 *
 * Its whole job is to be honest about time. The projection reports how current
 * its evidence is, and this renders three different things accordingly:
 *
 * - `live`   · present tense. Mori was watching moments ago.
 * - `recent` · the same facts, explicitly stamped with when they were seen.
 * - `stale`  · no counts at all. Only the last activity, because claiming
 *              "진행 중" from an old observation would invent a present.
 *
 * Copy stays minimal per the house convention: the explanation lives in an
 * InfoHint, not in always-visible prose.
 */
import type { ReactNode } from "react";
import { CircleAlert, Hand, History, Radio } from "lucide-react";
import { withoutPasteMarkers } from "../../lib/session/agentText";
import { InfoHint } from "../../components/ui/InfoHint";
import { formatSidebarRelative } from "../../lib/sidebar/sessionList";
import { freshnessOf, type ProjectProjection } from "../../lib/live-intake";

/** Elapsed wall time as calm Korean, coarse on purpose. */
function formatElapsed(ms: number): string {
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return "1분 미만";
  if (minutes < 60) return `${minutes}분째`;
  const hours = Math.floor(minutes / 60);
  return `${hours}시간째`;
}

/**
 * Opens the conversation a request belongs to, or null when the page cannot
 * map its session file to a Mori session (the row then stays plain text).
 */
type OpenRequestSession = ((sessionKey: string) => (() => void) | null) | undefined;

/** A request row: a button that opens its session when it can, else text. */
function RequestRow({
  sessionKey,
  open,
  children,
}: {
  sessionKey: string;
  open: OpenRequestSession;
  children: ReactNode;
}) {
  const action = open?.(sessionKey) ?? null;
  return (
    <li className={action ? "ctx-live-row is-openable" : "ctx-live-row"}>
      {action ? (
        <button type="button" className="ctx-live-row-open" onClick={action} title="이 대화를 최신 메시지부터 엽니다">
          {children}
        </button>
      ) : (
        children
      )}
    </li>
  );
}

export function ProjectLiveSection({
  projection,
  now = Date.now(),
  openSession,
  unconfirmedObserved = 0,
  sessionTitleOf,
}: {
  projection: ProjectProjection | null;
  now?: number;
  /** Maps a request's session file to an action that opens it. */
  openSession?: OpenRequestSession;
  /**
   * Sessions observed in the folder named like this project that are not its
   * confirmed members. Never counted above; only said, so the user knows
   * there is work Mori saw and did not attribute.
   */
  unconfirmedObserved?: number;
  /** A session's own title by its source file, for sessions listed by session. */
  sessionTitleOf?: (sessionKey: string) => string | undefined;
}) {
  const aside = unconfirmedObserved > 0 ? <UnconfirmedAside count={unconfirmedObserved} /> : null;
  const asideOnly = aside ? (
    <section className="ctx-section ctx-live">
      <p className="ctx-section-label">현재 상황</p>
      {aside}
    </section>
  ) : null;
  if (!projection) return asideOnly;

  const stale = projection.freshness === "stale";
  // The counts are as current as their oldest observation, not their newest:
  // a session seen a minute ago does not make another one's count live.
  const basisAt = projection.countedObservedAt ?? projection.observedAt;
  // With nothing counted and sessions set aside, no dot: the observation that
  // remains is exactly what those sessions moved past.
  const freshness = stale
    ? "stale"
    : projection.countedObservedAt === null && projection.continued.length > 0
      ? "recent"
      : freshnessOf(basisAt, now);
  const counts: Array<{ key: string; label: string; value: number }> = [
    { key: "running", label: "진행 중", value: projection.runningCount },
    { key: "waiting", label: "내 확인 대기", value: projection.waitingCount },
    { key: "blocked", label: "막힘", value: projection.blockedCount },
  ].filter((c) => c.value > 0);

  // Nothing observed is worth a band, and neither is a stale project with no
  // recorded activity. A calm workspace shows no section at all.
  if (!stale && counts.length === 0 && !projection.lastActivityAt) return asideOnly;
  if (stale && !projection.lastActivityAt) return asideOnly;

  return (
    <section className="ctx-section ctx-live">
      <p className="ctx-section-label">
        현재 상황
        {freshness === "live" ? (
          <span className="ctx-live-dot" aria-label="관측 중" />
        ) : null}
        <InfoHint label="현재 상황 설명">
          Mori가 이 프로젝트의 에이전트 세션을 지켜본 기록에서 계산합니다. Mori가
          꺼져 있는 동안은 관측하지 않으므로, 관측이 오래되면 진행 상태 대신 마지막
          활동만 보여줍니다.
        </InfoHint>
      </p>

      {stale ? (
        <p className="ctx-live-quiet">
          마지막 활동 {formatSidebarRelative(projection.lastActivityAt ?? "", now)} · 관측{" "}
          {formatSidebarRelative(projection.observedAt, now)}
        </p>
      ) : (
        <>
          {counts.length > 0 ? (
            <div className="ctx-live-counts">
              {counts.map((c) => (
                <span key={c.key} className={`ctx-live-count is-${c.key}`}>
                  <b>{c.value}</b>
                  {c.label}
                </span>
              ))}
              {freshness === "recent" ? (
                <span className="ctx-live-asof">
                  {formatSidebarRelative(basisAt, now)} 기준
                </span>
              ) : null}
            </div>
          ) : (
            <p className="ctx-live-quiet">
              마지막 활동 {formatSidebarRelative(projection.lastActivityAt ?? "", now)}
            </p>
          )}

          {projection.running.length > 0 || projection.waiting.length > 0 || projection.blocked.length > 0 ? (
            <ul className="ctx-live-running">
              {/* What waits for the user first: it is the part only they can move. */}
              {projection.waiting.map((request) => (
                <RequestRow key={request.id} sessionKey={request.sessionKey} open={openSession}>
                  <Hand size={12} aria-hidden="true" className="ctx-live-row-icon" />
                  <span className="ctx-live-row-title">{withoutPasteMarkers(request.title)}</span>
                  <span className="ctx-live-row-meta">
                    내 확인 대기{request.endedAt ? ` · ${formatSidebarRelative(request.endedAt, now)}` : ""}
                  </span>
                </RequestRow>
              ))}
              {/* A stopped agent also needs the user, and a count alone gives no way in. */}
              {projection.blocked.map((request) => (
                <RequestRow key={request.id} sessionKey={request.sessionKey} open={openSession}>
                  <CircleAlert size={12} aria-hidden="true" className="ctx-live-row-icon" />
                  <span className="ctx-live-row-title">{withoutPasteMarkers(request.title)}</span>
                  <span className="ctx-live-row-meta">
                    막힘{request.endedAt ? ` · ${formatSidebarRelative(request.endedAt, now)}` : ""}
                  </span>
                </RequestRow>
              ))}
              {projection.running.map((request) => (
                <RequestRow key={request.id} sessionKey={request.sessionKey} open={openSession}>
                  <Radio size={12} aria-hidden="true" className="ctx-live-row-icon" />
                  <span className="ctx-live-row-title">{withoutPasteMarkers(request.title)}</span>
                  <span className="ctx-live-row-meta">
                    {formatElapsed(request.elapsedMs)} · {request.stepCount}단계
                  </span>
                </RequestRow>
              ))}
            </ul>
          ) : null}
        </>
      )}

      <ContinuedSessions projection={projection} now={now} openSession={openSession} sessionTitleOf={sessionTitleOf} />
      <RecentWork projection={projection} now={now} openSession={openSession} />
      {aside}
    </section>
  );
}

/**
 * Sessions that went on after Mori last looked. What Mori observed then is
 * not counted above; each row says only what is known (when the source was
 * last written, and what was observed before that) and opens the latest reply,
 * which is the evidence of where the session actually stands.
 */
function ContinuedSessions({
  projection,
  now,
  openSession,
  sessionTitleOf,
}: {
  projection: ProjectProjection;
  now: number;
  openSession: OpenRequestSession;
  sessionTitleOf?: (sessionKey: string) => string | undefined;
}) {
  if (projection.continued.length === 0) return null;
  return (
    <div className="ctx-live-continued">
      <p className="ctx-live-quiet ctx-live-aside">
        관측 이후 계속된 세션 {projection.continued.length}
        <InfoHint label="관측 이후 계속된 세션 설명">
          Mori가 마지막으로 본 뒤에도 기록이 이어진 세션입니다. 그때 본 상태는 지금을
          말해주지 않으므로 위 숫자에 넣지 않았습니다. 누르면 최신 메시지부터 엽니다.
        </InfoHint>
      </p>
      <ul className="ctx-live-running">
        {projection.continued.map((session) => {
          const then = STATUS_LABEL[session.lastStatus];
          return (
            <RequestRow key={session.sessionKey} sessionKey={session.sessionKey} open={openSession}>
              <History size={12} aria-hidden="true" className="ctx-live-row-icon" />
              <span className="ctx-live-row-title">
                {sessionTitleOf?.(session.sessionKey) ?? withoutPasteMarkers(session.lastTitle)}
              </span>
              <span className="ctx-live-row-meta">
                활동 {formatSidebarRelative(session.activeAt, now)}
                {then ? ` · 관측 당시 ${then}` : ""}
              </span>
            </RequestRow>
          );
        })}
      </ul>
    </div>
  );
}

/** Observed work this project does not claim, said once and kept quiet. */
function UnconfirmedAside({ count }: { count: number }) {
  return (
    <p className="ctx-live-quiet ctx-live-aside">
      확정하지 않은 세션 {count}개의 관찰은 넣지 않았습니다
      <InfoHint label="확정하지 않은 세션 설명">
        같은 이름의 폴더에서 관찰했지만 이 프로젝트에 넣지 않은 세션입니다. 세션을
        프로젝트에 넣으면 그 관찰도 여기에 포함됩니다.
      </InfoHint>
    </p>
  );
}

/**
 * 무슨 작업을 했고 무엇이 바뀌었는가, folded away by default.
 *
 * The projection has carried this since it was written and nothing rendered it,
 * so the page could say how many runs were going but never what they were. It
 * sits behind a `<details>` rather than as a peer block because the house rule
 * is that secondary items disclose instead of competing with the actionable
 * ones, and because 현재 상황 is answered by the counts above it.
 *
 * Shown even when the observation is stale: unlike the counts, a finished
 * request and a changed file are facts about the past, and the past does not
 * decay. The projection has already downgraded any status it can no longer
 * vouch for.
 */
function RecentWork({
  projection,
  now,
  openSession,
}: {
  projection: ProjectProjection;
  now: number;
  openSession: OpenRequestSession;
}) {
  const requests = projection.recentRequests;
  const files = projection.topFiles;
  if (requests.length === 0 && files.length === 0) return null;

  return (
    <details className="ctx-live-more">
      <summary className="ctx-live-more-head">
        최근 작업 {requests.length}
        {files.length > 0 ? ` · 파일 ${files.length}` : ""}
      </summary>

      {requests.length > 0 ? (
        <ul className="ctx-live-list">
          {requests.map((request) => (
            <RequestRow key={request.id} sessionKey={request.sessionKey} open={openSession}>
              <span className="ctx-live-row-title">{withoutPasteMarkers(request.title)}</span>
              <span className="ctx-live-row-meta">
                {STATUS_LABEL[request.status] ?? ""}
                {request.endedAt ? ` · ${formatSidebarRelative(request.endedAt, now)}` : ""}
              </span>
            </RequestRow>
          ))}
        </ul>
      ) : null}

      {files.length > 0 ? (
        <ul className="ctx-live-list ctx-live-files">
          {files.map((file) => (
            <li key={file.path} className="ctx-live-row">
              <span className="ctx-live-row-title" title={file.path}>
                {basename(file.path)}
              </span>
              <span className="ctx-live-row-meta">
                {file.additions > 0 ? <b className="is-add">+{file.additions}</b> : null}
                {file.deletions > 0 ? <b className="is-del">-{file.deletions}</b> : null}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </details>
  );
}

/** Plain language, not the engine's status vocabulary. */
const STATUS_LABEL: Record<string, string> = {
  running: "진행 중",
  waitingForUser: "내 확인 대기",
  blocked: "막힘",
  completed: "완료",
  // `unknown` deliberately renders as nothing: Mori stopped watching and saying
  // "알 수 없음" would be noise where silence is the honest answer.
  unknown: "",
};

function basename(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? path;
}
