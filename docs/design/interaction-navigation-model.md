# Mori · Interaction and Navigation Model

Forward-looking design note that resolves the one fork every other planning doc
defers to: how the user moves between surfaces, and how a "thing I am looking
at" stays coherent as they move. It is a planning document, not an
implementation spec. The goal is one consistent model so 재구성, 흐름, and the
broader surfaces behave the same way, built on the deep-link pattern that
already exists in the store rather than inventing new plumbing.

Companion reading: [`reconstruction-lab-vision.md`](reconstruction-lab-vision.md),
[`timeline-flow-improvement-plan.md`](timeline-flow-improvement-plan.md),
[`product-improvement-plan.md`](product-improvement-plan.md).

---

## 1. What already exists (the precedent)

The app store already models "focus a subject, then route there" as one-shot
requests. This is the seed of the whole model:

- `selectedEventId` (+ `inspectorCollapsed` cleared on set): the focused event
  on the timeline; setting it opens the Inspector.
- `reviewFocus: ReviewSelection | null`: a one-shot request to open Review
  focused on a specific issue / decision / next action, which also sets
  `currentView: "session"` and `sessionTab: "insights"`.
- `memoryFocus: { memoryId }`: deep-link Memory to a specific accepted memory.
- `openSession(tab?)`, `setSessionTab(tab)`, `openProject(key)`,
  `requestStartRecords()`: surface-level routing helpers.
- `commandPaletteOpen` with open/close/toggle: a universal jump affordance.
- A `productFlow` router that maps a capability id to `{ currentView,
  sessionTab }`.

The problem is not that these are missing. It is that they are **ad hoc and
inconsistent**: each was added for one path, with its own shape, its own
side-effects, and no shared "clear focus" or "return" behavior. The 재구성 lab,
meanwhile, has no cross-surface focus at all. The model below makes the pattern
uniform.

---

## 2. The three navigation moves (and when to use each)

Every cross-content interaction in Mori should be exactly one of three moves.
Naming them is what makes the product feel consistent.

### Move A · Deep-link (route to a surface, focused on a subject)

Change `currentView` / `sessionTab` and carry a **focused subject** so the
destination opens already centered on the thing. This is the existing
`reviewFocus` / `memoryFocus` behavior, generalized. Use when the user is
*committing* to work on something elsewhere: a Project synthesis decision opens
Memory focused on it; a Review item opens with that item selected.

### Move B · Peek (see a subject in place, without leaving)

Open a transient side drawer or popover over the current surface, showing a
read-only detail of a subject, then dismiss back to exactly where you were. Use
when the user wants to *verify or glance*, not relocate: peeking at the evidence
behind a 재구성 moment, previewing a linked issue from a card. Peek never
changes `currentView`; it is local overlay state.

### Move C · Lens-switch (same surface, same subject, new projection)

Stay on the surface, keep the focused subject, change the *view* of it. This is
the 재구성 lens-switcher and the 흐름 타임라인/목록 toggle. The focused subject
must survive the switch (see §3). Use to look at one thing from another angle.

**The decision rule:** relocating work → A. Glancing to verify → B. Re-projecting
the same thing → C. Most "I want to see the evidence" cases are **B (peek)**,
which is why the 재구성 vision and the timeline plan both lean away from a hard
jump to 흐름: a peek keeps the reconstruction as home base and keeps the
흐름/재구성 line clean.

---

## 3. The focused subject

A single shared notion of "what am I looking at," so moves preserve context.

- **Shape.** A typed reference: `{ type: "event" | "decision" | "issue" |
  "artifact" | "memory", id }`. The existing `selectedEventId`,
  `ReviewSelection`, and `memoryFocus` are special cases that should converge on
  this one shape over time.
- **Scope.** Two tiers, deliberately:
  - *Surface-local focus* (e.g. the 재구성 lab's focused moment) lives in that
    surface's own state. It is pure, low-coupling, and survives lens-switches
    (Move C) but does not leak outward. This is the 재구성 vision's §4.0 shared
    subject.
  - *App-level focus request* (the deep-link, Move A) is a one-shot in the store
    that the destination consumes and then clears, exactly like `reviewFocus`
    today. One-shot, so it never gets stale or re-fires on the next visit.
- **Clear and return.** Every focus has a defined "cleared" state (the surface
  opens neutral, as 흐름 already does: it auto-selects nothing). A peek (Move B)
  has an explicit dismiss that returns focus to the originating element.

This converts the lab's deferred "shared focused moment" idea and the broader
app's "drill-through" idea into **one mechanism**: surface-local focus for
lens-switching, a one-shot store request for cross-surface deep-links, and a
peek overlay for glance-and-verify.

---

## 4. Resolving the recurring fork

The open question raised in all three sibling docs was: drill from a
reconstructed moment (or a synthesis row, or a card) by **jumping to another
surface** or by **peeking in place**? The model answers it by intent:

- **Within 재구성:** evidence and detail open as a **peek** (Move B). The lab
  stays the place you read the session; the peek shows the source without
  yanking you to 흐름. A hard jump to 흐름 is available but secondary (an
  explicit "흐름에서 보기"), never the default, so the 흐름/재구성 line stays
  intact.
- **Cross-surface (Project → Memory, Review item, Home heatmap → sessions):**
  **deep-link** (Move A), reusing the one-shot focus-request pattern. These are
  genuine relocations, so routing is correct.
- **Re-projecting one subject (lab lenses, timeline modes):** **lens-switch**
  (Move C) with a preserved surface-local focus.

Consistency rule: the *same gesture* should always mean the *same move*. A
single click selects/peeks; it never sometimes-navigates-away and
sometimes-peeks depending on the surface.

---

## 5. The command palette as the universal jump

`commandPaletteOpen` already exists. It should be the keyboard-first way to
execute any Move A (deep-link to a surface or a focused subject) and to run
actions. As surfaces grow, the palette is what keeps navigation flat instead of
deepening menus. Planned roles:

- Jump to any surface, session, or project.
- Jump to a focused subject ("open decision: …").
- Run the few real actions (run Quick Pass, export report, start session).
- Mirror the feature-status honesty: planned actions appear but are clearly
  disabled, never fake.

---

## 6. Keyboard and focus-visible model

A quiet but real gap across surfaces. The model:

- Every list/canvas with selection supports arrow-key movement and a visible
  focus ring (the timeline has the navigation logic but no visible ring today).
- `Esc` clears focus / closes a peek / closes the palette, consistently.
- One documented, discoverable shortcut set (a `?` overlay), so power-features
  (Flow Focus, lens-switch, palette) are learnable.
- Focus-visible states pass a basic contrast check (the product-wide plan flags
  this as an accessibility gap).

---

## 7. What to avoid

- A second, parallel focus mechanism. Generalize the existing one; do not add a
  third bespoke deep-link.
- Click-to-navigate-away as a default inside a reading surface (it smudges the
  흐름/재구성 line and loses the user's place). Default to peek.
- Stateful (non-one-shot) cross-surface focus that re-fires on the next visit.
  Deep-link requests are consumed once and cleared.
- Deep menu trees. Breadth lives in the command palette and in deep-links, not
  in nesting.

---

## 8. Suggested sequencing

1. **Converge the focus shape.** Introduce the typed focused-subject reference
   and migrate `reviewFocus` / `memoryFocus` / `selectedEventId` onto it
   incrementally (backward compatible, one path at a time).
2. **Peek overlay primitive.** A single reusable peek drawer/popover in the
   component layer, used first by 재구성 (evidence peek), then by Review/Project
   card previews.
3. **Surface-local focused subject in 재구성** (the lab vision's §4.0), now that
   the shape and peek primitive exist.
4. **Cross-surface deep-links** for the product-wide plan's drill-through
   (Project synthesis → Memory, Home heatmap → sessions), reusing the one-shot
   pattern.
5. **Command palette breadth + keyboard/focus-visible pass.**

Each ships as its own validated increment. The first two are pure plumbing and
a primitive; the visible wins follow on top.

---

## 9. Open questions

- **Peek surface form:** a right-side drawer (consistent with the existing
  Inspector geometry) or a centered popover? Drawer is likely more consistent.
- **How much of `selectedEventId` to migrate now** vs leave as the timeline's
  own well-worn path? (It works; migrate only if the unified shape clearly
  pays off.)
- **Does the surface-local focus ever need to persist across a full app
  navigation** (leave 재구성, come back)? Default no (opens neutral); revisit if
  users ask to "resume where I was."
