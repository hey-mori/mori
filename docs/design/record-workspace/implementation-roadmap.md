# Implementation roadmap · R1-R6

Principle: vertical slice first. One record must travel
input → understand → review → save → place → edit → undo end to end before
any broad surface work. Each stage lands as small commits with worklog
updates and is verified in the real Tauri app with real data, not only
browser fixtures.

## R1 · Composer (state machine + capture entry)

Scope:
- `composerMachine` (pure reducer, 6 states), `composerDraft` (local
  recovery), `RecordComposer` UI replacing `QuickCapture` inside the current
  `LedgerWorkspace` (transition placement).
- Domain: proposer segmentation (sentence + guarded connective split),
  activity/insight/task detection, 시간 duration parsing, date-inference
  evidence, proposal origin override; two-phase API on `useRecordLedger`
  (`propose` / `commit`).
- Schema-driven quick form boundary + 운동/노트 chips.

Done when: free text yields candidates in the reviewing state; draft
survives relaunch; no double submit; sources persist at 정리 time.

## R2 · Review

Scope: candidate cards (edit type/date/title/context, exclude), policy
density (auto collapsed / confirm expanded), save semantics (user revisions
on top of AI create revisions; confirm-kept saves active; excluded skips
records + orphan entities, keeps source), 원문만 저장, post-save undo,
failure states.

Done when: the success scenario in `product-and-user-journey.md` §5 passes
steps 1-11 in the app.

## R3 · Timeline + context rail

Scope: timeline rows (time column, meta line, kind variants, note preview),
day grouping with placement highlight, context rail (time mode ↔ inspector
mode, narrow-width drawer fallback), route body swap, deletion of
`FeedBody`/`LedgerRow`(old)/`LedgerCalendar`/month bar, `TrackerPanel`
demoted to rail week line.

Done when: 기록 renders the new body with real data; old components are
deleted in the same verified commit; selection/deselection restores rail
time mode.

## R4 · Date-confirmation UX

Scope: 확인할 것 strip (candidates + date-unknown merged), M5 resolution
cards with evidence + context-fit choices, repeated-choice → rule proposal,
per-row 추정 chip confirm.

Done when: three unknown-date records resolve in under a minute; an
accepted rule applies on the next capture.

## R5 · Ledger calendar + full detail

Scope: M4 calendar (cell content, agenda rail, tray, drag + non-drag
fallback, month/week), M6 full detail (editable fields, provenance dots,
history with per-entry undo, 재분석/분리/병합/보관), threshold routing from
rail inspector.

Done when: drag assigns activity vs scheduled dates distinctly; detail
edits round-trip through revisions with undo.

## R6 · Review & reuse

Scope: M8 weekly review, routine suggestion wiring (`routineDiscovery`),
rail aggregates, tracker deltas in rows.

Done when: a week of real data reads as sentences; a repetition produces a
routine suggestion that creates a context.

## Transition and rollback

- R1/R2 mount inside the existing `LedgerWorkspace` above the current feed;
  the old `QuickCapture` is removed at R1 (the composer covers its whole
  job). Everything else stays until R3.
- The route swap in R3 is a single commit that can be reverted wholesale;
  data is untouched either way (kernel storage is stable).
- Any transition affordance (e.g. "saved records appear in the current list
  below") is labeled in `worklog.md` with its removal stage.

## Test gates (all stages)

- Unit: machine transitions, proposer segmentation guards (the
  "러닝 10분, 팔굽혀펴기 5개 3세트" one-workout case), policy density,
  revision round-trips.
- Regression: existing kernel/capture/feature suites stay green
  (`npm run check:full`), `npm run build`, and `cargo check` +
  `cargo test` when `src-tauri` changes.
- Real screen: the Tauri app exercise listed per stage, with screenshots
  where feasible.
