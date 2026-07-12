# Mori Production Program

The roadmap for turning the current repo into a shippable, trustworthy,
competitive product. This is the entry point for "what does Mori need
to become a real product"; it sequences the work, names the open
product decisions, and defines done. It covers both the app itself
(gates G1–G4) and the **product shell** around it: web presence,
distribution channels, licensing, legal floor, language strategy,
release management, and the feedback loop, none of which live inside
the binary but all of which decide whether the binary becomes a
product.

Inputs, both dated 2026-07-12 and kept as companions:

- [`production-readiness-audit.md`](production-readiness-audit.md),
  the dimension-by-dimension code audit with file-level evidence.
- [`references/competitive-landscape-2026-07.md`](references/competitive-landscape-2026-07.md),
  the market synthesis (viewers, memory products, capture products,
  native-agent drift, threats).

This document is durable but living: workstream status must be updated
when reality changes, the same rule as
[`mori-project-goal.md`](mori-project-goal.md) §4. It does not replace
the goal document; product identity, principles, and non-goals live
there and bind every workstream here.

---

## 1. The thesis

**Mori's risk is not missing features. It is owning a
category-unique memory layer that nobody can install.**

The core loop (capture → review → timeline → project memory →
consolidation → accepted memory → resume / report) is complete and has
no counterpart in any surveyed product. Meanwhile:

- the app produces no installer (`bundle.active: false`),
- real user data sits in localStorage behind no quota guard,
- a new user gets no guided path to connecting an agent,
- the table-stakes features users compare first (global search,
  resume command, token stats) are missing while same-stack
  competitors ship them daily,
- and nothing exists outside the binary: no website, no license, no
  distribution channel, no release policy, no feedback loop.

The market timing is favorable and closing: local-first has a famous
proof point (Rewind's death), the community hand-rolls Mori's core
output (HANDOFF files, `/handover` commands), and no product occupies
the evidence-linked-memory intersection yet. But Claude Code natively
absorbs more continuity ground every release, and the most direct
competitor shares Mori's stack and audience.

**Positioning to build toward:** the local-first work memory that
turns AI sessions into reviewed, evidence-linked memory and one-click
handoffs. Viewer features are the entry path; the handoff and the
audit trail are the headline.

## 2. Readiness gates

Four gates, each a user-visible state of the product, each composed of
capability-named workstreams (Section 3). Order within a gate is
flexible; gates are sequenced because each depends on the previous
being real. A gate is passed when its exit criteria all hold.

| Gate | State it buys | Exit criteria |
| ---- | ------------- | ------------- |
| **G1 · Installable** | A person can download, install, trust, and update Mori | Signed + notarized installer builds in CI; updater works; real icons and metadata; crash-visible |
| **G2 · Trustworthy with real data** | Months of real work cannot be lost or degraded | SQLite is the source of truth; quota-safe writes; automatic pre-migration backup; recovery UI; virtualized lists |
| **G3 · Competitive at first glance** | A user comparing Mori against the viewer family stays | Global search; resume command; token stats; diff rendering; guided first run; hardened 라이브 세션 |
| **G4 · The moat is the headline** | Mori is chosen *for* memory + handoff, not despite lacking viewer features | Handoff flow is first-class; memory queryable by agents (design-gated); cross-tool reconstruction; weekly digest |

**The launch checkpoint is separate from G1.** G1 produces a private,
installable artifact for the author and beta testers. **Public launch
is its own checkpoint** and requires: G1 and G2 complete, the
product-shell floor in place (W19 web presence, W20 distribution, W21
license, W22 legal floor), and the open decisions D1–D6 (Section 5)
resolved. The sequencing reason is hard: promoting SQLite to the
source of truth (W5) **before** strangers accumulate data in
localStorage is a design task; doing it after is a user-data migration
program. Launching between G1 and G2 would convert a cheap
architecture change into permanent migration debt.

## 3. Workstreams

Capability-named per project convention. Each carries: scope, the
audit / landscape evidence it answers, and status. Every workstream
still follows the engineering rules: audit-before-implementation for
non-trivial slices, small validated commits, review gates untouched.

### G1 · Installable

**W1 · Release engineering.**
Turn on bundling and make `tauri build` produce a real macOS app
(Windows next). Real icons (brand identity reference governs), filled
`Cargo.toml` metadata, committed `Cargo.lock`, bundle targets per OS.
*Answers:* audit §1. *Status:* open.

**W2 · Continuous integration.**
A GitHub Actions (or equivalent) pipeline running `check:full`,
`build`, `cargo check` / `cargo test`, `style:check`, and knip on every
push; a release workflow producing signed artifacts. A macOS runner
first; a Windows runner joins when W26 starts.
*Answers:* audit §1. *Status:* open.

**W3 · Signing, notarization, updater.**
Apple Developer signing + notarization in the release workflow;
`tauri-plugin-updater` with a release channel; pinned source-level
`src-tauri/capabilities/` permissions as part of the same pass.
*Answers:* audit §1, §6. *Status:* open. *Notes:* needs an Apple
Developer account, a user-owned prerequisite. The updater signing
keypair is a **custody-critical secret**: losing it strands every
installed copy off the update channel; leaking it lets an attacker
push updates. Key generation, storage, and backup are part of this
workstream's definition of done.

**W4 · Crash and error visibility.**
Global `window.onerror` / `unhandledrejection` capture and a Rust
panic hook, both writing to a **local** diagnostics log (local-first:
no remote telemetry), plus a "진단 내보내기" action in Settings.
Per-view error boundaries so one broken view does not blank the shell.
*Answers:* audit §2. *Status:* open.

### G2 · Trustworthy with real data

**W5 · SQLite as the source of truth.**
The single largest architecture decision in the program: promote
desktop SQLite from mirror to primary store for session drafts,
imports, analysis, and memory bodies; demote localStorage to browser
fallback + cache. Requires its own design doc (migration path from
existing localStorage data, dual-write transition window, rollback
story) and explicit user approval before build. Must land **before
the public launch checkpoint** (Section 2).
*Answers:* audit §3, §5. *Status:* open, design-gated.

**W6 · Storage safety rails.**
Quota-guarded writes with honest user-facing failure surfaces (no
silent `QuotaExceededError`); automatic pre-migration backup of the
SQLite file; a migration-failure recovery UI (restore backup / export
/ start fresh) instead of a hard dead end. Fix the known
`addSessionImport` re-serialization cost.
*Answers:* audit §2, §3, §5. *Status:* open. Deliverable even before
W5 lands; the quota guard matters most while localStorage is primary.

**W7 · Scale rendering.**
Wire the existing tested `VirtualList` into the session lists (Home,
sidebar, memory, workspace); define a stress fixture (500+ sessions)
the way the timeline already has one.
*Answers:* audit §3, landscape §3. *Status:* open; component already
built, integration only.

### G3 · Competitive at first glance

**W8 · First-run experience.**
A guided first run: detect installed anchor agents → connect (hook
install / discovery check) → surface the first real sessions. Built
from existing pieces (`detect_connector_status`, setup guides, 라이브
세션 discovery); the missing part is the guided composition and a
first-launch route into it.
*Answers:* audit §4; the whole product depends on this connection.
*Status:* open.

**W9 · Global search.**
Cmd+K search across sessions (title + content), events, and accepted
memory, with Web Worker indexing for scale. The single most-cited gap
in both the internal viewer synthesis and the native-agent complaint
threads.
*Answers:* landscape §3.1; viewer synthesis §3.3. *Status:* open
(command palette already searches sessions by title; content indexing
and memory corpus are the gap).

**W10 · Session utility parity.**
The cheap, high-utility viewer features: per-session "resume 명령
복사" (`claude --resume <id>`), token / tool statistics on session
개요 and project pages (the Rust `TokenAccumulator` already parses
them), and file-diff rendering from the stored `structuredPatch`.
*Answers:* landscape §3; viewer synthesis §3.5-3.6, §4 P3.
*Status:* open.

**W11 · 라이브 세션 hardening.**
Replace string-prefix error detection with a structural error flag on
the feed item; persist pause / focus state; extend the live tail to at
least Codex and OpenCode through the same delta-read seam; make
cadence / caps tunable constants in one place. Register the surface's
controls in `featureStatus.ts` (known follow-up).
*Answers:* audit §10. *Status:* open.

**W12 · View-layer test floor.**
A minimum test floor for the highest-traffic view logic: the live
poller lifecycle (teardown, backoff, rediscovery), the persistence
handoff (localStorage ↔ SQLite promotion path), and smoke-level tests
for Home / Session / Memory view models. Not a coverage crusade; a
floor under the surfaces users touch daily.
*Answers:* audit §9. *Status:* open.

### G4 · The moat is the headline

**W13 · Handoff productization.**
Promote the session-end flow (wrap-up → review → resume prompt /
`.mori` handoff) from a Reports-page feature to a first-class,
first-screen affordance; one click from "done working" to "reviewed
handoff artifact". The community hand-rolls exactly this (HANDOFF.md,
`/handover`); Granola proved the reviewed artifact is the product.
*Answers:* landscape §2, §4.1. *Status:* open; the machinery
(sessionWrapUp, handoffReadiness, resume builders) is built, the
promotion is the work.

**W14 · Memory as a local service (MCP).**
Serve accepted project memory **read-only** over a local MCP server so
anchor agents can query durable memory at session start: the automated
form of the resume prompt, and the delivery mechanism mem0 / Pieces
validated. Hard rails: read-only serving, local-only transport,
writing stays behind consolidation review, off by default. Requires a
design doc reconciling it with the non-goals (it is an output surface,
like `.mori` export, not a capture surface) and explicit user approval.
*Answers:* landscape §4.3. *Status:* open, design-gated.

**W15 · Cross-tool reconstruction.**
One project-level answer to "what actually happened this week, across
Claude + Codex + Cursor, with receipts": a project-aggregate view over
already-imported multi-agent sessions with evidence links. Builds on
the existing project synthesis and the deferred project-aggregate
timeline spec.
*Answers:* landscape §4.4 (unowned space). *Status:* open, spec
partially exists (`design/project-aggregate-timeline-spec.md`).

**W16 · Weekly digest.**
A Granola-style quiet paragraph on Home: what happened, what was
decided, what is unresolved, with links. Distillation machinery
exists; only the calm digest surface is missing.
*Answers:* viewer synthesis §1.4, §4 P3. *Status:* open.

### Product shell (beyond the app)

These workstreams live outside the binary. The launch checkpoint
(Section 2) requires W19–W22 at floor level; W23–W26 shape how far the
product can reach after launch.

**W19 · Web presence.**
A static product site: landing page (positioning, screenshots, the
local-first / evidence-linked story), download page wired to the
release channel, changelog, docs (setup guides already written in-app
can be mirrored), and the privacy policy (W22). Recommended as a
**separate repository** (different deploy cadence and toolchain from
the app; keeps this repo's validation contract clean); the brand
identity reference governs its design. No accounts, no analytics
beyond privacy-respecting page counts, no cloud features implied.
*Status:* open. A **private** site repo may start now under the
codename (rename later is free while private); the public domain,
org, and branding wait for the naming decision (D3). Repo-structure
patterns verified 2026-07: Supabase keeps www / docs inside the app
monorepo; PostHog keeps a domain-named separate site repo
(`posthog.com`); Zed and Cal.com keep the marketing site private even
with an open app. For Mori the separate-repo split is right: the site
shares no toolchain with the app, deploys on its own cadence, and its
visibility can differ from the app's (D1).

**W20 · Distribution channels.**
GitHub Releases as the canonical artifact host; the `latest.json`
updater endpoint served from Releases (no server to run); a Homebrew
cask once notarization lands (macOS developers, the first audience,
live in `brew install`); winget / Scoop when W26 ships Windows.
Checksums published per release.
*Answers:* landscape §7.3 (durability signals). *Status:* open,
depends on W1–W3.

**W21 · Source posture and licensing.**
Execute whatever D1 lands on: a LICENSE / EULA (no LICENSE file
exists today), filled `package.json` / `Cargo.toml` license +
repository metadata, and third-party attribution (npm: fflate,
lucide-react, react, zustand, tailwind; plus the Rust crate tree),
which is required regardless of posture. If D1 stays closed-free,
this workstream also builds the **public shell** (Obsidian /
Conductor pattern): a public `<name>-releases` repo carrying the
updater feed and the public issue tracker, and public user docs; the
app and site repos stay private. If D1 moves to fair-source, the FSL
license text replaces the EULA and the app repo goes
source-visible.
*Status:* open; D1 leaning closed-free as of 2026-07-12.

**W22 · Legal and policy floor.**
A privacy policy (short and honest: everything stays local, what the
app reads, what the hook writes, what `.mori` export contains), and a
written review of the third-party data-store boundary: reading the
user's own Claude Code JSONL is the user reading their own files, but
the Cursor `state.vscdb` exception and any future store should carry
an explicit note per store; the 2026-04 ToS action against
Agent-SDK-class tools is the precedent to monitor (Mori reads files
and never drives the agent, which is the right side of that line, and
the docs should say so). An EULA only if D1 lands closed-source.
*Status:* open.

**W23 · Language strategy.**
Today the UI is Korean-first by principle, with **no i18n
infrastructure** and hardcoded Korean strings across ~120 feature
files; every commit deepens the retrofit cost. Decide (**D4**):
(a) Korean-only launch, own the open Korean lane first, extract
strings later when English demand is proven; (b) an extract-strings
pass now (mechanical but large) so English can follow cheaply;
(c) English-first flip, abandoning the Korean-lane thesis. The
program recommends (a) with one amendment: any **new** surface built
from now on routes copy through a single strings module for its
feature, so the retrofit stops deepening without a big-bang pass.
*Status:* open, user decision required.

**W24 · Release management.**
Semver policy and channels (stable + beta), release notes written per
release and surfaced in-app ("새로운 기능" after update, calm and
dismissible), a schema compatibility policy in writing (SQLite
migrations stay forward-only with pre-migration backup per W6;
`.mori v0` remains readable forever, any v1 must round-trip v0), and
a support statement (which OS versions, which agent versions the
readers track).
*Status:* open.

**W25 · Beta program and feedback loop.**
G3's "competitive at first glance" cannot be judged without outside
users. A small closed beta recruited from the communities where the
pain is already visible (gpters `/handover` threads, Korean dev
Slack/Discord groups), an in-app feedback affordance (opens a
prefilled GitHub issue with the W4 diagnostics attached, explicit and
user-visible, never automatic), and issue templates in the repo.
Success metrics defined per gate (e.g. G3: a beta user connects an
agent and finds a past session within the first sitting, unaided).
*Status:* open, needs G1 first.

**W26 · Windows support floor.**
The connector layer already ships PowerShell wrappers and a
USERPROFILE-aware path resolver, but no Windows build has ever been
produced or tested. Scope: a Windows CI runner, WebView2 rendering
pass, installer (NSIS / MSI via Tauri), path handling audit, and the
Windows-specific hook installer paths. Windows is a large share of
the Claude Code audience; sequenced after the macOS launch settles.
*Status:* open, deliberately after G1–G2 on macOS.

### Cross-cutting (any time)

**W17 · Housekeeping.**
Delete or wire the 49 knip-unused files (decide per file; `VirtualList`
is wired by W7); remove the 11 tracked `tmp-ui-*.png` scratch images;
fix the stale `README.md` icon-script reference; add knip to CI (W2).
*Answers:* audit §8. *Status:* open.

**W18 · Product identity and naming.**
"Mori" is confirmed a **placeholder codename** (D3, 2026-07-12); the
real name arrives via a naming sprint before the launch checkpoint
(candidates, domain / npm / crate / trademark availability, and the
`fjwood69/mori` collision becomes moot on rename). Until then: no
public investment under the codename; private repos keep it. Org
strategy at launch, both verified-common patterns: a product-named
org (`supabase`, `obsidianmd`) created fresh under the final name, or
the existing company-style org (swarea, like `zed-industries` /
`meltylabs`) going public with product-named repos; GitHub transfers
carry stars / issues / redirects either way, so the choice can wait
for the name.
*Answers:* landscape §1.2, §7.3. *Status:* direction decided; naming
sprint pending, blocks W19 public domain and W20.

## 4. Suggested execution order

Within the gate structure, the highest-leverage sequence:

1. **W6 (quota guard slice) first**, even before G1: it is small and
   closes the likeliest active data-loss path today.
2. **G1 as one arc** (W1 → W2 → W3 → W4): each is small; together
   they produce the first real artifact. W3's signing needs the
   user-owned Apple Developer prerequisite early, and its updater
   keypair custody plan is part of done.
3. **W5 design doc + the D-decisions (Section 5) in parallel** with
   G1 implementation: both are thinking / writing tasks, and D1 / D3
   block the product-shell workstreams.
4. **G2 (W5 build, W6 remainder, W7)** immediately after G1, before
   any stranger installs the app: the launch checkpoint depends on it.
5. **W19–W22 (product-shell floor)** alongside G2; W19 and W20 block
   on D3 (naming).
6. **W8 + W10** early in G3: first-run and cheap parity wins have the
   highest impression-per-effort. **W25 (beta)** starts here; G3's
   exit is judged by beta users, not by the author.
7. **W13** as the first G4 item: it is promotion of existing
   machinery, not new capability.
8. **W26 (Windows)** after the macOS launch settles.

The autonomous loop may execute workstreams that are concrete and
approved. The design-gated items (W5, W14) and every user decision
(D1–D6, including W18 naming and W21 licensing) may not start without
explicit approval.

## 5. Open product decisions

Decisions only the user can make. Each blocks the workstreams listed;
the program's recommendation is stated, not presumed.

| # | Decision | Blocks | Recommendation |
| - | -------- | ------ | -------------- |
| **D1** | Source posture: open-source, closed-free with a public shell, or fair-source (FSL, auto-opens after 2 years); which license | W21, W19, W25 | **Leaning closed-free (user direction, 2026-07-12).** Viable and proven in this exact category: Conductor ships closed-free with only a public `conductor-releases` shell (updater feed + issues); Obsidian is the canonical model (private app + public releases / help / api repos where the community produces artifacts). Fair Source (Sentry's FSL: source-visible, non-compete, auto-converts to Apache-2.0 after 2 years) is the middle path if source visibility ever becomes a trust requirement. Full OSS remains the max-distribution option; not required. |
| **D2** | Monetization: free, donation, paid tier, or team tier later | W19 copy, long-term shape | **Decided (2026-07-12): free for now.** Revisit a paid **team handoff** tier after G4 (Granola's proven step). |
| **D3** | Naming: keep "Mori" or rename | W18, W19, W20 | **Decided in direction (2026-07-12): "Mori" is a placeholder codename; the real name comes later, before any public artifact.** Consequences: zero public investment under the mori name (no domains, no public org, no branding); private repos may keep the codename since GitHub renames / transfers redirect web + git and carry stars (caveat: a redirect dies permanently if the old name is ever reused). A naming sprint (candidates, domain / npm / crate / trademark checks) is a launch-checkpoint prerequisite. |
| **D4** | Language strategy: Korean-only launch vs i18n extraction now | W23, W19 (site languages) | Korean-only launch + strings-module rule for new surfaces (W23 option a). |
| **D5** | Browser-mode fate once SQLite is primary: demo / trial surface, or retired to a route | W5 design | Keep as an explicitly-labeled demo / trial surface (honest, zero-install trying), never described as a storage mode. |
| **D6** | Launch shape: private beta first vs direct public launch | W25, launch checkpoint | Private beta (10–30 users from the Korean communities) between G2 and public launch. |

## 6. Program risks

Named so they are managed, not discovered.

1. **Sequencing / migration debt.** Publicly distributing before W5
   (SQLite promotion) converts an internal refactor into a user-data
   migration program. Mitigation: the launch checkpoint in Section 2
   is hard; G1 artifacts stay private / beta until G2 lands.
2. **Solo bandwidth vs 26 workstreams.** The program is large for one
   author plus an autonomous loop. Mitigation: gates force order;
   every workstream splits into loop-sized slices; product-shell
   items (site, policy) are mostly writing, parallelizable with app
   work; nothing in G3 / G4 starts while G1 / G2 are open except
   design docs.
3. **Updater key custody.** Losing the updater keypair strands every
   install; leaking it is a supply-chain hole. Mitigation: custody
   plan is inside W3's definition of done (offline backup, documented
   recovery).
4. **Vendor format drift.** Mori's readers track other tools' private
   formats (Claude JSONL, Codex, Cursor `state.vscdb`); any release of
   theirs can break parsing. Mitigation: tolerant readers already
   exist (unknown-kind preservation); add per-agent fixture contract
   tests and a "reader health" surface in diagnostics (fold into W12).
5. **ToS / policy drift at the vendors.** The 2026-04 action against
   Agent-SDK-class tools shows the vendors police this space. Mori
   reads the user's own local files and never drives the agent, which
   is the defensible side of the line; W22 keeps the boundary written
   down per store, and the Cursor exception stays narrow.
6. **Native commoditization pace.** Anthropic ships continuity
   features quarterly. Mitigation: the program front-loads what the
   vendor will not build (cross-tool, evidence-gated, handoff, team);
   G3 parity items are deliberately cheap, not deep.
7. **Category-churn perception.** Users have watched opcode, sniffly,
   Crystal, and Vibe Kanban stall. Mitigation: durability signals are
   the launch story (signed installer, updater, data safety, an
   explicit local-data guarantee), and the site says who maintains it.
8. **Naming collision.** Unresolved, it degrades search and identity
   from day one. Mitigation: D3 is resolved before any public
   artifact (W18 blocks W19 / W20).
9. **Korean-only ceiling.** The Korean lane is open but small; the
   English market is where the category's users are. Mitigation: D4's
   strings-module rule keeps the door open without paying the
   retrofit now; revisit after beta signal.
10. **Program staleness.** A 26-workstream document rots if it is not
    the loop's actual source of slices. Mitigation: the autonomous
    loop's next-slice section points here; status updates on ship are
    part of each workstream's definition of done.

## 7. What this program does not change

- **Identity and non-goals.** Everything in
  `mori-project-goal.md` §6 and §14 binds every workstream: no
  invasive capture, no cloud sync, no account scraping, no unreviewed
  memory writes. W14 is an output surface and must be designed to stay
  one. The product site (W19) is static and implies no accounts or
  cloud features.
- **Review gates.** Import Review and Consolidation Review remain
  non-bypassable regardless of how frictionless capture becomes.
- **The calm bar.** No gamification, no attention-seeking surfaces;
  the digest, first-run, and release-notes surfaces follow the
  copy-diet and InfoHint conventions.
- **Validation contract.** Every commit in every workstream passes
  `check:full`, `build`, `git diff --check`; `cargo check` /
  `cargo test` when `src-tauri` changes.

## 8. Exit criteria for the program

The program is done when a stranger can: find Mori's website, read an
honest privacy story, download a signed installer, be guided to
connect their agent in one sitting, watch a live session flow in,
search everything they have ever done, lose nothing to a crash, a
quota, or an update, and end a work session with a one-click reviewed
handoff that their next session (or teammate, or another agent)
actually consumes; and the author can ship a fix to that stranger
through the updater the same week. At that point Mori is a product,
and the roadmap reverts to the capability buckets in
`mori-project-goal.md` §13.
