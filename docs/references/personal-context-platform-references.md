# Reference Review · Personal-context / workflow platform open source, 2026-07

| Field | Value |
| ----- | ----- |
| Method | Read-only source inspection of locally cloned repositories (no execution, no modification). Every claim cites a file path. |
| Clone location | `C:\이승원\File\Raw\Memo\` (18 repos, all verified `git status` clean before and after review) |
| Analysis date | 2026-07-15 |
| Trigger | An external design conversation (Personal MCP → family knowledge service → context platform → workflow-first) surfaced these repos as candidate parts or design evidence. This review reconciles them against Mori's actual kernel and invariants. |
| Companion docs | [`../design/workflow-first-direction.md`](../design/workflow-first-direction.md) consumes this review. Mori's non-negotiables: [`../mori-project-goal.md`](../mori-project-goal.md) §6; governing architecture: [`../design/mori-context-workspace-architecture.md`](../design/mori-context-workspace-architecture.md). Sibling landscape docs: [`competitive-landscape-2026-07.md`](competitive-landscape-2026-07.md), [`ai-memory-landscape-reference.md`](ai-memory-landscape-reference.md). |

## TL;DR

None of these projects replaces Mori or should be forked into it. Several
independently converged on the same doctrine Mori adopted 2026-07-14
(content as source of truth, derived data rebuildable, capture cheap and
promotion gated, AI writes attributed and reversible), which is strong
external validation. The durable harvest is five patterns, all
implementable as ordinary SQLite tables and pure helpers:

1. **Intent-level AI tool surface over one shared service layer**
   (Kryton, Kinhold): if Mori ever exposes its ledger to external agents,
   tools express user goals with a read/write scope flag, never file CRUD,
   and the server enforces policy regardless of what the model claims.
2. **Minimal resumable-run ledger** (trigger-dev, LangGraph, Temporal):
   four tables (run / step / snapshot chain / approval waitpoint),
   checkpoint-and-skip resume, an explicit allowed-transition table. No
   replay engine, no queue machinery.
3. **Bi-temporal fact closure** (Graphiti): `valid_at / invalid_at /
   created_at / expired_at` as plain columns; contradiction closes a fact
   with timestamps, never deletes it. Portable without any graph DB.
4. **Memory reconciliation taxonomy** (mem0): the ADD / UPDATE / DELETE /
   NONE decision spec as a rules-first, local-LLM-second seam for the
   Distill stage, plus two cheap tricks (id→integer remapping for small
   models, hash dedup before any LLM).
5. **Content-as-truth + derived facets in a rebuildable JSON column**
   (Memos): Mori already does this; Memos confirms the capture UX ceiling
   (no title, no required fields, one keystroke to commit).

Honesty findings that matter as much as the patterns: Kryton's advertised
Cedar per-note agent permissions are **not in any enforcement path**;
Loopat's documented bwrap read-only sandbox is **actually rw podman with a
git-merge gate**; Supermemory's "engine" is **a closed cloud API, absent
from the repo**; mem0's famous automatic UPDATE/DELETE reconciliation is
**dead code in the current checkout** (the live path is additive + hash
dedup + links). READMEs oversell; code decides.

---

## 1. Kryton · multi-user markdown brain with embedded MCP

**Verdict: REFERENCE** (strongest architecture reference in the set).
Apache-2.0. Real product: ~21k LoC server, 49 test files, 7 Drizzle
migrations, Docker/Helm/operator.

Verified findings:

- **Files are the source of truth; Postgres is a rebuildable projection.**
  `packages/server/src/modules/notes/services/note.service.ts:200`
  (`writeNote`: disk write → history snapshot → index). Postgres holds only
  derived data: `SearchIndex` (generated tsvector column + GIN,
  `db/schema/notes.ts:30-38`), `GraphEdge`, `NoteEmbeddingChunk`
  (pgvector HNSW), `EmbedJob` queue. Mirrors Mori's stance that indexes
  are droppable derivations.
- **Revisions are disk snapshots, not the DB tables.**
  `history.service.ts`: previous content copied to
  `.history/<path>/<timestamp>.md`, pruned to 50. The `NoteVersion` /
  `NoteRevision` tables exist in schema but no application code writes
  them. Do not cite Kryton as a DB-revision reference; Mori's
  `kernel_revisions` is already stronger.
- **MCP embedded in the app server, sharing domain services with REST.**
  `modules/agents/mcp/tools.ts` `executeTool()` dispatches to the same
  `app.notes / knowledge / folders / trash / shares` instances the HTTP
  routes use. Zero duplicated business logic. ~33 hand-written
  intent-level tools (`append_to_note`, `get_daily_note`, `get_backlinks`,
  `list_recent_notes` ...), each tagged `scope: "read-only" |
  "read-write"`, gated once at dispatch (`build-server.ts:76`).
- **Hybrid search in one SQL statement.**
  `modules/knowledge/services/fused-search.service.ts`: 3-layer Reciprocal
  Rank Fusion (ts_rank + best-chunk cosine + 1-hop graph neighbors) with
  per-user weights, graceful lexical-only fallback when the embedder is
  off. The reference file if Mori ever adds an optional vector recall
  layer beside FTS5.
- **Honesty gap: Cedar agent permissions are staged, not enforced.**
  `services/cedar.ts` and `Agent.policyText` exist; `grep` shows
  `app.cedar` / `evaluatePolicy` called from no route or MCP handler. The
  only enforced boundary is the API-key read/write scope. There is no
  persisted audit table; attribution is a WebSocket event origin.

Not taken: multi-user sharing, Yjs collab, k8s operator, the unenforced
Cedar layer, the vestigial revision tables.

## 2. Loopat · context-layer workspace with promotion ladder

**Verdict: REFERENCE.** Apache-2.0. ~19k LoC Bun/Hono server, filesystem +
git, no database (deliberate).

Verified findings:

- **Friction-graded promotion ladder.** `personal/memory/` →
  `notes/` (agent may auto-promote, doctrine-driven, `loops.ts:252`) →
  `knowledge/` (requires a distill loop + human merge). Same shape as
  Mori's auto / provisional / confirm and ledger → distilled layering.
- **Distill loop pattern.** `loops.ts:2466` `distillLoop()`: spawn a
  scoped child agent seeded with a point-in-time snapshot of the source
  conversation plus a kind-specific instruction file. A clean model for
  "turn this trace into proposed records" as a bounded, attributable act.
- **Git as the review substrate.** Knowledge writes land on a
  `loop/<id>` branch; proposals are branches ahead of default;
  review = `git diff`; accept = `--no-ff` merge in a throwaway worktree
  (`loops.ts:2386+`); every UI save is an auto-commit
  (`workspace.ts:vaultWrite`). Mori's `kernel_revisions` covers the same
  job natively, but the "review a promotion like a PR" interaction is a
  good UX reference for the inbox confirm queue.
- **Cache-stable layered context composition.** `compose.ts` +
  `docs/architecture.md`: L1 doctrine → L2 team → L3 project → L4 runtime
  concatenated in a deterministic order to maximize prompt-cache hits.
  Relevant to how Mori assembles agent context (resume prompt, future MCP
  read surface).
- **Honesty gap: the documented sandbox is not the code.**
  `bwrap.ts` does not exist; the implementation is rootless podman with
  `--privileged` (`podman.ts:463` calls itself a "containerized dev env,
  not untrusted-code prison"), and `knowledge/` is mounted **rw**
  (`podman.ts:237-240`); the gate moved to the git merge edge. The
  principle (explicit binds, per-user secret isolation, secrets never
  returned to the browser via `workspace.ts:isSecretPath`) survives; the
  "EROFS read-only mount" claim does not.
- Loop lifecycle is a free-form status string in a JSON file
  (`loop-status.ts`), not a state machine. Not a workflow-engine
  reference.

Not taken: podman sandboxing (wrong shape for a local Tauri app), the
status-string lifecycle, team/multi-user machinery.

## 3. Memos · quick-capture ceiling

**Verdict: REFERENCE.** MIT. Mature (v0.30.0-rc.1), Go single binary.

- **Flat data model, zero frontmatter.** `store/migration/sqlite/LATEST.sql:33-44`:
  the memo row is raw markdown `content` + one derived JSON `payload`.
  No title field, no required metadata.
- **Derived facets are deterministic and rebuildable.**
  `server/runner/memopayload/runner.go` `RebuildMemoPayload()` re-derives
  tags (from `#hashtags`) and properties (`has_link`, `has_task_list`,
  first-H1 title ...) from a real markdown AST parse (goldmark), batch
  re-runnable after parser changes. Mori's schema-driven proposer already
  exceeds this; the batch-rebuild hygiene is the takeaway.
- **Capture is one field + one keystroke.** Persistent editor at the top
  of the timeline; `Cmd/Ctrl+Enter` commit
  (`web/src/components/MemoEditor/Editor/extensions.ts:60-62`). No modal,
  no form. Mori's composer matches this; keep it that way.
- **Single-binary discipline**: embedded frontend (`go:embed`), embedded
  migrations, zero-config SQLite default (`internal/profile/profile.go:110-116`).
- Sanity check: a successful capture product with **no LLM memory
  analysis at all** (only optional audio transcription).

## 4. Supermemory · closed engine behind open clients

**Verdict: REJECT as dependency or fork target; concepts only.** MIT
(clients), but **the memory engine is not in the repo**: every operation
proxies to `https://api.supermemory.ai`
(`apps/web/lib/url-helpers.ts:2`, `packages/tools/src/shared/*`), and both
shipped apps are Cloudflare Workers (`wrangler.jsonc` ×2). It cannot run
fully locally; "self-hostable engine" is not true of this tree.

Concepts worth keeping (from docs + client surface, not runnable code):

- **Static profile vs dynamic recent context as explicit retrieval
  modes** (`packages/tools/src/vercel/memory-prompt.ts:22-46`:
  `profile | query | full`). Mori equivalent: distilled preference/profile
  records vs recent aggregates, two queries over one SQLite store.
- **Updates / Extends / Derives relationship vocabulary** for linking
  supersession as edges instead of destructive overwrites
  (`skills/supermemory/references/architecture.md`). Complements Mori's
  revision + relation model.
- `containerTags` partition key collapses, for Mori, to the existing
  context model.

Also violates two Mori invariants if adopted as-is: embeddings as the
source of truth, and a mandatory cloud service.

## 5. mem0 · reconciliation taxonomy (with a dead-code caveat)

**Verdict: REFERENCE for the decision spec; REJECT as dependency.**
Apache-2.0, v2.0.12.

- **The famous ADD/UPDATE/DELETE/NONE reconciliation prompt exists but is
  dead code.** `mem0/configs/prompts.py:176-295`
  (`DEFAULT_UPDATE_MEMORY_PROMPT`) has zero callers; the live V3 path
  (`mem0/memory/main.py:872-1040`) is additive-only: extract → top-10
  similar → `ADDITIVE_EXTRACTION_PROMPT` ("your sole operation is ADD") →
  MD5 hash dedup (`main.py:976-980`) → insert, with contradiction
  downgraded to `linked_memory_ids`. Explicit `update()` / `delete()`
  remain as public APIs only. Reference the prompt as a **spec**, knowing
  the shipping behavior is add + link.
- **Two cheap tricks that transfer directly to a local-LLM Distill
  stage:** existing-record UUIDs remapped to integer indices before the
  LLM sees them (`main.py:889-894`), and deterministic hash dedup running
  before any model call.
- **SQLite append-only history** (`mem0/memory/storage.py`
  `SQLiteManager`, default `~/.mem0/history.db`): same shape as Mori's
  audit rows.
- Even "local" mem0 requires a vector store (FAISS) plus an embedder and
  LLM (Ollama at minimum); capture cannot function deterministically
  without models. Opposite of Mori's degrade-gracefully rule.

## 6. Graphiti · bi-temporal facts, portable without the graph DB

**Verdict: REFERENCE** (pattern only). The temporal model is fully
separable from the graph engine.

- `graphiti_core/edges.py` `EntityEdge` (line 263): four timestamps,
  `valid_at` / `invalid_at` (event time) and `created_at` / `expired_at`
  (system time), plus `episodes: list[str]` provenance back to source
  episodes (bidirectional via `EpisodicNode.entity_edges`,
  `nodes.py:325`).
- **Contradiction handling splits judgment from application.**
  `utils/maintenance/edge_operations.py`: `resolve_extracted_edge()`
  (line 623) asks the LLM which existing facts are duplicated or
  contradicted; `resolve_edge_contradictions()` (line 538) is pure code
  that closes the older fact (`invalid_at = new.valid_at`,
  `expired_at = now`) and can even birth an incoming fact already-expired
  when a newer fact exists. **Nothing is deleted.** This is exactly
  Mori's "LLM proposes, deterministic policy applies" seam, extended with
  time.
- Requires a graph DB (Neo4j / FalkorDB / Kuzu; Kuzu is embedded but
  needs edge-reification workarounds). Mori needs none of that: the four
  columns + a source join table are plain SQLite.

## 7. Workflow runtimes · Temporal, trigger-dev, LangGraph

**Verdict: REFERENCE** for a minimal run model; **REJECT** all
distributed machinery.

- **Temporal**: the reusable nugget is the explicit allowed-transition
  matrix enforced on every write
  (`service/history/workflow/mutable_state_state_status.go`
  `setStateStatus()`); illegal transitions error. Its deterministic
  event-replay engine exists to resume arbitrary code across worker
  crashes; a single-process app does not need it.
- **trigger-dev** (`internal-packages/database/prisma/schema.prisma`):
  - `TaskRunStatus` (line 1133) splits non-final vs final states
    explicitly; retries are **rows** (`TaskRunAttempt`), not counters;
    idempotency keys with expiry (line 890-893).
  - `TaskRunExecutionSnapshot` (line 1204) is the most transplantable
    idea: an append-only chain (`previousSnapshotId`) of state
    transitions with a human-readable `description` per transition and an
    index for "latest valid". Audit trail + resume pointer in one table.
  - `Waitpoint` (line 1319) with type `MANUAL` + `completedAfter` timeout
    and a `resume_value` payload is precisely a human-approval wait
    state.
  - Ignore: CRIU container checkpoints, queues, worker versioning, the
    dual internal/external status enums, the OTel span store.
- **LangGraph**: checkpoint-snapshot resume with **no replay**
  (`libs/checkpoint-sqlite/.../sqlite/__init__.py:142`: two tables,
  `checkpoints` with `parent_checkpoint_id` chain + `writes` for partial
  step outputs). `interrupt()` / `Command(resume=...)`
  (`libs/langgraph/langgraph/types.py:811/759`) shows the resume
  semantics: the interrupted node re-executes from its start and receives
  the stored resume value. Validates that checkpoint-and-skip is enough
  for Mori.

Synthesized minimal model (if and when Mori needs durable multi-step
runs): four tables, `workflow_run` (status + idempotency key),
`step_run` (attempt rows, output snapshot, apply mode, undo token),
`run_snapshot` (append-only chain with human-readable descriptions),
`approval` (pending / approved / rejected, payload + resume value +
optional timeout). Status flow `PENDING → RUNNING → (WAITING_APPROVAL ⇄
RUNNING) → SUCCEEDED | FAILED | CANCELED`, guarded by a transition table.
Detailed rationale in [`../design/workflow-first-direction.md`](../design/workflow-first-direction.md) §6.

## 8. Kinhold · family hub (license-restricted; two patterns)

**Verdict: REFERENCE** for two patterns; the domain (family/multi-user)
is out of Mori's scope and the license is Elastic 2.0 (no managed-service
resale; do not fork).

- **One MCP tool per domain with an `action` discriminator.**
  `app/Mcp/Tools/KinholdTasks.php` etc.: one tool class per domain, a
  required `action` enum, `handle()` dispatches via `match()`. Keeps the
  tool schema surface small for the model. `RequiresModule` hides a
  tool's schema entirely when the module is off.
- **The model is an untrusted client; policy is enforced server-side.**
  `app/Mcp/Tools/Concerns/ScopesToFamily.php` re-fetches every row scoped
  to the caller and authorizes through the same Policy classes the REST
  controllers use (14 policies). The AI supplies only an action string
  and ids; it cannot bypass authorization. This is the posture Mori's
  future agent surface must take.

## 9. Paperless-ngx · intake honesty

**Verdict: REFERENCE** (one pattern). GPL-family license (verify before
any code reuse; not needed since we take no code).

`src/documents/consumer.py` + `tasks.py`: the original file is copied and
preserved untouched (checksum for dedup, `original_filename` kept), all
display artifacts are derived; every background job is a durable
`PaperlessTask` row with `Status` × `TaskType` × `TriggerSource`
(scheduled / web_ui / api_upload / folder_consume / email_consume).
Mori's raw-retention invariant already matches the first half; the typed
trigger-source on background work is worth copying when the background
watcher grows.

## 10. Khoj, Open WebUI, AnythingLLM, Nextcloud, n8n, Windmill

- **Khoj** (AGPL): one useful seam, `send_message_to_model_wrapper` in
  `src/khoj/routers/helpers.py` routing all callers through a single
  provider abstraction with fallback across models. Mori's
  `quickPassProvider` seam is already equivalent. Cron automations
  (APScheduler + stored query) conflict with Mori's no-scheduled-jobs
  posture for interpretation. **REFERENCE-light.**
- **Open WebUI** (custom license) / **AnythingLLM** (MIT): multi-user
  chat and RAG workspaces; nothing novel for a single-user record ledger.
  **REJECT.**
- **Nextcloud** (AGPL): heavyweight multi-user groupware; irrelevant.
  **REJECT.**
- **n8n** (fair-code) / **Windmill** (AGPL): only harvest, n8n's small
  terminal-status union (`packages/workflow/src/execution-status.ts`) and
  Windmill's in-flight `queue` vs immutable `completed_job` table split
  (`backend/migrations/20220123221903_first.up.sql`). **REFERENCE-light.**

---

## Verdict matrix

| Repo | Relevance | Verdict | Take | License |
| --- | --- | --- | --- | --- |
| kryton | high | REFERENCE | shared service layer under REST+MCP; intent-level scoped tools; RRF hybrid search; files-truth/DB-projection | Apache-2.0 |
| loopat | high | REFERENCE | promotion ladder; distill-loop pattern; review-like-a-PR UX; cache-stable context layering | Apache-2.0 |
| memos | med | REFERENCE | capture ceiling; derived-payload rebuild hygiene | MIT |
| supermemory | med | REJECT (dep) / concepts | profile-vs-recent retrieval modes; Updates/Extends/Derives vocabulary | MIT (clients only; engine closed) |
| mem0 | med | REFERENCE (spec) / REJECT (dep) | ADD/UPDATE/DELETE/NONE taxonomy; id→int remap; hash dedup; SQLite history | Apache-2.0 |
| graphiti | med | REFERENCE | bi-temporal columns + contradiction closure, no graph DB needed | Apache-2.0 |
| temporal | low | REFERENCE | allowed-transition table only | MIT |
| trigger-dev | med | REFERENCE | snapshot chain; MANUAL waitpoint; attempt rows; idempotency keys | Apache-2.0 |
| langgraph | med | REFERENCE | checkpoint-and-skip resume; interrupt/resume semantics | MIT |
| kinhold | low | REFERENCE | action-discriminator MCP tools; server-side policy vs untrusted model | Elastic 2.0 |
| paperless-ngx | low | REFERENCE | immutable original + typed task ledger | GPL-family |
| khoj | low | REFERENCE-light | single provider seam (already have) | AGPL-3.0 |
| open-webui | none | REJECT | none | custom |
| anything-llm | none | REJECT | none | MIT |
| nextcloud | none | REJECT | none | AGPL-3.0 |
| n8n | low | REFERENCE-light | terminal-status union | fair-code |
| windmill | low | REFERENCE-light | queue vs completed_job split | AGPL-3.0 |

No repo earns ADOPT, ADAPT, or FORK: Mori's kernel already implements the
load-bearing parts (records, revisions, provenance, apply policy, FTS),
every candidate engine either violates an invariant (cloud, embeddings
canonical, multi-user) or is thinner than what Mori has, and the patterns
above are small enough to implement natively where and when they earn
their place.
