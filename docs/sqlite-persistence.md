# SQLite Persistence

Mori now ships a real Rust-native SQLite persistence path. This document
records the migration strategy, table layout, command surface, and what is
still on browser localStorage.

## Migration strategy

Mori runs SQLite migrations from Rust at app startup. Flyway is not used at
runtime to keep the desktop bundle free of Java/JDBC.

Key choices:

- Runtime runner: `rusqlite` + a small custom runner in
  [src-tauri/src/db/migrations.rs](../src-tauri/src/db/migrations.rs).
- Migration table: `_mori_migrations` (version, name, checksum, applied_at).
- Migration files: `src-tauri/migrations/V###__name.sql`, embedded in the
  binary at compile time via `include_str!`. That makes migrations available
  even if the resources folder is missing on disk.
- Checksum: SHA-256 over the whitespace-stripped SQL. The runner refuses to
  reapply or accept a previously applied migration whose checksum no longer
  matches.
- Concurrency: a single mutex-guarded `Connection` is held in Tauri state
  ([src-tauri/src/sqlite.rs](../src-tauri/src/sqlite.rs)).
- PRAGMAs: `foreign_keys = ON`, `journal_mode = WAL`, `synchronous = NORMAL`.

### Why not Flyway

Flyway can target SQLite over JDBC but requires Java at runtime. Mori is a
local-first Tauri desktop app. Bundling a JVM solely to run a migration
runner is unjustified weight. The current runner is small, embedded, and
testable from `cargo test`. Flyway-style file naming (`V001__initial_schema.sql`)
is preserved so developer tooling can still recognize the files.

## Database file location

Default path: `<home>/Mori/Records/mori.sqlite`.

- Windows: `%USERPROFILE%\Mori\Records\mori.sqlite`
- macOS/Linux: `$HOME/Mori/Records/mori.sqlite`

The directory is created on first open. The current Settings → SQLite panel
shows the resolved path when running in the desktop runtime.

## Migrations

| Version | Filename | Purpose |
| ------- | -------- | ------- |
| `001` | `V001__initial_schema.sql` | Full normalized session schema: projects, sessions, sources, events, issues, decisions, relationships, artifacts, next_actions, summaries, and the `events_fts` / `sources_fts` virtual tables. |
| `002` | `V002__events_connector_identity.sql` | Add `events.connector_event_id` (TEXT, nullable) and `idx_events_connector_event_id` so cross-session connector duplicate detection survives SQLite round-trips. NULL on every non-connector import. |
| `003` | `V003__consolidated_memories.sql` | Add `consolidated_memories` and `consolidated_memory_audit` tables for SQLite Accepted Memory Storage. Object / array fields are flattened to JSON `*_json` columns. No foreign key to `projects` / `sessions` — consolidated memory must survive session pruning. |

## Accepted memory runtime routing

`AcceptedMemoryRepository`
(`src/lib/project-memory/acceptedMemoryRepository.ts`) routes accepted
project memories and memory review actions between backends:

- **Browser mode** — `BrowserDraftRepository` (localStorage).
- **Tauri desktop mode** — the V003 tables via the
  `save_accepted_project_memories`, `list_accepted_project_memories`,
  `append_memory_review_action_rows`, and
  `list_memory_review_action_rows` commands.

If a SQLite call fails, the repository falls back to localStorage and
reports `fellBack: true` with the failure reason; the Consolidation
Review apply banner and the Memory cards show the storage source so the
UI never claims SQLite when it fell back. The Consolidation Review apply
path, the Project Memory page, and the Reports accepted-memory section
all read and write through this repository.

## Tables in this milestone

V001 brings up Mori's full normalized session schema:

- `projects`
- `sessions`
- `sources`
- `events`
- `issues`
- `decisions`
- `relationships`
- `artifacts`
- `next_actions`
- `summaries`
- `_mori_migrations`
- `events_fts` and `sources_fts` (FTS5 virtual tables, not yet populated)

JSON-heavy fields (source refs, linked IDs, rejected options, etc.) are
stored as JSON text columns. Foreign keys cascade on session and project
delete so cleanup is a single delete on the parent row.

Indexes:

- `sessions(project_id)`, `sessions(started_at)`
- `sources(session_id)`, `sources(kind)`
- `events(session_id)`, `events(project_id)`, `events(type)`, `events(start_at)`
- `issues(session_id)`, `issues(status)`
- `decisions(session_id)`, `decisions(created_at)`
- `relationships(from_id, from_type)`, `relationships(to_id, to_type)`
- `artifacts(session_id)`

## Tauri commands

All commands live in [src-tauri/src/sqlite.rs](../src-tauri/src/sqlite.rs) and
take `tauri::State<SqliteState>`.

- `get_sqlite_migration_status` — current path, applied/pending versions,
  table list, and migration records.
- `initialize_sqlite_database` — opens the DB file and applies any pending
  migrations. Idempotent.
- `persist_session_snapshot` — accepts a typed `SessionSnapshot` payload and
  upserts project + session, then replaces sources, events, issues,
  decisions, relationships, artifacts, next_actions, and summaries for that
  session inside a single transaction.
- `load_sqlite_session_snapshot` — returns the full `SessionSnapshot` for a
  given session id.
- `list_sqlite_sessions` — returns each session's project name, started_at,
  ended_at, status, and a `event_count` / `source_count` aggregate.

Errors are returned to the frontend as strings. The commands do not fake
success — `cargo test` exercises both the migration runner and the
save/load round-trip with an in-memory `rusqlite` database.

## Frontend boundary

- [src/lib/desktop/tauriCommands.ts](../src/lib/desktop/tauriCommands.ts)
  declares the typed map for the SQLite commands.
- [src/lib/sqlite/desktopSqliteRepository.ts](../src/lib/sqlite/desktopSqliteRepository.ts)
  is the only place that calls those commands. React components never invoke
  Tauri directly.
- [src/lib/sqlite/reconstruct.ts](../src/lib/sqlite/reconstruct.ts) turns a
  raw `SqlitePersistenceSnapshot` back into the rich `MoriMockSession` shape
  the rest of the app already consumes.
- [src/lib/storage/sessionPersistenceService.ts](../src/lib/storage/sessionPersistenceService.ts)
  is the runtime router. Components and stores call this service so that
  "use SQLite in Tauri, use localStorage in the browser" lives in exactly
  one place. The service holds a lazy `BrowserDraftRepository` so importing
  the module in Node (e.g. tests) doesn't touch `window.localStorage`.
- [src/app/sqliteStore.ts](../src/app/sqliteStore.ts) holds the SQLite UI
  state (available / status / sessions / lastPersist / error) and now
  routes every action through the persistence service, including marking
  the session source as `desktop-sqlite` after a successful save.
- [src/app/sessionStore.ts](../src/app/sessionStore.ts) gains an async
  `hydrate()` that prefers the SQLite snapshot in Tauri mode (and silently
  falls back to the browser draft if SQLite is empty for that session id),
  `loadDesktopSession(sessionId)`, and `markPersistedToDesktop()`. The
  derived `source` flag is `demo` / `browser-draft` / `desktop-sqlite` and
  is rendered as a badge by `SessionModeBanner`.
- In browser mode the bridge throws a clear "SQLite desktop persistence
  requires the Tauri app" error and the Settings panel renders an
  "unavailable" status with a help line. The existing
  `BrowserDraftRepository` continues to handle session drafts, imports, and
  analysis in localStorage.

## Running the desktop app

```bash
npm install            # once, to pull frontend deps
npm run tauri:dev      # build Rust, launch desktop window, hot-reload UI
```

On first launch:

1. Open **Settings → SQLite Desktop Persistence**.
2. Click **마이그레이션 적용** to create `~/Mori/Records/mori.sqlite` and
   apply V001. The path, applied migrations, and table count appear inline.
3. Start a session (Home → "Mori 세션 시작").
4. Import a note, URL, or AI conversation from **Sources / Evidence**.
5. Optionally run **Quick Pass** to generate issues, decisions, and a
   resume prompt.
6. Back in Settings, click **현재 세션 SQLite 저장**. The Session Mode
   banner flips to `Desktop SQLite`.
7. The saved-session list updates with event/source counts. Restart the
   app to confirm it loads from SQLite first; or click **Load** on any
   saved session to replace the active view.

## What still uses localStorage

In Tauri mode, the active session is *also* persisted to SQLite and SQLite
is the preferred read on next launch. Localstorage still holds:

- Active session draft (`mori.currentSessionDraft`)
- Per-session imports (`mori.sessionImports.*`)
- Quick Pass analysis result (`mori.sessionAnalysis.*`)
- Quick Pass provider settings (`mori.quickPassSettings`)
- Mori package drafts (`mori.packageDraft.*`)

This is intentional for this milestone: the browser-mode prototype keeps
working unchanged, the persistence service can fall back to localStorage if
SQLite is empty for a given session id, and the next milestones will move
these stores into SQLite one at a time.

A follow-up milestone will migrate these to SQLite when running inside the
desktop runtime, and adopt SQLite as the source of truth for Sources,
Timeline, and Reports.

## What still needs work

- The migration table currently records `applied_at` as `"epoch:<seconds>"`.
  Replace with ISO-8601 when a `chrono`/`time` dependency lands.
- FTS5 indexes are created but not populated.
- Auto write-through after Import / Quick Pass is not implemented yet — the
  user has to click **현재 세션 SQLite 저장** explicitly. This is the next
  milestone candidate.
- No deletion or merge commands yet.
- One live `tauri:dev` cycle this milestone confirmed the desktop window
  launches and renders. A full live click-through of
  Initialize → Save → Load → restart still needs to be captured as a smoke
  checklist.
