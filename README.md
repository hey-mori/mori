# Mori

Mori remembers how the work happened.

Mori is a local-first AI work memory app. It records selected AI work sessions and reconstructs them into a Narrative Timeline, Flow Focus / Trace View, Issue Garden, Decision Log, Sources / Evidence View, Resume Prompt, Reports, and eventually `.mori` local work memory files.

Mori is not a surveillance app, task manager, wiki, or autonomous work agent. It is a quiet work memory app that helps users understand and resume how their work happened.

## Current Foundation

This repository currently contains the frontend production foundation for Mori:

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
- Pure utility functions with Vitest coverage

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
- `.mori` save/open is not implemented yet.
- Local LLM analysis is not implemented yet.
- Import adapters are represented by frontend domain boundaries and mock data only.
- Report export actions are UI placeholders; Markdown generation logic is limited to the Resume Prompt utility.

## Next Milestones

1. Tauri desktop shell and command boundary
2. SQLite schema and session persistence
3. `.mori` package save/open
4. Import MVP for AI conversation text, Git diff, browser URLs, and manual notes
5. Local LLM Quick Pass analysis
6. Markdown report export
