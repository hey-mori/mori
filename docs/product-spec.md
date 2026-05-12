# Mori Product Spec

Canonical product planning document for Mori.

This file consolidates the provided `mori_final_product_spec.md` into the repository documentation. The original planning document is preserved below because it contains detailed product rationale, feature definitions, collection strategy, MVP scope, risks, and roadmap.

Product sentence:

> Mori remembers how the work happened.

Key sections covered in this document:

- Product identity
- Executive summary
- Differentiation from wiki/task manager/time tracker/screen recorder
- Target users
- Core product objects
- Core features
- Start Mori / Session Setup
- Narrative Timeline
- Flow Focus
- Event Detail / Inspector
- Issue Garden
- Decision Log
- Sources / Evidence
- Resume / Report
- Split / Merge Assistant
- Privacy principles
- Collection strategy
- MVP scope
- Roadmap
- Risks
- Final product definition

---

# Mori 최종 제품 기획서

## 문서 버전

- 문서명: Mori Final Product Spec
- 제품명: Mori
- 확장자: `.mori`
- 제품 유형: Local-first AI Work Memory App
- 핵심 화면: Narrative Timeline
- 핵심 인터랙션: Flow Focus
- 핵심 기술: Tauri v2 + React + Rust + SQLite + Local LLM

---

# 1. Executive Summary

## 1.1 Mori란 무엇인가

**Mori는 사용자가 AI와 함께 일하는 과정을 로컬에서 조용히 기록하고, 이를 의미 있는 타임라인·이슈·결정·다음 액션·이어하기 프롬프트·보고서로 재구성해주는 개인 업무 기억 앱이다.**

Mori는 단순히 화면을 녹화하거나 대화를 저장하는 앱이 아니다. Mori의 본질은 **사용자가 실제로 일한 흐름을 잃어버리지 않도록 기억하고, 나중에 다시 이해하고 이어갈 수 있게 만드는 것**이다.

Mori는 사용자가 Claude, Codex, Cursor, ChatGPT, 브라우저, 문서, 터미널, 코드 에디터, 파일 시스템을 오가며 작업하는 동안 발생한 흐름을 하나의 `.mori` 작업 기억 파일로 저장한다.

Mori는 다음을 자동으로 정리한다.

- 언제 무엇을 했는지
- 어떤 AI와 어떤 대화를 했는지
- 어떤 자료를 조사했는지
- 어떤 파일이 바뀌었는지
- 어떤 결정을 했는지
- 어떤 이슈가 생겼는지
- 어떤 이슈가 해결됐는지
- 어떤 흐름이 어떤 결과로 이어졌는지
- 다음에 무엇을 해야 하는지
- 다음 AI 세션에 어떤 프롬프트로 이어가야 하는지
- 고객/팀/나 자신에게 어떤 리포트로 공유할 수 있는지

## 1.2 제품의 핵심 문장

> **Mori는 일이 어떻게 진행됐는지 기억합니다.**

영어:

> **Mori remembers how the work happened.**

## 1.3 제품의 차별점

Mori는 기존 툴들과 다르다.

- LLM Wiki는 정보를 저장하고 검색한다.
- 업무관리 앱은 할 일을 관리한다.
- 회의록 앱은 회의를 요약한다.
- 시간 추적 앱은 어디에 시간을 썼는지 보여준다.
- AI coding 로그 도구는 대화를 저장한다.
- Rewind/Recall류 앱은 과거 화면을 기억하고 검색한다.

Mori는 이들과 달리:

> **선택한 작업 세션을 의미 있는 업무 흐름으로 재구성한다.**

즉 Mori의 핵심은 “기억 검색”이 아니라 **작업 흐름 복원**이다.

## 1.4 제품의 방향성

Mori는 차갑고 복잡한 대시보드가 아니라, 사용자가 피곤한 작업을 마친 뒤 안정감을 느끼며 자신의 작업 흐름을 이해할 수 있는 앱이어야 한다.

브랜드 감성은 다음과 같다.

- 조용함
- 신뢰
- 로컬 우선
- 프라이버시
- 타임라인
- 회고
- 다시 이어가기
- 숲/호수 같은 차분한 감성
- 포멀하고 전문적인 업무 UI

Mori는 두 가지 시각 모드를 가진다.

1. **Formal Theme**: 기본 생산성/전문 업무 테마
2. **Forest / Night Lake Theme**: 피로를 낮추는 차분한 감성 테마

---

# 2. 제품 배경

## 2.1 AI 시대의 업무 방식 변화

이전의 업무는 주로 사람이 문서, 코드, 표, 발표자료를 직접 만들었다. 지금은 사용자가 AI 도구들과 대화하면서 일한다.

예를 들어 사용자는 다음처럼 일한다.

1. ChatGPT에서 아이디어를 논의한다.
2. Claude에서 긴 기획을 다듬는다.
3. Codex나 Cursor로 코드를 생성한다.
4. VS Code에서 파일을 수정한다.
5. 터미널에서 실행한다.
6. 브라우저에서 경쟁 제품을 조사한다.
7. 다시 AI에게 오류를 물어본다.
8. 결과를 문서로 정리한다.
9. 다음 날 다시 이어서 작업한다.

이 작업 흐름은 매우 강력하지만, 동시에 쉽게 흩어진다.

## 2.2 현재 사용자의 문제

사용자는 AI와 함께 일하면서 이런 문제를 겪는다.

### 1. 맥락이 사라진다

AI와 나눈 대화는 ChatGPT, Claude, Cursor, Codex, 터미널 로그, 브라우저 탭, 문서에 흩어진다.

다음 날 작업을 이어가려면 다시 설명해야 한다.

### 2. 왜 그런 결정을 했는지 잊는다

결과물은 남지만 과정은 사라진다.

- 왜 이 구조로 코드를 짰는지
- 왜 이 제품 방향으로 갔는지
- 왜 이 기능을 버렸는지
- 왜 이 고객 요청을 범위 초과로 봤는지

나중에 다시 확인하기 어렵다.

### 3. 남은 이슈가 흩어진다

AI와 작업하다 보면 많은 이슈가 생긴다.

- 로컬 LLM 연결 방식 미정
- 데이터 수집 범위 과도 가능성
- 파일 스키마 확정 필요
- 고객 요구사항 불명확
- 테스트 실패 케이스 존재

하지만 이런 이슈는 대화 속에 묻혀 사라진다.

### 4. 보고와 공유가 어렵다

프리랜서나 팀 작업자는 자신이 실제로 무엇을 했는지 설명해야 한다.

- 고객에게 보낼 진행 보고
- 팀에게 보낼 작업 요약
- 개발 standup
- 청구용 작업 내역
- 개인 회고

이런 보고서는 매번 수동으로 만들기 귀찮다.

### 5. AI에게 이어서 시키기 어렵다

AI 작업의 가장 큰 고통 중 하나는 “다시 설명하기”다.

사용자는 다음 날 새 Claude/ChatGPT/Codex 세션에서 다시 말해야 한다.

> 어제 이런 걸 했고, 이런 결정이 있었고, 이 파일을 바꿨고, 이 이슈가 남았고...

Mori는 이 과정을 자동으로 Resume Prompt로 만들어준다.

---

# 3. 제품 본질

## 3.1 Mori는 작업 기억 앱이다

Mori는 업무관리 앱도 아니고 위키도 아니고 에이전트도 아니다.

Mori의 본질은:

> **사용자가 일한 흐름을 기억하고 다시 이어가게 해주는 작업 기억 앱**

이다.

## 3.2 Mori는 나 대신 일하지 않는다

Mori는 우렁각시처럼 사용자를 대신해 일을 끝내는 앱이 아니다.

Mori는 사용자가 일하는 동안 조용히 기록하고, 작업이 끝난 뒤 다음을 정리한다.

- 흐름
- 이슈
- 결정
- 다음 액션
- 보고서
- 이어하기 프롬프트

따라서 Mori는 **작업 대행자**가 아니라 **작업 기억자**다.

## 3.3 Mori는 타임라인 중심이다

Mori의 중심 UI는 그래프가 아니다.

그래프는 시각적으로 멋있지만, 정보가 많아지면 복잡해진다. 사용자가 매일 보기에는 피로하다.

Mori의 메인 구조는 타임라인이어야 한다.

이유:

1. 작업 기록의 기본 은유는 시간이다.
2. 사용자는 “언제 무엇을 했는지”를 먼저 알고 싶어 한다.
3. 같은 시간대의 여러 이벤트는 lane 구조로 정리할 수 있다.
4. 보고서와 회고는 시간 흐름 기반으로 만들기 쉽다.
5. AI가 실수해도 시간순 기록은 검증이 쉽다.

그래프는 보조 기능인 **Trace View**로만 사용한다.

## 3.4 Mori의 핵심 경험

사용자는 다음 흐름으로 Mori를 경험한다.

```text
Start Mori
  ↓
AI와 작업 / 브라우저 조사 / 파일 수정
  ↓
Stop Mori
  ↓
Mori가 작업 흐름 분석
  ↓
Narrative Timeline 확인
  ↓
Flow Focus로 특정 흐름 추적
  ↓
Issue Garden / Decision Log 확인
  ↓
Resume Prompt 또는 Report 생성
  ↓
다음 세션으로 이어가기
```

---

# 4. 타깃 사용자

## 4.1 1차 타깃: AI와 함께 일하는 개인 작업자

### 대표 사용자

- 바이브 코딩하는 사람
- Claude Code, Codex, Cursor, ChatGPT를 많이 쓰는 사람
- 인디해커
- AI로 앱을 만드는 비개발자
- 기획자
- 리서처
- AI 기반 창작자
- 1인 창업자

### 주요 고통

- AI 대화가 흩어진다.
- 다음 날 다시 이어가기 어렵다.
- 어떤 결정을 왜 했는지 잊는다.
- 코드나 문서가 왜 이렇게 바뀌었는지 모른다.
- 남은 이슈가 대화 속에 묻힌다.
- 작업 보고나 회고를 만들기 귀찮다.

### Mori의 가치

- AI와 함께한 작업 흐름을 타임라인으로 복원
- 결정/이슈 자동 추출
- 파일 변경과 대화 연결
- Resume Prompt 생성
- 작업 보고서 자동 생성

## 4.2 2차 타깃: 프리랜서 / 1인 사업자

### 대표 사용자

- 웹디자이너
- 마케터
- 콘텐츠 제작자
- 영상 편집자
- 컨설턴트
- 브랜딩/디자인 프리랜서
- AI를 활용해 고객 업무를 처리하는 사람

### 주요 고통

- 고객별 작업 흐름이 흩어진다.
- 실제 작업 내역을 고객에게 설명하기 어렵다.
- 고객 요구사항 변화와 범위 초과를 놓친다.
- 청구 가능한 작업 근거가 부족하다.
- 진행 보고서를 매번 쓰기 귀찮다.

### Mori의 가치

- 고객 프로젝트별 작업 흐름 기록
- 고객 보고서 자동 생성
- 범위 변경 감지
- 피드백 히스토리 정리
- 청구용 작업 내역 생성

## 4.3 3차 타깃: 작은 팀

### 대표 사용자

- 스타트업 초기 팀
- AI 도구를 많이 쓰는 제품팀
- 빠르게 실험하는 개발/디자인/마케팅 팀

### 주요 고통

- 누가 왜 어떤 결정을 했는지 모른다.
- AI와 협업한 흔적이 팀 지식으로 남지 않는다.
- 회의 밖에서 실제로 진행된 작업 흐름이 공유되지 않는다.

### Mori의 가치

- 프로젝트별 decision history
- 작업 흐름 공유
- 팀용 요약 리포트
- Jira/Linear/Slack export

---

# 5. 주요 제품 객체

## 5.1 Project

여러 Mori 세션을 담는 상위 단위.

예:

```text
Mori App Planning
Client Homepage Project
AI Coding Tool Research
```

Project는 여러 Session을 가진다.

## 5.2 Session

사용자가 Start Mori부터 Stop Mori까지 기록한 하나의 작업 단위.

예:

```text
2025.05.10 Mori 앱 기획 세션
2025.05.11 Claude Code 리팩터링 세션
2025.05.12 고객 홈페이지 수정 세션
```

## 5.3 Event

작업 중 발생한 의미 있는 단위.

Event 타입:

- AI Conversation
- Research
- File Change
- Code Change
- Terminal Action
- Decision
- Issue
- Action
- Artifact
- Note
- Breakthrough
- Blocker

## 5.4 Issue

작업 중 생긴 미해결 문제.

예:

```text
로컬 LLM 연결 방식 미정
데이터 수집 범위 과도 가능성
.mori 파일 구조 정의 필요
고객 요구사항 불명확
```

## 5.5 Decision

작업 중 내려진 중요한 결정.

예:

```text
그래프 중심이 아니라 타임라인 중심 UI로 간다.
기본 기록 방식은 24/7이 아니라 Start Mori 방식으로 간다.
제품명은 Mori로 한다.
```

## 5.6 Relationship

이벤트, 이슈, 결정 사이의 관계.

예:

```text
경쟁 제품 조사 → LLM Wiki와 차별화 문제 발견
그래프 복잡성 우려 → 타임라인 중심 UI 결정
Claude 대화 → 로컬 LLM 연결 이슈 생성
```

Relationship은 Flow Focus와 Trace View의 기반이 된다.

## 5.7 Artifact

작업 중 생성된 결과물.

예:

- 문서
- 코드 파일
- 보고서
- 프롬프트
- 디자인 시안
- 고객 답장
- Markdown/PDF export

---

# 6. 핵심 기능 상세

## 6.1 Start Mori / Session Setup

### 목적

사용자가 기록할 작업 세션을 명시적으로 시작한다.

### 왜 필요한가

Mori는 항상 감시하는 앱이 아니다. 프라이버시와 신뢰를 위해 사용자가 언제 무엇을 기록하는지 직접 선택해야 한다.

### 주요 구성 요소

- 세션 이름
- 프로젝트 선택 또는 새 프로젝트 생성
- 기록할 앱/소스 선택
- 기록 모드 선택
- 로컬 LLM 엔진 선택
- 저장 위치 확인
- 예상 저장 공간
- 민감정보 보호 안내
- Start Mori 버튼

### 기록할 앱/소스 후보

- Claude
- ChatGPT
- Codex CLI
- Claude Code
- Cursor
- VS Code
- Terminal
- Chrome selected tabs
- Figma
- Notion / Docs
- Finder / File System
- Git diff
- 사용자 수동 메모

### 기록 모드

#### Summary Mode

- 원본은 임시 처리 후 삭제
- 요약/이슈/결정/타임라인만 저장
- 기본값으로 추천

#### Full Mode

- 원본 로그까지 보관
- 개발자/감사/상세 추적에 적합

#### Ephemeral Mode

- 세션 종료 후 report만 생성
- 원본과 내부 분석 데이터 삭제 가능
- 민감 프로젝트에 적합

### 성공 기준

사용자는 이 화면을 보고 다음을 명확히 알아야 한다.

- 무엇이 기록되는지
- 무엇이 기록되지 않는지
- 데이터가 어디 저장되는지
- 로컬 LLM을 쓰는지 클라우드를 쓰는지
- 언제든 삭제할 수 있는지

## 6.2 Recording Mini Panel

### 목적

작업 중 Mori가 조용히 기록 중임을 알려준다.

### 주요 구성 요소

- 현재 세션명
- 기록 중 상태
- 감지된 이벤트 수
- 감지된 AI 대화 수
- 감지된 파일 변경 수
- Quick Note 버튼
- Pause 버튼
- Stop Mori 버튼

### UX 원칙

- 방해하지 않아야 한다.
- 항상 화면 위에 떠 있지만 작아야 한다.
- 사용자가 숨길 수 있어야 한다.
- 상태만 알려주고 판단은 세션 종료 후 보여준다.

## 6.3 Narrative Timeline

### 목적

작업이 시간에 따라 어떻게 진행됐는지 보여준다.

### 화면 구조

- 좌측 사이드바
- 상단 프로젝트/세션 헤더
- 상단 시간축
- 중앙 timeline canvas
- lane별 이벤트 카드
- 오른쪽 Event Detail Panel
- 하단 mini map
- 필터/검색/줌 컨트롤

### 타임라인 방향

기본은 **좌→우 시간 흐름**이다.

이유:

- 시간의 진행을 시각적으로 직관적으로 보여준다.
- 같은 시간대에 여러 이벤트가 있을 때 lane을 나눠 배치하기 좋다.
- 하단 mini map과 잘 맞는다.
- 사용자에게 “일이 앞으로 진행됐다”는 감각을 준다.

### Lane 구조

같은 시간대에 여러 이벤트가 발생할 수 있기 때문에 lane 구조가 필요하다.

기본 lane:

1. AI 대화
2. 결정
3. 이슈
4. 파일/코드
5. 웹/조사
6. 문서/메모
7. 기타

예:

```text
13:00 ─────────────────────────────── 18:00

AI 대화     [Claude 시작]      [MVP 논의]
결정                         [Start Mori 방식 채택]      [로컬 우선 결정]
이슈                                  [LLM 연결 미정] [데이터 수집 범위 과도]
파일/코드      [README 생성] [parser 수정]       [report_template 생성]
웹/조사          [Dayflow 조사] [screenpipe 조사] [SpecStory 조사]
```

### 같은 시간대 이벤트 처리

동일 시간 또는 근접 시간에 여러 이벤트가 발생하면 다음 방식으로 처리한다.

1. lane별 분리
2. 카드 겹침 방지
3. zoom level이 낮으면 그룹 카드로 묶기
4. 그룹 클릭 시 내부 이벤트 펼치기
5. 사용자가 수동으로 분리/병합 가능

### 카드 표시 정보

각 카드에는 다음을 표시한다.

- 시간
- 제목
- 타입 태그
- 짧은 요약
- 관련 소스 아이콘
- 연결된 이슈/결정 수
- 신뢰도 또는 AI 추출 표시

### 타임라인 필터

- 전체
- AI 대화
- 결정
- 이슈
- 파일/코드
- 웹/조사
- 문서
- 산출물
- 수동 메모

### 하단 Mini Map

세션 전체 이벤트 분포를 작은 바 형태로 보여준다.

용도:

- 긴 세션에서 빠르게 이동
- 특정 시간대 확대
- 이벤트 밀집 구간 파악

## 6.4 Flow Focus

### 목적

특정 이벤트가 어떤 흐름에서 왔고 어디로 이어졌는지 즉시 이해하게 한다.

### 동작

사용자가 카드에 hover하거나 클릭하면:

- 해당 카드와 직접/간접적으로 관련된 흐름만 선명하게 표시
- 나머지 카드는 20~35% opacity로 낮춤
- 관련 연결선 강조
- 오른쪽 panel에 Trace 표시

### 예시

사용자가 “타임라인 중심 UI 결정” 카드에 hover한다.

강조되는 흐름:

```text
LLM Wiki와 차별화 문제 발견
  ↓
그래프 UI 복잡성 우려
  ↓
작업 기록의 기본 은유는 시간이라는 판단
  ↓
타임라인 중심 UI 결정
```

### 왜 중요한가

Flow Focus는 Mori의 가장 중요한 차별적 UX다.

복잡한 전체 그래프를 보여주지 않아도, 사용자는 특정 결정이나 이슈의 흐름을 이해할 수 있다.

## 6.5 Event Detail / Inspector

### 목적

타임라인 카드의 상세 정보를 보여준다.

### 주요 구성 요소

- 이벤트 제목
- 시간
- 타입
- 요약
- 근거
- 관련 소스
- 관련 파일
- 관련 AI 대화
- 관련 이슈
- 관련 결정
- 파생된 다음 액션
- Trace 보기
- 메모 추가
- 이벤트 수정
- 이벤트 병합/분리

### 중요한 이유

AI가 생성한 요약은 틀릴 수 있다. 사용자가 직접 수정하고 보정할 수 있어야 한다.

## 6.6 Trace View

### 목적

특정 이벤트의 관계 흐름을 더 자세히 보여준다.

### 동작

Event Detail에서 “Trace 보기”를 누르면 오른쪽 또는 overlay에 표시된다.

표시 내용:

- 이 이벤트의 원인
- 이 이벤트의 결과
- 관련 결정
- 관련 이슈
- 관련 산출물
- 관계 신뢰도
- 관계 수정 버튼

### 관계 수정

사용자는 다음을 할 수 있다.

- 연결 추가
- 연결 제거
- 관계 타입 변경
- 이벤트 병합
- 이벤트 분리

## 6.7 Issue Garden

### 목적

작업 중 발생한 이슈를 놓치지 않게 한다.

### 화면 구조

- Open
- In Progress
- Resolved
- Risk / Watching

또는 Formal Theme에서는 Kanban/List 전환 가능.

### Issue 카드 정보

- 제목
- 설명
- 우선순위
- 상태
- 생성 시각
- 관련 이벤트
- 관련 결정
- 관련 파일
- 추천 다음 액션
- 담당자
- 마감일

### AI 추천 기능

- 비슷한 이슈 병합 추천
- 이슈 분리 추천
- 우선순위 추천
- 다음 행동 추천
- Jira/Linear/Todo export 추천

## 6.8 Decision Log

### 목적

작업 중 내려진 결정을 기록한다.

### Decision 카드 정보

- 결정 제목
- 결정 시각
- 결정 내용
- 이유
- 폐기한 대안
- 영향
- 관련 이슈
- 관련 이벤트
- 관련 소스

### 예시

```text
Decision:
24/7 기록 대신 Start Mori 방식으로 간다.

Why:
프라이버시 부담을 줄이고, 업무 단위를 명확히 하기 위해.

Rejected:
항상 화면 녹화 방식.

Impact:
MVP는 세션 기반 기록으로 제한한다.
```

## 6.9 Sources / Evidence View

### 목적

Mori가 어떤 근거로 이벤트, 이슈, 결정을 만들었는지 확인한다.

### 주요 구성 요소

- AI 대화 원문
- 브라우저 링크
- 파일 변경
- 터미널 로그
- 문서/메모
- 캡처/첨부
- 각 소스가 연결된 이벤트/이슈/결정
- 민감정보 상태
- 원본 삭제/보관 설정

### 중요한 이유

Mori가 신뢰받으려면 “이 요약이 어디서 나왔는지” 확인 가능해야 한다.

## 6.10 Resume View

### 목적

사용자가 다음 작업을 빠르게 이어가도록 한다.

### 주요 구성 요소

- 마지막 작업 위치
- 마지막 결정
- 열린 이슈
- 다음 액션
- 이어하기 프롬프트
- 관련 파일 다시 열기
- 관련 링크 다시 열기
- Claude/ChatGPT/Codex용 프롬프트 포맷
- Start Follow-up Session 버튼

### Resume Prompt 예시

```text
You are continuing a product design session for Mori.

Mori is a local-first work memory app that records selected AI work sessions and reconstructs them into narrative timelines, issues, decisions, and next actions.

Last decisions:
- Use Timeline-first UI.
- Use Mori as the product name.
- Use .mori as the file extension.
- Provide Formal and Forest themes.

Open issues:
1. Define MVP data sources.
2. Design the Start Mori flow.
3. Create the .mori file schema.

Continue by designing the four primary screens.
```

## 6.11 Report Export View

### 목적

작업 기억을 공유 가능한 산출물로 바꾼다.

### 리포트 유형

- 개인 회고
- 팀 공유
- 고객 보고
- 개발 standup
- 청구용 작업 내역
- 맞춤 리포트

### 포함 항목 선택

- 요약
- 타임라인
- 결정
- 이슈
- 파일 변경
- 관련 AI 대화
- 웹/조사 내용
- 다음 액션

### 출력 형식

- Markdown
- PDF
- HTML
- `.mori` 첨부

### 프라이버시 옵션

- 민감정보 자동 제거
- AI 대화 원문 제외
- 파일 경로 마스킹
- 고객 공유용 요약 모드

## 6.12 Split / Merge Assistant

### 목적

AI가 만든 이벤트 구조를 사용자가 쉽게 보정한다.

작업 흐름은 단순 선형이 아니다.

- 하나의 이벤트가 여러 결과로 갈라질 수 있다.
- 여러 이벤트가 하나의 결정으로 합쳐질 수 있다.
- 하나의 긴 AI 대화가 여러 이슈로 쪼개질 수 있다.
- 여러 비슷한 이슈가 하나로 병합될 수 있다.

### 주요 기능

- 이벤트 분리
- 이벤트 병합
- 이슈 병합
- 이슈 분리
- 관계선 수정
- AI 추천 분할안
- AI 추천 병합안
- 변경 전/후 미리보기

### 예시

긴 Claude 대화 하나에서 다음 3개 이벤트가 추출될 수 있다.

```text
1. 경쟁 제품 분석
2. 타임라인 중심 UI 결정
3. 로컬 LLM 우선 전략 결정
```

사용자는 이를 확인하고 분리하거나 병합할 수 있다.

---

# 7. 주요 화면 목록

## 7.1 Home / Mori Grove

### 목적

앱을 켰을 때 최근 작업 기억과 이어갈 일을 보여준다.

### 주요 요소

- 최근 세션
- 진행 중 세션
- 오늘의 요약
- 열린 이슈 수
- 최근 결정
- 다음 액션
- 빠른 시작
- `.mori` 파일 열기
- 프로젝트 목록

## 7.2 Start Mori / Session Setup

### 목적

새로운 작업 세션을 시작하고 기록 범위를 설정한다.

### 주요 요소

- 세션명
- 프로젝트 선택
- 기록할 앱/소스 선택
- 기록 모드 선택
- 로컬 LLM 선택
- 저장 위치
- 프라이버시 요약
- Start 버튼

## 7.3 Recording Mini Panel

### 목적

작업 중 Mori가 조용히 기록 중임을 알려준다.

### 주요 요소

- 세션명
- 기록 중 상태
- 이벤트 수
- AI 대화 수
- 파일 변경 수
- Quick Note
- Pause
- Stop Mori

## 7.4 Timeline Main View

### 목적

작업 흐름을 좌→우 타임라인으로 보여준다.

### 주요 요소

- 시간축
- lane 구조
- 이벤트 카드
- Flow Focus
- mini map
- 필터/검색
- Event Detail Panel

## 7.5 Flow Focus / Trace View

### 목적

선택한 이벤트와 관련된 흐름만 강조한다.

### 주요 요소

- 선택된 카드
- 강조된 관계 경로
- 반투명 처리된 주변 이벤트
- Trace panel
- 관계 수정 버튼

## 7.6 Issue Garden / Decision Log

### 목적

남은 문제와 중요한 결정을 관리한다.

### 주요 요소

- Issue board/list
- Decision table/list
- 우선순위
- 상태
- 관련 이벤트
- AI 추천

## 7.7 Sources / Evidence View

### 목적

Mori가 참조한 원본 근거를 확인한다.

### 주요 요소

- AI 대화
- 웹 링크
- 파일 변경
- 터미널 로그
- 원본 보기
- 연결된 이벤트
- 민감정보 설정

## 7.8 Resume / Report View

### 목적

작업을 이어가거나 공유 가능한 리포트를 만든다.

### 주요 요소

- Resume Prompt
- 다음 액션
- 리포트 유형 선택
- 포함 항목 선택
- Markdown/PDF/HTML export
- 민감정보 제거

## 7.9 Project View

### 목적

하나의 프로젝트에 여러 Mori 세션이 쌓인 장기 기억을 본다.

### 주요 요소

- 프로젝트 요약
- 세션 목록
- 누적 타임라인
- 누적 이슈
- 누적 결정
- 최근 산출물
- 프로젝트 Resume Prompt

## 7.10 Settings / Privacy / Local AI

### 목적

로컬 LLM, 저장소, 프라이버시, 테마를 설정한다.

### 주요 요소

- LLM provider
- 저장 위치
- 기본 기록 모드
- 앱별 허용/차단
- 민감 앱 차단
- raw data 보관 기간
- 테마 설정
- export 설정

---

# 8. 시각 디자인 시스템

## 8.1 디자인 방향

Mori는 기본적으로 포멀하고 깔끔한 전문 생산성 앱이어야 한다.

다만 Mori만의 감성으로 “조용한 숲”과 “호수” 같은 힐링 테마를 선택적으로 제공한다.

즉 기본은 전문적이어야 하고, 감성은 과하지 않게 들어가야 한다.

## 8.2 Formal Theme

### 용도

- 기본 테마
- 업무용
- 팀 공유
- 고객 보고
- 개발자/프리랜서 공통

### 느낌

- Linear
- Figma
- Notion
- Apple productivity
- 깔끔함
- 신뢰감
- 고급스러움

### 색상

- White
- Light Gray
- Charcoal
- Purple Accent
- Blue Accent
- Green/Orange/Red status colors

### UI 특징

- 카드 기반
- 충분한 여백
- 얇은 라인
- 낮은 대비의 그림자
- 정교한 타임라인
- 데이터는 명확하게

## 8.3 Forest Theme

### 용도

- 피로 회복형 테마
- 개인 회고
- 장시간 작업 후 정리
- 감성적 브랜드 경험

### 느낌

- 숲
- 호수
- 안개
- 잔잔한 빛
- 오솔길
- 조용한 기록

### 적용 방식

- 배경에 은은한 자연적 그라데이션
- 카드에 부드러운 자연색
- 이슈 상태를 새싹/가지치기/정리됨 같은 은유로 표현
- 세션 종료 화면에 호수/반사 이미지 사용 가능

주의:

- 기능을 방해할 정도로 자연 이미지를 과하게 쓰면 안 된다.
- 정보 구조는 Formal Theme만큼 명확해야 한다.

## 8.4 Night Lake Theme

### 용도

- 야간 작업
- 개발자
- 집중 모드

### 느낌

- 어두운 호수
- 깊은 밤
- 낮은 대비
- 눈부심 최소화

## 8.5 Flow Focus 디자인

Flow Focus는 Mori의 대표 인터랙션이다.

### 기본 상태

- 모든 이벤트 카드가 정상 표시
- 관계선은 은은하게 표시

### Hover 상태

- 선택 카드 100% opacity
- 관련 카드 100% opacity
- 관련 연결선 강조
- 무관 카드 20~35% opacity
- 오른쪽 Trace panel 업데이트

### Click 상태

- 해당 흐름을 고정
- 사용자가 다른 곳을 클릭할 때까지 유지
- 관계 편집 가능

---

# 9. 데이터 구조

## 9.1 `.mori` 파일 구조

`.mori`는 zip-like package다.

```text
project.mori
├── manifest.json
├── projects.json
├── sessions.json
├── events.jsonl
├── timeline.jsonl
├── issues.json
├── decisions.json
├── relationships.json
├── next_actions.json
├── artifacts.json
├── sources/
│   ├── ai_conversations/
│   ├── browser/
│   ├── files/
│   ├── terminal/
│   └── manual_notes/
├── summaries/
│   ├── session_summary.md
│   ├── daily_report.md
│   ├── resume_prompt.md
│   ├── client_report.md
│   └── standup_report.md
├── privacy.json
└── theme.json
```

## 9.2 Event 스키마

```json
{
  "event_id": "evt_001",
  "session_id": "sess_001",
  "project_id": "proj_001",
  "timestamp_start": "2025-05-10T14:02:00+09:00",
  "timestamp_end": "2025-05-10T14:18:00+09:00",
  "type": "ai_conversation",
  "title": "Claude Code 대화 시작",
  "summary": "Mori 제품 방향에 대해 논의함.",
  "source_refs": ["src_claude_001"],
  "linked_issue_ids": [],
  "linked_decision_ids": [],
  "confidence": 0.86,
  "created_by": "ai",
  "user_modified": false
}
```

## 9.3 Issue 스키마

```json
{
  "issue_id": "iss_001",
  "project_id": "proj_001",
  "session_id": "sess_001",
  "title": "로컬 LLM 연결 방식 미정",
  "description": "Ollama, LM Studio, OpenAI-compatible endpoint 중 기본 연결 방식을 결정해야 함.",
  "status": "open",
  "priority": "high",
  "source_event_ids": ["evt_003", "evt_008"],
  "suggested_next_action": "MVP에서는 Ollama를 기본값으로 두고 LM Studio는 선택 옵션으로 제공한다.",
  "created_at": "2025-05-10T15:05:00+09:00",
  "updated_at": "2025-05-10T15:42:00+09:00"
}
```

## 9.4 Decision 스키마

```json
{
  "decision_id": "dec_001",
  "project_id": "proj_001",
  "session_id": "sess_001",
  "title": "그래프 중심이 아니라 타임라인 중심 UI로 간다",
  "decision": "Mori의 메인 화면은 좌→우 Narrative Timeline으로 설계한다.",
  "rationale": "작업 기록은 시간 흐름 기반으로 이해하는 것이 자연스럽고, 그래프는 복잡해지기 쉽기 때문.",
  "rejected_options": ["전체 그래프 중심 UI", "위아래 세로 로그만 제공"],
  "impact": ["Timeline Main View가 핵심 화면이 됨", "Trace View는 보조 기능으로 제한"],
  "source_event_ids": ["evt_004", "evt_007"],
  "created_at": "2025-05-10T14:37:00+09:00"
}
```

## 9.5 Relationship 스키마

```json
{
  "relationship_id": "rel_001",
  "from_id": "evt_002",
  "from_type": "event",
  "to_id": "dec_001",
  "to_type": "decision",
  "relation": "led_to",
  "confidence": 0.82,
  "reason": "경쟁 제품 조사 후 기억 검색이 아닌 작업 흐름 복원으로 포지션을 바꾸는 결정으로 이어짐."
}
```

Relationship 타입:

- led_to
- caused
- supported
- contradicted
- created_issue
- resolved_issue
- influenced_decision
- produced_artifact
- split_from
- merged_into

---

# 10. AI 분석 엔진

## 10.1 분석 단계

Mori는 두 단계로 분석한다.

## Quick Pass

세션 종료 직후 빠르게 실행.

생성물:

- 기본 타임라인
- 세션 요약
- 주요 이슈 3~5개
- 주요 결정
- 다음 액션 초안

## Deep Pass

백그라운드에서 천천히 실행.

생성물:

- 상세 이슈
- 상세 결정
- 관계 계산
- Flow Focus 경로
- Resume Prompt
- 보고서
- split/merge 추천

## 10.2 주요 AI 태스크

- Event summarization
- Event classification
- Issue extraction
- Decision extraction
- Relationship mapping
- Next action generation
- Resume prompt generation
- Report generation
- Similar issue detection
- Split/merge suggestion
- Sensitive info redaction support

## 10.3 로컬 LLM 우선 전략

Mori는 로컬-first 앱이다.

초기 지원:

- Ollama
- LM Studio
- OpenAI-compatible local endpoint
- Cloud API optional

기본값:

- 로컬 LLM 우선
- 사용자가 원할 때만 Cloud API 사용

---

# 11. 작업 수집 전략

## 11.1 이 장의 목적

Mori의 제품 가치는 사용자가 AI와 함께 일한 흐름을 얼마나 정확하고 신뢰감 있게 가져오느냐에 달려 있다.

그러나 Mori는 사용자의 컴퓨터 전체를 몰래 감시하는 앱이 아니다. Mori는 **사용자가 선택한 작업 세션에서 신뢰 가능한 소스들을 수집하고, 이를 AI가 의미 있는 타임라인으로 재구성하는 앱**이다.

따라서 Mori의 작업 수집 전략은 다음 원칙을 따른다.

1. 모든 것을 100% 자동으로 수집하려 하지 않는다.
2. 신뢰 가능한 소스부터 수집한다.
3. 사용자가 명시적으로 시작한 세션만 기록한다.
4. 원본 데이터와 AI 추론 데이터를 구분한다.
5. 확정 이벤트, 관찰 이벤트, 추론 이벤트의 신뢰도를 다르게 표시한다.
6. 민감한 데스크톱 작업은 기본적으로 수집하지 않는다.
7. 사용자가 언제든 수집 범위와 보관 방식을 통제할 수 있어야 한다.

Mori의 정확한 제품 문구는 다음과 같아야 한다.

> Mori는 사용자가 선택한 작업 세션에서 AI 대화, 코드 변경, 브라우저 메모, 수동 기록 같은 신뢰 가능한 소스를 모아 작업 흐름을 타임라인으로 복원합니다.

Mori가 말하면 안 되는 문구:

> Mori는 모든 데스크톱 작업을 자동으로 정확히 이해합니다.

이는 과장이고, 프라이버시 측면에서도 위험하다.

---

## 11.2 수집 가능한 작업의 범위

Mori가 수집할 수 있는 작업은 크게 세 가지로 나뉜다.

### 1. AI 대화 기반 작업

사용자가 Claude, ChatGPT, Codex, Cursor 등에서 질문하거나 대화한 내용이다.

이 경우 실제 파일 변경이 없어도 Mori는 다음을 정리할 수 있다.

- 논의 주제
- 사용자의 질문
- AI의 답변 요약
- 생긴 결정
- 남은 이슈
- 다음 액션
- 이어하기 프롬프트

예:

```text
사용자: 이 앱의 타임라인 UI를 좌→우로 해야 할까, 위→아래로 해야 할까?
AI: 좌→우는 흐름을 시각적으로 보여주기 좋고, 위→아래는 스크롤에 유리합니다...
```

Mori가 생성할 수 있는 이벤트:

```text
Event: 타임라인 방향 논의
Decision Candidate: Mori는 좌→우 타임라인을 기본으로 하되, 세로 모드는 보조 옵션으로 검토
Issue: 같은 시간대에 여러 이벤트가 있을 때 lane 구조 필요
```

### 2. AI 실행 기반 작업

Claude Code, Codex, Cursor 같은 도구가 실제로 파일을 수정하거나 명령을 실행한 경우다.

이 경우 Mori는 훨씬 더 정확한 작업 흐름을 만들 수 있다.

수집 가능 항목:

- 사용자 프롬프트
- AI 응답
- 도구 사용
- 파일 변경
- 생성/수정/삭제된 파일
- 터미널 명령
- 오류와 해결 과정
- git diff
- 테스트 결과

예:

```text
Claude Code가 timeline_renderer.tsx 수정
Codex가 event_schema.json 생성
터미널에서 npm test 실행
Git diff 발생
```

Mori가 생성할 수 있는 이벤트:

```text
14:10 Timeline Renderer 수정
14:18 Event Schema 생성
14:25 테스트 실패
14:32 오류 수정
14:40 테스트 통과
```

### 3. 데스크톱/브라우저 보조 작업

브라우저 조사, 문서 작성, 파일 편집, 터미널 작업 등이다.

이 영역은 앱별로 접근 가능 범위가 다르기 때문에, Mori는 처음부터 완전 자동 수집을 목표로 하지 않는다.

수집 가능한 것:

- 사용자가 추가한 브라우저 링크
- 선택한 텍스트
- 현재 탭 제목/URL
- 선택한 프로젝트 폴더의 파일 변경
- git diff
- 수동 메모
- opt-in active window metadata

수집하기 어려운 것:

- 모든 앱의 내부 상태
- Figma 내부 레이어 변경 전체
- Notion/Docs 내부 작성 내용 전체
- 카카오톡/메신저 대화 자동 수집
- 모든 화면의 의미
- 사용자의 의도 전체

따라서 Mori는 데스크톱 작업을 “완벽히 읽는” 앱이 아니라, **작업 세션에 필요한 신뢰 가능한 단서들을 수집하는 앱**으로 설계한다.

---

## 11.3 Claude Code 수집 전략

Claude Code는 Mori와 가장 잘 붙을 수 있는 1차 통합 대상이다.

이유는 Claude Code가 세션 단위 작업, 사용자 프롬프트, 도구 사용, 파일 변경, 종료 이벤트 등과 연결될 수 있는 구조를 제공하기 때문이다.

### 11.3.1 Claude Code에서 수집할 항목

Mori가 Claude Code에서 수집하려는 항목은 다음과 같다.

- 세션 시작
- 세션 종료
- 사용자 프롬프트
- Claude 응답 요약
- 도구 사용 전 이벤트
- 도구 사용 후 이벤트
- 파일 변경 이벤트
- 작업 디렉토리
- 실행한 명령
- 오류/실패 이벤트
- 최종 결과

### 11.3.2 Claude Code 수집 방식 A: Hook 기반 실시간 수집

가장 좋은 방식은 Claude Code의 hook 또는 lifecycle event에 Mori collector를 연결하는 것이다.

흐름:

```text
Mori Start Session
  ↓
Claude Code 작업 시작
  ↓
Claude Code hook 발생
  ↓
Mori local collector가 이벤트 수신
  ↓
events.jsonl에 저장
  ↓
Stop Mori 후 분석
```

수집 이벤트 예:

```text
SessionStart
UserPromptSubmit
PreToolUse
PostToolUse
FileChanged
Stop
SessionEnd
```

Mori 이벤트 변환 예:

```json
{
  "source": "claude_code",
  "type": "ai_tool_use",
  "title": "Claude modified timeline_renderer.tsx",
  "timestamp_start": "2025-05-10T14:18:00+09:00",
  "source_refs": ["claude_hook_001"],
  "confidence": 0.95,
  "trust_level": "verified"
}
```

장점:

- 실시간 수집 가능
- 구조화된 이벤트 수집 가능
- 파일 변경과 AI 대화를 연결하기 좋음
- Mori Timeline 생성 정확도가 높음

단점:

- 사용자가 integration을 설정해야 함
- Claude Code 이벤트 포맷 변화에 대응해야 함
- 모든 환경에서 동일하게 동작하지 않을 수 있음

### 11.3.3 Claude Code 수집 방식 B: Transcript / Log Import

MVP에서는 hook보다 import가 더 현실적일 수 있다.

사용자는 Claude Code 세션 transcript 또는 export 가능한 로그를 Mori에 가져온다.

흐름:

```text
Import Claude Code Session
  ↓
Mori가 transcript/log 파싱
  ↓
AI 대화/도구 사용/파일 변경 후보 추출
  ↓
Timeline 생성
```

장점:

- 구현이 빠름
- 기존 작업 세션도 가져올 수 있음
- 사용자가 직접 선택하므로 프라이버시 부담이 적음

단점:

- 실시간성이 없음
- 로그 포맷 변경 가능성
- 일부 정보가 누락될 수 있음

### 11.3.4 Claude Code 최종 전략

```text
MVP:
- Claude Code transcript/log import
- git diff 보완

Alpha:
- Claude Code hook integration
- session event collector

Beta:
- Claude Code 세션을 Mori Timeline에 실시간 반영
```

---

## 11.4 Codex 수집 전략

Codex는 Claude Code와 마찬가지로 Mori의 핵심 통합 대상이다.

다만 Codex는 환경과 버전에 따라 transcript 저장 방식과 CLI 동작이 달라질 수 있으므로, Mori는 특정 내부 경로 하나에 의존하면 안 된다.

Codex 수집은 다음 세 가지 방식을 조합한다.

### 11.4.1 Codex 수집 방식 A: Transcript Import

Codex가 로컬에 저장한 세션 transcript 또는 export 가능한 대화 기록을 Mori가 import한다.

흐름:

```text
Import Codex Session
  ↓
transcript 선택
  ↓
Mori가 prompt/response/tool event 파싱
  ↓
Timeline 이벤트 생성
```

장점:

- MVP에 적합
- 사용자가 기존 세션도 가져올 수 있음
- Codex 작업의 대화 흐름을 파악 가능

단점:

- 내부 저장 위치/포맷이 바뀔 수 있음
- 모든 이벤트가 구조적으로 들어있지 않을 수 있음

### 11.4.2 Codex 수집 방식 B: Mori Wrapper

Mori가 Codex CLI 실행을 감싸는 wrapper를 제공한다.

예:

```bash
mori codex
```

또는:

```bash
mori run codex
```

이 wrapper는 Codex CLI를 실행하면서 Mori 세션에 다음 정보를 기록한다.

- 실행 시작 시각
- 종료 시각
- working directory
- git branch
- stdout/stderr 요약
- exit status
- 세션 중 변경된 파일
- 세션 종료 후 git diff

장점:

- Codex 내부 transcript 포맷에 덜 의존
- CLI 작업과 Mori 세션을 안정적으로 연결 가능
- git diff와 함께 쓰면 작업 결과 신뢰도가 높음

단점:

- 사용자가 Mori wrapper로 Codex를 실행해야 함
- Codex의 interactive UI와 충돌하지 않도록 구현해야 함
- prompt 내용을 완벽히 수집하지 못할 수 있음

### 11.4.3 Codex 수집 방식 C: Git Diff 보완

Codex 대화 수집이 불완전해도, 실제 작업 결과는 git diff로 높은 신뢰도로 확인할 수 있다.

Mori는 세션 시작 시점과 종료 시점의 git 상태를 비교한다.

Start Mori 시점:

```text
- current branch
- HEAD commit
- git status
- working tree snapshot
```

Stop Mori 시점:

```text
- git diff
- changed files
- untracked files
- staged files
- commit messages if any
```

이를 통해 Mori는 다음을 알 수 있다.

- 어떤 파일이 바뀌었는지
- 어떤 코드가 추가/삭제됐는지
- 어떤 산출물이 생겼는지
- 어떤 변경이 AI 대화 이후 발생했는지

### 11.4.4 Codex 최종 전략

```text
MVP:
- Codex transcript import
- git diff import

Alpha:
- mori codex wrapper
- terminal session metadata 수집

Beta:
- Codex log 경로 자동 감지
- Codex 세션과 Mori 세션 자동 연결
```

---

## 11.5 ChatGPT / Claude 웹 대화 수집 전략

ChatGPT와 Claude 웹 대화는 데스크톱 앱이 직접 읽으면 안 된다. 기술적으로도 제한이 많고, 프라이버시 측면에서도 위험하다.

따라서 Mori는 웹 대화를 **브라우저 확장 기반의 사용자 액션 방식**으로 수집한다.

### 11.5.1 브라우저 확장 역할

Mori Browser Extension은 사용자가 명시적으로 추가한 웹 컨텍스트만 Mori 세션에 보낸다.

가능한 액션:

- Add current tab to Mori
- Add selected text to Mori
- Add selected tabs to Mori
- Import this AI conversation
- Add page note

### 11.5.2 수집 가능한 항목

- 페이지 제목
- URL
- 선택한 텍스트
- 사용자가 복사/export한 대화
- 현재 보이는 대화 내용
- 사용자가 선택한 탭 목록
- 수동 메모

### 11.5.3 수집하지 말아야 할 항목

기본적으로 다음은 수집하지 않는다.

- 모든 브라우저 페이지 자동 수집
- 모든 ChatGPT/Claude 대화 자동 scraping
- incognito tab
- 금융 사이트
- 비밀번호/계정 페이지
- private messenger
- 사용자가 추가하지 않은 페이지 내용

### 11.5.4 데스크톱 앱과 연결

브라우저 확장은 Native Messaging 또는 local HTTP bridge를 통해 Mori Desktop과 통신한다.

권장 구조:

```text
Browser Extension
  ↓
Native Messaging 또는 localhost bridge
  ↓
Mori Tauri Backend
  ↓
Current Session
  ↓
events.jsonl / sources/browser
```

### 11.5.5 웹 대화 최종 전략

```text
MVP:
- 대화 복사/붙여넣기
- URL 수동 추가

Alpha:
- Chrome Extension: Add selected text / Add current tab

Beta:
- AI conversation import helper
- selected tabs batch import
```

---

## 11.6 데스크톱 작업 수집 전략

일반 데스크톱 작업 수집은 가장 민감하고 어려운 영역이다.

Mori는 컴퓨터 전체를 자동으로 감시하지 않는다. 대신 사용자가 선택한 프로젝트와 앱에 대해서만 제한적으로 수집한다.

### 11.6.1 선택한 프로젝트 폴더 파일 변경

사용자가 Start Mori 시 프로젝트 폴더를 선택한다.

Mori는 해당 폴더 내부의 파일 변경만 감지한다.

수집 항목:

- 파일 생성
- 파일 수정
- 파일 삭제
- 파일명 변경
- timestamp
- file extension
- git diff if available

수집하지 않는 것:

- 전체 디스크 감시
- 시스템 폴더 감시
- 사용자 홈 전체 감시
- 민감 폴더 자동 감시

### 11.6.2 Git Integration

개발 작업에서는 Git이 가장 신뢰도 높은 소스다.

수집 항목:

- current branch
- HEAD commit
- git status
- git diff
- changed files
- staged files
- commit messages
- untracked files

Git 기반 이벤트는 `Verified`로 표시할 수 있다.

### 11.6.3 Active Window Metadata

나중에 opt-in으로 추가할 수 있는 기능이다.

수집 항목:

- app name
- process name
- window title
- start/end time
- duration

예:

```text
14:05 VS Code - timeline_renderer.tsx
14:12 Chrome - screenpipe docs
14:20 Terminal - mori project
```

주의:

- 창 제목에 민감정보가 포함될 수 있음
- 기본값으로 꺼져 있어야 함
- Summary Mode에서는 원본 창 제목을 저장하지 않고 앱 수준 요약만 저장 가능

### 11.6.4 Terminal Command Tracking

터미널 입력 전체를 몰래 기록하면 안 된다. Mori는 wrapper 또는 shell integration 기반으로 제한 수집한다.

수집 가능 항목:

- command
- cwd
- start/end time
- exit code
- duration
- stdout summary if opted in

민감정보 처리:

- API key 패턴 redaction
- password/token 포함 명령 필터링
- raw output 저장은 opt-in

권장 방식:

```bash
mori shell
```

또는:

```bash
mori run npm test
```

### 11.6.5 수동 메모

수동 메모는 항상 지원해야 한다.

Mori의 자동 분석은 완벽하지 않다. 사용자가 직접 남긴 메모는 가장 신뢰도 높은 이벤트 중 하나다.

예:

```text
“이 결정은 나중에 다시 봐야 함”
“고객 요청이 범위 초과일 수 있음”
“이 오류는 아직 해결 안 됨”
```

수동 메모는 `Verified / User Note`로 표시한다.

---

## 11.7 Source Adapter 구조

Mori는 모든 데이터를 하나의 방식으로 직접 읽지 않는다. 각 수집 원천마다 Source Adapter를 둔다.

```text
Source Adapters
├── ClaudeCodeAdapter
├── CodexAdapter
├── ChatGPTImportAdapter
├── BrowserExtensionAdapter
├── GitAdapter
├── FileWatcherAdapter
├── TerminalAdapter
├── ActiveWindowAdapter
├── ManualNoteAdapter
└── GenericImportAdapter
```

각 adapter의 역할:

1. 원본 데이터를 읽는다.
2. 민감정보를 1차 필터링한다.
3. Mori 표준 Event로 변환한다.
4. source reference를 저장한다.
5. trust level을 부여한다.

표준화 흐름:

```text
Raw Source
  ↓
Source Adapter
  ↓
Normalized Event
  ↓
Local DB
  ↓
Timeline / Issue / Decision Analysis
```

---

## 11.8 Trust Level / 정확도 모델

Mori는 모든 이벤트를 같은 신뢰도로 취급하면 안 된다.

각 이벤트는 신뢰도 레벨을 가진다.

## Level 1: Verified

원본 근거가 명확한 이벤트.

예:

- git diff
- file changed
- Claude Code hook event
- Codex transcript import
- user manual note
- explicit browser Add to Mori

표시:

```text
Verified
```

## Level 2: Observed

시스템이 관찰했지만 의미 해석은 필요한 이벤트.

예:

- active window title
- terminal command summary
- browser tab title
- file watcher event

표시:

```text
Observed
```

## Level 3: Inferred

AI가 추론한 이벤트.

예:

- 이 대화에서 이 결정이 생겼다
- 이 이슈가 남았다
- 이 이벤트가 저 이벤트로 이어졌다
- 이 작업은 고객 범위 초과일 수 있다

표시:

```text
Inferred
```

Mori UI는 이 신뢰도 레벨을 명확히 보여줘야 한다.

예:

```text
Decision: 타임라인 중심 UI로 간다
Trust: Inferred from Claude conversation + user confirmation pending
```

사용자가 확인하면:

```text
Trust: Verified by user
```

---

## 11.9 실제 수집 가능성 판단

## Claude Code

가능성: 높음

가능한 것:

- 사용자 프롬프트
- AI 응답/도구 사용
- session lifecycle
- 파일 변경 후보
- 작업 디렉토리

전략:

```text
MVP: transcript/log import
Alpha: hooks
Beta: live session bridge
```

## Codex CLI

가능성: 중상

가능한 것:

- transcript import
- wrapper 기반 세션 metadata
- git diff
- changed files

전략:

```text
MVP: transcript import + git diff
Alpha: mori codex wrapper
Beta: automatic session detection
```

## ChatGPT / Claude Web

가능성: 중간

가능한 것:

- selected text
- visible conversation import
- URL/title
- manual Add to Mori

전략:

```text
MVP: copy/paste import
Alpha: browser extension
Beta: selected tabs / conversation helper
```

## 일반 데스크톱 작업

가능성: 중간 이하에서 중간

가능한 것:

- selected folder file changes
- git diff
- active window metadata with opt-in
- terminal wrapper logs
- manual notes

어려운 것:

- 모든 앱 내부 상태
- 모든 화면 의미 이해
- 사용자의 전체 의도 파악

전략:

```text
MVP: selected files + git + manual note
Alpha: file watcher + terminal wrapper
Beta: opt-in active window tracking
```

---

## 11.10 MVP 수집 범위

Mori MVP는 다음만 수집한다.

1. AI 대화 import
2. Claude/ChatGPT/Codex 대화 붙여넣기 또는 파일 import
3. Git diff import
4. 브라우저 URL 수동 추가
5. 수동 메모
6. 선택한 프로젝트 폴더의 파일 변경 import 또는 스냅샷 비교

MVP에서 하지 않는 것:

1. 전체 화면 녹화
2. 전체 브라우저 자동 수집
3. 키보드 입력 기록
4. 메신저 자동 수집
5. 모든 앱 내부 상태 추적
6. 24/7 기록

---

## 11.11 Alpha 수집 범위

Alpha에서는 다음을 추가한다.

1. Claude Code hooks
2. Codex wrapper
3. file watcher
4. Chrome extension basic
5. local LLM background analysis
6. relationship extraction

---

## 11.12 Beta 수집 범위

Beta에서는 다음을 추가한다.

1. active window metadata opt-in
2. terminal shell integration
3. selected tabs batch import
4. deeper Cursor/VS Code integration
5. Figma/Notion/Docs manual import helpers
6. split/merge assistant 강화

---

## 11.13 금지해야 할 수집 방식

Mori는 다음을 기본 기능으로 제공하면 안 된다.

### 1. 키로깅

절대 금지.

### 2. 24/7 화면 녹화 기본값

절대 금지. 사용자가 명시적으로 켜는 실험 기능으로도 매우 조심해야 한다.

### 3. 모든 창 제목 무제한 저장

창 제목에는 민감정보가 들어갈 수 있다.

### 4. private messenger 자동 수집

기본 금지.

### 5. password manager / banking / incognito 수집

기본 차단.

### 6. 모든 앱 내부 상태를 이해한다고 주장

제품 신뢰를 해치는 과장이다.

---

## 11.14 사용 흐름별 수집 예시

## Claude Code 작업 예시

```text
1. Mori에서 Start Session
2. 프로젝트 폴더 선택
3. Claude Code integration 활성화
4. 사용자가 Claude Code에서 작업
5. Claude hook이 prompt/tool/file 이벤트 전달
6. Mori가 git diff로 변경사항 보완
7. Stop Session
8. Mori가 Timeline/Issue/Decision 생성
```

## Codex 작업 예시

```text
1. Mori에서 Start Session
2. Mori가 git baseline 저장
3. 사용자가 mori codex 또는 Codex CLI 사용
4. Mori가 transcript/log 또는 wrapper metadata 수집
5. Stop Session
6. Mori가 git diff 계산
7. Mori가 대화 + diff를 합쳐 Timeline 생성
```

## 브라우저 조사 예시

```text
1. Mori Chrome Extension 설치
2. Start Session
3. 사용자가 중요한 탭에서 Add to Mori 클릭
4. 선택 텍스트와 URL이 현재 session에 추가됨
5. Stop Session
6. Mori가 Research Event로 정리
```

## 프리랜서 고객 작업 예시

```text
1. Mori에서 Client Project Session 시작
2. 고객 피드백 텍스트를 수동 추가
3. 참고 링크를 브라우저 확장으로 추가
4. 작업 파일 변경 감지
5. Stop Session
6. Mori가 작업 보고서와 범위 변경 가능성을 생성
```

---

## 11.15 제품 메시지 가이드

Mori가 말해야 하는 것:

> Mori captures selected work sessions from trusted sources like AI conversations, code changes, browser notes, and manual context — then reconstructs them into a timeline.

한국어:

> Mori는 사용자가 선택한 작업 세션에서 AI 대화, 코드 변경, 브라우저 메모, 수동 기록 같은 신뢰 가능한 소스를 모아 작업 흐름을 타임라인으로 복원합니다.

Mori가 말하면 안 되는 것:

> Mori automatically understands everything you do on your computer.

한국어:

> Mori는 컴퓨터에서 하는 모든 일을 자동으로 이해합니다.

---

## 11.16 최종 수집 전략 요약

Mori의 수집 전략은 다음과 같다.

```text
MVP:
AI 대화 import + git diff + 수동 링크/메모

Alpha:
Claude Code hooks + Codex wrapper + file watcher + browser extension

Beta:
active window opt-in tracking + terminal integration + deeper app integrations

Later:
선택적 화면 캡처 / 고급 앱별 integration / 팀 공유
```

핵심 철학:

> **Mori는 감시 앱이 아니라, 사용자가 선택한 작업 세션을 기억하는 앱이다.**

# 12. 기술 스택

## 11.1 최종 기술 결정

Mori는 **Tauri v2**로 만든다.

이유:

- Electron보다 가볍다.
- Rust 백엔드로 로컬 파일, DB, LLM, 백그라운드 작업을 다루기 좋다.
- macOS/Windows 지원에 적합하다.
- 웹 UI 기반으로 만들 수 있다.
- 로컬-first 제품 철학과 맞다.

## 11.2 최종 스택

```text
Desktop Framework: Tauri v2
Frontend: React + TypeScript + Vite
Styling: Tailwind CSS + Radix UI / shadcn-style components
State: Zustand
Async State: TanStack Query
Timeline Rendering MVP: Custom React + SVG
Timeline Rendering V2: PixiJS
Backend: Rust
Async Runtime: Tokio
Local DB: SQLite
Search: SQLite FTS5
Vector Search V2: sqlite-vec 또는 sqlite-vector
Local LLM: Ollama + LM Studio + OpenAI-compatible endpoint
Browser Extension: TypeScript + WXT
Package Format: .mori zip-like package
Export: Markdown first, PDF/HTML later
```

## 11.3 앱 구조

```text
mori/
├── apps/
│   ├── desktop/
│   │   ├── src-tauri/
│   │   └── src/
│   ├── web/
│   └── extension/
├── packages/
│   ├── ui/
│   ├── timeline/
│   ├── core-types/
│   ├── prompts/
│   └── mori-format/
├── crates/
│   ├── mori-core/
│   ├── mori-db/
│   ├── mori-llm/
│   ├── mori-capture/
│   └── mori-package/
└── docs/
```

## 11.4 데이터 파이프라인

```text
Input Capture
  ↓
Event Normalization
  ↓
Local Storage
  ↓
Redaction
  ↓
Chunking
  ↓
Local LLM Summarization
  ↓
Timeline Generation
  ↓
Issue / Decision Extraction
  ↓
Relationship Mapping
  ↓
Resume Prompt / Report Generation
  ↓
.mori Package
```

---

# 12. 프라이버시 설계

## 12.1 원칙

1. 기본 로컬 저장
2. 기본 세션 기반 기록
3. 앱별 opt-in
4. 민감 앱 기본 차단
5. raw data 삭제 옵션
6. 요약만 저장하는 모드 제공
7. 사용자가 언제든 전체 삭제 가능
8. 클라우드 사용은 명시적 선택

## 12.2 민감 앱 기본 차단

- password manager
- banking
- private messenger
- health apps
- incognito browser
- keychain
- system password prompt
- 2FA apps

## 12.3 데이터 보관 모드

### Summary Mode

기본값.

- 원본은 임시 처리 후 삭제
- 요약/이슈/결정/타임라인만 저장

### Full Mode

- 원본 로그와 요약 모두 저장
- 개발자/감사/상세 추적용

### Ephemeral Mode

- 리포트만 생성
- 세션 데이터 삭제 가능
- 민감 프로젝트용

---

# 13. MVP 정의

## 13.1 MVP 이름

**Mori Alpha: Local AI Work Timeline**

## 13.2 MVP 목표

사용자가 AI와 함께한 하나의 작업 세션을 기록하고, 이를 Narrative Timeline, Flow Focus, Issue Garden, Decision Log, Resume Prompt로 변환한다.

## 13.3 MVP 포함 기능

1. Tauri 데스크톱 앱
2. React 기반 UI
3. Start Mori / Stop Mori
4. 세션 이름/프로젝트 설정
5. 기록 모드 설정
6. Claude/ChatGPT/Codex 대화 import
7. 브라우저 링크 수동 추가
8. Git diff 또는 파일 변경 import
9. Ollama 또는 LM Studio 연결
10. Quick Pass 분석
11. Narrative Timeline 생성
12. Lane 기반 좌→우 타임라인
13. Event Detail Panel
14. Flow Focus 기본 구현
15. Issue Garden 생성
16. Decision Log 생성
17. Resume Prompt 생성
18. Markdown Report export
19. `.mori` 파일 저장/열기
20. Formal Theme 기본 제공

## 13.4 MVP 제외 기능

1. 24/7 화면 기록
2. 마이크 상시 녹음
3. 모든 앱 자동 감시
4. 복잡한 팀 협업
5. 모바일 앱
6. 자동 Jira/Notion/Slack 동기화
7. AI가 직접 업무 실행
8. 완전 자동 브라우저 기록
9. 고급 vector search

---

# 14. 개발 로드맵

## Phase 0: UI Prototype

목표:

- 핵심 화면 구현
- 더미 데이터로 Timeline/Flow Focus 확인

작업:

- Home 화면
- Timeline Main View
- Flow Focus 상태
- Issue/Decision 화면
- Resume/Report 화면

## Phase 1: Desktop Shell

목표:

- Tauri 앱 기초 완성

작업:

- Tauri v2 설정
- React/Vite UI 연결
- SQLite 연결
- `.mori` 저장/열기
- 기본 프로젝트/세션 관리

## Phase 2: Import MVP

목표:

- 수동 import 기반 실제 사용 가능

작업:

- AI 대화 붙여넣기/import
- Markdown/text import
- Git diff import
- URL 수동 추가
- Quick Pass 분석

## Phase 3: Local LLM Integration

목표:

- 로컬 LLM으로 분석 가능

작업:

- Ollama provider
- LM Studio provider
- OpenAI-compatible provider
- prompt templates
- 분석 job queue

## Phase 4: Timeline + Flow Focus

목표:

- Mori의 핵심 UX 완성

작업:

- lane timeline
- relationship data
- hover highlight
- dimmed context
- Trace panel
- split/merge basic

## Phase 5: Browser Extension

목표:

- 브라우저 작업 수집

작업:

- selected tabs capture
- page title/URL 저장
- selected text 저장
- Mori desktop 전달

## Phase 6: Vibe Coding Mode

목표:

- AI coding workflow 특화

작업:

- Claude Code 로그 import
- Codex CLI 로그 import
- Cursor/VS Code 파일 변경 감지
- standup report

## Phase 7: Freelancer Mode

목표:

- 고객 프로젝트 보고 기능 강화

작업:

- client report template
- scope change detection
- billing summary
- customer email draft

---

# 15. 수익 모델

## Free

- 월 5개 Mori 세션
- 기본 타임라인
- 로컬 저장
- Markdown export

## Pro

예상 가격: 월 $12–19

포함:

- 무제한 Mori 세션
- 로컬 LLM 연결
- Issue Garden
- Decision Log
- Resume Prompt
- Flow Focus
- Markdown/PDF export
- Formal/Forest/Night Lake 테마

## Freelancer

예상 가격: 월 $19–29

포함:

- 고객 프로젝트별 Mori
- 고객 보고서 export
- 작업 청구 리포트
- 범위 변경 감지
- 브랜드 없는 PDF export

## Team

예상 가격: seat당 월 $10–20

포함:

- 공유 프로젝트 Mori
- 팀 이슈/결정 관리
- 권한 관리
- Slack/Linear/Jira 연동

---

# 16. 성공 지표

## 16.1 Activation

- 첫 Mori 세션 생성률
- 첫 세션 완료율
- 첫 타임라인 조회율
- 첫 Resume Prompt 복사율

## 16.2 Retention

- 주간 Mori 세션 수
- 동일 프로젝트에 반복 세션 추가 비율
- 2주차 재사용률
- Resume Prompt 사용 후 재방문율

## 16.3 Value

- 자동 생성된 이슈 수
- 사용자가 해결 처리한 이슈 수
- Flow Focus 사용 횟수
- Decision Log 조회 횟수
- Report export 횟수

## 16.4 Monetization

- Pro 전환율
- Freelancer report export 후 결제율
- 월간 활성 유료 사용자 수

---

# 17. 리스크와 대응

## 17.1 기존 제품과 겹칠 위험

겹치는 제품군:

- Dayflow
- screenpipe
- SpecStory
- Pieces
- Rewind/Recall
- LLM Wiki

대응:

- Mori는 “검색 가능한 기억”이 아니라 “다시 이어갈 수 있는 작업 흐름”으로 포지션한다.
- 메인 기능은 Timeline, Flow Focus, Issue Garden, Decision Log, Resume Prompt다.

## 17.2 프라이버시 불안

대응:

- Start Mori 기반
- 로컬 저장
- Summary Mode 기본
- 민감 앱 차단
- raw data 삭제 옵션
- 클라우드 명시적 opt-in

## 17.3 타임라인 복잡성

대응:

- lane 구조
- zoom/grouping
- 필터
- mini map
- Flow Focus
- Split/Merge Assistant

## 17.4 AI 요약 품질 문제

대응:

- 원본 소스 확인 가능
- 사용자가 이벤트 수정 가능
- confidence 표시
- split/merge/relationship 수정 가능

## 17.5 로컬 LLM 성능 문제

대응:

- Quick Pass / Deep Pass 분리
- cloud API 선택 옵션
- 백그라운드 분석 허용
- 작은 모델용 prompt 최적화

---

# 18. 최종 제품 정의

**Mori는 사용자가 선택한 업무 세션을 로컬에서 조용히 기록하고, AI와 함께한 작업 흐름을 Narrative Timeline, Flow Focus, Issue Garden, Decision Log, Resume Prompt, Report로 재구성해주는 개인 업무 기억 앱이다.**

Mori는 위키가 아니다.

Mori는 업무관리 앱이 아니다.

Mori는 일을 대신하는 에이전트가 아니다.

Mori는 사용자가 일한 흐름을 잃어버리지 않게 해주는 조용한 기억이다.

---

# 19. 제품을 만드는 데 필요한 핵심 화면 우선순위

## 1순위

- Timeline Main View
- Start Mori / Session Setup
- Event Detail Panel

## 2순위

- Flow Focus / Trace View
- Issue Garden / Decision Log
- Resume View

## 3순위

- Home / Mori Grove
- Report Export View
- Sources / Evidence View
- Settings / Privacy / Local AI

## 4순위

- Split / Merge Assistant
- Project View
- Browser Extension UI
- Team Sharing UI

---

# 20. 다음 실행 계획

## Step 1: UI Prototype

- React/Vite로 주요 화면 5개 구현
- 더미 데이터로 Timeline/Flow Focus 구현
- Formal Theme 우선

## Step 2: `.mori` 스키마 v0.1 확정

- Event
- Issue
- Decision
- Relationship
- Source
- Summary

## Step 3: Tauri Shell 구축

- 앱 실행
- 파일 저장/열기
- SQLite 연결
- 세션 생성

## Step 4: LLM 분석 MVP

- AI 대화 text import
- Ollama 분석
- Timeline/Issue/Decision 생성

## Step 5: 첫 실제 사용 테스트

테스트할 세션:

1. Mori 제품 기획 대화
2. Claude Code 개발 세션
3. 프리랜서 고객 프로젝트 더미 세션

검증 질문:

- 타임라인이 실제로 이해하기 쉬운가?
- Flow Focus가 강력하게 느껴지는가?
- Resume Prompt가 바로 쓸 수 있는가?
- Issue Garden이 단순 요약보다 유용한가?
- 사용자가 이걸 다시 쓰고 싶은가?

---

# 21. 최종 한 문장

> **Mori는 AI와 함께 일한 과정을 잃어버리지 않게 해주는 로컬 작업 기억 앱이다. 작업이 끝나면 Mori는 그 흐름을 타임라인, 이슈, 결정, 다음 액션으로 정리하고, 사용자가 언제든 다시 이어갈 수 있게 만든다.**
