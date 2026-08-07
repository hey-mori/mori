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
import { Radio } from "lucide-react";
import { InfoHint } from "../../components/ui/InfoHint";
import { formatSidebarRelative } from "../../lib/sidebar/sessionList";
import type { ProjectProjection } from "../../lib/live-intake";

/** Elapsed wall time as calm Korean, coarse on purpose. */
function formatElapsed(ms: number): string {
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return "1분 미만";
  if (minutes < 60) return `${minutes}분째`;
  const hours = Math.floor(minutes / 60);
  return `${hours}시간째`;
}

export function ProjectLiveSection({
  projection,
  now = Date.now(),
}: {
  projection: ProjectProjection | null;
  now?: number;
}) {
  if (!projection) return null;

  const { freshness } = projection;
  const stale = freshness === "stale";
  const counts: Array<{ key: string; label: string; value: number }> = [
    { key: "running", label: "진행 중", value: projection.runningCount },
    { key: "waiting", label: "내 확인 대기", value: projection.waitingCount },
    { key: "blocked", label: "막힘", value: projection.blockedCount },
  ].filter((c) => c.value > 0);

  // Nothing observed is worth a band, and neither is a stale project with no
  // recorded activity. A calm workspace shows no section at all.
  if (!stale && counts.length === 0 && !projection.lastActivityAt) return null;
  if (stale && !projection.lastActivityAt) return null;

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
                  {formatSidebarRelative(projection.observedAt, now)} 기준
                </span>
              ) : null}
            </div>
          ) : (
            <p className="ctx-live-quiet">
              마지막 활동 {formatSidebarRelative(projection.lastActivityAt ?? "", now)}
            </p>
          )}

          {projection.running.length > 0 ? (
            <ul className="ctx-live-running">
              {projection.running.map((request) => (
                <li key={request.id} className="ctx-live-row">
                  <Radio size={12} aria-hidden="true" className="ctx-live-row-icon" />
                  <span className="ctx-live-row-title">{request.title}</span>
                  <span className="ctx-live-row-meta">
                    {formatElapsed(request.elapsedMs)} · {request.stepCount}단계
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </>
      )}
    </section>
  );
}
