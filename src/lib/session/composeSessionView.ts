import type { MockSession, SourceRef, Summary, TimelineEvent } from "../../domain/types";
import type { StoredSessionDraft, StoredSessionImport } from "../storage/storageTypes";

export type ComposedSessionView = MockSession & {
  isDemo: boolean;
};

export function composeSessionView(input: {
  draft: StoredSessionDraft;
  imports: StoredSessionImport[];
}): ComposedSessionView {
  const sources: SourceRef[] = input.imports.map((entry) => entry.source);
  const events: TimelineEvent[] = input.imports.flatMap((entry) => entry.events);

  const earliestEvent = events.reduce<string | null>((acc, event) => {
    if (!acc) return event.start;
    return new Date(event.start).getTime() < new Date(acc).getTime() ? event.start : acc;
  }, null);
  const latestEvent = events.reduce<string | null>((acc, event) => {
    const candidate = event.end ?? event.start;
    if (!acc) return candidate;
    return new Date(candidate).getTime() > new Date(acc).getTime() ? candidate : acc;
  }, null);

  const startedAt = earliestEvent ?? input.draft.session.startedAt;
  const endedAt = latestEvent ?? input.draft.session.endedAt;

  const summary: Summary = {
    id: `summary-${input.draft.session.id}`,
    sessionId: input.draft.session.id,
    sessionSummary: events.length
      ? `가져온 이벤트 ${events.length}개 · 분석 대기 중`
      : "세션에 가져온 자료 없음. 자료 탭에서 메모·URL·AI 대화를 추가하세요.",
    resumePrompt: "분석을 실행하면 이 세션의 이어가기 프롬프트가 생성됩니다.",
    reportMarkdown: "",
    nextActionIds: [],
    generatedAt: input.draft.savedAt,
  };

  return {
    project: input.draft.project,
    session: {
      ...input.draft.session,
      startedAt,
      endedAt,
    },
    sources,
    events,
    issues: [],
    decisions: [],
    relationships: [],
    artifacts: [],
    nextActions: [],
    summary,
    isDemo: false,
  };
}
