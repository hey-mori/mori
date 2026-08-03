# Mori

Mori remembers how the work happened.

Mori is a local-first AI work memory app. It follows and imports AI
coding sessions (Claude Code, Codex, OpenCode, and other anchor
agents), reconstructs them into evidence-linked timelines, extracts
issues / decisions / next actions for review, accumulates durable
project memory through an explicit consolidation gate, and produces
resume prompts, reports, and real `.mori` package files so work can
continue across sessions, tools, and teammates.

Mori is not a surveillance app, task manager, wiki, or autonomous work
agent. It never captures in the background without explicit opt-in,
never makes memory durable without user review, and sends nothing off
the machine unless the user explicitly chooses and allows it: analysis
and language features default to local engines, and a cloud provider is
refused until it is granted per provider.

## App Structure

Primary navigation (Korean-first UI):

- **홈**: activity overview · contribution heatmap, streaks, recent
  sessions, companion signals
- **라이브**: live feed tailing every currently-active Claude Code
  session, request by request, while you work
- **연동**: source hub · anchor-agent connections (기록에서 불러오기,
  hook install, live connection status) and evidence imports
- **프로젝트**: project workspaces · cross-session synthesis, accepted
  project memory, session rail
- **대시보드 / 워크벤치**: combined work surfaces over the active
  session (timeline, evidence, review, analysis, reports)
- **설정**: privacy, storage, AI engines, repositories, background
  detection

A session opens into its own workspace: 개요, 활동 (swimlane
timeline), 재구성 (five reconstruction lenses), 분석 (Quick Pass
review), 공유 (resume prompt / reports / `.mori` export). 새 세션
starts from a single AI-agent conversation (the anchor) with other
evidence attached to it.

## Current State

The full product loop works end to end: capture / import → preview →
import review → timeline / evidence → project memory → consolidation
review → accepted memory (with an append-only audit trail and revert)
→ resume prompt / reports / `.mori` zip package.

Highlights (the verified, maintained inventory is
[docs/mori-project-goal.md](docs/mori-project-goal.md) §4):

- Seven anchor agents with read-only Rust discovery readers: Claude
  Code, Codex, OpenCode, Antigravity, Continue, Cline, Cursor
- 라이브 세션: delta-read tailing of active Claude Code sessions with
  request-anchored work feeds
- Import Review and Consolidation Review as non-bypassable gates;
  evidence-linked provenance on every derived item
- Quick Pass analysis with three providers (deterministic rule-based,
  Ollama, OpenAI-compatible) and honest fallback labeling
- Desktop SQLite (`rusqlite`, migrations V001–V007) mirroring the
  browser store; real `.mori` zip export / import with native dialogs;
  client-safe handoff filtering
- Opt-in background inbox watcher (off by default, desktop-only,
  review gate unchanged)
- Tauri bundling produces `Mori.app` / `.dmg` (unsigned until the
  signing workstream lands); CI validates web + Rust on every push

## Tech Stack

- Frontend: React, TypeScript, Vite, Zustand, lucide-react
- Styling: layered CSS (tokens → theme → components → feature sheets;
  see [docs/frontend-architecture.md](docs/frontend-architecture.md))
- Desktop: Tauri v2, Rust, `rusqlite` (bundled SQLite)
- Packaging: `fflate` for `.mori` zip
- Local LLM (optional): Ollama or any OpenAI-compatible endpoint
- Tests: Vitest (web), `cargo test` (Rust)

## Run

```bash
npm install
npm run dev          # browser dev server
npm run tauri:dev    # desktop app (requires Rust toolchain)
npm run tauri build  # desktop bundle: Mori.app + .dmg
```

## Architecture

For the layer-by-layer map of Mori's memory model (capture → evidence
→ review → timeline → project memory → query / output → storage),
see [docs/memory-architecture.md](docs/memory-architecture.md).

## Try the end-to-end flow

To see Mori's import → review → timeline → evidence → memory → resume
prompt loop with a realistic sample input, follow
[docs/e2e-smoke-flow.md](docs/e2e-smoke-flow.md) using the fixture at
[docs/fixtures/connector-sample-mori-session.jsonl](docs/fixtures/connector-sample-mori-session.jsonl).

The walkthrough is local-only — no cloud sync, no background watching,
no external accounts.

## Validate

```bash
npm run check:full     # typecheck + full test suite — run before every commit
npm run check:release  # adds `npm run build` — run before push / milestone handoff
```

Faster paths during iteration:

```bash
npm run check:quick    # typecheck + changed tests only
npm run test:changed   # git-aware test run
npm run test:watch     # interactive watch mode
```

If `src-tauri/` changes, also run `cargo check` and `cargo test` in
that directory. See
[docs/development-validation.md](docs/development-validation.md) for
the full workflow.

## Current Limitations

- Browser localStorage is still the primary store; desktop SQLite
  mirrors it. The promotion to SQLite-as-source-of-truth is the
  production program's W5 (design-gated). Quota failures on the
  browser store now surface as a typed error plus a notification
  instead of failing silently.
- The desktop bundle is unsigned and un-notarized; signing,
  notarization, and the updater land with program workstream W3.
- LLM-backed Quick Pass output quality has not been validated by Mori
  tests; the deterministic provider is the always-available floor.
- 라이브 tails Claude Code only; the other anchor agents have
  discovery readers but no live tail yet.
- There is no first-run onboarding; connecting an agent starts from
  연동. A guided first run is program workstream W8.
- The Tauri icon assets in `src-tauri/icons` are generated by
  `scripts/generate-icons.cjs`; regenerate them whenever the brand
  mark changes.

## Documentation

Start here:

- [Project Goal](docs/mori-project-goal.md) · canonical direction and
  the verified implemented-capability inventory
- [Production Program](docs/production-program.md) · the governing
  roadmap: readiness gates G1–G4, product-shell workstreams, open
  decisions
- [Production Readiness Audit](docs/production-readiness-audit.md) ·
  dimension-by-dimension audit (2026-07-12)
- [Autonomous Loop](docs/mori-autonomous-loop.md) · how the
  development loop runs

Reference docs:

- [Memory Architecture](docs/memory-architecture.md)
- [Persistence](docs/persistence.md) · [SQLite Persistence](docs/sqlite-persistence.md) · [SQLite Migrations](docs/sqlite-migrations.md)
- [Imports](docs/imports.md) · [Quick Pass Analysis](docs/quick-pass-analysis.md)
- [Mori Package v0](docs/mori-package-v0.md)
- [Desktop Shell](docs/desktop-shell.md)
- [Domain Model](docs/domain-model.md) · [Architecture](docs/architecture.md)
- [Roadmap](docs/roadmap.md) (historical phases; the production
  program supersedes it for sequencing)

## Roadmap

The governing roadmap is
[docs/production-program.md](docs/production-program.md): four
readiness gates (Installable → Trustworthy with real data →
Competitive at first glance → The moat is the headline) plus the
product-shell workstreams (web presence, distribution, licensing,
release management). Open product decisions (source posture, naming,
language strategy, launch shape) are tracked there as D1–D6.
