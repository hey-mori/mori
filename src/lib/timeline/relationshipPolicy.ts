/**
 * Relationship visibility policy.
 *
 * Default Timeline mode: relationships render as quiet context lines. The
 * selection lights up a small focused subgraph (1 hop upstream + 1 hop
 * downstream). Flow Focus widens to 2 hops and renders thicker, more
 * emphasised lines.
 *
 * Aggregation: multiple raw relationships that resolve to the same visible
 * (fromItem, toItem) pair collapse to one connector with `weight`. The layer
 * still attaches the contributing relationship ids so the inspector can
 * surface the hidden detail.
 */
import type { Relationship } from "../../domain/types";
import type { LaidOutTimelineItem } from "./collisionLayout";

export type RelationshipVisibility = "overview" | "focused-only" | "graph";

export type RelationshipPolicyInput = {
  mode: "timeline" | "flow";
  focusedSet: Set<string>;
  focusActive: boolean;
};

export type VisibleConnector = {
  /** Stable id derived from the (from, to) item ids. */
  id: string;
  from: LaidOutTimelineItem;
  to: LaidOutTimelineItem;
  /** Number of raw relationships represented (>=1). */
  weight: number;
  /** Tone class to apply (matches lane tone). */
  tone: string;
  /** Raw relationship ids that contributed to this connector. */
  contributingIds: string[];
};

/**
 * Decide the visibility regime. The result is consumed by the line layer and
 * by tests that need to assert the policy without rendering React.
 */
export function chooseRelationshipVisibility(input: RelationshipPolicyInput): RelationshipVisibility {
  if (input.mode === "flow") return "graph";
  if (input.focusActive && input.focusedSet.size > 1) return "focused-only";
  return "overview";
}

/**
 * Build the list of visible connectors for the current mode and focus set.
 * Pure: no DOM, no React, no closure capture.
 */
export function buildVisibleConnectors(args: {
  mode: "timeline" | "flow";
  focusedSet: Set<string>;
  focusActive: boolean;
  relationships: Relationship[];
  eventAnchorIndex: Map<string, LaidOutTimelineItem>;
  toneOfLane: (laneType: LaidOutTimelineItem["laneType"]) => string;
  /** Maximum number of distinct connectors after aggregation. */
  maxConnectors?: number;
}): VisibleConnector[] {
  const visibility = chooseRelationshipVisibility(args);
  const filtered =
    visibility === "overview"
      ? args.relationships
      : args.relationships.filter(
          (relationship) =>
            args.focusedSet.has(relationship.fromId) && args.focusedSet.has(relationship.toId),
        );
  if (filtered.length === 0) return [];

  const aggregated = new Map<string, VisibleConnector>();
  for (const relationship of filtered) {
    const from = args.eventAnchorIndex.get(relationship.fromId);
    const to = args.eventAnchorIndex.get(relationship.toId);
    if (!from || !to) continue;
    if (from.itemId === to.itemId) continue;

    const key = `${from.itemId}->${to.itemId}`;
    const existing = aggregated.get(key);
    if (existing) {
      existing.weight += 1;
      existing.contributingIds.push(relationship.id);
    } else {
      aggregated.set(key, {
        id: key,
        from,
        to,
        weight: 1,
        tone: args.toneOfLane(from.laneType),
        contributingIds: [relationship.id],
      });
    }
  }

  const ordered = [...aggregated.values()];
  if (args.maxConnectors === undefined || ordered.length <= args.maxConnectors) return ordered;
  // The cap bites. Aggregation preserves first-appearance order, which is event
  // order, so slicing here would keep only the EARLIEST connectors and strand
  // every later one: the timeline would draw lines at the start and nothing
  // after, reading as "the feature stops working" rather than "some lines are
  // hidden". Keep the heaviest handoffs instead, which spreads the survivors
  // across the session. Sort is stable, so equal weights keep event order.
  return [...ordered].sort((a, b) => b.weight - a.weight).slice(0, args.maxConnectors);
}

/**
 * Connector cap by mode.
 *
 * `flow` caps at 16 as a PRODUCT decision: Flow Focus is a deliberately tight
 * 2-hop subgraph, and the number says "this is a focused view". It is not a
 * perf guard and should not be read as a sibling of the timeline value.
 *
 * `timeline` has no cap, on purpose. A cap here was only ever a guess, and it
 * guessed about the wrong quantity: the canvas is not virtualized, so it already
 * draws one bar per event uncapped, and connectors are structurally fewer than
 * bars (they link consecutive lane handoffs within a request). Measured on
 * synthetic sessions: 483 events produce 483 bars but only 321 connectors, and
 * a connector is the cheapest node in the tree, roughly a seventh of a bar's
 * cost with no handlers, no state and no layout participation. So a connector
 * cap can never rescue a canvas that is already dead from its bars, while a cap
 * low enough to fire on an ordinary session silently truncates a deterministic
 * map. If this surface ever needs saving it needs viewport culling for the bars,
 * which is a different job.
 */
export function defaultConnectorCap(mode: "timeline" | "flow"): number | undefined {
  return mode === "flow" ? 16 : undefined;
}
