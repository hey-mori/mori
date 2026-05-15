# Persistence Boundary

Mori now has a first local persistence boundary for the web prototype.

Implemented now:

- `BrowserDraftRepository`
- `saveCurrentSessionDraft`
- `loadCurrentSessionDraft`
- `clearCurrentSessionDraft`
- `listStoredSessions`
- `saveMoriPackageDraft`
- `loadMoriPackageDraft`
- `clearStoredSession`
- `addSessionImport`
- `listSessionImports`
- `removeSessionImport`
- `clearSessionImports`
- `saveSessionAnalysis`
- `loadSessionAnalysis`
- `clearSessionAnalysis`
- `saveQuickPassSettings`
- `loadQuickPassSettings`

This repository uses browser `localStorage` and is deliberately named as a browser draft adapter. It is not the final persistence layer.

What is real:

- Start Session creates a typed `Project` and `Session`.
- Start Session saves the session draft through the repository layer.
- Reports can serialize the current Mori sample session into `.mori v0 JSON`.
- Reports save the package draft through the repository layer.
- Reports can call the Tauri desktop command to save `.mori v0 JSON` when running inside the desktop app.
- Tauri can save/open/list `.mori.json` files in the Mori records directory.
- Import normalizers can produce `SourceRef` and `TimelineEvent` candidates for manual notes, URLs, and AI conversation text.
- The in-app import panel persists normalized imports per session through `BrowserDraftRepository` and surfaces them in Sources and Timeline.
- `composeSessionView` derives a `MoriMockSession`-shaped view from a draft plus its imports, so feature views can swap between the demo mock and a real persisted session without duplicating UI.
- Quick Pass analysis results are persisted per session through `BrowserDraftRepository.saveSessionAnalysis` and hydrated by the session store on boot. The composed session view merges analysis output (issues, decisions, relationships, next actions, summary) when present.
- Quick Pass provider settings (`provider`, `ollamaEndpoint`, `ollamaModel`, `ollamaTimeoutMs`, `fallbackToDeterministic`) are persisted globally through `saveQuickPassSettings`. Settings are sanitized on save and on load, so corrupt or partial values fall back to the defaults instead of breaking the analyzer.
- Rust-native SQLite persistence is now real for project, session, sources, events, issues, decisions, relationships, artifacts, next actions, and summaries. See [SQLite Persistence](sqlite-persistence.md) for the migration strategy, command surface, and what still lives in localStorage.
- Saved-repository settings (Git diff capture targets) are persisted globally through `saveRepositorySettings` / `loadRepositorySettings` on `BrowserDraftRepository`. Mori only stores paths the user adds via Settings → Repositories or the Git Diff tab's Browse/native picker — see [Imports](imports.md) for the full consent model.
- Per-repository verification metadata (`status`, `gitRoot`, `currentBranch`, `headCommit`, `shortHeadCommit`, `isDirty`, `verifiedAt`, `error`) is captured by the explicit `verify_repository_path` Tauri command and persisted alongside the repository entry via `setRepositoryVerification`. Verification only runs when the user clicks Verify or explicitly runs Git diff capture against a saved repo — never on app start, hydrate, focus, or navigation. `setRepositoryVerification(settings, id, null)` is the supported "forget what we learned" path.
- Verification freshness is a pure derivation in [src/lib/repositories/verificationFreshness.ts](../src/lib/repositories/verificationFreshness.ts) (24-hour stale threshold, age labels, tones). It only describes stored metadata in Settings and the Git Diff dropdown — it never triggers work. See [Imports](imports.md) for the capture-triggered refresh flow.
- `SessionPersistenceService` (`src/lib/storage/sessionPersistenceService.ts`) is the single place where runtime decisions live. In browser mode all session, import, and analysis reads/writes go through `BrowserDraftRepository`. In Tauri mode the service prefers the SQLite snapshot when hydrating the active session, exposes Load actions through `useMoriSessionStore.loadDesktopSession(sessionId)`, and lets the Settings panel route initialize/save/list/load through the Tauri SQLite command bridge.
- **Connector event identities persist across the local persistence boundary.** TimelineEvents imported through the connector JSONL pipeline carry a `connectorEventId` (`<connectorId>::<externalSessionId|unscoped>::<eventId>`). Browser localStorage preserves the field as part of `mori.sessionImports.*`. Desktop SQLite added `events.connector_event_id` in migration V002 so the identity survives save / load. Old sessions imported before this milestone never carry the field — Mori treats them as "identity-unavailable" rather than as duplicates, so they keep loading cleanly. The cross-session duplicate index is `BrowserDraftRepository.listConnectorEventIdentitySnapshots` plus the `loadConnectorImportHistorySavedSessions` selector on the session store; it returns a lightweight `{ sessionId, title, savedAt, connectorEventIds }` shape rather than full payloads, so reading the history is cheap even with many saved sessions.
- **Optional source-level import summary on each session import.** `StoredSessionImport.importSummary?: ConnectorSourceImportSummary` is written when the Import Review apply path passes through a connector JSONL preview. The payload is small (counts + matched-session references, no raw JSONL, no extra event data). Old records without the field load normally — every consumer treats it as `undefined`. This is the data the Evidence Hub `ImportedSourceRow` and `SourceDetailPanel` use to render a re-import status badge after Apply.
- Mori can map a session into normalized SQLite row snapshots.
- SQLite snapshots are validated for required rows, foreign-key shape, and JSON-array columns before desktop persistence.
- A desktop SQLite repository boundary can call Tauri commands for initialization, snapshot persistence, session loading, and session listing.

What is temporary:

- Browser `localStorage` is only a development adapter.
- Session drafts do not yet persist events from live capture.
- `.mori` export is JSON, not zip-like.
- Tauri commands work only in the desktop runtime. In browser mode they throw clear desktop-required errors.
- Native file picker path selection is still planned.
- SQLite Tauri commands are registered, but database initialization and row writes still return explicit not-implemented errors until `rusqlite` is added.

Cross-session connector duplicate detection scope:

- Detection runs entirely on the local machine. It walks the saved
  sessions Mori has persisted (localStorage drafts, plus SQLite-loaded
  sessions when running in Tauri mode) and indexes their
  `connectorEventId` values.
- Detection covers three classes: **current-session duplicates**,
  **saved-session duplicates**, and **repeats inside the incoming
  batch**. The Connector JSONL preview renders each class as its own
  badge so the split is honest.
- Detection never makes a network call, never watches a folder, never
  scans the filesystem outside the explicit inbox path, and never opens
  saved sessions on its own — only the identity index is loaded, not
  the full saved-session payload.
- Detection is forward-only. Sessions imported before this milestone
  cannot be deduplicated retroactively; their events are classified as
  `identity-unavailable` and never produce false positives.
- The source-level summary (`ConnectorSourceImportSummary`) downgrades
  a fresh-looking preview to `historyUnavailable` whenever saved-session
  history could not be loaded, so the UI never claims a clean "new"
  status without proof.

> Session Canvas (future). A planned visual session canvas could later
> visualise active session work areas using the same TimelineEvent,
> Source, Review, and connector import history data. It is intentionally
> deferred until the core import + persistence flow is stable. No UI is
> shipped today.

Project Memory scope (read-only, single-session aggregation):

- The Project Memory page reads through the existing
  `BrowserDraftRepository.listStoredSessions()`,
  `useMoriSqliteStore.sessions`, and `selectSessionView` boundaries. It
  does **not** introduce a new persistence layer.
- Stats (decisions / issues / sources / events / next-actions) come from
  the active session only. Saved browser-draft + SQLite sessions appear
  in the Recent Sessions list with their metadata (`title`, `savedAt`,
  `eventCount`, `sourceCount`) but their payloads are not loaded into
  the page.
- Saved `.mori` package listing today is limited to
  `loadMoriPackageDraft(sessionId)` for the active session.
- `BrowserDraftRepository.listMoriPackageDrafts()` enumerates every saved
  `.mori v0` package. Project Memory uses this to render the cross-package
  Saved Reports rollup alongside the per-session import history.
- Project Memory aggregates across saved sessions via the view-model
  in `src/lib/project-memory/projectMemoryViewModel.ts`. Saved-session
  bodies are loaded via `loadProjectMemorySessions` in
  `src/lib/project-memory/loadProjectMemorySessions.ts`:
    - **Desktop SQLite** sessions go through
      `SessionPersistenceService.loadSessionFromDesktop` (non-mutating,
      parallelized via `Promise.allSettled`).
    - **Browser localStorage** sessions go through
      `BrowserDraftRepository.listSessionImports` (events + sources) +
      `loadSessionMemoryBody` (durable issues / decisions /
      next-actions snapshot, schema-versioned) + `loadSessionAnalysis`
      (legacy fallback for sessions saved before memory bodies landed).
  The loader caps total saved-session reads at
  `DEFAULT_SAVED_SESSION_CAP = 20` and never throws past the caller —
  failed sessions surface as `loadStatus: "failed"` with a reason.
- `StoredSessionMemoryBody` is the durable browser record for issues /
  decisions / next-actions / optional summary snapshot. It is keyed at
  `mori.sessionMemory.<sessionId>`, carries `schemaVersion: 1`, and is
  cleared alongside the session draft when `clearStoredSession` or
  `clearCurrentSessionDraft` runs. Records with an unknown schema
  version load as `null` rather than corrupting the aggregator.

### Accepted Memory Persistence — Browser (landed)

Accepted Project Memory consolidation proposals land in browser
localStorage when the user clicks Apply on the Consolidation
Review Surface. The data model is fixed in
[`project-memory-consolidation.md`](project-memory-consolidation.md);
the storage plan below is what the current adapter implements.

- **Browser localStorage keys**:
  `mori.consolidatedMemory.<projectId>.<memoryId>` for
  `StoredAcceptedProjectMemory` rows and
  `mori.consolidatedMemoryAudit.<projectId>.<actionId>` for the
  append-only `StoredMemoryReviewAction` audit trail. Both records
  carry `schemaVersion: 1`; unknown schema versions load as `null`
  / are filtered out of list responses to protect callers.
- **Repository surface**: `MoriDraftRepository` gains
  `saveAcceptedProjectMemory` / `saveAcceptedProjectMemories` /
  `listAcceptedProjectMemories(projectId)` /
  `getAcceptedProjectMemory(memoryId)` /
  `appendMemoryReviewAction` / `listMemoryReviewActions(projectId)`.
  `BrowserDraftRepository` implements all six against the existing
  `KeyValueStorage` abstraction so test repositories can use
  `MemoryKeyValueStorage` directly.
- **Desktop SQLite** (still planned): a `consolidated_memories`
  table plus a `consolidated_memory_audit` table, written via a
  Rust migration. Loader pattern will mirror the existing session
  loader (read from SQLite when available, fall back to
  localStorage).
- **`.mori v0` export**: the `MoriPackageV0` package now carries an
  optional, additive `consolidatedMemories[]` slice (no
  `formatVersion` bump — each record keeps its own `schemaVersion`).
  The `auditTrail[]` slice is not carried yet. Importing a package
  with accepted memory re-enters those records as `proposed`
  (re-reviewed before they merge) — that review-on-import surface is
  still planned.
- **What never lands in `StoredAcceptedProjectMemory`**: raw
  connector JSONL, full transcripts beyond what the underlying
  `SourceRef` already retains, raw secret-shaped strings (screened
  at the proposal helper, screened again at apply), file paths
  beyond what's already on the underlying `SourceRef`, AI claims
  with no `evidenceRefs` entry.
- **Audit log retention**: append-only. Every action row is kept
  (small payload); a "Purge discarded actions" affordance is future
  work.
- **Memory Audit Trail UI**: the Project Memory page renders the
  `StoredMemoryReviewAction` log through the pure
  `buildMemoryAuditTrailViewModel` helper — sorted, date-grouped,
  action-type filtered. It reads the existing localStorage records
  only; no new storage backend. The surface never renders the
  `before` / `after` snapshots, so no raw evidence content leaves
  storage. Undo / revert, SQLite-backed audit storage, and the
  `.mori v0` `auditTrail` export remain planned.

No code change in this milestone — the keys, table names, and
field sets are documented here so the implementation can be done
against a stable contract.

Expected replacement path:

1. Add Rust-native SQLite migration runner using `rusqlite`.
2. Replace SQLite command stubs with real migration and row-write operations.
3. Add native file picker support.
4. Replace browser drafts with desktop persistence where appropriate.
5. Add zip-like `.mori` package save/open in Rust.
6. Keep the frontend using repository/command boundaries rather than direct filesystem access.

Migration strategy:

- Runtime migrations should be Rust-native.
- Migration files use Flyway-style names such as `V001__initial_schema.sql`.
- Flyway is not used in the app runtime because Java/JDBC is unnecessary for Mori's desktop bundle.
