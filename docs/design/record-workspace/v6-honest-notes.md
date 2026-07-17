# 기록 v6 · honest notes

Status: **direction set 2026-07-17 from a working session; slices shipped as
noted. Two decisions still belong to the user (§2, §3).**

v5 aimed 기록 at Obsidian's bar and shipped the editor. v6 is what a day of
using it exposed: the surfaces were polished, but several of them were
**telling the user things that were not true**, and the extraction engine
underneath cannot do the job its UI claims. This document records the
direction, the evidence, and what is deliberately still open.

The through-line: **a note tool earns trust by never lying.** Every slice below
is either removing a lie or removing a reason to tell one.

## 1. What a day of use exposed (all fixed unless noted)

Found by a six-dimension audit of 기록 (33 raw findings, 26 confirmed after
adversarial verification), plus direct user report.

| Lie | What it actually did | Fix |
| --- | --- | --- |
| 오늘 / 어제 labels | The clock was frozen at mount, so a workspace left open past midnight kept calling yesterday 오늘, and persisted the wrong activity date on confirmed extractions | `useNow`, an identity that changes only when the local day rolls over (`src/lib/time/useNow.ts`) |
| "날짜 미정 · 노트" under 오늘 | The row used "no `occurredStart`" as a proxy for "no decided date". A note is written with `timeBasis: capture-fallback` and no `occurredStart`, which IS decided | Gate on `isDateUndecided`; show the real write time |
| 쓰는 중, forever | A failed save had no `.catch`, so a note that was NOT persisting looked like one that was | `saveState: "error"` → 저장 실패, in semantic red |
| The calendar | Keyed cells off a raw `occurredStart`, so it showed agent sessions and **nothing the user had typed** | Key by `displayTime`, the rule the 기록 list already uses |
| 프로젝트's empty state | "세션에서 정리하거나 기록을 담아보세요", which advertised a path that did not exist anywhere | Built the path (§4), rewrote the copy |
| The 추출 panel | Folded away a real 운동 record because one 공부 made the detector guess 학습 노트 | A guessed nature may no longer hide anything (§3) |

Structural fixes from the same audit: a note could never be **discarded** (기록
creates eagerly on any typed line or clicked unresolved link, with no way out,
now `⋯ → 버리기`, a status change, menu-gated); a rejected first save **wedged**
the editor forever; a double-clicked unresolved `[[link]]` minted **two** notes;
NFC normalization moved into `createRecord`/`applyRecordPatch` so it is an
invariant of the one door records pass through, not a habit each caller repeats.

## 2. The extraction engine · OPEN DECISION

**The rule-based proposer cannot do the job the UI claims.** This is not a
tuning problem. The user's own example settles it:

> "친구가 공부하고 나는 악기를 연주했다"

A keyword proposer sees `공부` and writes **the user's** study record. It does
not know the subject was a friend, and it misses the instrument entirely: it
**invents a wrong record and drops the true one.** A regex cannot represent
agency (who did it), negation ("운동을 안 했다" once produced a workout), or
context (quoted, hypothetical, planned, recalled).

v5 §3.2 already conceded the floor is "keyword-shallow" and named the local-LLM
Understand engine as the real answer. v6 states the consequence plainly: **until
that engine exists, extraction is a demo, and the UI must not speak as though it
is not.** The honest posture in the meantime is to claim less, not to tune the
regex.

**The decision is the user's** and it defines the product: adopting a local LLM
sets Mori's identity on speed, model, offline behaviour and privacy. Nothing in
this document pre-empts it. If the answer is yes, the rule floor is removed, not
extended.

## 3. Note nature · demoted, not deleted

Nature (일지 · 회의록 · 회고 · 학습 노트 · 에세이 · 스크랩) was invented to gate
a bad extractor. When the extractor guesses wrong, the gate **hides a true
record**, and the user never learns it happened.

The two failures cost wildly different amounts:

- showing an off-topic card → a glance
- hiding a true one → the record is gone, silently

Tuning the detector changes the **rate**, never the **asymmetry**. So:

- **A detected nature may not hide anything.** Only a nature the user set
  explicitly may fold.
- The detector was narrowed to tokens a journal would not casually carry
  (`정리했`, `개념`, `요약`, and case-insensitive `keep|problem|try` were
  claiming ordinary prose; a lone "장보기: 계란" passed as a meeting roster).
- A known limit is **recorded in a test rather than papered over**: `공부` really
  is a study word, so a keyword floor cannot separate "a journal that mentions
  studying" from "a study note". Only the §2 engine can.
- The chip presents as Mori's quiet reading, not a form field you owe an answer
  to. **The user should never have to touch it.**

Nature survives because it is the seam the §2 engine plugs into, and the chip is
where a correction would teach it. It does not survive as a gate.

## 4. A note can belong to a project (shipped)

The kernel supported filing **completely** all along: `contextIds` on the record,
patch-supported, SQLite round-tripped, read by every grouping consumer. There was
simply **no control**, so every note was born unfiled and could never reach
프로젝트.

- File through `contextIds`, not a `belongs-to` relation: it is the
  patch-supported path, so one `updateRecord` is an audited revision the existing
  되돌리기 undoes. Relations have no update or delete, so un-filing would need new
  persistence. `belongs-to` stays for the machine-written session/routine paths.
- `ContextPicker` lives in the note band and can mint a project itself
  (`createProjectContext`), since a project must exist before anything joins it.
- Re-filing never disturbs a record's non-project memberships.

**Principle: a written note is a first-class citizen of a project, exactly like
an agent session.** Anywhere sessions appear, notes belong too. The calendar fix
in §1 is the same principle.

## 5. Revision granularity · rule changed deliberately

The kernel promises every change is visible and reversible. It never promised
**every 650ms autosave is its own audit entry**, and treating it as one was
measured at **64x a note's own size** (sixty bursts on a 15k note → 968k
characters, 18.5% of a 5MB browser quota, for one note), because each revision
stores a full `before` AND `after` copy.

One editing burst is now one revision: same id (the store keys by it, so the
write overwrites), the **original** `before` (so 되돌리기 reverts the whole
burst), idle breaks the group: the rule an editor's undo stack uses. Status
changes, another actor's edit, and creates never group: those are the entries a
history is actually read for.

This narrows K1's granularity from "each autosave" to "each sitting".
Reversibility is kept; fine-grained undo already lives in the editor.

## 6. Layout doctrine

### 6.1 One workspace band (shipped)

Every screen's top strip is exactly `--workspace-band` (52px) tall: the rail's
search row, the main pane's header, any right panel's header, and the shared
action bar, so the rule under it runs unbroken across the window.

The step the user saw came from three numbers that never agreed: the rails sat at
52, the action bar's `min-height` plus padding landed on 56, and a headerless
shell hard-coded 56 again on top of a 1px rule. **A shared measurement belongs in
a token, not repeated in three files.**

The 기록 note header had to leave the scrolling document to become a band; inside
the document it drifted with the text and could never align.

### 6.2 Right panels · OPEN DECISION, with evidence

**The user already made this call once.** v2 (`v2-document-workspace.md:19`,
approved) states: "기록 = a document workspace. **Two panes, no right panel.**"
The recorded verdict on the rail was "cluttered, unintuitive, 버려진 느낌". v4
brought a right panel back as `.note-extract`. `DocumentEditor.tsx` still carries
v2's comment, "No right panel", as in-repo proof the job can live in the main
pane.

Measured costs: the 기록 writing measure **never reaches its designed 720px on a
1280 laptop** (64 + 248 + 80 + 720 + 264 = 1376px required) while v5 §1 sets the
bar at iA Writer, where the writing area *is* the product; one concept has six
widths (264/340/340/344/360/420) and three "narrow" thresholds (1000/1100/1180);
selecting a row reflows it under the cursor; the panel's dismiss does not stick.
`information-architecture.md:94` already forbids "a second workspace in the rail"
and the 추출 panel is full of selects, date inputs and 확인 buttons.

Per §16 authority order, user intent (1) outranks current code and docs (6). The
extraction **content** is a good v5 decision and survives regardless; only its
**location** is in question. The two patterns in-app that work are `BaseDrawer`
and the notification popover: **overlays anchored to intent that never reflow the
surface behind them.**

Options put to the user: (A) extraction as a band under the note, restoring v2's
two panes and the full measure; (B) extraction as an overlay drawer; (C) keep and
only fix the width. **Awaiting the choice.**

### 6.3 Caps are not a display policy

The timeline dropped every connector past the first 40, in event order, so lines
appeared at the start and stopped, reading as the feature breaking. A cap that
fires on an ordinary session is not a guard, it is silent truncation.

Measured: 483 events → 483 bars but only 321 connectors; a connector is ~1/7 a
bar's node cost with no handlers or state. The canvas is **not virtualized**, so
capping the cheaper, structurally smaller half could never rescue it. The
timeline cap is removed; Flow Focus keeps 16 as a genuine product decision.
**If this surface ever needs saving it needs viewport culling for the bars.**

## 7. Trap · theme specificity

`theme-application.css` themes every bare `input`/`select` via
`html[data-base-theme] :where(…)`, specificity **(0,1,1)**, which **outranks a
lone class**. Three 기록 controls were silently repainted as form fields
(invisible on a white card in light, a real box in dark). To style a control as
something other than a form field, include its parent. Documented at the rule.

## 8. Non-goals (unchanged from v5)

Unchanged. Plus: do not tune the rule proposer further (§2): effort there buys
rate, not correctness.
