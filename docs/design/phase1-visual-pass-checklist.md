# Phase 1 · Visual Pass Checklist

A concrete, per-surface checklist for the Phase 1 "foundations and broad polish"
work: the shell-discipline pass (dim chrome, content carries contrast), plus the
two component-layer primitives every surface then inherits. It turns the visual
system direction into a verifiable to-do list. Design spec, not yet implemented.

Parent: [`visual-system-direction.md`](visual-system-direction.md),
[`improvement-program-overview.md`](improvement-program-overview.md) (Phase 1),
[`product-improvement-plan.md`](product-improvement-plan.md) (§4).

---

## 1. Scope

Phase 1 is the lowest-risk, widest-reach pass: it touches many surfaces but
changes presentation only, no data or behavior. Three workstreams:

1. **Shell discipline** per surface (dim chrome, let content lead).
2. **Narrative empty-state component** adopted everywhere.
3. **Unified trust / attention marker** adopted everywhere.

Each ships as its own commit, `style:check` + build clean, browser-checked at
the responsive bands.

---

## 2. Shell-discipline checklist (per surface)

The rule: chrome (toolbars, tab strips, lens-switchers, side rails) sits in the
muted register; the active content area carries full contrast. Use `--line` over
`--line-strong`, the surface ladder over hard borders, one primary action per
screen.

- [ ] **App shell / sidebar** · nav in muted register; active item uses the
  lavender fill + purple text (brand rule), not a heavy block.
- [ ] **Session tab bar (흐름/재구성/etc.)** · tabs dimmed; active tab carries
  contrast; no left-accent bar.
- [ ] **흐름 toolbar** · group the planned/disabled controls (Day/Week/Zoom)
  behind the honesty line or an overflow; lead with the live controls (filter,
  density, search). Dim the toolbar relative to the canvas.
- [ ] **재구성 lens-switcher** · dimmed chrome; active lens chip calm; the
  filter bar quiet until active (already mostly true).
- [ ] **Inspectors (Event, Bundle, surface right-rails)** · header dimmed,
  content leads; consolidate disabled buttons into one planned line (timeline
  plan §3.1).
- [ ] **Home / Project / Workspace / Dashboard headers** · hero text leads;
  metric strips and toggles in the muted register.
- [ ] **Memory / Reports / Settings section headers** · consistent muted
  section-header treatment (reuse `base-section-header`).

Acceptance: on each surface, squint-test that exactly one layer carries
contrast; no two compete. Verify no `--line-strong` hard grids where the surface
ladder would read calmer.

---

## 3. Narrative empty-state component

Build one component-layer primitive, then adopt it. Contract: a lavender
(`--purple-50`) icon chip, one calm context-aware line, one optional action.

Per-surface copy (Korean-first, action-led, never alarm):

- [ ] **Home (no sessions)** · "가져오기로 시작하세요" → Sources.
- [ ] **Review (empty column)** · "모두 확인했어요" calm, no action needed.
- [ ] **Evidence (no sources)** · "위 타임라인은 이 자료에서 만들어집니다" →
  import.
- [ ] **Memory (no accepted memory)** · explain the consolidation gate, link to
  review.
- [ ] **Reports (nothing to export)** · point at running Quick Pass first.
- [ ] **Workspace / Dashboard (no projects)** · "프로젝트를 만들어 시작하세요".
- [ ] **재구성 lenses (no events)** · already calm; route through the same
  component for consistency.

Acceptance: every empty surface names the next step in the loop; none shows a
bare "데이터 없음".

---

## 4. Unified trust / attention marker

One component-layer primitive used by every surface and lens (visual system §4),
so a verified decision looks the same everywhere.

- [ ] **Trust marker** · verified = solid border/full opacity; observed =
  lighter; inferred = dashed. A shared component/util, not per-feature CSS.
- [ ] **Attention marker** · one calm signal for "needs your attention"
  (unconfirmed decision, open issue): a semantic dot or soft tint, never a
  left-accent bar, never purple.
- [ ] Adopt in: 흐름 cards + Inspector, 재구성 lenses, Review cards, Memory rows,
  Project/Workspace synthesis rows.

Acceptance: the same object reads with the same trust/attention treatment across
all surfaces; grep shows no per-surface re-implementation of the marker.

---

## 5. Verification (every item)

- `npm run style:check` and `npm run build` clean.
- Browser check at the documented bands (≥1600, 1180–1599, ≤1180) for any
  surface whose layout could shift.
- No regression to the card rules (no hover lift, no resize, no left bar).
- No new hard-coded colors or spacing literals; tokens only.

---

## 6. Open questions

- **Order within Phase 1:** primitives first (empty-state, trust/attention),
  then adopt during the shell pass, so each surface is touched once? (Lean: yes,
  build the two primitives first.)
- **Attention marker form:** a leading dot vs a trailing dot vs a soft row
  tint? Decide once in the browser and apply uniformly.
