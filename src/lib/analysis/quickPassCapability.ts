import type { Project, Session, SourceRef, TimelineEvent } from "../../domain/types";
import type { QuickPassAnalysisSettings, QuickPassProviderKind } from "./analysisSettings";
import type { AnalysisResult } from "./analysisTypes";
import type { AnalysisInput } from "./analysisTypes";
import { buildProviderConfigFromSettings, resolveQuickPassProvider } from "./quickPassProvider";

/**
 * Quick Pass capability check.
 *
 * A reachability probe (`GET /api/tags`, `GET /models`) only proves the
 * endpoint is up. Quick Pass needs more: the configured model must actually
 * return a Mori-shaped JSON object. This module runs a small, FIXED synthetic
 * sample through the real `analyze()` path and grades the result. The sample
 * is never the user's session data, so a capability test never leaks real
 * evidence to an external endpoint.
 */

/**
 * A test run shouldn't hang for the user's full production timeout. Cap it so
 * a stalled endpoint surfaces as a timeout in reasonable time. A cold local
 * model can still need ~20s for the first token, so the cap stays generous.
 */
export const CAPABILITY_TEST_TIMEOUT_CAP_MS = 30_000;

export type QuickPassCapabilityVerdict =
  | "ready"
  | "reachableNoStructure"
  | "failed";

export type QuickPassCapabilityCounts = {
  issues: number;
  decisions: number;
  relationships: number;
  nextActions: number;
  highlights: number;
};

export type QuickPassCapabilityReport = {
  verdict: QuickPassCapabilityVerdict;
  provider: QuickPassProviderKind;
  providerLabel: string;
  durationMs: number;
  counts: QuickPassCapabilityCounts;
  hasSummary: boolean;
  /** Short Korean headline describing the verdict. */
  message: string;
  /** Actionable next step for a weak / failed run; null when ready. */
  hint: string | null;
  /** Raw provider error message when the run threw; null otherwise. */
  error: string | null;
};

const SAMPLE_NOW = "2026-01-01T00:00:00.000Z";

/**
 * A fixed, synthetic Quick Pass input used only to exercise an engine. It
 * contains no real user data and embeds signals (결정 / TODO / 위험) the
 * rule-based engine also recognises, so a capable engine of any kind should
 * extract at least one issue and one decision.
 */
export function buildQuickPassSampleInput(now: string = SAMPLE_NOW): AnalysisInput {
  const project: Project = {
    id: "sample-project",
    name: "엔진 점검 샘플",
    description: "엔진 응답을 확인하기 위한 합성 데이터입니다.",
    createdAt: now,
    updatedAt: now,
  };

  const session: Session = {
    id: "sample-session",
    projectId: project.id,
    title: "로그인 리다이렉트 점검",
    startedAt: now,
    endedAt: now,
    recordingMode: "summary",
    llmProvider: "ollama",
    llmModel: "llama3.1:8b",
    storageLocation: "~/Mori/Records",
    selectedSourceIds: [],
    status: "recording",
  };

  return {
    project,
    session,
    sources: [
      sampleSource("sample-src-chat", "aiConversation", "리다이렉트 논의", "sample-evt-decision"),
      sampleSource("sample-src-note", "manualNote", "후속 메모", "sample-evt-risk"),
    ],
    events: [
      sampleEvent(
        "sample-evt-decision",
        "aiConversation",
        "리다이렉트 정책 결정",
        "결정: 세션이 만료되면 로그인 페이지로 리다이렉트한다. choose redirect over silent refresh.",
        "sample-src-chat",
        now,
      ),
      sampleEvent(
        "sample-evt-risk",
        "documentNote",
        "리다이렉트 후속 메모",
        "위험: 리다이렉트 루프 가능성이 있다. TODO: 로그인 후 원래 경로로 복원한다.",
        "sample-src-note",
        now,
      ),
      sampleEvent(
        "sample-evt-code",
        "fileCode",
        "auth/redirect.ts 수정",
        "Git diff covering 1 file (+12 / -3). Top changes: src/auth/redirect.ts +12/-3.",
        "sample-src-note",
        now,
      ),
    ],
  };
}

function sampleEvent(
  id: string,
  type: TimelineEvent["type"],
  title: string,
  summary: string,
  sourceRef: string,
  now: string,
): TimelineEvent {
  return {
    id,
    sessionId: "sample-session",
    projectId: "sample-project",
    start: now,
    type,
    title,
    summary,
    sourceRefs: [sourceRef],
    linkedIssueIds: [],
    linkedDecisionIds: [],
    relationshipIds: [],
    trustLevel: "verified",
    confidence: 0.9,
    createdBy: "import",
    userModified: false,
  };
}

function sampleSource(
  id: string,
  kind: SourceRef["kind"],
  title: string,
  eventId: string,
): SourceRef {
  return {
    id,
    sessionId: "sample-session",
    kind,
    title,
    detail: "합성 점검 소스",
    trustLevel: "verified",
    redactionStatus: "notNeeded",
    rawRetention: "summaryOnly",
    capturedAt: SAMPLE_NOW,
    relatedEventIds: [eventId],
  };
}

function emptyCounts(): QuickPassCapabilityCounts {
  return { issues: 0, decisions: 0, relationships: 0, nextActions: 0, highlights: 0 };
}

/**
 * Grade an analysis result into counts + a verdict. Pure — separated from the
 * network run so the gradation rules can be tested directly.
 */
export function gradeQuickPassResult(result: AnalysisResult): {
  verdict: Exclude<QuickPassCapabilityVerdict, "failed">;
  counts: QuickPassCapabilityCounts;
  hasSummary: boolean;
} {
  const counts: QuickPassCapabilityCounts = {
    issues: result.issues.length,
    decisions: result.decisions.length,
    relationships: result.relationships.length,
    nextActions: result.nextActions.length,
    highlights: result.summary.highlights.length,
  };
  const hasSummary = result.summary.sessionSummary.trim().length > 0;
  const producedStructure =
    hasSummary || counts.issues > 0 || counts.decisions > 0 || counts.nextActions > 0;
  return {
    verdict: producedStructure ? "ready" : "reachableNoStructure",
    counts,
    hasSummary,
  };
}

const NO_STRUCTURE_HINT =
  "모델이 응답은 했지만 이슈나 결정을 추출하지 못했습니다. 더 큰 모델을 쓰거나 타임아웃을 늘려보세요.";

function providerTimeout(settings: QuickPassAnalysisSettings): number {
  if (settings.provider === "openAiCompatible") return settings.openAiTimeoutMs;
  if (settings.provider === "ollama") return settings.ollamaTimeoutMs;
  return CAPABILITY_TEST_TIMEOUT_CAP_MS;
}

function describeVerdict(verdict: Exclude<QuickPassCapabilityVerdict, "failed">): string {
  return verdict === "ready"
    ? "구조화된 응답을 만들었습니다"
    : "연결됐지만 구조화된 결과가 없습니다";
}

/**
 * Map a provider error message onto an actionable Korean hint. The provider
 * errors are stable strings (`HTTP 404`, `response is not a JSON object`,
 * abort signals), so the mapping stays deterministic and testable.
 */
export function deriveFailureHint(
  message: string,
  settings: QuickPassAnalysisSettings,
  errorName?: string,
): string {
  const text = message.toLowerCase();
  const openAi = settings.provider === "openAiCompatible";
  if (errorName === "AbortError" || /abort|timed out|timeout/.test(text)) {
    return "응답이 제한 시간을 넘었습니다. 더 작은 모델을 쓰거나 타임아웃을 늘려보세요.";
  }
  if (/http 401|http 403|unauthor|forbidden/.test(text)) {
    return "인증이 필요합니다. API key를 확인하세요.";
  }
  if (/http 404|not found/.test(text)) {
    return openAi
      ? "모델 또는 경로를 찾을 수 없습니다. 모델 이름과 base URL의 /v1 경로를 확인하세요."
      : "모델을 찾을 수 없습니다. 모델 이름을 확인하거나 먼저 내려받으세요.";
  }
  if (/http 5\d\d/.test(text)) {
    return "엔드포인트 서버 오류입니다. 서버 로그를 확인하세요.";
  }
  if (/json|missing .*field|response is not/.test(text)) {
    return "모델이 JSON 형식 응답을 만들지 못했습니다. JSON을 지원하는 더 큰 모델을 사용해 보세요.";
  }
  if (/failed to fetch|networkerror|load failed|econnrefused|fetch/.test(text)) {
    return openAi
      ? "엔드포인트에 연결할 수 없습니다. base URL과 서버 상태, /v1 경로를 확인하세요."
      : "엔드포인트에 연결할 수 없습니다. 주소와 Ollama 실행 여부를 확인하세요.";
  }
  return "엔진 설정과 서버 상태를 확인한 뒤 다시 시도하세요.";
}

/**
 * Run a capability check against the currently-selected engine. Resolves the
 * provider from settings, runs the synthetic sample through `analyze()`, and
 * returns a graded report. Never throws — failures become a `failed` verdict
 * with an actionable hint.
 */
export async function checkQuickPassCapability(
  settings: QuickPassAnalysisSettings,
  options: { now?: string; fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): Promise<QuickPassCapabilityReport> {
  const timeoutMs = Math.min(
    options.timeoutMs ?? providerTimeout(settings),
    CAPABILITY_TEST_TIMEOUT_CAP_MS,
  );
  const config = buildProviderConfigFromSettings(settings, {
    ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
    timeoutMs,
  });
  const provider = resolveQuickPassProvider(config);
  const input = buildQuickPassSampleInput(options.now);

  try {
    const result = await provider.analyze(input);
    const graded = gradeQuickPassResult(result);
    return {
      verdict: graded.verdict,
      provider: settings.provider,
      providerLabel: provider.label,
      durationMs: result.durationMs,
      counts: graded.counts,
      hasSummary: graded.hasSummary,
      message: describeVerdict(graded.verdict),
      hint: graded.verdict === "reachableNoStructure" ? NO_STRUCTURE_HINT : null,
      error: null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "알 수 없는 오류";
    const errorName = error instanceof Error ? error.name : undefined;
    return {
      verdict: "failed",
      provider: settings.provider,
      providerLabel: provider.label,
      durationMs: 0,
      counts: emptyCounts(),
      hasSummary: false,
      message: "엔진 응답을 받지 못했습니다",
      hint: deriveFailureHint(message, settings, errorName),
      error: message,
    };
  }
}
