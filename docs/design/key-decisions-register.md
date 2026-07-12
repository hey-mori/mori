# Mori Improvement Program · Key Decisions Register

The planning set raises a set of open questions across nineteen documents. This
register collects the ones that actually need a human call into one place, with
my recommendation for each, so the program can be steered in a single pass
rather than doc by doc. Each row links the owning spec. Planning only.

Legend: **R** = my recommendation. Decisions are grouped by how much they
unblock.

---

## 1. Decide first (cross-cutting, unblock the most)

| # | Decision | Recommendation | Owner doc |
|---|---|---|---|
| 1 | Commit to "one instrument, one shared focused subject"? | **R: Yes.** It is the spine that makes lenses, timelines, and surfaces feel like one product. | interaction-navigation-model |
| 2 | Drill-through default: peek in place vs jump to another surface? | **R: Peek (Move B)** by default; deep-link only for genuine relocations. Keeps the 흐름/재구성 line. | interaction-navigation-model |
| 3 | Build the foundations (peek primitive + focused-subject) before features? | **R: Yes.** They are cheap plumbing the visible wins ride on. | focused-subject-migration, peek-drawer-primitive |
| 4 | Cross-session surface: timeline first, Graph later (or retire)? | **R: Project-aggregate timeline first** (honest, low hairball risk); Graph only if topology proves needed. | graph-vs-causal-decision |

---

## 2. Reconstruction lens decisions

| # | Decision | Recommendation | Owner doc |
|---|---|---|---|
| 5 | 계보 placement | **Decided: a 5th lens tab.** | decision-lineage-lens-spec |
| 6 | 계보 predicted-vs-actual depth | **R: Two honest columns in v1**, no algorithmic verdict; annotation later. | decision-lineage-lens-spec |
| 7 | 국면 temporal re-segmentation vs predictable kind-grouping | **R: Temporal chapters with look-ahead smoothing + a grouped fallback** when timestamps are missing. | phase-timeline-spec |
| 8 | 국면 look-ahead window N | **R: 2** (smooth enough without blurring short stages). | phase-timeline-spec |
| 9 | 서사 fold threshold / minimap side | **R: Fold runs >= 2; minimap on the right.** | narrative-readability-spec |
| 10 | 인과 critical path: one chain or many; default emphasis | **Shipped: one deterministic chain, subtle by default**, isolatable via the 핵심 경로 toggle. | causal-critical-path-spec |
| 11 | 맥동 primary health meter | **R: Grounded-vs-inferred** (trust is the spine); issue meter stays secondary. | pulse-enrichment-spec |

---

## 3. 흐름 timeline decisions

| # | Decision | Recommendation | Owner doc |
|---|---|---|---|
| 12 | Minimap: make it a real navigator or retire it? | **R: Make it real** (it also delivers zoom). | timeline-minimap-zoom, timeline-flow-improvement-plan |
| 13 | Day / Week controls | **R: Remove from the session toolbar** (calendar scope belongs to the project timeline). | timeline-minimap-zoom |
| 14 | Empty lanes: slim collapsed bands or full-height even grid? | **R: Slim collapsed bands**, browser-verified, so active lanes get room. | timeline-flow-improvement-plan |
| 15 | Density toggle truth-check | **Action: verify whether it is actually wired**; if not, wire it or move it to planned. | timeline-flow-improvement-plan |
| 16 | Relationship visibility | **R: Keep hidden-by-default, add a 관계 보기 toggle** (calm preserved, graph discoverable). | timeline-flow-improvement-plan |

---

## 4. Visual / foundation decisions

| # | Decision | Recommendation | Owner doc |
|---|---|---|---|
| 17 | Phase 1 order | **R: Build the empty-state + trust/attention primitives first**, then adopt during the shell pass. | phase1-visual-pass-checklist |
| 18 | Attention-marker form (dot vs tint vs trailing dot) | **R: Decide once in the browser, apply uniformly** (semantic, never purple, never a left bar). | phase1-visual-pass-checklist, visual-system-direction |
| 19 | Motion + soft-radius token promotion | **R: Promote tokens once timings/radii recur**, not preemptively. | visual-system-direction |

---

## 5. Product / scope decisions

| # | Decision | Recommendation | Owner doc |
|---|---|---|---|
| 20 | Git diff: inline vs peek | **R: Peek for large diffs, inline for small**, gated by `rawRetention`. | git-diff-viewer-spec |
| 21 | Flat JSON/CSV export next to `.mori` | **R: Low priority**; verify it does not muddy the one-package story. | product-improvement-plan |
| 22 | Workbench: invest or park? | **R: Park** (least-developed, overlaps session views). | product-improvement-plan |
| 23 | Reports HTML then PDF; OS-native notifications | **R: Planned, mostly engineering**; sequence after the connective wins. | product-improvement-plan |
| 26 | Personal-memory direction | **Decided 2026-07-13: Mori grows beyond coding into a personal memory system; coding stays the strongest use case.** Governance, IA, and validation details remain proposals in the owner doc. | mori-personal-memory-direction |

---

## 6. Process

| # | Decision | Recommendation |
|---|---|---|
| 24 | Commit the planning set now? | The 19 docs are uncommitted. **R: Commit as one `docs:` change** when you are ready, so the plan is on the record before any build. |
| 25 | Where to start building | **R: Phase 1 foundations** (visual primitives + the focused-subject/peek plumbing), which everything else rides on, after settling rows 1-4. |

---

## 7. How to use this

Rows 1-4 are the ones worth deciding before any code, because they shape
everything downstream. The rest can be settled per spec as that spec comes up
for build. Where a row says "Decided," it is already resolved in its doc; where
it says "Action," it needs a quick code check rather than a judgment call.
