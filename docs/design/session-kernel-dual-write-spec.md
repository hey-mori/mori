# 세션 S2 · auto-import dual-writes kernel records (spec)

Status: **core implemented 2026-07-16.** The driver
(`useAutoImportSessions`) now dual-writes each registered session as a
`provisional` `agent-session` kernel record via `upsertAgentSessionRecords`
(`src/lib/record-kernel/agentSessionRecordAdapter.ts`, id = `autoImportedSessionId`,
best-effort, context-bound only to an existing match), and the 기록 explorer
excludes `agent-session` from its default view (opt-in via the 에이전트 세션
facet chip). New records are created `active` per the owner's 2026-10-07
decision: a session read from the agent's own log is an observation, not an
interpretation, so `provisional` is reserved for interpretations that could be
wrong. (From 2026-07-16 to 2026-10-07 they were created `provisional`; those
records keep that status, because rediscovery never changes status (§2.1). A
separate, explicitly run backfill may promote the untouched ones.) Still open: id convergence with
the manual capture path (§1), calendar per-day `세션 N` grouping (§3), opt-out
prune partition (§4), and partial-failure surfacing in the sync notification
(§5). The implementation contract for slice S2 of
[`search-and-session-unification-audit.md`](search-and-session-unification-audit.md):
every auto-registered agent session also becomes an `agent-session`
kernel record, so the cross-lenses (캘린더 · 검색 · 프로젝트) span AI
work without the manual per-session button. This is the §12 dual-run
step of the architecture doc's Adapt verdict (session → `agent-session`
record + `Source`); S3 (read-path union) exits it.

Grounded in the shipped auto-import: pure core
`src/lib/session/autoImportSessions.ts` (stable
`auto-<agentId>-<hash>` ids, fingerprint diff, REGISTER_CAP 400),
driver `src/features/background-watch/useAutoImportSessions.ts`
(desktop-only, foreground-only, 90s cadence, opt-out in 연동), store
action `registerDiscoveredSessions` (quota-aware, returns written ids).

## 1. Identity: one id, both paths converge

The kernel record id for a discovered session **is** its
`autoImportedSessionId(meta)`. Consequences:

- Re-discovery upserts the same record (idempotent), mirroring the
  draft upsert.
- The manual 기록으로 변환 path (`captureAgentSession`) must converge:
  when the session being captured is a discovered one, the
  `agent-session` proposal carries the same id, so manual capture
  **enriches** the auto record (decisions, context bindings) instead
  of creating a duplicate. `agentSessionToProposals` gains an optional
  stable-id hint; decision records keep their own generated ids.
- `isAutoImportedSessionId` stays the discriminator for prune logic.

## 2. What the record carries (deliberately thin)

Schema `agent-session` as seeded (`agentId`, `stepCount`,
`tokenCount`): title = session title, body = one honest line (agent +
count; no synthetic summary), `occurredStart/End` from the session's
own times with `timeBasis: source-observed`, origin `automation`,
status `active`, plus the create `Revision` (actor `rule`, the actor
`actorForOrigin` gives origin `automation`).
Live status, timeline events, and analysis stay in the 세션 workspace
model; the cross-lenses need identity, time, agent, and project
binding, nothing more (audit §3 scoping).

Context binding: bind `belongs-to` **only to an already-existing
context** matched from the session's project name (the existing
converter path). No auto-created contexts: the apply matrix grades
new-entity creation away from auto, and a wrong project guess is
exactly the mutation the matrix protects. Unmatched sessions stay
unbound (they still appear in 캘린더/검색).

Apply grading: creation is `auto` by the matrix (new record only, not
sensitive, reversible, origin automation) and is disclosed through the
existing per-pass sync notification; growth updates write an
`automation` revision only when the fingerprint changed (the diff
already gates this), so the 90s cadence cannot spam revisions.

### 2.1 Rediscovery merges, never replaces

A session the kernel already holds is merged into, not rebuilt
(`planAgentSessionRediscovery` in `agentSessionRecordAdapter.ts`). This
section was added on 2026-10-07 after the first implementation rebuilt the
record on every growth and silently reverted user edits.

- **Observed fields** are the title, the body line, the activity time
  (start, end, and basis as one unit), the project binding, and the
  `agentId` / `stepCount` / `activityClass` / `interaction` /
  `sessionEvidence` properties (§2.2). Each is merged three-way: if its
  current value still equals the value automation last wrote to that
  field, it takes the fresh observation; otherwise the user changed it and
  it is kept. "Last wrote" is per field: a `rule` create sets every field,
  a `rule` update only the fields it changed. A whole-record baseline (the
  newest `rule` revision's `after`) is wrong, because an update carries
  user-kept values into its `after` and the next poll would then treat
  them as automation's.
- **Never changed by discovery:** status, schema, origin, ownership,
  creation and capture times, and any other property.
- **Left untouched entirely:** discarded and archived records, a record
  of another schema under the same id, and a user-edited record with no
  automation write on record.
- **Revisions:** a real change writes one `update` revision with actor
  `rule` and its `before`; an observation that changes nothing writes
  nothing.
- **Unreliable reads:** if the existing record or its revisions could
  only be read from the browser fallback, the session is skipped and
  counted as failed rather than recreated over the real record.

### 2.2 Session outcome evidence and capture policy (2026-10-08)

Owner-approved after the NUC continuation experiment showed a pack of
titles alone added nothing a fresh agent could not find in Git.

- **`sessionEvidence`** holds only structural Git observations the
  source itself recorded, with locators (`segment` = the transcript's
  own session id, `line` = 1-based record number):
  - PRs from Claude `pr-link` records, deduplicated by repository and
    number. Meaning: "this session's source links to this PR". Not
    authorship, not a merge, not success.
  - Branch names from Claude records' `gitBranch` and Codex
    `session_meta.git.branch`, each with first and last sighting.
    Meaning: "seen in the session's Git context". Not the current
    branch. `HEAD` (detached) is not recorded.
  - Repositories named by those sources, and the `continued-in` segment.
  - `coverage`: `complete` only when the whole source was read. Long
    transcripts are scanned incrementally (32 MB per file per poll,
    resumed from the last complete line while the process runs), so a
    huge history is `partial` for a few polls, and the pack says so.
- **Never stored:** transcript prose, assistant reports, request text,
  absolute paths, or counts that move every poll without new meaning.
  An opt-in, reviewed outcome excerpt is deferred (owner decision,
  2026-10-08).
- **`activityClass`** (`conversation`, `command-only`, `empty`,
  `unknown`) is decided from a complete read only; a cut or failed read
  is `unknown`. **`interaction`** comes from the source's marker
  (Claude `entrypoint`: `cli` interactive, `sdk-*` automation; Codex
  `session_meta.source`: `exec` automation, `cli`/`vscode` interactive),
  else `unknown`.
- **Capture policy:** a *new* source a complete read proves `empty` is
  recognised and counted, not registered (no draft, no record).
  Command-only and automation sessions keep their records and are left
  out of the continuation pack with the reason counted. Records that
  existed before are never removed or discarded by this policy; a
  backfill happens only through the normal rediscovery merge, once per
  changed fingerprint.
- **Revisions:** evidence changes are growth, so they supersede the
  previous growth revision like an end-time change; a user edit or a
  status change still ends the stretch.

## 3. The flood problem (first-class design concern)

Dual-writing makes up to 400 historical sessions appear wherever
records appear. Without treatment this swamps the calm surfaces:

- **캘린더**: cells must not render 400 session chips. Group
  `agent-session` records per day into one compact `세션 N` chip that
  routes to the 세션 workspace filtered to that day. One grouping rule
  in `calendarGrouping.ts`, consistent with the one-signal-per-row
  doctrine.
- **기록 explorer**: 기록 is the notes experience in the v4 frame
  ("두 경험 + 교차 렌즈"); AI work has its own home. `agent-session`
  records are **excluded from the 기록 explorer by default** (the
  schema-facet machinery already exists; this is a default, not a
  capability removal: the 세션 facet chip can still opt them in).
- **검색**: included, ranked normally; finding sessions by content is
  the point of S1+S2 (title/body now; event text only after S3+).
- **프로젝트**: included in the context page's 세션 section, which the
  labeled-sections work already anticipates.

## 4. Opt-out and prune semantics

Registration is reversible, and kernel invariants forbid silent
deletion. On opt-out (or prune):

- Automation-origin `agent-session` records with **no user touch** (no
  user revisions, no user-added relations) transition to `discarded`
  via a normal revision, exactly like the composer's post-save undo.
  They are re-derivable from the agent's own logs, so this loses
  nothing.
- Records the user touched (edited title, bound contexts, linked
  notes) are **kept**, with the sync-off state simply stopping new
  registrations. The prune report states both counts honestly.

## 5. Runtime and storage

Auto-import is desktop-only (`isClaudeBridgeAvailable` gate), so the
dual-write lands in SQLite, not localStorage; the browser quota work
(Q1) is untouched by S2 volume. The write goes through the existing
`KernelRepository.saveRecord` pair (record + revision, now atomic) in
the same pass that upserts the legacy draft; a kernel-side failure
must not block the legacy registration (dual-run doctrine: the old
path keeps working), but it must surface through the sync notification
as a partial result, never silently.

## 6. Done criteria

1. A freshly discovered agent session appears in 캘린더 (as part of a
   day's `세션 N` chip) and in 검색 (post-S1) with no manual action.
2. Manually capturing the same session creates zero duplicate records;
   the auto record gains the manual capture's decisions and bindings.
3. Toggling auto-import off discards untouched auto records (revision
   trail intact) and keeps user-touched ones; toggling back on
   restores presence idempotently.
4. The 기록 explorer's default view is unchanged before/after a
   400-session backfill.
5. `npm run check:full` green; no regression in the auto-import
   quota-return contract.

## 7. Test floor

- Id convergence: auto then manual → one record; manual then auto →
  one record.
- Fingerprint-gated updates: unchanged poll writes no revision.
- Context binding only to existing contexts; unmatched stays unbound.
- Opt-out partition: touched kept, untouched discarded, counts
  reported.
- Calendar grouping: N same-day sessions → one chip datum.
- Kernel-write failure in a pass still registers the legacy draft and
  reports partial.

## 8. Explicitly out of S2

Timeline events as source-scoped evidence, `Source`/`SourceLink` rows
for the session log files (that is the full Adapt verdict, staged
after S3), live status on the record, analysis results as records,
backfill beyond REGISTER_CAP, and any change to the 세션 workspace's
read path (S3).
