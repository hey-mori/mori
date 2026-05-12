# Desktop Shell

Mori now has a Tauri v2 desktop shell under `src-tauri/`.

## Run Web

```bash
npm run dev
```

## Run Desktop

Requires Rust and the platform-specific Tauri prerequisites.

```bash
npm run tauri:dev
```

## Build Desktop

```bash
npm run tauri:build
```

## Implemented Commands

Rust commands currently exposed:

- `get_app_info`
- `get_storage_location`
- `save_mori_package_json`
- `open_mori_package_json`
- `list_recent_mori_packages`

Frontend bridge:

- `src/lib/desktop/environment.ts`
- `src/lib/desktop/tauriCommands.ts`

In browser mode, desktop commands throw a clear error. In Tauri mode, they call `@tauri-apps/api/core` `invoke`.

## Storage Location

The first desktop slice saves `.mori v0 JSON` files to:

```text
~/Mori/Records
```

This is a simple safe default for the first desktop milestone. Native file picker support is planned.

## Current Native Persistence

Implemented now:

- Save serialized `.mori v0 JSON` to a local file.
- Open a JSON package from a provided path.
- List `.mori.json` files in the Mori records directory.
- Validate JSON syntactically before save/open.

Still planned:

- Zip-like `.mori` package bundling.
- SQLite persistence.
- Native file picker.
- Import adapters for AI conversation files, Git diff, browser sources, and manual notes.
- Local LLM Quick Pass analysis.

## Validation Note

This repository can run TypeScript tests/build without Rust. Rust validation requires `cargo`. In the current execution environment, `cargo` was unavailable, so `cargo check` could not run.
