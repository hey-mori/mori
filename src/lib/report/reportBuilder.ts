import type {
  Decision,
  Issue,
  IssueStatus,
  MoriMockSession,
  NextAction,
  Priority,
  TimelineEvent,
} from "../../domain/types";
import { eventTypeLabels } from "../../domain/constants";
import { getReportEvidenceSummary } from "../sources/traceability";
import { isMemoryFlaggedForReview } from "../project-memory/projectMemoryResumePrompt";
import type { StoredAcceptedProjectMemory } from "../storage/storageTypes";

/**
 * Report builder = the right-side panel on the Reports page. It owns
 * three orthogonal axes (type / sections / privacy) and a pure Markdown
 * renderer so the UI can call one function and never touch raw template
 * strings.
 */

export type ReportType =
  | "personalRetrospective"
  | "teamUpdate"
  | "clientSafe"
  | "devHandoff"
  | "workLog";

export type ReportSectionId =
  | "summary"
  | "consolidatedMemory"
  | "timeline"
  | "decisions"
  | "issues"
  | "evidence"
  | "nextActions";

export type ReportFormat = "markdown" | "pdf" | "html";

export type ReportPrivacyOptions = {
  clientSafe: boolean;
  excludeRawTranscripts: boolean;
  excludeSourceDetails: boolean;
};

export const DEFAULT_PRIVACY: ReportPrivacyOptions = {
  clientSafe: false,
  excludeRawTranscripts: false,
  excludeSourceDetails: false,
};

export const DEFAULT_SECTIONS: ReadonlySet<ReportSectionId> = new Set<ReportSectionId>([
  "summary",
  "timeline",
  "decisions",
  "issues",
  "evidence",
  "nextActions",
]);

export const REPORT_TYPE_DEFINITIONS: Array<{
  id: ReportType;
  label: string;
  description: string;
  audience: string;
  defaultSections: ReportSectionId[];
  defaultPrivacy: ReportPrivacyOptions;
}> = [
  {
    id: "personalRetrospective",
    label: "Personal Retrospective",
    description: "내 작업을 되돌아보고 다음 세션 준비를 정리합니다.",
    audience: "본인 (내부 메모)",
    defaultSections: [
      "summary",
      "consolidatedMemory",
      "timeline",
      "decisions",
      "issues",
      "evidence",
      "nextActions",
    ],
    defaultPrivacy: { clientSafe: false, excludeRawTranscripts: false, excludeSourceDetails: false },
  },
  {
    id: "teamUpdate",
    label: "Team Update",
    description: "팀원 공유용 짧은 업데이트입니다. 다음 액션과 결정 위주.",
    audience: "팀원",
    defaultSections: ["summary", "decisions", "issues", "nextActions"],
    defaultPrivacy: { clientSafe: false, excludeRawTranscripts: true, excludeSourceDetails: false },
  },
  {
    id: "clientSafe",
    label: "Client-safe Report",
    description: "원본 대화 / 파일 경로 등을 제외한 클라이언트 친화 보고서.",
    audience: "외부 클라이언트",
    defaultSections: ["summary", "decisions", "nextActions"],
    defaultPrivacy: { clientSafe: true, excludeRawTranscripts: true, excludeSourceDetails: true },
  },
  {
    id: "devHandoff",
    label: "Dev Handoff",
    description: "다음 개발자가 작업을 이어가기 위한 컨텍스트.",
    audience: "다른 개발자",
    defaultSections: ["summary", "timeline", "decisions", "issues", "evidence", "nextActions"],
    defaultPrivacy: { clientSafe: false, excludeRawTranscripts: false, excludeSourceDetails: false },
  },
  {
    id: "workLog",
    label: "Work Log",
    description: "시간 순으로 무엇을 했는지 기록하는 짧은 로그.",
    audience: "본인 / 매니저",
    defaultSections: ["summary", "timeline", "nextActions"],
    defaultPrivacy: { clientSafe: false, excludeRawTranscripts: true, excludeSourceDetails: false },
  },
];

export const SECTION_DEFINITIONS: Array<{
  id: ReportSectionId;
  label: string;
  description: string;
}> = [
  { id: "summary", label: "Summary", description: "세션 한 줄 요약 + 카운트" },
  {
    id: "consolidatedMemory",
    label: "Accepted Memory",
    description: "검토·승인된 프로젝트 메모리 (audience 등급에 따라 노출)",
  },
  { id: "timeline", label: "Timeline", description: "주요 이벤트 시간 순 정리" },
  { id: "decisions", label: "Decisions", description: "결정과 이유" },
  { id: "issues", label: "Issues", description: "Open / In-progress 이슈" },
  { id: "evidence", label: "Evidence", description: "소스 / 출처 / 신뢰도" },
  { id: "nextActions", label: "Next Actions", description: "다음 액션 후보" },
];

export type ReportInput = {
  view: MoriMockSession;
  type: ReportType;
  sections: ReadonlySet<ReportSectionId>;
  privacy: ReportPrivacyOptions;
  generatedAt?: string;
  /** Override the resume prompt text (e.g. when analysis.summary.resumePrompt is available). */
  resumePromptOverride?: string;
  /**
   * Accepted project memory records (reviewed, durable). When the
   * `consolidatedMemory` section is enabled, records eligible for the
   * report's audience tier render as a dedicated section. Optional —
   * omitting it produces the live-session-only report, as before.
   */
  acceptedMemories?: readonly StoredAcceptedProjectMemory[];
};

export type ReportPayload = {
  markdown: string;
  /** Counts that drove the report content, useful for the UI status line. */
  counts: {
    events: number;
    issues: number;
    decisions: number;
    nextActions: number;
    sources: number;
  };
  dataBasis: string;
  warnings: string[];
};

/**
 * Render the current report selections into a Markdown document.
 */
export function buildReportMarkdown(input: ReportInput): ReportPayload {
  const { view, type, sections, privacy } = input;
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const typeDef = REPORT_TYPE_DEFINITIONS.find((entry) => entry.id === type) ?? REPORT_TYPE_DEFINITIONS[0];
  const summary = getReportEvidenceSummary(view);
  const warnings: string[] = [];

  if (view.sources.length === 0) {
    warnings.push("이 세션에는 가져온 소스가 없습니다. Report는 demo 또는 비어 있는 상태일 수 있습니다.");
  }
  if (privacy.clientSafe) {
    warnings.push("Client-safe 모드: 원본 텍스트 / 파일 경로 / 출처 상세는 제외됩니다.");
  }

  const lines: string[] = [];
  lines.push(`# ${view.session.title} · ${typeDef.label}`);
  lines.push("");
  lines.push(`- 대상: **${typeDef.audience}**`);
  lines.push(`- 생성 시각: ${formatIso(generatedAt)}`);
  lines.push(`- 세션 기간: ${formatIso(view.session.startedAt)} → ${formatIso(view.session.endedAt)}`);
  lines.push(`- Data basis: ${summary.dataBasis}`);
  if (privacy.clientSafe) {
    lines.push(`- Privacy: Client-safe mode`);
  }
  lines.push("");

  if (sections.has("summary")) {
    lines.push("## Summary");
    lines.push("");
    lines.push(view.summary.sessionSummary || "(세션 요약이 아직 생성되지 않았습니다.)");
    lines.push("");
    lines.push(`- 이벤트 ${view.events.length}건 · 이슈 ${view.issues.length}건 · 결정 ${view.decisions.length}건 · 다음 액션 ${view.nextActions.length}건`);
    lines.push("");
  }

  if (sections.has("consolidatedMemory")) {
    lines.push("## Accepted Project Memory");
    lines.push("");
    const accepted = input.acceptedMemories ?? [];
    const guidance = accepted.filter((memory) => isReportGuidanceMemory(memory, type));
    const flaggedCount = accepted.filter(isMemoryFlaggedForReview).length;
    if (accepted.length === 0) {
      lines.push("_검토된 프로젝트 메모리가 없습니다._");
    } else if (guidance.length === 0) {
      lines.push("_이 리포트 유형(audience)에 노출 가능한 검토된 메모리가 없습니다._");
    } else {
      for (const memory of sortAcceptedMemories(guidance)) {
        lines.push(renderAcceptedMemory(memory, privacy));
      }
    }
    if (flaggedCount > 0) {
      lines.push("");
      lines.push(
        `_재검토 필요: stale / contradicted / watching 메모리 ${flaggedCount}건은 가이드에서 제외했습니다._`,
      );
    }
    lines.push("");
  }

  if (sections.has("timeline")) {
    lines.push("## Timeline");
    lines.push("");
    const timelineEvents = orderEvents(view.events).slice(0, type === "workLog" ? 30 : 12);
    if (timelineEvents.length === 0) {
      lines.push("_타임라인 이벤트가 없습니다._");
    } else {
      for (const event of timelineEvents) {
        lines.push(renderTimelineLine(event, privacy));
      }
    }
    lines.push("");
  }

  if (sections.has("decisions")) {
    lines.push("## Decisions");
    lines.push("");
    if (view.decisions.length === 0) {
      lines.push("_기록된 결정이 없습니다._");
    } else {
      for (const decision of view.decisions) {
        lines.push(renderDecision(decision, privacy));
      }
    }
    lines.push("");
  }

  if (sections.has("issues")) {
    lines.push("## Issues");
    lines.push("");
    const issues = view.issues.filter((issue) => !privacy.clientSafe || issue.status !== "watching");
    if (issues.length === 0) {
      lines.push("_표시할 이슈가 없습니다._");
    } else {
      const byStatus = groupBy(issues, (issue) => issue.status);
      for (const status of ["open", "inProgress", "resolved", "watching"] as IssueStatus[]) {
        const bucket = byStatus.get(status);
        if (!bucket || bucket.length === 0) continue;
        lines.push(`### ${labelForStatus(status)} (${bucket.length})`);
        for (const issue of bucket) {
          lines.push(renderIssue(issue, privacy));
        }
      }
    }
    lines.push("");
  }

  if (sections.has("evidence")) {
    lines.push("## Evidence");
    lines.push("");
    if (view.sources.length === 0) {
      lines.push("_가져온 소스가 없습니다._");
    } else {
      lines.push(`- 총 소스 ${summary.sourceCount}건 · 이벤트 ${summary.eventCount}건 · 이슈 ${summary.issueCount}건 · 결정 ${summary.decisionCount}건`);
      const integrationLines = Object.entries(summary.integrationBreakdown)
        .map(([label, count]) => `${count}× ${label}`)
        .join(", ");
      if (integrationLines) lines.push(`- 통합: ${integrationLines}`);
      const trustLines = Object.entries(summary.trustBreakdown)
        .filter(([, count]) => count > 0)
        .map(([level, count]) => `${count}× ${level}`)
        .join(", ");
      if (trustLines) lines.push(`- 신뢰도: ${trustLines}`);
      if (!privacy.excludeSourceDetails && !privacy.clientSafe) {
        lines.push("");
        lines.push("**소스 목록**");
        for (const source of view.sources) {
          const captured = formatIso(source.capturedAt);
          lines.push(`- *${source.kind}* · ${source.title} — ${captured}`);
        }
      } else {
        lines.push("");
        lines.push("_Client-safe 모드: 소스 제목 및 경로는 제외되었습니다._");
      }
    }
    lines.push("");
  }

  if (sections.has("nextActions")) {
    lines.push("## Next Actions");
    lines.push("");
    if (view.nextActions.length === 0) {
      lines.push("_다음 액션이 없습니다._");
    } else {
      const ordered = sortByPriority(view.nextActions);
      for (const action of ordered) {
        lines.push(renderNextAction(action, view, privacy));
      }
    }
    lines.push("");
  }

  if (input.resumePromptOverride && type !== "clientSafe") {
    lines.push("## Resume Prompt");
    lines.push("");
    lines.push("```text");
    lines.push(input.resumePromptOverride.trim());
    lines.push("```");
    lines.push("");
  }

  if (warnings.length > 0) {
    lines.push("---");
    lines.push("");
    lines.push("**Notes:**");
    for (const warning of warnings) {
      lines.push(`- ${warning}`);
    }
  }

  return {
    markdown: lines.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n",
    counts: {
      events: view.events.length,
      issues: view.issues.length,
      decisions: view.decisions.length,
      nextActions: view.nextActions.length,
      sources: view.sources.length,
    },
    dataBasis: summary.dataBasis,
    warnings,
  };
}

function renderTimelineLine(event: TimelineEvent, privacy: ReportPrivacyOptions): string {
  const time = formatIso(event.start);
  const typeLabel = eventTypeLabels[event.type] ?? event.type;
  const title = event.title;
  if (privacy.clientSafe) {
    return `- \`${time}\` **${title}** _(${typeLabel})_`;
  }
  const summary = (event.summary || "").trim();
  return `- \`${time}\` **${title}** _(${typeLabel})_${summary ? ` — ${truncate(summary, 220)}` : ""}`;
}

function renderDecision(decision: Decision, privacy: ReportPrivacyOptions): string {
  const importance = decision.importance;
  const confirmed = decision.confirmed ? " · ✅ Confirmed" : "";
  const head = `- **${decision.title}** _(중요도 ${importance}${confirmed})_`;
  if (privacy.clientSafe) return head;
  const rationale = decision.rationale ? `\n  - 이유: ${truncate(decision.rationale, 240)}` : "";
  const rejected = decision.rejectedOptions.length
    ? `\n  - 폐기 대안: ${decision.rejectedOptions.join(", ")}`
    : "";
  const impact = decision.impact.length
    ? `\n  - 영향: ${decision.impact.join(", ")}`
    : "";
  return `${head}${rationale}${rejected}${impact}`;
}

// ─── accepted-memory report inclusion policy ──────────────────────────

/**
 * Audience tier of each report type. A report may carry an accepted
 * memory only when the memory's `reportEligibility` rank is at least
 * the report's tier — so a `personal`-only memory never reaches a team
 * or client-facing report.
 */
const REPORT_AUDIENCE_TIER: Record<ReportType, 1 | 2 | 3> = {
  personalRetrospective: 1,
  workLog: 1,
  teamUpdate: 2,
  devHandoff: 2,
  clientSafe: 3,
};

const MEMORY_REPORT_ELIGIBILITY_RANK: Record<
  StoredAcceptedProjectMemory["reportEligibility"],
  0 | 1 | 2 | 3
> = { excluded: 0, personal: 1, team: 2, clientSafe: 3 };

const MEMORY_IMPORTANCE_WEIGHT: Record<"high" | "medium" | "low", number> = {
  high: 0,
  medium: 1,
  low: 2,
};

const MEMORY_KIND_LABEL: Record<StoredAcceptedProjectMemory["kind"], string> = {
  promotedDecision: "결정",
  recurringIssue: "반복 이슈",
  keyEvidence: "근거",
  unresolvedRisk: "리스크",
  contradiction: "상충",
  staleMemory: "오래된 메모리",
  nextSessionRecommendation: "다음 세션",
};

/**
 * Reports inclusion policy. An accepted memory appears as report
 * guidance only when it is durable (`accepted` / `edited`), not a
 * `staleMemory` / `contradiction` kind, and its `reportEligibility`
 * rank meets the report type's audience tier. Pure predicate —
 * exported so the UI and tests reuse the exact same rule.
 */
export function isReportGuidanceMemory(
  memory: StoredAcceptedProjectMemory,
  type: ReportType,
): boolean {
  if (memory.status !== "accepted" && memory.status !== "edited") return false;
  if (memory.kind === "staleMemory" || memory.kind === "contradiction") return false;
  const rank = MEMORY_REPORT_ELIGIBILITY_RANK[memory.reportEligibility];
  if (rank === 0) return false;
  return rank >= REPORT_AUDIENCE_TIER[type];
}

function sortAcceptedMemories(
  memories: StoredAcceptedProjectMemory[],
): StoredAcceptedProjectMemory[] {
  return [...memories].sort(
    (a, b) => MEMORY_IMPORTANCE_WEIGHT[a.importance] - MEMORY_IMPORTANCE_WEIGHT[b.importance],
  );
}

function renderAcceptedMemory(
  memory: StoredAcceptedProjectMemory,
  privacy: ReportPrivacyOptions,
): string {
  const kindLabel = MEMORY_KIND_LABEL[memory.kind] ?? memory.kind;
  const head = `- **${memory.title}** _(${kindLabel} · 중요도 ${memory.importance} · 신뢰도 ${memory.confidence.label})_`;
  if (privacy.clientSafe) return head;
  const summary = memory.summary ? `\n  - ${truncate(memory.summary, 240)}` : "";
  const sessions = memory.sourceSessionIds.length
    ? `\n  - 근거 세션 ${memory.sourceSessionIds.length}건`
    : "";
  return `${head}${summary}${sessions}`;
}

function renderIssue(issue: Issue, privacy: ReportPrivacyOptions): string {
  const head = `- **${issue.title}** _(우선순위 ${issue.priority})_`;
  if (privacy.clientSafe) return head;
  const description = issue.description ? `\n  - ${truncate(issue.description, 240)}` : "";
  const next = issue.suggestedNextAction ? `\n  - 다음 액션 후보: ${issue.suggestedNextAction}` : "";
  const conf =
    issue.trustLevel === "inferred"
      ? `\n  - 신뢰도: inferred ${Math.round(issue.confidence * 100)}%`
      : "";
  return `${head}${description}${next}${conf}`;
}

function renderNextAction(
  action: NextAction,
  view: MoriMockSession,
  privacy: ReportPrivacyOptions,
): string {
  const head = `- **${action.title}** _(우선순위 ${action.priority})_`;
  if (privacy.clientSafe) return head;
  const relatedIssue = view.issues.find((issue) => action.relatedIssueIds.includes(issue.id));
  const relatedEvent = view.events.find((event) => action.relatedEventIds.includes(event.id));
  const issueLine = relatedIssue ? `\n  - 관련 이슈: ${relatedIssue.title}` : "";
  const eventLine = relatedEvent ? `\n  - 관련 이벤트: ${relatedEvent.title}` : "";
  return `${head}${issueLine}${eventLine}`;
}

function labelForStatus(status: IssueStatus): string {
  if (status === "open") return "Open";
  if (status === "inProgress") return "In Progress";
  if (status === "resolved") return "Resolved";
  return "Watching";
}

function orderEvents(events: TimelineEvent[]): TimelineEvent[] {
  return [...events].sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
}

function sortByPriority<T extends { priority: Priority }>(items: T[]): T[] {
  const weight: Record<Priority, number> = { high: 0, medium: 1, low: 2 };
  return [...items].sort((a, b) => weight[a.priority] - weight[b.priority]);
}

function groupBy<T, K>(items: T[], key: (item: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const item of items) {
    const value = key(item);
    const bucket = map.get(value);
    if (bucket) bucket.push(item);
    else map.set(value, [item]);
  }
  return map;
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}

function formatIso(iso: string): string {
  try {
    return new Date(iso).toISOString().slice(0, 19).replace("T", " ");
  } catch {
    return iso;
  }
}

/**
 * Resolve the report type definition by id (or fall back to the first entry).
 */
export function getReportTypeDefinition(type: ReportType) {
  return REPORT_TYPE_DEFINITIONS.find((entry) => entry.id === type) ?? REPORT_TYPE_DEFINITIONS[0];
}

/**
 * Pure helper for toggle handlers — keeps Set immutability in one place.
 */
export function toggleSection(
  sections: ReadonlySet<ReportSectionId>,
  id: ReportSectionId,
): Set<ReportSectionId> {
  const next = new Set(sections);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}
