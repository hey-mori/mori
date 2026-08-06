# Cross-session memory search (audit)

Status: **Shipped end to end (Slice 2a + 2b).** Audit-before-implementation
record for broadening Ask Mori / Memory Search from "accepted memory (all
sessions) + the active session's raw evidence" to "accepted memory + **every
saved session's** raw timeline / evidence", with each hit attributed to the
session it came from. Slice 2a (the pure search layer) and Slice 2b (the
`useMemoryService` / `MemoryView` binding) are both in place; the Home command
space, the standalone Ask Mori surface, and the Project Memory cards all search
across sessions.

Read [`mori-project-goal.md`](../mori-project-goal.md) (principles, non-goals),
[`memory-as-a-service.md`](memory-as-a-service.md) (the capability façade), and
[`ask-mori-audit.md`](ask-mori-audit.md) (the query layer) first.

## 1. The gap

Today the search/ask layer sees two scopes unevenly:

- **Accepted memory** is already cross-session (`searchAcceptedMemories` runs
  over the project's whole `StoredAcceptedProjectMemory[]`).
- **Raw references** (timeline events, evidence sources) come only from the
  **active session** (`searchProjectMemoryReferences` is fed
  `view.events` / `view.sources`). So "이 프로젝트에서 X 했나?" can miss work
  that lives in a saved-but-not-active session, even though Mori has already
  loaded those bodies for the Project Memory rollup.

The data already exists: `loadProjectMemorySessions`
([`loadProjectMemorySessions.ts`](../../src/lib/project-memory/loadProjectMemorySessions.ts))
returns `ProjectMemoryLoadedSession[]` · each carrying `sessionId`, `title`,
`loadStatus`, and the session's `events` / `sources` · capped at 20 sessions,
parallelised, non-mutating, browser + SQLite aware. This milestone routes that
same loaded set into the search layer.

## 2. Design (two slices)

### Slice 2a · pure search layer (no new IO)

- **`queryableMemory.ts`**
  - `QueryableMemoryReference` gains optional `sessionId?` / `sessionLabel?`
    so a hit can name the session it came from (active hits stay unlabelled).
  - New `ProjectMemorySessionEvidence` (`{ sessionId, sessionTitle, events?,
    sources? }`) and a new `sessions?` field on
    `SearchProjectMemoryReferencesInput`. When `sessions` is present each
    session's events / sources are searched **with attribution**; the existing
    top-level `timelineEvents` / `evidenceSources` keep working unchanged
    (active-session, unattributed). Results are deduped by `refId` so the same
    event never appears twice if a caller passes it through both paths.
  - The tool-envelope filter and curated-snippet rules are unchanged · raw
    transcripts / connector logs are never read or shown.
- **`ask-mori/askMoriContext.ts`** · when a reference carries a `sessionLabel`,
  the grounded prompt line and the citation's `contextLabel` name the session
  (e.g. `타임라인 · ng-gw 라우팅`) so the LLM and the cited row both show where
  the evidence lives.
- **`memory-api`** · `MemoryCapabilityInput` gains optional
  `sessionEvidence?: ProjectMemorySessionEvidence[]`. `memorySearch` /
  `memoryAsk` route it into the references input when present, else fall back
  to the active-session `events` / `sources` (backward compatible: a caller
  that sets neither behaves exactly as today).

Behaviour only changes for a caller that populates `sessionEvidence`; no
existing consumer does yet, so Slice 2a ships zero regression and is covered by
pure colocated tests.

### Slice 2b · binding (turns it on with real data)

- **`useMemoryService`** loads the project's saved-session bodies via
  `loadProjectMemorySessions` (the same call the warehouse already makes),
  maps each `loaded` / non-empty session to `ProjectMemorySessionEvidence`,
  and sets `sessionEvidence` on the façade input. The active session is one
  entry in that list (so it is searched once, attributed). Loading is async,
  capped at 20, and degrades to active-session-only while in flight or when no
  saved bodies are available.
- Both Ask Mori consumers (the Home command space and the Project Memory card)
  immediately search across sessions, with each cited row naming its session.

## 3. Principle compliance

- **Evidence is source of truth / read-only.** Reads only already-loaded,
  already-reviewed session bodies; no new capture, no watcher, no network.
- **No raw leakage.** Snippets stay from curated fields (event/source title +
  summary/detail); the tool-envelope filter still drops machine noise.
- **Honest scope.** Hits name their session; the 20-session cap is the same
  honest bound the Project Memory rollup already documents (a later slice can
  surface "N sessions searched" if the cap bites).
- **Local + deterministic retrieval.** No embeddings, no semantic model; the
  LLM only phrases the answer over deterministically retrieved, cited items.

## 4. Validation

- Slice 2a: `npx vitest run src/lib/project-memory src/lib/ask-mori
  src/lib/memory-api`; then `npm run check:full` + `npm run build`.
- Slice 2b: same, plus a browser-preview check that a question on Home surfaces
  a hit from a non-active session, attributed to it.
- No `src-tauri/` change (the desktop loader is reused through its existing
  injected port).

## 5. Non-goals (unchanged)

- Embeddings / vector store as the substrate.
- Removing the 20-session cap or loading every historical session unbounded.
- Cross-project search (this stays within the active project's sessions).
- Any background / always-on loading; `useMemoryService` loads on mount of a
  consuming surface, exactly like the warehouse.
