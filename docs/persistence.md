# Persistence Boundary

Mori now has a first local persistence boundary for the web prototype.

Implemented now:

- `BrowserDraftRepository`
- `saveCurrentSessionDraft`
- `loadCurrentSessionDraft`
- `listStoredSessions`
- `saveMoriPackageDraft`
- `loadMoriPackageDraft`
- `clearStoredSession`

This repository uses browser `localStorage` and is deliberately named as a browser draft adapter. It is not the final persistence layer.

What is real:

- Start Session creates a typed `Project` and `Session`.
- Start Session saves the session draft through the repository layer.
- Reports can serialize the current Mori sample session into `.mori v0 JSON`.
- Reports save the package draft through the repository layer.
- Import normalizers can produce `SourceRef` and `TimelineEvent` candidates for manual notes, URLs, and AI conversation text.

What is temporary:

- Browser `localStorage` is only a development adapter.
- Session drafts do not yet persist events from live capture.
- `.mori` export is JSON, not zip-like.
- Tauri commands are typed stubs and throw clear not-implemented errors in the web prototype.

Expected replacement path:

1. Add Tauri v2 shell.
2. Implement Rust commands matching `src/lib/desktop/tauriCommands.ts`.
3. Add SQLite-backed session storage.
4. Add `.mori` package save/open in Rust.
5. Keep the frontend using repository/command boundaries rather than direct filesystem access.
