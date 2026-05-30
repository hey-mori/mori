# 맥동 · Enrichment (spec)

A buildable spec for the restrained additions to the 맥동 lens: a single
directional health meter, confidence-aware stat emphasis, and a carry-forward
that reuses Mori's existing resume composer instead of passing a stored string
through. 맥동 is already the strongest lens, so this is deliberately small.
Design spec, not yet implemented.

Parent: [`reconstruction-lab-vision.md`](reconstruction-lab-vision.md) (§4.4),
[`visual-system-direction.md`](visual-system-direction.md). Code:
`src/lib/timeline-lab/pulse.ts`, `PulseView.tsx`,
`src/lib/report/resume-prompt.ts` (`buildResumePrompt`).

---

## 1. What exists

`buildPulse` produces stats (순간/결정/이슈/기간), a phase distribution, a trust
composition, an issue-resolution meter, an activity momentum sparkline, and a
carry block whose resume prompt is `summary.resumePrompt` passed through (via
the narrative continuation). It answers "what kind of session was this" well.

Three small, on-thesis additions.

---

## 2. One directional health meter

A single low-chroma bar above the stat tiles giving the at-a-glance verdict
(the "consensus meter" idea, de-gamified). Two candidate readings, both derived
from data `buildPulse` already has:

- **Grounded vs inferred** (from `trust`): how much of the reconstruction rests
  on verified/observed evidence vs inference.
- **Resolved vs open** (from `issues`): how settled the session left things.

Pick one as the primary meter (recommend grounded-vs-inferred, since trust is
the product's spine), the other stays the existing issue meter. Pure addition to
the `Pulse` model:

```ts
type PulseHealth = { groundedPct: number; label: string; tone: ActivityTone };
// grounded = (verified + observed) / total events; tone by band, low-chroma.
```

Visual: one quiet horizontal bar, semantic tone, no number-shouting, no gauge
cluster, no streak/badge.

---

## 3. Confidence-aware stat emphasis

Where a headline number is itself uncertain (mostly inferred), suppress its
emphasis toward neutral rather than rendering a bold figure that overclaims. Add
a per-stat confidence signal to `PulseStat`:

```ts
type PulseStat = {
  /* existing: id, label, value, detail, tone */
  emphasis: "full" | "muted";   // muted when the underlying items are mostly inferred
};
```

- `emphasis: "muted"` renders the value in a quieter weight; the precise basis
  lives in the tooltip ("대부분 추론 기반"). This applies the encoding-ladder
  rule (uncertainty suppresses emphasis, it does not add a color).
- Deterministic: derived from the trust mix of the items behind each stat.

---

## 4. Carry-forward reuses the existing composer

Today the resume prompt is `summary.resumePrompt` (a stored string). Mori
already has `buildResumePrompt(view: MockSession)`, a pure composer that
assembles last decisions, open issues, files touched, and next actions into a
structured prompt (used by Reports). The lab should **reuse it**, not reinvent:

- Offer the composed `buildResumePrompt(view)` as the carry-forward prompt
  (live from the reviewed session), with the stored `summary.resumePrompt` as a
  fallback when present.
- This keeps one source of truth for "how a session is summarized for
  continuation" and stays pure / zero-coupling (a function over `MockSession`).
- It also means the lab's carry-forward and the Reports resume prompt never
  drift apart.

---

## 5. Honesty and edge cases

- Health meter on a session with no events: omit (nothing to ground).
- All-verified session: the meter reads fully grounded, honestly.
- `buildResumePrompt` with empty sections still produces a valid prompt; the
  carry block already hides when fully empty.

---

## 6. Test plan (extend `pulse.test.ts`)

- `groundedPct` computed from the trust mix; band/tone mapping deterministic.
- stat `emphasis` is `muted` when behind-the-stat items are majority inferred,
  `full` otherwise.
- carry-forward prefers composed `buildResumePrompt(view)` and falls back to
  `summary.resumePrompt`.
- empty/edge sessions: no meter, valid carry-forward, no throw.

---

## 7. Open questions

- **Primary meter:** grounded-vs-inferred (recommended) or resolved-vs-open as
  the headline, with the other secondary?
- **`buildResumePrompt` boilerplate:** it currently emits English framing copy.
  For a Korean-first surface, do we add a Korean variant of the composer, or
  keep the prompt body (meant for pasting into an AI) as is? (Lean: keep the
  composer, revisit copy separately; the prompt is tool-facing, not UI chrome.)
- **Confidence threshold** for muting a stat: majority-inferred, or a stricter
  bar? Tune against real sessions.
