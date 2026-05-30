# Mori · Visual System Direction

Forward-looking design note that consolidates the visual decisions scattered
across the other planning docs into one coherent system. It is a planning
document, not an implementation spec. It is grounded in the real tokens
(`src/styles/tokens.css`), the brand color contract, and the layered CSS
architecture, and it exists so every future visual change pulls from one
direction instead of re-deciding per surface.

Companion reading: [`mori-brand-identity-reference.md`](mori-brand-identity-reference.md)
(the authority on brand vs semantics), [`../frontend-architecture.md`](../frontend-architecture.md)
(the layered CSS map), and the three improvement plans
([lab](reconstruction-lab-vision.md), [timeline](timeline-flow-improvement-plan.md),
[product](product-improvement-plan.md)).

---

## 1. The one idea: calm is built by subtraction, not flatness

Mori reads as a serious work tool when only one layer competes for the eye at a
time. The whole system below serves that: dim the chrome, let content carry
contrast, encode meaning with weight before color, and reserve color for a small
semantic vocabulary. The failure mode to avoid is over-flattening into
undifferentiated gray (which reads as unfinished), so one warm neutral and one
disciplined accent always do real work.

---

## 2. The token foundation (use these, do not hard-code)

The tokens already exist and are the only sanctioned values. New code uses them
rather than literals.

- **Neutrals (the surface ladder):** `--bg` `#f7f8fb`, `--panel` `#ffffff`,
  `--panel-soft` `#fbfbfd`, `--line` `#e7e9f1`, `--line-strong` `#d7dbea`. Depth
  comes from this ladder plus `--shadow-soft` / `--shadow`, not from borders
  everywhere.
- **Text:** `--text` `#111827`, `--muted` `#657085`, `--muted-2` `#98a1b3`. Three
  tiers, no more.
- **Brand:** `--purple` `#6246f5` with `--purple-50` / `--purple-100` tints, and
  the `--brand-gradient-*` pair used in exactly two places (app icon, sidebar
  mark). Gradient appears nowhere else.
- **Semantic + soft tints:** `--blue` / `--green` / `--red` / `--orange` /
  `--cyan`, each with a `-50` tint, plus `--gray-50`. The `-50` tints are the
  system for "tinted surface of this meaning" (the calm alternative to a bar or
  a saturated fill).
- **Radius:** `--radius-sm` 6px, `--radius-md` 8px (pills use the existing
  `999px` convention).
- **Spacing:** `--base-space-1..10` (4px to 40px). New layout uses the scale;
  no stray pixel values.

Gap worth closing: there is no token for a *very soft* large radius or for
motion timing. If those recur, promote them to tokens rather than scattering
literals.

---

## 3. The color contract (reinforced)

This is the brand identity's rule, repeated because it is the most-violated one
under pressure to "make it pop":

- **Purple is brand only:** identity, primary CTA, active nav, companion. Never
  the color of a status.
- **Trust:** verified = green, observed = blue, inferred = purple (inference is
  Mori's own reasoning, so it deliberately borrows the brand hue).
- **Work items:** issue = red/amber, decision = blue, next action = green.
- **Capability/runtime:** local = green, cloud = blue, planned = neutral slate,
  unavailable = muted/dashed.
- **Feedback:** success = green, warning = amber, danger = red.

If a new state needs distinction, it takes a *weight/opacity/shape* treatment
(§4) or reuses a semantic token. It never reaches for purple, and it never adds
a new hue.

---

## 4. The encoding ladder (color is the last resort)

When something needs to stand out (importance, trust, uncertainty, attention),
apply treatments in this order, stopping as soon as the distinction reads:

1. **Weight / size** (type weight, stroke width, number scale).
2. **Opacity** (the timeline's context tier at ~55% is the precedent; quiet,
   not washed out).
3. **Border style** (solid / lighter / dashed for verified / observed /
   inferred). Dashed = inferred/planned is already the runtime convention.
4. **A soft semantic tint** (`-50` token) for the surface.
5. **Motion** (a brief emphasis), sparingly.
6. **Color**, last, and only from the semantic vocabulary.

This ladder is what lets dense surfaces stay calm and keeps color meaningful.
Concretely it gives the lab its "critical path = heavier stroke, not a glow,"
its "importance = type weight, not a new color," and the product-wide
"attention = a calm dot, not a left bar."

### Unified trust / importance / uncertainty encoding

One system, shared by every surface and lens, so a verified decision looks the
same in 흐름, in 재구성, in Review, and in Memory:

- **Trust:** verified = solid border + full opacity; observed = lighter;
  inferred = dashed. (Plus the trust color only where a chip is warranted.)
- **Importance:** pivotal = full card + heavier title; routine = one muted line.
- **Uncertainty:** low confidence suppresses emphasis toward neutral rather than
  shouting; the precise number lives in a tooltip.

---

## 5. Chrome vs content (the shell discipline)

- **Dim the chrome.** Toolbars, tab strips, lens-switchers, and side rails sit
  in the muted register; the active content area carries full contrast. The
  timeline toolbar and the 재구성 lens-switcher are the first places to apply
  this.
- **Soften structure, do not delete it.** Prefer lowered border contrast
  (`--line` over `--line-strong`) and the surface ladder over hard 1px lines
  everywhere. Rounded corners over sharp.
- **One primary action per screen** in solid brand purple; everything else is
  ghost/secondary.
- **No AI-cliche accents.** No left-accent bar on selected cards/rows/tabs
  (`box-shadow: inset Npx 0 0`); use a calm tint or a full border. No decorative
  glow/sparkle around the brand mark or anywhere else.

---

## 6. Motion

- **Purposeful and brief.** ~120ms opacity/transform for state changes (lens
  cross-fade, peek open, focus emphasis). Enough to read as continuity, not as
  animation.
- **No decorative motion.** No looping, no twinkle, no confetti, no
  attention-seeking reveals (brand and non-goal rules).
- **Respect reduced-motion.** Honor `prefers-reduced-motion`; transitions
  degrade to instant.
- Promote a motion-duration token if timings start to recur across sheets.

---

## 7. Empty states (a system, not per-surface improv)

Roughly a dozen surfaces render empties; today they share a generic template.
The system:

- **Shape:** a lavender (`--purple-50`) icon chip, one calm line, and one
  action. This is the brand's stated empty-state treatment.
- **Context-aware copy:** the line names the next step in the loop, not "no
  data." Home → import from Sources; Review (empty columns) → a calm "모두
  확인했어요"; Evidence → "위 타임라인은 이 자료에서 만들어집니다."
- **Never a hard sell, never alarm.** Empty is often a *good* state (nothing to
  review). The visual should say so.

---

## 8. Iconography and object vocabulary

One glyph + tone per object kind (event/decision/issue/artifact/note),
identical across every surface and lens, so the lens-switcher and cross-surface
navigation feel like one product (the "one vocabulary" idea from the lab vision
and the interaction model). Decisions, issues, and artifacts should be
recognizable at a glance in 흐름, 재구성, Review, and Memory without re-learning.

---

## 9. Density and rhythm

- **Compact but readable.** Dense is fine when alignment is exact: vertically
  center trailing arrows/actions, keep a consistent vertical rhythm from the
  spacing scale, fixed slot heights so neighbors do not jitter (the timeline
  card rules are the model).
- **Density as discrete tiers, not a slider.** Where density is adjustable, it
  is a few genuinely distinct geometries (the timeline's comfortable / compact /
  dense), never a continuous control implying fake granularity.
- **Cut redundant metadata.** Prefer the single calmest honest signal over
  per-row dates, counts, and transient badges (a standing product rule).

---

## 10. The component layer is the enforcement point

Per the frontend architecture, reusable visual primitives live in
`src/components/ui/*.css` and feature screens in `src/styles/features/*.css`,
ordered by `globals.css`. To keep the system coherent:

- New reusable visual behavior (the peek drawer, the unified trust marker, the
  attention dot, the narrative empty state) becomes a **component-layer
  primitive**, reused across surfaces, not re-implemented per feature sheet.
- Reuse an existing token/primitive before adding one. New tokens are promoted
  deliberately (§2, §6), not scattered as literals.
- Source order is load-bearing; follow the cascade discipline when moving rules.

---

## 11. What to avoid (visual)

- Overpurpling: purple bleeding into status, or a mostly-purple surface.
- A new hue for a new state (use the encoding ladder or a semantic token).
- Left-accent bars, hover lift on dense cards, cards that resize on
  hover/selection.
- Decorative gradients (gradient is the icon + sidebar mark only), glows,
  sparkles, or any game-like flourish.
- Over-flattening into undifferentiated gray with no working accent.
- Always-on per-row timestamps/badges that add noise.

---

## 12. Suggested sequencing

1. **Shell discipline pass** (§5): dim chrome, calm the timeline toolbar and the
   lens-switcher. Broad, low-risk, immediate "finished" feel.
2. **Component-layer primitives** (§10): the unified trust/attention marker and
   the narrative empty-state component, so every surface inherits them.
3. **Encoding ladder applied** (§4) where surfaces currently reach for color or
   bars: lab critical path, attention signals, importance tiers.
4. **Motion + reduced-motion** (§6): the lens cross-fade and peek transition.
5. **Token promotions** (§2, §6) once motion timing and any soft-radius recur.

Each ships as its own validated increment, `style:check` + build clean, and
browser-checked at the affected widths.
