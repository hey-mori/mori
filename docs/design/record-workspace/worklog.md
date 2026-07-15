# Worklog · 기록 Workspace redesign

## Current stage

R1 + R2 done and verified (2026-07-15). Next stage: R3 timeline + context
rail.

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

## Next exact actions (R3)

1. Timeline rows (time column, meta line, kind variants, note preview).
2. Context rail (time mode ↔ inspector mode; narrow-width drawer).
3. Saved-state placement highlight onto the new timeline.
4. Route body swap + delete `FeedBody`/`LedgerRow`(old)/`LedgerCalendar`/
   month bar; demote `TrackerPanel` to the rail week line.

## Transition markers

- `RecordComposer` sits above the CURRENT feed inside `LedgerWorkspace`;
  the old feed remains the placement surface until R3. Removal stage: R3.
- `manualNote` (failed → 노트로 저장) creates a second source for the same
  text; dedupe when the composer gains source-reuse in R3.

## Commits

- d752882 docs: canonicalize the record workspace redesign
- 17924ef docs: reconcile legacy record and calendar directions
- 724e083 feat: propose several typed records from one capture
- 0de841b feat: persist reviewed proposals with revision history
- 8885ba4 feat: add the record composer state machine
- 28f8291 feat: present structured record proposals for review
