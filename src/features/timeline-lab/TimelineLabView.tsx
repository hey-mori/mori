import { useEffect, useMemo, useState } from "react";
import { Activity, Milestone, ScrollText, SearchX, Workflow } from "lucide-react";
import { selectSessionView, useSessionStore } from "../../app/sessionStore";
import { SegmentedControl } from "../../components/ui/SegmentedControl";
import {
  EMPTY_LAB_FILTER,
  filterSession,
  isLabFilterActive,
  type LabFilter,
} from "../../lib/timeline-lab/labFilter";
import { momentKindForEvent, type NarrativeMomentKind } from "../../lib/timeline-lab/narrative";
import { LabFilterBar } from "./LabFilterBar";
import { NarrativeStoryView } from "./NarrativeStoryView";
import { PhaseFlowView } from "./PhaseFlowView";
import { CausalMapView } from "./CausalMapView";
import { PulseView } from "./PulseView";

/**
 * 재구성 — an experimental second timeline that rebuilds a reviewed session
 * into shapes the eye can read, rather than a dense swimlane on a clock.
 *
 * The existing 흐름 timeline answers "what happened, by category, when". This
 * surface answers the harder question the user kept hitting: "I can't follow
 * the *flow* from the raw view." It offers three reconstructions of the same
 * reviewed data, switchable in place:
 *
 *   - 서사  — one vertical story, cause threaded between moments
 *   - 국면  — the work arc (탐색 → 결정 → 구현 → 점검 → 정리)
 *   - 인과  — a cause → effect map laid out by causal depth
 *   - 맥동  — the session as vital signs (counts, mix, momentum)
 *
 * All four derive purely from the already-reviewed session (see
 * `src/lib/timeline-lab/*`); this component only picks the lens.
 */

type LabMode = "narrative" | "phases" | "causal" | "pulse";

const MODE_OPTIONS: {
  id: LabMode;
  label: string;
  icon: typeof ScrollText;
  title: string;
}[] = [
  { id: "narrative", label: "서사", icon: ScrollText, title: "하나의 이야기로 위에서 아래로 읽기" },
  { id: "phases", label: "국면", icon: Milestone, title: "작업이 거친 단계로 묶어 보기" },
  { id: "causal", label: "인과", icon: Workflow, title: "원인에서 결과로 이어지는 지도" },
  { id: "pulse", label: "맥동", icon: Activity, title: "세션을 숫자로 한눈에 요약" },
];

export function TimelineLabView() {
  const hydrate = useSessionStore((state) => state.hydrate);
  const initialized = useSessionStore((state) => state.initialized);
  const view = useSessionStore(selectSessionView);
  const [mode, setMode] = useState<LabMode>("narrative");
  const [filter, setFilter] = useState<LabFilter>(EMPTY_LAB_FILTER);

  useEffect(() => {
    if (!initialized) hydrate();
  }, [initialized, hydrate]);

  const filtered = useMemo(() => filterSession(view, filter), [view, filter]);
  const filterActive = isLabFilterActive(filter);
  const noMatches = filterActive && filtered.events.length === 0;

  // Per-kind counts come from the unfiltered session so the popover numbers are
  // a stable overview of what the session contains, not of the current filter.
  const kindCounts = useMemo(() => {
    const counts: Partial<Record<NarrativeMomentKind, number>> = {};
    for (const event of view.events) {
      const kind = momentKindForEvent(event.type);
      counts[kind] = (counts[kind] ?? 0) + 1;
    }
    return counts;
  }, [view.events]);

  const focusKind = (kind: NarrativeMomentKind) => {
    setFilter({ query: "", kinds: [kind] });
    setMode("narrative");
  };

  return (
    <div className="timeline-lab">
      <div className="timeline-lab-toolbar">
        <SegmentedControl
          ariaLabel="재구성 방식"
          role="radiogroup"
          value={mode}
          onChange={setMode}
          options={MODE_OPTIONS.map((option) => {
            const Icon = option.icon;
            return {
              id: option.id,
              title: option.title,
              label: (
                <span className="timeline-lab-mode">
                  <Icon size={14} aria-hidden="true" />
                  {option.label}
                </span>
              ),
            };
          })}
        />
        <LabFilterBar
          filter={filter}
          onFilterChange={setFilter}
          matched={filtered.events.length}
          total={view.events.length}
          kindCounts={kindCounts}
        />
      </div>
      <div className="timeline-lab-stage">
        {noMatches ? (
          <div className="lab-empty">
            <SearchX size={20} aria-hidden="true" />
            <p>이 조건에 맞는 순간이 없습니다.</p>
            <button
              type="button"
              className="lab-filter-clear"
              onClick={() => setFilter(EMPTY_LAB_FILTER)}
            >
              필터 지우기
            </button>
          </div>
        ) : (
          <>
            {mode === "narrative" ? <NarrativeStoryView view={filtered} /> : null}
            {mode === "phases" ? <PhaseFlowView view={filtered} /> : null}
            {mode === "causal" ? <CausalMapView view={filtered} /> : null}
            {mode === "pulse" ? <PulseView view={filtered} onFocusKind={focusKind} /> : null}
          </>
        )}
      </div>
    </div>
  );
}
