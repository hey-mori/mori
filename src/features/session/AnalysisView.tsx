import { useEffect, useState } from "react";
import { GitBranch, Sparkles } from "lucide-react";
import { useAppStore } from "../../app/store";
import { TimelineView } from "../timeline/TimelineView";
import { ReviewView } from "../review/ReviewView";

type AnalysisSection = "flow" | "review";

/**
 * 분석 — the unified analysis surface.
 *
 * One tab for everything the analysis produced from the session's data, split
 * into two clearly separated sections:
 *   - **흐름**  the AI's reading of how the work progressed (the workflow view),
 *              which also carries the analysis summary and the run controls.
 *   - **검토**  the issues / decisions / next actions to confirm.
 *
 * It replaces the separate 자료 + 검토 tabs and absorbs the 흐름 reading that
 * used to live under 활동, so the analysis input, narrative, and review work read
 * as one place instead of three. The raw activity (타임라인 / 원본) stays in 활동.
 */
export function AnalysisView() {
  const reviewFocus = useAppStore((state) => state.reviewFocus);
  const [section, setSection] = useState<AnalysisSection>(reviewFocus ? "review" : "flow");

  // A deep-link into a review item (from 개요 or a 흐름 ground link) arms
  // `reviewFocus`; honour it by opening the 검토 section.
  useEffect(() => {
    if (reviewFocus) setSection("review");
  }, [reviewFocus]);

  return (
    <div className="analysis-view">
      <div className="analysis-section-switch" role="tablist" aria-label="분석 보기">
        <button
          type="button"
          role="tab"
          aria-selected={section === "flow"}
          className={`analysis-section-option ${section === "flow" ? "is-active" : ""}`}
          onClick={() => setSection("flow")}
        >
          <Sparkles size={14} aria-hidden="true" />
          흐름
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={section === "review"}
          className={`analysis-section-option ${section === "review" ? "is-active" : ""}`}
          onClick={() => setSection("review")}
        >
          <GitBranch size={14} aria-hidden="true" />
          검토
        </button>
      </div>
      {section === "flow" ? (
        <TimelineView mode="timeline" readingModes={["workflow"]} />
      ) : (
        <ReviewView />
      )}
    </div>
  );
}
