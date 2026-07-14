# Screen specifications · M1-M8

Visual mockups were produced during R0 (2026-07-15) and approved; this file
is their textual contract. Shared example data set: 7/15 오늘 "MORI 기록
Workspace 재설계" (업무, 09:40-11:10, MORI project, Mori-organized); 7/14
어제 "러닝 1시간" (운동, 18:25, 지난주 대비 +20분), "Lynx Station 분리 ·
실사용자화 · 리소스 사용률 상세 계획" (긴 노트, tcc-ng-gw), "Activity와
Memory를 분리해야 한다" (인사이트, 시간 미정 · 추정); 미정 트레이 "3시간
공부", "지식 관리 영상 시청"; 예정 7/18 "주간 리뷰".

Every screen follows: calm density, copy diet, Korean-first copy, no
internal vocabulary, no left-border selection accents, purple as accent
only.

## M1 · 기본 Workspace (R3)

Purpose: the daily home of the ledger. Priority: composer > strip (if any) >
today > previous days. Components: collapsed composer, 확인할 것 strip,
day-grouped timeline rows, context rail (time mode).

Row anatomy: time column (fixed width; 추정 in orange; 시간 미정 label) ·
kind chip · title · meta line (project chip, source, deltas, Mori dot).
Long notes render a 2-line preview + 펼쳐 보기. Behaviours: row click →
rail inspector; day click in mini calendar → scroll/filter; strip click →
M5 flow.

States: loading = skeleton rows under stable composer; empty = M7; error =
inline notice with 다시 불러오기 (composer stays usable).

## M2 · AI 구조화 결과 (R2)

Purpose: the review state of the composer. Priority: what Mori understood >
per-candidate corrections > save actions. Header "기록 N건으로 이해했어요"
+ engine name + "왜 이렇게 나눴나요?" disclosure.

Candidate card (base): type chip+select, editable title, date chip with
basis+evidence, context chip, 제외. Expanded: all properties, applied
rules, source excerpt, rationale, confidence, merge/split. auto/provisional
candidates collapse into one summary row; confirm cards are expanded.

Footer: [N건 모두 저장] [원문만 저장] (병합·분리 확장점) + "저장 후에도
되돌릴 수 있어요". Failure variant in the same slot: cause + 다시 시도 /
직접 정리 / 나중에 + 원문 보관 고지 (engine-missing vs parse-failure are
distinct copy).

## M3 · 형식 기반 빠른 입력 (R1)

Purpose: repeat entry without friction. Format chips (자동 default,
recents, 모든 형식). The form is generated from `SchemaPropertyDefinition[]`
(label, type, required, options, unit); required fields lead; optional fields
render as quiet hints. Below: recent entries of that schema + repetition
hint ("화·목 3주째 → 루틴으로 만들기", R6). Escape hatch on every form:
"그냥 문장으로 써도 돼요".

## M4 · 원장 캘린더 (R5)

Purpose: the ledger over time. Month grid cells: kind marks, 1-2 titles,
+N, planned as outlined marks; today ringed; selected day opens rail
agenda. 날짜 미정 tray with drag-to-date (activity date; ⌥ = scheduled
date) and full non-drag fallback. Month/week toggle. Return to timeline
preserves selection. Reached by expanding the rail mini calendar (body
takeover, not a route).

## M5 · 날짜 확인 흐름 (R4)

Purpose: resolve date-unknown and low-confidence dates in one sitting.
Cards lead with the reason/evidence, then context-fit quick choices
(입력일로 / 전날 / 추정대로 / 날짜 선택 / 날짜 없이 유지). Footer notes the
rule-learning behaviour. Empty state: strip disappears entirely.

## M6 · 기록 상세 · 편집 (R5)

Purpose: the management center for one record. Short records use the rail
inspector; past a length/complexity threshold this full view opens.
Header actions: 재분석 · 분리 · 병합 · 보관 · 더보기. Main: editable
title/body, 원문 보기 disclosure. Side: 활동 날짜 (+basis label + capture
time), 프로젝트/컨텍스트, 엔티티, 관련 기록, 기록 이력 (actor-distinct
entries, per-entry 되돌리기). Provenance dots: purple = Mori
extracted/proposed, gray = user-entered.

## M7 · 빈 상태 (R3)

First-run: one centered composer with a concrete example placeholder, three
sample chips ("어제 책 50쪽 읽음" 등), the promise line "Mori가 종류와
날짜를 알아서 정리하고, 저장 전에 보여드려요", and a quiet agent-connect
pointer to 설정. No empty timeline or empty calendar is shown.

## M8 · 주간 리뷰 (R6)

Week strip (per-day kind bars), then aggregate rows written as sentences:
업무 N건 + decisions, 운동 횟수/시간 + delta + routine suggestion, insights
with a connect prompt. This is where the old 합계 lens lives; the rail
carries only the one-line week summary.
