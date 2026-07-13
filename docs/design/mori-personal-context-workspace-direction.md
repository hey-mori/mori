# Mori as a personal context workspace · direction

> **Superseded in part (same day):** the user rejected the conservative
> execution stance in §4.2 and §5 (instant-save shortcut for user text,
> workout-only pilot framing, memory-screen "narrow and keep" pre-decision,
> one-line storage answer). The revised architecture, with the corrected
> capture-vs-interpretation policy, the generic Record/Schema kernel, the
> Reuse/Adapt/Deprecate/Remove classification, the storage and `.mori` ADRs,
> and the 12-scenario validation, is
> [`mori-context-workspace-architecture.md`](mori-context-workspace-architecture.md).
> Sections 1-3 of this doc (user intent, ChatGPT digest, mockups) remain the
> canonical record of the conversation.

Status: **direction conversation captured 2026-07-14.** The user relayed a
long ChatGPT exchange (three rounds: YouTube-summary feasibility → activity
vs memory correction → Record/Evidence/Obsidian reframe) plus five
ChatGPT-generated concept mockups, and asked Mori's own agent to analyze the
intent, verify it against the repo, and propose the better path. This doc is
that record: §1 the user's intent in their own terms, §2 the ChatGPT proposal
digest, §3 the mockup descriptions (reference only), §4 the repo-grounded
assessment (what is right, what to correct), §5 the phased plan, §6 the open
decisions.

This doc **extends** [`mori-personal-memory-direction.md`](mori-personal-memory-direction.md)
(v3, 2026-07-13). That doc reframed Mori as a personal memory system with a
shared core and source-appropriate experiences; this conversation goes one
level deeper and names the center: **the user's activity ledger, not the AI
session.** Nothing here is implemented yet; the canonical goal doc
([`mori-project-goal.md`](../mori-project-goal.md)) still carries the
session-spine identity and must be rewritten as the first implementation step
(§5 P0).

## 1. What the user actually wants (in their terms)

- Mori should record **what the user did, day by day**, or by project, by
  work-unit, by whatever unit the user defines. Throw Git history at it and
  it reconstructs "on this day I did these things" as work records. Throw a
  blog post at it and it distills knowledge. Throw a YouTube video and it
  extracts lessons and insights. An AI session is analyzed *to record what
  work happened during it*, not because the conversation itself is the unit.
- Uses of the accumulated record: "그때 뭘 했더라", "이 프로젝트를 어떤
  식으로 진행했더라", portfolio material, "그때 뭘 공부했지", ongoing
  context for English study or investing. A second knowledge base plus a
  work-history ledger, auto-collected where allowed.
- **Evidence as a user-facing unit never made sense to the user.** "증거?
  이 단위가 왜 들어갔던 거지?" The origin of a record matters, but the user
  does not manage evidence; Mori shows the origin when asked.
- **Agents and data sources are separate axes.** Agents (Claude / Codex ...)
  are live work environments with sessions. Text, URLs, files, pasted
  ChatGPT logs, Git are input channels. The current 연동 screen treating
  them as one card grid conflates the two.
- Loose natural-language input should be structured automatically: "오늘
  운동 달리기 10분, 팔굽혀펴기 5개 3세트" becomes a formatted workout
  record. A later "달리기 말고 러닝으로 바꿀래" finds and renames it
  everywhere, safely.
- URL input → fetch the page body. Pasted ChatGPT history → summarize what
  the conversation covered. Body text → find the insights inside it.
- The user may have always wanted **an Obsidian-like layer inside Mori**: a
  document format of our own, human-readable and editable, compatible with
  SQLite and with external edits, "진짜 이 안에서 쓸 수 있는" workspace.
- Calendar/journal view: records should land on the day the activity
  happened, which requires distinguishing registered-date from activity-date
  and tracking honestly when the activity date is unknown.

## 2. ChatGPT proposal digest (external reference)

The full transcript lives in the conversation; the durable claims:

1. **Diagnosis.** The Evidence/provenance safety rails (introduced ~2026-05-15
   from the Manus research reconciliation) were correct as rails but wrongly
   became the product's protagonist; the session-spine definition then
   narrowed Mori into an AI-session archive tool. Verified true against
   `mori-project-goal.md` §1 ("spine"/"ribs") and §3 (the loop runs
   Import → Evidence Hub → Memory).
2. **Evidence is a role, not an object.** Replace the Evidence object-unit
   with `Source` + `SourceLink{role: origin|supports|references|contradicts|
   inspired}` against records. Users see "이 기록은 어디서 만들어졌나요?"
   in a record's detail, not an Evidence Hub.
3. **Record as the universal center.** One `Record` object with a `type`
   (activity, daily_entry, project, task, event, note, knowledge, insight,
   decision, workout, study, investment, agent_session, source_document,
   portfolio_item), user-extensible schemas, properties, contexts,
   relations.
4. **Activity vs Durable Memory split.** Activity = fact-and-time ledger
   (무엇을/언제/어디서/무엇이 바뀌었나). Durable memory = distilled
   principles/decisions/knowledge worth keeping long-term. Pipeline:
   Source → Activity → daily/project history → durable memory. Memory is a
   *selection from* activity, not the container of everything.
5. **Three-time model.** `source time` (commit date, publish date) vs
   `activity time` (when the user actually did/studied it) vs `capture time`
   (when it entered Mori). Calendar keys on activity time; unknown dates are
   held honestly ("날짜 확인 필요") and never fabricated.
6. **Work Episode.** A purposeful unit of work ("MORI 메모리 구조 재설계")
   that groups multiple source sessions, commits, docs; one source session
   can also yield multiple activities. Not 1:1.
7. **Context generalizes Project.** project / workstream / topic / area /
   routine / person / custom; an activity can join several contexts with one
   `primaryContext` for calendar/summary.
8. **Entities + aliases** so "달리기 → 러닝" is an ID-stable rename with
   scope choice (display-name only / past text too / this record only), not
   string replacement.
9. **Storage: Markdown + SQLite hybrid.** User-owned content as Markdown
   files in a real folder workspace (Journal/, Activities/, Projects/,
   Knowledge/, Trackers/, Agent Sessions/, Sources/, .mori/ index); SQLite
   as the index/automation layer (FTS, relations, properties, embeddings,
   revisions). Obsidian-compatible front-matter with `mori_version`, `type`,
   `schema`, wiki links.
10. **IA proposal.** 홈 / 오늘 / 캘린더 / 프로젝트 / 지식 / 기록·트래커 /
    에이전트 / 인박스 / 검색; 연동 demoted to settings; 메모리 page removed
    or reduced to an advanced "AI가 기억하는 내용" surface.
11. **Auto-collection policy shift.** From "explicit import only" to "no
    covert collection, but user-connected sources may sync automatically
    within an approved scope", with per-connection scope/pause/history/delete
    and graded automation modes (manual → assisted → connected → auto →
    suggest → auto-record-with-undo).
12. **Content learning (YouTube et al).** Paste-transcript MVP first;
    whisper.cpp for user-owned media second; own-channel OAuth captions
    third; URL auto-extraction as an experiment only. Six-layer output
    (요약 / 주장 / 배울 점 / 실행 / 한계 / 프로젝트 연결), timestamps as
    evidence, explicit vs inferred origin separation, review-gated entry
    into memory.
13. **Keep** SourceRef/provenance/import parsers/dedupe/trust/review/audit/
    SQLite migrations/decision-issue-nextAction extraction; **demote**
    Evidence Hub, evidence-first flows, session-as-center; **add** Record,
    Activity, Journal, Project History, Knowledge, user schemas, trackers,
    entities, Markdown workspace, NL edit commands, inbox.

## 3. The five concept mockups (reference only, do not copy style)

The user provided five ChatGPT-generated screens. Per the user: "이미지는
참고만 해주고 우리는 더 잘 해야 돼." Binary images are not stored in the
repo; these descriptions are the durable record.

1. **홈/오늘 dashboard.** Sidebar 홈/오늘/캘린더/프로젝트/지식/기록·트래커/
   에이전트/인박스/검색/설정 + 집중 모드 toggle + 오늘의 기록 progress.
   Main: "오늘의 컨텍스트" hero (one-line synthesis of today + 업무/학습/
   운동/개인 chips), "오늘 한 일" timeline (09:15 문서 검토 · 11:02 유튜브
   기능 아이디어 · 14:10 영어 복습 · 18:25 운동, each with project/type/
   duration), "배운 점/인사이트" cards with bookmark affordances, 다가오는
   일정 rail, "빠른 기록" free-text box with template chips (일일 회고,
   학습 노트, 운동 기록, 아이디어 스케치), 진행 중 프로젝트 cards with
   progress bars, 오늘의 통계 (완료 활동 4 · 집중 1.3h · 운동 칼로리 ·
   인사이트 3).
2. **인박스.** "빠른 수집" band (텍스트/URL/파일/대화/운동 mode chips, a
   paste area, 붙여넣기/음성/이미지 affordances, 정리하기 CTA). "새로
   들어온 항목" list with per-item status chips (수집 완료 / 분석 중):
   YouTube URL, "mori 최근 커밋 4개 감지" from Git, a pasted ChatGPT
   conversation, a quick workout memo. "정리 제안" rail: typed proposals
   (Activity 제안 / Knowledge 제안 / Workout 제안 / Study 제안) each with a
   one-click "활동으로 저장 / 지식으로 저장 / ..." CTA and 모두 받아 정리.
   "자동 수집 연결 상태" strip (Git · 브라우저 · Claude · Codex · ChatGPT ·
   파일 감시, each 연결됨/수집 대기/일시 정지 + 연결 추가). Right rail:
   "정리 규칙" explaining the auto-conversion targets (활동/지식/작업/일정/
   운동/프로젝트 기록).
3. **프로젝트 상세 (MORI).** Hero: icon, name, one-liner, status chips
   (진행 중 · 로컬 우선 · Tauri · Knowledge Workspace), stat tiles (최근
   활동 168 · 연결된 지식 54 · 결정 18 · 문서 27), 공유 action. Body:
   프로젝트 히스토리 (dated activity timeline, each row with 연결 N개 and
   tag chips), 핵심 결정 as ADR cards (배경/결정/영향 + ADR-005 ids),
   연결된 지식 list, 산출물/포트폴리오 후보 (generated portfolio draft +
   초안 보기 / 이력서용 변환 actions), 다음 작업 checklist with dates.
4. **지식.** Left: note list with 카테고리 (전체 14 / 개념 6 / 프로젝트 4 /
   학습 3 / 템플릿 1) and a 새 노트 action. Center: a full Markdown editor
   (H1/H2/H3, lists, code, quote, table toolbar; 미리보기/편집 toggle) on a
   note titled "활동 중심 메모리 모델" with 개념 chip, structured sections
   (모델 비교 table: Source→Record vs Evidence→Timeline→Memory, 핵심 개념,
   왜 필요한가, 적용 방향), wiki links footer ([[프로젝트:MORI]],
   [[기록 구조]], [[메모리 시스템]]), 저장됨 indicator. Right: 속성 rail
   (유형/관련 프로젝트/작성일/작성자/태그), 연결된 기록 (관련 활동 4 ·
   관련 결정 2 · 관련 프로젝트 1), 참고 자료 (docs URL, Git repo, an AI
   대화, related memos), AI 제안 (요약, 태그 추천, 관련 노트).
5. **에이전트.** Top: one card per agent (Claude · Codex · OpenCode ·
   Cursor · Cline) with 연결됨/연결 안됨, 최근 세션 count, 최근 실행
   relative time. Right rail: 라이브 세션 (a running Claude session with
   단계 7/12 · 메시지 24 · 토큰 18.2k and 세션 열기). Body: 최근 세션
   table (세션 / 에이전트 / 시작 / 소요 / 프로젝트 / 상태), 세션 요약
   panel (무엇을 했나 bullets · 결정한 내용 checklist · 다음 작업 ·
   관련 프로젝트/노트 chips), and a "기록으로 변환" rail: typed extraction
   chips (활동 4 · 결정 3 · 지식 2 · 작업 3) with per-item save/bookmark,
   관두 기록으로 저장.

Style note: the mockups read as a generic bright AI-SaaS dashboard (many
stat tiles, gradient hero, dense widget grid). That conflicts with Mori's
established visual doctrine (calm density, copy-diet, Home as ambient canvas
+ one command input, no overpurpling, InfoHint for explanations). **Adopt
the IA and the object model ideas; keep our visual system.**

## 4. Assessment (repo-grounded)

### 4.1 Where the proposal is right, and confirmed against the repo

- **The diagnosis is factually correct.** `mori-project-goal.md` §1 defines
  the AI conversation as the session spine and everything else as ribs; §3's
  loop runs everything through Evidence Hub toward Memory. The repo's recent
  memory work (governance, provisional status, source families × lenses in
  `mori-personal-memory-direction.md`) has already been pulling away from
  that center; this conversation names the destination.
- **Activity ledger as the missing layer is right.** The user's earlier
  complaints line up: "keyEvidence junk as memory" (2026-07-13) was exactly
  a source pointer masquerading as memory because no activity layer exists
  between sources and memory. Memory-as-distillation-from-activity resolves
  the recurring "이딴 걸 어디다 쓰라는 거야" class of failure structurally.
- **Evidence as relationship, not object.** Correct, and cheap for us: the
  existing `SourceRef` + provenance machinery *is* the relationship layer;
  what changes is the user-facing framing (no Evidence Hub as a destination;
  origin shown contextually). The safety rails the Evidence era introduced
  (review-before-apply, provenance links, trust, honest AI labeling) stay
  as invariants below the surface. They were never the problem; their
  promotion to protagonist was.
- **Three-time model.** Right, and it matches an existing Mori principle
  (honesty; never fabricate). Today the model conflates these (session
  `startedAt`, source `capturedAt`, event `start` exist but are not
  systematically distinguished). Every new record needs
  `occurred / source-created / captured` plus a time-basis + confidence.
- **Agents vs input channels split.** Right. `agentRegistry` + live session
  + work-record discovery already form a coherent agent area; the 연동 grid
  conflating them is presentation debt, not model debt.
- **Content learning plan (YouTube).** The staged plan (paste transcript →
  whisper.cpp for owned media → own-channel OAuth → auto-extract as
  experiment) is the right risk ordering; official-API and ToS constraints
  check out. Six-layer output with timestamp evidence and explicit/inferred
  origin separation matches our provenance doctrine exactly.

### 4.2 Where to correct or resist the proposal

1. **Markdown-canonical storage is the riskiest single item.** Two-way sync
   between user-edited Markdown files and a structured SQLite index is a
   known quagmire (conflict resolution, partial front-matter corruption,
   schema evolution inside files users edit by hand). Obsidian works because
   files are the *only* truth. Mori carries structured data (relations,
   tracker values, entity ids, review states, provenance) that would turn
   front-matter into a machine format humans break by editing. Staged
   recommendation:
   - **Stage 1: SQLite canonical + Markdown mirror (one-way export).** The
     workspace folder exists, is Obsidian-readable, always regenerable.
     Cheap, safe, delivers "my files, readable forever" immediately.
   - **Stage 2: split ownership.** User-authored notes (knowledge, journal
     text) become file-canonical with watched re-import; derived/collected
     records (activities from Git, agent sessions, tracker rows) stay
     SQLite-canonical and mirror out.
   - **Stage 3: full two-way only if real external-edit usage demands it.**
2. **No big-bang rewrite.** The proposal reads like a re-founding; the
   correct execution is a strangler: the session pipeline (import → review →
   timeline → analysis) survives unchanged as *one producer of activity
   candidates*. New capture paths (quick text, URL, paste) are new producers
   into the same Record layer. Nothing existing is deleted (retire-don't-
   delete rule); surfaces are re-rooted.
3. **Memory page: narrow, don't remove.** The recent governance build
   (provisional memory, auto-organize with confirmed-decisions-only,
   reconcile-retire, Ask Mori disclosure) is exactly the durable-memory
   layer this model needs. 메모리 becomes the durable-memory surface;
   the daily record moves to 오늘/캘린더 surfaces that do not exist yet.
4. **Auto-collection: our three rails already answer this.** The
   surveillance-line note (scope · review-gate · transparency) permits
   connected-source background reading. The one boundary to keep: content
   the user personally wrote (a workout memo) saves directly, since there is
   no AI interpretation to review; anything AI-interpreted (Git commits
   merged into a work summary, insights from an article) enters as a
   candidate. ChatGPT's "auto-record with undo" mode is acceptable only for
   the first category.
5. **Trackers: pilot narrow.** Entities + aliases + user schemas are a whole
   platform. Start with one or two fixed schemas (workout, study) to prove
   the capture → structure → rename loop; generalize schemas later.
6. **Home doctrine stays.** The mockup's dashboard home contradicts the
   established Home doctrine (ambient canvas + one ⌘K input). The dashboard
   content belongs to 오늘, a *new* surface, not to 홈.

### 4.3 What survives from today's codebase (verified)

| Today | Role in the new model |
| --- | --- |
| Import parsers (Claude/Codex/ChatGPT/Git/URL/note), dedupe, secret detection | Source layer, unchanged |
| `SourceRef` + provenance + trust + retention | `sources` + `source_links` substrate |
| `TimelineEvent` | Evidence events composing activities; session timeline stays as the agent-session deep view |
| Review-before-apply surfaces | The candidate → confirmed gate for AI-interpreted records |
| Accepted memory + audit + governance (incl. provisional) | The durable-memory layer, as-is |
| `agentRegistry`, live session, work-record discovery | The 에이전트 area, promoted as one of two top-level worlds |
| Project store + synthesis | `Context(type=project)` + project history view |
| SQLite migrations + repositories | Extended with the new tables, not replaced |
| PageShell/ActionBar/InfoHint/inspector primitives | The shell for every new surface |

## 5. Phased plan (strangler order, each phase shippable)

- **P0 · Doctrine (docs only).** Rewrite `mori-project-goal.md` §1/§2/§3
  identity: personal context workspace; activity ledger center; agents and
  input channels as two axes; evidence as relationship; three-time model;
  updated auto-collection policy within the three rails. Update
  `domain-model.md` with Record/Activity/Context sketches. This steers every
  later session and costs nothing to reverse.
- **P1 · Record substrate (model + storage).** New SQLite tables
  (`records`, `record_properties`, `contexts`, `record_contexts`,
  `relations`, `sources`, `source_links`, `revisions`; entities deferred),
  three timestamps + time-basis + review-status on records. TS domain types
  + pure builders + tests. No UI change yet.
- **P2 · Capture + 오늘.** Inbox surface (quick text, URL fetch, paste
  conversation) producing typed record candidates via the existing engine
  seam; direct-save for user-authored text; 오늘/Journal view over the
  activity ledger; workout schema as the tracker pilot. 연동 IA split
  (에이전트 vs 입력 채널) lands with the inbox.
- **P3 · Re-root the session pipeline.** An adapter deriving activity
  candidates from analyzed agent sessions (what the user did during the
  session); project history view over activities; portfolio draft as a
  derivation over project activities.
- **P4 · Knowledge + calendar + Markdown mirror.** Knowledge notes
  (file-canonical experiment per §4.2-1 stage 2), calendar view keyed on
  activity time, one-way workspace export, content-learning (YouTube
  paste-transcript MVP) as an input channel.

Memory governance keeps running through all phases; durable memory consumes
the activity ledger from P3 on.

## 6. Open decisions (need the user)

1. **Storage canonicality** (§4.2-1): staged SQLite-canonical-first
   (recommended) vs Markdown-canonical from day one.
2. **First tracker scope**: work + free-text records first with workout as
   the single tracker pilot (recommended) vs 운동/영어/투자 trio up front.
3. **연동 → 설정 demotion timing**: at P2 with the inbox (recommended) vs
   immediately.
4. **P0 doctrine rewrite approval**: rewriting `mori-project-goal.md`'s
   identity is the one hard-to-reverse step; explicit go-ahead wanted.
