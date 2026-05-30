# 국면 · Temporal Re-founding (spec)

A buildable spec for the Phase 4 change that makes the 국면 lens actually
temporal. Today it buckets moments by *kind* (every decision lands in 결정), so
it is really 맥동's phase distribution redrawn and cannot show the arc over time
or revisits. This is the riskiest lens change (boundary detection is heuristic),
so the algorithm and its honest fallback are specced carefully. Design spec, not
yet implemented.

Parent: [`reconstruction-lab-vision.md`](reconstruction-lab-vision.md) (§4.2),
[`visual-system-direction.md`](visual-system-direction.md). Code:
`src/lib/timeline-lab/phases.ts`, `PhaseFlowView.tsx`.

---

## 1. The problem with today's 국면

`buildPhases` maps each moment's kind to one of five phases and groups them, so
the five columns are kind-buckets, not stages over time. A session that explored,
built, hit an issue, went back to explore, then verified shows one merged
"탐색" bucket, never the real back-and-forth. The cheapest legibility win in the
whole program, "time on a shared axis," is exactly what this lens throws away.

---

## 2. The change: chapters over time, not buckets by kind

Re-found the lens on **chapters**: contiguous stretches of the session
dominated by one phase-kind, in time order, allowed to repeat. The same arc
vocabulary (탐색·진단 / 결정 / 구현 / 점검·이슈 / 정리) is kept, but a phase can
appear more than once (explore → build → explore → verify), which is the point.

```ts
type PhaseChapter = {
  id: string;             // stable: `${phaseId}-${ordinal}`
  phaseId: PhaseId;       // explore | decide | build | verify | wrapup
  label: string;
  tone: ActivityTone;
  moments: NarrativeMoment[];
  startIso: string | null;
  endIso: string | null;
  spanLabel: string | null;   // "10:04 – 10:39"
  decisionCount: number;
  issueCount: number;
};

type PhaseTimeline = {
  chapters: PhaseChapter[];    // time-ordered, may repeat a phaseId
  mode: "temporal" | "grouped";  // honest about which path produced this
};

buildPhaseTimeline(view: MockSession): PhaseTimeline
```

---

## 3. Boundary-detection algorithm (the crux)

1. Order moments by `start` (the narrative order already does this). Each moment
   gets a phase-kind via the existing `phaseForKind`.
2. Walk the ordered moments, accumulating a current chapter. **Start a new
   chapter** when the phase-kind changes *and* the new kind persists for a small
   run (look-ahead of N, default 2), so a single stray moment does not fragment
   the arc. A lone off-kind moment is absorbed into the current chapter.
3. Close a chapter on a persisted shift or at the end. Record its span from the
   first/last moment timestamps.
4. Merge adjacent chapters of the same phaseId separated only by absorbed noise.

This yields a stable, readable arc with genuine revisits, while the look-ahead
smoothing prevents jitter (the main risk flagged in the lab vision).

### Honest fallback

If fewer than, say, two moments carry parseable timestamps, temporal ordering is
meaningless. Return `mode: "grouped"` and fall back to the current kind-grouping
(reuse today's `buildPhases`). The view labels the mode so it never implies a
temporal arc it cannot support. This is the honesty line.

---

## 4. View

- **Time spine.** Render chapters left to right along a real (collapsed-gap if
  needed) time axis, each chapter a band sized by its span or moment-count
  weight. The longest band is the visual hotspot: where the session spent
  itself. (This is the de-profiler-ized waterfall idea from the references.)
- **Repeats read as repeats.** A second 탐색 chapter sits later on the axis,
  visibly distinct from the first, so the back-and-forth is legible.
- **Expand on intent.** A band expands to reveal its moments (reuse the current
  column's moment list); collapsed by default.
- **Grouped-mode view.** When `mode === "grouped"`, render today's composition
  ribbon + columns unchanged, with a quiet note that time data was unavailable.

---

## 5. Visual treatment

- Bands use phase tone at low chroma; the active/hovered band lifts via the
  existing ribbon interaction, no left-accent bar.
- Gap elision between far-apart moments (if any within a session) uses the same
  quiet "· N분 후 ·" marker idea as the project-aggregate timeline, keeping time
  honest without dead whitespace.
- Decision/issue counts per chapter stay the calm metric chips already in
  `PhaseColumn`.

---

## 6. Honesty and edge cases

- All-one-kind session: one chapter, which is honest (it really was one stage).
- Missing timestamps: grouped fallback, labeled.
- Very short chapters (one moment): allowed, but the look-ahead smoothing keeps
  them rare; they render as a thin band.
- Deterministic: same input, same chapters (stable ordering, fixed look-ahead).

---

## 7. Test plan (extend `phases.test.ts`)

- a session that goes explore → build → explore → verify yields four chapters in
  that order, with two distinct `explore` chapters.
- look-ahead smoothing: a single stray off-kind moment inside a build run does
  not start a new chapter.
- adjacent same-phase chapters separated only by absorbed noise merge.
- spans computed from first/last moment timestamps per chapter.
- timestamp-poor session returns `mode: "grouped"` and matches today's
  `buildPhases` output.
- determinism across runs.

---

## 8. Open questions

- **Look-ahead window N:** 2 (recommended) or 3? Larger N is smoother but blurs
  short genuine stages. Tune against real sessions.
- **Band sizing:** by time span or by moment count? Time span is more honest but
  a 2-minute decision stage can vanish; consider a minimum band width.
- **Keep grouped mode reachable** even when temporal works (a toggle), or only
  as a fallback? (Lean: fallback only, to avoid a redundant control.)
