# 기록 Workspace · canonical design set

Status: **approved 2026-07-15 (R0)** · supersedes the screen-level 기록
description in `mori-context-workspace-architecture.md` §8.1 "shipped so far"
and the transitional feed/calendar structure it describes. The kernel and
pipeline sections of that document (§3-§7) remain canonical and are the
foundation this set builds on.

## Product definition (short form)

기록 Workspace is Mori's personal activity ledger: the user drops raw text,
URLs, files, and conversations with zero friction; Mori structures them into
typed records placed on honest activity time and context; the user reviews,
corrects, connects, and reuses them. Capture, organize, and review/reuse are
one flow on one screen, not three surfaces.

The screen that existed before this redesign (big free-text box + 정리
button + flat date-grouped list + collapsible month picker + collapsible
합계 panel + read-only inspector) was the kernel's first debug surface. It
is the input to the audit, not the baseline for the design.

## Approved information architecture

**Alternative A · timeline ledger + context rail** (see
`information-architecture.md` for the comparison):

- One journal timeline, no view tabs.
- AI 정리 is a state of the Composer, not a separate screen.
- The right rail is one contextual slot: time context (mini calendar +
  selected-day summary) when nothing is selected, record inspector when a
  record is selected.
- 확인 필요 and 날짜 미정 live in a strip above the feed with a card-based
  resolution flow, never a pile at the bottom.
- The calendar is a ledger calendar (records visible in cells), reached by
  expanding the rail mini calendar.

## Documents

| File | Role |
| --- | --- |
| `current-state-audit.md` | What actually exists in code today, what fails, Reuse/Adapt/Replace/Remove |
| `product-and-user-journey.md` | Jobs, Capture→Organize→Review→Place→Reuse journey, apply-policy UX, success scenario |
| `information-architecture.md` | IA alternatives A/B/C, adoption rationale, layout relationships, narrow-width fallback |
| `interaction-and-state-spec.md` | Composer state machine, review cards, auto/provisional/confirm, failure states, edit/undo |
| `time-and-placement-ux.md` | The three-time model in user language, date resolution flow, calendar placement semantics |
| `screen-specifications.md` | M1-M8 screen specs with example data and empty/loading/error states |
| `implementation-roadmap.md` | R1-R6 stages, scope, done criteria, transition and removal plan |
| `v5-note-tool-bar.md` | References (Obsidian/Bear/iA), editor decision, extraction extensibility, vault bridge direction |
| `v6-honest-notes.md` | What a day of use exposed: the lies removed, why the rule proposer cannot do the job, nature demoted, project filing, revision granularity, layout doctrine. **Carries the two open decisions.** |
| `v7-document-understanding.md` | Understanding is the product; "what you did" is one output of it. Competitive research (13 tools), the 요약/용어/인사이트 contract, nature by embedding, the parentId organization model, the vault path mapping, and the one open decision |
| `v8-project-calendar-surfaces.md` | **Newest.** The layer rule (edits in place, navigation only to substance), the one-skeleton adoption for 프로젝트/캘린더, the project tree + page composition, the calendar agenda rail + month pane, the 남긴 것 in-place expansion, staged build plan |
| `worklog.md` | Current stage, done work, changed files, next exact action |

## Implementation stages and current status

| Stage | Scope | Status |
| --- | --- | --- |
| R0 | UX redesign, this document set | done (approved) |
| R1 | Composer state machine, draft recovery, schema-driven quick form | done |
| R2 | Review candidate cards, edit/exclude, policy-driven density, save + revision + undo | done |
| R3 | Timeline rows + context rail, route swap, legacy retire | done |
| R4 | Date-confirmation UX (strip + resolution cards + rules) | done |
| R5 | Ledger calendar + editable record detail | done |
| R6 | Weekly review, routine suggestions, rail aggregates | done |

The vertical-slice roadmap is complete; see `worklog.md` for per-stage
deferred refinements.

## Code entry points

- Kernel: `src/lib/record-kernel/` (types, factory + revisions, schema
  registry, repository, system schemas)
- Capture pipeline: `src/lib/capture/` (pipeline, rule-based proposer, date
  inference, apply policy, personalization, entity resolution)
- Composer + review (R1/R2): `src/features/record-ledger/composer/`
- Current (transition) surface: `src/features/record-ledger/LedgerWorkspace.tsx`
- Routing: `src/app/App.tsx` view `"ledger"`, store normalization in
  `src/app/store.ts` `navigate()`
