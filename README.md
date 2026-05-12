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
- Local LLM analysis is not implemented yet.
- Import normalization exists for manual notes, URLs, and AI conversation text, but no live import UI or desktop watcher exists yet.
- Browser localStorage is a temporary draft adapter and not final persistence.
- Native file picker integration is not implemented yet; desktop save uses Mori's default storage directory.

## Documentation

- [Product Spec](docs/product-spec.md)
- [UX Reference](docs/ux-reference.md)
- [Architecture](docs/architecture.md)
- [Domain Model](docs/domain-model.md)
- [Mori Package v0](docs/mori-package-v0.md)
- [Persistence](docs/persistence.md)
- [Desktop Shell](docs/desktop-shell.md)
- [SQLite Migrations](docs/sqlite-migrations.md)
- [Roadmap](docs/roadmap.md)
- [Development Notes](docs/development-notes.md)

## Next Milestones

1. Implement the `rusqlite` migration runner and SQLite row writes in Rust
2. Native file picker for `.mori v0 JSON` save/open
3. Import MVP for AI conversation text, Git diff, browser URLs, and manual notes
4. Local LLM Quick Pass analysis
5. Zip-like `.mori` package bundling
6. Markdown report export
