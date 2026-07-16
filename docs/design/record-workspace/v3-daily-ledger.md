# 기록 v3 · Daily Ledger (재기획)

Status: **approved direction, 2026-07-16.** The v2 document workspace
(explorer + editor) was the kernel's second debug surface: functional,
but far below the product bar. This document is the re-plan and the
implementation contract for raising 기록 (and the 세션 index) to a
reference-quality surface. It supersedes the v2 screen description; the
composer state machine, apply policy, and kernel wiring are unchanged.

## 1. Diagnosis · why v2 fails the bar

Judged against the product's own identity ("personal activity ledger,
그때 뭘 했더라"), and against the calm-density bar (Linear / Bear /
Things / Apple Journal):

1. **No time rhythm.** The list groups by project by default. A ledger's
   native axis is the day; v2 never shows 오늘/어제, so the screen never
   reads as "my days accumulating". The core job is time-anchored recall
   and the default lens ignores time.
2. **Dead rows.** A row is a 6px dot + one title line + "날짜 미정 ·
   노트". No content preview, no time-of-day. Every serious notes list
   (Bear, Apple Notes, Granola) carries a snippet; that is what makes a
   list scannable and alive.
3. **Control clutter.** A 282px pane opens with four stacked control
   rows (새 기록 button, search, two segmented toggles, chips) before
   any content. References ship search + one view menu.
4. **A wasted center.** Idle shows a passive empty state; composing
   floats a small card in a huge blank pane; saving jumps away from
   capture. Capture is the product's front door and it feels like a
   dialog.
5. **Flat document typography.** Title, meta, and body sit at nearly
   the same visual weight; the document does not read as a document.

## 2. References (what each contributes)

- **Apple Journal** — capture-first canvas: the prompt is the screen;
  your day's entries visibly accumulate under it.
- **Bear** — list-row anatomy: title + 1-line snippet + trailing time,
  soft tinted selection, restrained color.
- **Things 3** — day headers as the calm organizing device (오늘 with
  count), generous-but-structured whitespace.
- **Granola** — day-grouped work list (오늘/어제/…) proving day headers
  scale to auto-captured work items.
- **Linear** — control diet (search + one icon menu), sticky group
  headers, keyboard-first invocation.

## 3. The design

### 3.0 Layout · match 세션 (the shared list-detail skeleton)

기록 and 세션 are the two-experience pair and MUST share one layout
skeleton, so switching between them never re-flows the frame. Both are
**full-bleed** inside `.workspace` (no `PageShell`, no floating card):
a flush left rail (`--ledger-rail`/`.session-index`, **248px**, `border-right`,
app background) and a content pane filling the rest. The v2 기록 rendered
as a bordered rounded card floating in a `PageShell` — that mismatch is
what read as "the sidebar isn't done right"; it is removed. Do not
reintroduce a card wrapper on either surface.

### 3.1 The panes

Two panes (ledger rail · document), both re-thought. No third rail:
context lives in the document meta and the (separate) calendar.

### 3.1 Explorer · the ledger list

- **Header (one row).** [＋ 새 기록 icon-button] [search, flex] [보기
  icon-button → popover]. The popover holds 보기 (날짜별 · 프로젝트별)
  and 정렬 (최신순 · 제목순). The two always-visible segmented rows die.
- **Facet chips** stay (data-driven, one horizontal scroll row, no
  wrap): 전체 · 노트 · 운동 · … A new schema is automatically a chip.
- **Day grouping is the default** (`day`): 오늘 · 어제 · "7월 14일
  화요일" · other-year "2025년 12월 3일". Sticky headers with counts.
  Every record lands on its display day (activity time, else capture
  time), so there is no unknown bucket here; date-undecided records are
  already pinned in 확인할 것.
- **Row anatomy** (two-line, ~54px): kind dot (7px, schema-colored) ·
  title (13px/650, 1 line) · snippet (11.5px muted, 1 line, body-derived)
  · trailing time (10.5px tabular): HH:mm in day mode, M/D in project
  mode. Selected = calm purple tint (no left bar).
- 확인할 것 pinned group unchanged (amber header).
- 프로젝트별 lens remains for "this project's records" recall; recent
  mode is superseded by day mode (model keeps it for compatibility).

### 3.2 Document · capture canvas + real document

- **Idle and composing are one state: the capture canvas.** A centered
  column (max 720px): the composer, then an "오늘" section listing
  today's records as light rows. Saving stays on the canvas; the new
  record appears in 오늘 immediately (Journal feedback loop), and the
  composer's own post-save state offers 이어서 쓰기. The passive
  "메모를 선택하세요" empty state is deleted.
- **A selected record reads as a document.** Title 21px/750; meta chip
  row (date · kind picker · project); body 15px/1.75 at a 70ch measure;
  원문/이력 stay quiet disclosures. The bar keeps crumb + provenance.

### 3.3 세션 index (same bar, smaller pass)

- Rows gain an **agent monogram** (per-agent tinted 18px square: CL /
  CX / OC / …, derived from the auto-import id) and a two-line anatomy:
  title, then project · relative time. Day buckets (오늘/어제/이번 주)
  already exist and stay.
- Live rows keep the working badge; the pulse dot stays the only motion.

## 4. Extensibility rules

- Row anatomy is schema-driven: dot color from `kindColorClass`
  (unlisted schemas fall to note-neutral), snippet from the record body
  (no per-schema renderers required). A new user schema gets the row,
  facet chip, calendar mark, and composer quick-form with zero UI code.
- The day group is computed from `displayTime` (activity else capture),
  honoring the three-time model; no fabricated dates.
- The capture canvas's 오늘 section reuses ledger-visible filtering
  (agent sessions excluded by default, consistent with the explorer).

## 5. Out of scope (deliberate)

- Right context rail, backlinks, and block editing (later program).
- Virtualized list (needed past ~1k visible rows; the day groups make
  windows natural when it comes).
- 세션 row live-status beyond the existing working badge.

## 6. Done criteria

1. 기록 opens as capture canvas; typing → 정리 → 저장 leaves you on the
   canvas with the record visible under 오늘.
2. The list defaults to day groups with sticky headers; rows show
   title + snippet + time; selection is a calm tint.
3. Explorer header is one control row + one chips row.
4. A selected record reads as a document (scale above).
5. 세션 index rows show agent monogram + project · time.
6. `npm run check:full` green; light and dark both verified in-browser.
