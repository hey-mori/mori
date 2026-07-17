# 기록 v8 · 프로젝트 and 캘린더 surfaces, and the layer rule

Status: **plan, 2026-07-17. Authored as the 기획 pass the user requested
("먼저 기획과 필요한 기능과 그런 것들을 레퍼런스도 찾아보고"); implementation
is staged in §8 and can be executed by a separate session. Supersedes the
current `ContextView` and `CalendarView` compositions and the note footer's
record navigation. Nothing here is a stopgap.**

## 0. What the screenshots exposed

The user opened a note, saw 이 기록에서 남긴 것 · `운동 · 오늘 운동을 했다`,
clicked it, and got **a whole new screen**: a document whose body is the same
single line the footer already showed, plus a date chip and a kind chip. Their
question was exact: "그렇게 한 번 타고 들어가는 레이어는 사용자가 쓰기
불편할거라는 생각은 안 해봤어? 그리고 뭐 어떻게 하자는거야."

That screen answers no question the footer had not already answered. The same
mistake, smaller, shipped in the 프로젝트 rail on the same day: a hover pencil
that swaps a project row into an inline form. Research across the tools below
found **no shipping tool that uses either pattern**. Both violate one rule that
was never written down, so this document writes it down:

> **The layer rule.** Editing a thing's metadata happens where the thing is
> shown (disclosure, menu, inline field). Navigation is reserved for surfaces
> with their own substance: a document with a body, a project with a history.
> Every screen must answer "왜 여기에 왔는가" with something the screen you
> came from could not show.

A one-line derived record has no substance of its own; its home is the note
that produced it. A project has real substance (its notes, sessions, records,
children). A calendar day is a filter over the ledger, not a place.

Two more failures of the same shape, found by reading the current code:

- `CalendarView` still renders a "기록으로" back button. That is a fossil: the
  calendar was once a body takeover inside 기록 (IA doc §2), but it has been a
  global sidebar destination for two versions. A back button on a top-level
  surface claims a stack that does not exist.
- The calendar's day agenda renders **below the grid**, and the 날짜 미정 tray
  below that. Three stacked zones, so reading a day means bouncing between the
  top of the screen and the bottom, and selecting a different day shoves the
  layout. Day cells scroll internally, which is a micro-scrollbar inside a
  90px cell.

## 1. References, verified

Sources are listed in §9. Findings that carry design weight here:

| Tool | What it settles |
| --- | --- |
| **Notion** (sidebar) | The row-management convention: hover reveals `+` (new nested page) and `⋯` (Rename · Move to · Delete...); drag onto a row nests it, with the target highlighted; drag out un-nests. Rename edits the name inline after choosing it from the menu. |
| **Bear** (nested tags) | Parents show a disclosure triangle; children indent beneath. Rename is right-click → Rename. Nesting is TYPED as a path (`#novel/chapter`), which legitimizes our `회사/mori` create input. |
| **Things 3** | The project page anatomy: title area, then notes, then structured content. The sidebar groups projects under areas, roughly four levels of hierarchy, and it is enough. |
| **Fantastical** (Mac) | The calendar sidebar is not empty chrome: it holds **the list of the current view's items**, and clicking a day scrolls that list to the day. The grid and the list are two densities of one thing. |
| **Day One** (calendar view) | A retrospective calendar's cells signal density (colored days, optional photos); tapping a day reveals that day's entries; you can scroll to a past day and create an entry there. |
| **Agenda** | A note tool can be date-centric without being a scheduler: notes attach to dates and one infinitely scrollable timeline holds past, present and future together. |

The synthesis: for sidebars, the world agrees (disclosure tree + hover `⋯` +
context menu + drag), so Mori should not innovate there; hands already know
it. For the calendar, the strongest desktop pattern is Fantastical's: **the
sidebar carries the agenda list, synced to the grid**, which also answers the
user's instinct that "캘린더 사이드바엔 뭐가 없겠지": there is something, and
it is the month itself in readable form.

## 2. One skeleton, four surfaces

기록 and 세션 already share the full-bleed skeleton: an optional
`--ledger-rail` (248px) column plus a content pane, every column topped by a
`--workspace-band` (52px) header with a bottom rule. 프로젝트 and 캘린더
currently sit inside `PageShell` + `ActionBar` instead, which is why they feel
like different apps.

Decision: **all four main surfaces adopt the one skeleton.** `PageShell` /
`ActionBar` retire from 프로젝트 and 캘린더 (they remain for 홈/설정-class
pages). This answers the user's header question directly: yes, both screens
keep the top band, because the band IS the header, and it is the same 52px
ruler everywhere:

| Surface | Rail band | Pane band |
| --- | --- | --- |
| 기록 | 기록 검색 · 새 기록 · 보기 | 날짜 · 프로젝트 picker · 글자수 · ⋯ |
| 세션 | 검색 · 새 세션 · 정렬 | 세션 제목 · 상태 |
| 프로젝트 (v8) | 프로젝트 검색 · 새 프로젝트 | 경로 crumb · 이름 · 건수 · 새 기록 · ⋯ |
| 캘린더 (v8) | 이번 달 기록 N건 | ◀ 2026년 7월 ▶ · 오늘 · 날짜 미정 N |

## 3. 기록 · the 남긴 것 row stops navigating

The footer row's jobs are: reassure that the record exists, fix it when it is
wrong (kind · date · project), throw it back, and point at the sentence it
came from. None of these need a screen.

- **Clicking the row expands it in place** (disclosure, not navigation): a
  compact editor strip with 종류 (writeable occurrence/distilled schemas only,
  the v5 rule), 날짜 (date input, 미정 allowed), 프로젝트, and the existing
  버리기. Enter/Esc close it. One open row at a time.
- **본문에서 보기** inside the expansion locates the record's body text in the
  note and selects it (the `revealSpan` mechanic 읽기 already uses). If the
  text is no longer in the note, the affordance is absent, never broken.
- The row itself never routes to `DocumentEditor`. That screen remains for
  records reached from 캘린더 and 검색, where the note is not open, and it
  gains the door it is missing today: a derived record's document shows an
  **출처 노트 열기** crumb (the `derived-from` relation already stores the
  link; nothing renders it).

## 4. 프로젝트 · the rail

Composition: the shared skeleton. Rail = the project tree. Pane = the selected
project's page (§5).

**Tree rows.** Disclosure caret when children exist (Bear), 13px indent per
depth (matches the picker), name, roll-up count (children included, already
true in `groupRecordsByContext`). Selected row is a calm tint, never a bar.

**Row management, replacing the hover pencil.** Hover (or focus) reveals `⋯`;
right-click opens the same menu (Notion, Bear, Finder):

| Menu item | Behavior |
| --- | --- |
| 이름 변경 | The row's name becomes an inline text field, Enter commits via `renameContext`, Esc cancels. The path is derived, so descendants are untouched (verified in v7 step 6). |
| 하위 프로젝트 | Creates an inline-named child via `planProjectPath` semantics, expands the parent. |
| 이동 | Submenu: 최상위 + every valid parent, pre-filtered by `canReparent` so an illegal move cannot be offered. Commits via `reparentContext`. |
| 보관 | Stage 4 (§8). `KernelContext.archived` exists and is unused; archiving hides a finished project without deleting anything. |

No undo toast for rename/move, deliberately: a renamed or moved project stays
fully visible in this tree and can be edited again, so the door back is always
open, unlike a discard that hides its record. Drag-to-re-parent (Notion's blue
highlight) is a stage-4 accelerator on top of the menu, never the only path.

**새 프로젝트 (+)** in the rail band opens a **modal** (revised 2026-07-17;
this first specified an inline name field, and building it showed the field
could not do the job). It reuses the house modal shape exactly · the scrim,
headed bar, round close, Esc, focus trap and focus restore of
`ProjectFormModal` · and carries the fields a `KernelContext` actually has:

- **이름**, still accepting a typed path (`회사/mori`, Bear's convention), which
  feeds `planProjectPath`.
- **상위 프로젝트**, a picker the inline field had no room for. It does not
  compete with the typed path, it composes with it: the parent is where the walk
  STARTS and the path runs from there (`planProjectPath`'s `rootParentId`).
- **A live preview** of the resulting path, which is what makes those two one
  visible thing rather than two rules to hold in your head.
- **Up-front refusal** of a duplicate sibling name, with the reason. The write
  refuses this (siblings must have unique names, since the derived path is the
  group key), and a write that can only refuse silently after the fact is a
  button that does nothing.

No 설명 field: a `KernelContext` has no description, and offering one would be
offering a field that goes nowhere. 하위 프로젝트 opens the same modal with the
parent pre-filled, so there is one create door, not two.

**Session-only groups.** Sessions whose folder leaf matches no context (the
`ng-gw`, `jinga` rows) list under a quiet 연동 폴더 divider below the tree.
Their `⋯` offers one action: **프로젝트로 만들기**, which mints a context with
that name, after which the group is a real project and nests like any other.

## 5. 프로젝트 · the page

The pane is the project's substance, ordered by what a returning user asks:

1. **Band**: dim parent path crumb (`회사 /`), name, 기록·세션 count, spacer,
   **새 기록**, `⋯` (이름 변경 · 이동, the same menu as the rail).
2. **하위 프로젝트** · compact rows with counts, only when children exist.
   Clicking selects that child (rail follows).
3. **최근** · the last ~10 records and sessions **merged**, day-grouped,
   newest first. One list, because "이 프로젝트에서 무슨 일이 있었나" is one
   question (Agenda's single-timeline lesson). Row anatomy: kind dot or agent
   monogram · title · time.
4. **노트** · notes filed here, title + snippet rows.
5. **세션** · the existing session rows.
6. **남긴 기록** · 결정/인사이트/활동/기타, merged, kind-dotted.

Sections render only when non-empty. Every row routes to the REAL surface
(기록 editor via `openRecordInLedger`, 세션 via the session resolver); nothing
opens in an inspector. The 340px `RecordInspector` rail stays retired here.

**새 기록** creates a note pre-filed to this project (`contextIds`) and opens
it in 기록. That navigation is correct under the layer rule: a fresh document
is substance, and 기록 is its home.

Empty project: "아직 이 프로젝트에 기록이 없습니다" + 새 기록 CTA, one line,
no illustration.

## 6. 캘린더 · agenda rail + month pane

The calendar is a **retrospective ledger**, not a scheduler (architecture doc
§22: activity time, never fabricated). Two densities of the same month, side
by side, Fantastical's arrangement:

**Rail (248px) · the month, readable.** Day-grouped agenda list of the visible
month, newest day first, sticky day headers, the same row anatomy as 기록's
list (dot · title · kind). A day's agent sessions collapse to one 세션 N row
routing to 세션. Future-dated records render in the 예정 style. Rail band:
`이번 달 기록 N건`.

**Pane · the month, at a glance.** Band: `◀ 2026년 7월 ▶`, 오늘, spacer,
`날짜 미정 N` chip. Below, the grid:

- Week rows share the pane height equally (92px floor, as today).
- A cell shows the date number (today ring, selected tint) and **as many
  titled entries as actually fit, then `+N`**. Internal cell scrolling dies.
  `+N` selects the day. Day One's density-at-a-glance, with titles because a
  ledger's entries deserve names.
- Sessions collapse to one 세션 N chip per cell; clicking it selects the day
  (the rail's 세션 row is the router), instead of today's teleport to 세션.

**The sync.** Selecting a day (cell click, `+N`, or arrow keys later) scrolls
the rail to that day and highlights its group; Esc deselects. Clicking an
entry, in the rail or in a cell, opens the record in 기록: that is navigation
to substance. There is no third zone: no bottom agenda, no popover, no
inspector. The rejected alternatives, for the record: a popover peek covers
the month being read and fights drag; navigating to 기록 per day-click makes
comparing two days a pogo-stick; the current bottom strip is eye travel.

**날짜 미정.** The chip in the band toggles a thin tray strip docked under the
band (never a tall bottom section): horizontal record chips, draggable onto
cells (kept from today), and, when a day is selected, an 이 날에 배정 action
per chip (the guaranteed non-drag path, kept). The tray is the only home of
undated records; the rail lists only dated ones.

**Removed:** the 기록으로 back button, the bottom agenda, the bottom tray,
`PageShell`/`ActionBar`. `MiniCalendar`/`ContextRail` stay retired (zero
renderers today; the rail agenda replaces their job).

## 7. What already exists vs what is new

Carries over unchanged: `contextTree.ts` (chain/path/depth/guards/plan),
`renameContext`/`reparentContext`, roll-up in `groupRecordsByContext`,
`buildProjectGroups` path keys + parentPath, `calendarGrouping` (activity-day
honesty), drag-assign + 이 날에, `openRecordInLedger`, the session resolver,
`revealSpan`, 버리기 + 되돌리기 plumbing.

New build: tree rendering + `⋯`/context menu + inline rename field (프로젝트
rail), project page sections, calendar rail agenda + sync, grid fit-measure +
`+N`, tray strip, band swaps, 남긴 것 expansion, 출처 노트 crumb.

## 8. Implementation stages (for the implementing session)

| Stage | Scope | Done means |
| --- | --- | --- |
| S1 | 남긴 것 row: in-place expansion (종류/날짜/프로젝트/버리기/본문에서 보기), navigation removed. `DocumentEditor`: 출처 노트 crumb on derived records. | Clicking the footer row never changes screens; every edit lands as an audited revision; browser-verified on a real note. |
| S2 | 프로젝트 skeleton swap + rail tree + `⋯`/right-click menu + inline rename + 이동 submenu + 새 프로젝트 path input + 연동 폴더 divider + page recomposition (§5) + 새 기록. Hover-pencil UI removed. | Bands measure 52px; tree shows 회사/mori vs 개인/mori apart; rename leaves children untouched; all rows route to real surfaces. |
| S3 | 캘린더 skeleton swap + agenda rail + band + tray strip + grid fit/`+N` + day-select sync + back-button removal. | No internal cell scroll; selecting a day scrolls the rail; undated flow works by drag AND by click; nothing renders below the grid. |
| S4 | Accelerators: drag-to-re-parent with drop highlight, keyboard day navigation (←→↑↓, t=오늘, Esc), 프로젝트로 만들기, 보관, calendar rail infinite scroll across months (open question below). | Each lands with its own verification; none is the only path to its outcome. |

Validation per stage: `npm run check:full`, `npm run build`,
`npm run style:check`, `git diff --check`, browser verification with test data
set up AND torn down, commit format per `docs/commit-format.md`, no em dash.

## 9. Open questions (non-blocking) and sources

**(1) Calendar rail scope · still open**, deliberately deferred to use: month
scoped first, measure the urge to scroll before adopting Agenda's infinite
timeline.

**(2) 보관 semantics · ANSWERED while building S4 (2026-07-17).** Archiving is
**one write on one context**; hiding its descendants is a **view rule**
(`inArchivedSubtree` walks the parent chain), never a cascade. A cascade would
have to stamp `archived` onto every descendant, and then 복원 could not tell a
child the cascade archived from a child the user had archived on purpose
earlier: restoring the parent would silently un-archive it. Deriving the hide
makes 보관 and 복원 exactly symmetric and loses nothing. Verified live: with
`docs` archived on purpose under 회사, archiving 회사 wrote `archived` on 회사
ONLY (its child `mori` stayed untouched), and restoring 회사 brought back 회사
and mori while `docs` stayed archived. The label carries the consequence
(`보관 (하위 포함)`) instead of a modal, and 보관됨 lists only the tops of
archived subtrees, because a 복원 offered on a child under an archived parent
would be a button that does nothing.

Sources consulted 2026-07-17: Notion sidebar help (notion.com/help/navigate-
with-the-sidebar), Bear nested tags + tag FAQ (bear.app/faq), Things 3
headings + features (culturedcode.com), Fantastical Mac calendar views help
(flexibits.com), Day One calendar view (dayoneapp.com/features/calendar-view),
Agenda (agenda.com). Claims from these are conventions verified against
vendor documentation, not screenshots of current builds; pixel-level details
should be re-checked at implementation time if they become load-bearing.
