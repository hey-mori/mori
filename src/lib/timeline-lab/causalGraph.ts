import type {
  Artifact,
  Decision,
  EventType,
  Issue,
  MockSession,
  Relationship,
  RelationshipType,
  TimelineEvent,
} from "../../domain/types";
import type { ActivityTone } from "../timeline/activityModel";
import { momentKindForEvent, narrativeMomentTone, type NarrativeMomentKind } from "./narrative";
import { getRelationshipDisplay } from "../relationships/relationshipDisplay";

/**
 * Causal-graph reconstruction model.
 *
 * The default swimlane hides relationships until a card is focused, so the one
 * thing the user most wants ("what led to what") is invisible on first look.
 * This model makes causality the primary structure: nodes are events /
 * decisions / issues / artifacts, edges are the reviewed relationships, and
 * nodes are layered by causal depth (not the clock) so reading left to right
 * follows cause → effect. It is the data behind the 인과 view.
 */

export type CausalNodeKind = NarrativeMomentKind | "artifact";

export type CausalNode = {
  id: string;
  kind: CausalNodeKind;
  tone: ActivityTone;
  label: string;
  sub: string | null;
  /** Causal depth: 0 = root cause, higher = further downstream. */
  layer: number;
  /** Stable index within the layer for vertical placement. */
  order: number;
};

export type CausalEdge = {
  id: string;
  fromId: string;
  toId: string;
  type: RelationshipType;
  label: string;
  tone: string;
};

export type CausalGraph = {
  nodes: CausalNode[];
  edges: CausalEdge[];
  layerCount: number;
  /** Distinct relationship types present, for the legend. */
  legend: { type: RelationshipType; label: string; tone: string }[];
};

function nodeKindForEvent(type: EventType): NarrativeMomentKind {
  return momentKindForEvent(type);
}

const ISSUE_STATUS_LABEL: Record<Issue["status"], string> = {
  open: "열림",
  inProgress: "진행 중",
  resolved: "해결됨",
  watching: "관찰 중",
};

const IMPORTANCE_LABEL: Record<Decision["importance"], string> = {
  high: "중요",
  medium: "보통",
  low: "낮음",
};

function timeLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

type RawNode = {
  id: string;
  kind: CausalNodeKind;
  tone: ActivityTone;
  label: string;
  sub: string | null;
  index: number;
};

export function buildCausalGraph(view: MockSession): CausalGraph {
  const raw = new Map<string, RawNode>();
  let index = 0;

  const addNode = (node: Omit<RawNode, "index">) => {
    if (raw.has(node.id)) return;
    raw.set(node.id, { ...node, index: index++ });
  };

  for (const event of sortByStart(view.events)) {
    const kind = nodeKindForEvent(event.type);
    addNode({
      id: event.id,
      kind,
      tone: narrativeMomentTone(kind),
      label: event.title,
      sub: timeLabel(event.start) || null,
    });
  }
  for (const decision of view.decisions) {
    addNode({
      id: decision.id,
      kind: "decision",
      tone: "blue",
      label: decision.title,
      sub: IMPORTANCE_LABEL[decision.importance] ?? null,
    });
  }
  for (const issue of view.issues) {
    addNode({
      id: issue.id,
      kind: "issue",
      tone: "red",
      label: issue.title,
      sub: ISSUE_STATUS_LABEL[issue.status] ?? null,
    });
  }
  for (const artifact of view.artifacts) {
    addNode({
      id: artifact.id,
      kind: "artifact",
      tone: "green",
      label: artifact.title,
      sub: "산출물",
    });
  }

  // Edges: only relationships whose endpoints are both present as nodes.
  const edges: CausalEdge[] = [];
  const incoming = new Map<string, string[]>();
  const outgoing = new Map<string, string[]>();
  const edgeSeen = new Set<string>();
  for (const rel of view.relationships) {
    if (!raw.has(rel.fromId) || !raw.has(rel.toId)) continue;
    if (rel.fromId === rel.toId) continue;
    const key = `${rel.fromId}->${rel.toId}`;
    if (edgeSeen.has(key)) continue;
    edgeSeen.add(key);
    const display = getRelationshipDisplay(rel.type);
    edges.push({
      id: rel.id,
      fromId: rel.fromId,
      toId: rel.toId,
      type: rel.type,
      label: display.label,
      tone: display.tone,
    });
    const parents = incoming.get(rel.toId);
    if (parents) parents.push(rel.fromId);
    else incoming.set(rel.toId, [rel.fromId]);
    const kids = outgoing.get(rel.fromId);
    if (kids) kids.push(rel.toId);
    else outgoing.set(rel.fromId, [rel.toId]);
  }

  const layer = computeLayers(raw, incoming);

  // Group by layer; the initial in-layer order is insertion index (stable,
  // deterministic), then the crossing-reduction sweep reorders for legibility.
  const layerGroups = new Map<number, RawNode[]>();
  for (const node of raw.values()) {
    const l = layer.get(node.id) ?? 0;
    const group = layerGroups.get(l);
    if (group) group.push(node);
    else layerGroups.set(l, [node]);
  }

  const order = orderWithinLayers(layerGroups, incoming, outgoing);

  const nodes: CausalNode[] = [];
  for (const [l, group] of layerGroups) {
    for (const node of group) {
      nodes.push({
        id: node.id,
        kind: node.kind,
        tone: node.tone,
        label: node.label,
        sub: node.sub,
        layer: l,
        order: order.get(node.id) ?? 0,
      });
    }
  }
  nodes.sort((a, b) => (a.layer - b.layer) || (a.order - b.order));

  const layerCount = layerGroups.size === 0 ? 0 : Math.max(...layerGroups.keys()) + 1;

  return {
    nodes,
    edges,
    layerCount,
    legend: buildLegend(edges),
  };
}

function computeLayers(
  raw: ReadonlyMap<string, RawNode>,
  incoming: ReadonlyMap<string, string[]>,
): Map<string, number> {
  const cache = new Map<string, number>();
  const visiting = new Set<string>();

  const layerOf = (id: string): number => {
    const cached = cache.get(id);
    if (cached !== undefined) return cached;
    if (visiting.has(id)) return 0; // cycle guard — data is a DAG, defensive only
    visiting.add(id);
    let depth = 0;
    for (const parent of incoming.get(id) ?? []) {
      if (!raw.has(parent)) continue;
      depth = Math.max(depth, layerOf(parent) + 1);
    }
    visiting.delete(id);
    cache.set(id, depth);
    return depth;
  };

  for (const id of raw.keys()) layerOf(id);
  return cache;
}

/**
 * Reduce edge crossings with a barycenter sweep (the ordering half of a
 * Sugiyama layout). Without this, nodes sit in insertion order and a densely
 * linked session renders as a hairball. Each pass re-sorts a layer by the
 * median position of its neighbours in the adjacent layer; alternating
 * down (by parents) and up (by children) passes settle into a low-crossing
 * order. Ties keep the current order, so the result is stable and
 * deterministic. Returns the final in-layer index per node id.
 */
function orderWithinLayers(
  layerGroups: ReadonlyMap<number, RawNode[]>,
  incoming: ReadonlyMap<string, string[]>,
  outgoing: ReadonlyMap<string, string[]>,
): Map<string, number> {
  const layerIds = new Map<number, string[]>();
  for (const [l, group] of layerGroups) {
    layerIds.set(
      l,
      [...group].sort((a, b) => a.index - b.index).map((node) => node.id),
    );
  }

  const pos = new Map<string, number>();
  const reindex = () => {
    for (const ids of layerIds.values()) ids.forEach((id, i) => pos.set(id, i));
  };
  reindex();

  const layersAsc = [...layerIds.keys()].sort((a, b) => a - b);
  const layersDesc = [...layersAsc].reverse();

  const barycenter = (id: string, neighbours: ReadonlyMap<string, string[]>): number => {
    const ns = (neighbours.get(id) ?? []).filter((n) => pos.has(n));
    if (ns.length === 0) return pos.get(id) ?? 0;
    return ns.reduce((sum, n) => sum + (pos.get(n) ?? 0), 0) / ns.length;
  };

  const sweep = (layers: number[], neighbours: ReadonlyMap<string, string[]>) => {
    for (const l of layers) {
      const ids = layerIds.get(l);
      if (!ids || ids.length < 2) continue;
      const key = new Map(ids.map((id) => [id, barycenter(id, neighbours)]));
      ids.sort((a, b) => (key.get(a) ?? 0) - (key.get(b) ?? 0));
      reindex();
    }
  };

  const SWEEPS = 4;
  for (let pass = 0; pass < SWEEPS; pass += 1) {
    sweep(layersAsc, incoming); // settle each layer against its parents
    sweep(layersDesc, outgoing); // then against its children
  }

  const order = new Map<string, number>();
  for (const ids of layerIds.values()) ids.forEach((id, i) => order.set(id, i));
  return order;
}

export type CausalTrace = {
  /** Every node on the focal node's causal chain (ancestors + self + descendants). */
  nodes: Set<string>;
  /** Edge ids that lie along that chain. */
  edges: Set<string>;
};

/**
 * The causal chain through a focal node: everything that led to it (ancestors)
 * and everything it led to (descendants), plus the edges connecting them. The
 * 인과 view uses this to highlight one thread and dim the rest, so a dense map
 * stays readable. Pure: depends only on the graph's edges.
 */
export function traceCausalChain(graph: CausalGraph, nodeId: string): CausalTrace {
  const parents = new Map<string, string[]>();
  const children = new Map<string, string[]>();
  for (const edge of graph.edges) {
    const kids = children.get(edge.fromId);
    if (kids) kids.push(edge.toId);
    else children.set(edge.fromId, [edge.toId]);
    const ps = parents.get(edge.toId);
    if (ps) ps.push(edge.fromId);
    else parents.set(edge.toId, [edge.fromId]);
  }

  const up = reachable(nodeId, parents);
  up.add(nodeId);
  const down = reachable(nodeId, children);
  down.add(nodeId);

  const nodes = new Set<string>([...up, ...down]);
  const edges = new Set<string>(
    graph.edges
      .filter(
        (edge) =>
          (up.has(edge.fromId) && up.has(edge.toId)) ||
          (down.has(edge.fromId) && down.has(edge.toId)),
      )
      .map((edge) => edge.id),
  );
  return { nodes, edges };
}

function reachable(start: string, adjacency: ReadonlyMap<string, string[]>): Set<string> {
  const seen = new Set<string>();
  const stack = [start];
  while (stack.length > 0) {
    const id = stack.pop()!;
    for (const next of adjacency.get(id) ?? []) {
      if (!seen.has(next)) {
        seen.add(next);
        stack.push(next);
      }
    }
  }
  return seen;
}

function buildLegend(edges: readonly CausalEdge[]): CausalGraph["legend"] {
  const seen = new Map<RelationshipType, { type: RelationshipType; label: string; tone: string }>();
  for (const edge of edges) {
    if (!seen.has(edge.type)) {
      seen.set(edge.type, { type: edge.type, label: edge.label, tone: edge.tone });
    }
  }
  return [...seen.values()];
}

function sortByStart(events: readonly TimelineEvent[]): TimelineEvent[] {
  return [...events].sort((a, b) => {
    const ta = Date.parse(a.start);
    const tb = Date.parse(b.start);
    if (Number.isNaN(ta) || Number.isNaN(tb)) return 0;
    return ta - tb;
  });
}

// Re-exported only so the artifact type stays referenced for future use.
export type { Artifact };
