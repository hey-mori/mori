/**
 * Project Memory context — the cross-feature snapshot that the Memory page
 * (and any future cross-session summarizer) consumes.
 *
 * Background: `src/lib/project-memory/projectMemory.ts` accumulated 400+
 * lines doing six things: stats, recurring issues, key evidence, summary,
 * follow-up prompt, and helpers. This module provides a small "what scope
 * are we showing?" snapshot the UI reads at the top of the page. The
 * detailed derivations stay in `projectMemory.ts` for backward
 * compatibility.
 */
import type { MockSession } from "../../domain/types";
import { getSessionEvidenceSummary } from "../evidence";
import {
  deriveProjectMemoryStats,
  scopeLabelFor,
  type DerivedSession,
  type ProjectMemoryDataScope,
  type ProjectMemoryStats,
} from "../project-memory/projectMemory";

export type SavedReportAvailability = {
  /** Total saved .mori v0 packages / Markdown reports the user can revisit. */
  total: number;
  /** Whether at least one report exists. */
  hasAny: boolean;
  /** Human label ready for the UI ("3 saved reports" / "No saved reports yet"). */
  label: string;
  /** Tone for the surrounding badge. */
  tone: "green" | "blue" | "gray";
  /** Concrete next step shown when `hasAny` is false. */
  emptyHint: string;
};

export type ProjectMemorySnapshot = {
  scope: ProjectMemoryDataScope;
  scopeLabel: string;
  /** Whether the snapshot is aggregating more than the current session. */
  isCrossSession: boolean;
  /** Number of saved sessions Mori can see at all (active + saved). */
  totalSessionCount: number;
  /**
   * Number of sessions whose payload is genuinely aggregated. Today this is
   * 1 (the active session); cross-session aggregation is Planned and tied to
   * the persistence-completion milestone.
   */
  aggregatedSessionCount: number;
  /** Underlying stats from `deriveProjectMemoryStats`. */
  stats: ProjectMemoryStats;
  /** Data-basis sentence for the Reports-style summary chip. */
  dataBasisLabel: string;
  /** Caveat string that explains what is NOT yet aggregated. */
  scopeCaveat: string;
  /**
   * Whether the user has any saved reports / `.mori v0` packages to revisit.
   * Surfaced as its own field so the Memory page can render a dedicated chip
   * without re-deriving the boolean from `stats.reportCount`.
   */
  savedReportAvailability: SavedReportAvailability;
};

export function deriveProjectMemoryContext(args: {
  view: MockSession;
  savedSessions: DerivedSession[];
  reportCount: number;
  scope: ProjectMemoryDataScope;
  hasAnalysis: boolean;
}): ProjectMemorySnapshot {
  const stats = deriveProjectMemoryStats({
    view: args.view,
    savedSessions: args.savedSessions,
    reportCount: args.reportCount,
  });
  const evidenceSummary = getSessionEvidenceSummary(args.view);
  const isCrossSession = stats.aggregatedSessionCount > 1;
  const scopeCaveat = buildScopeCaveat({
    scope: args.scope,
    savedSessionCount: args.savedSessions.length,
    reportCount: args.reportCount,
    hasAnalysis: args.hasAnalysis,
  });

  return {
    scope: args.scope,
    scopeLabel: scopeLabelFor(args.scope),
    isCrossSession,
    totalSessionCount: stats.sessionCount,
    aggregatedSessionCount: stats.aggregatedSessionCount,
    stats,
    dataBasisLabel: evidenceSummary.dataBasis,
    scopeCaveat,
    savedReportAvailability: deriveSavedReportAvailability(args.reportCount),
  };
}

/**
 * Pure derivation. Exposed so the Memory page can render the chip without
 * pulling in the full snapshot, and so tests can assert the label shape
 * directly.
 */
export function deriveSavedReportAvailability(reportCount: number): SavedReportAvailability {
  if (reportCount <= 0) {
    return {
      total: 0,
      hasAny: false,
      label: "저장된 보고서 없음",
      tone: "gray",
      emptyHint: "공유 화면에서 Markdown을 복사하거나 .mori v0 JSON을 내보내면 목록에 추가됩니다.",
    };
  }
  return {
    total: reportCount,
    hasAny: true,
    label: `보고서 ${reportCount}건`,
    tone: reportCount >= 3 ? "green" : "blue",
    emptyHint: "",
  };
}

function buildScopeCaveat({
  scope,
  savedSessionCount,
  reportCount,
  hasAnalysis,
}: {
  scope: ProjectMemoryDataScope;
  savedSessionCount: number;
  reportCount: number;
  hasAnalysis: boolean;
}): string {
  if (scope === "demo") {
    return "Demo memory: 정적 mock 데이터를 보여줍니다. 실제 세션을 시작하면 가져온 자료 기반의 메모리가 표시됩니다.";
  }
  const parts: string[] = ["현재는 활성 세션 1건의 데이터만 집계합니다."];
  if (savedSessionCount > 0) {
    parts.push(`저장된 세션 ${savedSessionCount}건은 목록만 표시되며, 결정 / 이슈 / 출처는 개별 세션에서 확인하세요.`);
  } else {
    parts.push("저장된 세션이 없습니다. Settings 또는 Reports에서 .mori v0로 내보내면 목록에 추가됩니다.");
  }
  if (!hasAnalysis) {
    parts.push("분석을 아직 실행하지 않았습니다.");
  }
  if (reportCount === 0) {
    parts.push("저장된 .mori 패키지 / 보고서가 없습니다.");
  }
  return parts.join(" ");
}
