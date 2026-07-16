# 기록 v4 · Note-first with live extraction

Status: **approved + implemented 2026-07-16.** A user-directed reframe of
기록: it is a **note** app first, and the structured records Mori pulls out
of a note are a first-class derived layer shown beside it. Supersedes the
v3 capture-canvas (composer box + 정리 button + review cards), which read
as filling a form. The v3 daily-ledger list, day grouping, and full-bleed
layout skeleton (`v3-daily-ledger.md` §3.0) are kept.

## The reframe

- **Writing is capture.** You open a note and write freely (one surface,
  the first line is the title, it saves itself). No composer box, no 정리
  button, no modal review.
- **Extraction is a derived layer.** As you write, Mori runs the
  deterministic proposer over the note body and shows what it can pull out
  (운동 · 학습 · 결정 · 할 일 · 활동 · 인사이트 …) in a right **추출 panel**
  ("Mori가 찾은 것"). Each is confirmed one-by-one into a durable record.
- **The list is one row per note.** Extractions live inside their note's
  panel, never as separate list rows.

## Data model (on the kernel, no new tables)

- A **note** is a `note` record: `body` = the raw text, `title` =
  `deriveNoteTitle` (first line), `origin: user`, `timeBasis:
  capture-fallback` (a note's time is when it was written, so it lands on
  today's day group, not in 확인할 것). This is the user-owned artifact.
- An **extraction** is a live, pure preview: `extractFromNote(body)` runs
  `proposeRecords` and drops the plain-`note` fallback (the note already
  IS the note). Recomputed from the current body, never persisted until
  confirmed.
- **Confirming** an extraction creates a record from the proposal
  (`origin: derived`, `status: active`, inheriting the note's contexts)
  plus a `derived-from` `KernelRelation` (extraction → note). Confirmed
  extractions are matched out of the live preview by identity, so the same
  item never appears twice. Records that are `derived-from` a note are
  filtered out of the list (explorer groups + 확인할 것).

## Layout

`.ledger-workspace` (full-bleed, §3.0): **rail** (day-grouped notes,
248px) · **note editor** (the writing surface, `flex:1`) · **추출 panel**
(`.note-extract`, 264px, collapsible via the header toggle). Below 1000px
the panel stacks under the editor.

## Code

- Model: `src/features/record-ledger/noteWorkspace.ts`
  (`deriveNoteTitle`, `extractFromNote`, `buildNoteExtractionPanel`) +
  tests.
- Hook: `useRecordLedger.createNote` / `confirmExtraction`.
- UI: `NoteEditorPane.tsx` (write surface + panel, debounced autosave at
  650ms, create-on-first-save, focus-on-mount), wired in
  `LedgerWorkspace.tsx`; non-note selections still read as a
  `DocumentEditor`.

## Done criteria (all verified in-browser, light + dark)

1. Writing a note saves it as a `note` record that appears in the list;
   the first line is its title.
2. The 추출 panel shows live typed extractions as you write; 확인 saves one
   as a `derived-from` record and marks it confirmed.
3. A confirmed extraction is not a separate list row; reopening the note
   restores its body, its confirmed extractions, and the live pending ones.
4. `npm run check:full` green.

## Open follow-ups

- Re-extraction drift: a confirmed extraction is decoupled from later note
  edits; flag it when the note no longer supports it.
- Non-note record view polish (the `DocumentEditor` document read).
- Edit an extraction's date/type in the panel before confirming.
- First-line-as-title visual treatment inside the editor (currently the
  list + panel derive the title; the editor is one plain surface).
