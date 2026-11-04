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

## A look at it

<p align="center">
  <img src="docs/assets/screenshots/mori-session-review.png" alt="A session imported from a pasted transcript, with the issue, decision and next action the rule-based analysis found, each linked to its evidence" width="860">
</p>

| | |
| --- | --- |
| <img src="docs/assets/screenshots/mori-home.png" alt="Home in demo preview, with the search bar and quick actions" width="420"> | <img src="docs/assets/screenshots/mori-records.png" alt="The record ledger with three records written today" width="420"> |

Screenshots from the browser build (`npm run dev`) with the built-in demo data
and records and a session created from an invented sample transcript; see
[how they were made](docs/assets/screenshots/README.md#product-screenshots).

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
| Windows | Development and packaging target. The `package` workflow builds an NSIS installer on a hosted runner; installing it, uninstalling it and its browser native host registration were checked on Windows 11. It is **unsigned and not published**. |
| macOS | The Rust side compiles and its tests pass in CI. No package is built or verified. |
| Linux | Compiles and passes the test suites on a development host with the WebKitGTK packages. Not a target. |

The browser extension's native messaging host is built and bundled with Mori
on Windows; see [Related projects](#related-projects).

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
- First-run guidance is a single welcome dialog. Detecting and connecting an
  agent in one step works only in the desktop app.

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

## Related projects

| Repository | What it is | Relationship to Mori |
| --- | --- | --- |
| [mori-lens](https://github.com/hey-mori/mori-lens) | A reading assistant: rest the pointer on text in any app and see it explained in your language | A separate product with its own binary. No shared code, database or runtime dependency |
| [mori-browser-extension](https://github.com/hey-mori/mori-browser-extension) | An opt-in Chromium extension that reports the active page | Sends page activity to Mori through Native Messaging; does nothing without Mori |
| [mori-web](https://github.com/hey-mori/mori-web) | The product website | Not deployed yet |

## Contributing and security

Start with the organization's
[contributing guide](https://github.com/hey-mori/.github/blob/main/CONTRIBUTING.md),
which covers how a change lands and the sign-off (`git commit -s`) required on
commits from outside the organization. In this repository,
[docs/git-workflow.md](docs/git-workflow.md) and
[docs/commit-format.md](docs/commit-format.md) are the detailed rules, and
[CLAUDE.md](CLAUDE.md) adds what coding agents working here must follow.

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
