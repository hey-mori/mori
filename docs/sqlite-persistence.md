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
- [src/app/sqliteStore.ts](../src/app/sqliteStore.ts) holds the SQLite UI
  state (available / status / sessions / lastPersist / error) so views can
  read it without touching Tauri directly.
- In browser mode the bridge throws a clear "SQLite desktop persistence
  requires the Tauri app" error and the Settings panel renders an
  "unavailable" status with a help line. The existing
  `BrowserDraftRepository` continues to handle session drafts, imports, and
  analysis in localStorage.

## What still uses localStorage

- Active session draft (`mori.currentSessionDraft`)
- Per-session imports (`mori.sessionImports.*`)
- Quick Pass analysis result (`mori.sessionAnalysis.*`)
- Quick Pass provider settings (`mori.quickPassSettings`)
- Mori package drafts (`mori.packageDraft.*`)

A follow-up milestone will migrate these to SQLite when running inside the
desktop runtime, and adopt SQLite as the source of truth for Sources,
Timeline, and Reports.

## What still needs work

- The migration table currently records `applied_at` as `"epoch:<seconds>"`.
  Replace with ISO-8601 when a `chrono`/`time` dependency lands.
- FTS5 indexes are created but not populated.
- No end-to-end `tauri:dev` exercise yet; the validated path is `cargo test`
  + the browser-mode "unavailable" UI rendering.
- No deletion or merge commands yet.
