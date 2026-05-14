# Roadmap

This roadmap is a practical development sequence. Each phase should produce something usable without pretending later capabilities already exist.

The intended product surface, screen by screen, is catalogued in the
[Product Screen Reference](product-screen-reference.md) — every reference image
is tagged Implemented / Partial / Planned / Reference only so the roadmap below
can map cleanly to a specific screen without overclaiming. Original design
prompts are preserved in [Product Screen Prompts](product-screen-prompts.md).

The engineering boundaries that back this roadmap are documented in
[Modular Architecture](modular-architecture.md). All Planned items below are
also rows in the feature-status registry at
`src/app/featureStatus.ts`, so the codebase keeps an honest single source of
truth for which capabilities exist.

## Phase 0: UI Prototype

Goal: establish the product experience and visual model.

Key tasks:

- Build Start Mori / Session Setup prototype
- Build Narrative Timeline prototype
- Build Flow Focus / Trace View prototype
- Build Issue Garden and Decision Log prototype
- Build Sources / Evidence prototype
- Build Resume / Report prototype
- Define domain types and realistic mock data

Expected output:

- A believable frontend prototype that communicates the product shape
- Initial typed domain model
- UX reference screenshots

Not included yet:

- Desktop shell
- Real capture/import
- SQLite persistence
- Local LLM analysis
- `.mori` package IO

## Phase 1: Desktop Shell

Goal: turn the prototype into a local desktop application boundary.

Key tasks:

- Scaffold Tauri v2
- Connect React/Vite frontend to Tauri
- Define typed command contracts
- Add project/session command stubs
- Add local app settings surface

Expected output:

- Mori launches as a desktop app
- Frontend talks to Rust through narrow command boundaries

Not included yet:

- Full import pipeline
- Local LLM analysis
- Browser extension
- PDF/HTML export

## Phase 2: Import MVP

Goal: allow users to bring selected work evidence into Mori without broad monitoring.

Key tasks:

- AI conversation text/transcript import
- Manual note import
- Git diff import
- Browser URL/manual source add
- File/project folder source references
- Source retention and redaction metadata

Expected output:

- A user can create a session from explicit imported sources
- Imported sources become normalized Mori records

Not included yet:

- Always-on recording
- Automatic browser history scraping
- Full terminal capture
- Browser extension

## Phase 3: Local LLM Integration

Goal: generate useful summaries and structured records from local sources.

Key tasks:

- Add Ollama provider first
- Add LM Studio provider
- Add OpenAI-compatible local endpoint provider
- Define prompt templates
- Add analysis job queue
- Store generated events, issues, decisions, relationships, summaries

Expected output:

- Mori can run a local analysis pass over imported sources
- AI outputs are inspectable, editable, and marked with trust/confidence

Not included yet:

- Cloud API default behavior
- Fully autonomous editing
- Unbounded background analysis

## Phase 4: Timeline + Flow Focus

Goal: make the reconstructed work session navigable and correctable.

Key tasks:

- Productionize lane-based timeline rendering
- Add event inspector editing
- Add relationship extraction and traversal
- Add Flow Focus hover/click states
- Add Trace panel with causes and results
- Add split/merge correction basics

Expected output:

- A user can understand how a session unfolded
- A user can inspect evidence and correct AI-generated structure

Not included yet:

- Large-scale timeline virtualization unless needed
- General graph explorer as the primary UI

## Phase 5: Browser Extension

Goal: let users explicitly add browser context to a Mori session.

Key tasks:

- Add current tab to Mori
- Add selected text to Mori
- Add selected tabs to Mori
- Bridge extension data into desktop app
- Preserve source URL, title, timestamp, and user action metadata

Expected output:

- Browser context can be intentionally captured without broad history scraping

Not included yet:

- Silent browser monitoring
- Reading every page automatically

## Phase 6: Vibe Coding Mode

Goal: make Mori especially useful for AI-assisted coding sessions.

Key tasks:

- Claude Code transcript import
- Codex transcript import
- Cursor/source activity import strategy
- Git diff and changed file correlation
- Code-related issue extraction
- Standup report generation

Expected output:

- A developer can reconstruct an AI coding session into timeline, decisions, issues, files, and resume prompt

Not included yet:

- Acting as an autonomous coding agent
- Automatically changing source files

## Phase 7: Freelancer Mode

Goal: turn selected sessions into client-safe work reports.

Key tasks:

- Client report template
- Scope change detection
- Billing work log
- Customer email draft
- Privacy-safe report filters
- Optional `.mori` package attachment rules

Expected output:

- A freelancer can share clear work progress without exposing private raw session details

Not included yet:

- Invoicing system
- Client portal
- Team permission model
