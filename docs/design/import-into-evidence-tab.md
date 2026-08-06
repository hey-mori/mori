# Mori · Import folded into the Evidence (자료) tab

A flow redesign note. It records a decision to stop treating Import Review as a
transient, vanishing gate and instead make the **자료 (Evidence) tab one
persistent surface** that imports, lets you curate, and analyzes, with the
trust gate moved to where it actually belongs (durable memory).

Direction set by the user (2026-06-08). Durable design intent; for live
implementation status read `mori-project-goal.md` §4. This note supersedes the
parts of `imports.md` / the goal doc that describe Import Review as a
non-bypassable gate on *evidence display* (the gate's real subject is durable
memory, see §4 below).

---

## 1. What is wrong today (verified in code)

`src/features/evidence/EvidenceView.tsx` renders `ImportReviewView` inline only
while `pendingReview` is truthy. The flow:

1. Pick a conversation → `importAsNewSession` eagerly creates the session, then
   `beginPendingReview` parses it into a pending review.
2. The 자료 tab switches into a **review mode** (looks like a separate "가져오기"
   screen but it is the 자료 tab in a transient state).
3. Clicking **반영** (`applyPendingReview`) persists accepted events as an
   import and **deletes `pendingReview`** → the review screen is gone for good.
   취소 deletes it too.

Consequences the user hit, all real:

- **The import view cannot be revisited.** Once applied (or cancelled) the
  review draft is destroyed (`clearPendingReview`); there is no re-entry.
- **Events only exist after 반영.** Analysis (Quick Pass) runs on applied
  events, so "don't apply" = "can't analyze", and there is no "materialize the
  parsed elements later" path. The parse was already done; gating and then
  discarding it is the smell.
- **Eager session creation** before apply is what produced the orphan-empty-
  session navigation bug (patched separately via an App effect; this redesign
  removes the root cause).
- The review is a **separate disappearing mode** sitting next to the 자료 tab's
  own 분석 panel, instead of one coherent surface.

The root error: a **deterministic, faithful parse of the user's own
conversation** is gated behind a manual commit as if it were a risky AI
generation. It is not. Evidence should just appear.

## 2. The redesign: 자료 is one persistent surface

The 자료 tab owns the whole lifecycle of a session's evidence, always visible,
always revisitable:

1. **Import = immediate.** Picking a conversation materializes its events at
   once (the parse is already complete). The session opens with its timeline
   populated; nothing is staged-then-maybe-discarded.
2. **Curation is an always-available section, not a gate.** Trimming a noisy
   event, restoring one, editing a title, or re-running can happen any time, not
   only in a one-shot pre-apply window. "How this was imported" stays inspectable.
3. **Analysis lives in the same surface and is always runnable / re-runnable,**
   because events always exist. The existing 분석 panel (`QuickPassControl`)
   stays; the import review is absorbed beside it rather than replacing it.
4. **Secrets are flagged inline, not via a gate.** `containsLikelySecret`
   already detects them at parse; surface a redactable inline warning instead of
   blocking the whole import behind review.

## 3. Why this does not weaken the trust principle

"Review-before-apply" exists so that **AI may propose, only the user makes
memory durable** and so raw text is not silently captured. Its real subject is:

- **AI-derived items** (issues / decisions / relationships) · still proposals.
- **Durable project memory** (consolidation) · still a non-bypassable review
  gate. This is where "is this worth keeping as our knowledge" is decided.

Deterministic import events are **evidence**, and the goal doc already says
"evidence is the source of truth." Showing evidence is not "making memory
durable", so it does not need the gate. We are **relocating** the gate to where
it has teeth, not removing trust. No raw retention policy changes; secret
detection stays (now inline).

## 4. Slices (each its own validated, reversible step)

1. **Import materializes immediately. SHIPPED (2026-06-08).** New-session import
   callers (`ConnectionsView.handleImportAsNewSession`, `StartSessionView`'s
   records + paste handlers) now call the store action
   `importAndOpenAsNewSession` (importAsNewSession + addImport +
   commitPendingNewSession + primes the completion banner) instead of
   `importAsNewSession` + `beginPendingReview`. The 자료 tab shows sources +
   analysis at once, the timeline is populated, and the orphan root cause is
   gone (the session is committed as real work on creation). Secret detection is
   preserved on the `SourceRef` (`redactionStatus`); a prominent inline warning
   is slice 2. Still on the review path (unchanged this slice): "import into the
   **current** session" and the non-agent evidence families.
2. **Persistent curation section** in the 자료 tab: per-event include / trim /
   restore over the applied import (revisitable), replacing the transient
   per-event review. Inline secret flags.
3. **Retire `ImportReviewView`** as the standing import gate · keep it reachable
   (advanced / command palette) per the retire-don't-delete rule, not deleted.
4. **Docs reconciliation:** update `imports.md` and the goal doc so Import
   Review is described as optional curation, with the gate documented at
   consolidation only.

Open question: live / continuous apply (the user's "AI가 요소를 추가하면 계속
반영하며 가는" idea) layers naturally on slice 1 once import is gate-free, via the
existing foreground Live Follow. Tracked, not part of slice 1.
