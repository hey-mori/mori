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
- Reports can call the Tauri desktop command to save `.mori v0 JSON` when running inside the desktop app.
- Tauri can save/open/list `.mori.json` files in the Mori records directory.
- Import normalizers can produce `SourceRef` and `TimelineEvent` candidates for manual notes, URLs, and AI conversation text.

What is temporary:

- Browser `localStorage` is only a development adapter.
- Session drafts do not yet persist events from live capture.
- `.mori` export is JSON, not zip-like.
- Tauri commands work only in the desktop runtime. In browser mode they throw clear desktop-required errors.
- Native file picker path selection is still planned.

Expected replacement path:

1. Add SQLite-backed session storage.
2. Add native file picker support.
3. Replace browser drafts with desktop persistence where appropriate.
4. Add zip-like `.mori` package save/open in Rust.
5. Keep the frontend using repository/command boundaries rather than direct filesystem access.
