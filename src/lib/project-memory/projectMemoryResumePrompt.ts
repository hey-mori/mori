/**
 * Project Memory → resume / follow-up prompt builder.
 *
 * The Memory page used to drive its follow-up prompt from a bespoke
 * helper (`buildFollowUpPrompt`) that read the *active* session view
 * only. With cross-session aggregation, the Memory page now knows
 * about saved-session decisions / recurring issues / key evidence /
 * re-import history / data-basis honesty — none of which the legacy
 * builder surfaces.
 *
 * This module produces a typed, audience-aware, privacy-aware resume
 * prompt directly from `ProjectMemoryViewModel`. Output is pure
 * derivation — no IO, no LLM call, no clipboard side-effects. The UI
 * owns rendering and copying.
 *
 * Honesty rules baked in:
 *   - The prompt NEVER claims "all sessions" when `dataBasis` is
 *     partial / metadata-only.
 *   - Sessions that did not load contribute zero rows; metadata-only
 *     warnings appear in the limitations section instead.
 *   - Raw connector JSONL, raw transcripts, file paths, and likely
 *     secrets are filtered out — even in normal privacy mode.
 *   - `clientSafe` strips audience-specific tool instructions so the
 *     same prompt can be shared in a status update.
 */
import { containsLikelySecret } from "../connectors";
import type { CaptureFidelity } from "../../domain/types";
import type { StoredAcceptedProjectMemory } from "../storage/storageTypes";
import type {
  ProjectMemoryDataBasis,
  ProjectMemoryKeyDecision,
  ProjectMemoryKeyEvidence,
  ProjectMemoryRecurringIssue,
  ProjectMemoryReimportSummary,
  ProjectMemorySessionSummary,
  ProjectMemoryUnresolvedRisk,
  ProjectMemoryViewModel,
  ProjectMemoryWarning,
} from "./projectMemoryModel";

export type ProjectMemoryResumePromptAudience =
  | "self"
  | "claude"
  | "codex"
  | "chatgpt"
  | "handoff";

export type ProjectMemoryResumePromptPrivacy = "normal" | "summaryOnly" | "clientSafe";

export type ProjectMemoryResumePromptSectionKey =
  | "summary"
  | "consolidatedMemory"
  | "recentSessions"
  | "decisions"
  | "issues"
  | "evidence"
  | "nextActions"
  | "reimports"
  | "limitations";

export type ProjectMemoryResumePromptInput = {
  memory: ProjectMemoryViewModel;
  audience: ProjectMemoryResumePromptAudience;
  /**
   * Accepted project memory records (reviewed, durable). When present,
   * eligible records are surfaced as a dedicated guidance section that
   * outranks the live aggregation. Optional — when omitted the prompt
   * is built from the live view-model only, exactly as before.
   */
  acceptedMemories?: readonly StoredAcceptedProjectMemory[];
  /** Which sections to include. Defaults to the full set the model can emit. */
  includeSections?: ProjectMemoryResumePromptSectionKey[];
  /** Per-section item cap (decisions, issues, evidence, etc.). Default 5. */
  maxItems?: number;
  /** Privacy filter. Default `"normal"`. */
  privacyMode?: ProjectMemoryResumePromptPrivacy;
};

export type ProjectMemoryResumePromptSection = {
  key: ProjectMemoryResumePromptSectionKey;
  heading: string;
  lines: string[];
};

export type ProjectMemoryResumePrompt = {
  title: string;
  /** Final rendered prompt body, ready for copy-to-clipboard. */
  body: string;
  /** Structured sections, useful for split-rendering or diffing. */
  sections: ProjectMemoryResumePromptSection[];
  /** Human label for the data-basis badge that produced this prompt. */
  dataBasisLabel: string;
  /** Warnings echoed from the view-model so the caller can render them next to the prompt. */
  warnings: ProjectMemoryWarning[];
};

const DEFAULT_SECTIONS: ProjectMemoryResumePromptSectionKey[] = [
  "summary",
  "consolidatedMemory",
  "recentSessions",
  "decisions",
  "issues",
  "evidence",
  "nextActions",
  "reimports",
  "limitations",
];

const DEFAULT_MAX_ITEMS = 5;

// ─── accepted-memory inclusion policy ─────────────────────────────────

/**
 * Resume Prompt inclusion policy. An accepted project memory is used as
 * *current guidance* only when it is durable, reviewed, not flagged for
 * re-review, and sensitivity-compatible with the chosen privacy mode:
 *
 *   - `resumeEligible` must be true (set when the record was accepted).
 *   - status must be `accepted` or `edited` — `watching` / `deferred`
 *     are advisory, `superseded` / `retired` are history.
 *   - `staleMemory` / `contradiction` kinds are never guidance; they
 *     are unresolved review tasks.
 *   - in `clientSafe` mode, only `normal`-sensitivity records pass.
 *
 * Pure predicate — exported so the Reports builder and tests can reuse
 * the exact same rule.
 */
export function isResumeGuidanceMemory(
  memory: StoredAcceptedProjectMemory,
  privacyMode: ProjectMemoryResumePromptPrivacy,
): boolean {
  if (!memory.resumeEligible) return false;
  if (memory.status !== "accepted" && memory.status !== "edited") return false;
  if (memory.kind === "staleMemory" || memory.kind === "contradiction") return false;
  if (privacyMode === "clientSafe" && memory.sensitivity !== "normal") return false;
  return true;
}

/**
 * An accepted memory that must NOT be used as guidance but should be
 * surfaced under Limitations so the user knows it needs re-review:
 * a record in the `stale` / `contradicted` / `watching` lifecycle
 * state, or a `staleMemory` / `contradiction` kind. `superseded` /
 * `retired` records are history and excluded entirely.
 */
export function isMemoryFlaggedForReview(memory: StoredAcceptedProjectMemory): boolean {
  if (memory.status === "superseded" || memory.status === "retired") return false;
  return (
    memory.status === "stale" ||
    memory.status === "contradicted" ||
    memory.status === "watching" ||
    memory.kind === "staleMemory" ||
    memory.kind === "contradiction"
  );
}

const MEMORY_IMPORTANCE_RANK: Record<"high" | "medium" | "low", number> = {
  high: 0,
  medium: 1,
  low: 2,
};

const MEMORY_KIND_LABEL: Record<StoredAcceptedProjectMemory["kind"], string> = {
  promotedDecision: "decision",
  recurringIssue: "recurring issue",
  keyEvidence: "evidence",
  unresolvedRisk: "risk",
  contradiction: "contradiction",
  staleMemory: "stale memory",
  nextSessionRecommendation: "next session",
};

// ─── public entry point ───────────────────────────────────────────────

export function buildProjectMemoryResumePrompt(
  input: ProjectMemoryResumePromptInput,
): ProjectMemoryResumePrompt {
  const {
    memory,
    audience,
    includeSections = DEFAULT_SECTIONS,
    maxItems = DEFAULT_MAX_ITEMS,
    privacyMode = "normal",
  } = input;

  const sectionSet = new Set(includeSections);
  const sections: ProjectMemoryResumePromptSection[] = [];

  const acceptedMemories = input.acceptedMemories ?? [];
  const guidanceMemories = acceptedMemories.filter((entry) =>
    isResumeGuidanceMemory(entry, privacyMode),
  );
  const flaggedMemoryCount = acceptedMemories.filter(isMemoryFlaggedForReview).length;

  if (sectionSet.has("summary")) {
    sections.push(
      buildSummarySection(memory, privacyMode, acceptedMemories.length, guidanceMemories.length),
    );
  }
  if (sectionSet.has("consolidatedMemory") && acceptedMemories.length > 0) {
    sections.push(buildConsolidatedMemorySection(guidanceMemories, maxItems, privacyMode));
  }
  if (sectionSet.has("decisions")) {
    sections.push(buildDecisionsSection(memory, maxItems, privacyMode));
  }
  if (sectionSet.has("issues")) {
    sections.push(buildIssuesSection(memory, maxItems, privacyMode));
  }
  if (sectionSet.has("nextActions")) {
    sections.push(buildNextActionsSection(memory, maxItems, privacyMode));
  }
  if (sectionSet.has("evidence")) {
    sections.push(buildEvidenceSection(memory, maxItems, privacyMode));
  }
  if (sectionSet.has("recentSessions")) {
    sections.push(buildRecentSessionsSection(memory, maxItems, privacyMode));
  }
  if (sectionSet.has("reimports")) {
    const reimportSection = buildReimportsSection(memory.reimportSummary, privacyMode);
    if (reimportSection) sections.push(reimportSection);
  }
  if (sectionSet.has("limitations")) {
    sections.push(
      buildLimitationsSection(
        memory.dataBasis,
        memory.warnings,
        flaggedMemoryCount,
        summarizeEvidenceFidelity(memory.keyEvidence),
      ),
    );
  }

  const title = buildPromptTitle(memory, audience);
  const preamble = buildPreamble(memory, audience, privacyMode);
  const closing = buildClosing(audience, privacyMode);

  const body = [preamble, ...sections.map(renderSection), closing]
    .filter((block) => block.trim().length > 0)
    .join("\n\n");

  return {
    title,
    body,
    sections,
    dataBasisLabel: memory.dataBasisLabel,
    warnings: memory.warnings,
  };
}

// ─── preamble / closing / title ───────────────────────────────────────

function buildPromptTitle(
  memory: ProjectMemoryViewModel,
  audience: ProjectMemoryResumePromptAudience,
): string {
  const projectLabel = memory.projectName || "the current project";
  switch (audience) {
    case "self":
      return `Resume notes — ${projectLabel}`;
    case "claude":
      return `Continue Mori work on ${projectLabel}`;
    case "codex":
      return `${projectLabel} — implementation continuation`;
    case "chatgpt":
      return `${projectLabel} — review and plan next steps`;
    case "handoff":
    default:
      return `${projectLabel} — project memory handoff`;
  }
}

function buildPreamble(
  memory: ProjectMemoryViewModel,
  audience: ProjectMemoryResumePromptAudience,
  privacy: ProjectMemoryResumePromptPrivacy,
): string {
  const projectLabel = memory.projectName || "the current project";
  const basisLine = describeBasisForPreamble(memory.dataBasis);

  if (privacy === "clientSafe" || audience === "handoff") {
    // Strip tool-specific instructions for handoff / client-safe modes.
    return [
      `Project: ${projectLabel}`,
      `Source: Mori project memory (${basisLine}, local-only).`,
      "This is a continuation note — no raw transcripts, no external account data.",
    ].join("\n");
  }

  switch (audience) {
    case "self":
      return [
        `Project: ${projectLabel}`,
        `Basis: ${basisLine} (local-only Mori sessions).`,
        "Quick continuation context. Read the sections below and pick the highest-priority unresolved item.",
      ].join("\n");
    case "claude":
      return [
        `You are continuing a Mori work session for ${projectLabel}.`,
        `Mori has aggregated the following local project memory (${basisLine}). Do NOT browse external accounts, scan arbitrary files, or invent capture sources.`,
        "Before editing code, read the relevant files in the repository and confirm priorities with the user. Do not start unrelated milestones.",
      ].join("\n");
    case "codex":
      return [
        `Continue Mori implementation work for ${projectLabel}.`,
        `Project memory basis: ${basisLine} (local Mori sessions only).`,
        "When you complete work, run `npm run check:full` before commit and `npm run check:release` before push. Use clean commit messages without AI footers.",
      ].join("\n");
    case "chatgpt":
    default:
      return [
        `Help me review and plan the next session for ${projectLabel}.`,
        `Mori has aggregated the following project memory (${basisLine}, local-only).`,
        "Before suggesting implementation, lay out reasoning and at least one alternative path.",
      ].join("\n");
  }
}

function buildClosing(
  audience: ProjectMemoryResumePromptAudience,
  privacy: ProjectMemoryResumePromptPrivacy,
): string {
  if (privacy === "clientSafe" || audience === "handoff") {
    return "End of memory snapshot.";
  }
  switch (audience) {
    case "self":
      return "Pick one item from the next-actions list or recurring issues and start there.";
    case "claude":
      return "Continue from this context. Confirm priorities with the user before touching code or producing artifacts.";
    case "codex":
      return "Continue implementation. Validate (typecheck + tests) before each commit.";
    case "chatgpt":
    default:
      return "Lay out options for the next milestone, with tradeoffs, before committing to one.";
  }
}

function describeBasisForPreamble(basis: ProjectMemoryDataBasis): string {
  switch (basis) {
    case "activeSessionOnly":
      return "active session only";
    case "activePlusSavedSessions":
      return "active + saved sessions";
    case "savedSessionMetadataOnly":
      return "saved-session metadata only";
    case "partialSavedSessionLoad":
      return "partial saved-session load";
    case "unavailable":
    default:
      return "demo / unavailable";
  }
}

// ─── section builders ─────────────────────────────────────────────────

function buildSummarySection(
  memory: ProjectMemoryViewModel,
  privacy: ProjectMemoryResumePromptPrivacy,
  acceptedMemoryCount: number,
  guidanceMemoryCount: number,
): ProjectMemoryResumePromptSection {
  const stats = memory.summaryStats;
  const lines: string[] = [
    `- Sessions tracked: ${stats.sessionCount} (active: ${stats.activeSessionCount})`,
    `- Events: ${stats.timelineEventCount} · Evidence sources: ${stats.evidenceSourceCount}`,
    `- Decisions: ${stats.decisionCount} · Open issues: ${stats.openIssueCount}/${stats.issueCount}`,
    `- Next actions: ${stats.nextActionCount} · Re-imports observed: ${stats.reimportCount}`,
  ];
  if (acceptedMemoryCount > 0) {
    lines.push(
      `- Accepted project memory: ${guidanceMemoryCount} used as guidance (of ${acceptedMemoryCount} reviewed)`,
    );
  }
  if (memory.latestImportantDecision) {
    const decision = memory.latestImportantDecision;
    const decisionLabel = privacy === "clientSafe"
      ? sanitizeForClientSafe(decision.title)
      : decision.title;
    lines.push(`- Latest important decision: ${decisionLabel}`);
  }
  if (memory.recommendedNextSession) {
    lines.push(`- Recommended next session: ${memory.recommendedNextSession}`);
  }
  return { key: "summary", heading: "Current state", lines };
}

function buildConsolidatedMemorySection(
  guidanceMemories: readonly StoredAcceptedProjectMemory[],
  maxItems: number,
  privacy: ProjectMemoryResumePromptPrivacy,
): ProjectMemoryResumePromptSection {
  const lines: string[] = [];
  if (guidanceMemories.length === 0) {
    lines.push("- (no accepted project memory is currently eligible as guidance)");
  } else {
    const ranked = [...guidanceMemories].sort(compareAcceptedMemory);
    for (const entry of ranked.slice(0, maxItems)) {
      lines.push(formatAcceptedMemoryLine(entry, privacy));
    }
    const remaining = ranked.length - Math.min(ranked.length, maxItems);
    if (remaining > 0) {
      lines.push(`- (+${remaining} more accepted ${remaining === 1 ? "memory" : "memories"})`);
    }
  }
  return {
    key: "consolidatedMemory",
    heading: "Accepted project memory (reviewed)",
    lines,
  };
}

function compareAcceptedMemory(
  a: StoredAcceptedProjectMemory,
  b: StoredAcceptedProjectMemory,
): number {
  const importance = MEMORY_IMPORTANCE_RANK[a.importance] - MEMORY_IMPORTANCE_RANK[b.importance];
  if (importance !== 0) return importance;
  return MEMORY_IMPORTANCE_RANK[a.confidence.label] - MEMORY_IMPORTANCE_RANK[b.confidence.label];
}

function formatAcceptedMemoryLine(
  memory: StoredAcceptedProjectMemory,
  privacy: ProjectMemoryResumePromptPrivacy,
): string {
  const importance = memory.importance.toUpperCase();
  const kindLabel = MEMORY_KIND_LABEL[memory.kind] ?? memory.kind;
  const title = privacy === "clientSafe"
    ? sanitizeForClientSafe(memory.title)
    : sanitizeForNormal(memory.title);
  // privacy mode controls the summary detail, mirroring decisions:
  //   - normal: keep summary (secret redaction only)
  //   - summaryOnly: drop summary for a compact prompt
  //   - clientSafe: keep summary but scrub paths / URLs / connector refs
  let detail = "";
  if (privacy === "normal" && memory.summary) {
    detail = ` — ${truncate(sanitizeForNormal(memory.summary), 160)}`;
  } else if (privacy === "clientSafe" && memory.summary) {
    detail = ` — ${truncate(sanitizeForClientSafe(memory.summary), 160)}`;
  }
  const sessionCount = memory.sourceSessionIds.length;
  const provenance = sessionCount > 0
    ? ` · ${sessionCount} ${sessionCount === 1 ? "session" : "sessions"}`
    : "";
  return `- [${importance} · ${kindLabel}] ${title}${detail}${provenance} · confidence ${memory.confidence.label}`;
}

function buildDecisionsSection(
  memory: ProjectMemoryViewModel,
  maxItems: number,
  privacy: ProjectMemoryResumePromptPrivacy,
): ProjectMemoryResumePromptSection {
  const rows = memory.keyDecisions.slice(0, maxItems);
  const lines = rows.length === 0
    ? ["- (no decisions recorded)"]
    : rows.map((decision) => formatDecisionLine(decision, privacy));
  return { key: "decisions", heading: "Key decisions", lines };
}

function formatDecisionLine(
  decision: ProjectMemoryKeyDecision,
  privacy: ProjectMemoryResumePromptPrivacy,
): string {
  const title = privacy === "clientSafe" ? sanitizeForClientSafe(decision.title) : decision.title;
  // privacy mode controls the detail field:
  //   - normal: keep raw detail (only secret redaction)
  //   - summaryOnly: drop detail entirely (compact prompt)
  //   - clientSafe: keep detail but scrub paths / URLs / connector refs
  let detail = "";
  if (privacy === "normal" && decision.detail) {
    detail = ` — ${truncate(sanitizeForNormal(decision.detail), 160)}`;
  } else if (privacy === "clientSafe" && decision.detail) {
    detail = ` — ${truncate(sanitizeForClientSafe(decision.detail), 160)}`;
  }
  const importance = decision.importance.toUpperCase();
  const attribution = decision.sessionIsActive ? "current" : decision.sessionTitle;
  const confirmed = decision.confirmed ? "" : " (pending)";
  return `- [${importance}] ${title}${detail} · ${attribution}${confirmed}`;
}

function buildIssuesSection(
  memory: ProjectMemoryViewModel,
  maxItems: number,
  privacy: ProjectMemoryResumePromptPrivacy,
): ProjectMemoryResumePromptSection {
  const lines: string[] = [];
  const recurring = memory.recurringIssues.slice(0, maxItems);
  if (recurring.length === 0 && memory.unresolvedRisks.length === 0) {
    lines.push("- (no open or recurring issues)");
  } else {
    for (const issue of recurring) {
      lines.push(formatRecurringIssueLine(issue, privacy));
    }
    for (const risk of memory.unresolvedRisks.slice(0, maxItems)) {
      if (recurring.some((row) => row.issueId === risk.issueId)) continue;
      lines.push(formatRiskLine(risk, privacy));
    }
  }
  return { key: "issues", heading: "Open / recurring issues", lines };
}

function formatRecurringIssueLine(
  issue: ProjectMemoryRecurringIssue,
  privacy: ProjectMemoryResumePromptPrivacy,
): string {
  const title = privacy === "clientSafe" ? sanitizeForClientSafe(issue.title) : issue.title;
  const status = issue.status === "open" ? "open" : issue.status;
  const priority = issue.priority.toUpperCase();
  if (issue.crossSession) {
    return `- [${priority}] ${title} · ${status} · ${issue.affectedSessionCount} sessions`;
  }
  const attribution = issue.sessionIsActive ? "current" : issue.sessionTitle;
  return `- [${priority}] ${title} · ${status} · ${attribution}`;
}

function formatRiskLine(
  risk: ProjectMemoryUnresolvedRisk,
  privacy: ProjectMemoryResumePromptPrivacy,
): string {
  const title = privacy === "clientSafe" ? sanitizeForClientSafe(risk.title) : risk.title;
  const attribution = risk.sessionIsActive ? "current" : risk.sessionTitle;
  return `- [risk] ${title} · ${risk.reason} · ${attribution}`;
}

function buildNextActionsSection(
  memory: ProjectMemoryViewModel,
  _maxItems: number,
  _privacy: ProjectMemoryResumePromptPrivacy,
): ProjectMemoryResumePromptSection {
  // The view-model exposes `summaryStats.nextActionCount` but the
  // per-row next-action list lives on `recentSessions[i]` indirectly.
  // For a useful prompt we mirror the count; the actual per-action
  // text comes from the recommendedNextSession copy.
  const lines: string[] = [];
  if (memory.summaryStats.nextActionCount === 0) {
    lines.push("- (no pending next actions queued)");
  } else {
    lines.push(`- Pending next actions: ${memory.summaryStats.nextActionCount}`);
    if (memory.recommendedNextSession) {
      lines.push(`- Suggested first step: ${memory.recommendedNextSession}`);
    }
  }
  return { key: "nextActions", heading: "Pending work", lines };
}

function buildEvidenceSection(
  memory: ProjectMemoryViewModel,
  maxItems: number,
  privacy: ProjectMemoryResumePromptPrivacy,
): ProjectMemoryResumePromptSection {
  const rows = memory.keyEvidence.slice(0, maxItems);
  const lines = rows.length === 0
    ? ["- (no evidence sources surfaced yet)"]
    : rows.map((row) => formatEvidenceLine(row, privacy));
  return { key: "evidence", heading: "Key evidence", lines };
}

function formatEvidenceLine(
  evidence: ProjectMemoryKeyEvidence,
  privacy: ProjectMemoryResumePromptPrivacy,
): string {
  const session = evidence.sessionIsActive ? "current" : evidence.sessionTitle;
  const fidelity = describeEvidenceFidelitySuffix(evidence.source.captureFidelity);
  if (privacy === "summaryOnly") {
    return `- (source) · ${evidence.relatedEventCount} events · ${session}${fidelity}`;
  }
  const rawTitle = evidence.source.title;
  const title = privacy === "clientSafe"
    ? sanitizeForClientSafe(rawTitle, { allowSourceTitle: false })
    : sanitizeForNormal(rawTitle);
  // We never include `source.uri` — that can carry full URLs or local paths.
  return `- ${title} · ${evidence.source.kind} · ${evidence.relatedEventCount} events · ${session}${fidelity}`;
}

/** Honest, English suffix for a low-fidelity evidence source. Empty when complete or absent. */
function describeEvidenceFidelitySuffix(fidelity?: CaptureFidelity): string {
  switch (fidelity?.level) {
    case "partial":
      return " · partial capture";
    case "fragment":
      return " · fragment";
    case "unknown":
      return " · completeness unknown";
    default:
      return "";
  }
}

type EvidenceFidelitySummary = { incompleteCount: number; unknownCount: number };

function summarizeEvidenceFidelity(
  rows: readonly ProjectMemoryKeyEvidence[],
): EvidenceFidelitySummary {
  let incompleteCount = 0;
  let unknownCount = 0;
  for (const row of rows) {
    const level = row.source.captureFidelity?.level;
    if (level === "partial" || level === "fragment") incompleteCount += 1;
    else if (level === "unknown") unknownCount += 1;
  }
  return { incompleteCount, unknownCount };
}

function buildRecentSessionsSection(
  memory: ProjectMemoryViewModel,
  maxItems: number,
  privacy: ProjectMemoryResumePromptPrivacy,
): ProjectMemoryResumePromptSection {
  const rows = memory.recentSessions.slice(0, maxItems);
  const lines = rows.length === 0
    ? ["- (no sessions visible)"]
    : rows.map((session) => formatRecentSessionLine(session, privacy));
  return { key: "recentSessions", heading: "Recent sessions", lines };
}

function formatRecentSessionLine(
  session: ProjectMemorySessionSummary,
  privacy: ProjectMemoryResumePromptPrivacy,
): string {
  const title = privacy === "clientSafe"
    ? sanitizeForClientSafe(session.title)
    : session.title;
  const flag = session.isCurrent ? "current" : session.source;
  const status = session.loadStatus === "loaded" ? "loaded" : session.loadStatus;
  const events = session.eventCount !== null ? `${session.eventCount} events` : "events n/a";
  return `- ${title} · ${flag} · ${status} · ${events}`;
}

function buildReimportsSection(
  reimport: ProjectMemoryReimportSummary,
  privacy: ProjectMemoryResumePromptPrivacy,
): ProjectMemoryResumePromptSection | null {
  if (reimport.totalReimports === 0) return null;
  const lines: string[] = [
    `- Total re-imports observed: ${reimport.totalReimports} (new ${reimport.newImportCount} · partial ${reimport.partialReimportCount} · duplicate-only ${reimport.duplicateOnlyCount} · history-unavailable ${reimport.historyUnavailableCount} · invalid ${reimport.invalidOnlyCount})`,
  ];
  if (reimport.topMatchedSavedSessions.length > 0 && privacy !== "clientSafe") {
    const matched = reimport.topMatchedSavedSessions
      .slice(0, 3)
      .map((session) => session.title ?? session.sessionId)
      .map((label) => sanitizeForNormal(label))
      .join(", ");
    lines.push(`- Most matched saved sessions: ${matched}`);
  }
  if (!reimport.importSummariesAvailable) {
    lines.push("- Saved-session import history was not available for this rollup.");
  }
  return { key: "reimports", heading: "Re-import activity", lines };
}

function buildLimitationsSection(
  basis: ProjectMemoryDataBasis,
  warnings: ProjectMemoryWarning[],
  flaggedMemoryCount: number,
  evidenceFidelity: EvidenceFidelitySummary,
): ProjectMemoryResumePromptSection {
  const lines: string[] = [`- Data basis: ${describeBasisForPreamble(basis)}`];
  for (const warning of warnings) {
    const line = describeWarning(warning);
    if (line) lines.push(`- ${line}`);
  }
  if (flaggedMemoryCount > 0) {
    lines.push(
      `- ${flaggedMemoryCount} accepted ${flaggedMemoryCount === 1 ? "memory" : "memories"} flagged for re-review (stale / contradicted / watching) — not used as guidance.`,
    );
  }
  if (evidenceFidelity.incompleteCount > 0) {
    lines.push(
      `- ${evidenceFidelity.incompleteCount} key evidence ${evidenceFidelity.incompleteCount === 1 ? "source is a" : "sources are"} partial / fragment ${evidenceFidelity.incompleteCount === 1 ? "capture" : "captures"} — treat as incomplete records, not full transcripts.`,
    );
  }
  if (evidenceFidelity.unknownCount > 0) {
    lines.push(
      `- ${evidenceFidelity.unknownCount} key evidence ${evidenceFidelity.unknownCount === 1 ? "source" : "sources"} could not be assessed for completeness.`,
    );
  }
  lines.push("- Mori reads only locally saved sessions. No cloud sync, no background watching, no external account access.");
  return { key: "limitations", heading: "Limitations", lines };
}

function describeWarning(warning: ProjectMemoryWarning): string {
  switch (warning.kind) {
    case "saved-session-bodies-not-loaded":
      return `${warning.sessionCount} saved sessions are metadata-only — decisions/issues for them not aggregated.`;
    case "saved-session-bodies-partial-load":
      return `Partial saved-session load: ${warning.loadedCount} loaded, ${warning.metadataOnlyCount} metadata-only, ${warning.failedCount} failed.`;
    case "saved-session-load-failed":
      return `${warning.sessionCount} saved sessions failed to load.`;
    case "saved-session-body-loading-unavailable":
      return warning.runtime === "sqlite"
        ? "Desktop SQLite body loading is unavailable in this runtime."
        : "Browser saved-session body loading is unavailable.";
    case "import-summaries-unavailable":
      if (warning.reason === "sqlite-only") {
        return "Desktop SQLite sessions do not yet expose connector import summaries.";
      }
      if (warning.reason === "demo") return "Demo session — re-import history not aggregated.";
      return "Import summary storage is unavailable in this runtime.";
    case "old-imports-without-identity":
      return `${warning.importCount} legacy imports do not carry connector identities and are excluded from the rollup.`;
    case "old-sessions-without-analysis":
      return `${warning.sessionCount} saved sessions have no Quick Pass analysis and contribute limited memory.`;
    case "demo-mode":
      return "Demo mode — saved sessions not aggregated.";
    case "storage-unavailable":
      return "Local storage is unreachable — Project Memory cannot aggregate beyond the active view.";
    default:
      return "";
  }
}

// ─── rendering / sanitization ─────────────────────────────────────────

function renderSection(section: ProjectMemoryResumePromptSection): string {
  return `## ${section.heading}\n${section.lines.join("\n")}`;
}

function truncate(text: string, limit: number): string {
  if (text.length <= limit) return text;
  return `${text.slice(0, limit - 1).trim()}…`;
}

/** Normal-mode sanitization: drop likely secrets, keep titles otherwise. */
function sanitizeForNormal(text: string): string {
  if (containsLikelySecret(text)) return "(redacted secret-like value)";
  // Strip control characters that would break the rendered prompt.
  return text.replace(/[\x00-\x1f]/g, " ");
}

const LOCAL_PATH_PATTERNS = [
  /\/Users\/[\w.-]+/g,
  /\/home\/[\w.-]+/g,
  /[A-Za-z]:\\[\\\w. -]+/g,
  /~\/[\w./ -]+/g,
];

const URL_PATTERN = /\bhttps?:\/\/\S+/gi;

const CONNECTOR_ID_PATTERN = /\b(claude-code|codex-cli|terminal|git)::[\w.-]+::[\w.-]+/g;

type ClientSafeOptions = { allowSourceTitle?: boolean };

/**
 * `clientSafe` mode: strip local paths, URLs, connector identity
 * triplets, and secret-looking values from the rendered text. Source
 * titles can additionally be redacted to a generic label via the
 * `allowSourceTitle: false` option (used for evidence lines).
 */
function sanitizeForClientSafe(text: string, options: ClientSafeOptions = {}): string {
  if (!text) return "(no detail)";
  if (containsLikelySecret(text)) return "(redacted)";
  let cleaned = text;
  for (const pattern of LOCAL_PATH_PATTERNS) {
    cleaned = cleaned.replace(pattern, "(local path)");
  }
  cleaned = cleaned.replace(URL_PATTERN, "(url)");
  cleaned = cleaned.replace(CONNECTOR_ID_PATTERN, "(connector ref)");
  cleaned = cleaned.replace(/[\x00-\x1f]/g, " ");
  if (options.allowSourceTitle === false) return "(source title omitted)";
  return cleaned;
}

// ─── stable re-exports for the UI ─────────────────────────────────────

export const PROJECT_MEMORY_RESUME_AUDIENCES: ReadonlyArray<ProjectMemoryResumePromptAudience> = [
  "self",
  "claude",
  "codex",
  "chatgpt",
  "handoff",
];

export const PROJECT_MEMORY_RESUME_PRIVACY_MODES: ReadonlyArray<ProjectMemoryResumePromptPrivacy> = [
  "normal",
  "summaryOnly",
  "clientSafe",
];

export function describeAudience(audience: ProjectMemoryResumePromptAudience): string {
  switch (audience) {
    case "self":
      return "나에게 보내는 메모";
    case "claude":
      return "Claude (coding agent)";
    case "codex":
      return "Codex (CLI 작업)";
    case "chatgpt":
      return "ChatGPT (계획·검토)";
    case "handoff":
    default:
      return "팀 핸드오프";
  }
}

export function describePrivacyMode(privacy: ProjectMemoryResumePromptPrivacy): string {
  switch (privacy) {
    case "normal":
      return "기본 (출처 제목 포함)";
    case "summaryOnly":
      return "요약 (출처 세부 제거)";
    case "clientSafe":
      return "클라이언트 공유 (경로/URL/식별자 제거)";
    default:
      return "기본";
  }
}
