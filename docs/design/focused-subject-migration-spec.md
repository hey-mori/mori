# Focused Subject · Migration Path Spec

A buildable spec for converging Mori's ad-hoc deep-link/focus fields onto one
typed "focused subject," incrementally and backward-compatibly. This is the
plumbing the interaction model rests on; doing it first makes the lab's
shared-subject, the timeline's discoverability fixes, and the product-wide
drill-through one mechanism instead of three. Design spec, not yet implemented.

Parent: [`interaction-navigation-model.md`](interaction-navigation-model.md)
(§1, §3).

---

## 1. Where we are

The store already models "focus a subject, then route there," but each path was
added on its own:

- `selectedEventId: string` (+ clears `inspectorCollapsed`): the timeline's
  selected event. Well-worn, used across the timeline render model.
- `reviewFocus: ReviewSelection | null`: one-shot, opens Review on an
  issue/decision/next-action, also sets `currentView:"session"`,
  `sessionTab:"insights"`.
- `memoryFocus: { memoryId } | null`: one-shot, deep-links Memory.
- `productFlow` router: maps a capability id to `{ currentView, sessionTab }`.

They differ in shape, side-effects, and clearing. The lab has no cross-surface
focus at all. The goal is one shape, one clearing discipline, two tiers.

---

## 2. Target shape

```ts
type FocusedSubjectType = "event" | "decision" | "issue" | "nextAction"
  | "artifact" | "memory";

type FocusedSubject = { type: FocusedSubjectType; id: string };
```

Two tiers, deliberately kept separate (interaction model §3):

- **App-level focus request** (store): a one-shot `focusRequest:
  FocusedSubject | null`. A surface consumes it on mount/route and immediately
  clears it, so it never re-fires on the next visit. This generalizes
  `reviewFocus` and `memoryFocus`.
- **Surface-local focus** (component state): the lab's focused moment, a
  timeline selection within a session. Never in the store; survives
  lens-switches, does not leak across surfaces.

---

## 3. Migration order (each step additive and shippable)

The discipline: add the new path beside the old, migrate one consumer, test,
then remove the old field. Never a big-bang rename.

**Step 0 · Define the type.** Add `FocusedSubject` and a helper
`requestFocus(subject, route?)` to the store. No behavior change, nothing
consumes it yet.

**Step 1 · Migrate `memoryFocus` (smallest, single consumer).** Memory reads
`focusRequest` when `type === "memory"`, clears it on consume. Keep
`memoryFocus` as a thin alias for one release, then delete. Proves the
one-shot-consume pattern on the lowest-risk path.

**Step 2 · Migrate `reviewFocus`.** `ReviewSelection` becomes a `FocusedSubject`
with `type` in `issue | decision | nextAction`. The Review surface consumes and
clears; the route side-effect (`session`/`insights`) moves into the
`requestFocus(subject, { view, tab })` call. Update the existing callers.

**Step 3 · Decide on `selectedEventId`.** It is well-worn and works. Two options:
keep it as the timeline's *surface-local* focus (it already is, effectively), or
alias it to a `FocusedSubject` of `type:"event"` for cross-surface deep-links
(e.g. a peek's "흐름에서 보기"). Recommendation: keep it local, and add a
`requestFocus({type:"event", id}, {view:"session", tab:"flow"})` path only when a
real cross-surface event deep-link ships. Do not churn a working path for
symmetry alone.

**Step 4 · Surface-local focus in the lab.** `TimelineLabView` holds
`focused: FocusedSubject | null` in local state, passed to every lens; lens
switch preserves it (lab vision §4.0). No store involvement.

**Step 5 · Peek wiring.** The peek drawer (its own spec) takes a
`FocusedSubject` and a content resolver; consumers pass surface-local subjects
to peek (Move B) and `requestFocus` to deep-link (Move A).

---

## 4. Invariants and risks

- **One-shot means consumed-then-cleared.** A request must clear on consume
  (in an effect on the destination) so navigating back does not re-trigger it.
  This is the single most important correctness rule; test it explicitly.
- **No double mechanism.** After migration, `reviewFocus`/`memoryFocus` are
  gone, not left as a parallel path.
- **Backward compatibility of persisted state.** None of these are persisted to
  storage (they are transient UI intent), so there is no schema migration; the
  default initial value is `null`.
- **Route + focus atomicity.** `requestFocus(subject, route?)` sets both in one
  `set(...)` so the destination never renders for a frame without its subject.

---

## 5. Test plan

- `requestFocus` sets subject (+ route) atomically.
- a destination consumes the matching `type` and clears it; a non-matching
  surface ignores it.
- a consumed request does not re-fire after navigating away and back.
- migrated `memoryFocus` / `reviewFocus` paths reproduce prior behavior
  (regression tests on the existing flows before deleting the old fields).
- lab surface-local focus survives lens switches and never writes the store.

---

## 6. Open questions

- **`selectedEventId`:** migrate to the unified shape or leave local
  (recommended)? Decide when the first cross-surface event deep-link is needed.
- **Route encoding:** does `requestFocus` take an explicit `{view, tab}`, or
  derive the destination from `subject.type`? (Lean: explicit route arg, since a
  subject can be opened on more than one surface.)
