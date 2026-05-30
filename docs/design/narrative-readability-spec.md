# 서사 · Minimap and Importance Folding (spec)

A buildable spec for the Phase 3 readability upgrade to the 서사 lens: make a
long session read like a story instead of a flat list, with a shape minimap, an
importance hierarchy, and folding of routine runs. It directly answers the
original pain ("I can't follow the flow").

**Status: partially implemented.** The importance tiering (`momentTier`) and the
routine-run folding shipped in `NarrativeStoryView`. The shape minimap and the
sticky phase header (§2.3, §3) remain a follow-up.

Parent: [`reconstruction-lab-vision.md`](reconstruction-lab-vision.md) (§4.3),
[`visual-system-direction.md`](visual-system-direction.md) (§4 encoding ladder).
Code: `src/lib/timeline-lab/narrative.ts`, `NarrativeStoryView.tsx`.

---

## 1. What exists, and what is missing

`buildNarrative` already produces ordered moments, each with `kind`, `tone`,
`importance` (`EventImportance` from `getEventImportance`), `trustLevel`,
elevated `decisions`/`issues`, the incoming causal `connection`, and evidence
chips. The view renders them as one flat `<ol>`.

Missing: a 6-moment session and a 600-moment session render identically. There
is no shape overview, no emphasis hierarchy, and no way to fold the routine
beats so the pivotal ones lead.

---

## 2. Three additions (one pure helper, two view concerns)

### 2.1 Importance tiering (pure)

Collapse the existing signals into a 3-tier score per moment, pure and
deterministic:

```ts
type MomentTier = "pivotal" | "notable" | "routine";

function momentTier(m: NarrativeMoment): MomentTier
```

- **pivotal:** has a decision or an issue, or `importance` is the top tier, or
  produces an artifact.
- **notable:** mid `importance`, or carries a causal `connection`, or verified
  trust with substance.
- **routine:** everything else (a low-importance step with no decision/issue).

This is a pure mapping over data already on the moment; no new domain access.
Expose it on the narrative model so both the spine and the minimap share it.

### 2.2 Routine folding (view)

Collapse **contiguous runs** of `routine` moments into one disclosure: "작업
N개 더 ▶" (reuse the `<details>` convention). Rules:

- A run is two or more consecutive routine moments with no decision/issue.
- Pivotal and notable moments never fold and always render.
- The causal `connection` into the first post-fold moment is preserved, so the
  thread does not break across a fold.
- Default collapsed; expanding reveals the run inline.

### 2.3 Shape minimap (view)

A slim right-edge rail summarizing the whole story:

- One tick per moment, height/weight by tier (pivotal tallest), colored by
  `kind` tone, monochrome otherwise. No thumbnails.
- Faint phase bands behind the ticks (reuse `buildPhases` groupings) so the arc
  is visible.
- A draggable viewport box; click a tick to scroll its moment into view.
- Calm, narrow (~10-14px), portal-free (it is part of the lens, not an overlay).

---

## 3. Visual treatment (encoding ladder)

Per the visual system, emphasis is weight/size/opacity before color:

- **pivotal:** full card, heavier title, evidence + elevated tags shown.
- **notable:** standard card, regular weight.
- **routine (when expanded):** one muted single-line row (time + title), no
  card chrome.
- **Trust:** verified solid / observed lighter / inferred dashed border, the
  shared trust marker. No new color, no left bar.
- **Sticky phase header:** the current phase label stays `position: sticky`
  while its moments scroll under it, with a gentle emphasis on the focused
  moment (via `IntersectionObserver`). Single input: scroll.

---

## 4. Interaction

- Clicking a moment sets the lab's surface-local focused subject (other lenses
  follow); evidence chips **peek** their source (Move B), never jump away.
- The minimap is a scroll/seek aid only; it does not change focus by itself.
- Folds remember their open/closed state for the session view's lifetime (local
  state), not persisted.

---

## 5. Honesty and edge cases

- A short session (all moments pivotal/notable) folds nothing and shows no
  "N개 더"; the minimap still renders but is sparse, which is honest.
- Missing timestamps: the minimap omits phase bands gracefully; ordering falls
  back to the existing stable sort.
- A run of exactly one routine moment does not fold (folding a single item adds
  friction without saving space).

---

## 6. Test plan

- `momentTier` mapping: pivotal when decision/issue/artifact or top importance;
  routine only when low and unanchored; notable otherwise.
- fold-run detection: contiguous routine runs of length >= 2 fold; pivotal/
  notable never fold; single routine does not fold.
- the causal `connection` into the first visible post-fold moment is preserved.
- minimap tick model: one per moment, tier-weighted, kind-toned, deterministic.
- short all-pivotal session: zero folds.

View interactions (sticky header, scroll-into-view, peek) get light RTL
coverage; no screenshot tests.

---

## 7. Open questions

- **Fold threshold:** runs of >= 2 (recommended) or >= 3 before folding?
- **Minimap placement:** right rail (recommended, matches reading direction) or
  left? And does it persist scroll position when switching lenses (default no)?
- **Tier inputs:** is `getEventImportance` enough, or should artifact-producing
  moments always be pivotal regardless of importance? (Lean: artifact => at
  least notable.)
