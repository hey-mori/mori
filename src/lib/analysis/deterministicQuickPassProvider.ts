import type { Priority, TimelineEvent } from "../../domain/types";
import {
  createRunId,
  materializeDecision,
  materializeIssue,
  materializeNextAction,
  materializeRelationship,
} from "./analysisMapper";
import type {
  AnalysisDecisionCandidate,
  AnalysisExtraction,
  AnalysisIssueCandidate,
  AnalysisNextActionCandidate,
  AnalysisRelationshipCandidate,
  AnalysisSummary,
  AnalysisInput,
  AnalysisProvider,
  AnalysisResult,
} from "./analysisTypes";

const PROVIDER_NAME = "deterministic-heuristic-v1" as const;
const PROVIDER_LABEL = "규칙 기반 Quick Pass";

const ISSUE_PATTERNS: Array<{ regex: RegExp; priority: Priority }> = [
  { regex: /(위험|risk|warning)/i, priority: "high" },
  { regex: /(error|fail(?:ed)?|broken|crash)/i, priority: "high" },
  { regex: /(과도|too\s+much|overkill)/i, priority: "medium" },
  { regex: /(필요\s*(?:한|함)?|need(?:s|ed)?|required|missing)/i, priority: "medium" },
  { regex: /(미정|undecided|unclear|unresolved)/i, priority: "medium" },
  { regex: /(todo|fixme)/i, priority: "low" },
  { regex: /(fix\b)/i, priority: "medium" },
];

const DECISION_PATTERNS: RegExp[] = [
  /(결정|결정함|결정했|결정한다)/i,
  /(채택|선택)/i,
  /(우선|priority\s+is|prefer)/i,
  /default(?:s)?\s+to/i,
  /(choose|chose|chosen)/i,
  /(decid(?:e|ed|ing)|agreed\s+on)/i,
];

/**
 * Upper bound on heuristic issue candidates. The keyword patterns are broad
 * (need / fix / error), so a long session can match dozens of low-value lines,
 * flooding the board and the LLM floor. We keep the highest-priority ones and
 * note how many were dropped, mirroring the prompt's "a few high-quality over
 * many noisy" rule. Decisions use tighter patterns and are not capped.
 */
const MAX_DETERMINISTIC_ISSUES = 20;
const ISSUE_PRIORITY_RANK: Record<Priority, number> = { high: 0, medium: 1, low: 2 };

function capIssuesByPriority(issues: AnalysisIssueCandidate[]): AnalysisIssueCandidate[] {
  if (issues.length <= MAX_DETERMINISTIC_ISSUES) return issues;
  // Stable sort keeps same-priority candidates in their original (chronological)
  // order, so the cap takes the highest-priority, earliest matches.
  return [...issues]
    .sort((a, b) => ISSUE_PRIORITY_RANK[a.priority] - ISSUE_PRIORITY_RANK[b.priority])
    .slice(0, MAX_DETERMINISTIC_ISSUES);
}

export class DeterministicQuickPassProvider implements AnalysisProvider {
  readonly name = PROVIDER_NAME;
  readonly label = PROVIDER_LABEL;
  readonly requiresNetwork = false;

  async analyze(input: AnalysisInput): Promise<AnalysisResult> {
    const startedAt = Date.now();
    const generatedAt = input.now ?? new Date().toISOString();
    const runId = createRunId(input, generatedAt);

    const extraction = extractFromInput(input);
    const ctx = {
      runId,
      projectId: input.project.id,
      sessionId: input.session.id,
      generatedAt,
    };

    const issues = extraction.issues.map((candidate, index) => materializeIssue(candidate, index, ctx));
    const decisions = extraction.decisions.map((candidate, index) => materializeDecision(candidate, index, ctx));

    const linkedRelationships: AnalysisRelationshipCandidate[] = [
      ...extraction.relationships,
      ...buildIssueEventRelationships(extraction.issues, issues),
      ...buildDecisionEventRelationships(extraction.decisions, decisions),
    ];

    const relationships = linkedRelationships.map((candidate, index) =>
      materializeRelationship(candidate, index, ctx),
    );

    const nextActions = extraction.nextActions.map((candidate, index) =>
      materializeNextAction(
        {
          ...candidate,
          relatedIssueIds: candidate.relatedIssueIds
            .map((issueIndex) => issues[Number(issueIndex)]?.id)
            .filter((value): value is string => Boolean(value)),
        },
        index,
        ctx,
      ),
    );

    const durationMs = Date.now() - startedAt;
    const confidence = extraction.confidence;

    return {
      runId,
      providerName: PROVIDER_NAME,
      providerLabel: PROVIDER_LABEL,
      sessionId: input.session.id,
      projectId: input.project.id,
      generatedAt,
      durationMs,
      inputEventCount: input.events.length,
      inputSourceCount: input.sources.length,
      summary: extraction.summary,
      issues,
      decisions,
      relationships,
      nextActions,
      rendered: {
        summary: {
          id: `summary-${runId}`,
          sessionId: input.session.id,
          sessionSummary: extraction.summary.sessionSummary,
          resumePrompt: extraction.summary.resumePrompt,
          reportMarkdown: "",
          nextActionIds: nextActions.map((action) => action.id),
          generatedAt,
        },
      },
      confidence,
      notes: extraction.notes,
    };
  }
}

export function createDeterministicQuickPassProvider(): DeterministicQuickPassProvider {
  return new DeterministicQuickPassProvider();
}

export function extractFromInput(input: AnalysisInput): AnalysisExtraction {
  const issueCandidates: AnalysisIssueCandidate[] = [];
  const decisionCandidates: AnalysisDecisionCandidate[] = [];
  const nextActionCandidates: AnalysisNextActionCandidate[] = [];
  const eventById = new Map(input.events.map((event) => [event.id, event] as const));
  const sourceById = new Map(input.sources.map((source) => [source.id, source] as const));
  const highlights: string[] = [];
  const notes: string[] = [];

  input.events.forEach((event) => {
    // Tool events are machine output (tool calls, results, errors), not human
    // or assistant reasoning. They are where the heuristic manufactured noise
    // ("↳ 도구 결과: warning…" became an issue), so they are excluded from
    // issue / decision / highlight extraction. Real issues and decisions are
    // stated in conversation turns, which keep their actor.
    if (event.actor === "tool") return;

    const text = composeEventText(event);
    const tokens = text.split(/[.!?\n]+/).map((sentence) => sentence.trim()).filter(Boolean);
    tokens.forEach((sentence) => {
      // Skip quoted tool output / error envelopes / code fragments even inside
      // a conversation turn — these are not stated issues or decisions.
      if (isNoiseSentence(sentence)) return;

      const issueMatch = matchIssue(sentence);
      if (issueMatch) {
        issueCandidates.push(buildIssueCandidate(sentence, event, issueMatch.priority));
      }

      const decisionMatched = matchDecision(sentence);
      if (decisionMatched) {
        decisionCandidates.push(buildDecisionCandidate(sentence, event));
      }
    });

    if (event.summary.length > 12 && highlights.length < 6 && !isNoiseSentence(event.summary)) {
      highlights.push(`${formatClock(event.start)} ${event.title}: ${truncate(event.summary, 110)}`);
    }
  });

  // Deduplicate issue candidates by title to avoid noise from repeated phrases,
  // then cap to the highest-priority few so a long session does not flood.
  const allIssues = dedupeByTitle(issueCandidates);
  const dedupedIssues = capIssuesByPriority(allIssues);
  const dedupedDecisions = dedupeByTitle(decisionCandidates);

  // Link issues back to source ids when an event has a source ref.
  dedupedIssues.forEach((issue) => {
    const eventIds = issue.sourceEventIds;
    const relatedSources = new Set<string>();
    eventIds.forEach((id) => {
      const event = eventById.get(id);
      event?.sourceRefs.forEach((sourceId) => {
        if (sourceById.has(sourceId)) relatedSources.add(sourceId);
      });
    });
    issue.relatedFileIds = Array.from(relatedSources);
  });

  // Decision -> source linkage similarly.
  dedupedDecisions.forEach((decision) => {
    const relatedSources = new Set<string>();
    decision.sourceEventIds.forEach((id) => {
      const event = eventById.get(id);
      event?.sourceRefs.forEach((sourceId) => {
        if (sourceById.has(sourceId)) relatedSources.add(sourceId);
      });
    });
    decision.relatedSourceIds = Array.from(relatedSources);
  });

  // Build next actions from unresolved issues only.
  dedupedIssues.forEach((issue, index) => {
    if (issue.status === "resolved") return;
    nextActionCandidates.push({
      title: issue.suggestedNextAction || `해결: ${issue.title}`,
      priority: issue.priority,
      relatedIssueIds: [String(index)],
      relatedEventIds: issue.sourceEventIds,
    });
  });

  const summary = buildSummary(input, dedupedIssues, dedupedDecisions, highlights);
  const confidence = computeConfidence(input.events.length, dedupedIssues.length, dedupedDecisions.length);

  if (!input.events.length) {
    notes.push("분석할 가져온 이벤트가 없습니다. 메모·URL·AI 대화를 먼저 추가하세요.");
  }
  if (input.events.length && !dedupedIssues.length && !dedupedDecisions.length) {
    notes.push("규칙 기반에서 이슈·결정 키워드를 찾지 못했습니다. 더 풍부한 결과는 로컬 LLM을 사용하세요.");
  }
  if (allIssues.length > dedupedIssues.length) {
    notes.push(
      `이슈 후보 ${allIssues.length}개 중 우선순위 상위 ${dedupedIssues.length}개만 유지했습니다.`,
    );
  }

  return {
    issues: dedupedIssues,
    decisions: dedupedDecisions,
    nextActions: nextActionCandidates,
    relationships: [],
    summary,
    confidence,
    notes,
  };
}

function composeEventText(event: TimelineEvent): string {
  return [event.title, event.summary].filter(Boolean).join(". ");
}

// Machine output, error envelopes, and code fragments that the keyword
// matcher would otherwise mistake for issues or decisions.
const NOISE_PATTERNS: RegExp[] = [
  /↳\s*도구\s*(결과|오류)/,
  /tool[_\s]?(use[_\s]?error|result)/i,
  /<\/?tool[_a-z]*/i,
  /\b[A-Z][A-Z0-9]*_[A-Z0-9_]*ERROR\b/, // GEMINI_API_ERROR, TOOL_USE_ERROR
  /\bHTTP\s*\d{3}\b/i,
  /\(\d{3}\)\s*(not found|error|unauthorized|forbidden|bad request)/i,
  /\btraceback\b|\bstderr\b|\bstdout\b/i,
  /^\s*at\s+\S+.*:\d+/, // stack frame
  /\/\*|\*\//, // block-comment / code fragment
  /^\s*(const|let|var|function|class|import|export|return)\b.*[={(]/,
];

function isNoiseSentence(sentence: string): boolean {
  return NOISE_PATTERNS.some((pattern) => pattern.test(sentence));
}

function matchIssue(sentence: string): { priority: Priority } | null {
  for (const pattern of ISSUE_PATTERNS) {
    if (pattern.regex.test(sentence)) {
      return { priority: pattern.priority };
    }
  }
  return null;
}

function matchDecision(sentence: string): boolean {
  return DECISION_PATTERNS.some((pattern) => pattern.test(sentence));
}

function buildIssueCandidate(sentence: string, event: TimelineEvent, priority: Priority): AnalysisIssueCandidate {
  const title = toTitle(sentence);
  return {
    title,
    description: truncate(sentence, 240),
    status: "open",
    priority,
    sourceEventIds: [event.id],
    relatedDecisionIds: [],
    relatedFileIds: [],
    suggestedNextAction: `확인 또는 해결: ${title}`,
    confidence: 0.55,
    trustLevel: "inferred",
    rationale: `이벤트 ${event.id}에서 이슈 키워드 매칭`,
  };
}

function buildDecisionCandidate(sentence: string, event: TimelineEvent): AnalysisDecisionCandidate {
  const title = toTitle(sentence);
  return {
    title,
    decision: truncate(sentence, 240),
    rationale: `이벤트 ${event.id} 규칙 기반 매칭: "${truncate(sentence, 120)}"`,
    rejectedOptions: [],
    impact: [],
    sourceEventIds: [event.id],
    relatedIssueIds: [],
    relatedSourceIds: [],
    importance: "medium",
    trustLevel: "inferred",
    confirmed: false,
  };
}

function buildIssueEventRelationships(
  candidates: AnalysisIssueCandidate[],
  materialized: Array<{ id: string }>,
): AnalysisRelationshipCandidate[] {
  const relationships: AnalysisRelationshipCandidate[] = [];
  candidates.forEach((candidate, index) => {
    const issueId = materialized[index]?.id;
    if (!issueId) return;
    candidate.sourceEventIds.forEach((eventId) => {
      relationships.push({
        fromId: eventId,
        fromType: "event",
        toId: issueId,
        toType: "issue",
        type: "createdIssue",
        confidence: 0.5,
        reason: "규칙 기반이 이벤트를 추출된 이슈에 연결했습니다.",
      });
    });
  });
  return relationships;
}

function buildDecisionEventRelationships(
  candidates: AnalysisDecisionCandidate[],
  materialized: Array<{ id: string }>,
): AnalysisRelationshipCandidate[] {
  const relationships: AnalysisRelationshipCandidate[] = [];
  candidates.forEach((candidate, index) => {
    const decisionId = materialized[index]?.id;
    if (!decisionId) return;
    candidate.sourceEventIds.forEach((eventId) => {
      relationships.push({
        fromId: eventId,
        fromType: "event",
        toId: decisionId,
        toType: "decision",
        type: "influencedDecision",
        confidence: 0.5,
        reason: "규칙 기반이 이벤트를 추출된 결정에 연결했습니다.",
      });
    });
  });
  return relationships;
}

function buildSummary(
  input: AnalysisInput,
  issues: AnalysisIssueCandidate[],
  decisions: AnalysisDecisionCandidate[],
  highlights: string[],
): AnalysisSummary {
  const eventLine = input.events.length
    ? `가져온 이벤트 ${input.events.length}개 · 소스 ${input.sources.length}개.`
    : "아직 가져온 이벤트가 없습니다.";
  const issueLine = issues.length
    ? `규칙 기반에서 이슈 후보 ${issues.length}개를 찾았습니다.`
    : "규칙 기반에서 찾은 이슈 후보 없음.";
  const decisionLine = decisions.length
    ? `결정 후보 ${decisions.length}개를 찾았습니다.`
    : "규칙 기반에서 찾은 결정 후보 없음.";

  const sessionSummary = [eventLine, issueLine, decisionLine].join(" ");
  const resumePrompt = buildResumePromptText(input, issues, decisions, highlights);

  return { sessionSummary, resumePrompt, highlights };
}

function buildResumePromptText(
  input: AnalysisInput,
  issues: AnalysisIssueCandidate[],
  decisions: AnalysisDecisionCandidate[],
  highlights: string[],
): string {
  const lines: string[] = [];
  lines.push(`Mori 세션 "${input.session.title}"을(를) 이어서 진행합니다.`);
  lines.push("");
  lines.push("하이라이트:");
  if (highlights.length) {
    highlights.forEach((line) => lines.push(`- ${line}`));
  } else {
    lines.push("- (아직 없음)");
  }
  lines.push("");
  lines.push("해결할 이슈:");
  if (issues.length) {
    issues.slice(0, 6).forEach((issue, index) => {
      lines.push(`${index + 1}. ${issue.title} (${issue.priority})`);
    });
  } else {
    lines.push("- (추출된 항목 없음)");
  }
  lines.push("");
  lines.push("반영할 최근 결정:");
  if (decisions.length) {
    decisions.slice(0, 6).forEach((decision) => lines.push(`- ${decision.title}`));
  } else {
    lines.push("- (추출된 항목 없음)");
  }
  lines.push("");
  lines.push(`제공자: ${PROVIDER_LABEL}. 실제 로컬 LLM 분석 전까지 모든 결과는 추정으로 간주하세요.`);
  return lines.join("\n");
}

function computeConfidence(eventCount: number, issueCount: number, decisionCount: number): number {
  if (!eventCount) return 0;
  const coverage = Math.min(1, (issueCount + decisionCount) / Math.max(1, eventCount));
  return Math.min(0.7, 0.4 + coverage * 0.3);
}

function dedupeByTitle<T extends { title: string; sourceEventIds: string[] }>(items: T[]): T[] {
  const map = new Map<string, T>();
  items.forEach((item) => {
    const key = item.title.trim().toLowerCase();
    if (!key) return;
    const existing = map.get(key);
    if (existing) {
      const merged = new Set([...existing.sourceEventIds, ...item.sourceEventIds]);
      existing.sourceEventIds = Array.from(merged);
    } else {
      map.set(key, item);
    }
  });
  return Array.from(map.values());
}

function toTitle(sentence: string): string {
  const cleaned = sentence.replace(/\s+/g, " ").trim();
  if (cleaned.length <= 80) return cleaned;
  const truncated = cleaned.slice(0, 77);
  return `${truncated}...`;
}

function truncate(text: string, max: number): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (cleaned.length <= max) return cleaned;
  return `${cleaned.slice(0, max - 3)}...`;
}

function formatClock(iso: string): string {
  try {
    const date = new Date(iso);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}
