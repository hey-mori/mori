# Mori · Product-Wide Improvement Plan

Forward-looking design note covering the whole app outside the two timelines.
It is a planning document, not an implementation spec. It records an honest read
of where Mori is mature and where it is thin, a ranked set of feature
opportunities (separating already-planned work from new judgment), and
cross-cutting visual themes, all filtered through the product thesis, the brand
rules, and the explicit non-goals.

Companion reading: [`../mori-project-goal.md`](../mori-project-goal.md)
(sections 4 implemented, 5 gaps, 13 roadmap, 14 non-goals),
[`../feature-status.md`](../feature-status.md),
[`mori-brand-identity-reference.md`](mori-brand-identity-reference.md),
[`timeline-flow-improvement-plan.md`](timeline-flow-improvement-plan.md) and
[`reconstruction-lab-vision.md`](reconstruction-lab-vision.md) (the two
timelines are planned separately).

---

## 1. Overall verdict

Mori's core loop is mature: import → evidence → review → memory → reports works
end to end, and the surfaces that carry it (Start Session, Evidence Hub, Review,
Project Memory, Consolidation Review, Reports) are feature-rich and honest about
their status. Visual polish is high and consistent with the calm Linear/Notion
target. The product is close to "ready for early adopters" on the surfaces that
matter most.

So the opportunity is not "build more core capability." It is **make the mature
surfaces feel connected and finished**: interactivity and drill-through between
surfaces, batch operations for scale, narrative empty states, honesty badges
spread consistently, and a few genuinely missing power features. The biggest
risk is scope creep into the non-goals (cloud, team, email, surveillance), so
§5 is an explicit "do not build" list.

A maturity snapshot (from a full read of the surfaces):

| Tier | Surfaces |
|---|---|
| Rich | Home, Project, Workspace, Sources, Review, Reports, Memory + Consolidation, Settings, Start Session, Review-Import |
| Partial | Evidence Hub, Companion/Notifications, Connections, Dashboard, Graph |
| Thin / experimental | Account, Workbench |

---

## 2. Top feature opportunities (ranked, filtered)

Tagged `[planned]` (already on the roadmap or feature-status) or `[new]` (my
judgment). Filtered to stay on-thesis and inside the non-goals.

1. **Narrative empty states across every surface** `[new]`, low effort. Every
   empty surface uses a generic "no data" template. Make each context-aware and
   action-led: Home → "가져오기로 시작하세요" to Sources; Review with empty
   columns → a calm "모두 확인했어요" rather than a blank that reads as broken;
   Evidence → "위 타임라인은 이 자료에서 만들어집니다." Highest
   polish-per-effort win in the app, and it guides new users through the loop.

2. **Cross-surface drill-through** `[new]`, low to medium. The surfaces compute
   the same objects but do not link between them. A synthesis decision on the
   Project page should open Memory focused on that decision, ready to edit. A
   Workspace inspector's "3 issues" should open them. The Home/Dashboard heatmap
   should filter sessions to the clicked date. This turns siloed pages into one
   navigable product (the same "one instrument" idea as the 재구성 vision).

3. **Git diff inline viewer in Evidence Hub** `[new]`, medium. Git imports are
   the most concrete evidence Mori holds, yet they show as text/summary. Render
   the unified diff with +/- counts and light syntax emphasis so evidence is
   truly inspectable in place. Strongly on-thesis ("evidence is the source of
   truth"); strictly local.

4. **Batch session operations** `[new]`, medium. Workspace and Dashboard should
   support multi-select then archive / move-project / tag. Today every action is
   one at a time, which strains past a few dozen sessions. Note: deletion stays
   a retire/archive, never a hard delete (project rules).

5. **PDF / HTML report export** `[planned]`, medium to high. Already planned and
   honestly disabled. Reports are the exit ramp to stakeholders; HTML is the
   cheaper first step, PDF the harder. Keep it local (no email/cloud).

6. **Queryable-memory inline snippets** `[new]`, low. Memory Search results show
   title + source refs only. A two-line excerpt of the actual decision/issue
   text lets the user vet a hit without drilling in. Small, high daily value.

7. **OS-native notifications (Tauri)** `[planned]`, low to medium. Companion
   signals are in-app only; a quiet OS toast when a session is ready to report
   or memory needs review fits the existing producer-neutral seam. Must stay
   calm and opt-in (no notification spam, a stated non-goal).

8. **Detected-conversation preview depth** `[new]`, low to medium. The Start
   Session detected-conversations modal previews text only. Show a structured
   summary (message count, span, dominant activity) so the user picks the right
   conversation with confidence before importing.

9. **Accepted-memory flat export (JSON/CSV)** `[new]`, low. Complement the
   `.mori` package with a flat local export for the user's own spreadsheet/BI
   use. Local-only, additive. Lower priority; verify it does not duplicate the
   `.mori` round trip's purpose.

10. **Stale / contradicted memory prominence** `[new]`, low. The lifecycle
    statuses exist but render subtly. A calmer-but-clearer "비활성 메모리"
    treatment (semantic, not purple, not a left bar) helps the user trust which
    memory is current.

11. **Session comparison / diff** `[new]`, high. Two sessions side by side
    showing decisions/issues that differ ("did we re-solve the same problem?").
    Powerful but a large build and arguably Project-Memory-adjacent; park until
    the cheaper wins land.

12. **Graph stability + controls** `[new/partial]`, medium. The experimental
    force graph jitters and lacks pan/zoom. Either stabilize it (deterministic
    layout, pan/zoom, no physics drift, matching the 재구성 인과 guidance) or
    keep it explicitly experimental. Decide its role vs the 재구성 인과 lens to
    avoid two overlapping graphs.

---

## 3. Per-surface highlights (curated)

Only the most valuable note per surface; the full inventory informed the ranked
list above.

- **Home** (rich): add heatmap date drill-through (2); the focal "이어갈 작업"
  card could foreground a blocking issue or a decision needing review.
- **Project** (rich): synthesis rows are read-only, wire them to Memory (2); add
  batch session cleanup (4).
- **Workspace** (rich): the right inspector shows counts but no drill-through to
  content (2); add batch operations (4).
- **Sources** (rich): planned connectors honestly disabled but with no setup
  entry point; add a calm setup-doc hotlink. Thin per-provider inspector copy.
- **Evidence Hub** (partial): the Git diff inline viewer (3) is the standout;
  add expand-all/collapse-all when many sources are present.
- **Review** (rich): add per-column filters at density; empty columns need the
  narrative-empty treatment (1).
- **Reports** (rich): show a preview of what will be generated before export;
  PDF/HTML (5).
- **Memory + Consolidation** (rich): inline search snippets (6); clearer
  non-current memory treatment (10).
- **Settings** (rich): on AI-provider test failure, show the actual error, not
  just a status; a local settings export for backup.
- **Companion / Notifications** (partial): OS-native toasts (7); producer-level
  filtering once the feed grows; deep-link highlight to a signal's context.
- **Start Session** (rich): richer detected-conversation preview (8);
  quick-jump to the last-used project.
- **Connections** (partial): show dedupe warnings in the work-bundle preview
  (how many events are already imported).
- **Dashboard** (partial): sparkline hover values; make the opaque "attention
  score" explainable.
- **Graph** (partial): see (12).
- **Account** (thin): local profile backup/export; fine to stay minimal.
- **Workbench** (thin/experimental): decide whether to invest (preset
  save/load, focus-a-panel) or keep it parked. Lowest priority.

---

## 4. Cross-cutting visual themes (brand-safe)

Recurring issues across surfaces. Each recast to fit the brand rules (no
left-accent bars, purple is brand-only, status colors semantic, copy-diet via
`InfoHint`).

- **Narrative empty states (system-wide).** Roughly a dozen surfaces share one
  generic empty template. Make them context-aware and action-led (see 1). This
  is the single biggest perceived-polish lever in the product.
- **Spread the data-basis honesty badge.** Memory already carries a
  `dataBasis` badge ("active only / active+saved / metadata only"). The same
  honesty should appear wherever a surface aggregates partial data (Dashboard
  cells, report preview, project synthesis), so the product never silently
  overclaims its reach.
- **One attention treatment, brand-safe.** Review uses a `!` on unconfirmed
  decisions, issues show "open," next actions show checkboxes. There is no
  single "needs attention" signal. Standardize on one calm treatment, a
  semantic dot or a soft tint, never a left-border bar and never purple.
- **Inspector metadata consistency.** Evidence, Sources, Workspace, and Project
  right-inspectors mix horizontal and vertical metadata strips. Three small
  fields on one line get tight near 1024px. Standardize toward vertical stacks
  that survive responsive resize.
- **Verified vs inferred legibility.** Synthesis and matrix rows do not show
  which items are verified memory vs still inferred, or recurring vs
  session-specific. A calm trust/recurrence marker (semantic, low-chroma) would
  add real scannability. This is the same unified trust-encoding idea as the
  재구성 vision; sharing one system across surfaces is the point.
- **Keyboard and focus.** Form-heavy surfaces (Settings, Consolidation Review)
  and the search fields lack tested focus-visible states and tab order. A pass
  for visible focus rings and sane tab order is a quiet accessibility win.
- **Notification grouping.** The feed groups only by time. At volume, add
  producer-level grouping or a tag filter so the user can scan "just memory
  alerts."

---

## 5. Explicit non-goals (do not build, even if tempting)

From the project goal §14, reinforced because some natural-seeming features
cross these lines:

- No cloud sync, no accounts, no server, no OAuth. Cross-device is `.mori`
  export/import only.
- No email/share integrations on Reports. Export a file; the user sends it.
- No team/shared memory beyond the `.mori` round trip.
- No background watchers, daemons, or auto-capture. Every artifact enters by an
  explicit user action.
- No hard deletes of sessions or memory. Retire/archive only; history is
  append-only.
- No gamification (streaks-as-trophies, badges, confetti). Activity surfaces
  stay calm, informational context.
- No second force-directed "see everything" graph that competes with 재구성's
  인과 lens.

---

## 6. Suggested sequencing

Cheapest, broadest polish first; connective interactivity next; the few real new
capabilities after; large builds last. Each ships as its own validated, tested,
browser-checked increment.

1. **Narrative empty states** (1) and the **brand-safe attention + data-basis
   badges** (4). Broad perceived-polish lift, low risk, touches many surfaces.
2. **Cross-surface drill-through** (2): heatmap dates, synthesis to Memory,
   inspector counts to content. Makes the app feel like one product.
3. **Evidence: Git diff inline viewer** (3) and **memory search snippets** (6).
   On-thesis, daily value.
4. **Batch session operations** (4) and **detected-conversation preview depth**
   (8).
5. **Reports HTML then PDF** (5) and **OS-native notifications** (7).
6. **Larger / decide-first:** session comparison (11) and the Graph's role
   (12). Resolve overlap with 재구성 before investing.

---

## 7. Open questions

- **Drill-through model:** deep-link via the existing store (set focus + switch
  surface), or a lighter in-place peek? (Mirror the same decision raised for the
  재구성 lab so the two stay consistent.)
- **Graph vs 인과:** keep the experimental force graph, or fold its intent into
  the 재구성 인과 lens and retire it? Two graphs is one too many.
- **Workbench:** invest or park? It is the least-developed surface and its job
  overlaps the session views.
- **Export breadth:** is a flat JSON/CSV export (9) worth it next to `.mori`, or
  does it muddy the "one durable package" story?
