/**
 * Mori Companion Signals.
 *
 * The Companion Layer is a local, evidence-based assistance layer — not a
 * chatbot, not a character, not a background watcher. It derives a small set
 * of prioritised "signals" from data the user has *already* imported and
 * reviewed (timeline events, issues, decisions, next actions) plus honest
 * session state (demo vs real, whether Quick Pass has run).
 *
 * Hard rules this module keeps:
 *  - Signals are derived only from already-present session data — Mori never
 *    watches the user or reads anything in the background.
 *  - No raw transcript / source body text ever enters a signal; only counts,
 *    titles already on structured records, and ids.
 *  - Inferred vs verified is distinguished (`basis`).
 *  - Demo vs real session is distinguished (`audience`).
 *  - Low-value noise is dropped; the visible set is capped and prioritised.
 *
 * This module is pure and synchronous so it is fully testable and never
 * triggers a write.
 */
import type {
  Decision,
  Issue,
  NextAction,
  TimelineEvent,
  ViewKey,
} from "../../domain/types";
import {
  getProductCompanionStateTone,
  type ProductStateTone,
} from "../product-state/productState";

export type CompanionSignalType =
  | "demo_mode_notice"
  | "real_session_gap"
  | "import_ready"
  | "weak_evidence"
  | "needs_review"
  | "unresolved_issue"
  | "important_decision"
  | "stale_memory"
  | "suggested_next_action"
  | "ready_to_report"
  | "ready_to_resume";

/**
 * Ordered most → least urgent. These four tiers are a subset of the shared
 * `ProductCompanionState` vocabulary — `companionSeverityTone` derives the
 * badge / dot tone from the product-state model rather than a local map.
 */
export type CompanionSignalSeverity = "risk" | "review" | "suggestion" | "info";

/** What the signal is grounded in — surfaced so the user can judge it. */
export type CompanionSignalBasis = "verified" | "inferred" | "mixed" | "state";

export type CompanionSignal = {
  id: string;
  type: CompanionSignalType;
  severity: CompanionSignalSeverity;
  /** Short calm headline. */
  title: string;
  /** One practical sentence — what it is and why it is worth a look. */
  message: string;
  /** The Mori surface this signal is about. */
  sourceSurface: ViewKey;
  /** Ids of the structured records behind the signal (issues, decisions …). */
  linkedItemIds: string[];
  /** Originating timeline-event ids, when the signal traces to evidence. */
  evidenceRefs: string[];
  /** Whether the signal rests on verified data, inference, or session state. */
  basis: CompanionSignalBasis;
  /** Calm, practical action label. */
  actionLabel: string;
  /** Where the action navigates, or null for a notice with no destination. */
  destination: ViewKey | null;
  /** Which session kind the signal is meaningful for. */
  audience: "demo" | "real" | "both";
};

export type CompanionSignalInput = {
  sessionMode: "demo" | "draft";
  events: TimelineEvent[];
  issues: Issue[];
  decisions: Decision[];
  nextActions: NextAction[];
  /** Whether a real Quick Pass analysis has run for this session. */
  hasAnalysis: boolean;
  /** Number of explicitly imported sources in the active session. */
  importCount: number;
  /**
   * Count of accepted project memories in the lifecycle "attention" group
   * (stale / contradicted) — memory that has been superseded by newer work
   * and is worth a review. Optional; omit when memory has not been loaded.
   */
  attentionMemoryCount?: number;
};

/** Inferred issues below this confidence are flagged as weak evidence. */
export const WEAK_EVIDENCE_CONFIDENCE_THRESHOLD = 0.6;

/** Never show more than this many signals — the card stays calm, not noisy. */
export const MAX_COMPANION_SIGNALS = 5;

const SEVERITY_RANK: Record<CompanionSignalSeverity, number> = {
  risk: 0,
  review: 1,
  suggestion: 2,
  info: 3,
};

/** Numeric rank for a severity — lower is more urgent. */
export function companionSeverityRank(severity: CompanionSignalSeverity): number {
  return SEVERITY_RANK[severity];
}

/** Calm Korean label for a companion-signal severity tier. */
export function describeCompanionSeverity(
  severity: CompanionSignalSeverity,
): string {
  switch (severity) {
    case "risk":
      return "주의";
    case "review":
      return "검토 필요";
    case "suggestion":
      return "제안";
    case "info":
      return "정보";
    default:
      return severity;
  }
}

/** Calm Korean label for what a signal is grounded in. */
export function describeCompanionBasis(basis: CompanionSignalBasis): string {
  switch (basis) {
    case "verified":
      return "확인된 데이터";
    case "inferred":
      return "추론 기반 · 확인 필요";
    case "mixed":
      return "검토 필요";
    case "state":
      return "세션 상태";
    default:
      return basis;
  }
}

/**
 * Semantic tone for a companion-signal severity, drawn from the shared
 * product-state companion vocabulary so the Companion surfaces use the
 * same tone scale as `MoriStatusBadge` and the `data-mori-tone` tokens.
 */
export function companionSeverityTone(
  severity: CompanionSignalSeverity,
): ProductStateTone {
  return getProductCompanionStateTone(severity);
}

/**
 * Collect every applicable companion signal for the active session,
 * unsorted and uncapped. Pure: no I/O, no writes, no clock dependence
 * beyond the caller's data.
 */
function collectCompanionSignals(input: CompanionSignalInput): CompanionSignal[] {
  const signals: CompanionSignal[] = [];
  const isDemo = input.sessionMode === "demo";

  // ── Honest session-state signals ────────────────────────────────────────
  if (isDemo) {
    signals.push({
      id: "companion-demo-notice",
      type: "demo_mode_notice",
      severity: "info",
      title: "데모 세션을 보고 있어요",
      message:
        "지금 신호는 데모 데이터 기준입니다. 실제 세션을 시작하면 직접 가져온 자료로 신호가 만들어집니다.",
      sourceSurface: "start",
      linkedItemIds: [],
      evidenceRefs: [],
      basis: "state",
      actionLabel: "세션 시작",
      destination: "start",
      audience: "demo",
    });
  } else if (input.importCount === 0) {
    signals.push({
      id: "companion-real-session-gap",
      type: "real_session_gap",
      severity: "suggestion",
      title: "아직 가져온 자료가 없어요",
      message:
        "이 세션에는 가져온 소스가 없습니다. Evidence Hub에서 자료를 추가하면 Mori가 흐름을 정리해 드립니다.",
      sourceSurface: "evidence",
      linkedItemIds: [],
      evidenceRefs: [],
      basis: "state",
      actionLabel: "Evidence 열기",
      destination: "evidence",
      audience: "real",
    });
  } else if (!input.hasAnalysis) {
    // Imports exist but Quick Pass has not run — without this the companion
    // is silent at exactly the point the user needs the next step.
    signals.push({
      id: "companion-import-ready",
      type: "import_ready",
      severity: "suggestion",
      title: "Quick Pass를 실행할 준비가 되었어요",
      message:
        "가져온 소스가 있습니다. Quick Pass를 실행하면 이슈 · 결정 · 다음 액션으로 정리됩니다.",
      sourceSurface: "evidence",
      linkedItemIds: [],
      evidenceRefs: [],
      basis: "state",
      actionLabel: "Quick Pass 실행",
      destination: "evidence",
      audience: "real",
    });
  }

  // ── Weak evidence — low-confidence inferred issues (a risk signal) ───────
  const weakIssues = input.issues.filter(
    (issue) =>
      issue.trustLevel === "inferred" &&
      issue.confidence < WEAK_EVIDENCE_CONFIDENCE_THRESHOLD,
  );
  if (weakIssues.length > 0) {
    signals.push({
      id: "companion-weak-evidence",
      type: "weak_evidence",
      severity: "risk",
      title: `근거가 약한 이슈가 ${weakIssues.length}개 있어요`,
      message:
        "추론 기반이고 신뢰도가 낮은 이슈입니다. 원본 근거를 확인해 유지할지 정리할지 결정하세요.",
      sourceSurface: "review",
      linkedItemIds: weakIssues.map((issue) => issue.id),
      evidenceRefs: uniqueIds(weakIssues.flatMap((issue) => issue.sourceEventIds)),
      basis: "inferred",
      actionLabel: "Review에서 확인",
      destination: "review",
      audience: "real",
    });
  }

  // ── Unconfirmed decisions waiting for review ────────────────────────────
  const unconfirmed = input.decisions.filter((decision) => !decision.confirmed);
  if (unconfirmed.length > 0) {
    signals.push({
      id: "companion-needs-review",
      type: "needs_review",
      severity: "review",
      title: `검토할 결정 후보가 ${unconfirmed.length}개 있어요`,
      message:
        "아직 확정되지 않은 결정입니다. 근거와 함께 확인하고 확정하거나 보류하세요.",
      sourceSurface: "review",
      linkedItemIds: unconfirmed.map((decision) => decision.id),
      evidenceRefs: uniqueIds(unconfirmed.flatMap((decision) => decision.sourceEventIds)),
      basis: "mixed",
      actionLabel: "결정 검토",
      destination: "review",
      audience: "real",
    });
  }

  // ── Open (unresolved) issues ────────────────────────────────────────────
  const openIssues = input.issues.filter((issue) => issue.status === "open");
  if (openIssues.length > 0) {
    signals.push({
      id: "companion-unresolved-issue",
      type: "unresolved_issue",
      severity: "review",
      title: `미해결 이슈가 ${openIssues.length}개 있어요`,
      message: "아직 열려 있는 이슈입니다. 다음 작업 전에 검토해 두면 좋습니다.",
      sourceSurface: "review",
      linkedItemIds: openIssues.map((issue) => issue.id),
      evidenceRefs: uniqueIds(openIssues.flatMap((issue) => issue.sourceEventIds)),
      basis: "mixed",
      actionLabel: "이슈 검토",
      destination: "review",
      audience: "real",
    });
  }

  // ── Next actions to carry forward ───────────────────────────────────────
  if (input.nextActions.length > 0) {
    signals.push({
      id: "companion-next-actions",
      type: "suggested_next_action",
      severity: "suggestion",
      title: `다음에 이어갈 액션 ${input.nextActions.length}개가 있습니다`,
      message: "이번 세션에서 정리된 다음 작업입니다. Resume 프롬프트에 함께 담을 수 있어요.",
      sourceSurface: "review",
      linkedItemIds: input.nextActions.map((action) => action.id),
      evidenceRefs: [],
      basis: "mixed",
      actionLabel: "다음 액션 보기",
      destination: "review",
      audience: "real",
    });
  }

  // ── Important decisions worth remembering ───────────────────────────────
  const importantDecisions = input.decisions.filter(
    (decision) => decision.importance === "high",
  );
  if (importantDecisions.length > 0) {
    signals.push({
      id: "companion-important-decision",
      type: "important_decision",
      severity: "info",
      title: `중요 결정 ${importantDecisions.length}개가 기록되어 있어요`,
      message: "이 세션의 핵심 결정입니다. 보고서와 Resume 프롬프트에서 우선 다뤄집니다.",
      sourceSurface: "review",
      linkedItemIds: importantDecisions.map((decision) => decision.id),
      evidenceRefs: [],
      basis: "verified",
      actionLabel: "결정 보기",
      destination: "review",
      audience: "real",
    });
  }

  // ── Accepted memory that has gone stale or contradicted ────────────────
  const attentionMemoryCount = input.attentionMemoryCount ?? 0;
  if (attentionMemoryCount > 0) {
    signals.push({
      id: "companion-stale-memory",
      type: "stale_memory",
      severity: "review",
      title: `확인이 필요한 메모리가 ${attentionMemoryCount}개 있어요`,
      message:
        "오래되었거나 상충하는 accepted memory입니다. Project Memory에서 검토해 최신 상태로 정리하세요.",
      sourceSurface: "memory",
      linkedItemIds: [],
      evidenceRefs: [],
      basis: "mixed",
      actionLabel: "메모리 검토",
      destination: "memory",
      audience: "both",
    });
  }

  // ── Continuation signals — only once there is something to continue ─────
  if (input.events.length > 0 && input.hasAnalysis) {
    signals.push({
      id: "companion-ready-to-report",
      type: "ready_to_report",
      severity: "suggestion",
      title: "보고서로 정리할 준비가 되었어요",
      message: "분석이 끝났습니다. 이 세션을 Markdown 또는 .mori 보고서로 정리할 수 있어요.",
      sourceSurface: "reports",
      linkedItemIds: [],
      evidenceRefs: [],
      basis: "state",
      actionLabel: "보고서 만들기",
      destination: "reports",
      audience: "real",
    });
  }
  if (input.events.length > 0) {
    signals.push({
      id: "companion-ready-to-resume",
      type: "ready_to_resume",
      severity: "info",
      title: "다음 세션으로 이어갈 수 있어요",
      message: "이 세션의 흐름으로 Resume 프롬프트를 만들어 다음 작업에 이어붙일 수 있습니다.",
      sourceSurface: "reports",
      linkedItemIds: [],
      evidenceRefs: [],
      basis: "state",
      actionLabel: "Resume 프롬프트 보기",
      destination: "reports",
      audience: "both",
    });
  }

  return signals;
}

/**
 * Sort signals most-actionable-first. Order: severity (risk → info),
 * then more linked items first, then stable by type. No cap — callers
 * that need the calm card slice with `prioritiseCompanionSignals`.
 */
export function sortCompanionSignals(signals: CompanionSignal[]): CompanionSignal[] {
  return [...signals].sort((left, right) => {
    const bySeverity =
      companionSeverityRank(left.severity) - companionSeverityRank(right.severity);
    if (bySeverity !== 0) return bySeverity;
    const byLinked = right.linkedItemIds.length - left.linkedItemIds.length;
    if (byLinked !== 0) return byLinked;
    return left.type.localeCompare(right.type);
  });
}

/**
 * Sort signals most-actionable-first and cap the visible set so a card
 * stays calm, not noisy.
 */
export function prioritiseCompanionSignals(signals: CompanionSignal[]): CompanionSignal[] {
  return sortCompanionSignals(signals).slice(0, MAX_COMPANION_SIGNALS);
}

/**
 * Derive the prioritised, capped companion signal set for the active
 * session — the calm card / strip surfaces show this.
 */
export function buildCompanionSignals(input: CompanionSignalInput): CompanionSignal[] {
  return prioritiseCompanionSignals(collectCompanionSignals(input));
}

/**
 * Derive the full, sorted companion signal feed — every applicable
 * signal, uncapped. The Companion inbox surface shows this.
 */
export function buildCompanionSignalFeed(input: CompanionSignalInput): CompanionSignal[] {
  return sortCompanionSignals(collectCompanionSignals(input));
}

/** Severity breakdown of a companion signal set, for the inbox summary. */
export type CompanionSignalSummary = {
  total: number;
  risk: number;
  review: number;
  suggestion: number;
  info: number;
};

/** Count a companion signal set by severity tier. */
export function summarizeCompanionSignals(
  signals: CompanionSignal[],
): CompanionSignalSummary {
  const summary: CompanionSignalSummary = {
    total: signals.length,
    risk: 0,
    review: 0,
    suggestion: 0,
    info: 0,
  };
  for (const signal of signals) {
    summary[signal.severity] += 1;
  }
  return summary;
}

function uniqueIds(ids: string[]): string[] {
  return [...new Set(ids)];
}
