# Project-Aggregate Timeline · Data Model Spec

A buildable spec for the planned project-level timeline: every session in a
project read on one surface, so a user sees a whole project's work over time
rather than one session at a time. This is the largest item in the improvement
program; the spec exists to settle the hard parts (the time axis, loading,
honesty, where it lives) before any code. Design spec, not yet implemented as
a canvas.

**Status (2026-10-10).** The project page's 흐름 now reads a project's whole
work over time as a day-by-day chronology of confirmed members (#239,
`buildProjectChronology`): each session on the day of its last activity with
its start day noted, quiet stretches marked, date-only records without a
clock. That answers this spec's first question (what happened in this project,
when) without a shared time axis. The aggregate swimlane canvas below remains
planned.

Parent: [`timeline-flow-improvement-plan.md`](timeline-flow-improvement-plan.md)
(§6), [`product-improvement-plan.md`](product-improvement-plan.md).
Honesty model precedent: [`../project-memory.md`](../project-memory.md)
(`dataBasis`).

---

## 1. The job, and the three hard parts

흐름 is per-session. A project (every session sharing a `sourceLabel`) has no
single timeline. The aggregate view answers "how did this project move over
days and weeks." Three hard parts decide the whole design:

1. **Time axis.** Sessions sit days apart. A literal absolute axis is mostly
   empty gaps; a naive concatenation loses the calendar truth.
2. **Loading and honesty.** Session bodies load async from localStorage / SQLite
   and may be partial. The view must never overclaim its reach.
3. **Where it lives.** It is not a mode inside 흐름 (which is session-scoped); it
   belongs to the Project surface.

---

## 2. Time axis (the crux), with a recommendation

Three candidate models:

- **A. Absolute calendar axis.** Honest but mostly empty: a project worked on
  for an hour a day for three weeks is 99% whitespace.
- **B. Session-segmented concatenation.** Sessions laid end to end, time within
  each. Compact but loses "these two sessions were three weeks apart."
- **C. Absolute axis with collapsed gaps (recommended).** Each session occupies
  its real span on a calendar axis; empty stretches between sessions collapse to
  a marked elision ("3일 후"), exactly the burst/gap-marker idea the
  per-session timeline already uses. Keeps calendar truth where there is
  activity, kills dead whitespace, and never invents timestamps (the
  time-honesty rule holds).

Recommendation: **C**. It is the only model that is both honest and legible, and
it reuses a pattern the timeline already has.

---

## 3. Reading model

- **Session bands over the collapsed-gap axis.** Each session is a labeled band
  (title, date, duration) on the shared axis; within a band, the existing
  lane/event/bundle model applies but heavily bundle-biased (a project has far
  more events than one session can show raw).
- **Lanes stay the canonical eight** (대화, 명령, 코드·파일, 리서치, 이슈, 검토,
  핸드오프, 노트), aggregated across sessions.
- **A project-pulse overview strip** at top (reusing the 맥동 idea at project
  scale): sessions, decisions, open vs resolved issues, span. The glance layer
  before the bands.
- **Drill:** clicking a session band deep-links (Move A) into that session's own
  흐름. The aggregate is for scanning across; the per-session timeline is for
  depth.

---

## 4. Data model (pure builder over already-loaded sessions)

Loading is async and shared with the memory path; the **builder is pure** and
operates on sessions already in memory.

```ts
type LoadedProjectSession = {
  meta: { id: string; title: string; startedAt: string; endedAt: string };
  view: MockSession | null;   // null when only metadata loaded (partial)
};

buildProjectTimeline(input: {
  sessions: LoadedProjectSession[];
  cap?: number;               // default 20, matching loadProjectMemorySessions
}): ProjectTimelineModel
```

```ts
type ProjectTimelineSegment =
  | { kind: "session"; id: string; title: string; startIso: string;
      endIso: string; lanes: AggregateLane[]; eventCount: number;
      decisionCount: number; openIssueCount: number }
  | { kind: "gap"; afterIso: string; beforeIso: string; label: string };  // "3일 후"

type ProjectTimelineModel = {
  segments: ProjectTimelineSegment[];      // chronological, gaps interleaved
  pulse: { sessions: number; decisions: number; issuesOpen: number;
           issuesResolved: number; spanLabel: string | null };
  dataBasis: ProjectTimelineDataBasis;     // honesty flag, see §5
  droppedSessionCount: number;             // beyond the cap, surfaced honestly
};
```

- Gap segments are computed from the sorted session spans; a gap renders only
  when the empty stretch exceeds a threshold (e.g. > 1 day), else bands sit
  adjacent.
- A `meta`-only session (body not loaded) still produces a band with counts from
  metadata, flagged so the UI dims it honestly.
- Pure and deterministic: no clock, no LLM; reuses the existing per-session
  lane/bundle helpers per session.

---

## 5. Loading and honesty

- **Reuse the memory loading path.** `loadProjectMemorySessions` already loads
  saved-session bodies (parallel, non-mutating, capped at 20) across localStorage
  and desktop SQLite. The aggregate timeline consumes the same loader, so it
  inherits the runtime-aware behavior for free.
- **`dataBasis` flag**, mirroring Project Memory:
  `activePlusSavedSessions | savedSessionMetadataOnly | partialSavedSessionLoad
  | unavailable`. The view carries a calm badge so it never overclaims ("3 of 7
  sessions loaded; 4 shown from metadata only").
- **Cap honesty.** Beyond the cap, `droppedSessionCount` is surfaced ("이전
  세션 N개는 표시에서 제외됨"), never silently truncated (the program's
  "no silent caps" rule).

---

## 6. Where it lives

A **mode on the Project page**, not inside 흐름. The Project surface already
aggregates sessions and synthesis; the aggregate timeline is the temporal view
of that same set. It reuses the timeline rendering primitives
(`TimelineCanvas`, lanes, bundles, axis) but is owned by the project surface and
deep-links down into per-session 흐름.

---

## 7. Visual treatment

- Session bands are calm panels on the surface ladder; the active/selected band
  gets a full border or soft tint, never a left-accent bar.
- Gap elisions are a quiet centered marker ("· 3일 후 ·"), not a hard rule.
- Metadata-only bands render dimmed (opacity, per the encoding ladder) with the
  honesty badge, so partial data reads as partial.
- The project-pulse strip follows the 맥동 restraint: a few big quiet numbers,
  one directional bar, no gamification.

---

## 8. Test plan

- `buildProjectTimeline` orders segments chronologically and interleaves gap
  segments only above the threshold.
- a `meta`-only session yields a band with metadata counts and the partial flag.
- `dataBasis` resolves correctly across all-loaded / metadata-only / partial /
  empty inputs.
- `droppedSessionCount` reflects sessions beyond the cap.
- pulse aggregates counts across loaded sessions; span label honest when times
  missing.
- deterministic output for snapshot stability.

---

## 9. Open questions

- **Gap threshold and label granularity:** > 1 day to elide? Label as "3일 후"
  vs a date? (Lean: elide > 1 day, relative label.)
- **Within-band density:** always bundle-biased, or a per-band expand to raw
  events? (Lean: bundle by default, expand a band on click before drilling in.)
- **Project identity at scale:** today a project is a `sourceLabel` group; a
  real project registry (noted in the timeline strategy doc) would firm this up.
  The builder keys on the loaded set, so it is agnostic to how identity firms up.
- **Cap size:** 20 (memory parity) or higher for the timeline? Higher cap means
  heavier load; keep 20 until a real project pushes against it.
