# v2 · Document workspace pivot (2026-07-15)

Status: **approved**. Supersedes the R3 timeline-ledger + context-rail layout
(`information-architecture.md` alternative A) as the 기록 surface's shape. The
kernel, capture pipeline, editing, and calendar/aggregation logic built in
R1-R6 are reused; only the arrangement changes.

## Why the pivot

The R1-R6 build made the kernel visible but stacked too much on one screen
(composer + format chips + 확인할 것 strip + mini-calendar + weekly-review +
timeline) with a right panel that swapped between time-context and inspector.
Long, document-like notes were crushed into narrow timeline rows. The user's
verdict: cluttered, unintuitive, "buried in something", and missing the basic
job of a document tool, browse notes, open one, read and edit it. Think
Obsidian, not a data-kernel readout.

## The v2 shape

**기록 = a document workspace.** Two panes, no right panel:

- **Note explorer (left, ~280px):** records as documents, grouped by project
  (context), searchable, sortable by date or title. A pinned 확인할 것 group
  at top holds candidates and date-undecided records. A `＋ 새 기록` action
  opens the composer in the editor.
- **Document editor (center, fills the rest):** the selected record opens
  here to read AND edit in place, editable title, an inline meta row (date ·
  project · type), and a large body that shows long notes in full. 원문 and
  이력 are quiet top-bar disclosures, not a fixed panel. For a new capture,
  the composer lives here; on save each record becomes a document in the
  explorer.

**Calendar = a global head-button view** (sidebar head, beside ＋ / graph /
bell), not a segment inside 기록. Rationale: agent sessions are already
captured as kernel records (the agent-session adapter), so a calendar over
records naturally spans 기록 + AI sessions; and lifting it out keeps 기록 a
pure document workspace with no view toggle. The calendar reuses
`LedgerCalendarView`, promoted to a top-level surface. Clicking a day or a
note chip opens that record in the 기록 editor.

## Confirmed decisions (2026-07-15)

1. Proceed with the document-form direction.
2. Calendar: a global head-button view (spans records incl. agent sessions),
   not a 기록 segment. (User floated this; delegated the call; taken.)
3. Explorer grouping: by project, sorted newest-first within each group.
4. AI multi-record proposal: kept, but light, one input can still become
   several documents; high-confidence proposals save quietly, only the
   uncertain ones prompt.

## Reuse / replace

| Piece | Verdict |
| --- | --- |
| Kernel, capture pipeline, apply policy, personalization, date rules | Reuse |
| `RecordComposer` (+ review), `updateRecord`, `InlineEditable`, `ActivityDateEditor`, provenance/history | Reuse (re-hosted in the editor) |
| `LedgerCalendarView`, `recordsByDate`, `weeklyReview`, tracker/routine | Reuse (calendar → global; review reachable from calendar/rail) |
| `contextGrouping.groupRecordsByContext` | Reuse (drives the explorer) |
| The R3 timeline + context rail + right inspector arrangement | Replace with explorer + center editor |
| `LedgerTimeline` / `LedgerTimelineRow` / `ContextRail` / `MiniCalendar` in 기록 | Retire from 기록 (kept for reference / other surfaces until proven dead) |

## Build slices

- **R7a · document workspace:** `NoteExplorer` (left) + `DocumentEditor`
  (center) replace the timeline/rail in `LedgerWorkspace`; new capture via the
  composer in the editor; editing reused. Verify, commit.
- **R7b · global calendar:** promote `LedgerCalendarView` to a top-level view
  reached from a sidebar head button; scope over all records; day/chip →
  open in the 기록 editor. Verify, commit.

Mockup: `scratchpad/mori-doc-workspace.html` (artifact
`284e832c-ac68-4d80-8b30-d51b7954c590`).
