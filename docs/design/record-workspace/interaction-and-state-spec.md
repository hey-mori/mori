# Interaction and state spec · Composer, review, editing

## 1. Composer state machine

States are a discriminated union; impossible combinations are
unrepresentable. The machine is pure (reducer + events); IO (pipeline run,
persistence, draft storage) happens in the hook around it.

```text
idle ── focus/type ──> typing ── 정리(⌘↵) ──> organizing ──> reviewing
 ^                        │                        │             │
 │                        │                        └─ error ──> failed
 │                        └─ clear/blur-empty ──> idle           │
 │                                                               │
 └──────── done/timeout ── saved <── 저장 ───────────────────────┘
                             │                        failed ─ retry ─> organizing
                             └ 되돌리기 ─> (records discarded, back to idle)
```

| State | Carries | UI |
| --- | --- | --- |
| `idle` | recovered draft flag | one-line field, placeholder contract ("오늘 한 일, 배운 것, 떠오른 생각을 그대로 적으세요"), format chips (자동 + recents), URL/파일 확장점 |
| `typing` | text, detected hints | expanded field, live detection hint ("운동 1건 감지"), draft persisted locally |
| `organizing` | text, source (created now) | 원문 보관됨 badge first, progress line, submit disabled (no double run), cancel returns to typing (source kept) |
| `reviewing` | outcome, edits, exclusions | candidate cards (see §2) |
| `saved` | committed record ids | toast "기록 N건 정리됨", 되돌리기, new rows highlighted in the ledger (transition: current feed until R3) |
| `failed` | text, source, error kind | 원문은 보관됐어요 + cause; actions: 다시 시도 / 직접 정리(note로 저장) / 나중에. Engine-missing and parse-failure are distinct messages. Never silently substitute the rule-based engine for a failed LLM |

Draft rules (approved 5.1): `typing` persists a local recovery draft
(debounced); successful commit or explicit clear removes it; app relaunch
with a draft present restores into `typing` with a "복원했어요" notice.
The draft is not a kernel object and never leaves the device.

## 2. Review (R2)

One input yields zero or more candidates. Presentation follows the apply
decision (approved 5.3, progressive disclosure):

- **auto / provisional** candidates render as one collapsed summary row
  ("2건은 바로 정리돼요 · 운동, 노트"), expandable to the same editable
  card.
- **confirm** candidates render as detailed cards, expanded.

Card, base density: type chip (change via select), title (editable), date
chip with basis + evidence ("어제 7/14 · '어제'에서 추정"), context chip,
확인 필요 property if any, 제외.

Card, expanded density: all properties, applied rules, source excerpt, AI
rationale, confidence, merge/split affordances.

Actions and semantics:

| Action | Semantics |
| --- | --- |
| edit type/date/title/context | staged on the candidate; on save it becomes a `user` revision on top of the AI create revision (original interpretation stays visible in history) |
| exclude | candidate not persisted; entities only it referenced are not created; the source persists regardless |
| 모두 저장 / 저장 | persists kept candidates; confirm-kept records save as `active` (review was the confirmation), auto as decided, provisional as provisional |
| 원문만 저장 | persists the source only; no records |
| merge / split | domain contract reserved (proposal ids + combine/divide functions); minimal UI in R2 may ship later without hardcoding around it |
| 되돌리기 (post-save) | discards the just-committed records via status revisions; the source remains |

## 3. Editing and undo (record level)

- Every mutation goes through `applyRecordPatch(record, patch, actor,
  registry)`; the revision's before/after makes undo a mechanical revert.
- History displays actor-distinct entries (나 / Mori) with per-entry
  되돌리기 (R5 full detail; R2 ships post-save undo of the whole commit).
- Internal vocabulary (Source, Derivation, Revision, confidence %) never
  appears in default UI copy; use 원문, Mori가 정리함, 기록 이력, 추정.

## 4. Schema-driven quick form (R1 boundary)

Format chips: 자동 (default) + recent schemas (e.g. 운동, 노트) + 모든
형식. Selecting a schema opens a form generated from
`SchemaPropertyDefinition[]` (key, label, type, required, options, unit):
no per-schema hardcoded component. Submitting the form builds a proposal
directly (user-authored structure: origin `user`, confidence 1, apply policy
still runs), through the same review/commit path. Free text remains the
primary path; the form is a shortcut, never a gate.

## 5. Tests that gate this spec

- State machine: legal transitions only; double-submit impossible; failure
  paths land in `failed` with the source retained; draft restore.
- Review: multi-candidate render; per-candidate edit → user revision;
  exclude skips records and orphan entities but keeps the source;
  confirm-kept saves active; auto collapses; undo discards.
- Policy: sensitive or mutating candidates never auto-save.
- Schema form: fields derive from the definition; a new user schema gets a
  form with zero code changes.
