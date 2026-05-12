# Mori Architecture

## Product Boundary

Mori records selected work sessions from trusted sources and reconstructs them into work memory. It should not claim to understand everything the user does on their computer.

Trusted sources include:

- AI conversation imports
- Explicit browser additions
- Git diff and file changes inside selected project folders
- Terminal wrapper summaries
- Manual notes

## Frontend Structure

```text
src/
  app/
    App.tsx
    store.ts
  components/
    layout/
    ui/
  domain/
    types.ts
    constants.ts
    mock-data.ts
  features/
    start-session/
    timeline/
    issues/
    sources/
    reports/
    projects/
    settings/
  lib/
    timeline/
    relationships/
    formatting/
    privacy/
    report/
  styles/
    tokens.css
    globals.css
```

Domain types do not depend on React. Timeline layout, relationship traversal, trust display, and resume prompt generation are pure utilities so they can be tested and later reused by Tauri command results.

## Timeline Data Flow

```text
SourceRef
  -> normalized TimelineEvent
  -> Relationship mapping
  -> lane grouping
  -> timestamp-to-x layout
  -> Narrative Timeline cards
  -> Flow Focus focused entity set
  -> Event Inspector / Trace panel
```

The MVP renderer uses custom React and SVG. PixiJS can be considered later if event counts make DOM rendering too expensive.

## Flow Focus Model

Flow Focus is powered by `Relationship` records. Hovering or selecting an event computes a focused set through relationship traversal. Related cards stay fully visible and unrelated cards dim. Direct relationships become stronger in the SVG connector layer.

## Trust Model

- `verified`: git diff, file changed, imported transcript, user note, explicit browser add
- `observed`: active window, terminal command summary, file watcher, browser tab title
- `inferred`: AI-created event, issue, decision, or relationship

The UI must keep inferred records inspectable and correctable.

## Planned Tauri Boundary

Tauri should expose command boundaries for:

- Session CRUD
- Project CRUD
- Source import
- Git diff import
- SQLite-backed timeline queries
- `.mori` package save/open
- Local LLM provider configuration
- Analysis job queue
- Markdown report export

Do not bind React screens directly to filesystem or database details. Keep those behind typed command contracts.

## Planned SQLite Direction

SQLite should store normalized records:

- projects
- sessions
- events
- sources
- issues
- decisions
- relationships
- artifacts
- next_actions
- summaries

FTS5 should index event titles/summaries, source titles/details, issue descriptions, decision rationale, and summaries.

## `.mori` Package Direction

`.mori` should be a zip-like package:

```text
project.mori
  manifest.json
  projects.json
  sessions.json
  events.jsonl
  issues.json
  decisions.json
  relationships.json
  artifacts.json
  sources/
  summaries/
  privacy.json
  theme.json
```

The package should distinguish raw source data from normalized AI-derived summaries.
