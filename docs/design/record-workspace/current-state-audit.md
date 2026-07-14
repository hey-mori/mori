# Current state audit · 기록 Workspace (as of 24e8234, 2026-07-15)

Everything below was verified against code, tests, and routing on HEAD, not
against prior documents.

## 1. What exists and works (kernel + pipeline layer)

| Asset | Location | State |
| --- | --- | --- |
| Record kernel types (3-time model, revisions with before/after, sources, links, relations, entities, contexts, rules) | `src/lib/record-kernel/kernelTypes.ts` | complete, tested |
| `createRecord` / `applyRecordPatch` (every write yields a `KernelRevision`; patch validates against schema) | `src/lib/record-kernel/recordFactory.ts` | complete, tested |
| Schema as data (16 system schemas incl. activity, note, insight, task, workout, study-session, qa; user schemas load from repo; `SchemaPropertyDefinition` has key/label/type/required/options/unit) | `systemSchemas.ts`, `schemaRegistry.ts` | complete, tested |
| Runtime-aware repository (SQLite desktop / localStorage browser, honest fallback) | `kernelRepository.ts` | complete, tested |
| Capture pipeline: pure `runCapturePipeline(input, registry, options) → CaptureOutcome`; persistence is the caller's job | `src/lib/capture/capturePipeline.ts` | complete, tested |
| Apply policy (6 factors → auto / provisional / confirm; `statusForDecision`) | `applyPolicy.ts` | complete, tested |
| Rule-based proposer (workout / study / url / qa / note fallback) | `ruleBasedProposer.ts` | works, single-proposal only (see gaps) |
| Date inference (오늘/어제/그저께/내일/모레, ISO, N월 N일) | `dateInference.ts` | works, no evidence text (see gaps) |
| Personalization rules (alias / classify / context-binding / automation) | `personalization.ts` | complete, tested |
| Entity resolution (ID-stable, alias-aware) | `entityResolution.ts` | complete, tested |
| Feature data layer: `useRecordLedger` (load, capture→persist, setStatus, renameEntity, createRoutine), calendar grouping, tracker aggregation, routine discovery | `src/features/record-ledger/` | complete, tested |

The invariant "source first, then records with revisions" is already enforced
at the single write boundary (`useRecordLedger.persistOutcome`).

## 2. What exists and fails (the surface)

`LedgerWorkspace.tsx` renders: action-bar search → `QuickCapture` (plain
textarea + 정리 button that captures and persists in one shot) →
`LedgerCalendar` (collapsible month grid, day dots only) → `TrackerPanel`
(collapsible 합계) → `CandidateStrip` (확인 필요, conditional) → `FeedBody`
(date-grouped `LedgerRow`s: kind tag + title only) → `RecordInspector`
(read-only: 내용/속성/관련 항목/출처/이력).

Diagnosed failures (each was user-confirmed):

1. **Input has no contract.** The textarea answers none of: what can I
   write, can I mix activities, what happens on 정리, where does it go.
2. **The pipeline is invisible.** Understand/Propose/Apply run, but the user
   never sees candidates; 정리 is a black box that silently persists.
3. **One kind of time.** The kernel's activity/source/capture times and
   `timeBasis` never reach the screen; 날짜 미정 accumulates with no
   resolution affordance.
4. **The calendar is a date picker.** Empty cells dominate; no counts,
   kinds, titles, density, or planned-vs-done.
5. **Rows are DB rows.** No time-of-day, duration, project, source, or
   trust state; a one-line workout and a long plan note get the same row.
6. **The inspector is a viewer.** No editing, date confirmation, context
   linking, split/merge, re-analysis, or undo.
7. **Saving leads nowhere.** No visible placement into calendar / project /
   tracker / search; the record's future value is not felt.

## 3. Domain gaps R1/R2 must close (no parallel structures)

Verified missing, to be added to the existing contracts rather than worked
around in UI code:

1. **Two-phase capture.** `runCapturePipeline` is pure, so propose-then-
   commit needs no new pipeline; but the feature layer only has
   capture-and-persist. Needed: a commit path that applies user edits as
   `applyRecordPatch(…, "user")` revisions, skips excluded candidates (and
   entities only they referenced), and always persists the source.
2. **Multi-record proposals.** The proposer returns at most one typed
   proposal per input. Needed: segmentation at sentence boundaries, plus
   intra-sentence connective splits ("~했고 ") only when both halves carry
   distinct date anchors or classify to different schemas. The fragile case
   "러닝 10분, 팔굽혀펴기 5개 3세트" must stay one workout (guarded by
   tests). Robust splitting remains an LLM-proposer capability; this is the
   deterministic floor.
3. **Missing detectors.** activity (업무), insight (인사이트), task (할 일)
   have schemas but no detection; durations only parse "N분" ("1시간" =
   miss). All needed by the approved success scenario.
4. **Date evidence.** `InferredTime` lacks the matched word; the review UI
   must say 근거 ("어제"에서 추정), so the inference must return it.
5. **Draft vs source (approved 5.1).** Nothing persists while typing.
   Needed: a local recovery draft (not a kernel object), a `KernelSource`
   only at explicit 정리/저장, cancel/discard paths.
6. **Form-entry origin.** Template (schema form) entry produces
   user-authored structure, but `originForProposal` marks every non-note
   schema `derived`. Proposals need an origin override.

## 4. Reuse / Adapt / Replace / Remove

| Current element | Verdict | Destination |
| --- | --- | --- |
| Record kernel, capture pipeline, apply policy | Reuse | untouched foundation |
| Personalization, date inference, entity resolution | Reuse | extended per §3, not replaced |
| calendarGrouping / trackerAggregation / routineDiscovery | Reuse | data layer for R5/R6 surfaces |
| Action-bar search | Reuse | later folds into global ⌘K |
| `useRecordLedger` | Adapt | gains propose/commit two-phase API; existing capture path stays for agent sessions |
| `QuickCapture` | Replace | `RecordComposer` state machine (R1) |
| 정리 button semantics | Adapt | triggers organize→review, not silent persist |
| `FeedBody` + `LedgerRow` | Replace (R3) | timeline rows with time, meta, kind variants |
| `LedgerCalendar` | Replace (R5) | rail mini calendar + expandable ledger calendar |
| Month bar (2026년 7월) | Remove (R3) | calendar navigator covers it |
| `TrackerPanel` (합계) | Adapt (R6) | rail one-liner + weekly review |
| `CandidateStrip` | Adapt (R4) | 확인할 것 strip (candidates + date-unknown) + resolution flow |
| 날짜 미정 feed group | Replace (R4) | strip + resolution cards + calendar tray |
| `RecordInspector` | Adapt (R3/R5) | editable fields, provenance dots, history undo; long records open full detail |
| `ContextView` (프로젝트) | Reuse | out of scope here |

## 5. Legacy removal conditions

- `QuickCapture` is replaced by `RecordComposer` (R1) inside the existing
  `LedgerWorkspace`; no legacy copy is kept because the composer covers the
  whole job (capture) from day one.
- `FeedBody`/`LedgerRow`/`LedgerCalendar`/`TrackerPanel` stay wired until the
  R3 timeline + rail passes real-data verification in the Tauri app, then the
  route body swaps and the old components are deleted in the same commit
  (they are internal to one screen, not a user surface; the retire-not-delete
  rule applies to surfaces, and the surface 기록 itself remains).
- The transition marker is the `worklog.md` stage table; anything labeled
  "transition" there must name its removal stage.
