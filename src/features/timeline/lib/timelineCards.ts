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
import type { SourceRef, TimelineEvent, TrustLevel } from "../../../domain/types";
import { formatTime, formatTimeRange, minutesBetween } from "../../../lib/formatting/time";
import { getTrustDisplay } from "../../../lib/evidence/trust";
import {
  buildEventActivityDescriptor,
  getActivityLaneVisuals,
  joinActivityMeta,
  type TimelineEvidenceChip,
} from "../../../lib/timeline/activityModel";
import { buildBundleDensityProfile, type TimelineDisplayBundle } from "../../../lib/timeline/displayItems";

export type TimelineCardTrustTone = "verified" | "observed" | "inferred";

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
  /** Card title (matches `event.title`). */
  title: string;
  /** Trust glyph (icon + label + tone + tooltip). */
  trust: TimelineCardTrustGlyph;
  /**
   * One calm footer signal for the card — evidence count if the event has
   * sources, otherwise a combined linked-item count, otherwise null. Full
   * per-category counts live in the inspector, never on the card.
   */
  primaryMeta: string | null;
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

  const ariaLabel = `${laneLabel} · ${event.title} · ${trust.label}`;
  const buttonTitle = `${laneLabel} · ${event.title}`;

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
    title: event.title,
    trust,
    primaryMeta,
    ariaLabel,
    buttonTitle,
    event,
  };
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
