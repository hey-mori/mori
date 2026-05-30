# Graph vs 인과 · Consolidation Decision

A decision memo resolving the one architectural tension the planning set keeps
flagging: Mori has two node-link graph surfaces. This settles their roles so we
do not build or maintain two overlapping things. Planning only; it recommends a
direction and the criteria behind it.

Parent: [`product-improvement-plan.md`](product-improvement-plan.md) (§2 item 12),
[`reconstruction-lab-vision.md`](reconstruction-lab-vision.md) (§4.1, 인과),
[`causal-critical-path-spec.md`](causal-critical-path-spec.md).

---

## 1. The two surfaces

- **재구성 인과 lens** (`src/lib/timeline-lab/causalGraph.ts`,
  `CausalMapView.tsx`): a **single-session** cause→effect DAG. Deterministic
  layered layout with barycenter crossing reduction, chain tracing, and (planned)
  critical-path highlighting. Pure derivation from one `MockSession`.
- **Experimental Graph** (`src/features/graph/`, ~646 lines): a **cross-session
  / workspace** force-simulated map (hub → projects → sessions, with inline
  decision/issue snippets), reached only from the command palette. Physics
  layout, jitters on update, no pan/zoom or minimap.

---

## 2. Are they redundant? No, but they conflict

They operate at **different altitudes**: 인과 is within-session causality; the
Graph is cross-session workspace topology. That is a real distinction, so they
are not duplicates. But two things conflict:

- **Visual language:** the Graph uses a physics force-sim that jitters, which
  directly contradicts the reconstruction vision's "stable, deterministic, no
  physics jitter" guidance and the Obsidian "hairball" warning the research
  flagged.
- **Discoverability and investment:** the Graph is experimental, palette-only,
  and underbuilt (no pan/zoom, opaque interaction), so it reads as a half-built
  second graph rather than a clear workspace map.

---

## 3. Decision

**Keep both, with sharp role separation, and bring the Graph up to the same
visual discipline as 인과. Do not let either drift into the other's altitude.**

- **인과 owns single-session causality.** It never becomes a workspace map.
- **The Graph owns cross-session / project topology**, the thing no other
  surface provides (how sessions, projects, and recurring decisions/issues
  relate across the workspace). This is genuinely valuable and non-redundant.
- **Align the Graph to the visual system:** replace the jittering force-sim with
  a stable, deterministic layout (or at least freeze it after settling), add
  pan/zoom, and adopt the shared node vocabulary/tones and the encoding ladder
  (weight/opacity before color). It should look like the same product as 인과,
  one altitude up.

### If the Graph cannot earn its place

If, on review, the cross-session map does not justify the build (the
project-aggregate timeline may cover "across sessions over time" more
honestly), then **retire it, do not delete it** (project rule): unwire it from
the palette but keep the code reachable. Do not leave a jittering experimental
graph shipping as if finished.

---

## 4. Criteria behind the recommendation

- **Non-redundancy:** different altitude (within-session vs cross-session) is a
  real, defensible split. Two graphs at the *same* altitude would not be.
- **Honesty:** a palette-only, half-built, jittering surface violates the
  "no fake/unfinished controls" spirit. Either finish it to the visual bar or
  retire it.
- **One visual language:** whatever ships must read as the same product
  (shared vocabulary, no physics jitter, encoding ladder).
- **Avoid the hairball:** the cross-session map must default to focused/local
  views (a project's neighborhood), never "render the entire workspace as one
  force graph" (the research's sharpest warning).

---

## 5. Relationship to the project-aggregate timeline

The [project-aggregate timeline](project-aggregate-timeline-spec.md) answers
"this project's work **over time**." The workspace Graph would answer "how
things **relate** across sessions/projects" (topology, not chronology). They are
complementary lenses on the cross-session level, the same way 흐름 (time) and
인과 (causality) are complementary within a session. If only one cross-session
surface can be afforded, the **timeline is the safer first build** (honest,
chronological, less hairball risk); the Graph follows only if topology proves
genuinely needed.

---

## 6. Open questions

- **Does the workspace need a topology map at all yet**, or is the
  project-aggregate timeline enough for now? (Lean: timeline first; revisit the
  Graph after.)
- **If kept, what is the Graph's default scope** to avoid the hairball: one
  project's neighborhood, or the whole workspace with aggressive clustering?
  (Lean: one project / focused neighborhood.)
- **Layout engine:** a deterministic layered/clustered layout, or a force-sim
  frozen after settling? (Lean: deterministic, matching 인과.)
