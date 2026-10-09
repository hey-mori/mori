# Live Project Intelligence

Planning status: **Thesis approved; MVP built 2026-08-07, apart from
interpretation.**

This document defines how Mori should evolve from explicit session import into
an opt-in, near-real-time project intelligence layer. It is a planning and
review document; for what is actually implemented, read the execution plan's
§9 rather than inferring status from the sections below.

The product thesis, event taxonomy, notification policy, and local-LLM
guardrails below remain canonical. The **execution layer** lives in
[`design/live-project-intelligence-execution-plan.md`](design/live-project-intelligence-execution-plan.md):
a code-verified audit of what shipped against the MVP list, the research that
constrains the design, the decisions resolving the open questions that blocked
the first slice, and a staged plan. Read that document before starting work
here. Where this document's *status* claims conflict with it, the execution
plan is newer and wins; where the *thesis* conflicts, this document wins.

Related canonical docs:

- [Product Flow](./product-flow.md) for the existing Capture -> Normalize ->
  Store -> Review -> Timeline -> Extract -> Memory loop.
- [Data Pipeline](./data-pipeline.md) for provenance and review boundaries.
- [Timeline UX](./timeline-ux.md) for the Session Detail `흐름` tab contract.
- [Project Memory](./project-memory.md) for cross-session aggregation limits.
- [Agent connection architecture](./connectors/connection-architecture.md) for
  connector capture boundaries.
- [Local LLM Understanding, Disclosure, and Live Follow](./design/local-llm-understanding-and-live-follow.md)
  for the existing session-scoped foreground Live Follow decision.

## Product Thesis

Mori should not become a raw live log viewer. Mori should connect to a project,
observe AI work that the user explicitly opted into, and reconstruct that work
into three levels of attention:

| Level | Meaning | Primary surfaces |
|---|---|---|
| **Signal** | The user may need to know or act now. | Notification, sidebar badge, project live strip |
| **Summary** | The current state of a project or session. | Project workspace, Home, Project Memory |
| **Trace** | The actual event record and evidence. | Session `흐름` tab, Event Inspector, Evidence |

The key product claim is:

> Mori understands connected AI work well enough to show the right amount of
> context at the right moment, while keeping the evidence inspectable.

The negative claim is just as important:

> Mori does not notify on every event, does not hide the evidence behind an AI
> summary, and does not present inferred local-LLM output as verified fact.

## User Problem

AI-assisted work now happens across many sessions and tools:

- Claude Code or Codex sessions run against a repository.
- Multiple AI conversations may touch the same project at once.
- Tools emit commands, file changes, test failures, decisions, and handoff
  notes.
- The user often needs the current state, not the full transcript.

Without a live project layer, the user has to answer these questions manually:

- What is currently happening in this project?
- Which sessions are running, blocked, or waiting for me?
- What decisions were made recently?
- Did two sessions touch the same files or contradict each other?
- What changed since I last looked?
- Which details are supported by evidence and which are Mori's inference?

## Planning Principles

1. **Explicit connection first.** A connected project is opt-in. Mori may detect
   available connector files or known transcript directories, but capture and
   import must stay clear to the user.
2. **Local and reviewable by default.** Connector data stays local. Durable
   project memory should be backed by reviewable events, sources, and
   provenance.
3. **Live is not the same as noisy.** Mori can ingest events quickly while
   showing only signals that pass policy.
4. **Observed and inferred are separate.** File changes, commands, and session
   lifecycle events are observed. Summaries, risks, decisions, and notification
   candidates produced by local LLMs are inferred until reviewed.
5. **Project and session views have different jobs.** The project workspace
   explains current state. The session `흐름` tab preserves time-ordered trace.
6. **No hidden scraping.** Mori must keep the existing boundary: readable
   transcript files and explicit connector inboxes are allowed; internal app
   databases, browser stores, private account stores, and opaque protobuf
   stores remain out of scope.
7. **Automatic collection is not automatic application.** A connector can emit
   or expose new evidence, but durable timeline and memory state still need the
   existing review/correction boundary.

## Relationship To Existing Live Follow

Mori already has a narrower Live Follow direction:

> A user explicitly follows one registered session while Mori is open. Mori
> re-reads that one already-growing connector file in the foreground, produces
> pending events, and stops when the session/app stops following.

Live Project Intelligence should extend that principle, not replace it.

| Capability | Scope | Default | Allowed behavior |
|---|---|---|---|
| Connector JSONL import | File/batch | Manual | User refreshes or pastes; Import Review applies events. |
| Session Live Follow | One external session | Off | Foreground polling of one known connector file while app is open. |
| Project live summary | Connected Mori project | Off/planned | Aggregates followed or recently refreshed sessions into Summary/Signal. |
| Background watcher | Whole machine | Non-goal | Not allowed in this planning slice. **Superseded 2026-08-06:** an opt-in, off-by-default connector-inbox watcher shipped (`mori-project-goal.md` §5), and the surveillance-line rail B (§6) permits reading explicitly connected sources while the app runs. A whole-machine watcher remains banned; see the execution plan §3.3 and D7. |

Recommended wording:

> Mori follows connected sessions the user has turned on, normalizes new
> evidence into reviewable state, and summarizes the project from that evidence.

Avoid wording that implies Mori silently monitors every project or applies
external AI work directly into durable memory.

## Core Objects

These objects extend the current domain model conceptually. They do not imply a
required schema migration yet.

### ConnectedProject

A local project path, repository identity, or named work container that Mori is
allowed to associate with connector events. It should not rely on raw
`projectPath` or `sourceLabel` alone; the user-confirmed mapping is a separate
trust boundary.

The first cut of this object (canonical project identity, a user-confirmed alias
mapping, candidate proposals, and alias-aware grouping) is implemented; see
[Project Connection Mapping](./project-connection-mapping.md) for the data model
and the remaining slices.

Typical fields:

- `id`
- `projectId`
- `displayName`
- `externalProjectKey`
- `projectPathHash`
- `userConfirmed`
- `connectionStatus`: `notConnected` | `connected` | `paused` | `error`
- `allowedConnectorIds[]`
- `captureMode`: `manualImport` | `refreshInbox` | `liveEmit`
- `rawDataPolicy`
- `createdAt`
- `updatedAt`

### ExternalAgentSession

A session discovered or emitted by an AI tool before, during, or after import
into a Mori session.

Typical fields:

- `id`
- `projectId`
- `connectorId`
- `externalSessionId`
- `moriSessionId?`
- `title`
- `startedAt`
- `lastEventAt`
- `endedAt?`
- `status`: `running` | `idle` | `waitingForUser` | `blocked` | `completed` | `failed` | `unknown`
- `captureFidelity`
- `eventCount`
- `lastKnownSummary`

### LiveEvent

The normalized event unit that feeds both the live UI and the durable timeline.
It should be compatible with `TimelineEvent`, but can exist in a provisional
state before review or persistence.

Typical fields:

- `id`
- `projectId`
- `sessionId?`
- `externalSessionId?`
- `connectorEventId?`
- `occurredAt`
- `receivedAt`
- `type`
- `lane`
- `actor`
- `title`
- `summary`
- `sourceRefs[]`
- `relatedFilePaths[]`
- `trustLevel`: `verified` | `observed` | `inferred`
- `lifecycleStatus`: `captured` | `parsed` | `normalized` |
  `pendingReview` | `accepted` | `rejected` | `redacted` | `superseded` |
  `failed`
- `visibility`: `traceOnly` | `summaryCandidate` | `signalCandidate`

### InsightCandidate

An inferred record produced by a deterministic analyzer or local LLM. It is not
a notification by itself.

Typical fields:

- `id`
- `projectId`
- `sessionIds[]`
- `kind`: `statusSummary` | `decisionCandidate` | `issueCandidate` |
  `nextActionCandidate` | `riskCandidate` | `conflictCandidate` |
  `notificationCandidate`
- `title`
- `body`
- `supportingEventIds[]`
- `confidence`
- `createdByProvider`
- `rank`
- `reviewState`: `candidate` | `accepted` | `dismissed` | `edited`

### NotificationSignal

A promoted signal that passed notification policy.

Typical fields:

- `id`
- `projectId`
- `sessionIds[]`
- `reason`: `needsUserDecision` | `sessionCompleted` | `blocked` |
  `riskDetected` | `conflictDetected` | `longRunningNoProgress`
- `title`
- `body`
- `supportingEventIds[]`
- `severity`: `info` | `attention` | `warning`
- `delivery`: `inApp` | `system` | `digestOnly`
- `createdAt`
- `seenAt?`
- `snoozedUntil?`

## Event Taxonomy

The live model should reuse the existing Timeline lanes where possible.
`TimelineEvent.type` is intentionally broad for UI lanes, so live capture and
analysis should also preserve a more specific subtype.

| Subtype | Lane | Trust | Signal candidate? | Notes |
|---|---|---:|---:|---|
| `session.started` | 대화 | observed | no | Starts or matches an external agent session. |
| `session.finished` | 노트 | observed | yes | Low-noise completion signal. |
| `conversation.user_message` | 대화 | observed | no | Trace event; summary input. |
| `conversation.assistant_message` | 대화 | inferred/observed | no | Depends on capture source and raw policy. |
| `plan.created` | 대화 | inferred | maybe | Signal only if it asks for confirmation. |
| `tool.started` | 명령 | observed | no | Trace only. |
| `tool.finished` | 명령 | observed | no | Trace only unless it represents failure. |
| `command.started` | 명령 | observed | no | Trace only. |
| `command.finished` | 명령 | observed | maybe | Signal only on failure/blocking. |
| `file.changed` | 코드·파일 | observed | maybe | Signal only on risky file or cross-session conflict. |
| `git.diff_captured` | 코드·파일 | observed | no | Summary input. |
| `git.commit_created` | 코드·파일 | observed | maybe | Signal only if session completion/reporting needs it. |
| `research.captured` | 리서치 | observed | no | Summary input. |
| `issue.detected` | 이슈 | inferred | maybe | Needs ranking and evidence links. |
| `decision.proposed` | 검토 | inferred | maybe | Signal only if user confirmation is useful. |
| `decision.confirmed` | 검토 | verified/observed | maybe | Can update summary; notify only for high impact. |
| `review.requested` | 검토 | observed/inferred | yes | Primary notification class. |
| `blocker.detected` | 이슈 | observed/inferred | yes | Needs supporting event and reason. |
| `artifact.created` | 이어가기 | observed/inferred | no | Report/resume input. |
| `note.added` | 노트 | verified/observed | no | User or system note. |
| `summary.updated` | 노트 | inferred | no | Project/session summary refresh. |

Events that should **not** notify in MVP:

- file reads,
- tool starts,
- every assistant message,
- every command success,
- every summary refresh,
- local LLM background runs,
- duplicate imports,
- trace-only connector health changes.

## Pipeline

Live Project Intelligence extends the existing pipeline rather than replacing
it:

```text
Connector / discovery input
  -> RawConnectorEvent
  -> Live Intake Buffer (ephemeral)
  -> parse / validate / deduplicate
  -> provisional LiveEvent
  -> session/project association
  -> pending Import Review
  -> accepted TimelineEvent
  -> insight pass / AnalysisRun
  -> InsightCandidate
  -> notification policy
  -> NotificationSignal / Project Summary / Session Trace
  -> user review and correction
  -> durable Timeline / Project Memory
```

Important boundaries:

- The connector inbox remains file-based and local.
- Live events may appear in the UI before full Import Review, but they must be
  labelled as provisional unless accepted.
- Project-level status can count pending events as "새로 들어온 작업" or
  "검토 대기"; it must not blend them into accepted project memory.
- Project Memory should not treat provisional or inferred records as durable
  accepted memory.
- Every summary or alert must link back to supporting events.
- Incremental analysis runs should be append-only candidates until adopted.

## Status Model

Session and project status need more precision than the current
`recording | analyzing | complete` session lifecycle.

Suggested external session activity status:

- `discovered`
- `following`
- `paused`
- `needsReview`
- `analyzing`
- `blocked`
- `completed`
- `error`
- `unknown`

Suggested project signal status:

- `quiet`
- `active`
- `needsAttention`
- `riskDetected`
- `blocked`

Project status should be derived from session/event states, not set by the LLM
directly. Local LLM output can explain or rank a status, but deterministic
rules should decide promotion order.

## Surface Roles

### Project Workspace

The project workspace is the Summary surface. It answers:

- What is happening in this project right now?
- Which sessions are active, blocked, waiting, or recently completed?
- What changed since the user last checked?
- Which decisions or risks deserve attention?

Suggested top section:

```text
현재 상황
- 2개 세션 진행 중
- 1개 검토 대기
- 최근 결정 후보: 폴백 정책은 fail-closed 우선
- 위험 후보: 두 세션이 같은 gateway 설정 파일을 수정 중
```

Which sessions count is decided by reviewed membership, not by folder name.
For a project in the record kernel, 현재 상황 reads the intake rows of the
project's confirmed sessions (`contextIds`, active descendants rolled up)
through the store's session index. The join is the session's source file as
the discovery listing names it, which is also the follower's `sessionKey`; a
file two members name counts for the project but opens neither. A worktree
session whose agent ran under a parent folder therefore still shows under
its project. Sessions observed in the folder named like the project are
never counted; the section only says how many were recently seen there that
the operator has not placed anywhere (not filed to another project, not
rejected for this one).
Folder groups that have no reviewed membership keep the leaf-name lookup.

Freshness is per row. Each row is judged by its own `observedAt` (the last
time the writer stored that session's rows), so one active session cannot
make another session's old running or waiting request look current; the old
request appears in 최근 작업 without a status. The header dates the counts by
the oldest observation behind them (`countedObservedAt`), so the live dot
appears only when every counted request was seen moments ago, and a running
request not seen moments ago is timed only up to when it was seen.

Session rows should support status-first grouping:

- 진행 중
- 내 확인 필요
- 막힘
- 최근 완료
- 조용함 / 보관됨

### Session `흐름` Tab

The `흐름` tab is the Trace surface. It answers:

- What happened in this session, in what order?
- Which events support this issue, decision, artifact, or next action?
- Where can the user resume, correct, or inspect evidence?

Live additions should stay trace-oriented:

- a running session marker,
- pulsing current event only while active,
- provisional event styling,
- evidence-backed summaries for selected ranges,
- "continue from here" affordance,
- no project-level dashboard cards inside the trace canvas.

### Sidebar and Home

Sidebar and Home should show compact signals only:

- project active count,
- waiting count,
- blocked count,
- latest meaningful update.

They should not show raw streams.

### Notifications

Notifications are Signal only. A notification must answer:

- What needs attention?
- Which project/session does it belong to?
- Why did Mori think it matters?
- What evidence can the user inspect?
- What can the user do next?

## Notification Policy

MVP notification reasons:

| Reason | Allowed delivery | Required evidence | Example |
|---|---|---|---|
| `needsUserDecision` | in-app + optional system | review request, decision candidate, or explicit prompt | "서킷 브레이커 정책 선택이 필요합니다." |
| `sessionCompleted` | in-app + optional system | session end event | "Codex 세션이 완료됐습니다." |
| `blocked` | in-app + optional system | failed command, explicit blocked marker, repeated failure | "테스트 실패로 세션이 멈춰 있습니다." |
| `riskDetected` | in-app by default | inferred risk + supporting observed events | "인증 설정 변경이 테스트 없이 남아 있습니다." |
| `conflictDetected` | in-app + optional system | two active sessions touching related files or decisions | "두 세션이 같은 설정 파일을 수정 중입니다." |
| `longRunningNoProgress` | digest or in-app | active session with no meaningful event after threshold | "45분 동안 진행 신호가 없습니다." |

Policy rules:

- Never notify on trace-only events.
- Never send a system notification for an inferred risk without a supporting
  observed event.
- Batch repeated events from the same session.
- Prefer in-app badges before OS-level notifications.
- Let the user mute a project, connector, session, or notification reason.
- Store the reason code separately from generated notification copy.

## Local LLM Role

Local LLMs should produce insight candidates, not unchecked truth.

Good local LLM tasks:

- session status one-liner,
- project current-state summary,
- decision candidate extraction,
- issue and next-action candidate extraction,
- risk candidate detection,
- conflict explanation after deterministic file/session overlap detection,
- digest generation,
- notification candidate wording.

Guardrails:

- Input should be a compact event digest, not raw transcripts by default.
- Output must be structured JSON matching a typed schema.
- Each inferred item must cite supporting event ids.
- The UI must label inferred records and let the user dismiss or edit them.
- Failed LLM runs should fall back to deterministic summaries where possible,
  and must never invent a successful analysis state.
- LLM cadence should be event-triggered and debounced, not continuous polling.
- OpenAI-compatible endpoints are not automatically local. UI copy and consent
  must distinguish local endpoints from configured remote cloud endpoints.
- Raw prompt text, disclosure level, retention policy, and redaction status are
  separate concerns; do not collapse them into one privacy switch.

Recommended cadence:

| Trigger | Action |
|---|---|
| New significant event | Update session one-liner after debounce. |
| Session idle/completed | Run session insight pass. |
| Project opened | Refresh project summary if stale. |
| Potential signal candidate | Run narrow explanation pass, then apply notification policy. |
| Daily/weekly digest | Batch project summary, never interrupt by default. |

## MVP Scope

The first shippable version should prove that live project awareness is useful
without creating a noisy automation system.

MVP includes:

1. Associate connector/discovery events with a Mori project.
2. Maintain external agent session status: running, waiting, blocked,
   completed, unknown.
3. Add a Live Intake Buffer for foreground followed sessions, producing
   pending review events rather than directly writing durable memory.
4. Show provisional live events in the session trace with clear trust labels.
5. Add a project current-state strip: active sessions, waiting items, blocked
   sessions, latest meaningful update.
6. Generate local/deterministic insight candidates for summary, issue, decision,
   next action, and conflict candidates.
7. Promote only three notification classes at first: needs user decision,
   session completed, blocked.
8. Link every summary and signal back to supporting trace events.

MVP does not include:

- automatic approval of AI actions,
- automatic code modification from Mori,
- cross-agent orchestration,
- reading private/internal app databases,
- notifying on every tool event,
- full raw transcript retention by default,
- cloud sync requirements,
- team/multi-user live presence.

## Review Loop

This feature should be planned through an explicit review loop:

1. **Product brief.** Confirm the product thesis, user problem, surface roles,
   and non-goals.
2. **Event model review.** Validate event taxonomy, trust levels, provisional
   states, and project/session association.
3. **Notification policy review.** Decide which signals may interrupt the user
   and which must stay in-app or digest-only.
4. **Local LLM review.** Check prompts, schemas, fallback behavior, and inferred
   labeling.
5. **UX review.** Walk through project workspace, session `흐름`, sidebar, Home,
   and notification flows with realistic scenarios.
6. **MVP cut.** Remove anything that does not prove live project awareness or
   reduce user uncertainty.
7. **Prototype validation.** Test with at least one connected coding-agent
   project and one multi-session conflict scenario.

Suggested AI review prompts:

- "Review this document for notification fatigue and unclear surface roles."
- "Review the event model for missing states, trust problems, and data-loss
  risks."
- "Review the MVP scope and identify what should be cut before prototype."
- "Review the local LLM plan for hallucination, provenance, and fallback risks."

## Validation Scenarios

### Scenario 1: One session completes

1. User connects a project to a Claude Code or Codex capture path.
2. An external agent session starts, runs commands, changes files, and ends.
3. Mori shows trace events in the session `흐름` tab.
4. Project workspace shows the session as recently completed.
5. Mori sends one completion signal, not a sequence of tool-event alerts.

### Scenario 2: User decision required

1. A session produces two implementation options.
2. Local LLM extracts a decision candidate with supporting events.
3. Notification policy promotes it to `needsUserDecision`.
4. User opens the signal, inspects evidence, accepts/edits/dismisses it.
5. Accepted decision becomes durable project memory.

### Scenario 3: Multi-session file conflict

1. Two active sessions are associated with the same project.
2. Both touch the same file or related config files.
3. Deterministic overlap detection creates a conflict candidate.
4. Local LLM explains the potential conflict using only event summaries.
5. Mori shows an in-app conflict signal with links to both traces.

### Scenario 4: Partial capture

1. A discovery source exposes only a partial transcript.
2. Mori imports it with `captureFidelity: partial`.
3. Project Summary and `흐름` both show the fidelity warning.
4. No alert or report claims the full session was captured.

## Open Questions

- Should provisional live events bypass Import Review visually but require review
  before durable memory, or should every live event wait behind review?
- Can pending events be used as LLM analysis input before user acceptance? If
  yes, how should the output be labelled?
- What is the minimum latency target for "live": under 2 seconds, under 10
  seconds, or refresh-on-open?
- Should project connection be path-based, repository-identity-based, user
  confirmed, or all three?
- How should Mori handle two connectors reporting the same external session?
- Is one Mori session always one external AI conversation, or can a Mori session
  group several external conversations?
- Which notification reasons deserve OS-level delivery by default?
- Should local LLM insight generation run per project, per session, or both?
- How much raw prompt/assistant text should be available when the user chooses
  full retention?
- What is the right UI for muting a connector without disconnecting it?
- When a local LLM is unavailable, which summaries are still valuable through
  deterministic heuristics?
- How should Mori recover from connector file rotation, truncation, partial
  writes, clock skew, duplicate ids, and out-of-order events?
- Should project aggregate timelines include pending/live events as a separate
  layer, or only accepted events?

## Current Planning Decisions

- Use `Signal / Summary / Trace` as the information hierarchy.
- Keep Project Workspace as the project Summary surface.
- Keep Session `흐름` as the session Trace surface.
- Treat notifications as promoted Signals only.
- Treat local LLM outputs as `inferred` candidates with evidence links.
- Start MVP notification scope with decision-needed, completed, and blocked.
- Preserve the existing connector privacy boundary and reviewability principles.
- Treat session-scoped foreground Live Follow as the only live mechanism in the
  first planning slice. **Amended 2026-08-06:** the shipped foreground follow is
  multi-session (`useLiveSessions` discovers and follows the active set), which
  is still foreground-only and still limited to connected sources. See the
  execution plan §3.2. **Amended again 2026-08-07:** observation now runs for
  the whole app rather than only the 세션 screen, behind an opt-in that ships
  off, with an always-visible watching state and a one-tap off. Still bounded to
  a running app; still only connected sources. See the execution plan §9.3.
- Keep project-level live summaries derived from followed/refreshed sessions,
  not from a global background watcher.

## Review Notes From AI Critique

Two independent planning reviews were used to refine this draft.

Product review emphasized:

- The feature should manage attention, not maximize visibility.
- Project Workspace and `흐름` must not collapse into two versions of the same
  log.
- Notification policy should start with user decision, completion, blocked, and
  risk/conflict only after evidence and ranking mature.
- Local LLM output must stay visibly inferred and correctable.

Technical review emphasized:

- Add a Live Intake Buffer before Import Review instead of bypassing the
  existing pipeline.
- Use a separate project connection mapping rather than trusting raw paths or
  `sourceLabel` alone.
- Preserve event subtype and lifecycle state so UI lanes, analysis, and
  notification policy can make different decisions.
- Treat OpenAI-compatible endpoints, raw retention, disclosure, and redaction as
  separate trust/privacy axes.
