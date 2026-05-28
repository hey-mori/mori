/**
 * Timeline view model — the pure boundary between session/UI state and the
 * Timeline React components.
 *
 * Goal: layout code, filtering, bundle generation, focus seeding, axis ticks,
 * and the selected-item resolution all happen here, deterministically, with
 * no React dependencies. Components consume a finished `TimelineRenderModel`
 * and never reach into `event.linkedIssueIds.length` style domain access.
 */
import type {
  Decision,
  Issue,
  MoriMockSession,
  Relationship,
  SourceRef,
  TimelineEvent,
} from "../../domain/types";
import {
  buildEventActivityDescriptor,
  buildSourceIndex,
  getTimelineLaneForEvent,
  timelineActivityLaneOrder,
  type EventActivityDescriptor,
  type ActivityLaneId,
} from "./activityModel";
import { deriveProjectIdentityHint, type ProjectIdentityHint } from "../session/projectIdentity";
import { getFocusedEntitySet } from "../relationships/traversal";
import { createTimelineDisplayItems } from "./bundleEvents";
import {
  computeSingleRowLaneLayout,
  indexEventAnchors,
  indexLayout,
  type LaidOutTimelineItem,
  type TimelineDensity,
  type TimelineLayout,
} from "./singleRowLaneLayout";
import { isTimelineBundle, type TimelineDisplayItem } from "./displayItems";
import { getTimelineRange, type TimelineRange } from "./layout";
import { computeAxisTicks, type AxisTick } from "./timeScale";

export type TimelineMode = "timeline" | "flow";

export type TimelineEmptyVariant =
  | "demo-empty"
  | "draft-no-imports"
  | "draft-needs-quick-pass";

export type LaneRenderModel = {
  type: ActivityLaneId;
  /** Number of events in the visible (search) set on this lane. */
  eventCount: number;
  /** Number of display items (post-bundling) on this lane. */
  itemCount: number;
  /** Display items rendered into this lane. */
  items: TimelineDisplayItem[];
  /**
   * True when a category filter is active and this lane is NOT one of the
   * selected categories. The lane (and its events) stay rendered but read
   * de-emphasised — the category filter highlights/dims, it never hides, so
   * the swimlane structure is always complete.
   */
  dimmed: boolean;
};

export type TimelineRenderModel = {
  /** Empty-state variant; when non-null, the canvas is not rendered. */
  emptyVariant: TimelineEmptyVariant | null;
  /**
   * True when the session has events but the active filter + search hide every
   * one of them. Distinct from `emptyVariant` (which is about missing data):
   * here the canvas would render blank, so the view shows a "no results, clear
   * filters" affordance instead of a confusing empty grid.
   */
  filteredEmpty: boolean;
  /** Visible events after filter + search. */
  visibleEvents: TimelineEvent[];
  /** Visible display items (events + bundles). */
  visibleDisplayItems: TimelineDisplayItem[];
  /** Per-lane breakdown for the canvas renderer. */
  lanes: LaneRenderModel[];
  /** Computed time range (clamped to fallback when empty). */
  range: TimelineRange;
  /** Axis ticks for the time ruler. */
  ticks: AxisTick[];
  /** Long pauses between visible events, rendered as phase/gap markers. */
  timeGapMarkers: TimelineGapMarker[];
  /** Pure layout — frame width/height and absolute item coords. */
  layout: TimelineLayout;
  /** Index by item id for direct lookup. */
  layoutIndex: Map<string, LaidOutTimelineItem>;
  /** Index by raw event id — bundles resolve to their containing layout. */
  eventAnchorIndex: Map<string, LaidOutTimelineItem>;
  /** The selected display item (event or bundle), or null. */
  selectedItem: TimelineDisplayItem | null;
  /** Whether the selected item is a bundle. */
  selectedIsBundle: boolean;
  /** Focused entity ids — both the selected/hovered seed and 1-2 hops out. */
  focusedSet: Set<string>;
  /** Whether the canvas should render a focused relationship subgraph. */
  focusActive: boolean;
  /** Mode passed through for components that still need it. */
  mode: TimelineMode;
  /** Density passed through for components that still need it. */
  density: TimelineDensity;
  /** Source index used by card/list/inspector view-models. */
  sourceIndex: Map<string, MoriMockSession["sources"][number]>;
};

export type TimelineGapMarker = {
  id: string;
  /** Last event before the pause. */
  fromEventId: string;
  /** First event after the pause. */
  toEventId: string;
  /** Midpoint timestamp between the two events, used for axis placement. */
  at: string;
  from: string;
  to: string;
  minutes: number;
  label: string;
};

export type BuildTimelineRenderModelInput = {
  view: MoriMockSession;
  mode: TimelineMode;
  density: TimelineDensity;
  selectedEventId: string | null;
  hoveredEventId: string | null;
  /** Active category filter, keyed by timeline lane. */
  activeFilters: ActivityLaneId[];
  searchQuery: string;
  frameWidth: number;
  laneOrder?: ActivityLaneId[];
  laneLabelWidthPx?: number;
  /**
   * Whether the session is the demo (no real imports). Used purely to decide
   * the empty-state variant when `view.events` is empty.
   */
  sessionMode: "demo" | "draft";
  importCount: number;
  hasAnalysis: boolean;
};

export function buildTimelineRenderModel(
  input: BuildTimelineRenderModelInput,
): TimelineRenderModel {
  const laneOrder = input.laneOrder ?? timelineActivityLaneOrder;
  const sourceIndex = buildSourceIndex(input.view.sources);

  // The category filter SHOWS ONLY the selected lanes (it used to dim the rest
  // while keeping every lane on screen). When active, the swimlane renders just
  // those lanes so they share the canvas height; the filter popover still lists
  // every lane because its counts are derived separately from all events.
  const filterActive = input.activeFilters.length > 0;
  const visibleLaneOrder = filterActive
    ? laneOrder.filter((lane) => input.activeFilters.includes(lane))
    : laneOrder;

  // 1. Empty state — short-circuit before anything else.
  const emptyVariant = chooseEmptyVariant({
    eventCount: input.view.events.length,
    importCount: input.importCount,
    hasAnalysis: input.hasAnalysis,
    sessionMode: input.sessionMode,
  });

  // 2. Range — always compute, even when empty, so downstream code stays safe.
  const range = getTimelineRange(input.view.events, {
    start: input.view.session.startedAt,
    end: input.view.session.endedAt,
  });

  // 3. Visible events after search + the category filter. When a category is
  //    selected, only that lane's events remain, so the swimlane collapses to
  //    just the chosen lanes (which then share the canvas height).
  const visibleEvents = filterEvents({
    events: input.view.events,
    activeFilters: input.activeFilters,
    searchQuery: input.searchQuery,
    sources: sourceIndex,
  });

  // 4. Display items. Bundles are now a high-threshold fallback; normal close
  // events remain individual as compact one-row tokens.
  const bundleTuning = densityBundleTuning(input.density);
  const visibleDisplayItems = createTimelineDisplayItems(
    visibleEvents,
    input.view.relationships,
    {
      sources: input.view.sources,
      timeWindowMinutes: bundleTuning.timeWindowMinutes,
      minEventsForBundle: bundleTuning.minEventsForBundle,
      preserveSelectedEventId: input.selectedEventId,
      preserveImportantEventIds: deriveImportantEventIds(visibleEvents, input.view.decisions),
      maxVisibleItemsPerLane: bundleTuning.maxVisibleItemsPerLane,
      laneDensity: input.density,
      decisions: input.view.decisions,
      // A single Claude conversation packs every turn into the aiConversation
      // lane. Bundling it with the lane-mix defaults buries readable turns in
      // one giant blob, so this lane keeps a tighter window and a higher
      // bundle threshold — individual turns stay visible, only genuinely
      // rapid-fire runs cluster.
      laneOverrides: {
        conversation: {
          timeWindowMinutes: bundleTuning.conversationTimeWindowMinutes,
          minEventsForBundle: bundleTuning.conversationMinEventsForBundle,
          maxVisibleItemsPerLane: bundleTuning.conversationMaxVisibleItemsPerLane,
        },
      },
    },
  );

  // 5. Layout (always — even for empty views, since callers may render lanes).
  const layout = computeSingleRowLaneLayout(visibleDisplayItems, range, {
    frameWidth: input.frameWidth,
    density: input.density,
    laneOrder: visibleLaneOrder,
    laneLabelWidthPx: input.laneLabelWidthPx,
  });
  const layoutIndex = indexLayout(layout);
  const eventAnchorIndex = indexEventAnchors(layout);

  // 6. Selection resolution.
  const selectedItem = resolveSelectedItem({
    items: visibleDisplayItems,
    selectedEventId: input.selectedEventId,
  });

  // 7. Focus seeding.
  const focusedSet = computeFocusedSet({
    selectedItem,
    hoveredEventId: input.hoveredEventId,
    items: visibleDisplayItems,
    relationships: input.view.relationships,
    mode: input.mode,
  });
  const focusActive = input.mode === "flow" || focusedSet.size > 1;

  // 8. Axis ticks.
  const ticks = computeAxisTicks(range, { maxTicks: 6 });
  const timeGapMarkers = buildTimelineGapMarkers(visibleEvents, input.density);

  // 9. Per-lane breakdown — carries each lane's event count and whether the
  //    active category filter dims it.
  const lanes = buildLaneRenderModels({
    laneOrder: visibleLaneOrder,
    visibleEvents,
    visibleDisplayItems,
    sourceIndex,
    activeFilters: input.activeFilters,
  });

  // Real data exists but the search / category filter hid everything → not a
  // data-empty state, but the canvas would render blank, so show a no-results
  // affordance the user can clear.
  const filteredEmpty =
    emptyVariant === null &&
    input.view.events.length > 0 &&
    visibleDisplayItems.length === 0 &&
    (input.searchQuery.trim().length > 0 || filterActive);

  return {
    emptyVariant,
    filteredEmpty,
    visibleEvents,
    visibleDisplayItems,
    lanes,
    range,
    ticks,
    timeGapMarkers,
    layout,
    layoutIndex,
    eventAnchorIndex,
    selectedItem,
    selectedIsBundle: selectedItem ? isTimelineBundle(selectedItem) : false,
    focusedSet,
    focusActive,
    mode: input.mode,
    density: input.density,
    sourceIndex,
  };
}

export function buildTimelineGapMarkers(
  events: readonly TimelineEvent[],
  density: TimelineDensity,
): TimelineGapMarker[] {
  if (events.length < 2) return [];
  const threshold = gapThresholdMinutes(density);
  const sorted = [...events].sort(
    (left, right) => new Date(left.start).getTime() - new Date(right.start).getTime(),
  );
  const markers: TimelineGapMarker[] = [];
  for (let index = 1; index < sorted.length; index += 1) {
    const previous = sorted[index - 1]!;
    const next = sorted[index]!;
    const previousEnd = previous.end ?? previous.start;
    const gap = minutesBetween(previousEnd, next.start);
    if (gap < threshold) continue;
    const fromMs = new Date(previousEnd).getTime();
    const toMs = new Date(next.start).getTime();
    markers.push({
      id: `gap-${previous.id}-${next.id}`,
      fromEventId: previous.id,
      toEventId: next.id,
      at: new Date(fromMs + (toMs - fromMs) / 2).toISOString(),
      from: previousEnd,
      to: next.start,
      minutes: Math.round(gap),
      label: formatGapLabel(gap),
    });
  }
  return markers;
}

export function gapThresholdMinutes(density: TimelineDensity): number {
  switch (density) {
    case "comfortable":
      return 45;
    case "compact":
      return 30;
    case "dense":
      return 20;
    default:
      return 30;
  }
}

/**
 * Viewport width at or below which the Timeline side inspector is hidden so
 * the canvas keeps the full content width. Matches the `content-grid`
 * single-column CSS breakpoint — below it the inspector would otherwise
 * stack awkwardly under a horizontally-scrolling canvas.
 */
export const TIMELINE_INSPECTOR_NARROW_MAX_PX = 1180;

/**
 * Whether the Timeline side inspector should be hidden. Hidden when the user
 * explicitly collapsed it, or when the viewport is too narrow to carry a
 * side column. Flow Focus keeps its Trace panel regardless.
 */
export function shouldHideInspector(args: {
  mode: TimelineMode;
  inspectorCollapsed: boolean;
  viewportWidth: number;
}): boolean {
  if (args.mode !== "timeline") return false;
  if (args.inspectorCollapsed) return true;
  return args.viewportWidth <= TIMELINE_INSPECTOR_NARROW_MAX_PX;
}

/**
 * Density-aware bundle tuning. Denser modes use smaller cards, so a lane can
 * carry more individual events before the overflow-merge kicks in, and a
 * tighter cluster window keeps a "burst" meaningfully tight.
 */
export function densityBundleTuning(density: TimelineDensity): {
  timeWindowMinutes: number;
  minEventsForBundle: number;
  maxVisibleItemsPerLane: number;
  /** Tighter window for the conversation lane — only rapid-fire turns cluster. */
  conversationTimeWindowMinutes: number;
  /** Higher threshold so short conversation runs stay as individual turns. */
  conversationMinEventsForBundle: number;
  /** More room before the conversation lane density-merges. */
  conversationMaxVisibleItemsPerLane: number;
} {
  switch (density) {
    case "comfortable":
      return {
        timeWindowMinutes: 4,
        minEventsForBundle: 12,
        maxVisibleItemsPerLane: 24,
        conversationTimeWindowMinutes: 2,
        conversationMinEventsForBundle: 18,
        conversationMaxVisibleItemsPerLane: 32,
      };
    case "compact":
      return {
        timeWindowMinutes: 3,
        minEventsForBundle: 14,
        maxVisibleItemsPerLane: 28,
        conversationTimeWindowMinutes: 2,
        conversationMinEventsForBundle: 20,
        conversationMaxVisibleItemsPerLane: 36,
      };
    case "dense":
      return {
        timeWindowMinutes: 2,
        minEventsForBundle: 16,
        maxVisibleItemsPerLane: 36,
        conversationTimeWindowMinutes: 1,
        conversationMinEventsForBundle: 24,
        conversationMaxVisibleItemsPerLane: 44,
      };
    default:
      return {
        timeWindowMinutes: 3,
        minEventsForBundle: 14,
        maxVisibleItemsPerLane: 28,
        conversationTimeWindowMinutes: 2,
        conversationMinEventsForBundle: 20,
        conversationMaxVisibleItemsPerLane: 36,
      };
  }
}

function chooseEmptyVariant(args: {
  eventCount: number;
  importCount: number;
  hasAnalysis: boolean;
  sessionMode: "demo" | "draft";
}): TimelineEmptyVariant | null {
  if (args.eventCount > 0) return null;
  if (args.sessionMode === "demo") return "demo-empty";
  if (args.importCount === 0) return "draft-no-imports";
  if (!args.hasAnalysis) return "draft-needs-quick-pass";
  return null;
}

export function filterEvents(args: {
  events: TimelineEvent[];
  activeFilters: ActivityLaneId[];
  searchQuery: string;
  sources?: readonly SourceRef[] | ReadonlyMap<string, SourceRef>;
}): TimelineEvent[] {
  const normalizedSearch = args.searchQuery.trim().toLocaleLowerCase();
  if (!args.activeFilters.length && !normalizedSearch) return args.events;
  return args.events.filter((event) => {
    if (
      args.activeFilters.length &&
      !args.activeFilters.includes(getTimelineLaneForEvent({ event, sources: args.sources }))
    ) {
      return false;
    }
    if (!normalizedSearch) return true;
    return `${event.title} ${event.summary}`
      .toLocaleLowerCase()
      .includes(normalizedSearch);
  });
}

function deriveImportantEventIds(events: TimelineEvent[], decisions: Decision[]): string[] {
  const highDecisionIds = new Set(
    decisions.filter((decision) => decision.importance === "high").map((decision) => decision.id),
  );
  return events
    .filter(
      (event) =>
        event.type === "decision" ||
        event.linkedDecisionIds.some((id) => highDecisionIds.has(id)) ||
        event.linkedDecisionIds.length > 0 ||
        event.sourceRefs.length > 1,
    )
    .map((event) => event.id);
}

function resolveSelectedItem(args: {
  items: TimelineDisplayItem[];
  selectedEventId: string | null;
}): TimelineDisplayItem | null {
  if (!args.items.length) return null;
  // Open neutral: nothing is auto-selected. A card is selected only when the
  // user picks one (or a deep link names a real event id). An empty or
  // unmatched id resolves to null rather than silently selecting the first
  // card — entering the timeline should not pre-expand / pre-highlight a card.
  if (!args.selectedEventId) return null;
  return (
    args.items.find((item) => item.id === args.selectedEventId) ??
    args.items.find((item) => item.memberEventIds.includes(args.selectedEventId!)) ??
    null
  );
}

function computeFocusedSet(args: {
  selectedItem: TimelineDisplayItem | null;
  hoveredEventId: string | null;
  items: TimelineDisplayItem[];
  relationships: Relationship[];
  mode: TimelineMode;
}): Set<string> {
  if (!args.selectedItem) return new Set();
  const seeds = args.hoveredEventId
    ? args.items.find((item) => item.id === args.hoveredEventId)?.memberEventIds ?? [
        args.hoveredEventId,
      ]
    : args.selectedItem.memberEventIds;
  const focusedSet = new Set<string>();
  for (const seed of seeds) {
    for (const entityId of getFocusedEntitySet(
      seed,
      args.relationships,
      args.mode === "flow" ? 2 : 1,
    )) {
      focusedSet.add(entityId);
    }
  }
  return focusedSet;
}

function buildLaneRenderModels(args: {
  laneOrder: ActivityLaneId[];
  visibleEvents: TimelineEvent[];
  visibleDisplayItems: TimelineDisplayItem[];
  sourceIndex: ReadonlyMap<string, MoriMockSession["sources"][number]>;
  activeFilters: ActivityLaneId[];
}): LaneRenderModel[] {
  const eventCounts = new Map<ActivityLaneId, number>();
  for (const event of args.visibleEvents) {
    const lane = getTimelineLaneForEvent({ event, sources: args.sourceIndex });
    eventCounts.set(lane, (eventCounts.get(lane) ?? 0) + 1);
  }
  const laneItems = new Map<ActivityLaneId, TimelineDisplayItem[]>();
  for (const lane of args.laneOrder) laneItems.set(lane, []);
  for (const item of args.visibleDisplayItems) {
    const bucket = laneItems.get(item.laneType);
    if (bucket) bucket.push(item);
    else laneItems.set(item.laneType, [item]);
  }
  // `laneOrder` is already the visible (filtered) set, so every rendered lane
  // is one the user wants — nothing is dimmed.
  return args.laneOrder.map((type) => {
    const items = laneItems.get(type) ?? [];
    return {
      type,
      eventCount: eventCounts.get(type) ?? 0,
      itemCount: items.length,
      items,
      dimmed: false,
    };
  });
}

function minutesBetween(start: string, end: string): number {
  return Math.max(0, new Date(end).getTime() - new Date(start).getTime()) / 60000;
}

function formatGapLabel(minutes: number): string {
  const rounded = Math.round(minutes);
  if (rounded < 60) return `${rounded}분 공백`;
  const hours = Math.floor(rounded / 60);
  const remainder = rounded % 60;
  if (remainder === 0) return `${hours}시간 공백`;
  return `${hours}시간 ${remainder}분 공백`;
}

/** Public helper to derive a focused relationship subgraph for the Inspector. */
export function getFocusedRelationships(args: {
  focusedSet: Set<string>;
  relationships: Relationship[];
}): Relationship[] {
  if (args.focusedSet.size === 0) return [];
  return args.relationships.filter(
    (relationship) =>
      args.focusedSet.has(relationship.fromId) &&
      args.focusedSet.has(relationship.toId),
  );
}

/**
 * Helper used by the bundle inspector and inspector "Hidden relationships"
 * line: count of relationships that touch a member event but are NOT
 * currently visible on screen (because their other endpoint is outside the
 * focused set).
 *
 * Takes an explicit `focusedSet` so callers can pass a stable, selection-only
 * set — the inspector count must not flicker as the user hovers cards.
 */
export function countHiddenRelationships(args: {
  focusedSet: Set<string>;
  relationships: Relationship[];
  forEventIds: string[];
}): number {
  if (!args.forEventIds.length) return 0;
  const targets = new Set(args.forEventIds);
  return args.relationships.filter((relationship) => {
    const touchesTarget = targets.has(relationship.fromId) || targets.has(relationship.toId);
    if (!touchesTarget) return false;
    const otherEndpoint = targets.has(relationship.fromId)
      ? relationship.toId
      : relationship.fromId;
    return !args.focusedSet.has(otherEndpoint);
  }).length;
}

export type InspectorViewModel = {
  event: TimelineEvent;
  trustLevel: TimelineEvent["trustLevel"];
  confidencePct: number;
  sources: MoriMockSession["sources"];
  issues: Issue[];
  decisions: Decision[];
  artifacts: MoriMockSession["artifacts"];
  nextActions: MoriMockSession["nextActions"];
  hiddenRelationshipCount: number;
  focusedRelationships: Relationship[];
  activity: EventActivityDescriptor;
  projectHint: ProjectIdentityHint;
};

/**
 * Pure derivation of the Event Inspector's input. The inspector component
 * receives this and just renders.
 */
export function buildInspectorViewModel(args: {
  event: TimelineEvent;
  view: MoriMockSession;
}): InspectorViewModel {
  const { event, view } = args;
  const sources = view.sources.filter((source) => event.sourceRefs.includes(source.id));
  const issues = view.issues.filter((issue) => event.linkedIssueIds.includes(issue.id));
  const decisions = view.decisions.filter((decision) =>
    event.linkedDecisionIds.includes(decision.id),
  );
  const artifacts = view.artifacts.filter((artifact) =>
    event.artifactIds?.includes(artifact.id),
  );
  const nextActions = view.nextActions.filter((action) =>
    action.relatedEventIds.includes(event.id),
  );
  // The inspector describes the *selected* event. Seed its focus set from
  // that event alone — never from `model.focusedSet`, which is re-seeded by
  // hover and would make the inspector flicker as the cursor moves.
  const selectedFocusSet = getFocusedEntitySet(event.id, view.relationships, 1);
  const focusedRelationships = getFocusedRelationships({
    focusedSet: selectedFocusSet,
    relationships: view.relationships,
  });
  const hiddenRelationshipCount = countHiddenRelationships({
    focusedSet: selectedFocusSet,
    relationships: view.relationships,
    forEventIds: [event.id],
  });
  return {
    event,
    trustLevel: event.trustLevel,
    confidencePct: Math.round(event.confidence * 100),
    sources,
    issues,
    decisions,
    artifacts,
    nextActions,
    hiddenRelationshipCount,
    focusedRelationships,
    activity: buildEventActivityDescriptor({
      event,
      sources: view.sources,
      density: "comfortable",
    }),
    projectHint: deriveProjectIdentityHint({
      session: view.session,
      sources: view.sources,
      events: view.events,
    }),
  };
}
