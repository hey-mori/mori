# Mori

Mori remembers how the work happened.

Mori is a local-first AI work memory app. It records selected AI work sessions and reconstructs them into a Narrative Timeline, Flow Focus / Trace View, Issue Garden, Decision Log, Sources / Evidence View, Resume Prompt, Reports, and eventually `.mori` local work memory files.

Mori is not a surveillance app, task manager, wiki, or autonomous work agent. It is a quiet work memory app that helps users understand and resume how their work happened.

## Current Foundation

This repository currently contains the frontend foundation for Mori:

- React + TypeScript + Vite app
- Tailwind-ready styling pipeline with Formal Theme CSS tokens
- Zustand app state for selected view, selected timeline event, hover focus, filters, and search
- Typed Mori domain model for projects, sessions, events, issues, decisions, relationships, sources, artifacts, summaries, and next actions
- Realistic Mori planning mock session
- Data-driven Narrative Timeline with timestamp-based horizontal positioning
- Flow Focus relationship highlighting and Trace panel
- Event Inspector with trust, confidence, evidence, related items, note, and correction placeholders
- Issue Garden and Decision Log
- Sources / Evidence View
- Resume Prompt and Report Export UI
- Start Mori / Session Setup
- Settings / Privacy / Local AI
- Pure utility functions prepared for Vitest coverage
- `.mori` package v0 JSON serialization/deserialization
- Browser draft repository for temporary local session/package persistence
- Import normalizers for manual notes, URLs, and AI conversation text
- Import MVP: in-app import panel that persists imports per session and renders them in Sources and Timeline
- Session view composition that switches between the demo mock session and a real persisted draft session
- Local Quick Pass analysis: deterministic heuristic provider that extracts issues, decisions, relationships, and next actions from imported sources; results persist per session and render in Issues, Decisions, and Reports
- Ollama Quick Pass provider with configurable endpoint/model, settings UI, connection probe, and Quick Pass control provider selector (still experimental for output quality)
- Optional deterministic fallback when an Ollama Quick Pass run fails, honestly labeled in the analysis result
- Placeholder Tauri icon assets so `cargo check` can run against the Rust shell
- Rust-native SQLite persistence: `rusqlite`-backed migration runner with checksum validation, real save/load of projects, sessions, sources, events, issues, decisions, relationships, artifacts, next actions, and summaries, Tauri command surface, and a Settings status panel
- Runtime-aware persistence service that routes between browser localStorage and the Tauri SQLite bridge, prefers SQLite as the source of truth in desktop mode, and exposes Load actions for saved SQLite sessions; a "Browser Draft" vs "Desktop SQLite" badge in the SessionModeBanner makes the active source explicit
- Tauri v2 desktop shell foundation with native `.mori v0 JSON` save/open commands
- SQLite migration catalog, normalized row snapshot mapping, validation, and desktop command boundaries

## Tech Stack

- Frontend: React, TypeScript, Vite
- Styling: Tailwind CSS pipeline plus local Formal Theme CSS tokens
- State: Zustand
- Icons: lucide-react
- Tests: Vitest

Planned stack:

- Desktop: Tauri v2 foundation added under `src-tauri/`
- Backend: Rust command shell now exists; Tokio is planned when async jobs are needed
- Local DB: SQLite with FTS5
- Local LLM: Ollama, LM Studio, OpenAI-compatible endpoints
- Package format: `.mori` zip-like package
- Export: Markdown first, PDF/HTML later

## Run

```bash
npm install
npm run dev
```

## Run Desktop

Requires Rust and platform-specific Tauri prerequisites.

```bash
npm run tauri:dev
```

## Validate

```bash
npm run typecheck
npm test
npm run build
```

## Current Limitations

- SQLite schema, snapshot mapping, and Tauri command boundaries exist; the `rusqlite` runtime runner and real row writes are not implemented yet.
- Tauri is scaffolded, but this environment could not run Rust checks because `cargo` is unavailable.
- `.mori` v0 JSON export and desktop save/open commands are implemented; real zip-like packaging is not implemented yet.
- Quick Pass defaults to a deterministic local heuristic. The Ollama provider is configurable from Settings (endpoint, model, timeout, fallback), reachable via the connection probe, and selectable from the Quick Pass control, but Ollama output quality has not been validated by Mori tests.
- SQLite persistence is the desktop source of truth for the active session (sessionStore prefers SQLite during hydrate in Tauri mode), but Quick Pass settings, package drafts, and import drafts still use localStorage until follow-up milestones migrate them. The desktop SQLite path runs end-to-end at the Rust repository level (`cargo test`) and through fake command bridges in TS tests; one live `tauri:dev` cycle confirmed the desktop window launches and renders, but the full click-through (Initialize → Save → Load) was not completed in the live window this milestone.
- The Tauri icon assets in `src-tauri/icons` are placeholders generated by `scripts/generate-placeholder-icons.cjs`; replace them with real branding before bundling for distribution.
- Import MVP covers manual notes, URLs, and AI conversation text via the in-app panel; git diff import, file watcher, and browser extension capture are not implemented yet.
- Browser localStorage is a temporary draft adapter and not final persistence.
- Native file picker integration is not implemented yet; desktop save uses Mori's default storage directory.

## Documentation

- [Product Spec](docs/product-spec.md)
- [UX Reference](docs/ux-reference.md)
- [Architecture](docs/architecture.md)
- [Domain Model](docs/domain-model.md)
- [Mori Package v0](docs/mori-package-v0.md)
- [Persistence](docs/persistence.md)
- [Quick Pass Analysis](docs/quick-pass-analysis.md)
- [SQLite Persistence](docs/sqlite-persistence.md)
- [Desktop Shell](docs/desktop-shell.md)
- [SQLite Migrations](docs/sqlite-migrations.md)
- [Roadmap](docs/roadmap.md)
- [Development Notes](docs/development-notes.md)

## Next Milestones

1. Complete the live `tauri:dev` click-through walkthrough (Initialize → Save → Load → restart) and capture it as a smoke checklist
2. Auto write-through to SQLite after every Import and Quick Pass run in desktop mode, with a clear opt-out
3. Migrate Quick Pass settings, analysis results, and package drafts off localStorage onto SQLite in desktop mode
4. Validate Ollama Quick Pass output quality with real models and tune prompts
5. Git diff import and native file picker for `.mori v0 JSON` save/open
6. Zip-like `.mori` package bundling
7. Markdown report export
8. Real Mori branding for Tauri icon assets
