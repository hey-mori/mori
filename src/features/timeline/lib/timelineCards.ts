/**
 * Card-level view models for the Timeline canvas.
 *
 * The existing `TimelineRenderModel` carries the LAYOUT (where each card
 * sits) but the cards themselves still read raw domain types
 * (`TimelineEvent`, `TimelineDisplayBundle`) to compute their tone, trust
 * glyph, time label, and footer parts. This module pulls those derivations
 * out so:
 *
 *   1. Card components render from a finished view model — no inline
 *      `event.linkedIssueIds.length` style domain access.
 *   2. Tests can assert the card content without rendering React.
 *   3. New connector data (when the JSONL ingest UI ships) can reuse the
 *      same card view model, since the only thing it has to do is hand in a
 *      TimelineEvent + the SourceRef list.
 *
 * Inspector view model lives next door in `timelineViewModel.ts`. This file
 * is the boundary for the cards rendered INSIDE the lanes.
 */
import { eventTypeLabels } from "../../../domain/constants";
import { boilerplateLabel, isAgentBoilerplateTitle } from "../../../lib/import/sanitizeTitle";
import { readableAgentText } from "../../../lib/session/agentText";
import type { FileTouch, SourceRef, TimelineEvent, TrustLevel } from "../../../domain/types";
import { formatTime, formatTimeRange, minutesBetween } from "../../../lib/formatting/time";
import { getTrustDisplay } from "../../../lib/evidence/trust";
import { rollUpFileTouches } from "../../../lib/file-provenance/fileProvenance";
import {
  buildEventActivityDescriptor,
  getActivityLaneVisuals,
  joinActivityMeta,
  type TimelineEvidenceChip,
} from "../../../lib/timeline/activityModel";
import { buildBundleDensityProfile, type TimelineDisplayBundle } from "../../../lib/timeline/displayItems";

export type TimelineCardTrustTone = "verified" | "observed" | "inferred";

export type TimelineCardFileActivity = {
  /** Files the turn wrote or edited. */
  filesChanged: number;
  /** Files the turn only read. */
  filesRead: number;
  /** Lines added / removed across the turn's changes (0 when no patch). */
  additions: number;
  deletions: number;
  /** Basename of the lead file (the most-changed, else the first touched). */
  leadFile: string;
  /** Compact "lead 외 N" label naming the lead file and how many more. */
  filesLabel: string;
};

/**
 * Roll a turn's file touches into the compact signal the card shows. Returns
 * null when there are none, so the card stays clean for plain asks / replies.
 */
export function buildCardFileActivity(
  touches: readonly FileTouch[] | undefined,
): TimelineCardFileActivity | null {
  if (!touches || touches.length === 0) return null;
  const entries = rollUpFileTouches(touches);
  if (entries.length === 0) return null;
  const changed = entries.filter((entry) => entry.changeCount > 0);
  const lead = changed[0] ?? entries[0];
  const extra = entries.length - 1;
  return {
    filesChanged: changed.length,
    filesRead: entries.length - changed.length,
    additions: entries.reduce((sum, entry) => sum + entry.additions, 0),
    deletions: entries.reduce((sum, entry) => sum + entry.deletions, 0),
    leadFile: lead.fileName,
    filesLabel: extra > 0 ? `${lead.fileName} 외 ${extra}` : lead.fileName,
  };
}

export type TimelineCardTrustGlyph = {
  level: TrustLevel;
  label: string;
  tone: TimelineCardTrustTone;
  /** Tooltip used for accessibility / hover. Includes confidence when inferred. */
  tooltip: string;
};

export type TimelineEventCardViewModel = {
  kind: "event";
  /** Stable event id (matches `event.id`). */
  id: string;
  /** Tone used for the card body (`purple / green / red / blue / cyan / orange / gray`). */
  tone: string;
  /** Lane label for screen readers. */
  laneLabel: string;
  activityLabel: string;
  /** Lane + activity joined for a compact meta line, deduped when identical. */
  categoryLabel: string;
  activityKind: ReturnType<typeof buildEventActivityDescriptor>["activityKind"];
  sourceLabel: string;
  importance: string;
  evidenceChips: TimelineEvidenceChip[];
  /** "13:02" or "13:02 – 13:18" depending on whether the event spans ≥1 minute. */
  timeLabel: string;
  /** Whether the time label is a range or a single time. */
  hasTimeRange: boolean;
  /** Card title: `event.title` as a person reads it (CLI wrapper tags
   *  dropped, an injected notice named for what it is). */
  title: string;
  /** Trust glyph (icon + label + tone + tooltip). */
  trust: TimelineCardTrustGlyph;
  /**
   * One calm footer signal for the card — evidence count if the event has
   * sources, otherwise a combined linked-item count, otherwise null. Full
   * per-category counts live in the inspector, never on the card.
   */
  primaryMeta: string | null;
  /**
   * Compact file-activity signal for the turn, derived from `event.fileTouches`
   * (Claude Code today). Drives the card-face diffstat chip and the hover line
   * so a turn that changed code reads as such at a glance. Null when the turn
   * touched no files. This is where file provenance reaches the timeline card.
   */
  fileActivity: TimelineCardFileActivity | null;
  /** ARIA label for the rendered button. */
  ariaLabel: string;
  /** HTML `title` attribute (short summary). */
  buttonTitle: string;
  /** Raw event, kept for callers that need to invoke handlers / read more. */
  event: TimelineEvent;
};

export type TimelineBundleViewModel = {
  kind: "bundle";
  id: string;
  tone: string;
  /** "13:02 – 14:18" — bundles always carry a range. */
  timeLabel: string;
  title: string;
  /** "AI 대화 5 · 결정 2" — top two event-type counts; the bundle card's
   *  one calm footer signal. Per-category evidence counts live in the
   *  bundle inspector, not on the card. */
  typeMixLabel: string;
  laneLabel: string;
  /**
   * Per-segment density of the clustered members (0..1, busiest = 1). Rendered
   * as a calm micro-bar so a dense burst reads as dense without expanding the
   * card. Empty (all zeros) when the bundle carries no member timing.
   */
  densityProfile: number[];
  /** ARIA + tooltip text. */
  ariaLabel: string;
  buttonTitle: string;
  bundle: TimelineDisplayBundle;
};

export type TimelineCardViewModel = TimelineEventCardViewModel | TimelineBundleViewModel;

// ─── Builders ───────────────────────────────────────────────────────────────

export function buildTimelineEventCardViewModel(
  event: TimelineEvent,
  sources: readonly SourceRef[] | ReadonlyMap<string, SourceRef> = [],
): TimelineEventCardViewModel {
  const descriptor = buildEventActivityDescriptor({ event, sources, density: "compact" });
  const tone = descriptor.laneVisuals.tone;
  const laneLabel = descriptor.laneVisuals.label;
  const hasRange = event.end ? minutesBetween(event.start, event.end) >= 1 : false;
  const timeLabel = hasRange && event.end
    ? formatTimeRange(event.start, event.end)
    : formatTime(event.start);

  const trust = buildTrustGlyph(event.trustLevel, event.confidence);

  // One calm footer signal — the card is for scanning, not for reading every
  // count. Evidence leads (evidence-first); linked items are the fallback.
  const evidenceCount = event.sourceRefs.length;
  const linkCount = event.linkedIssueIds.length + event.linkedDecisionIds.length;
  const primaryMeta =
    evidenceCount > 0
      ? `근거 ${evidenceCount}`
      : linkCount > 0
        ? `연결 ${linkCount}`
        : null;

  const fileActivity = buildCardFileActivity(event.fileTouches);

  // Sessions imported before the boilerplate-aware titler stored the agent's
  // "continued from a previous conversation" preamble as the title; clean it at
  // render so an already-imported session reads right without a re-import.
  const displayTitle = readableEventTitle(event);
  // A request opener (a user ask) is the anchor of its work unit; name it first
  // so the signal is not visual-only (the swimlane marks it with a filled dot).
  const requestPrefix = event.openedByUser ? "요청 · " : "";
  const ariaLabel = `${requestPrefix}${laneLabel} · ${displayTitle} · ${trust.label}`;
  const buttonTitle = `${laneLabel} · ${displayTitle}`;

  return {
    kind: "event",
    id: event.id,
    tone,
    laneLabel,
    activityLabel: descriptor.activityVisuals.shortLabel,
    categoryLabel: joinActivityMeta(laneLabel, descriptor.activityVisuals.shortLabel),
    activityKind: descriptor.activityKind,
    sourceLabel: descriptor.sourceVisuals.shortLabel,
    importance: descriptor.importance,
    evidenceChips: descriptor.evidenceChips,
    timeLabel,
    hasTimeRange: hasRange,
    title: displayTitle,
    trust,
    primaryMeta,
    fileActivity,
    ariaLabel,
    buttonTitle,
    event,
  };
}

/**
 * An event's title as a person reads it. A notice the agent CLI injected reads
 * as what it is (a slash command, its output, a continuation); older imports
 * stored "세션 이어가기" for every notice, so the notice in the summary decides,
 * without the command's name (the summary is the user's turn, gated by the
 * request disclosure level). Display only.
 */
export function readableEventTitle(event: Pick<TimelineEvent, "title" | "summary">): string {
  if (isAgentBoilerplateTitle(event.title)) return boilerplateLabel(event.title);
  if (event.title === "세션 이어가기" && isAgentBoilerplateTitle(event.summary)) {
    return boilerplateLabel(event.summary, { commandName: false });
  }
  return readableAgentText(event.title).trim() || "에이전트 안내";
}

/**
 * `event.summary` as a person reads it in a preview or a list row, given the
 * title shown beside it: "" when it is the injected notice the title already
 * names, or when it only repeats the title (the same text, or the full text of
 * a title cut short with an ellipsis). Kept off the card view model on
 * purpose: the card face never carries prose.
 */
export function readableEventSummary(event: TimelineEvent, shownTitle: string): string {
  if (isAgentBoilerplateTitle(event.summary)) return "";
  const summary = readableAgentText(event.summary);
  return sameText(summary, shownTitle) ? "" : summary;
}

/** Whether a summary only repeats its title. */
export function sameText(summary: string, title: string): boolean {
  const norm = (text: string) => text.replace(/\s+/g, " ").trim();
  const a = norm(summary);
  const b = norm(title);
  if (!a || a === b || a === b.replace(/[.…]+$/, "")) return true;
  // A title cut short with an ellipsis, whose summary is the same text in full.
  const cut = b.match(/^(.*\S)\s*…$/);
  return Boolean(cut && cut[1]!.length >= 24 && a.startsWith(cut[1]!));
}

/** Compact diffstat string for the card chip / hover, e.g. "+12 -3". Empty when
 *  the activity carried no line counts (a read, or an uncorrelated change). */
export function formatFileActivityDiff(activity: TimelineCardFileActivity): string {
  const parts: string[] = [];
  if (activity.additions > 0) parts.push(`+${activity.additions}`);
  if (activity.deletions > 0) parts.push(`-${activity.deletions}`);
  return parts.join(" ");
}

export function buildTimelineBundleViewModel(bundle: TimelineDisplayBundle): TimelineBundleViewModel {
  const laneVisuals = getActivityLaneVisuals(bundle.laneType);
  const tone = laneVisuals.tone;

  const typeMixEntries = Object.entries(bundle.eventTypeCounts ?? {})
    .filter((entry): entry is [keyof typeof eventTypeLabels, number] => Boolean(entry[1]));
  typeMixEntries.sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0));
  const typeMixLabel = typeMixEntries
    .slice(0, 2)
    .map(([type, count]) => `${eventTypeLabels[type]} ${count}`)
    .join(" · ");

  const timeLabel = formatTimeRange(bundle.start, bundle.end);
  const buttonTitle = `${bundle.title} · 이벤트 ${bundle.count}개`;

  return {
    kind: "bundle",
    id: bundle.id,
    tone,
    laneLabel: laneVisuals.label,
    timeLabel,
    title: bundle.title,
    typeMixLabel,
    densityProfile: buildBundleDensityProfile(bundle),
    ariaLabel: buttonTitle,
    buttonTitle,
    bundle,
  };
}

// ─── Trust glyph ──────────────────────────────────────────────────────────
//
// Trust labels are Korean and come from the single source of truth
// (`getTrustDisplay` in `lib/evidence/trust.ts`) so the timeline reads the
// same trust vocabulary as the Review surface and inspector — no duplicate
// English map. The CSS tone token stays a stable enum keyed by level.

const TRUST_TONE: Record<TrustLevel, TimelineCardTrustTone> = {
  verified: "verified",
  observed: "observed",
  inferred: "inferred",
};

export function buildTrustGlyph(level: TrustLevel, confidence: number): TimelineCardTrustGlyph {
  const label = getTrustDisplay(level).label;
  const tone = TRUST_TONE[level];
  const confidencePct = Math.round(Math.max(0, Math.min(1, confidence)) * 100);
  const tooltip = level === "inferred"
    ? `${label} · 신뢰도 ${confidencePct}%`
    : label;
  return { level, label, tone, tooltip };
}

export { labelText } from "../../../lib/session/agentText";
