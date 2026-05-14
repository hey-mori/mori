# Mori Product Screen Prompts

This document preserves the original product/design prompts used to generate Mori screen reference images. These prompts are reference material for future UI implementation and should not be interpreted as implemented behavior.

## 1. Evidence Hub

**Screen purpose:** Central source management surface for explicit user-added evidence.

**Key UI requirements:**
- Available source cards for AI Transcript, Git Diff, Manual Note, URL/Web Page, and Repository Git.
- Planned connector cards clearly marked as planned.
- Selected source provenance detail panel.
- Status, capture method, raw data policy, trust level, and privacy note on source cards.

**Privacy/product constraints:**
- Explicit user import only.
- Planned connectors must not look active.
- No background app, browser, terminal, or filesystem capture.

<details>
<summary>Original prompt text</summary>

```text
Mori의 Evidence Hub 화면 예상 이미지를 만들어줘.

스타일은 기존 Mori 시안과 동일하게 해줘:
- 좌측 사이드바
- 흰색/연회색 기반의 깔끔한 생산성 앱 UI
- 보라색 accent
- Linear, Notion, Figma, Apple 생산성 앱 같은 차분하고 고급스러운 느낌
- 카드 기반 레이아웃
- 한국어 UI

화면 목적:
Mori가 Claude, Codex, ChatGPT, Git diff, URL, Manual Note, Repository 같은 작업 소스를 사용자가 명시적으로 가져오는 중심 화면.

포함할 요소:
- 페이지 제목: Evidence
- 설명: 작업을 복원하는 데 사용된 소스와 근거를 관리하세요.
- 상단 액션: + 소스 추가
- Available now 섹션:
  - AI Transcript
  - Git Diff
  - Manual Note
  - URL
  - Repository Git
- Planned connectors 섹션:
  - Claude Code Hook
  - Codex CLI Import
  - VS Code
  - Cursor
  - Terminal
  - Browser Extension
  - Slack / Notion / Figma
- 각 카드에는 status badge, capture method, raw data policy, trust level, privacy note가 보이게 해줘.
- 오른쪽 패널에는 선택된 source의 provenance detail이 보이게 해줘.
- planned 항목은 실제 연결 버튼처럼 보이지 않고 “Planned”로 명확히 표시해줘.

이 화면은 실제 제품 MVP 시안처럼 완성도 있게 보여야 해.
```

</details>

## 2. AI Transcript Import

**Screen purpose:** Paste/import AI conversation text as Mori evidence.

**Key UI requirements:**
- Source selector for Claude, Codex, ChatGPT, and Other AI Chat.
- Transcript textarea, title field, and raw data policy choice.
- Import preview with expected events, turn count, evidence count, and trust level.
- Generated evidence summary panel.

**Privacy/product constraints:**
- Explicit paste/import, not account scraping.
- No OAuth, API-key access, or browser scanning.
- Raw retention must be visible before import.

<details>
<summary>Original prompt text</summary>

```text
Mori의 AI Transcript Import 화면 예상 이미지를 만들어줘.

스타일은 기존 Mori 시안과 동일하게 해줘:
- 흰색/연회색 기반
- 보라색 accent
- 깔끔한 카드형 UI
- 한국어 UI
- local-first, privacy-aware 느낌

화면 목적:
사용자가 Claude, Codex, ChatGPT, Other AI Chat 대화 내용을 붙여넣어 Mori Evidence로 가져오는 화면.

포함할 요소:
- 페이지 또는 모달 제목: AI Transcript Import
- Source 선택 드롭다운:
  - Claude
  - Codex
  - ChatGPT
  - Other AI Chat
- 제목 입력 필드
- 큰 transcript textarea
- raw data policy 선택:
  - Full text retained
  - Summary only
- privacy note:
  “Mori는 사용자가 붙여넣은 대화만 가져옵니다. 자동으로 계정이나 브라우저를 읽지 않습니다.”
- Import Preview 영역:
  - 예상 Timeline events
  - 감지된 speaker turns
  - evidence source count
  - trust level
- 버튼:
  - Import Transcript
  - Cancel
- 오른쪽 패널에는 “생성될 Evidence” 요약이 보이게 해줘.

직접 Claude/Codex 계정 연결이 아니라 explicit paste import라는 점이 분명해야 해.
```

</details>

## 3. Git Diff Import

**Screen purpose:** Import code work evidence from a user-triggered Git diff.

**Key UI requirements:**
- Repository card with branch, HEAD SHA, and clean/dirty state.
- Fetch Git Diff and Import as Evidence actions.
- Changed-file summary, additions/deletions, file list, and diff preview.
- Evidence settings and linked Timeline event preview.

**Privacy/product constraints:**
- Git diff capture is an explicit user action.
- No repository scanning or filesystem watching.
- Only selected repo/range is read.

<details>
<summary>Original prompt text</summary>

```text
Mori의 Git Diff Import 화면 예상 이미지를 만들어줘.

기존 Mori 제품 시안 스타일로:
- 좌측 사이드바
- 보라색 accent
- 흰색/연회색 배경
- 정돈된 developer tool 느낌
- 한국어 UI

화면 목적:
Codex나 Claude Code 작업 결과를 Git diff 기반 Evidence로 가져오는 화면.

포함할 요소:
- 페이지 제목: Git Diff Import
- Repository 선택 카드
- 현재 branch, HEAD short SHA, dirty/clean 상태
- Fetch Git Diff 버튼
- changed files summary:
  - modified files
  - added lines
  - removed lines
- 파일별 변경 리스트:
  - src/features/timeline/...
  - src/lib/import/...
  - docs/...
- diff preview 영역
- Import as Evidence 버튼
- 오른쪽 패널:
  - trust: verified
  - capture method: desktop command
  - raw data policy: retained
  - linked Timeline events preview

이 화면은 개발자가 실제로 작업 결과를 Mori에 넣는 실용적인 화면처럼 보여야 해.
```

</details>

## 4. Import Review / Evidence Mapping

**Screen purpose:** Review AI-generated interpretations before they become final timeline/review items.

**Key UI requirements:**
- Original Evidence summary card.
- Extracted Timeline Events with type, confidence, and source mapping.
- Generated Issues, Decisions, and Next Actions.
- Accept, Edit, and Discard controls plus Apply to Timeline.

**Privacy/product constraints:**
- AI interpretations are provisional until user review.
- Users must be able to reject or edit generated items.
- No silent acceptance of inferred structure.

<details>
<summary>Original prompt text</summary>

```text
Mori의 Import Review / Evidence Mapping 화면 예상 이미지를 만들어줘.

스타일:
- 기존 Mori 시안과 같은 white/soft-gray product UI
- 보라색 accent
- 정보가 많지만 정돈된 workflow review 화면
- 한국어 UI

화면 목적:
AI Transcript나 Git Diff를 가져온 뒤, Mori가 어떤 Timeline events, Issues, Decisions, Next Actions로 해석했는지 사용자가 검토하는 화면.

포함할 요소:
- 페이지 제목: Import Review
- 왼쪽: 원본 Evidence 요약 카드
  - source title
  - source type
  - importedAt
  - trust/raw policy
- 중앙: Extracted Timeline Events 리스트
  - event title
  - time
  - event type
  - confidence
  - source mapping
- 오른쪽: Generated Items
  - Issues
  - Decisions
  - Next Actions
- 각 항목에 Accept / Edit / Discard 버튼
- 상단에는 “Review before adding to Timeline” 안내
- 하단에는 “Apply to Timeline” 버튼

AI가 만든 결과를 그대로 믿는 게 아니라 사용자가 검토하고 확정하는 화면으로 보여줘.
```

</details>

## 5. Narrative Timeline

**Screen purpose:** Core lane-based chronological reconstruction of how work happened.

**Key UI requirements:**
- Left sidebar, top session header, toolbar, legend, time ruler, lanes, inspector, and minimap.
- Lanes for AI conversation, decisions, issues, file/code, web/research, notes/documents, outputs, and other.
- Readable event cards with evidence, trust, confidence, and related counts.
- Meaningful workflow bundle cards for dense periods.

**Privacy/product constraints:**
- Timeline is lane-based, not a freeform graph canvas.
- Relationship lines stay subtle and focus-driven.
- Do not hide important work moments behind generic +N clusters.

<details>
<summary>Original prompt text</summary>

```text
Mori의 Narrative Timeline 화면 예상 이미지를 만들어줘.

기존 Mori Timeline reference 시안과 가장 가깝게 만들어줘:
- 좌측 사이드바
- 상단 session header
- view controls, filter, search, utility buttons
- category legend
- horizontal time ruler
- lane-based timeline rows
- right Event Detail inspector
- bottom minimap
- 보라색 selected state
- white/soft-gray calm UI
- 한국어 UI

화면 목적:
사용자의 작업 세션이 시간순으로 어떻게 흘러갔는지 보여주는 Mori의 핵심 화면.

포함할 lane:
- AI 대화
- 결정
- 이슈
- 파일/코드
- 웹/조사
- 문서/메모
- 산출물
- 기타

각 이벤트 카드는:
- 시간
- 제목
- 짧은 요약
- evidence count
- trust badge
- confidence
- related issue/decision count

workflow bundle 카드도 포함해줘:
예: “14:18–14:38 경쟁 제품 조사 흐름 · 4 events”

관계선은 너무 자유로운 그래프처럼 보이지 말고, 선택된 이벤트 중심으로 subtle하게 표시해줘.
```

</details>

## 6. Flow Focus / Trace View

**Screen purpose:** Trace why a selected event happened and what it caused.

**Key UI requirements:**
- Selected central event with upstream causes and downstream results.
- Only focused relationship paths emphasized.
- Trace panel with relationship reason, confidence, evidence sources, and related items.
- Actions for full flow, relationship editing, and notes.

**Privacy/product constraints:**
- Evidence-based trace view, not an unrestricted graph explorer.
- Relationship explanations must stay inspectable.
- Editing controls must be real or clearly planned.

<details>
<summary>Original prompt text</summary>

```text
Mori의 Flow Focus / Trace View 화면 예상 이미지를 만들어줘.

스타일:
- 기존 Mori 시안과 동일한 차분한 제품 UI
- 보라색 accent
- 한국어 UI
- Timeline보다 더 focused하고 trace 중심

화면 목적:
선택한 이벤트가 왜 생겼고 어떤 결과로 이어졌는지 추적하는 화면.

포함할 요소:
- 상단 제목: Flow Focus / Trace View
- 선택된 이벤트 카드:
  - 핵심 포지션 변경
  - 14:37
  - 결정 또는 AI 대화 badge
- upstream causes 섹션:
  - 경쟁 제품 조사
  - Claude Code 대화 시작
  - 아이디어 스케치
- downstream results 섹션:
  - Start Flow 방식 채택
  - 로컬 LLM 우선
  - MVP 범위 확정
  - 관련 이슈 생성
- 관계선은 선택된 flow path만 명확하게
- 오른쪽 Trace Panel:
  - 왜 연결됐는지
  - relationship reason
  - confidence
  - evidence sources
  - related issues/decisions/files
- 버튼:
  - 전체 흐름 보기
  - 연결 편집
  - 메모 추가

자유로운 graph canvas가 아니라, 근거 기반 흐름 추적 화면으로 보여줘.
```

</details>

## 7. Review

**Screen purpose:** Review issues, decisions, next actions, unresolved items, and suggestions.

**Key UI requirements:**
- Tabs for Issues, Decisions, Next Actions, Unresolved, and Suggestions.
- Issue Garden board with Open, In Progress, Resolved, and Watching columns.
- Decision Log table with rationale and related evidence.
- Right summary panel with statistics, recent decisions, and AI suggestions.

**Privacy/product constraints:**
- Generated records need evidence links.
- AI suggestions should remain reviewable, not silently applied.
- Review is not a generic task manager.

<details>
<summary>Original prompt text</summary>

```text
Mori의 Review 화면 예상 이미지를 만들어줘.

기존 Issues & Decisions 시안을 기반으로 하되, 더 제품적으로 정리된 Review 화면으로 만들어줘.

스타일:
- Mori 시안과 동일한 흰색/연회색 UI
- 보라색 accent
- 카드와 테이블 혼합
- 한국어 UI

화면 목적:
Mori가 작업 중 발견한 Issues, Decisions, Next Actions, Unresolved items를 한 곳에서 검토하는 화면.

포함할 탭:
- Issues
- Decisions
- Next Actions
- Unresolved
- Suggestions

메인 영역:
- Issue Garden 칸반 보드
  - Open
  - In Progress
  - Resolved
  - Watching
- Decision Log 테이블
  - 결정 항목
  - 결정 시각
  - 중요도
  - 결정 내용
  - 이유
  - 관련 이슈
  - 관련 이벤트

오른쪽 패널:
- Review Summary
- Issue statistics
- Priority distribution
- Recent decision highlight
- AI suggestions

각 issue/decision에는 evidence link와 related timeline event가 보이게 해줘.
```

</details>

## 8. Resume & Reports

**Screen purpose:** Continue work or generate shareable reports from the session.

**Key UI requirements:**
- Resume section with last work, next action, open issues, recent decisions, and prompt textarea.
- Copy buttons for Claude, ChatGPT, and Codex prompts.
- Timeline preview and quick resource links.
- Report Builder with type, included sections, output format, and privacy toggles.

**Privacy/product constraints:**
- Reports must make privacy/redaction choices visible.
- PDF/HTML should be marked planned until real.
- Resume output should be grounded in Timeline/Evidence.

<details>
<summary>Original prompt text</summary>

```text
Mori의 Resume & Reports 화면 예상 이미지를 만들어줘.

기존 Resume & Report 시안을 기반으로 하되 더 완성도 있게 만들어줘.

스타일:
- white/soft-gray
- 보라색 accent
- 카드형 product UI
- 한국어 UI

화면 목적:
작업을 이어가기 위한 Resume Prompt와 공유 가능한 Report를 생성하는 화면.

왼쪽 메인 영역:
- 작업 이어가기 Resume 섹션
- 마지막 작업
- 다음 액션
- 열린 이슈
- 최근 결정
- 이어가기 프롬프트 textarea
- “Claude/ChatGPT/Codex용 프롬프트 복사” 버튼
- 관련 리소스 빠르게 열기

아래:
- 오늘의 작업 흐름 요약 timeline preview

오른쪽 패널:
- Report Builder
- Report type:
  - Personal Retrospective
  - Team Update
  - Client-safe Report
  - Dev Handoff
  - Work Log
- 포함 항목:
  - Summary
  - Timeline
  - Decisions
  - Issues
  - Evidence
  - Next Actions
- 출력 형식:
  - Markdown 활성
  - PDF planned
  - HTML planned
- privacy redaction toggle
- Generate Report 버튼

demo/real data basis도 보여줘.
```

</details>

## 9. End Session / Session Summary

**Screen purpose:** Close the session loop with saved state, highlights, unresolved items, and next steps.

**Key UI requirements:**
- Session identity, duration, sources, events, issues, decisions, next actions, and evidence counts.
- Save status for browser draft, desktop SQLite, and .mori package.
- Cards for Save session, Generate report, Export .mori, and Start follow-up session.
- Timeline highlight preview, unresolved items, and recommended next actions.

**Privacy/product constraints:**
- Do not imply cloud sync.
- Storage status must be explicit and local-first.
- Package/export availability must match implementation state.

<details>
<summary>Original prompt text</summary>

```text
Mori의 End Session / Session Summary 화면 예상 이미지를 만들어줘.

스타일:
- 기존 Mori 시안과 같은 local-first productivity app UI
- white/soft-gray
- 보라색 accent
- 한국어 UI

화면 목적:
사용자가 세션을 종료할 때, 이번 세션에서 무엇이 기록됐고 다음에 무엇을 할 수 있는지 보여주는 화면.

포함할 요소:
- 제목: Session Summary
- 세션 이름
- duration
- recorded sources
- generated timeline events
- issues
- decisions
- next actions
- evidence count
- save status:
  - Browser draft
  - Desktop SQLite
  - .mori package planned/available
- 주요 카드:
  - Save session
  - Generate report
  - Export .mori
  - Start follow-up session
- 이번 세션 하이라이트 timeline preview
- unresolved items
- recommended next actions

이 화면은 Mori의 사용 루프를 닫는 화면처럼 보여야 해.
```

</details>

## 10. Project Memory

**Screen purpose:** Long-term project memory across multiple Mori sessions.

**Key UI requirements:**
- Project summary and stats for sessions, issues, decisions, evidence, and reports.
- Recent sessions, decisions over time, recurring issues, key evidence, saved reports, and .mori packages.
- Follow-up Session action and right-side memory summary.

**Privacy/product constraints:**
- Project memory aggregates selected sessions, not background surveillance.
- Cross-session summaries need source provenance.
- Follow-up session should preserve user-controlled scope.

<details>
<summary>Original prompt text</summary>

```text
Mori의 Project Memory 화면 예상 이미지를 만들어줘.

스타일:
- 기존 Mori 시안과 동일한 깨끗한 생산성 앱 UI
- white/soft-gray
- 보라색 accent
- 한국어 UI

화면 목적:
프로젝트 단위로 여러 Mori 세션, 결정, 이슈, evidence, reports가 쌓이는 장기 기억 화면.

포함할 요소:
- 페이지 제목: Project Memory
- 프로젝트 이름: Mori Product
- 프로젝트 설명
- 통계 카드:
  - sessions
  - open issues
  - decisions
  - evidence sources
  - reports
- 최근 세션 리스트
- decisions over time
- recurring issues
- key evidence
- saved reports
- .mori package list
- Follow-up Session 시작 버튼

오른쪽 패널:
- Project memory summary
- latest important decision
- unresolved risks
- next recommended session

한 세션이 아니라 프로젝트의 장기 기억을 보는 화면으로 만들어줘.
```

</details>

## 11. Settings / Privacy / Local AI

**Screen purpose:** Configure local AI, privacy defaults, storage/export, repositories, and connectors.

**Key UI requirements:**
- Local AI providers: Ollama, LM Studio, OpenAI-compatible endpoint, explicit Cloud API opt-in.
- Privacy defaults for summary mode, sensitive app blocking, raw retention, and no background capture.
- Storage/export, repository verification, and planned connector lists.
- Clear implemented versus planned summary.

**Privacy/product constraints:**
- Local-first and privacy-first posture must be visible.
- Cloud use requires explicit opt-in.
- Planned connectors must be labeled as planned.

<details>
<summary>Original prompt text</summary>

```text
Mori의 Settings / Privacy / Local AI 화면 예상 이미지를 만들어줘.

스타일:
- 기존 Mori 시안과 동일
- local-first, privacy-aware 느낌
- white/soft-gray
- 보라색 accent
- 한국어 UI

화면 목적:
Mori의 로컬 AI, 저장소, 개인정보, connector, repository 설정을 관리하는 화면.

포함할 섹션:
- Local AI
  - Ollama
  - LM Studio
  - OpenAI-compatible endpoint
  - Cloud API explicit opt-in
- Privacy Defaults
  - Summary Mode default
  - block sensitive apps
  - raw data retention
  - no background capture
- Storage / Export
  - ~/Mori/Records
  - Desktop SQLite status
  - .mori package save/open
- Repositories
  - connected repo list
  - verified branch/sha
  - dirty state
- Planned connectors
  - Claude Code Hook
  - Codex CLI Import
  - VS Code
  - Cursor
  - Terminal
  - Browser Extension

planned와 implemented가 명확히 구분되어야 해.
```

</details>

## 12. Connector Setup

**Screen purpose:** Future connector setup surface for opt-in integrations.

**Key UI requirements:**
- Connector grid for Claude Code Hook, Codex CLI, VS Code, Cursor, Terminal, Browser Extension, Slack, Notion, and Figma.
- Each card lists status, requirements, privacy note, capture method, and setup steps.
- Selected connector details with what Mori will and will never access.
- Test connection buttons disabled/planned where not implemented.

**Privacy/product constraints:**
- Connector Setup is planned unless explicitly implemented.
- No fake connected state.
- All connector access is opt-in and scoped.

<details>
<summary>Original prompt text</summary>

```text
Mori의 Connector Setup 화면 예상 이미지를 만들어줘.

스타일:
- Mori 제품 시안과 동일한 clean productivity UI
- 보라색 accent
- local-first / privacy-first 느낌
- 한국어 UI

화면 목적:
나중에 Claude Code Hook, Codex CLI Session Import, VS Code, Cursor, Terminal, Browser Extension 같은 connector를 설정하는 화면.

중요:
아직 실제 connector가 없다면 Planned로 보여야 해.
가짜로 연결된 것처럼 보이면 안 돼.

포함할 요소:
- 페이지 제목: Connector Setup
- connector grid:
  - Claude Code Hook
  - Codex CLI Session Import
  - VS Code Extension
  - Cursor Extension
  - Terminal Shell Integration
  - Browser Extension
  - Slack
  - Notion
  - Figma
- 각 connector 카드:
  - status: Planned / Available / Requires setup
  - requirements
  - privacy note
  - capture method
  - setup steps
  - Test connection 버튼은 disabled/planned
- 오른쪽 패널:
  - selected connector details
  - what Mori will access
  - what Mori will never access
  - setup checklist

보안과 명시적 opt-in이 강조되어야 해.
```

</details>

## 13. Edit Event / Correction Panel

**Screen purpose:** Let users correct AI-inferred Timeline events.

**Key UI requirements:**
- Edit title, summary, event type, time, trust level, evidence links, related issues/decisions, and correction note.
- Mark as user verified and Save/Cancel actions.
- Trust/AI transparency message.

**Privacy/product constraints:**
- AI-inferred records must remain user-correctable.
- Changing trust must be explicit.
- Corrections need provenance and persistence before controls are active.

<details>
<summary>Original prompt text</summary>

```text
Mori의 Edit Event / Correction Panel 예상 이미지를 만들어줘.

스타일:
- Timeline Inspector 안에서 열리는 side panel 또는 modal 느낌
- 기존 Mori 시안과 동일한 white/soft-gray UI
- 보라색 accent
- 한국어 UI

화면 목적:
Mori가 AI로 추론한 Timeline event가 틀렸을 때 사용자가 수정하고 정정하는 화면.

포함할 요소:
- 패널 제목: Edit Event
- event title 입력
- summary textarea
- event type 선택:
  - AI 대화
  - 결정
  - 이슈
  - 파일/코드
  - 웹/조사
  - 문서/메모
  - 산출물
- time 조정
- trust level 변경:
  - verified
  - observed
  - inferred
- source evidence 연결/해제
- related issue/decision 연결
- user correction note
- Mark as user verified 버튼
- Save changes / Cancel

하단에는 “AI 추론은 사용자가 정정할 수 있습니다”라는 신뢰/투명성 메시지를 넣어줘.
```

</details>

## 14. Product Overview / Screen Map

**Screen purpose:** One-image overview of Mori major product surfaces and product system direction.

**Key UI requirements:**
- Thumbnails for Start Session, Evidence Hub, AI Transcript Import, Narrative Timeline, Flow Focus, Review, Resume & Reports, Project Memory, and Settings.
- Product framing around local-first AI work memory.
- Consistent visual language across screens.

**Privacy/product constraints:**
- Reference-only planning image.
- Not implementation proof.
- Should guide cohesion across future UI tasks.

<details>
<summary>Original prompt text</summary>

```text
Mori 앱의 주요 화면들을 한 장의 product overview 이미지로 만들어줘.

스타일:
- white/soft-gray
- 보라색 accent
- local-first AI work memory app
- Linear, Notion, Figma, Apple productivity app 같은 고급스러운 느낌
- 한국어 UI

포함할 화면 썸네일:
- Start Session
- Evidence Hub
- AI Transcript Import
- Narrative Timeline
- Flow Focus / Trace View
- Review
- Resume & Reports
- Project Memory
- Settings / Privacy / Local AI

각 화면이 하나의 제품 시스템처럼 보이게 해줘.
Mori는 “작업이 어떻게 흘러갔는지 기억하는 로컬 우선 AI work memory 앱”이라는 컨셉이 느껴져야 해.
```

</details>

