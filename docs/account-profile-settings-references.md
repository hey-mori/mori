# Account / Profile / Settings — Design References

Design **reference assets** for Mori's planned account, profile, and
settings expansion. These are concept images, not production screenshots
and not final copy. They guide layout, information architecture,
hierarchy, state treatment, and screen planning — nothing here is a
commitment to ship a screen verbatim.

Assets live in
[`docs/assets/screenshots/account-profile-settings/`](assets/screenshots/account-profile-settings/).

**Hard rule for all of this work:** none of these screens may weaken
Mori's product principles (`docs/mori-project-goal.md` §6). Local
Profile is the default identity; a Mori Account is always optional;
authentication is never data access; capture stays explicit and
reviewed.

---

## 1. Reference index

### `account-settings-screen-map-reference.png`
- **Screen:** Account / Profile / Settings screen map (the master plan).
- **Surface:** Planning artifact — a grid of ~16 sub-screens for the
  whole account/profile/settings area.
- **Solves:** Gives one coherent map so the expansion is planned as a
  system, not bolted-on panels.
- **Copy:** the screen inventory and grouping (Onboarding → Local
  Profile → Sign-in → Connections → Profile → Plan → Privacy → Storage
  → Providers → Connectors → Companion prefs → Workspace →
  Notifications → Sessions/Devices → Security).
- **Adapt:** order and grouping to Mori's actual routing.
- **Do not copy:** the exact count of screens — collapse where Mori's
  scope is smaller.
- **Priority:** planning input only. **Scope:** future.

### `account-profile-reference.png`
- **Screen:** Account & Profile.
- **Surface:** A dedicated Account/Profile page (new).
- **Solves:** One place for identity — display name, avatar, org/team,
  linked accounts, plan, membership, default work settings.
- **Key layout:** two-column — profile fields left, account-state /
  plan / linked-accounts rail right.
- **Useful patterns:** "Local Profile" + "Mori Pro" state chips;
  linked-accounts list (Google / GitHub) shown as *identity links*,
  not data connectors.
- **States shown:** Local Profile vs signed-in; linked vs unlinked
  accounts; plan tier.
- **Copy:** the identity/plan/linked-accounts split.
- **Adapt:** plan/billing is future — render as a planned state.
- **Do not copy:** any implication that a linked Google account grants
  Drive/Gmail/Calendar access.
- **Priority:** high (after IA planning). **Scope:** future.

### `login-local-first-reference.png`
- **Screen:** Login / Local-first sign-in.
- **Surface:** An entry screen shown before the workspace (new;
  optional — Mori must still open straight into Local Mode).
- **Solves:** Makes "you do not need an account" a first-class choice.
- **Key layout:** left = local-first explainer; right = "start with an
  account" (Google / GitHub / email) **and** a prominent "start in
  Local Mode" path, plus a connection-options comparison.
- **Useful patterns:** Local Mode given equal-or-greater weight than
  sign-in; an explicit auth-vs-data-access comparison.
- **States shown:** local mode / Google / GitHub / email.
- **Copy:** the local-mode-first framing and the comparison block.
- **Adapt:** sign-in is planned — the buttons render as planned until
  the auth backend exists.
- **Do not copy:** a blocking login wall; Mori must never require an
  account to be useful.
- **Priority:** medium. **Scope:** future.

### `local-profile-setup-reference.png`
- **Screen:** Mori Start / Local Profile Setup (onboarding).
- **Surface:** First-run setup — overlaps the existing **Start
  Session** surface.
- **Solves:** Sets recording mode, retention, AI Companion provider,
  and optional connections before first real work.
- **Key layout:** stepped setup cards + a live "setup summary" rail.
- **Useful patterns:** Summary Mode vs Full-data-retained as explicit
  honest choices; the summary rail.
- **States shown:** retention policy, analysis mode, provider, planned
  connections.
- **Copy:** the retention/provider honesty and the summary rail.
- **Adapt:** much of this already exists in `StartSessionView` — treat
  as an evolution of Start Session, not a brand-new screen.
- **Do not copy:** anything implying connections capture automatically.
- **Priority:** medium (fold into Start Session). **Scope:** partial.

### `privacy-data-control-reference.png`
- **Screen:** Privacy & Data Control.
- **Surface:** A dedicated Privacy page (today: a Settings tab).
- **Solves:** One surface for capture policy, retention, export/delete,
  the "what Mori never does" list, and audit-log stats.
- **Key layout:** policy cards grid + a calm "Local-first / Privacy
  First" panel + export/delete + audit stats.
- **Useful patterns:** read-only policy cards (not toggles where the
  behavior is a guarantee, not a setting); the "never does" list.
- **States shown:** enforced / default / planned policy states;
  retained / summary / redacted / not-captured.
- **Copy:** the policy-card layout and the guarantees list.
- **Adapt:** Mori already has `PrivacyDefaultsCard` and
  `TrustSummaryPanel` — promote/expand rather than rebuild.
- **Do not copy:** turning a hard guarantee into a user-flippable
  toggle.
- **Priority:** high. **Scope:** partial (Settings tab exists).

### `security-device-sessions-reference.png`
- **Screen:** Security & Device Sessions.
- **Surface:** A Security page (new; mostly meaningful only once a Mori
  Account exists).
- **Solves:** Device list, active sessions, login history, 2FA, risk
  alerts, a security score.
- **States shown:** devices, active vs past sessions, security level.
- **Copy:** the device/session list structure — *for the future
  account era*.
- **Do not copy:** anything that implies Mori tracks devices while in
  pure Local Mode; most of this screen is meaningless without an
  account and must not appear as if it is active.
- **Priority:** low. **Scope:** future (account-dependent).

### `notification-center-reference.png`
- **Screen:** Notification Center / Companion Inbox.
- **Surface:** A notification/inbox surface — **the natural home of the
  existing Companion Layer ("Mori 노트")**.
- **Solves:** A reviewable feed of companion signals + a "Companion
  요약" rail (today's summary, suggestions, key activity, signal
  settings).
- **Key layout:** filterable signal list + companion-summary sidebar.
- **Useful patterns:** severity-tagged rows; per-signal action; a
  quietness/settings control.
- **States shown:** info / suggestion / review / risk signals.
- **Copy:** the inbox list + summary rail — this is the already-planned
  "in-app review queue / notification center" for the Companion Layer.
- **Adapt:** build on `companionSignals` / `CompanionCard` /
  `CompanionStrip`; this is the Companion Layer's next real surface.
- **Do not copy:** OS-level notifications; anything implying background
  watching. Signals are derived from already-imported data only.
- **Priority:** high (closest to current code). **Scope:** partial —
  the Companion Layer exists; the dedicated inbox does not.

### `workspace-projects-reference.png`
- **Screen:** Workspace & Projects.
- **Surface:** A workspace/project management page (new).
- **Solves:** Browsing projects, per-project stats, a project detail
  rail (members, connections, quick actions).
- **States shown:** project list, per-project counts, member list.
- **Copy:** the project-list + project-detail-rail structure.
- **Adapt:** Mori has a `Project` model but no multi-project browser;
  scope to a single local project first, multi-project later.
- **Do not copy:** team/member features until team memory ships
  (`docs/team-shared-memory.md` — `.mori` handoff only today).
- **Priority:** medium. **Scope:** future.

---

## 2. Product requirements (account / profile / settings expansion)

- **Local Profile first.** The default identity is a local profile.
  Mori opens straight into a usable Local Mode with no account.
- **Optional Mori Account.** A Mori Account is only ever for sync,
  backup, team sharing, billing, and account settings — never required
  for core work.
- **Sign-in providers (planned).** Google / GitHub / Email may be
  offered as authentication methods.
- **Authentication ≠ data access.** Google sign-in proves identity
  only. It must not imply access to Drive, Gmail, Calendar, Chrome, or
  browser history. External data access is a *separate, explicit
  connector permission*, granted per connector.
- **Connector permissions are separate from login** and remain
  explicit, reviewable, and revocable.
- **Privacy & data control** stays a first-class surface: capture
  policy, retention, export, delete, audit log, and the "what Mori
  never does" guarantees.
- **Storage & backup** honestly distinguishes browser localStorage,
  desktop SQLite, fallback mode, and any future opt-in account backup
  (off by default).
- **Security & device sessions** is account-dependent and must not
  appear active in pure Local Mode.
- **Notification / Companion center** is the Companion Layer's inbox —
  local, evidence-based, no OS notifications, no background watching.
- **Workspace / projects** management starts single-project-local;
  multi-project and team features come later.
- **Personal preferences** (companion quietness, density, defaults)
  are local and do not need an account.
- **Account & plan / billing** is future and must render as planned,
  never as a fake-active state.
- **Team / sharing** remains `.mori` handoff only until the team-memory
  capability ships.

---

## 3. Comparison with the current app

| Concept screen | Current Mori | Gap |
|---|---|---|
| Account & Profile | none — sidebar shows a static "Kim Mori / Local Mode" | missing page; needs a profile data model |
| Login / Local-first | none — app opens straight into the workspace | missing (and the open-straight-in behavior is correct and must stay) |
| Local Profile Setup | `StartSessionView` covers session setup | partial — evolve Start Session, do not duplicate |
| Privacy & Data Control | a Settings **tab** (`PrivacyDefaultsCard`, `TrustSummaryPanel`) | partial — promote to a fuller surface |
| Security & Device Sessions | none | missing — account-dependent, low priority |
| Notification Center | Companion Layer — `companionSignals`, `CompanionCard`, `CompanionStrip` on 5 surfaces | partial — signals exist; a dedicated inbox does not |
| Workspace & Projects | a `Project` model exists; no project browser | missing UI; model partially exists |
| Settings shell | `SettingsView` with localAi / privacy / storage / repositories / connectors tabs | exists — would need a nav restructure to host the new pages |

**Routing today:** `ViewKey` = start / timeline / evidence / review /
reports / memory / settings / flow / consolidation. No account, login,
profile, privacy-page, security, notifications, or workspace routes.

**Data model today:** `Project` and session/profile-ish data exist;
there is **no** account model, no device/session model, no
notification-store model. Those are new models, not UI-only work.

What can be UI-only planned state now: Security page, Account & Plan
billing, sign-in buttons. What should stay documentation-only for now:
everything account-backend-dependent.

---

## 4. Implementation roadmap

Coherent product passes — not micro-commits. Each pass is its own
future session.

- **Pass A — Reference + docs (this commit).** Save assets, write this
  index, record the roadmap. No UI. Risk: none.
- **Pass B — Local Profile / Account IA planning.** Decide routing,
  the local-profile data model, and the auth≠access boundary in docs.
  Risk: low. Doc + type-sketch only.
- **Pass C — Account & Profile page shell.** A profile page reading the
  local profile; account/plan rendered as planned. Risk: medium; needs
  a profile model + a route. Visual + small data-model.
- **Pass D — Login / Local-first entry shell.** An optional entry
  screen; "Local Mode" must remain the default, non-blocking path.
  Risk: medium (routing). Visual; sign-in stays planned.
- **Pass E — Privacy & Data Control page.** Promote the Settings
  privacy tab into a fuller surface. Risk: low–medium. Visual +
  state-honesty.
- **Pass F — Notification Center / Companion Inbox.** The Companion
  Layer's inbox surface, built on `companionSignals`. Risk: medium.
  Workflow-level — the highest-value account-area pass because the
  code foundation already exists.
- **Pass G — Workspace & Projects page.** Single-project-local first.
  Risk: medium; needs a project browser. Visual + data-model.
- **Pass H — Security & Device Sessions.** Account-dependent; planned
  state only until an account backend exists. Risk: low as planned UI.
- **Pass I — Settings navigation restructure.** Only if the new pages
  need a unifying nav. Risk: medium.

Suggested order by value-now: **F (Companion Inbox)** → **E (Privacy)**
→ **C (Profile)** → **B (IA)** → the rest.

---

## 5. Non-goals reaffirmed

This work must not introduce: account scraping, Google/GitHub data
reading beyond identity, browser-history reading, hidden capture,
background monitoring, cloud sync by default, an always-on daemon,
fake-connected states, or a login wall. A linked account is identity
only. See `docs/mori-project-goal.md` §6 and §14.
