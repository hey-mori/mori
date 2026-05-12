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

## Tech Stack

- Frontend: React, TypeScript, Vite
- Styling: Tailwind CSS pipeline plus local Formal Theme CSS tokens
- State: Zustand
- Icons: lucide-react
- Tests: Vitest

Planned stack:

- Desktop: Tauri v2
- Backend: Rust + Tokio
- Local DB: SQLite with FTS5
- Local LLM: Ollama, LM Studio, OpenAI-compatible endpoints
- Package format: `.mori` zip-like package
- Export: Markdown first, PDF/HTML later

## Run

```bash
npm install
npm run dev
```

## Validate

```bash
npm run typecheck
npm test
npm run build
```

## Current Limitations

- Tauri is not scaffolded yet.
- SQLite persistence is not implemented yet.
- `.mori` v0 JSON export is implemented; real zip-like save/open is not implemented yet.
- Local LLM analysis is not implemented yet.
- Import normalization exists for manual notes, URLs, and AI conversation text, but no live import UI or desktop watcher exists yet.
- Browser localStorage is a temporary draft adapter and not final persistence.

## Documentation

- [Product Spec](docs/product-spec.md)
- [UX Reference](docs/ux-reference.md)
- [Architecture](docs/architecture.md)
- [Domain Model](docs/domain-model.md)
- [Mori Package v0](docs/mori-package-v0.md)
- [Persistence](docs/persistence.md)
- [Roadmap](docs/roadmap.md)
- [Development Notes](docs/development-notes.md)

## Next Milestones

1. Tauri desktop shell and command boundary
2. SQLite schema and session persistence
3. `.mori` package save/open
4. Import MVP for AI conversation text, Git diff, browser URLs, and manual notes
5. Local LLM Quick Pass analysis
6. Markdown report export
