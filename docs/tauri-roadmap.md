# Tauri / Backend Roadmap

Mori should add Tauri v2 after the frontend/domain foundation is stable. The current repository intentionally does not scaffold Tauri yet because the first milestone focuses on product model, UI, and utility validation.

## Phase 1: Desktop Shell

1. Add Tauri v2 with the existing Vite app as the frontend.
2. Preserve the current `npm run dev`, `npm run build`, `npm run typecheck`, and `npm test` scripts.
3. Add desktop scripts only after Tauri runs locally.
4. Keep Tauri commands thin and typed against `src/domain/backend-contracts.ts`.

## Rust Crates

Initial crate layout:

```text
src-tauri/
  Cargo.toml
  src/
    main.rs
crates/
  mori-core/
  mori-db/
  mori-package/
  mori-llm/
  mori-capture/
```

Do not create every crate until there is real implementation pressure. Start with `src-tauri` and extract crates as boundaries become clear.

## Command Boundary

Frontend command contracts live in `src/domain/backend-contracts.ts`.

Initial commands:

- `projects.list`
- `projects.create`
- `sessions.create`
- `sessions.stop`
- `sessions.get`
- `sources.import`
- `timeline.list`
- `issues.list`
- `decisions.list`
- `reports.exportMarkdown`
- `package.save`
- `package.open`
- `llm.providers.list`
- `analysis.quickPass`

## SQLite Plan

Use SQLite for normalized state:

- projects
- sessions
- sources
- events
- issues
- decisions
- relationships
- artifacts
- next_actions
- summaries

Use FTS5 for search across event titles/summaries, issue descriptions, decision rationales, source titles/details, and summaries.

## `.mori` Package Plan

The `.mori` package should serialize normalized project/session memory plus selected source data:

```text
project.mori
  manifest.json
  projects.json
  sessions.json
  events.jsonl
  timeline.jsonl
  issues.json
  decisions.json
  relationships.json
  next_actions.json
  artifacts.json
  sources/
  summaries/
  privacy.json
  theme.json
```

## Local LLM Plan

Provider abstraction:

- Ollama
- LM Studio
- OpenAI-compatible endpoint
- Cloud API as explicit opt-in

Analysis should run in two stages:

- Quick Pass: timeline, summary, top issues, decisions, next actions
- Deep Pass: relationships, split/merge suggestions, resume prompt, reports

## Privacy Requirements

- Start Mori is explicit.
- Summary Mode is default.
- Sensitive apps are blocked by default.
- Raw source retention is configurable.
- Cloud API requires explicit opt-in.
- The product should never claim to understand everything the user does.
