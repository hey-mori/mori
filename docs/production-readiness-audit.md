# Production Readiness Audit · 2026-07-12

A dimension-by-dimension audit of what stands between the current repo
and a shippable, trustworthy desktop product. Verified against the
repository at `main` on 2026-07-12; every load-bearing claim was
checked directly in source. Companion docs:
[`references/competitive-landscape-2026-07.md`](references/competitive-landscape-2026-07.md)
(the market side of the same analysis) and
[`production-program.md`](production-program.md) (the roadmap that
consumes this audit).

Architecture note that shapes several findings: the app is
**localStorage-primary**. `src/lib/storage/localStorageAdapter.ts` is
the real store for session drafts, imports, analysis, and memory
bodies; desktop SQLite (`src-tauri/src/db/`) mirrors part of it.
Business logic lives in `src/lib/**` (243 colocated test files);
`src/features/**` are views (7 test files).

Verdicts: **missing** (does not exist), **partial** (exists with
material gaps), **solid** (production-adequate today).

---

## 1. Packaging and distribution · **missing** (hard blocker)

- `src-tauri/tauri.conf.json` sets `"bundle": { "active": false }`:
  `tauri build` produces **no installer at all** (.app / .dmg / .msi).
  Nothing ships today.
- No CI of any kind: no `.github/` directory exists in the repo.
- No updater (`tauri-plugin-updater` absent from `src-tauri/Cargo.toml`,
  no `plugins.updater` config) and no signing / notarization
  configuration anywhere.
- Icons are placeholders (`README.md` says so explicitly) and app
  metadata is empty: `license = ""`, `repository = ""` in
  `src-tauri/Cargo.toml`.
- `.gitignore:9` excludes `src-tauri/Cargo.lock`; an application (as
  opposed to a library) should commit its lockfile for reproducible
  builds.

## 2. Error handling and resilience · **partial**

- One React error boundary at the top
  (`src/components/layout/ErrorBoundary.tsx`, wired in
  `src/app/App.tsx`), keyed on the current view so route changes
  recover. But it is a single boundary: one broken view blanks the
  whole workspace region, and the handler only `console.error`s.
- **No global error capture**: zero hits for `window.onerror` /
  `unhandledrejection` handlers across `src`. Async failures outside
  render (poll loops, Tauri invoke rejections) vanish silently.
- Tauri command failures route through one wrapper
  (`src/lib/desktop/tauriCommands.ts`), but per-call handling is ad hoc
  across features.
- Corrupted localStorage is handled well (`read()` try/catches
  `JSON.parse` to `null`; loaders enforce `schemaVersion`). Corrupted
  SQLite migration state is a **hard error**
  (`src-tauri/src/db/migrations.rs`, checksum mismatch refuses to
  proceed) with no recovery UI and no pre-migration backup.

## 3. Performance and scale · **partial**

- **Lists are not virtualized.** `src/components/ui/VirtualList.tsx`
  and `src/lib/virtual/virtualWindow.ts` exist, are tested, and are
  imported by nothing (confirmed: the only reference to `VirtualList`
  outside tests is the component itself; both appear in knip's
  49 unused files). Sidebar / Home / memory session lists render with
  plain `.map`, unbounded at 500+ sessions.
- **No quota guard on load-bearing writes.**
  `localStorageAdapter.ts` `write()` calls
  `setItem(JSON.stringify(...))` with no try/catch. Session drafts,
  imports, analysis results, and memory bodies all flow through it; a
  `QuotaExceededError` (realistic with one large transcript in a
  5–10 MB webview store) throws unhandled mid-save. This is the
  single most likely data-loss path in the app.
- A known perf TODO: `addSessionImport` re-reads and re-stringifies
  the session's whole imports array on every add
  (`localStorageAdapter.ts`, marked in source).
- The live poller is bounded sensibly (`MAX_SESSIONS = 8`,
  `TAIL_BYTES = 2 MB`, 2 s active cadence with 9 s cap, hidden-tab
  pause, 15 s error backoff in
  `src/features/live-session/useLiveSessions.ts`).

## 4. Onboarding and first run · **missing**

- No first-run / welcome / guided-setup flow exists (searches for
  onboarding, first-run, welcome markers across `src/features` come
  back empty; per-surface `EmptyState`s exist but none guides).
- The product's critical first task, connecting an anchor agent (hook
  install, session discovery), lives inside 소스 / 설정 where a new
  user will not find it. A brand-new user lands on an empty Home with
  no path forward.

## 5. Data safety · **partial**

- Real user data lives in webview localStorage: clearable by the OS /
  user, quota-bound, and not the SQLite file a user would think to
  back up. SQLite is a mirror, not the source of truth.
- Backup is manual-only (`.mori` export). No automatic backup, no
  pre-migration backup, no recovery path when a migration fails.
- DB relocation is safe (drop connection → WAL checkpoint →
  copy-then-delete in `src-tauri/src/sqlite.rs`, tested).
- Migrations are forward-only with checksum integrity; good, but the
  failure mode is a dead end (see Section 2).

## 6. Security posture · **solid**, two gaps

- CSP is tight (`tauri.conf.json`): `default-src 'self'`,
  `script-src 'self'`, scoped `connect-src`.
- Filesystem access is genuinely well-guarded:
  `src-tauri/src/connectors/inbox.rs` canonicalizes both paths,
  rejects escapes from the inbox root, enforces an 8 MB cap and an
  extension allowlist, and has a path-traversal test.
  `src-tauri/src/files.rs` bounds move-search scans.
- Gaps: (1) no source-level `src-tauri/capabilities/` file, so the
  plugin permission surface is only pinned in generated build output;
  (2) `llm_http_request` proxies arbitrary local HTTP for the webview
  (intended for Ollama; worth an endpoint allowlist).

## 7. Korean-first copy · **solid**

- 119 of 126 feature `.tsx` files contain Hangul; a heuristic scan of
  `title` / `aria-label` / `placeholder` attributes finds no
  English-only user-facing strings. Remaining debt is minor and can be
  swept as spotted.

## 8. Dead weight · **partial**

- knip reports **49 unused files**, including the tested-but-unwired
  `VirtualList` / `virtualWindow` pair and swaths of
  `src/features/timeline-lab/*` / `src/features/timeline/*` barrels.
- **11 `tmp-ui-*.png` screenshots are tracked at the repo root**
  (audit scratch images, ~2 MB).
- Real TODO markers are few (the perf note above and one in
  `src-tauri`); most TODO hits are Korean test fixtures.

## 9. Test coverage · **partial** (strong logic, thin views)

- `src/lib`: 243 test files; Rust: ~24 files with `#[cfg(test)]` and
  broad meaningful coverage (migrations, inbox traversal, relocation,
  parsers).
- `src/features`: 7 test files; **20 feature directories carry zero
  colocated tests**, including home, memory, session, settings,
  sources, import, review-import, live-follow, reports, workspace.
- The live poller (`useLiveSessions.ts`: teardown, backoff,
  rediscovery) and `LiveSessionView` have no tests.

## 10. 라이브 세션 maturity · **partial** (newest surface)

- **Error detection is string-fragile**: the error dot and the
  completion notification derive from
  `item.text.startsWith("↳ 도구 오류")`
  (`LiveSessionView.tsx:401,423`); any copy change silently breaks
  error surfacing. Needs a structural flag on the feed item.
- Claude Code only: none of the other six anchor agents feed the live
  view despite having discovery backends.
- View state (pause, focus filter) is not persisted across
  reload / navigation; cadence and caps are hardcoded.

---

## Top production blockers, prioritized

1. No shippable build (`bundle.active: false`; no installer output).
2. No CI, signing, notarization, or updater: no path to a trusted,
   updatable app.
3. localStorage is the primary datastore with no quota guard: the
   likeliest data-loss path, and architecturally unsound for large
   transcripts.
4. No automatic or pre-migration backup; migration failure dead-ends
   the user.
5. No first-run onboarding to the connector setup the product depends
   on.
6. Session lists unvirtualized (component exists, unwired).
7. No global error capture or diagnostics export; field failures are
   invisible.
8. Placeholder icons, empty app metadata, ignored `Cargo.lock`.
9. Tauri plugin permissions not pinned in source
   (`src-tauri/capabilities/` absent).
10. Thin view-layer tests; the newest surface (라이브 세션) relies on
    string-prefix error detection.

Explicitly **not** blockers (solid today): Rust filesystem guards,
CSP, SQLite migration integrity and safe relocation, Korean copy
coverage, and the tested pure-helper layer under `src/lib`.

This audit is a snapshot. When a finding is fixed, update
[`production-program.md`](production-program.md) workstream status
rather than editing history here; re-audit wholesale only when the
program completes a gate.
