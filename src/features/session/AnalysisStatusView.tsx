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
import type { CSSProperties, ReactNode } from "react";
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

export function AnalysisStatusView() {
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
      <div className="session-tab-pane analysis-status-pane">
        <div className="session-tab-split is-collapsed">
          <div className="session-tab-main analysis-status">
            {analysisStatus === "failed" ? (
              <NoticeBanner tone="danger" title="분석 실패">
                {analysisError ?? "분석 결과를 만들지 못했습니다."}
              </NoticeBanner>
            ) : null}
            <SessionEmptyPrompt
              title={hasSourceMaterial ? "아직 분석 결과가 없습니다" : "분석할 소스가 없습니다"}
              hint={
                hasSourceMaterial
                  ? "분석을 실행하면 실행 상태, 입력 범위, 결과 구성을 확인할 수 있습니다."
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
  const extractedCount = issueCount + decisionCount + nextActionCount;
  const status = resolveAnalysisState(analysisStatus, fallbackUsed);
  const notes = analysis.notes.filter((note) => !isLegacyFallbackNote(note));

  return (
    <div className="session-tab-pane analysis-status-pane">
      <div className="session-tab-split is-collapsed">
        <div className="session-tab-main analysis-status">
          {analysisStatus === "failed" ? (
            <NoticeBanner tone="danger" title="최근 분석 실패">
              {analysisError ?? "가장 최근 분석이 실패했습니다. 아래에는 이전 결과를 유지합니다."}
            </NoticeBanner>
          ) : null}

          {fallbackUsed ? (
            <NoticeBanner tone="warning" title="이전 대체 결과">
              이 결과는 이전 버전에서 AI 실패 후 규칙 기반으로 만든 결과입니다. 다시 분석하면 실패는 실패로 표시됩니다.
            </NoticeBanner>
          ) : null}

          <section className={`analysis-status-hero tone-${status.tone}`} aria-label="분석 상태 요약">
            <span className="analysis-status-hero-icon" aria-hidden="true">
              {status.tone === "danger" || status.tone === "warning" ? (
                <AlertTriangle size={18} />
              ) : (
                <CheckCircle2 size={18} />
              )}
            </span>
            <div className="analysis-status-hero-copy">
              <span>{status.label}</span>
              <h3>{status.title}</h3>
              <p>{status.description}</p>
            </div>
            <dl className="analysis-status-run-meta">
              <Metric label="엔진" value={cleanEngineLabel(analysis.providerLabel)} />
              <Metric label="실행" value={formatClaudeRelativeKo(analysis.generatedAt)} />
              <Metric label="소요" value={formatDuration(analysis.durationMs)} />
            </dl>
          </section>

          <div className="analysis-status-layout">
            <StatusPanel
              title="입력 범위"
              icon={<Database size={15} aria-hidden="true" />}
              meta={`${analysis.inputSourceCount}개 소스`}
            >
              <MetricRows
                rows={[
                  ["가져온 이벤트", `${analysis.inputEventCount}개`],
                  ["분석 소스", `${analysis.inputSourceCount}개`],
                  ["세션 소스", `${sourceCount}개`],
                ]}
              />
            </StatusPanel>

            <StatusPanel
              title="결과 구성"
              icon={<ListChecks size={15} aria-hidden="true" />}
              meta={`${extractedCount}개 항목`}
            >
              <ResultBreakdown
                rows={[
                  { label: "이슈", value: issueCount, tone: "orange" },
                  { label: "결정", value: decisionCount, tone: "blue" },
                  { label: "다음 액션", value: nextActionCount, tone: "green" },
                  { label: "관계", value: relationshipCount, tone: "neutral" },
                ]}
              />
            </StatusPanel>

            <StatusPanel
              title="품질 신호"
              icon={<CheckCircle2 size={15} aria-hidden="true" />}
              meta={formatConfidence(analysis.confidence)}
            >
              <MetricRows
                rows={[
                  ["신뢰도", formatConfidence(analysis.confidence)],
                  ["노트", `${notes.length}개`],
                  ["기록", cleanEngineLabel(analysis.providerLabel)],
                ]}
              />
            </StatusPanel>
          </div>

          <section className="analysis-status-section" aria-label="분석 노트">
            <header className="analysis-status-section-head">
              <span className="analysis-status-section-icon" aria-hidden="true">
                <FileSearch size={14} />
              </span>
              <strong>분석 노트</strong>
            </header>
            {notes.length > 0 ? (
              <ul className="analysis-status-note-list">
                {notes.map((note) => (
                  <li key={note}>{cleanEngineLabel(note)}</li>
                ))}
              </ul>
            ) : (
              <p className="analysis-status-empty">표시할 엔진 노트가 없습니다.</p>
            )}
          </section>

          <section className="analysis-status-section" aria-label="분석 기록">
            <header className="analysis-status-section-head">
              <span className="analysis-status-section-icon" aria-hidden="true">
                <Clock3 size={14} />
              </span>
              <strong>분석 기록</strong>
            </header>
            <AnalysisRunHistoryPanel />
          </section>
        </div>
      </div>
    </div>
  );
}

function StatusPanel({
  title,
  icon,
  meta,
  children,
}: {
  title: string;
  icon: ReactNode;
  meta: string;
  children: ReactNode;
}) {
  return (
    <article className="analysis-status-panel">
      <header>
        <span className="analysis-status-panel-icon">{icon}</span>
        <strong>{title}</strong>
        <small>{meta}</small>
      </header>
      {children}
    </article>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function MetricRows({ rows }: { rows: Array<[string, string]> }) {
  return (
    <dl className="analysis-status-metrics">
      {rows.map(([label, value]) => (
        <Metric key={label} label={label} value={value} />
      ))}
    </dl>
  );
}

function ResultBreakdown({
  rows,
}: {
  rows: Array<{ label: string; value: number; tone: "orange" | "blue" | "green" | "neutral" }>;
}) {
  const max = Math.max(...rows.map((row) => row.value), 1);
  return (
    <ul className="analysis-status-breakdown">
      {rows.map((row) => (
        <li key={row.label} className={`tone-${row.tone}`}>
          <span>{row.label}</span>
          <strong>{row.value}개</strong>
          <i style={{ "--value": `${Math.max((row.value / max) * 100, row.value > 0 ? 8 : 0)}%` } as CSSProperties} />
        </li>
      ))}
    </ul>
  );
}

function resolveAnalysisState(
  analysisStatus: string,
  fallbackUsed: boolean,
): { label: string; title: string; description: string; tone: "success" | "neutral" | "warning" | "danger" } {
  if (analysisStatus === "running") {
    return {
      label: "실행 중",
      title: "분석을 실행하는 중입니다",
      description: "완료되면 흐름과 정리 화면의 결과가 갱신됩니다.",
      tone: "neutral",
    };
  }
  if (analysisStatus === "failed") {
    return {
      label: "이전 결과 유지",
      title: "최근 분석은 실패했습니다",
      description: "새 결과를 만들지 못했으므로 아래 정보는 마지막 성공 결과입니다.",
      tone: "danger",
    };
  }
  if (fallbackUsed) {
    return {
      label: "이전 대체 결과",
      title: "규칙 기반 대체 결과입니다",
      description: "새 분석에서는 AI 실패를 규칙 기반 결과로 대체하지 않습니다.",
      tone: "warning",
    };
  }
  return {
    label: "완료",
    title: "분석 결과를 사용 중입니다",
    description: "흐름, 이슈, 결정, 다음 액션이 이 분석 결과를 기준으로 표시됩니다.",
    tone: "success",
  };
}

function cleanEngineLabel(label: string): string {
  return label.replace(/\s*Quick Pass/gi, " 분석").replace(/\s{2,}/g, " ").trim();
}

function isLegacyFallbackNote(note: string): boolean {
  return /규칙 기반으로 대체|Fell back to|fallback/i.test(note);
}

function formatDuration(durationMs: number): string {
  if (durationMs <= 0) return "-";
  return durationMs < 1000 ? "1초 미만" : `${(durationMs / 1000).toFixed(1)}초`;
}

function formatConfidence(confidence: number): string {
  return `${Math.round(confidence * 100)}%`;
}
