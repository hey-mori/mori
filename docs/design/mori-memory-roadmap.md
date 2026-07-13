# Mori memory-system roadmap · execution plan

Last validated against code at commit `d410727` (2026-07-13).

This is the single **execution view** of the remaining work for Mori as a
personal memory system: what works today, what is next, what waits, and the
legacy audit. It is the status/sequencing layer, not the strategy. The model
and rationale live in the design docs it links; open decisions live in the
register. Do not duplicate those here, and do not reopen settled questions
(§4) without code evidence.

- Model / concept: [`mori-personal-memory-direction.md`](mori-personal-memory-direction.md)
- Shell / navigation: [`mori-product-shell-ia.md`](mori-product-shell-ia.md)
- Accepted decisions: [`key-decisions-register.md`](key-decisions-register.md) (row 26)
- Production readiness (separate axis: gates, distribution): [`../production-program.md`](../production-program.md)

Legend: **shipped** · **shipped·unvalidated** (works in build/tests, not yet
confirmed on real desktop data) · **partial** · **planned**.

## 1. What Mori actually does today (verified)

- **Capture**: native agent session readers (Claude Code / Codex / Cursor /
  Cline / Continue / OpenCode / Antigravity), connector JSONL inbox, paste
  import, git diff. No file / Markdown / PDF ingestion yet. *(fact)*
- **Analysis**: Quick Pass (규칙 기반 · Ollama · OpenAI 호환) extracts
  issues / decisions / next-actions per session.
- **Memory proposals** (`consolidationProposals.ts`): now **decisions** +
  **genuinely cross-session recurring issues** + **standing risks** only.
  Key-evidence pointers, single-session issues, and next-actions no longer
  become memory proposals. *(shipped, d410727 / d16c9e2)*
- **Governance / auto-organize**: default mode `auto`. A **confirmed**
  decision (confidence 0.85) auto-organizes into **provisional** memory when a
  project's memory is viewed; everything else (unconfirmed decisions, recurring
  issues, risks, contradictions) goes to review. A reconcile pass retires
  provisional memory of kinds no longer auto-organized. *(shipped·unvalidated,
  bf0b24d)*
- **Provisional status**: recallable + marked, `resumeEligible = false`,
  `reportEligibility = excluded` (never crosses an external boundary),
  reversible, audited (`autoOrganize` / `auto-policy`).
- **Global Memory hub** (메모리 nav): search all scopes, 전체 / 현재 / 잠정 /
  관찰 중 / 확인 필요 / 보관됨 segments, per-project scope chips, provenance
  inspector, deep-link to project memory. *(shipped, browser-verified with
  seeded data)*
- **Project memory + consolidation review**: per-project overview + the
  review surface (5-button 수락 / 편집 / 관찰 / 연기 / 폐기).
- **Recall**: Ask Mori (deterministic search + optional LLM over accepted
  memory); cross-project enumeration (`listAllAcceptedProjectMemories`)
  shipped; resume prompt; reports; `.mori` export.
- **Understand**: select text in the session 활동 stream → 이해하기 chip →
  Context Inspector shows 번역 / 의미 / 표현 / 뉘앙스, engine via the Ask Mori
  prose port, honest "엔진 없음" state. Read-only (no save). *(shipped,
  browser-verified)*
- **Shell**: sidebar zone 1 = global job nav (홈 · 라이브 · 연동 · 프로젝트 ·
  메모리 · 대시보드 · 워크벤치), zone 2 = `ContextNavigator` (session tree);
  ⌘K palette searches every session.
- **Scopes**: session and project are real; personal scope is a reserved id
  in design, not yet wired for saving.

## 2. Now · make the current loop coherent and trustworthy

**N1 · Provisional reads honestly. *(shipped, this pass)*** The project
"확정 메모리" card counted/listed provisional memory and its lifecycle strip
showed it as 관찰 중. Fixed: provisional is filtered out of the confirmed-memory
card (list, count, strip, empty state), since 확정 = confirmed; provisional
stays fully visible in the global hub under 잠정. Remaining edge: the detail
drawer's lifecycle label still defaults provisional to 관찰 중 if a provisional
memory is deep-linked (it no longer reaches the drawer from the card) — minor,
deferred.

**N2 · Validate the memory hub + auto-organize on real SQLite.** Value: the
whole governance fix is `shipped·unvalidated` (demo disables consolidation, so
the auto path can only be seen on real desktop data). Risk: real proposals may
surface a kind or quality issue the fixtures miss. Smallest step: on desktop,
open a project's 프로젝트 메모리, confirm 메모리 hub 잠정 = confirmed decisions
only and the key-evidence junk retired. Done when the hub is clean on real
data. **Needs user** (only the user has the data).

**N3 · Ask Mori + search disclose provisional.** Value: the governance
visibility rule (provisional must be marked wherever it appears, and
Ask Mori must disclose when an answer leaned on it). State: partial (hub marks
it; Ask Mori and search do not). Smallest step: exclude/rank provisional in
`queryableMemory` and add a "잠정 포함" disclosure to Ask Mori answers. Done
when a provisional-derived answer is visibly flagged and filterable. Minor
decision only.

**N4 · Governance mode as a real setting.** Value: the mode is a default-auto
constant, not user-settable; reversibility should be a control, not a code
edit. Smallest step: a settings toggle (자동 저장 / 항상 확인 / 수집만) bound
to `QuickPassAnalysisSettings`. Done when the user can switch modes and it
takes effect. Default stays `auto` (decided).

**N5 · Reframe consolidation review as the exception queue.** Value: the
5-button 수락/편집/관찰/연기/폐기 model is the review-fatigue surface; with
auto-organize live, this screen should read as "확인이 필요한 항목" with a
simple [반영] [수정] [무시] and advanced states under 더보기. State: legacy
(review-first UI). Risk: it is a real UX change; keep the advanced controls
reachable. Smallest step: relabel the surface + collapse the rare actions.
**Needs user** (approve the simplified control model).

## 3. Next · validate once the loop is stable

**X1 · Understand → Remember (L2).** Value: turn a selection explanation into
a saved `expression` / `correction` memory with provenance to the source
event; the first non-code memory kind. Depends on: personal scope (X2), a new
memory kind. Risk: low. Smallest step: a 기억하기 button in the Understand
panel that persists through the existing lifecycle. **Needs user**: the L2
trust rule (does an explicitly-saved expression confirm directly, skipping
provisional?). Done when a saved expression appears in 메모리 with provenance.

**X2 · Personal scope wired.** Value: memory that belongs to no project (saved
expressions, general facts) has an honest home. Depends on: reserved-scope id
approach (design accepted). Smallest step: a save destination "프로젝트에
연결하지 않음" + a 개인 chip in the hub. Done when personal-scope memory is
saveable and filterable, never shown as a fake project.

**X3 · K · first non-session text source.** Value: prove a non-code source can
enter honestly, share the lifecycle, and be recalled with citations. The
architectural experiment. Depends on: the `SourceRef.sessionId` seam.
**Needs user** at the checkpoint: non-session capture identity (hidden capture
record, recommended, vs a minimal sessionless-evidence change). Smallest step:
paste text/MD → evidence with provenance on a chosen project → sparse distill →
Ask Mori answers from it with a citation. Done when that flow works end to end
without a fake session.

**X4 · Recall across code + imported evidence.** Value: one question reaches
coding memory and imported material together. Depends on: X3 + cross-project
enumeration (shipped). Mostly falls out of X3.

## 4. Later · wait for evidence (triggers, not dates)

- Document reading / source-navigation surface. Trigger: K shows the evidence
  tab straining.
- PDF text extraction. Needs the §14 non-goal narrowed to document text.
- Learn surface for saved expressions. Trigger: expressions accumulate plus
  repeat-lookup behavior.
- Topic views over memory; global source browser; OS-level selection capture
  (consent-gated); embeddings **over accepted memory only**; MCP memory
  exposure; sync.

## 5. Deferred / rejected (do not spend effort)

- Code / Knowledge / Language as separate products, databases, or top-level
  navigation. *(rejected)*
- "Wiki" as a commitment; a document manager / note app. *(rejected; generated
  topic summaries over memory remain a possible Later output)*
- Fake sessions for documents. *(rejected)*
- A policy engine / per-source × per-kind matrices. *(rejected; one mode + fixed
  exceptions)*
- Embeddings as source of truth; image / audio / video ingestion. *(non-goals)*
- Auto-organizing recurring issues until cross-session detection is trusted.
  *(deferred)*

## 6. Legacy & cleanup audit

| Finding | Class |
| --- | --- |
| ~~Provisional shown as 관찰 중 in project MemoryView~~ (N1, fixed this pass) | **done** |
| 5-button consolidation review vs exception queue (N5) | **migrate later** (needs decision) |
| `featureStatus.ts` has no rows for provisional / auto-organize / memoryHub / Understand | **migrate later** (update registry) |
| `roadmap.md` still describes the 4-tab 홈·소스·대시보드·워크벤치 nav (superseded by the shipped shell) | **fix** (mark superseded, point to shell-ia) |
| `keyEvidence` still a valid `StoredAcceptedProjectMemory` kind (existing memories render; no new proposals) | **harmless compatibility** |
| `unresolvedRisk` + `recurringIssue` can both fire for the same issue (review-queue redundancy) | **migrate later** |
| Retired `EvidenceView` / `ReviewView` reachable via stale tab keys | **harmless compatibility** (retire-not-delete) |
| `aggregateKeyEvidence` / view-model `keyEvidence` field still computed, now only feeds the (unbuilt) proposal path | **remove** when convenient (dead-ish) |

## 7. Product questions · answered vs open

**Answered (do not reopen without code evidence):**
- Memory = distilled assets (decisions, recurring issues, risks, later
  expressions). Evidence pointers, next-actions, and single-session issues are
  NOT memory.
- Only **confirmed decisions** auto-organize today.
- Provisional = auto-created, marked, recallable, never external, reversible.
- One product; Code/Knowledge/Language are capabilities over one store.
- Navigation is job-based and flat; 메모리 is a primary destination.

**Open (need the user):**
- Consolidation-review simplification (N5).
- L2 trust rule (X1).
- Non-session capture identity (X3).
- When a document experience is justified (post-K trigger, §4).

## 8. Decisions that genuinely need the user

1. **N5** approve reframing 메모리 통합 검토 as an exception queue with
   simplified [반영] [수정] [무시] controls (advanced states under 더보기)?
2. **X1** should an explicitly user-saved expression confirm directly,
   skipping the provisional step?
3. **X3** for the first non-session source, hidden capture record
   (recommended) or a minimal sessionless-evidence model?

Everything in §2 except N5 is low-risk and needs no decision; N2 is a
validation only the user can run.
