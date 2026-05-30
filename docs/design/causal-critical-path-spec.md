# 인과 · Critical Path and Typed Edges (spec)

A spec for the Phase 3 headline upgrade to the 인과 lens: surface the session's
causal **backbone**, mark its origins and outcomes, and finally encode the
relationship vocabulary the map previously flattened. It is the biggest visual
payoff in the program and a clean extension of the existing `buildCausalGraph`.

**Status: implemented.** The model additions, the view treatment, the 핵심 경로
isolate toggle, and the tests below all shipped; this doc now records the design
as built. The two open questions in §8 about default emphasis and node-trust
threading remain for a follow-up pass.

Parent: [`reconstruction-lab-vision.md`](reconstruction-lab-vision.md) (§4.1),
[`visual-system-direction.md`](visual-system-direction.md) (§4 encoding ladder).
Code: `src/lib/timeline-lab/causalGraph.ts`, `CausalMapView.tsx`.

---

## 1. What exists, and what is missing

`buildCausalGraph` already produces a layered DAG: nodes carry `layer` (causal
depth, the longest distance from a root) and `order` (a barycenter-reduced
in-layer position), edges carry `type` + `label` + `tone` via
`getRelationshipDisplay`, and `traceCausalChain` highlights a focal node's
ancestors and descendants. Solid foundation.

Missing, and worth adding:

- The **critical path** (the longest root-to-outcome chain) is not identified,
  so the session's backbone is invisible.
- **Roots and outcomes** are not marked, so "where did this start / what did it
  produce" is not readable.
- Edges are drawn uniformly: `confidence` and `contradicted` (a real tension)
  look like a plain `caused`.

---

## 2. Data model additions (pure, on `buildCausalGraph`)

```ts
type CausalGraph = {
  nodes: CausalNode[];
  edges: CausalEdge[];
  layerCount: number;
  legend: { type; label; tone }[];
  // additions:
  criticalPath: string[];   // node ids, root -> outcome, the longest chain
  roots: string[];          // node ids with no incoming edge
  outcomes: string[];       // node ids with no outgoing edge
};

type CausalEdge = {
  id; fromId; toId; type; label; tone;
  // additions:
  confidence: number;       // carried from Relationship.confidence
  onCriticalPath: boolean;  // edge connects two consecutive path nodes
  tension: boolean;         // type === "contradicted"
};

type CausalNode = {
  // existing: id, kind, tone, label, sub, layer, order
  // addition:
  role: "root" | "outcome" | "internal" | "isolated";
};
```

`roots` / `outcomes` come straight from the `incoming` / `outgoing` maps already
built in `buildCausalGraph` (in-degree 0 and out-degree 0). A node in neither
map is `isolated` (no relationships).

---

## 3. Critical-path algorithm (linear, deterministic)

The `layer` value is already the longest distance from any root, so the deepest
node anchors the longest chain. Compute the path by backtracking:

1. Among `outcomes` (or all nodes if no edges), pick the node with the maximum
   `layer`. Tie-break by: higher summed incoming `confidence`, then node
   `importance` proxy (decision > issue > others), then lowest insertion index
   for stability.
2. From that node, repeatedly step to the incoming neighbor whose `layer` is
   exactly `current.layer - 1` (a true predecessor on a longest chain), choosing
   among ties by edge `confidence`, then stable index.
3. Reverse the collected ids: that is `criticalPath` (root to outcome).
4. Mark `onCriticalPath` on edges joining consecutive path nodes.

Properties: linear over nodes+edges, deterministic (explicit tie-breaks), and
honest (an edgeless graph yields `criticalPath: []`, since there is no chain to
draw). A single longest chain is chosen even when several tie, so the visual is
stable.

---

## 4. Visual treatment (encoding ladder, color last)

Per the visual system, carry meaning with weight and opacity before color, and
never a glow or purple:

- **Critical path:** path nodes at full opacity with a slightly heavier title;
  path edges at ~1.75px stroke. Off-path nodes/edges quieter (lower opacity,
  ~1px), the same context register the trace already uses. No halo, no new hue.
- **Roots / outcomes:** one calm glyph each (e.g. a small left cap on roots, a
  filled end-dot on outcomes), so the reading direction and the "produced this"
  endpoints are obvious. Reuse node tone, do not add color.
- **Edge confidence:** bucket `confidence` into 2-3 stroke weights; low
  confidence also reads as a lighter stroke.
- **Tension (`contradicted`):** a distinct dashed stroke in semantic red, so a
  contradiction never reads as a plain cause. This is the one place a specific
  color is warranted, and it is semantic (a tension), not decorative.
- **Inferred relationships:** dashed (matches the trust convention) when the
  edge is low-confidence/inferred.

---

## 5. Interaction

- The critical path renders by default at a **subtle** emphasis (not loud), so
  the backbone is the first thing the eye finds without the user doing anything.
- Hover/pin trace (existing `traceCausalChain`) takes over emphasis on
  interaction: while tracing a focal node, the critical-path styling yields to
  the trace so the two never fight.
- An optional toolbar toggle isolates the critical path (dims everything off it)
  for a clean "show me just the backbone" read.
- Selecting a node sets the lab's surface-local focused subject (other lenses
  follow), per the interaction model.

---

## 6. Honesty and edge cases

- No edges: `criticalPath: []`, `roots`/`outcomes` empty, every node
  `isolated`; the view shows the existing "관계가 아직 없어..." note and lays
  nodes by depth only (current behavior preserved).
- Cycles: the layer computation already has a cycle guard (data is a DAG,
  defensive). The path backtrack follows `layer - 1`, so it cannot loop.
- A confidence of 0 or missing reads as the lightest stroke, never hidden.

---

## 7. Test plan (extend `causalGraph.test.ts`)

- linear chain A→B→C→D: `criticalPath` is the full chain; roots `[A]`,
  outcomes `[D]`.
- branching (two roots, merge, split): path is the genuinely longest; tie-break
  is deterministic and documented.
- `contradicted` edge sets `tension: true` and is excluded from being treated as
  a plain cause.
- `confidence` carried onto edges; bucketing is a pure mapping.
- roots/outcomes/isolated classification correct, including an isolated node.
- edgeless graph: `criticalPath: []`, all nodes `isolated`, no throw.
- determinism: same input yields identical `criticalPath` across runs.

No screenshot tests; the view is thin over the tested model.

---

## 8. Open questions

- **Default emphasis level:** how subtle should the always-on critical path be
  before it competes with reading individual nodes? Tune in the browser; start
  conservative.
- **Multiple equally-long chains:** show only one (recommended, for calm) or
  allow cycling between them with a control? Lean: one, deterministic.
- **Node trust on the map:** thread `trustLevel` onto `CausalNode` to dash
  inferred nodes too (consistency with 서사/계보)? Additive; do it when the
  unified trust marker lands (Phase 1).
