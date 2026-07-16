# 검색 + 세션↔커널 통합 · current-state audit

Status: **audit, 2026-07-15, HEAD `35b0d7a`.** Verified against source, not
doc claims; every finding cites a file. This audit defines the remaining
scope of the session↔kernel unification (the surviving essence of the old
R9 under the v4 shell) and the real distance to 검색 as a complete job.
Consumed by [`workflow-first-direction.md`](workflow-first-direction.md)
§4/§9 (Reuse completion is the strategic priority).

## TL;DR

1. **검색 is a label, not a search.** The rail's 검색 button opens the
   command palette, which searches commands + legacy session titles by
   substring. It reaches no record body, no kernel data.
2. **The kernel FTS engine is fully built and completely orphaned.**
   V008 FTS5 table + sync triggers + Rust command +
   `kernelRepository.searchRecords` all exist; production callers: zero.
   검색 v1 is a wiring problem, not a build problem.
3. **Session↔kernel unification has not started beyond a thin manual
   adapter**, and the newest work (auto-import, `35b0d7a`) deepens the
   **legacy** session store rather than the kernel. This is live drift
   against the architecture doc's Adapt verdict and needs a course call
   before more auto-import slices land.
4. No converter exists for legacy saved sessions (V001) or accepted
   memories (V003) into kernel records; until they do, the retired
   memory surfaces can never pass the §21 removal criteria.

## 1. 검색 current state

### 1.1 What the nav item does

- The 검색 rail button calls `openCommandPalette()` and nothing else
  (`src/components/layout/Sidebar.tsx:150-158`; it is not even in
  `PRIMARY_NAV`).
- The palette searches: navigate targets, actions, themes, settings, and
  **legacy session titles** (`title` + `projectName` + `sourceLabel`)
  from `loadStoredSessionSummaries()`
  (`src/components/layout/CommandPalette.tsx:78-83`,
  `src/lib/commandPalette/commandPalette.ts:125-138`). Matching is
  substring/prefix scoring (`scoreCommand`, `commandPalette.ts:218-228`).
- **Conflict:** the comments at `Sidebar.tsx:148-149` and
  `commandPalette.ts:11-16` describe 검색 as "the one search surface
  across sessions, records, and destinations". Records are absent; no
  record producer exists.

### 1.2 Search implementations inventory

| Implementation | Covers | Matching | Surfaced |
| --- | --- | --- | --- |
| Kernel FTS `searchRecords` (`src/lib/record-kernel/kernelRepository.ts:163-175`; `V008` FTS5 + triggers; browser fallback substring) | kernel_records title/body | FTS5 (desktop) / substring (browser) | **nowhere; test-only callers** |
| NoteExplorer search (`src/features/record-ledger/NoteExplorer.tsx:52-57`) | loaded ledger records | substring on title/body/schemaLabel | 기록 only, local state |
| queryableMemory (`src/lib/project-memory/queryableMemory.ts:102,323`) | accepted memory (V003) + session evidence | substring | Ask Mori / memory surfaces (legacy stack) |
| Palette session search (§1.1) | legacy session summaries | substring | 검색 button |

Two disconnected search worlds: the kernel (FTS built, unused; explorer
substring) and the legacy memory stack. The 검색 surface touches neither
kernel world.

### 1.3 Distance to 검색 as a complete job

Missing pieces, in order of leverage:

1. **A caller.** Wire `kernelRepository.searchRecords` into the palette
   (or a dedicated results view) and add an `openRecord` variant to
   `CommandTarget` (`commandPalette.ts:26-31`), which today can only
   navigate and open legacy sessions.
2. Result rows that show kind, activity time, context, and a snippet
   (the FTS side already returns matched records; presentation only).
3. Kind/context filters and honest desktop/browser labeling (browser
   fallback is substring; say so rather than fake parity).
4. Later: entities/contexts/sources as result types, ranking beyond FTS
   default, provenance drill-in. The target IA
   (`mori-context-workspace-architecture.md:267,301`) already names
   this scope; nothing of it is built.
   `cross-session-memory-search.md` covers the legacy memory layer, not
   this surface.

## 2. 세션↔커널 통합 current state

### 2.1 What exists

- **Legacy model**: `src/app/sessionStore.ts` + V001 tables
  (`projects/sessions/sources/events/issues/decisions/...`), consumed by
  `SessionsWorkspace.tsx:22-49`, `SessionIndex`, the palette, and the
  live view. This is the model with all the fidelity: live status,
  timeline events, analysis runs, issues/decisions/next-actions.
- **Thin bridge (manual)**: `agentSessionToProposals`
  (`src/lib/capture/agentSessionAdapter.ts:38-75`) emits one
  `agent-session` record (+ decision records) through the normal capture
  pipeline; `captureAgentSession`
  (`src/features/record-ledger/useRecordLedger.ts:338-373`) binds them
  `belongs-to` the project context. Triggered by a per-session button
  (`OverviewView.tsx:117-141`).
- **Lens visibility of captured sessions**: 캘린더 yes
  (`CalendarView.tsx:3-22`), 프로젝트 yes (belongs-to), **검색 no**
  (§1.1: the palette reads legacy summaries; kernel FTS has no caller).
- The `agent-session` schema carries only `agentId / stepCount /
  tokenCount` (+ title/body/times) (`systemSchemas.ts:96-108`).

### 2.2 Live drift warning: auto-import deepens the legacy path

Commit `35b0d7a` (auto-import foundation) maps discovered agent sessions
to **legacy `StoredSessionDraft` rows** with a stable
`auto-<agentId>-<hash>` id and idempotent upsert
(`src/lib/agents/autoImportSessions.ts:46-48,79-115`), with an explicit
"registers, does not apply" doctrine note (`:12-17`). It creates **no
kernel records.**

Registering into the legacy store is defensible as a visibility step,
but every further slice built on `StoredSessionDraft` widens the gap the
architecture doc's Adapt verdict (`mori-context-workspace-architecture.md:331-333`,
session → `agent-session` record + `Source`) exists to close. The stable
auto-id is exactly the idempotency key a kernel upsert needs; the
cheapest moment to add the kernel side is now, not after more consumers
grow on the legacy shape.

### 2.3 Missing converters

- **V001 saved sessions → kernel records**: none. No code path reads
  V001 session tables into `kernel_records`.
- **V003 `consolidated_memories` → distilled kernel records**: none
  (`src/lib/sqlite/acceptedMemoryRows.ts` round-trips legacy shapes
  only; architecture doc §9 row "accepted memory → distilled records,
  lifecycle preserved" is unimplemented). Until this exists, the retired
  memory surfaces fail §21 criterion 2 (lossless data migration) and can
  never be removed.

## 3. Recommended slices (planning, not scheduled)

Ordered so each slice is independently shippable and none blocks the
concurrent 세션 workspace work:

- **S1 · 검색 wiring (smallest, highest leverage).** ✅ Shipped
  2026-07-16. The command palette now runs a debounced FTS pass over
  `kernelRepository.searchRecords` at 2+ chars, renders matches under a
  `기록` section (kind icon + title/snippet + schema · date · context
  meta), routes Enter/click through `openRecordInLedger`, and shows the
  honest `간단 검색 · 데스크톱에서 전체 검색` (browser) / `로컬 저장소`
  (desktop fallback) footer. `CommandTarget` gained an `openRecord`
  variant; verified in-browser (a captured note is findable by body
  text and opens in 기록). Implementation contract:
  [`global-search-spec.md`](global-search-spec.md).
- **S2 · auto-import writes kernel records too.** Reuse the stable
  auto-id as the kernel record id seed; upsert an `agent-session` record
  per discovered session alongside the legacy draft (dual-write during
  the transition window, per §12 dual-run doctrine). Done when a freshly
  discovered session appears in 캘린더/검색 without the manual button.
  Implementation contract:
  [`session-kernel-dual-write-spec.md`](session-kernel-dual-write-spec.md)
  (covers the calendar-flood treatment and manual-capture id
  convergence).
- **S3 · session read-path union.** `SessionIndex` reads kernel
  agent-session records united with legacy drafts (kernel wins on id
  collision), starting the migration off `StoredSessionSummary`.
- **S4 · converters.** Idempotent V001 sessions → kernel and V003
  accepted memories → distilled records, with the §12 diagnostics card.
  S4 unblocks eventual §21 removals; it can trail S1-S3.

Richer session fidelity in the kernel (timeline events as source-scoped
evidence, live status) stays with the v4 세션 workspace track; S2/S3
deliberately carry only what the cross-lenses need (identity, agent,
times, title, project binding).

## 4. Classification summary

| Finding | Class |
| --- | --- |
| 검색 opens a palette over commands + legacy session titles | Fact |
| Kernel FTS built end-to-end, zero production callers | Fact / Gap |
| Palette/Sidebar comments claim records are searchable there | Conflict |
| Captured agent-sessions visible in 캘린더/프로젝트, invisible in 검색 | Fact |
| Auto-import (`35b0d7a`) feeds the legacy store only, no kernel records | Fact / Conflict with Adapt verdict |
| `agent-session` schema minimal (agentId/stepCount/tokenCount) | Fact (sufficient for S2, not for full UX) |
| No V001→kernel converter | Gap |
| No V003→distilled-record converter | Gap (blocks §21 removals) |
| Global search over contexts/entities/sources | Gap (target IA only) |
