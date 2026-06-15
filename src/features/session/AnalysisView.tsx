import { useEffect, useState } from "react";
import { GitBranch, Settings as SettingsIcon, Sparkles } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { useAppStore } from "../../app/store";
import {
  selectHasRealAnalysis,
  selectSessionMode,
  useSessionStore,
} from "../../app/sessionStore";
import { providerKindLabel } from "../../lib/analysis/providerLabels";
import type { QuickPassProviderKind } from "../../lib/analysis/analysisSettings";
import { TimelineView } from "../timeline/TimelineView";
import { ReviewView } from "../review/ReviewView";

type AnalysisSection = "flow" | "review";

/**
 * 분석 — the unified analysis surface.
 *
 * One tab for everything the analysis produced from the session's data:
 *   - a run bar (engine + 분석 실행 / 재분석) so the analysis can be run and
 *     re-run here, where its results are read — the control used to live in the
 *     separate 자료 tab,
 *   - **흐름**  the AI's reading of how the work progressed (the workflow view,
 *               which carries the analysis summary),
 *   - **검토**  the issues / decisions / next actions to confirm.
 *
 * It replaces the separate 자료 + 검토 tabs and absorbs the 흐름 reading that
 * used to live under 활동, so the analysis input, narrative, and review work read
 * as one place. The raw activity (타임라인 / 원본) stays in 활동.
 */
export function AnalysisView() {
  const reviewFocus = useAppStore((state) => state.reviewFocus);
  const navigate = useAppStore((state) => state.navigate);
  const mode = useSessionStore(selectSessionMode);
  const analysisStatus = useSessionStore((state) => state.analysisStatus);
  const runQuickPass = useSessionStore((state) => state.runQuickPass);
  const settings = useSessionStore((state) => state.analysisSettings);
  const updateAnalysisSettings = useSessionStore((state) => state.updateAnalysisSettings);
  const imports = useSessionStore((state) => state.imports);
  const hasAnalysis = useSessionStore(selectHasRealAnalysis);

  const [section, setSection] = useState<AnalysisSection>(reviewFocus ? "review" : "flow");

  // A deep-link into a review item (from 개요 or a 흐름 ground link) arms
  // `reviewFocus`; honour it by opening the 검토 section.
  useEffect(() => {
    if (reviewFocus) setSection("review");
  }, [reviewFocus]);

  const running = analysisStatus === "running";
  const canRun = imports.length > 0 && !running;

  return (
    <div className="analysis-view">
      <div className="analysis-header">
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

        {mode === "draft" ? (
          <div className="analysis-run-controls" role="group" aria-label="분석 실행">
            <select
              className="analysis-engine-select"
              aria-label="분석 엔진"
              value={settings.provider}
              onChange={(event) =>
                updateAnalysisSettings({ provider: event.target.value as QuickPassProviderKind })
              }
            >
              <option value="deterministic">{providerKindLabel("deterministic")}</option>
              <option value="ollama">{providerKindLabel("ollama")}</option>
              <option value="openAiCompatible">{providerKindLabel("openAiCompatible")}</option>
            </select>
            <Button
              variant="primary"
              size="sm"
              icon={Sparkles}
              onClick={() => void runQuickPass()}
              disabled={!canRun}
            >
              {running ? "분석 중..." : hasAnalysis ? "재분석" : "분석 실행"}
            </Button>
            <button
              type="button"
              className="analysis-settings-link"
              onClick={() => navigate("settings")}
              aria-label="분석 설정"
              title="분석 설정"
            >
              <SettingsIcon size={14} aria-hidden="true" />
            </button>
          </div>
        ) : null}
      </div>

      {section === "flow" ? (
        <TimelineView mode="timeline" readingModes={["workflow"]} />
      ) : (
        <ReviewView />
      )}
    </div>
  );
}
