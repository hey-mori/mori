# 검색 S1 · kernel records in the search surface (spec)

Status: **proposal spec, 2026-07-15.** The implementation contract for
slice S1 of
[`search-and-session-unification-audit.md`](search-and-session-unification-audit.md):
make kernel records findable from the 검색 surface. S1 is a wiring
slice; the FTS engine already exists end-to-end
(`V008` FTS5 + triggers, `search_kernel_records` Tauri command,
`kernelRepository.searchRecords`) with zero production callers.

## 1. Job and shape decision

Job: "과거 기록을 다시 찾아 쓴다", from anywhere, in one place. The
shipped shape is that the rail's 검색 button opens the command palette;
S1 keeps that shape and adds a **기록 section** to the palette rather
than building a separate results view. Grounds: lowest blast radius,
the palette already owns global invocation (⌘K + rail), and a dedicated
view can grow later (S1b) from the same producer without rework. The
stale claim in the palette comments ("one search surface across
sessions, records, and destinations") becomes true instead of being
rewritten.

## 2. Behavior

- Typing in the palette (existing input) additionally queries
  `kernelRepository.searchRecords(query, limit)` once the query is
  **2+ characters**, debounced ~150ms, results capped at 8. Commands
  and legacy session titles keep their existing sections and scoring;
  records render under a `기록` section header.
- A record row shows: kind dot + title (fallback: body snippet), one
  quiet meta line (schema label · activity date · first context name),
  and a match snippet when FTS provides one. No provenance chips, no
  status badges (calm surface; the record detail carries the rest).
- **Enter / click** routes through the existing
  `store.openRecordInLedger(recordId)` handoff (shipped for calendar
  chips): 기록 opens with the record selected in the explorer and
  editor. Agent-session records route the same way until the 세션
  cross-routing decision (worklog deferred item) lands; this spec does
  not preempt it.
- A new `CommandTarget` variant `{ kind: "openRecord", recordId }` is
  the only palette-model change
  (`src/lib/commandPalette/commandPalette.ts:26-31`).

## 3. Honesty states

- **Desktop**: FTS5 results. **Browser**: the repository's substring
  fallback; the 기록 section footer reads `간단 검색 · 데스크톱에서
  전체 검색` so parity is never faked.
- **Desktop fallback** (`fellBack` from the repository): same footer
  treatment naming localStorage, consistent with the repository's
  existing honest-fallback contract.
- **Empty query / no matches**: the section simply does not render; no
  empty-state card inside the palette.
- **Search error**: the section renders one quiet line (검색을 사용할
  수 없습니다) and never blocks the command sections.

## 4. Ranking and scope

- Ranking: FTS default order (desktop), substring recency order
  (browser); a single presentation-side tiebreak by activity time
  descending. No tunable weights in S1; if recall quality demands
  fusion later, the reference is Kryton's single-query RRF (see the
  reference review), still behind the "embeddings never canonical"
  rule.
- Scope: kernel records only. Contexts, entities, and sources as
  result types are S1-later (the target IA names them); legacy
  accepted-memory search stays where it lives (Ask Mori) until the V003
  converter (audit S4) retires it. Discarded records are excluded;
  candidate/provisional records are included and render their existing
  status treatment (they are the user's own data on a local surface;
  the provisional exclusion rule is for **external** outputs only).

## 5. Done criteria

1. A workout note captured in 기록 and an agent session captured via
   the manual button are both findable from the palette by body text
   (not just title) on desktop.
2. Enter on a result lands in 기록 with that record open and selected.
3. Browser build shows the 간단 검색 label and still returns
   title/body substring matches.
4. `npm run check:full` green; palette keyboard navigation (arrows,
   Enter, Escape) unchanged for command sections.

## 6. Test floor

- Palette model: record producer merges into sections without
  disturbing command scoring; `openRecord` target dispatch.
- Repository: query length gate, limit, `fellBack` propagation
  (existing tests cover search itself; S1 adds the producer seam).
- Debounce: rapid typing issues at most one in-flight search; stale
  results are dropped (query token check).
- FTS injection guard already tested in Rust (`kernel.rs`); the
  producer passes raw user text through, never builds MATCH syntax.

## 7. Explicitly out of S1

Dedicated results view, filters/facets (kind chips live in
NoteExplorer), entity/context/source result types, ranked highlighting
beyond the FTS snippet, searching legacy session **content** (S3
unifies the read path first), any change to 검색's rail placement.
