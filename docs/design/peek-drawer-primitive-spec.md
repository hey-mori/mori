# Peek Drawer · Primitive Spec

A buildable spec for the reusable "peek" primitive that the interaction model
depends on: a non-blocking right-side overlay that shows a subject's detail in
place and returns the user to exactly where they were. It is the concrete form
of **Move B (peek)** and the thing that lets the 재구성 lab show evidence
without jumping to 흐름. Design spec, not yet implemented.

Parent: [`interaction-navigation-model.md`](interaction-navigation-model.md)
(§2 Move B, §3 focused subject). Visual: [`visual-system-direction.md`](visual-system-direction.md).

---

## 1. Why a new primitive (and not an existing one)

Mori already has three overlay-ish patterns, none of which fit "glance without
leaving":

- **`EventInspector`** is sticky *in layout* (part of the timeline grid), not an
  overlay, and is timeline-specific.
- **`Modal`** (`base-modal` / `project-modal`) is centered and **blocking**: it
  takes over the screen, which is wrong for a quick glance.
- **`InfoHint`** is a portal-rendered floating tooltip, right for a sentence of
  help, too small for a subject's detail.

The peek drawer fills the gap: **non-blocking, right-anchored, dismissable,
returns focus to origin, never changes `currentView`.** It is the reusable home
for "show me this issue / decision / event / artifact, then let me carry on."

---

## 2. Contract

Lives in the component layer: `src/components/ui/PeekDrawer.tsx` +
`PeekDrawer.css` (imported by `globals.css` in the component layer, before
feature sheets).

```ts
type PeekDrawerProps = {
  open: boolean;
  onClose: () => void;
  title: string;                 // header label
  glyph?: ReactNode;             // the object-kind icon (shared vocabulary)
  trust?: TrustLevel;            // renders the unified trust marker
  children: ReactNode;           // read-only detail content
  footerHref?: () => void;       // optional secondary "흐름에서 보기" deep-link
  labelledBy?: string;           // a11y
};
```

- **State lives in the caller**, as local UI state (`const [peek, setPeek] =
  useState<FocusedSubject | null>(null)`). The drawer is controlled. It never
  touches the store or `currentView`, which is what keeps it zero-coupling and
  makes it a pure Move B.
- **Content is read-only.** A peek shows; it never edits. Editing is a deep-link
  to the owning surface (`footerHref`).

---

## 3. Behavior

- **Open:** slides in from the right, ~120ms ease, opacity + small translateX.
  Respects `prefers-reduced-motion` (instant).
- **Dismiss:** `Esc`, a close button, and click/tap on the scrim outside the
  drawer all call `onClose`.
- **Focus management (a11y):** on open, move focus into the drawer; on close,
  **return focus to the element that opened it** (store the trigger ref). Trap
  focus within the drawer while open. `role="dialog"`, `aria-modal="false"`
  (non-blocking), `aria-labelledby`.
- **Non-blocking:** the underlying surface stays visible and is dimmed only
  faintly by a light scrim (not the heavy modal backdrop), reinforcing "you are
  still here."
- **One at a time:** opening a new subject replaces the current peek content
  rather than stacking drawers.

---

## 4. Geometry and visuals

- **Desktop:** right-anchored panel, ~360–420px, portal-rendered above content
  so no `overflow` ancestor clips it (same portal discipline as `InfoHint`).
  Full session height with its own `overflow-y: auto`, consistent with the
  Inspector's scroll behavior.
- **Narrow (≤ ~720px):** becomes a bottom sheet / full-width panel.
- **Header:** object glyph (shared vocabulary) + title + the unified trust
  marker (solid/lighter/dashed border per `visual-system §4`).
- **Body:** caller-provided sections, calm density, copy-diet.
- **Footer (optional):** a single secondary "흐름에서 보기" / "검토에서 열기"
  deep-link (Move A) for when glancing turns into committing.
- **Tone:** chrome dimmed, content carries contrast; light scrim; no left-accent
  bar; no decorative motion.

---

## 5. First consumers

1. **재구성 evidence peek.** A moment's evidence chip / a 계보 motivation chip
   opens the source detail in a peek. This is the concrete answer to "see the
   evidence without leaving the reconstruction."
2. **Review / Project card previews.** Peek a linked issue or decision from a
   card before deciding to open its full surface.
3. Later: any "linked item" across surfaces.

Building it for 재구성 first proves the contract on the lowest-coupling surface.

---

## 6. Test plan

Per repo policy (no brittle screenshot tests), test the state machine and a11y
with React Testing Library:

- opens when `open` flips true; renders title/glyph/trust.
- `Esc`, close button, and scrim click each fire `onClose`.
- focus moves into the drawer on open and **returns to the trigger** on close.
- focus is trapped while open; `aria-modal="false"`; labelled correctly.
- `footerHref` fires when present; absent footer renders nothing.
- reduced-motion path applies no transition.

The content resolver (mapping a `FocusedSubject` to display data) is a pure
function and gets its own colocated tests per consumer.

---

## 7. Open questions

- **Drawer vs bottom sheet breakpoint:** confirm the width threshold against the
  app's responsive bands (the timeline uses 1180px; the peek may want its own).
- **Scrim or no scrim on desktop:** a very light scrim aids focus but adds
  weight; verify in the browser which reads calmer.
- **Does peek ever need history (peek A → peek B → back)?** Default no (replace,
  not stack). Revisit only if a real flow needs it.
