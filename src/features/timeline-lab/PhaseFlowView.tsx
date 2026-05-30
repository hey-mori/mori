import { ChevronRight, Flag, TriangleAlert } from "lucide-react";
import type { MockSession } from "../../domain/types";
import { buildPhaseTimeline, type PhaseChapter } from "../../lib/timeline-lab/phaseTimeline";
import { InfoHint } from "../../components/ui/InfoHint";

/**
 * 국면 — the session rebuilt as the work arc it moved through, in time order.
 *
 * Unlike a kind-bucketed view (which would just redraw 맥동's phase mix), this
 * reads the session as ordered *chapters*: contiguous stretches dominated by one
 * stage (탐색 → 결정 → 구현 → 점검 → 정리), allowed to repeat, so a back-and-forth
 * (explore → build → back to explore → verify) shows as distinct bands rather
 * than one merged bucket. Each band's width grows with how many moments it held,
 * so "where the session spent itself" reads at a glance, and its time range
 * anchors it on the real clock. When the session lacks timestamps the model
 * falls back to a kind grouping and the view says so.
 */
export function PhaseFlowView({ view }: { view: MockSession }) {
  const { chapters, mode } = buildPhaseTimeline(view);

  if (chapters.length === 0) {
    return <div className="lab-empty">이 세션에는 아직 재구성할 이벤트가 없습니다.</div>;
  }

  return (
    <div className="lab-phases">
      <header className="lab-phases-head">
        <h4>작업 국면</h4>
        <InfoHint label="국면 설명">
          같은 순간들을 시간 순서대로 작업 단계로 끊어 읽습니다. 한 단계가 여러 번
          나타날 수 있어, 되돌아간 흐름까지 보입니다. 띠 너비는 그 구간에 담긴
          순간 수이고, 아래 범위는 실제 시각입니다.
        </InfoHint>
        {mode === "grouped" ? (
          <span className="lab-phases-note">시간 정보가 없어 단계별로 묶었습니다.</span>
        ) : null}
      </header>

      <ol className="lab-phase-track">
        {chapters.map((chapter, index) => (
          <li
            key={chapter.id}
            className="lab-phase-cell"
            style={{ flexGrow: Math.max(1, chapter.moments.length) }}
          >
            <PhaseChapterCard chapter={chapter} />
            {index < chapters.length - 1 ? (
              <ChevronRight size={18} className="lab-phase-arrow" aria-hidden="true" />
            ) : null}
          </li>
        ))}
      </ol>
    </div>
  );
}

function PhaseChapterCard({ chapter }: { chapter: PhaseChapter }) {
  return (
    <section className="lab-phase" data-tone={chapter.tone} aria-label={chapter.label}>
      <header className="lab-phase-head">
        <div className="lab-phase-title">
          <span className="lab-phase-dot" aria-hidden="true" />
          <h5>{chapter.label}</h5>
          <span className="lab-phase-count">{chapter.moments.length}</span>
        </div>
        {chapter.spanLabel ? <span className="lab-phase-range">{chapter.spanLabel}</span> : null}
      </header>
      {chapter.decisionCount > 0 || chapter.issueCount > 0 ? (
        <div className="lab-phase-meta">
          {chapter.decisionCount > 0 ? (
            <span className="lab-phase-metric" data-kind="decision">
              <Flag size={11} aria-hidden="true" />
              {chapter.decisionCount}
            </span>
          ) : null}
          {chapter.issueCount > 0 ? (
            <span className="lab-phase-metric" data-kind="issue">
              <TriangleAlert size={11} aria-hidden="true" />
              {chapter.issueCount}
            </span>
          ) : null}
        </div>
      ) : null}
      <ul className="lab-phase-moments">
        {chapter.moments.map((moment) => (
          <li key={moment.id} className="lab-phase-moment" data-tone={moment.tone}>
            <span className="lab-phase-moment-time">{moment.timeLabel || "·"}</span>
            <span className="lab-phase-moment-title">{moment.title}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
