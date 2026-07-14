/**
 * System schemas · the seed set Mori ships.
 *
 * Schemas are data (architecture doc §3.2): these definitions live here as
 * versioned literals, and user-defined schemas are the same shape registered
 * at runtime. Search, calendar, contexts, analysis, and export operate on
 * the `MoriRecord` interface and read the schema for display / validation /
 * extraction, so adding a domain is an entry here (or a user schema), never
 * a code change elsewhere. Keep each schema minimal: properties earn their
 * place through a real consumer, not through anticipation.
 */
import type { SchemaDefinition } from "./kernelTypes";

export const SYSTEM_SCHEMAS: readonly SchemaDefinition[] = [
  {
    id: "activity",
    version: 1,
    scope: "system",
    name: "활동",
    description: "사용자가 한 일의 기본 단위. 시간과 맥락에 앵커된 사실 기록.",
    layer: "occurrence",
    properties: [
      { key: "durationMinutes", label: "소요 시간", type: "duration-minutes", metric: true, unit: "분" },
      { key: "outcome", label: "결과", type: "text" },
    ],
  },
  {
    id: "note",
    version: 1,
    scope: "system",
    name: "노트",
    description: "자유 메모. 본문이 곧 내용이며 구조화 속성이 없다.",
    layer: "occurrence",
    properties: [],
  },
  {
    id: "knowledge",
    version: 1,
    scope: "system",
    name: "지식",
    description: "자료·경험에서 정리된, 오래 쓰이는 앎.",
    layer: "distilled",
    properties: [{ key: "topic", label: "주제", type: "text" }],
  },
  {
    id: "insight",
    version: 1,
    scope: "system",
    name: "인사이트",
    description: "기록들 사이에서 얻은 해석과 적용 아이디어.",
    layer: "distilled",
    properties: [],
  },
  {
    id: "decision",
    version: 1,
    scope: "system",
    name: "결정",
    description: "내린 결정과 그 근거. 프로젝트 히스토리의 뼈대.",
    layer: "distilled",
    properties: [
      { key: "rationale", label: "근거", type: "text" },
      { key: "alternatives", label: "검토한 대안", type: "json" },
    ],
  },
  {
    id: "task",
    version: 1,
    scope: "system",
    name: "할 일",
    description: "해야 할 일. 기록에서 추출되거나 직접 만든다.",
    layer: "occurrence",
    properties: [
      { key: "due", label: "기한", type: "date" },
      { key: "done", label: "완료", type: "boolean" },
    ],
  },
  {
    id: "event",
    version: 1,
    scope: "system",
    name: "일정",
    description: "시간이 정해진 약속·회의·예정.",
    layer: "occurrence",
    properties: [{ key: "location", label: "장소", type: "text" }],
  },
  {
    id: "daily-entry",
    version: 1,
    scope: "system",
    name: "하루 기록",
    description: "하루 단위 요약. 그날의 활동에서 집계된다.",
    layer: "aggregate",
    properties: [],
  },
  {
    id: "agent-session",
    version: 1,
    scope: "system",
    name: "에이전트 세션",
    description: "AI 에이전트 작업 세션 하나. 레거시 세션은 어댑터로 이 스키마의 레코드가 된다.",
    layer: "occurrence",
    properties: [
      { key: "agentId", label: "에이전트", type: "text", required: true },
      { key: "stepCount", label: "단계 수", type: "number" },
      { key: "tokenCount", label: "토큰", type: "number" },
    ],
  },
  {
    id: "source-document",
    version: 1,
    scope: "system",
    name: "자료",
    description: "URL·글·문서 등 외부 자료의 기록. 원문은 Source에 보존된다.",
    layer: "source",
    properties: [
      { key: "url", label: "주소", type: "text" },
      { key: "author", label: "작성자", type: "text" },
      { key: "publishedAt", label: "게시일", type: "date" },
    ],
  },
  {
    id: "portfolio-item",
    version: 1,
    scope: "system",
    name: "포트폴리오",
    description: "프로젝트 이력에서 도출한 성과 문장과 근거.",
    layer: "distilled",
    properties: [],
  },
  {
    id: "workout",
    version: 1,
    scope: "system",
    name: "운동",
    description: "운동 기록. 자유 입력에서 구조화된다.",
    layer: "occurrence",
    properties: [
      { key: "durationMinutes", label: "운동 시간", type: "duration-minutes", metric: true, unit: "분" },
      { key: "exercises", label: "운동 항목", type: "json" },
    ],
  },
  {
    id: "study-session",
    version: 1,
    scope: "system",
    name: "학습",
    description: "공부 기록. 과목과 학습 항목을 담는다.",
    layer: "occurrence",
    properties: [
      { key: "subject", label: "과목", type: "text" },
      { key: "durationMinutes", label: "학습 시간", type: "duration-minutes", metric: true, unit: "분" },
      { key: "items", label: "학습 항목", type: "json" },
    ],
  },
  {
    id: "investment-entry",
    version: 1,
    scope: "system",
    name: "투자 기록",
    description: "투자 판단·감정·관찰의 기록. Mori는 조언하지 않는다.",
    layer: "occurrence",
    properties: [
      { key: "instrument", label: "대상", type: "text" },
      { key: "action", label: "행동", type: "select", options: ["매수", "매도", "관찰", "메모"] },
      { key: "emotion", label: "감정", type: "text" },
    ],
  },
  {
    id: "meeting",
    version: 1,
    scope: "system",
    name: "회의",
    description: "회의 기록. 결정과 후속 작업이 여기서 추출된다.",
    layer: "occurrence",
    properties: [{ key: "attendees", label: "참석자", type: "entity-list", entityType: "person" }],
  },
  {
    id: "reflection",
    version: 1,
    scope: "system",
    name: "회고",
    description: "하루·주간 회고와 묵상. 사용자 산문이며 파일 소유 후보.",
    layer: "occurrence",
    properties: [{ key: "mood", label: "기분", type: "text" }],
  },
] as const;

export function getSystemSchema(id: string): SchemaDefinition | undefined {
  return SYSTEM_SCHEMAS.find((schema) => schema.id === id);
}
