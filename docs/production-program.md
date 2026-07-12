# Mori Production Program

The roadmap for turning the current repo into a shippable, trustworthy,
competitive product. This is the entry point for "what does Mori need
to become a real product"; it sequences the work and defines done.

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
- and the table-stakes features users compare first (global search,
  resume command, token stats) are missing while same-stack
  competitors ship them daily.

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
push; a release workflow producing signed artifacts.
*Answers:* audit §1. *Status:* open.

**W3 · Signing, notarization, updater.**
Apple Developer signing + notarization in the release workflow;
`tauri-plugin-updater` with a release channel; pinned source-level
`src-tauri/capabilities/` permissions as part of the same pass.
*Answers:* audit §1, §6. *Status:* open. *Note:* needs an Apple
Developer account, a user-owned prerequisite.

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
story) and explicit user approval before build.
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

### Cross-cutting (any time)

**W17 · Housekeeping.**
Delete or wire the 49 knip-unused files (decide per file; `VirtualList`
is wired by W7); remove the 11 tracked `tmp-ui-*.png` scratch images;
fix the stale `README.md` icon-script reference; add knip to CI (W2).
*Answers:* audit §8. *Status:* open.

**W18 · Product identity and naming.**
Resolve the naming collision with `fjwood69/mori` ("governed memory
layer for AI coding agents", near-identical positioning language)
before any public release: keep the name with distinct branding, or
rename. A user decision; the program only flags that it must happen
before G1's public artifact exists.
*Answers:* landscape §1.2, §7.3. *Status:* open, user decision.

## 4. Suggested execution order

Within the gate structure, the highest-leverage sequence:

1. **W6 (quota guard slice) first**, even before G1: it is small and
   closes the likeliest active data-loss path today.
2. **G1 as one arc** (W1 → W2 → W3 → W4): each is small; together
   they produce the first real artifact. W3's signing needs the
   user-owned Apple Developer prerequisite early.
3. **W5 design doc** in parallel with G1 implementation (it is a
   writing task), so G2 can start the moment G1 ships.
4. **W8 + W10** early in G3: first-run and cheap parity wins have the
   highest impression-per-effort.
5. **W13** as the first G4 item: it is promotion of existing
   machinery, not new capability.

The autonomous loop may execute workstreams that are concrete and
approved; W5 and W14 are explicitly design-gated and need user
approval before any build, and W18 is a pure user decision.

## 5. What this program does not change

- **Identity and non-goals.** Everything in
  `mori-project-goal.md` §6 and §14 binds every workstream: no
  invasive capture, no cloud sync, no account scraping, no unreviewed
  memory writes. W14 is an output surface and must be designed to stay
  one.
- **Review gates.** Import Review and Consolidation Review remain
  non-bypassable regardless of how frictionless capture becomes.
- **The calm bar.** No gamification, no attention-seeking surfaces;
  the digest and first-run flows follow the copy-diet and InfoHint
  conventions.
- **Validation contract.** Every commit in every workstream passes
  `check:full`, `build`, `git diff --check`; `cargo check` /
  `cargo test` when `src-tauri` changes.

## 6. Exit criteria for the program

The program is done when a stranger can: download a signed Mori,
be guided to connect their agent in one sitting, watch a live session
flow in, search everything they have ever done, lose nothing to a
crash or a quota, and end a work session with a one-click reviewed
handoff that their next session (or teammate, or another agent)
actually consumes. At that point Mori is a product, and the roadmap
reverts to the capability buckets in `mori-project-goal.md` §13.
