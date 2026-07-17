# Worklog · 기록 Workspace redesign

## Plan (v8 · 프로젝트/캘린더 surfaces + the layer rule, 2026-07-17)

`v8-project-calendar-surfaces.md`, written after the user showed that clicking
a 남긴 것 row opens a full document screen for a one-line derived record ("한
번 타고 들어가는 레이어") and asked for 프로젝트 and 캘린더 to be properly
기획-ed with references.

- **The layer rule, now written down**: metadata edits happen where the thing
  is shown; navigation is reserved for substance; every screen must answer
  왜 여기에 왔는가. The 남긴 것 row expands in place (종류/날짜/프로젝트/
  버리기/본문에서 보기) and stops navigating.
- **One skeleton, four surfaces**: 프로젝트 and 캘린더 leave PageShell/
  ActionBar and adopt the 기록/세션 full-bleed rail+pane skeleton with the
  52px band. That answers the header question: the band IS the header.
- **프로젝트**: rail tree (disclosure carets, hover ⋯ + right-click menu,
  inline rename, canReparent-filtered 이동 submenu · the Notion/Bear
  convention set, replacing the hover pencil), 연동 폴더 divider with
  프로젝트로 만들기, and a page ordered 하위 프로젝트 → 최근(merged) → 노트 →
  세션 → 남긴 기록.
- **캘린더**: Fantastical's arrangement · the rail carries the month's
  day-grouped agenda synced to the grid; the band carries ◀ 월 ▶ · 오늘 ·
  날짜 미정 chip; the tray docks as a strip under the band; cells show what
  fits then +N (internal cell scroll dies); the fossil 기록으로 back button,
  bottom agenda and bottom tray are removed.
- References verified against vendor docs (Notion, Bear, Things 3,
  Fantastical, Day One, Agenda); build staged S1-S4 for the implementing
  session with per-stage done criteria.

## Plan (v7 · document understanding, 2026-07-17)

`v7-document-understanding.md`. Grounded in competitive research across 13 AI
note tools, not judgement alone.

**The finding that reframes everything: not one of the 13 emits "a list of things
the writer did" from a prose document.** The four that extract action items do it
only from meeting transcripts, where speaker diarization says who committed to
what. Mori took a transcript primitive and pointed it at a reading document. The
Kotlin article that produced four 활동 records was the wrong question, not a bad
word list.

The inversion: **understanding is the product; "what you did" is one output of
it, emitted only when the document is a log.** Regions run 요약 → 용어 →
인사이트 → 남길 기록, records last and routinely empty.

- 요약 always, gated by LENGTH not nature (length is observable, nature is
  guessed; a length gate cannot hide a true record).
- 용어 is the differentiator: only NotebookLM does it, and nobody does it
  Korean-first.
- 인사이트 adopts Heptabase's provenance-by-construction (every insight points at
  its source span, so it cannot hallucinate). Ships EMPTY until the engine lands.
- Nature inferred, never asked (NotebookLM Reports is the reference: the model
  classifies, the user never sees a picker, and classification only decides which
  outputs are offered). Mechanism is embedding + nearest-centroid, ~150ms, no
  LLM; the correction IS the training signal, Gmail-style.
- Organization: **`KernelContext.parentId` already exists and is 100% dead code**
  (one hit: the declaration). Nesting costs zero migration, zero SQL, zero Rust.
  Path is derived from the parent chain, never stored (Logseq migrated away from
  name-embedded namespaces for exactly this reason).
- Layout: killing `.note-extract` (264px) lets the writing measure hit its
  designed 720px on a 1280 laptop for the first time.
- Naming: the surface is 읽기, with no visible title; regions title themselves.

**The one decision (§8): does 기록 depend on a local model for 요약/용어/인사이트?**
Note this is NOT a request for a new capability: the plumbing already exists
(`ollamaProvider.ts`, `quickPassCapability.ts`, `LocalAiCard.tsx`, default
`localhost:11434`), as does the learning seam (`personalization.ts`, KernelRule
`classification` with `learnedFromRevisionIds`). Mori needs to POINT the engine
it already owns at the note.

## Done (v7 steps 1-3 · 읽기 ships, 2026-07-17)

§8 answered by the user: **local LLM.** So the engine is real and the surface is
built against it, not around it.

1. **The understanding contract + engine** (`src/lib/understanding/`, 31 tests).
   `understandingParse.ts` is the load-bearing piece: it LOCATES every quote in
   the body and drops whatever it cannot find. Provenance is not a promise the
   model keeps, it is a filter we apply. The length floor is enforced here too,
   not asked of the model. Ollama and OpenAI-compatible both go through it;
   every failure returns null, which the surface reads as "no reading".
2. **읽기 replaces the 추출 panel** (`NoteReading.tsx`). Above the document, in
   reading order, no title of its own. `.note-extract` (264px) is gone and the
   measure now **measures 720px at 1280**, its designed width, for the first time.
   Kept records and backlinks moved under the document (Obsidian's spot).
3. **The nature `<select>` is deleted**, and with it `natureFits` /
   `NATURE_FIT_KINDS`, the fold it drove, and the topical word lists
   (`STUDY_RE`, `RETRO_RE`). `detectNoteNature` now returns **null** rather than
   defaulting to 일지: a free guess must not outrank an engine that read the text.
   Only the two structural signals survive, and they settle the nature over the
   engine because structure genuinely proves them.

**Verified against a stub engine, on the Kotlin article that started this** (the
real 3,953-char note, stub in the scratchpad, settings restored afterwards):

- 남길 기록: **0 items**. It used to invent four 활동 records. This is the fix.
- 용어 `상호운용` kept, its span pointing at the real characters (2852-2856);
  clicking it selects them in the editor.
- 용어 `널 안전성` **dropped**, because the document says "Null Safety" and the
  quote was not locatable. The filter works on output we did not write.
- Re-opening the note re-reads nothing: cached by `bodyHash`, 0 extra calls.

**Two bugs the work surfaced, both fixed:**

- `runUnderstanding` treated the absent desktop bridge (`getDefaultLlmFetch()`
  → undefined off Tauri) as "no fetch available" and returned null. A configured
  engine silently did nothing in the browser and never said why. Every test
  injected `fetchImpl`, so nothing covered the resolution itself; there is now a
  test that fails without the fix.
- The structural override first spread `{nature, confidence}` onto a
  `natureConfidence` field, so it would have written a stray key and left the
  confidence untouched.

**Retired, not deleted:** `extractFromNote` / `buildNoteExtractionPanel` still
exist and are still tested, but nothing renders their `pending` output. They ran
on every keystroke to produce a list that was discarded.

## Done (v7 step 4 · organization, 2026-07-17)

`contextTree.ts` (21 tests). §7's claim was checked before building on it and
held exactly: `parentId` had **one** hit across `src/` and `src-tauri/`, the
declaration. Nesting cost zero migration, zero SQL, zero Rust.

- **The path is derived, never stored.** A rename touches one name; a re-parent
  is one patched field, so both are audited revisions 되돌리기 already undoes.
- **`projectKey`'s leaf collapse is fixed.** 회사/mori and 개인/mori keyed to the
  same "mori" and merged into one group, mixing two projects' records under one
  heading. Contexts now key by derived path.
- **Sessions resolve by exact path → unique leaf → not at all.** A session knows
  only a filesystem leaf. When two contexts carry that leaf, it is left visibly
  unfiled rather than silently mis-filed into the wrong project. The exact-path
  case running first is also what keeps the fallback key collision-free.
- **Roll-up:** a parent shows its descendants' records. It read as empty before,
  which is a folder lying about being empty. Membership stays single-placement.
- **Cycles and dangling parents:** guarded at the write (`canReparent` refuses
  self and descendant targets) AND tolerated on read (every walk carries a seen
  set; an orphan surfaces as a root). Both, not either: a bad store must still
  render, and a context must never vanish because its parent did.
- **Nesting is reachable:** typing `회사/mori` in 새 프로젝트 nests. The path is
  INPUT; `planProjectPath` turns it into real contexts and throws the string
  away. This is how Obsidian and Logseq users already make a folder in a folder,
  so it needs no second surface.
- The picker lists projects as an indented tree and shows the full path on the
  button only when the leaf alone is ambiguous.

**Bug found by looking:** `ContextPicker` shipped with class names and **no
stylesheet at all**. Its menu rendered as a row of bare text across the header
band, every option always visible, nothing looking like a control. Now styled.

**Still open in §7:** rename and re-parent have no UI. `canReparent` and the
derived path make them cheap, but the door is not built: a project can be nested
at creation and not moved afterwards.

## Done (v7 step 5 · the doors back, 2026-07-17)

Keeping a record was one click; unkeeping it had none. Both surfaces that mint
records now have a 버리기, and neither discard is itself a one-way door.

- **Under the document:** each kept record has a 버리기, revealed on row hover
  (always-visible would turn a quiet list into a row of red buttons), and it
  raises the same 되돌리기 strip a discarded note raises.
- **On the record document:** 버리기 sits beside 원문 and 이력. A record opened
  here could be read and edited but never thrown away, and a record captured
  outside a note had no door at all.
- **Neither discard navigates.** The note is untouched, so yanking the writer to
  the restored record would punish them for correcting a mistake. `undoDiscard`
  carries a `reopen` flag: a discarded NOTE unmounts its pane and must reopen; a
  discarded kept record must not.
- **`.doc-editor-bar` joins `--workspace-band`** (52px, verified in the browser).
  It set its own 10px padding, so its rule stepped against every neighbouring
  header at the seam.

Verified end to end in the browser: discard flips status `active → discarded`
(never a delete, so nothing is lost), the row leaves, the strip appears, the
writer stays put, and 되돌리기 puts it all back.

## Done (v8 S1-S3 · the layer rule, 프로젝트, 캘린더, 2026-07-17)

Built to `v8-project-calendar-surfaces.md`. S4 (drag-to-re-parent, keyboard day
navigation, 프로젝트로 만들기, 보관) remains open by design: each is an
accelerator on top of a path that already works.

**S1 · the layer rule, applied.** A 남긴 것 row no longer navigates: it
discloses 종류 · 날짜 · 프로젝트 · 버리기 in place, plus 본문에서 보기, which
selects the sentence the record was kept from (verified: clicking selects
"오늘 운동을 헀다" in the note, and the retype landed as an audited
`workout → activity` user revision without leaving the note). The record's own
document survives for 캘린더/검색 arrivals and finally renders the
`derived-from` relation as an 출처 노트 crumb, which was stored all along and
made that screen a dead end. `retypeTargets` is now shared: the footer and the
document each filtered their own way.

**S2 · 프로젝트 rebuilt.** House skeleton (248px rail + pane, both 52px band,
verified). The rail is the project tree: carets, 13px-per-depth indent, roll-up
counts, empty projects included (one you just made is a place you can file
into). The invented hover pencil is gone, replaced by the convention every tool
ships: a hover `⋯` that right-click also opens, holding 이름 변경 (inline
field) · 하위 프로젝트 · 이동. Move targets are filtered by `canReparent` AND
exclude the current parent, verified live: for 회사/mori the menu offered
최상위/개인/개인-mori/글쓰기 실험/빈 프로젝트 and correctly omitted itself, its
parent 회사, and its descendant docs. Renaming 회사/mori to mori-앱 left `docs`
untouched. Session-only groups sit under a 연동 폴더 divider. The page is
하위 프로젝트 · 최근 · 세션 · kind sections, and 최근 renders only when it
actually interleaves records and sessions (a sessions-only project was showing
the same list twice under two headings).

**S3 · 캘린더 rebuilt.** Rail = the month as a day agenda; pane = the grid;
selecting a day scrolls the rail to it. Month nav, 오늘 and 날짜 미정 moved onto
the band; the tray is a strip under it. Cells show what fits then `+N`, measured
from the real cell height via ResizeObserver: verified at 141px the cell fits
all 5 entries with no chip, and at 92px it shows 3 + `+2` with nothing clipped
and no internal scrollbar. `+2` selects the day and the rail reveals all 5. The
기록으로 back button is gone, a fossil from when the calendar was a body
takeover inside 기록.

**Known consequence, recorded rather than hidden:** `WeeklyReviewView` is
retired (zero renderers) and was borrowing four classes from the old calendar
header (`ledger-calendar-back/nav/month/count`), which S3 removed. If it is ever
re-wired it needs its own header styles; the v8 skeleton would have required
restyling it regardless.

## Done (v8 review pass · 10 real bugs in the new code, 2026-07-17)

v8 shipped ~1500 lines of new UI in one day with no review, and four bugs had
already surfaced by hand during the build. So the whole v8 surface got an
adversarial review (two independent reviewers, 프로젝트 and 캘린더) plus the first
end-to-end user-flow run: write a note, file it, follow it to 프로젝트, follow it
back. Every finding below was verified in the code before fixing.

**Found by the flow run (the worst one, and no test would have caught it):**
opening a note from 프로젝트 or 캘린더 showed a BLANK editor over real text.
The pane mounts before the record resolves, `autoFocus` takes focus, and
`NoteMarkdownEditor`'s prop-sync only adopts a value while the view is NOT
focused, so the note landed in React state (`32자` in the status line) while the
editor stayed empty. The next keystroke would have saved the empty document over
the note. The guard exists to stop an external value fighting the keyboard for
the SAME note; a change of DOCUMENT must load regardless, so it now keys on
`docId`.

**Found by review · 캘린더:**

- **Days were keyed by the UTC date.** A note has no `occurredStart`, so its day
  came from `capturedAt`, written with `toISOString()`, and `recordsByDate`
  sliced that string while every "today" on the surface is local. In KST a note
  written before 09:00 sat on YESTERDAY, and on the 1st it fell out of the
  visible month. Mori's claim is that it places work on honest activity time,
  so a day out is not a rounding error. `activityDay` now converts an instant to
  the local day and leaves a bare `YYYY-MM-DD` alone (parsing that would shift it
  the other way in a negative offset). Three existing tests encoded the slice and
  were rewritten; the new ones fail against the old code, checked both ways.
- `selectedDate` survived month paging, so 이 날에 stayed live pointing at an
  invisible day two months back: one click filed the record there and it read as
  vanishing. The keyboard path already moved the cursor with the day; the month
  buttons now drop the selection.
- `dragleave` bubbles, so the drop highlight strobed as the pointer crossed the
  entries inside a cell, worst on the busiest cells.
- The `+N` button is itself a row and was not budgeted, so every overflowing cell
  rendered `fit + 1` rows into a `fit`-row budget.

**Found by review · 프로젝트:**

- **Archiving the busiest (or only) project crashed the screen.** The tree hides
  an archived subtree but `buildProjectGroups` does not filter archived, so the
  selection went invalid and the repair picked that same archived project back
  out of `groups` as a fresh object each run. `Object.is` never bailed and the
  effect depends on `selection`: Maximum update depth exceeded. A selection is
  now valid when the context EXISTS, which also un-breaks 보관됨 (clicking an
  archived project was being undone on the next tick).
- 이동 offered archived projects as targets, and moving into one swallowed the
  project: gone from the tree as an archived descendant, and absent from 보관됨,
  which lists archived TOPS.
- Rename and re-parent could give two siblings one name. The derived path is the
  group KEY, so that merged two projects: one project's records rendered under
  the other while its own page read empty. `planProjectPath` upheld this at
  create; the other two writes now do too, and a rename refuses a "/".
- 하위 프로젝트 threw away the known `parentId` and re-derived it through a path
  string that `planProjectPath` re-matched by NAME.

Both reviewers also cleared things worth recording: the dependency-free keyboard
effect is correct (cleanup removes the previous listener, so exactly one exists
and the closure is always fresh), the date math is right, the ResizeObserver
cannot loop (rows are sized independently of cell content), `dragging` is never
left stale, and a drag cannot start from the rename field.

## Done (v8 S4 · accelerators, and the 보관 question answered, 2026-07-17)

v8 is now built end to end (S1-S4). The one thing still open by choice is the
calendar rail's scope (month vs infinite), which wants use before a decision.

- **보관 · §9's open question, answered.** Archiving is ONE write; hiding the
  subtree is a view rule. A cascade cannot promise a lossless 복원 (it forgets
  which children the user archived on purpose), and deriving the hide can.
  Verified live: `docs` archived on purpose under 회사, then 회사 archived, wrote
  `archived` on 회사 only, and restoring 회사 left `docs` archived. This also
  activated `KernelContext.archived`, a field that was declared, read in exactly
  one place, and written by nothing.
- **프로젝트로 만들기** turns a 연동 폴더 into a real project: nothing moves, and
  the sessions join by the exact-leaf rule on the next read.
- **A bug that feature exposed:** `buildProjectGroups` seeded its groups from
  `groupRecordsByContext`, which drops contexts holding no records. So a project
  with only SESSIONS had no key at all: its own sessions fell through to an
  unfiled leaf group while the project itself read as empty right beside them.
  Groups now seed from every project context. This was invisible before only
  because no path existed to create a session-only project.
- **Keyboard day navigation** (arrows, `t`, Esc), which follows the selection
  across a month edge so the grid and the selection never disagree, and ignores
  keys aimed at a field. It also fixed a real fragility: the handler cast
  `event.target` to `HTMLElement` and called `closest` on it, which throws when
  the target is the document or the window.
- **Drag-to-re-parent** with a drop highlight gated by `canReparent`, plus drop
  on the blank rail to promote to a root. Both stay accelerators: the 이동 menu
  still reaches every move.

## Done (v7 step 6 · rename/re-parent + a verified audit, 2026-07-17)

**Rename and re-parent shipped, guarded and reversible.** Building them first
exposed that v7 §7 was wrong: it justified `parentId` by calling a re-parent "an
audited revision the existing 되돌리기 undoes." `KernelRevision` is keyed by
`recordId` and `saveContext` overwrites whole, so **contexts have no revision log
at all.** The §7 conclusion still stands (a rename touches one name, never
rewrites descendants) but NOT on an undo guarantee that does not exist. The doc
now carries that correction, and rename/re-parent return their previous value so
a caller can offer 되돌리기 itself. `reparentContext` refuses self and descendant
targets.

**A six-lens adversarial audit of the whole 기록 workspace** (42 agents, each
finding faced two skeptics with different kill reasons; stale comments and
comment-only em dashes were correctly killed). Nine findings survived; all fixed:

- **The provenance chip lied.** It tested only `origin === "derived"`, so a
  session the background watcher wrote unattended read "직접 입력" · claiming the
  user typed it, while the same record's revision trail said 자동/Mori. One shared
  `originLabel` now resolves all five origins; both surfaces use it.
- **되돌리기 confirmed what it restored.** `restoreRecords` hardcoded "active", so
  a 확인할 것 candidate thrown away and brought back came back CONFIRMED, a state
  the user never chose. It now reads the status out of the discarding revision.
  This was a bug I had shipped earlier today with the discard doors.
- **무시 had no door back.** On a candidate it did the exact kernel effect of
  버리기 (status → discarded) but never raised the 되돌리기 strip: two buttons on
  one bar, one outcome, only one reversible.
- **Provenance bled across records.** `useRecordProvenance` reset only when the
  id went null, so switching from A to B showed A's 이력, 원문 and 관련 항목 under
  B's title until B's async read landed.
- **프로젝트 opened a note in a 340px textarea.** It was the only surface not using
  `openRecordInLedger`; the same note opened as a real document from 캘린더 and as
  a cramped inspector here. Now routes to the editor; the inspector rail is
  retired from this screen (still live in ContextRail).
- **프로젝트 rendered a flat leaf list.** 회사/mori and 개인/mori were two identical
  "mori" rows; the `parentPath` was already computed and handed in, never shown.
  Now a dim parent prefix appears only when the leaf is ambiguous.

Each fix landed with a pinning test where the logic is pure (`statusToRestore`,
`originLabel`), and the 프로젝트 editor route + disambiguation were verified in the
browser on two same-named nested projects. Test data set up and torn down; the
user's store left as found.

**Rename / re-parent now have a UI door.** A hover-revealed pencil on each project
row opens an inline name input + a 상위 select, routed through `renameContext` /
`reparentContext` (which had been added with no caller). The parent options are
filtered by `canReparent`, so the control cannot even offer a move the write
would refuse. No undo toast, and that is deliberate: a renamed or moved project
stays fully visible and re-editable, so the door back is always open, unlike a
discard that hides the record. Verified in the browser: renaming 회사 to 팀 left
the child `mori` untouched (`name` and `parentId` unchanged), so its derived path
became 팀/mori for free · the whole reason the path is derived and not stored.

## Done (v6 · honest notes, 2026-07-17)

Direction + evidence: `v6-honest-notes.md`. A six-dimension audit of 기록 (33
raw findings, 26 confirmed after adversarial verification) plus direct user
report. The theme: several surfaces were **stating things that were not true**.

- **Lies removed.** Frozen mount clock → `useNow` (`src/lib/time/useNow.ts`), so
  오늘/어제 stop lying past midnight and an extraction stops persisting the wrong
  date; applied at all four frozen sites. "날짜 미정" under 오늘 → gate on
  `isDateUndecided`, show the real write time. 쓰는 중 on a failed save →
  저장 실패 in semantic red. The calendar showed agent sessions and **nothing the
  user had typed** (keyed off a raw `occurredStart`, which no note has) → key by
  `displayTime`. 프로젝트's empty state advertised a path that did not exist.
- **A note now has a way out**: `⋯ → 버리기`, a status change, menu-gated so it
  can never be a stray click. 기록 creates eagerly, so this was the gap.
- **A note can belong to a project** (`ContextPicker`, `createProjectContext`).
  The kernel supported it all along; only a control was missing. Files via
  `contextIds` so it is an audited, undoable revision.
- **Nature demoted**: a *detected* nature may no longer hide an extraction (one
  공부 was folding away a real 운동). Only a user-set nature folds. Detector
  narrowed; a known keyword-floor limit is recorded in a test.
- **Revision granularity changed deliberately** (rule change, user-authorized):
  one editing burst is one revision, not one per 650ms autosave, which had been
  measured at 64x a note's own size. K1 reversibility kept, granularity coarsened
  to "each sitting".
- **Layout doctrine**: `--workspace-band` (52px) is now the one top-band height
  across rail / main / right panel / action bar, so the rule runs unbroken; the
  note header left the scrolling document to become a band. 라이브 피드 pinned out
  of the scroll with symmetric padding by construction.
- **Editor**: ⌘F find-in-note (`search` + `searchKeymap`), Tab indent /
  shift-Tab outdent.
- **Timeline**: connector cap removed (it dropped every line past the first 40,
  in event order); Flow Focus keeps 16 as a product decision.
- Correctness: createInFlight cleared in a `finally` (a rejected first save
  wedged the editor forever); click-to-create serialized per link title (a
  double-click minted twins); NFC moved into `createRecord`/`applyRecordPatch`.
- Verified in the browser: rail↔main↔panel bands measure 52/52/52 with 0 spread;
  three typing bursts add one revision; a note reaches 프로젝트; the calendar
  shows written notes; ⌘F opens the panel. check:full 2923 green.

**Open decisions (do NOT resolve autonomously):** the local-LLM extraction engine
(v6 §2: the rule proposer cannot represent agency, negation or context, so
extraction stays a demo until this is answered), and the right-panel question
(v6 §6.2: v2 already approved "no right panel"; three options are on the table).

**Tool limit worth knowing:** the browser preview's `key` action sends modifiers
in the wrong order (letter first, then Meta), so ⌘ shortcuts cannot be tested
through it; verify those on the desktop app. It typed a stray character into a
note during this session (caught and reverted).

## Done (v5 · nature + editor + search, 2026-07-17)

- **Nature-gated extraction (N1)**: `noteNature.ts` reads a note's kind
  (일지/회의록/회고/학습/에세이/스크랩) with a deterministic detector that only
  claims the structurally-clear natures (URL-dominant → 스크랩, attendee/agenda
  → 회의록, retro/study keywords) and defaults to 일지. The 추출 panel now leads
  with proposals that fit the nature and folds the rest under "이 성격과 결이
  다른 N개" (never dropped); a correctable nature chip sits in the panel header
  and resets per note. Essay stays a manual correction because essay-vs-prose-
  journal is not reliably rule-separable. Confirmed records always show.
- **Editor live preview**: `concealMarkdown` (in `noteEditorExtensions.ts`)
  walks the lezer tree and collapses emphasis/strong/strikethrough/heading/
  inline-code/link punctuation on every line the caret is not on, revealing the
  raw markers again when the caret enters the line (fenced fences + bare URLs
  kept). `**굵게**` now reads as 굵게 — the Obsidian source-mode feel.
- **List/search**: `recordSnippet` strips inline markdown (rows read as prose,
  list markers kept) and, while searching, surfaces the body line holding the
  query so the match is visible; `matchSegments` wraps each case-insensitive
  hit in a `.note-item-mark` (calm purple wash) across title + snippet.
- Verified in the browser preview: nature chip detect/correct/fold, concealment
  reveal-on-caret, snippet stripping, and highlight + hit-line surfacing.
  check:full 2893 green, build + style clean.

## Done (v5 · note-tool bar, 2026-07-17)

- 기획 doc `v5-note-tool-bar.md`: references (Obsidian/Bear/iA/Granola…),
  editor decision, extraction extensibility architecture (nature-first,
  schema-as-data, LLM engine seam), Obsidian vault bridge direction
  (storage ADR K4), list/search roadmap.
- Editor: CodeMirror 6 markdown surface (`NoteMarkdownEditor.tsx`) — live
  md styling, 24px first-line title, app-var theme (both modes), autosave
  status (N자 · 저장됨). Markdown stripped from titles/extractions
  (`stripInlineMarkdown`).
- Extraction: pending cards editable before confirm (kind select + date
  input, "…에서 추정" evidence); identity matching is title-only so a
  retyped confirm consumes its preview. Rail overflow on desktop fixed
  (WKWebView search-input appearance + rail containment).

## Done (v3 · Daily Ledger, 2026-07-16)

- 기록 re-planned and rebuilt to the reference bar
  (`v3-daily-ledger.md`): the list now reads as days accumulating
  (오늘/어제/dated sticky headers, default `day` group mode in
  `noteExplorerModel`), rows are two-line Bear-style (kind dot · title ·
  body snippet via `recordSnippet` · trailing HH:mm), and the header
  dieted to one control row (＋ icon · search · one 보기 popover with
  날짜별/프로젝트별 + 정렬) plus the horizontal facet-chip row. Pane
  widened 282→340px.
- The center pane's idle/composing states merged into the **capture
  canvas**: composer + an 오늘 section listing today's records right
  below (Apple Journal loop). Saving stays on the canvas and the new
  record appears immediately; the passive "메모를 선택하세요" empty
  state is deleted. A selected record reads as a document (21px/750
  title, 15px/1.75 body at a 760px measure).
- 세션 index rows upgraded: per-agent monogram chip (CL/CX/…, recovered
  from the auto-import id via `agentIdFromAutoImportedSessionId`),
  two-line anatomy (title / project · relative time), 600-weight titles.
- Verified in-browser light + dark: capture → 정리 → 저장 leaves you on
  the canvas with the record under 오늘 and in the list's 오늘 group;
  view menu switches 날짜별/프로젝트별; facet chips gained 활동
  automatically (extensibility). All tests green.

## Current stage

R1-R7 done. **v4 shell reframe underway** ("두 경험 + 교차 렌즈": 기록=notes·edit,
세션=AI work·review; 프로젝트·캘린더·검색 as cross-lenses). R8a/R8b-lite done.
Legacy 메모리 surface retired from bell·palette·home (2026-07-15). **세션 unified
workspace shipped** (2026-07-15): two-pane 진행 중 / 과거 index + inline live/review.
Next: slim icon rail (홈·기록·세션·프로젝트·캘린더·검색 + 설정).

## Done (capture-quality guards, 2026-07-16)

- The rule proposer no longer auto-applies false 운동 records. A negation
  guard (`NEGATION_RE`) keeps "운동을 안 해서 몸이 무겁다" a note instead of a
  workout (negation blocks 운동/학습/활동, but insight/task still fire); a
  generic-word-only workout (운동·헬스·웨이트 with no concrete exercise,
  duration, or sets, e.g. "헬스체크") is demoted to 0.6 so it lands in 확인
  필요 rather than the live ledger, and the generic words are no longer minted
  as exercise entities. Concrete workouts keep 0.75. Tested + verified
  in-browser. Also wired 검색 to the kernel FTS this pass (see the search
  unification audit S1). Files: `src/lib/capture/ruleBasedProposer.ts`.

## Done (프로젝트 labeled sections, 2026-07-15)

- A context's records now read as labeled sections (세션 · 결정 · 노트 · 활동 ·
  기타) in a fixed order, each a quiet header + count over its ledger rows, so a
  project is scannable by kind instead of one flat list. Pure helpers
  `groupRecordsBySection` / `sectionForSchema` (unit-tested); an unlisted schema
  falls into 기타. Commit `9546c93`.
- Deferred (needs user direction): the "click a record → open in its proper home"
  routing (notes → 기록, sessions → 세션) and the 기록 editor enhancements
  (type change · entities · related records). The editor entities/related
  addition was reverted earlier on the interaction-model concern, so it is a
  design decision, not a mechanical add.

## Done (슬림 아이콘 레일, 2026-07-15)

- The sidebar is now a permanent 64px icon rail (icon over micro-label). Nav is
  the v4 six: 홈 · 기록 · 세션 · 프로젝트 · 캘린더 · 검색 (검색 opens the command
  palette). 대시보드 · 워크벤치 · 작업 그래프 retire to the palette; the always-on
  최근 작업 tree is gone from the shell (session browsing lives in 세션).
- 만들기 + 알림 stack in the head; the 만들기 menu opens beside the rail. The
  rail's collapse toggle is removed; icon-only focus mode stays palette-reachable
  and the mobile off-canvas drawer is unchanged. Scoped to `.sidebar.is-rail` so
  the collapsed / drawer mechanics are untouched.
- Verified in-browser: 64px rail, all six destinations navigate and render, 검색
  opens the palette, 만들기 menu opens, workspace gained ~190px, no new console
  errors; build + 2790 tests + style:check green. Commit `11a0c56`.

## Done (세션 unified workspace, 2026-07-15)

- New `sessions` view (`SessionsWorkspace`): a two-pane surface with a left
  `SessionIndex` (진행 중 = live-follow sessions, 과거 = stored history grouped by
  recency) and a right pane that hosts the live feed (라이브 피드, always
  clickable to return) or a picked past session's review (`SessionDetailView`)
  inline. Mode is local to the surface, so switching never leaves the view.
- The index supersedes both the live view's session-picker popover and the
  global 최근 작업 tree; the tree is hidden on 세션 too, so the shell is never
  two competing lists. Sidebar 라이브 destination now points at 세션;
  standalone 라이브 피드 stays palette-reachable.
- Composes the existing `LiveSessionView` and `SessionDetailView` unchanged.
- Verified in-browser: two-pane renders (248px index, full-height), past-click
  loads the review inline, 라이브 피드 returns to live, no console errors,
  build + 2790 tests + style:check green. Commit `28f212d`.

## Done (R8b-lite · sidebar de-duplication, 2026-07-15)

- The shell's 최근 작업 navigator (project → legacy-session tree) is hidden on
  the surfaces that own a unified note explorer (기록 · 캘린더), so the
  sidebar is not two competing lists; a flex spacer keeps the foot pinned. It
  returns on other views. Low-risk conditional render.
- Verified: 기록/캘린더 show no 최근 작업 tree (foot stays at the bottom);
  대시보드 and others show it again; no console errors.

## Remaining v3 work (R9 · larger, deferred)

The deep shell merge is a bigger, higher-blast-radius change best done as a
focused next step, not rushed:

1. Move the unified explorer out of the 기록 view and into the shell sidebar
   (replacing the navigator), so record selection is app-level and 기록 is
   just the editor. Needs app-level selected-record state.
2. Bring legacy sessions (sessionStore) into the unified explorer as a `세션`
   type, routing to a per-kind session renderer (흐름/정리/상태) instead of a
   separate surface. This bridges the two parallel data systems (kernel
   records vs legacy sessions) and is the real unification.
3. Slim the nav to a few global destinations; retire 대시보드/워크벤치 to
   홈/palette per the v3 model.

## Done (R8a · explorer filter + group toggle, 2026-07-15)

- `noteExplorerModel`: `buildExplorerGroups` gains a `groupMode`
  (project / recent; recent is one flat newest-first list, no headers) and
  `recordTypeFacets` lists the types present, most common first, with labels
  (extensible: a new schema is just another chip). Tested.
- `NoteExplorer`: a 프로젝트별 / 최근순 group toggle, a 날짜 / 제목 sort
  toggle, and 종류 filter chips (전체 + one per schema present). The filter
  applies to the grouped records; the pinned 확인할 것 group always shows.
- Verified in the Vite app: chips read 전체·노트·운동·인사이트·할 일·활동;
  filtering to 운동 shows only the workout; 최근순 renders a flat headerless
  list newest-first; no console errors. 2790 unit tests + build + style green.

## Done (R7b · global calendar, 2026-07-15)

- Promoted `LedgerCalendarView` to a top-level `CalendarView` reached from a
  new sidebar-head calendar button (beside ＋ / graph / bell). It scopes over
  all ledger-visible records, so it spans 기록 and AI sessions (agent
  sessions are records). `navigate("calendar")` is now its own view (removed
  from the ledger normalization); `App.tsx` routes it.
- Cross-view handoff: `openRecordInLedger(recordId)` in the store sets the
  ledger view + a pending `openRecordId`; `LedgerWorkspace` reads it once and
  opens the record. Calendar cells became divs with a day-number button and
  clickable note-chip buttons (no nested buttons); clicking a chip opens that
  record in the 기록 editor.
- Verified in the Vite app: the head calendar button opens the calendar with
  populated cells and a 기록으로 return; clicking a note chip routes to 기록
  with that record open in the editor and selected in the explorer; no
  console errors. 2788 unit tests + build + style green.

## Done (R7a · document workspace, 2026-07-15)

- Extracted `recordEditing.tsx` (InlineEditable, ActivityDateEditor,
  revertPatch) from `RecordInspector` so the rail inspector and the new
  center editor edit a record the same way.
- `noteExplorerModel.ts` (pure, tested): `buildExplorerGroups` groups records
  by project (contextIds + belongs-to), a 기타 bucket for the rest, sortable
  by date or title, groups ordered by newest activity (기타 last).
- `NoteExplorer` (left pane): ＋ 새 기록, search, 날짜순/제목순 sort, a pinned
  확인할 것 group (candidates + date-undecided), project groups, note items
  (kind dot + title + date·kind meta).
- `DocumentEditor` (center): the selected record as an editable document
  (title, meta row with the date editor + project/kind chips, full body),
  provenance dot, 원문/이력 as quiet disclosures with 되돌리기, candidate
  반영/무시; a new capture hosts the composer; empty state otherwise.
- `LedgerWorkspace` rebuilt as `ledger-docs` (explorer + editor, no right
  panel); the timeline / context rail / review strip / mini-calendar /
  weekly-review arrangement is retired from 기록 (components kept for reuse).
- Verified in the Vite app: explorer shows 새 기록 + search + sort + groups;
  selecting a note opens the editable document (title, date, kind, body,
  원문/이력); ＋ 새 기록 hosts the composer, and 정리 → 저장 opens the saved
  record and lists it selected in the explorer; a title edit propagates to
  both; no console errors, old surfaces gone. 2788 unit tests + build + style
  green.

## Done (R6, 2026-07-15)

- `weeklyReview.ts` (pure, tested): `weekRange` / `shiftWeeks` and
  `buildWeeklyReview` → per-day kind bars, this-week tracker aggregates with a
  metric delta against the previous week, and the week's insights/decisions.
- `WeeklyReviewView`: a body takeover opened from the rail's 주간 리뷰 button.
  Per-day stacked kind bars, aggregate rows written as sentences (운동 1회 ·
  1시간, 지난주보다 1시간 증가), routine suggestions with 루틴으로 만들기
  (the deferred `discoverRoutines` / `createRoutine` finally surface here),
  and the week's insights. Week nav; 타임라인으로 return.
- The body now has three modes (`bodyMode`: timeline / calendar / review);
  the rail hides its mini-calendar only in calendar mode.
- Verified in the Vite app: 주간 리뷰 opens the review (timeline hidden),
  range "7월 12일 - 7월 18일", 기록 3건; day bars show 화 1 (활동) and 수 2
  (운동+할일); flow rows read "활동 1회", "할 일 1회", "운동 1회 · 1시간
  지난주보다 1시간 증가"; the routine and insight sections stay hidden when
  the data has none; previous-week nav shows the record moved to 7/10;
  타임라인으로 returns; no console errors. 2785 unit tests + build + style
  green.

## Deferred (R6 follow-up)

- The tracker views were folded entirely into the weekly review and the rail
  one-liner; a dedicated per-schema metric chart (트래커 lens) is not built,
  matching the audit's decision to retire the standalone 합계 panel.

## Done (R5b, 2026-07-15)

- `useRecordLedger.updateRecord(record, patch)`: a user edit as an audited
  revision (via `applyRecordPatch`).
- `RecordInspector` is now editable (fixes the read-only D6): the title and
  body are click-to-edit (`InlineEditable`; Enter / ⌘Enter saves, Esc
  cancels), the activity date has an editor (pick a day → user-provided, or
  날짜 없이 → capture-fallback), the origin shows as a provenance dot
  (Mori가 정리 / 직접 입력), and the history offers a 되돌리기 on the most
  recent change (restores its `before`, itself recorded as a revision).
  `useRecordProvenance` takes the record's `updatedAt` as its reload key so
  the history refreshes after each edit. `ContextView` passes `onUpdate` too.
- Verified in the Vite app: selecting a row opens the editable inspector;
  editing the title updates the inspector and the timeline row and adds a
  수정 revision; 되돌리기 restores the prior title (append-only, a 4th
  revision); the date editor moves the record to a new day group; provenance
  dot and history render; no console errors. 2781 unit tests + build + style
  green.

## Deferred (R5 follow-up)

- The roomy full-detail body-takeover for long notes (M6 wide layout): the
  rail inspector edits records of any length (the body textarea scrolls), so
  nothing is blocked; the wide variant is a comfort refinement.
- Per-revision 되돌리기 is offered on the latest change only (an unambiguous
  undo); reverting to an arbitrary older point is not exposed.
- 재분석 / 분리 / 병합 header actions (M6) are not yet wired.

## Done (R5a, 2026-07-15)

- `LedgerCalendarView`: a body takeover opened from the rail mini-calendar's
  expand button. Month cells show the day's records (kind-colored marks +
  up to two leading titles + a more count; future-dated entries render as
  outlined "planned" marks). Month nav, month count, "타임라인으로" return.
- Shared `kindColorClass` extracted to `recordPresentation` so the calendar
  marks and timeline chips never drift; `recordsByDate` added to
  `calendarGrouping` for O(1) cell lookup.
- 날짜 미정 tray under the grid: undecided records as draggable chips with a
  "이 날에" click-assign to the selected day (the guaranteed path) and native
  drag-to-cell (accelerator, `onAssignDate` → `setActivityDate`). The rail
  mini-calendar hides while the full calendar owns the body (no two
  calendars); the selected day and record survive the round trip.
- Verified in the Vite app: expand opens the calendar (timeline hidden, rail
  mini-cal hidden), cells show real titles (14 활동, 15 운동+할일), 기록 3건;
  selecting a day highlights the cell and drives the rail agenda; a fresh
  dateless note appears in the tray and "이 날에" assigns it (tray empties,
  count 3→4, cell shows +1); "타임라인으로" returns with the selected day
  intact; no console errors. 2781 unit tests + build + style green.

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
