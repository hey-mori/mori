# 기록 v5 · the professional note-tool bar

Status: **direction approved 2026-07-17; editor + layout slices shipped.**
Builds on v4 (note-first + 추출 panel). The user's bar: 기록 must stand on
its own as a note tool (against Obsidian, Bear, and friends) while the
extraction layer stays honest and endlessly extensible (a note may be an
essay, a meeting, a news clipping, not just 운동/할일).

## 1. References and what each one sets the bar for

- **Obsidian** · local-first markdown vault, files the user owns, editor
  = CodeMirror 6. The vault instinct is already Mori doctrine: the
  storage ADR (architecture doc §10) plans an always-current,
  Obsidian-openable Markdown workspace folder, with user prose becoming
  file-canonical in K4.
- **Bear / Apple Notes** · one writing surface, first line is the title,
  markdown hybrid styling, note list with snippet scent.
- **iA Writer** · the writing area itself is the product: measure,
  rhythm, zero chrome.
- **Notion / Craft** · structure available but never demanded.
- **Granola / Reflect / Mem** · AI understanding beside the user's own
  words, never replacing them: extraction is a *layer*, the note stays
  the artifact. This is exactly Mori's 추출 panel contract.

## 2. Editor (shipped 2026-07-17)

CodeMirror 6 (`NoteMarkdownEditor.tsx`) · the engine Obsidian itself
uses; local, MIT, strong Korean IME. Live markdown styling via lezer
tags mapped to app CSS variables (one theme, both modes), first line
decorated as the 24px title (the data model already derives titles from
line 1), purple caret/selection, autosave status (N자 · 쓰는 중/저장됨)
in the note head. Markdown stays raw in the record body; titles and
extractions strip inline syntax at the derivation boundary
(`stripInlineMarkdown`).

Editor roadmap (in bar order): task checkboxes (`- [ ]` toggling),
자동 list continuation on Enter, ⌘B/⌘I, image/file embeds (needs the
file-canonical stage), wiki-links `[[…]]` binding to records/contexts
(the kernel already has relations), typewriter/focus mode.

## 3. Extraction extensibility (the real answer to "이게 에세이/회의/기사일 수도")

Principles, grounded in what exists:

1. **Schemas are data** (kernel §3): 회의 · 회고 · 지식 · 인사이트 ·
   투자 기록 already exist and user schemas join with zero UI code. The
   추출 panel is already schema-agnostic · anything the proposer emits
   renders and confirms. Extensibility is bounded by the *proposer*, not
   the panel.
2. **The proposer is a seam, not an identity** (`ProposerOptions.propose`).
   Today's rule-based floor is honest but keyword-shallow (the
   memory-quality plan §P2 documents the same failure mode in Quick
   Pass). The upgrade path is the already-designed local-LLM Understand
   engine (`local-llm-understanding-and-live-follow.md`): same
   `RecordProposal[]` contract, so the panel/confirm flow never changes.
3. **Document nature before item extraction.** For an essay, extracting
   three 할 일 rows is noise; the right first move is classifying the
   note's nature (일지 · 회고 · 회의록 · 에세이 · 스크랩/기사 · 학습 노트)
   and letting nature gate what item extraction runs. Slice N1: a
   deterministic nature guess (URL-dominant → 스크랩, attendee/agenda
   markers → 회의록, long single-topic prose → 에세이/회고) shown as a
   quiet chip in the 추출 panel with one-tap correction · corrections
   feed personalization rules (kernel Rule) so Mori learns the user's
   vocabulary. Slice N2: the LLM engine takes over nature + items with
   confidence, same disclosure levels as Quick Pass.
4. **User correction is first-class**: every pending card is editable
   before confirm (kind + date), so a wrong guess costs one click and
   teaches the system rather than polluting the ledger.

## 4. Obsidian vault bridge (direction, K4-aligned)

The storage ADR already commits to a Markdown workspace folder; the
note-first model makes the mapping trivial: one `note` record ↔ one
`.md` file (title = first line = filename base, body = file body,
frontmatter carries record id + times). Stage 1: export-only mirror
(deterministic, always-current, Obsidian-openable · zero conflict
surface). Stage 2 (K4): user-designated vault path + external-edit
detection + 3-way merge → prose becomes file-canonical. Desktop-only
(Tauri fs). Not started; do not fake it in UI before stage 1 ships.

## 5. List · search · filter roadmap

Shipped: day groups, snippet rows, one control row, facet chips, WKWebView
search-input containment. Next: search hit highlighting + body-snippet
match preview in rows; a 확인할 것 count badge on the rail; range
filters (이번 주/이번 달) in the 보기 menu; virtualized list past ~1k
rows.

## 6. Non-goals (unchanged)

Cloud sync, embeddings-as-truth, auto-applying extractions without the
review gate, a WYSIWYG block editor (markdown hybrid is the identity).
