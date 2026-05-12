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
