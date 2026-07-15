# Worklog · 기록 Workspace redesign

## Current stage

R1 + R2 + R3 + R4 done and verified (2026-07-15). Next stage: R5 (ledger
calendar drag-to-day + full record detail with inline editing).

## Done (R4b, 2026-07-15)

- `dateRuleLearning.ts` (lib/capture, tested): `buildLateNightRule` /
  `isLateNightRule` / `hasLateNightRule` and `inferDateFromRules(timeBasis,
  rules, capturedAt)` → previous day for a still-undecided small-hours
  capture. `runCapturePipeline` applies it (marked `ai-inferred`, so the
  placed row shows 추정 and stays correctable); the two new pipeline tests
  cover fire and no-override.
- `dateRuleMemory.ts`: a local-only counter of small-hours → 전날 corrections
  (threshold 3). `ReviewStrip` bumps it when the 전날 choice is taken;
  `useRecordLedger.createDateInferenceRule` persists the rule; `ledger.rules`
  is exposed so the offer knows whether one already exists.
- `DateRuleOffer`: a one-line prompt above the strip (survives an empty
  strip); 네 → rule + reset, 아니요 → reset (no nag).
- Verified in the Vite app: seeding the counter to 3 shows the offer; 네
  persists a `date-inference` rule (`capturedBeforeHour:5`, `offsetDays:-1`,
  enabled) and clears the counter; re-seeding to 5 does not re-offer (the
  rule exists); no console errors. Small-hours auto-placement is covered by
  the pipeline unit tests (a real-time small-hours capture is not reproducible
  in a daytime browser session). 2781 unit tests + build + style green.

## Done (R4a, 2026-07-15)

- `dateResolution.ts`: `isDateUndecided` (`timeBasis === "unknown"`) +
  `dateSituation(record, now)` → reason + context-fit choices (오늘 alone
  when captured today; 입력일 + 오늘 for an earlier capture day; 전날 first
  for a small-hours capture). Pure, tested.
- `useRecordLedger.setActivityDate(record, date|null)`: a date pins the
  activity day (`user-provided`, clears inference confidence); null moves the
  basis to `capture-fallback` so "날짜 없이 유지" is acknowledged (leaves the
  strip) without fabricating a day. Both via `applyRecordPatch` (user
  revision).
- `ReviewStrip` replaces the inline `CandidateStrip`: one 확인할 것 strip for
  policy-held candidates (반영/무시) and date-undecided records (M5 cards,
  reason first, choices incl. 날짜 선택 date input). Disappears at zero.
- Verified in the Vite app: strip shows "확인할 것 2" for the two dateless
  records; "오늘 (7월 15일)" moves the 할 일 into today's group and drops the
  strip to 1; "날짜 없이 유지" removes the strip and keeps the insight in
  날짜 미정 (no fabricated date); both survive reload; no console errors.
  2773 unit tests + build + style green.

## Done

- 2026-07-15 · R0 approved. IA = alternative A (timeline ledger + context
  rail); review as a composer state; strip-based resolution; ledger
  calendar via rail expansion. Refinements 5.1-5.4 (draft vs source, rail
  contract, review density, calendar takeover) folded into the specs.
- 2026-07-15 · Repository audit against HEAD 24e8234 (see
  `current-state-audit.md`): kernel/pipeline reusable as-is; six domain
  gaps identified for R1/R2 (two-phase capture, proposer segmentation,
  activity/insight/task detectors, duration 시간 parsing, date evidence,
  draft layer, origin override).
- 2026-07-15 · Canonical document set created under
  `docs/design/record-workspace/`.

## Done (R1 + R2, 2026-07-15)

- Legacy docs reconciled: architecture §8.1 shipped-note superseded with a
  pointer here; project-goal §10 pointer; CLAUDE.md always-read entry.
- Domain: proposer segmentation (sentences + guarded "~고 " splits, all-note
  collapse, same-kind merge), 업무 활동/인사이트/할 일 detectors, 시간
  compound durations, date-inference `evidence`, proposal `origin` override,
  outcome `rationale`/`dateEvidence`, `RecordPatch.schemaId` (validates
  against the new schema).
- Two-phase capture: `proposeCapture` (persists the source at 정리 time,
  even when understanding throws) / `proposeFormCapture` /
  `commitCapture` (edits → user revisions on the AI create revision;
  exclusions skip records + orphan entities; confirm-kept saves active) /
  `discardRecords` (post-save undo).
- Composer: six-state pure machine (`composerMachine.ts`, illegal
  transitions are no-ops, double organize/save impossible), local recovery
  draft (`composerDraft.ts`), `RecordComposer` + `CandidateCard` +
  `SchemaQuickForm` (fields generated from `SchemaPropertyDefinition`, no
  per-schema components), mounted in `LedgerWorkspace` replacing
  `QuickCapture` (removed; the composer covers its whole job).

## Verification (R1/R2)

- Unit: 2765 passed (291 files), incl. machine transitions, segmentation
  guards ("러닝 10분, 팔굽혀펴기 5개 3세트" stays one workout), commit-patch
  semantics, form proposer origin.
- `npm run check:full`, `npm run build`, `npm run style:check`,
  `git diff --check` all green. `src-tauri/` untouched (no cargo run
  needed).
- Real screen (browser build, Vite dev): the §5 success scenario end to
  end: draft persists and restores across reload; 정리 → 4 candidates
  (활동 7/14 "어제"에서 추정 · 운동 7/15 60분 · 인사이트 날짜 없음 · 할 일
  예정일 없음); date edit → "직접 지정"; insight excluded; 3건 저장 →
  placed under 오늘/7월 13일/날짜 미정; storage shows ai:create +
  user:update revisions and one retained source; 되돌리기 discards all
  three and keeps the source; schema form (운동) generates from the
  definition, saves as user-origin auto, survives reload; inspector shows
  직접 입력 + history.
- Not run this round: the packaged Tauri app itself (disk-constrained
  machine; the runtime-aware repository's desktop path is covered by
  existing kernel tests). Screenshots: browser-pane screenshots time out in
  this environment; DOM-level assertions recorded instead.

## Done (R3, 2026-07-15)

- Timeline body (`LedgerTimeline` + `LedgerTimelineRow`) replaces the flat
  `FeedBody`: day-grouped, time column (time-of-day when the activity carries
  one), schema-family kind chips, 2-line note preview, meta line (project
  chip, 잠정, 추정, Mori 정리 dot). Just-saved rows highlight and fade.
- Context rail (`ContextRail` + `MiniCalendar` + `ledgerRailSummary`): time
  mode = always-open month calendar (record dots, day filter) + selected-day
  agenda + this-week roll-up ("운동 1 · 활동 1", "운동 누적 1시간"). The rail
  is one slot: selecting a record swaps it for the inspector, Esc/close
  returns to time mode with the picked day intact.
- `LedgerWorkspace` rewired to timeline + rail; `LedgerCalendar` deleted
  (its collapsible-body role is gone); `TrackerPanel` (합계 panel) removed,
  its job now the rail week line + R6 weekly review; the composer reports
  saved ids up for the placement highlight.

## Verification (R3)

- Unit: 2768 passed (292 files), incl. `ledgerRailSummary` (week bounds,
  in-week filter, kind counts, cumulative metric line).
- `npm run check:full`, `npm run build`, `npm run style:check` green.
  `src-tauri/` untouched.
- Real screen (Vite dev, browser build): the §5 scenario end to end,
  input → 4 candidates (활동 어제·추정 / 운동 오늘·추정 / 인사이트 날짜 없음
  / 할 일 예정일 없음) → 4건 저장 → placed under 오늘(운동) / 어제(활동) /
  날짜 미정(인사이트·할 일), 추정 flags on the 2 dated rows, Mori-정리 dots
  on all 4, mini-calendar dots on 14·15, rail "운동 1 · 활동 1" + "운동 누적
  1시간"; select row → rail swaps to inspector; Esc → back to time mode;
  mini-calendar 14th → timeline filters to that day + rail agenda; records
  persist across reload; no console errors, no error boundary.
- Screenshots still time out in this environment; DOM assertions recorded.

## Next exact actions (R5)

1. Ledger calendar (M4): cells show kind-colored marks + leading titles;
   selecting a day opens its agenda; 날짜 미정 tray with drag-to-day
   (activity date vs scheduled date) plus a full click/keyboard fallback.
2. Full record detail (M6): editable title/body, 원문 보기, side panel
   (활동 날짜 + basis, 프로젝트/엔티티, 관련 기록, 이력 with per-entry
   되돌리기), provenance dots. Rail inspector stays for short records.

## Transition markers

- `LedgerRow` is retained (used by `ContextView`/프로젝트); the timeline has
  its own richer `LedgerTimelineRow`. Not dead code.
- Tracker aggregation + routine discovery (`trackerAggregation`,
  `routineDiscovery`, `createRoutine`) are kept as the data layer; the full
  breakdown + 루틴으로 저장 UI moves to R6 weekly review. Rail shows only the
  one-line roll-up for now.
- Narrow-width (<1100px) rail currently stacks under the timeline; the
  inspector-as-drawer polish (IA §3 fallback) is deferred. Removal/upgrade
  stage: a later responsive pass.
- `manualNote` (failed → 노트로 저장) still creates a second source for the
  same text; dedupe when the composer gains source-reuse.

## Commits

- d752882 docs: canonicalize the record workspace redesign
- 17924ef docs: reconcile legacy record and calendar directions
- 724e083 feat: propose several typed records from one capture
- 0de841b feat: persist reviewed proposals with revision history
- 8885ba4 feat: add the record composer state machine
- 28f8291 feat: present structured record proposals for review
- 1e45d5d docs: record the R1 and R2 vertical slice in the worklog
- (R3) feat: replace the ledger body with a timeline and context rail
