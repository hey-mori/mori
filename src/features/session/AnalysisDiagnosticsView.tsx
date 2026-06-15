import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Database,
  FileSearch,
  ListChecks,
  ListPlus,
  Sparkles,
} from "lucide-react";
import type { ReactNode } from "react";
import { NoticeBanner } from "../../components/layout/NoticeBanner";
import { Button } from "../../components/ui/Button";
import { useAppStore } from "../../app/store";
import {
  selectHasRealAnalysis,
  selectSessionMode,
  selectSessionView,
  useSessionStore,
} from "../../app/sessionStore";
import { formatClaudeRelativeKo } from "../../lib/claude/claudeTauri";
import { AnalysisRunHistoryPanel } from "../review/AnalysisRunHistoryPanel";
import { SessionEmptyPrompt } from "./SessionEmptyPrompt";

export function AnalysisDiagnosticsView() {
  const navigate = useAppStore((state) => state.navigate);
  const mode = useSessionStore(selectSessionMode);
  const view = useSessionStore(selectSessionView);
  const analysis = useSessionStore((state) => state.analysis);
  const analysisStatus = useSessionStore((state) => state.analysisStatus);
  const analysisError = useSessionStore((state) => state.analysisError);
  const fallbackUsed = useSessionStore((state) => state.analysisFallbackUsed);
  const imports = useSessionStore((state) => state.imports);
  const runQuickPass = useSessionStore((state) => state.runQuickPass);
  const hasAnalysis = useSessionStore(selectHasRealAnalysis);

  const running = analysisStatus === "running";
  const sourceCount = mode === "demo" ? view.sources.length : imports.length || view.sources.length;
  const hasSourceMaterial = sourceCount > 0;
  const canRun = mode === "draft" && imports.length > 0 && !running;

  if (!hasAnalysis || !analysis) {
    return (
      <div className="session-tab-pane analysis-diagnostics-pane">
        <div className="session-tab-split is-collapsed">
          <div className="session-tab-main analysis-diagnostics">
            {analysisStatus === "failed" ? (
              <NoticeBanner tone="danger" title="분석 실패">
                {analysisError ?? "분석 결과를 만들지 못했습니다."}
              </NoticeBanner>
            ) : null}
            <SessionEmptyPrompt
              title={hasSourceMaterial ? "아직 분석 결과가 없습니다" : "진단할 소스가 없습니다"}
              hint={
                hasSourceMaterial
                  ? "분석을 실행하면 엔진, 입력 범위, 결과 노트를 확인할 수 있습니다."
                  : "소스를 가져오면 분석을 실행할 수 있습니다."
              }
              action={
                !hasSourceMaterial ? (
                  <Button
                    variant="primary"
                    size="sm"
                    icon={ListPlus}
                    onClick={() => navigate("connections")}
                  >
                    소스에서 가져오기
                  </Button>
                ) : mode === "draft" ? (
                  <Button
                    variant="primary"
                    size="sm"
                    icon={Sparkles}
                    onClick={() => void runQuickPass()}
                    disabled={!canRun}
                  >
                    {running ? "분석 중..." : "분석 실행"}
                  </Button>
                ) : undefined
              }
            />
          </div>
        </div>
      </div>
    );
  }

  const issueCount = analysis.issues.length;
  const decisionCount = analysis.decisions.length;
  const nextActionCount = analysis.nextActions.length;
  const relationshipCount = analysis.relationships.length;
  const status = resolveDiagnosticStatus(analysisStatus, fallbackUsed);

  return (
    <div className="session-tab-pane analysis-diagnostics-pane">
      <div className="session-tab-split is-collapsed">
        <div className="session-tab-main analysis-diagnostics">
          {analysisStatus === "failed" ? (
            <NoticeBanner tone="danger" title="최근 분석 실패">
              {analysisError ?? "가장 최근 분석 실행이 실패했습니다. 아래에는 이전 결과를 표시합니다."}
            </NoticeBanner>
          ) : null}

          <section className="analysis-diagnostic-grid" aria-label="분석 진단 요약">
            <DiagnosticCard
              title="현재 실행"
              icon={<Sparkles size={15} aria-hidden="true" />}
              tone={status.tone}
              meta={status.label}
            >
              <MetricRows
                rows={[
                  ["엔진", cleanEngineLabel(analysis.providerLabel)],
                  ["실행", formatClaudeRelativeKo(analysis.generatedAt)],
                  ["소요", formatDuration(analysis.durationMs)],
                  ["신뢰도", formatConfidence(analysis.confidence)],
                ]}
              />
            </DiagnosticCard>

            <DiagnosticCard
              title="입력"
              icon={<Database size={15} aria-hidden="true" />}
              tone="blue"
              meta={`${analysis.inputSourceCount}개 소스`}
            >
              <MetricRows
                rows={[
                  ["이벤트", `${analysis.inputEventCount}개`],
                  ["소스", `${analysis.inputSourceCount}개`],
                  ["세션 소스", `${sourceCount}개`],
                ]}
              />
            </DiagnosticCard>

            <DiagnosticCard
              title="추출"
              icon={<ListChecks size={15} aria-hidden="true" />}
              tone="green"
              meta={`${issueCount + decisionCount + nextActionCount}개 항목`}
            >
              <MetricRows
                rows={[
                  ["이슈", `${issueCount}개`],
                  ["결정", `${decisionCount}개`],
                  ["다음 액션", `${nextActionCount}개`],
                  ["관계", `${relationshipCount}개`],
                ]}
              />
            </DiagnosticCard>

            <DiagnosticCard
              title="상태"
              icon={status.tone === "warning"
                ? <AlertTriangle size={15} aria-hidden="true" />
                : <CheckCircle2 size={15} aria-hidden="true" />}
              tone={status.tone}
              meta={status.label}
            >
              <p className="analysis-diagnostic-status-copy">
                {fallbackUsed
                  ? "요청한 LLM 분석에 실패해 규칙 기반 결과를 사용했습니다."
                  : "현재 선택된 분석 결과를 사용 중입니다."}
              </p>
            </DiagnosticCard>
          </section>

          <section className="analysis-diagnostic-section" aria-label="분석 노트">
            <header className="analysis-diagnostic-section-head">
              <span className="analysis-diagnostic-section-icon" aria-hidden="true">
                <FileSearch size={14} />
              </span>
              <strong>노트</strong>
            </header>
            {analysis.notes.length > 0 ? (
              <ul className="analysis-diagnostic-note-list">
                {analysis.notes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            ) : (
              <p className="analysis-diagnostic-empty">엔진 노트 없음</p>
            )}
          </section>

          <section className="analysis-diagnostic-section" aria-label="분석 실행 기록">
            <header className="analysis-diagnostic-section-head">
              <span className="analysis-diagnostic-section-icon" aria-hidden="true">
                <Clock3 size={14} />
              </span>
              <strong>실행 기록</strong>
            </header>
            <AnalysisRunHistoryPanel />
          </section>
        </div>
      </div>
    </div>
  );
}

function DiagnosticCard({
  title,
  icon,
  tone,
  meta,
  children,
}: {
  title: string;
  icon: ReactNode;
  tone: "green" | "blue" | "warning" | "neutral";
  meta: string;
  children: ReactNode;
}) {
  return (
    <article className={`analysis-diagnostic-card tone-${tone}`}>
      <header>
        <span className="analysis-diagnostic-card-icon">{icon}</span>
        <strong>{title}</strong>
        <small>{meta}</small>
      </header>
      {children}
    </article>
  );
}

function MetricRows({ rows }: { rows: Array<[string, string]> }) {
  return (
    <dl className="analysis-diagnostic-metrics">
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function resolveDiagnosticStatus(
  analysisStatus: string,
  fallbackUsed: boolean,
): { label: string; tone: "green" | "warning" | "neutral" } {
  if (analysisStatus === "running") return { label: "분석 중", tone: "neutral" };
  if (fallbackUsed) return { label: "규칙 기반 전환", tone: "warning" };
  return { label: "사용 중", tone: "green" };
}

function cleanEngineLabel(label: string): string {
  return label.replace(/\s*Quick Pass/gi, " 분석").replace(/\s{2,}/g, " ").trim();
}

function formatDuration(durationMs: number): string {
  if (durationMs <= 0) return "-";
  return durationMs < 1000 ? "1초 미만" : `${(durationMs / 1000).toFixed(1)}초`;
}

function formatConfidence(confidence: number): string {
  return `${Math.round(confidence * 100)}%`;
}
