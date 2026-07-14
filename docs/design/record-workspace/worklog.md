# Worklog · 기록 Workspace redesign

## Current stage

R2 in progress (documentation landed; R1/R2 implementation underway in this
session).

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

## In flight (next exact actions)

1. Reconcile legacy docs: architecture §8.1 shipped-note superseded pointer;
   CLAUDE.md always-read pointer. Commit `docs: ...` (two commits).
2. R1 domain: extend `dateInference` (evidence), `ruleBasedProposer`
   (segmentation + activity/insight/task + 시간 durations), proposal
   `origin` override; add `proposeCapture`/`commitCapture` two-phase API to
   `useRecordLedger`. Tests alongside.
3. R1 UI: `composerMachine` + `composerDraft` + `RecordComposer` (chips +
   schema-driven quick form), mounted in `LedgerWorkspace` replacing
   `QuickCapture`.
4. R2 UI: review candidate cards + save/undo semantics.
5. Verification: unit + `check:full` + `build` + real-app E2E of the
   success scenario; screenshots if the environment allows.

## Changed files (running list)

- `docs/design/record-workspace/*` (this set) · new
- (implementation files appended as they land)

## Transition markers

- `RecordComposer` mounts above the current feed inside `LedgerWorkspace`;
  the current feed remains the placement surface until R3. Removal stage:
  R3.
- Saved-state highlight targets the current feed rows until the R3 timeline
  exists. Removal stage: R3.

## Commits

- (appended as they land)
