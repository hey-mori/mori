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

- **Zone 1 · global nav = jobs, never source types.** Small, fixed.
- **Zone 2 · context navigator**: today it renders projects→sessions; its
  contract is "recent things inside contexts", not "session tree". With K,
  a project folder can grow non-session rows (문서) without touching the
  shell; a different surface could later swap in a different navigator.
- The Context Inspector stays a per-surface rail (existing doctrine: detail
  of the focused thing, never a second workspace).

Rejected alternatives: a second icon-rail column (Linear/Discord style)
costs permanent chrome for zero new capability today, deferred with a
trigger (§10); a Home/Code/Knowledge workspace switcher (navigation by
source type, silo feel; also nothing to remove, it never shipped);
project-first-only (no honest home for personal memory); memory-first-only
(would bury the excellent Code loop).

## 3. Primary navigation (proposal)

Target set, still six items:

| Item | Job | Change |
| --- | --- | --- |
| 홈 | 시작·이어가기·질문 | none |
| 라이브 | 지금 무슨 일이 | none |
| 연동 | 가져오기 (agents · paste · K's text/MD import later) | none now |
| 프로젝트 | 맥락에서 일하기 | none |
| **메모리** | 찾기 · 신뢰 관리 (global search · 최근 · 확인 대기 · scope) | **new** (pending decision) |
| 대시보드 | 현황 개요 | keep; merge candidate later (§10) |

- **워크벤치 leaves the nav** to pay for 메모리: it is officially parked
  (decisions register row 22). Retire, do not delete: reachable via palette.
- **Sources/자료 does not become global nav** now or at K. Capture lives in
  연동; browsing a project's material lives on the project page. A global
  source browser is a post-K decision with a trigger (§10).
- 그래프/새 세션 quick actions, palette-only surfaces (이어가기, Ask Mori,
  통합 검토) stay as they are.

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

**메모리 (global)** · job: find and trust what Mori knows
- objects: accepted + provisional memories across every scope
- left: global nav (no special navigator)
- main: search field · scope chips (전체 · 프로젝트별 · 개인) · recency list
  with kind/status chips (잠정 marker per governance) · 확인 대기 segment =
  the existing consolidation review, now with the provisional queue
- right inspector: provenance panel for the focused memory (evidence refs,
  audit trail, confidence, source sessions)
- actions: confirm · correct · retire · open source
- deliberately absent: authoring, folders, manual organization, memory-kind
  navigation

**프로젝트 페이지** · job: everything about this context in one place
- adds one section with K: **자료** (imported documents/pastes with
  provenance chips), parallel to 세션, never inside the session list
- 기억 section stays; provisional rows show the 잠정 marker
- deliberately absent: a document reading workspace (evidence detail hosts
  reading until K proves more is needed)

**개인 메모리** · job: what belongs to me, not to a project
- not a screen: the 개인 scope chip inside 메모리 (saved expressions land
  here via L2). A Learn surface only on its trigger (§10).

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
| 0 | now | Extract the session tree into a `ContextNavigator` component (zero visual change); this document |
| 1 | after decision + governance build | 메모리 surface (search all · 최근 · 확인 대기 · scope chips) on `listAllAcceptedProjectMemories`; swap 워크벤치 → 메모리 in nav; palette memory group |
| 2 | with L2 | 기억하기 in the Understand panel; 개인 scope visible; expression filter |
| 3 | with K | 연동 text/MD paste-import; project 자료 section; evidence detail hosts reading |
| 4 | post-K review | Dedicated source navigation? 대시보드/홈 merge? second-rail? Decide from observed friction only |

## 8. What is deliberately not done now

No 메모리 nav swap before the standing decision; no empty 자료 sections
before K; no document reader, collections, topics, or Learn surface; no
second rail; no Home redesign; no renaming of shipped Korean labels.

## 9. Decisions needed (user)

1. Approve the target primary nav: 워크벤치 out (palette-only), 메모리 in
   (this operationalizes the standing 메모리 decision).
2. Approve ProjectView 자료 as K's browsing location (vs a global sources
   surface from day one).
3. Approve 대시보드 staying for now with the merge question deferred to
   stage 4 (vs merging into 홈 immediately).

## 10. Validation triggers (deferred choices)

- **Global source browser**: user repeatedly hunts for documents across
  projects after K.
- **Navigator rows for documents**: 자료 section outgrows the page (large
  counts, frequent switching).
- **Learn surface**: saved expressions accumulate + repeat-lookup behavior.
- **Second rail / workspace switcher**: a third context type with its own
  navigator genuinely arrives.
- **대시보드 merge**: 홈 modes absorb the overview cards without loss.
