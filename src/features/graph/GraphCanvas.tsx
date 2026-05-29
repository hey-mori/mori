import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import { Maximize2, Minus, Plus } from "lucide-react";
import { MORI_STAR_PATH } from "../../components/brand/MoriLogo";
import type { WorkGraphLink, WorkGraphNode } from "../../lib/graph/workGraph";

/**
 * Force-directed work-graph canvas — an Obsidian-style live map.
 *
 * Nodes settle under a small physics simulation (spacing repulsion + link
 * springs + centre gravity), so the layout *animates* into place rather than
 * snapping. The graph is fully interactive: drag a node to reposition it (it
 * pins while held), drag the background to pan, wheel to zoom, hover to light
 * up a node and its neighbours while the rest dims. Clicking a node opens it.
 *
 * The simulation is intentionally heavily damped and velocity/position clamped
 * so it can never explode, and it cools to rest (then idles) instead of jitter-
 * ing forever. All of this lives in the view — the topology comes from the pure
 * `buildWorkGraph` helper.
 */

type SimNode = {
  id: string;
  kind: WorkGraphNode["kind"];
  label: string;
  r: number;
  projectKey?: string;
  sessionId?: string;
  count?: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  fx: number;
  fy: number;
  fixed: boolean;
};

type Transform = { k: number; tx: number; ty: number };

const MIN_ZOOM = 0.35;
const MAX_ZOOM = 3;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

const DOT_CLASS: Record<string, string> = {
  project: "graph-project-dot",
  session: "graph-session-dot",
  decision: "graph-decision-dot",
  issue: "graph-issue-dot",
};

export function GraphCanvas({
  nodes,
  links,
  onOpenProject,
  onOpenSession,
}: {
  nodes: WorkGraphNode[];
  links: WorkGraphLink[];
  onOpenProject: (projectKey: string) => void;
  onOpenSession: (sessionId: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [, setVersion] = useState(0);
  const [transform, setTransform] = useState<Transform>({ k: 1, tx: 0, ty: 0 });
  const [hovered, setHovered] = useState<string | null>(null);

  const simRef = useRef<SimNode[]>([]);
  const byIdRef = useRef<Map<string, SimNode>>(new Map());
  const alphaRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const transformRef = useRef(transform);
  const dragRef = useRef<{ id: string; moved: boolean } | null>(null);
  const panRef = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);

  transformRef.current = transform;

  // Adjacency for hover highlighting: a node lights up with its direct links.
  const adjacency = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const node of nodes) map.set(node.id, new Set());
    for (const link of links) {
      map.get(link.source)?.add(link.target);
      map.get(link.target)?.add(link.source);
    }
    return map;
  }, [nodes, links]);

  // Measure the container so the canvas fills it 1:1 (1 svg unit = 1px).
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const reheat = useCallback((value = 0.7) => {
    alphaRef.current = Math.max(alphaRef.current, value);
    if (rafRef.current == null) {
      rafRef.current = requestAnimationFrame(tickRef.current);
    }
  }, []);

  // Build / rebuild the simulation from topology + size. Seeds map the unit
  // square onto the measured canvas so the first frame is already sensible.
  useEffect(() => {
    if (size.w === 0 || size.h === 0) return;
    const sim: SimNode[] = nodes.map((node) => ({
      id: node.id,
      kind: node.kind,
      label: node.label,
      r: node.r,
      projectKey: node.projectKey,
      sessionId: node.sessionId,
      count: node.count,
      x: node.seedX * size.w,
      y: node.seedY * size.h,
      vx: 0,
      vy: 0,
      fx: 0,
      fy: 0,
      fixed: false,
    }));
    simRef.current = sim;
    byIdRef.current = new Map(sim.map((n) => [n.id, n]));
    // Paint the seed layout immediately so the graph is visible even before the
    // first animation frame (rAF can be throttled when the tab is backgrounded).
    setVersion((v) => (v + 1) % 1_000_000);
    reheat(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, size.w, size.h]);

  // The simulation step. Kept in a ref so `reheat` can schedule it without a
  // changing identity, and so the rAF callback always sees the latest state.
  const tickRef = useRef<() => void>(() => {});
  tickRef.current = () => {
    rafRef.current = null;
    const { w, h } = size;
    const sim = simRef.current;
    if (w === 0 || sim.length === 0) return;

    const cx = w / 2;
    const cy = h / 2;
    const minDim = Math.min(w, h);
    const alpha = alphaRef.current;
    const byId = byIdRef.current;

    for (const n of sim) {
      n.fx = 0;
      n.fy = 0;
    }

    // Spacing repulsion — only between nodes that are too close, so it reads as
    // gentle de-overlap rather than a global blast.
    for (let i = 0; i < sim.length; i += 1) {
      for (let j = i + 1; j < sim.length; j += 1) {
        const a = sim[i]!;
        const b = sim[j]!;
        let dx = a.x - b.x;
        let dy = a.y - b.y;
        let d2 = dx * dx + dy * dy;
        if (d2 < 0.01) {
          dx = (i - j) || 1;
          dy = (j - i) || 1;
          d2 = dx * dx + dy * dy;
        }
        const d = Math.sqrt(d2);
        const range = Math.max(a.r + b.r + 26, 132);
        if (d < range) {
          const force = (range - d) * 0.07;
          const ux = dx / d;
          const uy = dy / d;
          a.fx += ux * force;
          a.fy += uy * force;
          b.fx -= ux * force;
          b.fy -= uy * force;
        }
      }
    }

    // Link springs pull linked nodes toward the rest length.
    for (const link of links) {
      const a = byId.get(link.source);
      const b = byId.get(link.target);
      if (!a || !b) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 0.01;
      const rest = link.distance * minDim;
      const force = (d - rest) * 0.06;
      const ux = dx / d;
      const uy = dy / d;
      a.fx += ux * force;
      a.fy += uy * force;
      b.fx -= ux * force;
      b.fy -= uy * force;
    }

    // Centre gravity — strong on the hub so the map stays anchored.
    for (const n of sim) {
      const g = n.kind === "hub" ? 0.09 : 0.012;
      n.fx += (cx - n.x) * g;
      n.fy += (cy - n.y) * g;
    }

    // Integrate with heavy damping + velocity/position clamps.
    for (const n of sim) {
      if (n.fixed) {
        n.vx = 0;
        n.vy = 0;
        continue;
      }
      n.vx = n.vx * 0.86 + n.fx * alpha;
      n.vy = n.vy * 0.86 + n.fy * alpha;
      const speed = Math.hypot(n.vx, n.vy);
      if (speed > 18) {
        n.vx *= 18 / speed;
        n.vy *= 18 / speed;
      }
      n.x = clamp(n.x + n.vx, n.r + 4, w - n.r - 4);
      n.y = clamp(n.y + n.vy, n.r + 4, h - n.r - 4);
    }

    alphaRef.current = alpha * 0.985;
    setVersion((v) => (v + 1) % 1_000_000);

    if (alphaRef.current > 0.02 || dragRef.current) {
      rafRef.current = requestAnimationFrame(tickRef.current);
    }
  };

  useEffect(() => {
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // ── Pointer → graph-space conversion ──────────────────────────────────────
  const toGraph = useCallback((clientX: number, clientY: number) => {
    const rect = svgRef.current?.getBoundingClientRect();
    const { k, tx, ty } = transformRef.current;
    const sx = clientX - (rect?.left ?? 0);
    const sy = clientY - (rect?.top ?? 0);
    return { x: (sx - tx) / k, y: (sy - ty) / k };
  }, []);

  // ── Node drag ─────────────────────────────────────────────────────────────
  const onNodePointerDown = useCallback(
    (event: ReactPointerEvent, node: SimNode) => {
      event.stopPropagation();
      (event.target as Element).setPointerCapture?.(event.pointerId);
      dragRef.current = { id: node.id, moved: false };
      node.fixed = true;
      reheat(0.5);
    },
    [reheat],
  );

  const onPointerMove = useCallback(
    (event: ReactPointerEvent) => {
      const drag = dragRef.current;
      if (drag) {
        const node = byIdRef.current.get(drag.id);
        if (node) {
          const p = toGraph(event.clientX, event.clientY);
          if (Math.hypot(p.x - node.x, p.y - node.y) > 3) drag.moved = true;
          node.x = p.x;
          node.y = p.y;
          node.vx = 0;
          node.vy = 0;
          reheat(0.4);
        }
        return;
      }
      const pan = panRef.current;
      if (pan) {
        setTransform((t) => ({
          ...t,
          tx: pan.tx + (event.clientX - pan.x),
          ty: pan.ty + (event.clientY - pan.y),
        }));
      }
    },
    [reheat, toGraph],
  );

  const endInteraction = useCallback(
    (node: SimNode | null) => {
      const drag = dragRef.current;
      if (drag && node && !drag.moved) {
        if (node.kind === "project" && node.projectKey) onOpenProject(node.projectKey);
        else if (node.sessionId) onOpenSession(node.sessionId);
      }
      if (drag) {
        const n = byIdRef.current.get(drag.id);
        if (n) n.fixed = false;
      }
      dragRef.current = null;
      panRef.current = null;
      reheat(0.15);
    },
    [onOpenProject, onOpenSession, reheat],
  );

  // ── Background pan ──────────────────────────────────────────────────────────
  const onBackgroundPointerDown = useCallback((event: ReactPointerEvent) => {
    if (event.button !== 0) return;
    const t = transformRef.current;
    panRef.current = { x: event.clientX, y: event.clientY, tx: t.tx, ty: t.ty };
  }, []);

  // ── Zoom ────────────────────────────────────────────────────────────────────
  const onWheel = useCallback((event: ReactWheelEvent) => {
    event.preventDefault();
    const rect = svgRef.current?.getBoundingClientRect();
    const px = event.clientX - (rect?.left ?? 0);
    const py = event.clientY - (rect?.top ?? 0);
    setTransform((t) => {
      const factor = event.deltaY < 0 ? 1.12 : 1 / 1.12;
      const k = clamp(t.k * factor, MIN_ZOOM, MAX_ZOOM);
      // Keep the point under the cursor stable across the zoom.
      const tx = px - ((px - t.tx) / t.k) * k;
      const ty = py - ((py - t.ty) / t.k) * k;
      return { k, tx, ty };
    });
  }, []);

  // Zoom controls — scale around the canvas centre; reset re-frames + re-settles.
  const zoomBy = useCallback(
    (factor: number) => {
      const cx = size.w / 2;
      const cy = size.h / 2;
      setTransform((t) => {
        const k = clamp(t.k * factor, MIN_ZOOM, MAX_ZOOM);
        return {
          k,
          tx: cx - ((cx - t.tx) / t.k) * k,
          ty: cy - ((cy - t.ty) / t.k) * k,
        };
      });
    },
    [size.w, size.h],
  );

  const resetView = useCallback(() => {
    setTransform({ k: 1, tx: 0, ty: 0 });
    reheat(0.5);
  }, [reheat]);

  const sim = simRef.current;
  const fontFor = (px: number) => px / transform.k;
  const showSessionLabels = transform.k >= 1.45;
  const HUB_STAR = 34;

  const isActive = (nodeId: string): boolean => {
    if (!hovered) return true;
    if (nodeId === hovered) return true;
    return adjacency.get(hovered)?.has(nodeId) ?? false;
  };

  return (
    <div className="graph-canvas-wrap" ref={containerRef}>
      <svg
        ref={svgRef}
        className="graph-canvas"
        width={size.w}
        height={size.h}
        onPointerDown={onBackgroundPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={() => endInteraction(null)}
        onPointerLeave={() => {
          endInteraction(null);
          setHovered(null);
        }}
        onWheel={onWheel}
        role="application"
        aria-label="작업 그래프"
      >
        <g transform={`translate(${transform.tx} ${transform.ty}) scale(${transform.k})`}>
          <g className="graph-edges">
            {links.map((link) => {
              const a = byIdRef.current.get(link.source);
              const b = byIdRef.current.get(link.target);
              if (!a || !b) return null;
              const connected = link.source === hovered || link.target === hovered;
              return (
                <line
                  key={link.id}
                  className={`graph-edge${link.spoke ? " is-spoke" : ""}${
                    hovered && connected ? " is-active" : ""
                  }${hovered && !connected ? " is-dim" : ""}`}
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                />
              );
            })}
          </g>

          {sim.map((node) => {
            if (node.kind === "hub") {
              const s = HUB_STAR / 64;
              return (
                <g key={node.id} className="graph-hub-mark">
                  <circle className="graph-hub-halo" cx={node.x} cy={node.y} r={HUB_STAR * 0.62} />
                  <path
                    d={MORI_STAR_PATH}
                    transform={`translate(${node.x - 32 * s} ${node.y - 32 * s}) scale(${s})`}
                  />
                </g>
              );
            }
            const active = isActive(node.id);
            const dim = hovered != null && !active;
            const isProject = node.kind === "project";
            const showLabel = isProject || node.id === hovered || (showSessionLabels && active);
            return (
              <g
                key={node.id}
                className={`graph-node graph-${node.kind}${node.id === hovered ? " is-hover" : ""}${dim ? " is-dim" : ""}`}
                onPointerDown={(event) => onNodePointerDown(event, node)}
                onPointerUp={(event) => {
                  event.stopPropagation();
                  endInteraction(node);
                }}
                onPointerEnter={() => setHovered(node.id)}
                onPointerLeave={() => setHovered(null)}
              >
                <circle className={DOT_CLASS[node.kind]} cx={node.x} cy={node.y} r={node.r} />
                {showLabel ? (
                  isProject ? (
                    <text
                      className="graph-project-label"
                      x={node.x}
                      y={node.y + node.r + fontFor(15)}
                      style={{ fontSize: fontFor(13) }}
                    >
                      {node.label}
                    </text>
                  ) : (
                    <text
                      className="graph-node-label"
                      x={node.x}
                      y={node.y - node.r - fontFor(7)}
                      style={{ fontSize: fontFor(11), strokeWidth: fontFor(3.5) }}
                    >
                      {node.label}
                    </text>
                  )
                ) : null}
              </g>
            );
          })}
        </g>
      </svg>

      <div className="graph-controls">
        <button type="button" aria-label="확대" onClick={() => zoomBy(1.2)}>
          <Plus size={15} aria-hidden="true" />
        </button>
        <button type="button" aria-label="축소" onClick={() => zoomBy(1 / 1.2)}>
          <Minus size={15} aria-hidden="true" />
        </button>
        <button type="button" aria-label="처음 보기로" onClick={resetView}>
          <Maximize2 size={14} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
