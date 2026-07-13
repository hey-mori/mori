# Mori product shell and information architecture · proposal

Status: **proposal, 2026-07-13**, the layout plan for the accepted
personal-memory direction ([`mori-personal-memory-direction.md`](mori-personal-memory-direction.md)).
Marked per section: **fact** (current code), **proposal**, **deferred**.
Decisions that need the user are collected in §9; nothing here is in the
decisions register yet.

## 1. Diagnosis of the current shell (fact)

The shell is a two-region grid: one 256px sidebar + workspace. The sidebar
stacks, top to bottom: quick actions · 6-item global nav (홈 라이브 연동
프로젝트 대시보드 워크벤치) · search · **the project→session tree** (flex:1,
visually dominant) · user button. Session Detail is a tight breadcrumb + 4
tabs (개요 활동 분석 공유) with the Context Inspector rail on 활동.
ProjectView is already a context hub (state strip · pulse · synthesis ·
sessions · 이 프로젝트가 기억하는 것). Memory is palette-only and
project-scoped; no global memory surface exists. A "Home / Code" switch
**does not exist in code**; Home is one command-first surface.

What is durable and what is not:

| Element | Verdict |
| --- | --- |
| Two-region shell, collapsible sidebar, no top bar | Durable |
| Command palette as the keyboard front door (⌘K/⌘P) | Durable |
| Session Detail (breadcrumb + 4 tabs) and the BaseInspectorPanel rail | Durable |
| ProjectView as a sectioned context hub | Durable, and the K extension point |
| One sidebar hosting BOTH global nav and the session tree with no boundary | The core debt: the persistent navigation object of the whole app is "AI session", which is exactly the Code-only feel |
| 대시보드/홈 overlap; 워크벤치 parked but holding a nav slot | Cleanup candidates |
| Memory buried (palette-only, project-scoped) | Contradicts the memory-system identity |

## 2. Shell model (proposal)

Keep one sidebar, but give it **two explicit zones with a hard component
boundary**:

```
┌──────────────┬──────────────────────────────┬───────────────┐
│ SIDEBAR      │  WORKSPACE                   │ (per-surface) │
│              │                              │ Context       │
│ zone 1       │  breadcrumb / tabs           │ Inspector     │
│  global nav  │  main content                │  detail of    │
│  (jobs)      │                              │  the focused  │
│ ──────────   │                              │  thing only   │
│ zone 2       │                              │               │
│  CONTEXT     │                              │               │
│  NAVIGATOR   │                              │               │
│  (recents in │                              │               │
│  context)    │                              │               │
└──────────────┴──────────────────────────────┴───────────────┘
```

- **Zone 1 · global nav = jobs.** Small, flat. Source-type destinations
  (자료/라이브러리) are not forbidden forever, they are **unproven today**:
  "browse what I saved" can become a genuine job once documents actually
  flow; the §10 triggers decide, not a standing rule. The palette
  supplements navigation, it never substitutes for discoverability: a
  capability users should find stays visible, and an item leaves the nav
  only because its job is redundant or contextual, never to keep a count.
- **Zone 2 · context navigator**: the shell's slot for **source-appropriate
  local navigation**. Today it hosts the project→session navigator; a
  future surface may provide a different navigator (documents, sources,
  scopes) behind the same boundary. It is not permanently "a recent list",
  and none of those future navigators are built before their content
  exists.
- The Context Inspector stays a per-surface rail (existing doctrine: detail
  of the focused thing, never a second workspace).

Rejected alternatives: a second icon-rail column (Linear/Discord style)
costs permanent chrome for zero new capability today, deferred with a
trigger (§10); a Home/Code/Knowledge workspace switcher (navigation by
source type, silo feel; also nothing to remove, it never shipped);
project-first-only (no honest home for personal memory); memory-first-only
(would bury the excellent Code loop).

## 3. Primary navigation (accepted 2026-07-13, shipped)

Flat seven items, no labeled groups (grouping adds interpretation the
current count does not need; a bottom management zone for 연동/설정 stays a
later option if the list grows):

| Item | Job | Status |
| --- | --- | --- |
| 홈 | 시작·이어가기·질문 | unchanged |
| 라이브 | 지금 무슨 일이 | unchanged |
| 연동 | 외부 시스템·에이전트 연결 관리 | unchanged; see the import note below |
| 프로젝트 | 맥락에서 일하기 | unchanged |
| **메모리** | 찾기 · 신뢰 관리 (global search · lifecycle · scope · provenance) | **shipped** |
| 대시보드 | 현황 개요 | keep; merge candidate at stage 4 (§10) |
| 워크벤치 | own evaluation pending | **stays visible**: a usable capability is not hidden to keep a count; it leaves only if its job proves redundant or contextual (evaluation criteria in §10) |

- **연동 ≠ 가져오기.** 연동 manages connected systems (agents, accounts,
  folders). Direct capture (텍스트/Markdown 붙여넣기, file, URL) is a
  **global action** surfaced contextually (홈, 프로젝트, ⌘K), with its own
  user-facing language; it currently rides the 연동 paste tab technically,
  but its copy and flow must read as 가져오기, not integration setup.
- 그래프/새 세션 quick actions, palette-only surfaces (이어가기, Ask Mori,
  통합 검토) stay as they are. The 최근 작업 label + hairline visually
  separates the context navigator from the global nav (shipped).

## 4. Screen hierarchy and responsibilities (proposal)

```
홈                 command field · modes (찾기/묻기/…)
라이브              merged live feed (unchanged)
연동                capture surfaces (+ 텍스트/문서 붙여넣기 with K)
프로젝트            all-projects browser
  └ 프로젝트 페이지   context hub
      sections: 현재 상황 · 활동(pulse) · 세션 · [자료 with K] · 기억
      └ 세션         Session Detail: 개요 | 활동 | 분석 | 공유
메모리 (new)        global memory
  segments: 전체 검색 · 최근 · 확인 대기 · scope 필터(프로젝트/개인)
대시보드            overview cards (unchanged)
```

Per-screen contracts (only where something changes):

**메모리 (global)** · job: find and trust what Mori knows · **v1 shipped**
- objects: accepted memories across every scope (provisional joins with the
  governance build)
- main (shipped): search (ranked by `searchAcceptedMemories`) · lifecycle
  segments reusing the canonical vocabulary (전체 · 현재 · 관찰 중 · 확인
  필요 · 보관됨) · scope chips per project (개인 joins with L2) · honest
  storage-source note
- right inspector (shipped): provenance panel (kind, lifecycle badge,
  confidence + rationale, evidence-ref/source-session/audit counts, review
  note) + deep link 프로젝트 메모리에서 열기
- **확인 필요 and 잠정 are distinct states and stay distinct segments**:
  확인 필요 = review outcomes on durable memory (stale · contradicted, and
  later the always-ask exception queue); 잠정 = automation already created
  it, unconfirmed. They are never merged into one queue, because "already
  in use" and "not yet memory" must not read the same.
- deferred to governance build: 잠정 segment, confirm/correct/revert
  actions in place (today they deep-link to the project's consolidation
  surface, read-only here)
- deliberately absent: authoring, folders, manual organization, memory-kind
  navigation, memory graphs

**프로젝트 페이지** · job: everything about this context in one place
- adds one section with K: **자료** (imported documents/pastes with
  provenance chips), parallel to 세션, never inside the session list
- 기억 section stays; provisional rows show the 잠정 marker
- deliberately absent: a document reading workspace (evidence detail hosts
  reading until K proves more is needed)

**개인 메모리** · job: what belongs to me, not to a project
- not a screen, but **not hidden either**: discoverable through the 메모리
  scope chips, global search, the save-destination choice ("프로젝트에
  연결하지 않음") when L2 lands, and palette search. Never presented as a
  fake normal project; the reserved-scope implementation stays revisitable
  after K. A Learn surface only on its trigger (§10).

**Understand (shipped, fact)** · selection in a reading surface → floating
이해하기 chip → result in the Context Inspector (번역 · 의미 · 표현 ·
뉘앙스; honest 엔진 없음 state). L2 adds 기억하기 inside the same panel.

**K experiment host**: 연동 paste tab (text/MD) → evidence on a chosen
project → project 자료 section + Ask Mori citations. A validation host,
explicitly not the permanent document experience.

## 5. The five flows (proposal)

1. **Continue coding work**: 홈 → 이어가기 (or sidebar recent row) →
   Session Detail 개요 (decisions, unfinished work, resume prompt) → 활동
   for the exact trace → copy resume command / resume prompt. Unchanged
   today; 메모리 adds "why did we decide X" lookups mid-flow.
2. **Understand selected language**: any reading surface → select → 이해하기
   chip → inspector shows translation + contextual meaning + expressions →
   (L2) 기억하기 → saved as expression memory (개인 scope) with provenance
   to the event. Shipped through the chip; saving pending L2 decisions.
3. **Bring in a non-session source (K)**: 연동 → 붙여넣기 (텍스트/Markdown)
   → choose project (or 개인) → evidence with provenance → appears in the
   project's 자료 section → Ask Mori answers with a citation → sparse
   memory proposals flow through governance like any other.
4. **Recall across contexts**: ⌘K → typed query reaches sessions (shipped)
   and memories (global surface / palette memory group once 메모리 lands);
   or 메모리 → search all scopes; every result carries scope + status
   (잠정/확정) so trust is visible at the row level; Ask Mori discloses when
   an answer leans on provisional memory.
5. **Project with mixed evidence**: project page reads top to bottom as
   현재 상황 → 활동 → 세션 → 자료 → 기억. Sessions and documents are
   sibling sections, never one tree; memory cites both; the sidebar
   navigator keeps showing sessions (documents live on the page until real
   usage demands navigator rows).

## 6. Answers to the fifteen questions (condensed)

1 Home/Code switch: does not exist; do not create it. 2 Primary nav: §3.
3 메모리 primary: yes, pending the standing decision. 4 Sources global: no;
연동 for capture, project page for browsing; revisit post-K. 5 Session
tree: becomes the context navigator (zone 2), a boundary, not destinations.
6 Left side: one sidebar, two zones with a hard component boundary; second
rail rejected for now. 7 Project navigation: sectioned hub, gains 자료 with
K. 8 Mixed project: yes, sibling sections. 9 Personal info: 개인 scope chip
in 메모리, never a fake project. 10 Contextual actions: selection chip +
palette verbs; 기억하기 joins the chip cluster in L2. 11 Inspector: detail
of the focused thing per context (event · selection · source · review ·
memory provenance). 12 Global vs project recall: 메모리/⌘K = global with
scope labels; project page 기억 = scoped view of the same store. 13
Provisional: one 확인 대기 badge inside 메모리 + row markers; no toasts, no
nav item. 14 Anticipated for Knowledge: 연동 import seam, project 자료
section, navigator row contract, scope model. 15 Triggers: §10.

## 7. Migration stages (proposal)

| Stage | When | Work |
| --- | --- | --- |
| 0 | **shipped** | `ContextNavigator` boundary (zero visual change); this document |
| 1 | **shipped (v1)** | 메모리 in primary nav (워크벤치 kept, per the user's discoverability call); global memory surface on `listAllAcceptedProjectMemories` (search · lifecycle segments · scope chips · provenance inspector); 최근 작업 navigator label; palette 메모리/프로젝트 메모리 entries |
| 1b | with governance build | 잠정 segment (distinct from 확인 필요) + in-place confirm/correct/revert; palette memory-search group |
| 2 | with L2 | 기억하기 in the Understand panel; 개인 scope chip + save destination; expression filter |
| 3 | with K | 가져오기 (text/MD paste-import, capture language distinct from 연동); project 자료 section; evidence detail hosts reading |
| 4 | post-K review | Global source navigation? 대시보드/홈 merge? 워크벤치 verdict? second rail? Decide from observed friction only |

## 8. What is deliberately not done now

No 메모리 nav swap before the standing decision; no empty 자료 sections
before K; no document reader, collections, topics, or Learn surface; no
second rail; no Home redesign; no renaming of shipped Korean labels.

## 9. Decisions

Decided 2026-07-13 (user): 메모리 joins primary navigation; **워크벤치 stays
visible** (discoverability beats item count; it moves only on a job-based
verdict); flat navigation, no labeled groups; project 자료 is K's first
validation host, explicitly not a rejection of a global source experience;
대시보드 stays with the merge question deferred to stage 4.

Open: none blocking. The 워크벤치 verdict and the 대시보드/홈 distinction are
stage-4 evaluations against real usage (§10).

## 10. Validation triggers (deferred choices)

- **Global source/자료 experience** (post-K, several of): project-independent
  sources appear often; the same source is used by several projects; users
  want one place to browse all imported material; source volume outgrows
  project-level navigation; importing/managing sources becomes a repeated
  independent job.
- **워크벤치 verdict**: does it host a recurring, distinct job no other
  surface covers? If yes it stays; if its role is redundant with
  프로젝트/대시보드 or purely contextual, it moves to the palette for that
  reason.
- **Navigator adapters** (documents, scopes): a surface actually needs a
  non-session local navigation structure; build the adapter then, behind the
  existing `ContextNavigator` boundary.
- **Learn surface**: saved expressions accumulate + repeat-lookup behavior.
- **Second rail / workspace switcher**: a third context type with its own
  navigator genuinely arrives.
- **대시보드 merge**: 홈 modes absorb the overview cards without loss, and
  the 시작/현황 job distinction proves unclear in practice.
