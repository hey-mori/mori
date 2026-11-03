<div align="center">

<img src="public/mori-mark.svg" alt="" width="88" height="88">

# Mori

**A local-first personal context workspace.**

Mori turns the traces your work leaves behind into a connected record of what
you did, learned and decided, on your own machine.

[What works today](#what-works-today) ·
[Platforms](#platforms) ·
[Build from source](#build-from-source) ·
[Documentation](#documentation)

![status: pre-release](https://img.shields.io/badge/status-pre--release-6246f5)
[![license: MPL-2.0](https://img.shields.io/badge/license-MPL--2.0-1c1e22)](LICENSE)

</div>

Work leaves traces everywhere: AI agent sessions, Git history, notes, pasted
conversations, links. Days later none of them answers *what did I actually do
that week*, *how did this project unfold*, or *what was decided and why*.

Mori collects those traces with as little ceremony as possible and keeps the
original of each one. It structures them into records anchored to the time they
happened and the projects they belong to, and keeps every automated change
visible and reversible.

Mori is not a cloud service, a surveillance tool, or an autonomous agent. It
reads only the sources you connect, keeps its data on your device, and sends
nothing off the machine unless you grant it per provider.

> **Status.** Mori is in early development and has no release. The app works as
> a desktop prototype, and its direction moved in 2026-07 from an AI-session
> archive to a general record workspace. Parts of the interface still follow the
> earlier session-centric design while the record kernel replaces it. The
> [architecture document](docs/design/mori-context-workspace-architecture.md)
> describes the target; [the project goal](docs/mori-project-goal.md) separates
> what is implemented from what is planned.

## What works today

- **기록 (records).** A ledger of records with a timeline, a calendar and
  project grouping. Each record keeps a link to the source it came from.
- **Agent sessions.** Read-only discovery of local sessions from seven coding
  agents: Claude Code, Codex, OpenCode, Antigravity, Continue, Cline and
  Cursor. Active Claude Code sessions can be followed live; the other agents
  have discovery but no live view yet.
- **Imports.** Pasted AI transcripts, Git diffs from a repository you add
  explicitly, notes, URLs (stored, never fetched), and connector JSONL.
- **Analysis.** A deterministic rule-based engine by default. Ollama or any
  OpenAI-compatible endpoint can be added; a cloud provider is refused until
  you grant it.
- **Export.** A `.mori` package (zip) that round-trips your data, with a
  client-safe filter for handing work to someone else.

The full, maintained inventory, including partial features, is in
[docs/mori-project-goal.md](docs/mori-project-goal.md) §4 and §5.

## Platforms

| Platform | State |
| --- | --- |
| Windows | Development and packaging target. `tauri build` produces an NSIS installer. It is **unsigned and not published**. |
| macOS | The Rust side compiles and its tests pass in CI. No package is built or verified. |
| Linux | Compiles and passes the test suites on a development host with the WebKitGTK packages. Not a target. |

The browser extension that feeds Mori page context lives in
[mori-browser-extension](https://github.com/hey-mori/mori-browser-extension).
Its native messaging host ships with the Windows installer.

## Privacy

These hold for every feature, current and planned:

- **Local-first.** No cloud sync by default, no account, no remote authority
  over your data.
- **No hidden capture.** No screen recording, keylogging, camera, or reading
  any source you did not connect.
- **Origins stay visible.** Every derived record keeps its source, and the
  original is kept so it can be derived again.

## Build from source

Prerequisites: Node.js 22, a stable Rust toolchain, and the
[Tauri v2 prerequisites](https://v2.tauri.app/start/prerequisites/) for your
platform.

```bash
npm ci
npm run dev          # the web UI in a browser, with the browser store
npm run tauri:dev    # the desktop app
npm run tauri:build  # the desktop bundle (an NSIS installer on Windows)
```

## Verify a change

```bash
scripts/setup-git-hooks.sh   # once per clone: commit message and push guards
scripts/check.sh             # the gate for the changed scope
scripts/check.sh --full      # everything, before opening a pull request
```

`scripts/check.sh` is the one definition of "verified", locally and in CI. Run
tests only through it or `npm test`; see
[docs/test-run-safety.md](docs/test-run-safety.md) for why, and
[docs/git-workflow.md](docs/git-workflow.md) for the branch, pull request and
merge rules.

## Tech stack

- **App:** React, TypeScript, Vite, Zustand
- **Desktop:** Tauri v2, Rust, SQLite through `rusqlite`
- **Styling:** layered CSS, see [docs/frontend-architecture.md](docs/frontend-architecture.md)
- **Tests:** Vitest and `cargo test`

## Known limitations

- The browser store is still the primary store; desktop SQLite mirrors it.
- The installer is unsigned, so Windows SmartScreen warns, and there is no
  updater.
- The quality of LLM-backed analysis is not measured by the test suite. The
  rule-based engine is the floor that always works.
- There is no first-run onboarding yet.

## Documentation

- [Project goal](docs/mori-project-goal.md): identity, what is implemented,
  what is not
- [Context workspace architecture](docs/design/mori-context-workspace-architecture.md):
  the target design and decision order
- [Memory architecture](docs/memory-architecture.md): the implemented pipeline
- [Persistence](docs/persistence.md) and [SQLite migrations](docs/sqlite-migrations.md)
- [Imports](docs/imports.md) and the [`.mori` package](docs/mori-package-v0.md)
- [Desktop shell](docs/desktop-shell.md)
- [Git workflow](docs/git-workflow.md) and [commit format](docs/commit-format.md)

## Contributing and security

Read [CLAUDE.md](CLAUDE.md) and [docs/git-workflow.md](docs/git-workflow.md)
before changing code; they are the working rules for people and agents alike.
Report vulnerabilities privately with this repository's
[report form](https://github.com/hey-mori/mori/security/advisories/new), never in
an issue. The organization's
[security policy](https://github.com/hey-mori/.github/blob/main/SECURITY.md)
covers what to include and what happens next.

## License

The source code in this repository is licensed under the [Mozilla Public License 2.0](LICENSE)
(`MPL-2.0`). Copyright 2026 Isaac Lee.

- Third-party dependencies keep their own licences.
- The licence grants no rights to the Mori names or logos as trademarks.
- Contributions are accepted under the same licence.

Claude Code, Codex, Cursor and the other tools named here are trademarks of
their owners. Mori is not affiliated with or endorsed by them.
