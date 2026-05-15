# SQLite Migration Strategy

Mori uses SQLite as the local database and SQLite FTS5 for local search.

## Decision

Use Rust-native app runtime migrations with Flyway-style file naming.

Current direction:

- Runtime runner: `rusqlite + custom migration runner`
- Migration table: `_mori_migrations`
- Migration file names: `V001__initial_schema.sql`, `V002__example.sql`
- Flyway: not used at app runtime

## Why Not Flyway Runtime

Flyway can support SQLite through JDBC, but it would add Java/JDBC tooling to a local-first Tauri desktop app. That is unnecessary runtime weight for Mori right now.

Flyway may be useful later for developer or CI-only migration validation, but the shipped desktop app should migrate itself using Rust.

## Why Custom Rust Runner First

Mori's current Rust shell is minimal and synchronous. A `rusqlite` runner is a good fit for early local persistence:

- simple SQLite access
- no Java/JDBC runtime
- easy app-start migration flow
- explicit `_mori_migrations` table
- readable SQL files

SQLx remains a reasonable future option if Mori adopts async database access broadly. For now, adding SQLx without a Rust toolchain available would be premature.

## Startup Flow

```text
App startup
  -> determine app data path
  -> open SQLite database
  -> enable PRAGMA foreign_keys = ON
  -> ensure _mori_migrations table
  -> read applied migration versions and checksums
  -> apply pending V###__name.sql files in order
  -> record version, name, checksum, applied_at
  -> continue app boot
```

## Current Files

```text
src-tauri/migrations/V001__initial_schema.sql
src-tauri/migrations/V002__events_connector_identity.sql
src-tauri/migrations/V003__consolidated_memories.sql
src-tauri/src/db/migrations.rs
src-tauri/src/db/accepted_memory.rs
src-tauri/src/sqlite.rs
src/lib/sqlite/schema.ts
src/lib/sqlite/records.ts
src/lib/sqlite/acceptedMemoryRows.ts
src/lib/sqlite/repositoryContracts.ts
src/lib/sqlite/snapshotValidation.ts
src/lib/sqlite/desktopSqliteRepository.ts
```

## Migration ledger

| Version | Name | Notes |
| ------- | ---- | ----- |
| `001` | `initial_schema` | Full normalized session schema + FTS5 virtual tables. |
| `002` | `events_connector_identity` | Add `events.connector_event_id` (TEXT, nullable) + index. Persists connector duplicate-detection identities across save/load so cross-session detection survives SQLite round-trips. |
| `003` | `consolidated_memories` | Add `consolidated_memories` and `consolidated_memory_audit` tables for SQLite Accepted Memory Storage. Object / array fields flattened to JSON `*_json` columns; no foreign key so consolidated memory survives session pruning. |

The TypeScript catalog mirrors the migration metadata so frontend/backend contracts and tests can validate ordering, file naming, and checksums before Rust SQLite is wired.

## Current Command Boundary

The Tauri shell now registers SQLite command names so the frontend has a stable desktop boundary:

- `get_sqlite_migration_status`
- `initialize_sqlite_database`
- `persist_session_snapshot`
- `load_sqlite_session_snapshot`
- `list_sqlite_sessions`
- `save_accepted_project_memories`
- `list_accepted_project_memories`
- `append_memory_review_action_rows`
- `list_memory_review_action_rows`

The `rusqlite` runner and repository are implemented: migrations apply
with checksum validation, session snapshots persist and load, and the
accepted-memory commands above read and write the
`consolidated_memories` / `consolidated_memory_audit` tables. The
frontend builds and validates payloads before sending them to this
boundary and converts accepted-memory records via
`src/lib/sqlite/acceptedMemoryRows.ts`.
