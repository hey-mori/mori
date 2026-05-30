import type { MockSession } from "../../domain/types";
import type { ActivityTone } from "../timeline/activityModel";
import { buildNarrative, type NarrativeMoment, type NarrativeMomentKind } from "./narrative";

/**
 * Phase / chapter reconstruction model.
 *
 * Where the swimlane organises by *source category* (대화 / 명령 / 코드), this
 * model organises by *work arc*: the canonical stages a session moves through.
 * Grouping the same moments into 탐색 → 결정 → 구현 → 점검 → 정리 lets the user
 * read "what stages did this work go through" at a glance, and stays legible
 * whether a session has 6 events or 600. It is the data behind the 국면 view.
 */

export type PhaseId = "explore" | "decide" | "build" | "verify" | "wrapup";

export type Phase = {
  id: PhaseId;
  label: string;
  tone: ActivityTone;
  moments: NarrativeMoment[];
  count: number;
  /** HH:MM range across the phase's moments, or null when unknown. */
  startLabel: string | null;
  endLabel: string | null;
  decisionCount: number;
  issueCount: number;
};

export const PHASE_ORDER: PhaseId[] = ["explore", "decide", "build", "verify", "wrapup"];

export const PHASE_META: Record<PhaseId, { label: string; tone: ActivityTone }> = {
  explore: { label: "탐색·진단", tone: "purple" },
  decide: { label: "결정", tone: "blue" },
  build: { label: "구현", tone: "cyan" },
  verify: { label: "점검·이슈", tone: "red" },
  wrapup: { label: "정리", tone: "gray" },
};

export function phaseForKind(kind: NarrativeMomentKind): PhaseId {
  switch (kind) {
    case "decision":
      return "decide";
    case "code":
      return "build";
    case "issue":
      return "verify";
    case "note":
      return "wrapup";
    case "conversation":
    case "research":
    case "other":
    default:
      return "explore";
  }
}

export function buildPhases(view: MockSession): Phase[] {
  const { moments } = buildNarrative(view);
  const byPhase = new Map<PhaseId, NarrativeMoment[]>();
  for (const moment of moments) {
    const phase = phaseForKind(moment.kind);
    const list = byPhase.get(phase);
    if (list) list.push(moment);
    else byPhase.set(phase, [moment]);
  }

  const phases: Phase[] = [];
  for (const id of PHASE_ORDER) {
    const phaseMoments = byPhase.get(id);
    if (!phaseMoments || phaseMoments.length === 0) continue;
    const labels = phaseMoments.map((m) => m.timeLabel).filter(Boolean);
    phases.push({
      id,
      label: PHASE_META[id].label,
      tone: PHASE_META[id].tone,
      moments: phaseMoments,
      count: phaseMoments.length,
      startLabel: labels[0] ?? null,
      endLabel: labels.length > 1 ? labels[labels.length - 1]! : null,
      decisionCount: phaseMoments.reduce((sum, m) => sum + m.decisions.length, 0),
      issueCount: phaseMoments.reduce((sum, m) => sum + m.issues.length, 0),
    });
  }
  return phases;
}
