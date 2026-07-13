/**
 * Project Memory consolidation proposal helper (Phase 2.0 prototype).
 *
 * This module is the **only** code change in the controlled
 * consolidation design milestone. It is a pure derivation over
 * `ProjectMemoryViewModel` that produces typed *proposals* the user
 * would review before any durable memory write.
 *
 * Boundaries baked in:
 *   - Pure function. No IO. No LLM. No clock besides the caller's
 *     data.
 *   - No raw source content is copied. Proposals cite ids + titles
 *     only.
 *   - No persistence. The caller owns the returned run.
 *   - Honest warnings echo the view-model + add basis-specific
 *     notes when consolidation reach is limited.
 *   - Dedupe by `(kind, normalisedTitle, sorted sourceSessionIds)`.
 *
 * See `docs/project-memory-consolidation.md` for the design that
 * justifies these shapes.
 */
import type {
  ProjectMemoryDataBasis,
  ProjectMemoryKeyDecision,
  ProjectMemoryRecurringIssue,
  ProjectMemoryUnresolvedRisk,
  ProjectMemoryViewModel,
  ProjectMemoryWarning,
} from "./projectMemoryModel";

// ─── public types ─────────────────────────────────────────────────────

export type MemoryProposalKind =
  | "promotedDecision"
  | "recurringIssue"
  | "keyEvidence"
  | "unresolvedRisk"
  | "contradiction"
  | "staleMemory"
  | "nextSessionRecommendation";

export type MemoryProposalAction =
  | "promote"
  | "merge"
  | "markStale"
  | "keepWatching"
  | "resolve"
  | "scheduleNextSession";

export type MemoryProposalStatus = "proposed" | "accepted" | "edited" | "discarded";

export type MemoryEvidenceRef =
  | { kind: "session"; sessionId: string; sessionTitle?: string }
  | { kind: "event"; sessionId: string; eventId: string }
  | { kind: "source"; sessionId: string; sourceId: string };

export type MemoryProposal = {
  id: string;
  kind: MemoryProposalKind;
  title: string;
  summary: string;
  rationale: string;
  /** 0..1; derived from data we already trust (signalScore / priority / confidence). */
  confidence: number;
  importance: "high" | "medium" | "low";
  /** Cites sessions / events / sources — never raw text. */
  evidenceRefs: MemoryEvidenceRef[];
  sourceSessionIds: string[];
  relatedIssueIds: string[];
  relatedDecisionIds: string[];
  /**
   * Accepted-memory ids this proposal acts *on* (rather than creates).
   * Populated for lifecycle proposals — `staleMemory` cites the one
   * memory it would flag stale, `contradiction` cites every
   * conflicting memory. Absent / empty for proposals that promote new
   * memory (`promotedDecision`, `recurringIssue`, …).
   */
  targetMemoryIds?: string[];
  proposedAction: MemoryProposalAction;
  status: MemoryProposalStatus;
  createdAt: string;
  updatedAt: string;
};

export type ProjectMemoryConsolidationPreview = {
  dataBasis: ProjectMemoryDataBasis;
  sourceSessionCount: number;
  warnings: ProjectMemoryWarning[];
  proposals: MemoryProposal[];
  proposalCounts: Record<MemoryProposalKind, number>;
};

// ─── public entry point ───────────────────────────────────────────────

export function buildProjectMemoryConsolidationPreview(
  memory: ProjectMemoryViewModel,
): ProjectMemoryConsolidationPreview {
  if (memory.dataBasis === "unavailable") {
    return emptyPreviewWith(memory.dataBasis, memory.warnings);
  }

  const proposals: MemoryProposal[] = [];

  for (const decision of memory.keyDecisions) {
    proposals.push(buildPromotedDecisionProposal(decision));
  }
  for (const issue of memory.recurringIssues) {
    proposals.push(buildRecurringIssueProposal(issue));
  }
  // Key evidence is NOT durable memory: it is a pointer to a source / session
  // (its title is the source title, its summary is "<kind> · N linked events").
  // That belongs to the Evidence layer, not memory. Surfacing it as a memory
  // proposal produced session-bookmark "memories" titled by the user's prompt.
  // The evidence itself is still preserved as a source; it just no longer
  // masquerades as a distilled memory asset.
  for (const risk of memory.unresolvedRisks) {
    proposals.push(buildUnresolvedRiskProposal(risk));
  }
  const nextSession = buildNextSessionProposal(memory);
  if (nextSession) proposals.push(nextSession);

  const deduped = dedupeProposals(proposals);

  const warnings: ProjectMemoryWarning[] = [...memory.warnings];
  appendBasisWarning(warnings, memory.dataBasis);

  return {
    dataBasis: memory.dataBasis,
    sourceSessionCount: memory.summaryStats.sessionCount,
    warnings,
    proposals: deduped,
    proposalCounts: countByKind(deduped),
  };
}

// ─── proposal builders ────────────────────────────────────────────────

function buildPromotedDecisionProposal(decision: ProjectMemoryKeyDecision): MemoryProposal {
  const confidence = decision.confirmed ? 0.85 : 0.55;
  const evidenceRefs: MemoryEvidenceRef[] = [
    { kind: "session", sessionId: decision.sessionId, sessionTitle: decision.sessionTitle },
  ];
  const rationale = decision.sessionIsActive
    ? `Surfaced from the active session "${decision.sessionTitle}". ${
        decision.confirmed ? "Already confirmed." : "Pending confirmation."
      }`
    : `Surfaced from saved session "${decision.sessionTitle}". ${
        decision.confirmed ? "Already confirmed." : "Pending confirmation."
      }`;
  return {
    id: makeProposalId("promotedDecision", decision.decisionId, decision.sessionId),
    kind: "promotedDecision",
    title: decision.title,
    summary: decision.detail || decision.title,
    rationale,
    confidence,
    importance: decision.importance,
    evidenceRefs,
    sourceSessionIds: [decision.sessionId],
    relatedIssueIds: [],
    relatedDecisionIds: [decision.decisionId],
    proposedAction: "promote",
    status: "proposed",
    createdAt: decision.createdAt,
    updatedAt: decision.createdAt,
  };
}

function buildRecurringIssueProposal(issue: ProjectMemoryRecurringIssue): MemoryProposal {
  // Cross-session issues earn more confidence than single-session ones.
  const baseline = issue.crossSession ? 0.75 : 0.5;
  const cap = issue.priority === "high" ? 0.95 : issue.priority === "medium" ? 0.85 : 0.7;
  const confidence = Math.min(cap, baseline + Math.min(0.2, issue.affectedSessionCount * 0.05));
  const evidenceRefs: MemoryEvidenceRef[] = issue.affectedSessions.map((session) => ({
    kind: "session",
    sessionId: session.sessionId,
    sessionTitle: session.sessionTitle,
  }));
  const rationale = issue.crossSession
    ? `Appears in ${issue.affectedSessionCount} sessions. Signal score ${issue.signalScore}.`
    : `Single-session issue. Signal score ${issue.signalScore}.`;
  return {
    id: makeProposalId("recurringIssue", issue.issueId, ...issue.affectedSessions.map((s) => s.sessionId)),
    kind: "recurringIssue",
    title: issue.title,
    summary: issue.description || issue.title,
    rationale,
    confidence,
    importance: issue.priority,
    evidenceRefs,
    sourceSessionIds: issue.affectedSessions.map((session) => session.sessionId),
    relatedIssueIds: [issue.issueId],
    relatedDecisionIds: [],
    proposedAction: issue.crossSession ? "promote" : "keepWatching",
    status: "proposed",
    createdAt: nowFallback(),
    updatedAt: nowFallback(),
  };
}

function buildUnresolvedRiskProposal(risk: ProjectMemoryUnresolvedRisk): MemoryProposal {
  // The view-model already filters risks to "high-priority open" or
  // "low-confidence inferred". Reflect that in the proposal confidence.
  const confidence = risk.priority === "high" ? 0.75 : Math.min(0.7, risk.confidence + 0.1);
  const evidenceRefs: MemoryEvidenceRef[] = [
    { kind: "session", sessionId: risk.sessionId, sessionTitle: risk.sessionTitle },
  ];
  const rationale = risk.priority === "high"
    ? `High-priority open risk on "${risk.sessionTitle}".`
    : `Low-confidence inferred risk (${Math.round(risk.confidence * 100)}%) on "${risk.sessionTitle}".`;
  return {
    id: makeProposalId("unresolvedRisk", risk.issueId, risk.sessionId),
    kind: "unresolvedRisk",
    title: risk.title,
    summary: risk.reason,
    rationale,
    confidence,
    importance: risk.priority,
    evidenceRefs,
    sourceSessionIds: [risk.sessionId],
    relatedIssueIds: [risk.issueId],
    relatedDecisionIds: [],
    proposedAction: "keepWatching",
    status: "proposed",
    createdAt: nowFallback(),
    updatedAt: nowFallback(),
  };
}

function buildNextSessionProposal(memory: ProjectMemoryViewModel): MemoryProposal | null {
  const topic = memory.recommendedNextSession?.trim();
  if (!topic) return null;
  if (topic === "현재 세션 메모리를 검토하고 다음 작업 범위를 결정") {
    // Generic fallback string from the view-model — not worth promoting.
    return null;
  }
  // Heuristic confidence: higher when the recommendation came from a
  // cross-session recurring issue, lower when it came from a generic
  // open in-progress fallback.
  const looksLikeRecurringDrivenTopic = /반복|recurring/i.test(topic);
  const confidence = looksLikeRecurringDrivenTopic ? 0.7 : 0.5;
  const evidenceSessions = memory.recentSessions
    .filter((session) => session.isCurrent || session.loadStatus === "loaded")
    .slice(0, 3);
  const evidenceRefs: MemoryEvidenceRef[] = evidenceSessions.map((session) => ({
    kind: "session",
    sessionId: session.sessionId,
    sessionTitle: session.title,
  }));
  return {
    id: makeProposalId("nextSessionRecommendation", topic),
    kind: "nextSessionRecommendation",
    title: topic,
    summary: topic,
    rationale: looksLikeRecurringDrivenTopic
      ? "Recommended because a recurring issue appears across multiple sessions."
      : "Recommended from the active session's open risks / next-actions.",
    confidence,
    importance: looksLikeRecurringDrivenTopic ? "high" : "medium",
    evidenceRefs,
    sourceSessionIds: evidenceSessions.map((session) => session.sessionId),
    relatedIssueIds: [],
    relatedDecisionIds: [],
    proposedAction: "scheduleNextSession",
    status: "proposed",
    createdAt: nowFallback(),
    updatedAt: nowFallback(),
  };
}

// ─── helpers ──────────────────────────────────────────────────────────

function emptyPreviewWith(
  dataBasis: ProjectMemoryDataBasis,
  warnings: ProjectMemoryWarning[],
): ProjectMemoryConsolidationPreview {
  return {
    dataBasis,
    sourceSessionCount: 0,
    warnings: warnings.slice(),
    proposals: [],
    proposalCounts: emptyCounts(),
  };
}

function appendBasisWarning(
  warnings: ProjectMemoryWarning[],
  basis: ProjectMemoryDataBasis,
): void {
  // The view-model already emits its own warnings; the consolidation
  // helper adds one extra hint when reach is narrow so the user can
  // see the limitation specifically in the context of consolidation.
  if (basis === "activeSessionOnly") {
    warnings.push({ kind: "saved-session-bodies-not-loaded", sessionCount: 0 });
  }
}

function dedupeProposals(proposals: MemoryProposal[]): MemoryProposal[] {
  const seen = new Map<string, MemoryProposal>();
  for (const proposal of proposals) {
    const key = proposalDedupeKey(proposal);
    if (!seen.has(key)) {
      seen.set(key, proposal);
      continue;
    }
    // Keep the higher-confidence one if there's a real collision.
    const existing = seen.get(key)!;
    if (proposal.confidence > existing.confidence) seen.set(key, proposal);
  }
  return Array.from(seen.values()).sort(rankProposal);
}

function proposalDedupeKey(proposal: MemoryProposal): string {
  const normalisedTitle = proposal.title.trim().toLowerCase().replace(/\s+/g, " ");
  const sortedSessions = [...proposal.sourceSessionIds].sort().join(",");
  return `${proposal.kind}::${normalisedTitle}::${sortedSessions}`;
}

function rankProposal(a: MemoryProposal, b: MemoryProposal): number {
  // Higher-importance and higher-confidence rows surface first; tie-
  // break by kind ordering so the UI reads consistently.
  const importanceDelta = importanceRank(b.importance) - importanceRank(a.importance);
  if (importanceDelta !== 0) return importanceDelta;
  if (b.confidence !== a.confidence) return b.confidence - a.confidence;
  return kindRank(a.kind) - kindRank(b.kind);
}

function importanceRank(importance: MemoryProposal["importance"]): number {
  if (importance === "high") return 3;
  if (importance === "medium") return 2;
  return 1;
}

function kindRank(kind: MemoryProposalKind): number {
  // Stable display order — decisions first, then recurring issues,
  // then evidence, then risks, then meta kinds.
  const order: MemoryProposalKind[] = [
    "promotedDecision",
    "recurringIssue",
    "keyEvidence",
    "unresolvedRisk",
    "contradiction",
    "staleMemory",
    "nextSessionRecommendation",
  ];
  const idx = order.indexOf(kind);
  return idx === -1 ? order.length : idx;
}

function countByKind(proposals: MemoryProposal[]): Record<MemoryProposalKind, number> {
  const counts = emptyCounts();
  for (const proposal of proposals) counts[proposal.kind] += 1;
  return counts;
}

function emptyCounts(): Record<MemoryProposalKind, number> {
  return {
    promotedDecision: 0,
    recurringIssue: 0,
    keyEvidence: 0,
    unresolvedRisk: 0,
    contradiction: 0,
    staleMemory: 0,
    nextSessionRecommendation: 0,
  };
}

function makeProposalId(kind: MemoryProposalKind, ...parts: string[]): string {
  const joined = parts.filter((part) => part && part.length > 0).join("::");
  return `proposal::${kind}::${joined}`;
}

function nowFallback(): string {
  // The helper is pure but proposals carry timestamps. We use the
  // epoch fallback when no source timestamp is available so the
  // function stays deterministic — callers can override at accept
  // time.
  return "1970-01-01T00:00:00.000Z";
}
