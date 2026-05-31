import { useCallback, useEffect, useMemo, useState } from "react";
import { Route, X } from "lucide-react";
import type { MockSession } from "../../domain/types";
import {
  buildCausalGraph,
  traceCausalChain,
  type CausalEdge,
  type CausalGraph,
  type CausalNode,
} from "../../lib/timeline-lab/causalGraph";
import { InfoHint } from "../../components/ui/InfoHint";

const NODE_W = 208;
const NODE_H = 60;
const COL_GAP = 88;
const ROW_GAP = 28;
const PAD = 28;
const COL_STRIDE = NODE_W + COL_GAP;
const ROW_STRIDE = NODE_H + ROW_GAP;

const TONE_STROKE: Record<string, string> = {
  blue: "var(--blue)",
  red: "var(--red)",
  green: "var(--green)",
  purple: "var(--purple)",
  cyan: "var(--cyan)",
  orange: "var(--orange)",
  gray: "var(--muted-2)",
};

type Placed = { node: CausalNode; x: number; y: number };

/**
 * 인과 — the session rebuilt as a cause → effect map.
 *
 * The swimlane hides relationships until a card is focused, so "what led to
 * what" is invisible on first look. Here causality is the structure: nodes are
 * events / decisions / issues / artifacts, edges are the reviewed
 * relationships, and columns are causal depth (not the clock), so reading left
 * to right follows cause → effect.
 *
 * Hovering (or clicking to pin) a node traces its full causal chain, ancestors
 * and descendants, and dims everything else, so a dense graph stays readable
 * and the user can answer "what did this lead to / come from" with one gesture.
 */
export function CausalMapView({
  view,
  title = "인과 지도",
}: {
  view: MockSession;
  title?: string;
}) {
  const graph = useMemo(() => buildCausalGraph(view), [view]);
  const layout = useMemo(() => placeNodes(graph), [graph]);
  const nodeIds = useMemo(() => new Set(graph.nodes.map((n) => n.id)), [graph]);

  const [pinnedId, setPinnedId] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [isolateBackbone, setIsolateBackbone] = useState(false);
  const activeId = hoverId ?? pinnedId;
  const backbone = useMemo(() => new Set(graph.criticalPath), [graph]);

  // A node disappearing (session switch) must not leave a dangling pin.
  useEffect(() => {
    if (pinnedId && !nodeIds.has(pinnedId)) setPinnedId(null);
  }, [pinnedId, nodeIds]);

  useEffect(() => {
    if (!pinnedId) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPinnedId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pinnedId]);

  const trace = useMemo(
    () => (activeId ? traceCausalChain(graph, activeId) : null),
    [activeId, graph],
  );

  const clearPin = useCallback(() => setPinnedId(null), []);

  if (graph.nodes.length === 0) {
    return <div className="lab-empty">이 세션에는 아직 재구성할 이벤트가 없습니다.</div>;
  }

  const hasEdges = graph.edges.length > 0;

  return (
    <div className="lab-causal">
      <header className="lab-causal-head">
        <h4>{title}</h4>
        <InfoHint label={`${title} 설명`}>
          노드는 이벤트·결정·이슈·산출물이고, 화살표는 검토된 관계입니다. 가로
          위치는 시간이 아니라 인과 깊이라서, 왼쪽에서 오른쪽으로 읽으면 원인에서
          결과로 이어집니다. 노드에 올리거나 클릭하면 그 인과 사슬만 강조됩니다.
        </InfoHint>
        {backbone.size > 0 ? (
          <button
            type="button"
            className={`lab-causal-toggle${isolateBackbone ? " is-on" : ""}`}
            aria-pressed={isolateBackbone}
            onClick={() => setIsolateBackbone((on) => !on)}
            title="가장 긴 원인 → 결과 사슬만 강조"
          >
            <Route size={12} aria-hidden="true" />
            핵심 경로
          </button>
        ) : null}
        {pinnedId ? (
          <button type="button" className="lab-causal-clear" onClick={clearPin}>
            <X size={12} aria-hidden="true" />
            추적 해제
          </button>
        ) : null}
        {graph.legend.length > 0 ? (
          <ul className="lab-causal-legend">
            {graph.legend.map((item) => (
              <li key={item.type}>
                <span
                  className="lab-legend-line"
                  style={{ background: TONE_STROKE[item.tone] ?? "var(--muted-2)" }}
                  aria-hidden="true"
                />
                {item.label}
              </li>
            ))}
          </ul>
        ) : null}
      </header>

      {!hasEdges ? (
        <p className="lab-causal-note">
          검토된 관계가 아직 없어 노드를 인과 깊이 순서로만 배치했습니다.
        </p>
      ) : null}

      <div className="lab-causal-scroll base-scroll">
        <div
          className={`lab-causal-canvas${trace ? " is-tracing" : ""}${
            !trace && isolateBackbone ? " is-isolating" : ""
          }`}
          style={{ width: layout.width, height: layout.height }}
        >
          <svg
            className="lab-causal-edges"
            width={layout.width}
            height={layout.height}
            aria-hidden="true"
          >
            <defs>
              {layout.tones.map((tone) => (
                <marker
                  key={tone}
                  id={`lab-arrow-${tone}`}
                  viewBox="0 0 8 8"
                  refX="6"
                  refY="4"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 0 L 8 4 L 0 8 z" fill={TONE_STROKE[tone] ?? "var(--muted-2)"} />
                </marker>
              ))}
            </defs>
            {graph.edges.map((edge) => (
              <EdgePath
                key={edge.id}
                edge={edge}
                placed={layout.byId}
                dimmed={
                  trace
                    ? !trace.edges.has(edge.id)
                    : isolateBackbone
                      ? !edge.onCriticalPath
                      : false
                }
                emphasized={!trace && edge.onCriticalPath}
              />
            ))}
          </svg>
          {layout.placed.map(({ node, x, y }) => {
            const dimmed = trace
              ? !trace.nodes.has(node.id)
              : isolateBackbone
                ? !backbone.has(node.id)
                : false;
            const focal = node.id === activeId;
            const onBackbone = !trace && backbone.has(node.id);
            return (
              <button
                type="button"
                key={node.id}
                className={`lab-node${dimmed ? " is-dim" : ""}${focal ? " is-focal" : ""}${
                  node.id === pinnedId ? " is-pinned" : ""
                }${onBackbone ? " is-backbone" : ""}`}
                data-tone={node.tone}
                data-kind={node.kind}
                data-role={node.role}
                style={{ left: x, top: y, width: NODE_W, height: NODE_H }}
                onMouseEnter={() => setHoverId(node.id)}
                onMouseLeave={() => setHoverId((prev) => (prev === node.id ? null : prev))}
                onFocus={() => setHoverId(node.id)}
                onBlur={() => setHoverId((prev) => (prev === node.id ? null : prev))}
                onClick={() => setPinnedId((prev) => (prev === node.id ? null : node.id))}
              >
                <span className="lab-node-dot" aria-hidden="true" />
                <span className="lab-node-text">
                  <span className="lab-node-title">{node.label}</span>
                  {node.sub ? <span className="lab-node-sub">{node.sub}</span> : null}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** Stroke weight by reviewed confidence; the backbone gets a heavier line. */
function edgeWidth(confidence: number, onCriticalPath: boolean): number {
  const base = confidence >= 0.8 ? 1.5 : confidence >= 0.5 ? 1.25 : 1;
  return onCriticalPath ? base + 0.7 : base;
}

function EdgePath({
  edge,
  placed,
  dimmed,
  emphasized,
}: {
  edge: CausalEdge;
  placed: Map<string, Placed>;
  dimmed: boolean;
  emphasized: boolean;
}) {
  const from = placed.get(edge.fromId);
  const to = placed.get(edge.toId);
  if (!from || !to) return null;
  const x1 = from.x + NODE_W;
  const y1 = from.y + NODE_H / 2;
  const x2 = to.x;
  const y2 = to.y + NODE_H / 2;
  const cx = (x1 + x2) / 2;
  // A contradiction is a tension: always read it as red and dashed, never as a plain cause.
  const tone = edge.tension ? "red" : TONE_STROKE[edge.tone] ? edge.tone : "gray";
  const d = `M ${x1} ${y1} C ${cx} ${y1}, ${cx} ${y2}, ${x2} ${y2}`;
  return (
    <path
      className={`lab-edge${dimmed ? " is-dim" : ""}${emphasized ? " is-backbone" : ""}${
        edge.tension ? " is-tension" : ""
      }`}
      d={d}
      fill="none"
      stroke={TONE_STROKE[tone]}
      strokeWidth={edgeWidth(edge.confidence, edge.onCriticalPath)}
      strokeDasharray={edge.tension ? "5 3" : undefined}
      markerEnd={`url(#lab-arrow-${tone})`}
    />
  );
}

function placeNodes(graph: CausalGraph): {
  placed: Placed[];
  byId: Map<string, Placed>;
  width: number;
  height: number;
  tones: string[];
} {
  const byLayer = new Map<number, CausalNode[]>();
  for (const node of graph.nodes) {
    const list = byLayer.get(node.layer);
    if (list) list.push(node);
    else byLayer.set(node.layer, [node]);
  }

  const placed: Placed[] = [];
  const byId = new Map<string, Placed>();
  let maxRows = 0;
  for (const [layer, nodes] of byLayer) {
    maxRows = Math.max(maxRows, nodes.length);
    nodes.forEach((node, row) => {
      const entry: Placed = {
        node,
        x: PAD + layer * COL_STRIDE,
        y: PAD + row * ROW_STRIDE,
      };
      placed.push(entry);
      byId.set(node.id, entry);
    });
  }

  const width = PAD * 2 + graph.layerCount * NODE_W + Math.max(0, graph.layerCount - 1) * COL_GAP;
  const height = PAD * 2 + Math.max(1, maxRows) * NODE_H + Math.max(0, maxRows - 1) * ROW_GAP;
  const tones = [
    ...new Set(
      graph.edges.map((edge) =>
        edge.tension ? "red" : TONE_STROKE[edge.tone] ? edge.tone : "gray",
      ),
    ),
  ];
  return { placed, byId, width, height, tones };
}
