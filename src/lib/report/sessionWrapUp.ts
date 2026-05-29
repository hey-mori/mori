export type SessionWrapUpStepId = "capture" | "review" | "memory" | "handoff";

export type SessionWrapUpStepStatus = "done" | "ready" | "attention" | "waiting";

export type SessionWrapUpActionId =
  | "addEvidence"
  | "runQuickPass"
  | "reviewMemory"
  | "reviewMemoryHealth"
  | "reviewHandoff"
  | "waitForAnalysis";

export type SessionWrapUpUnresolvedKind = "issue" | "decision" | "nextAction";

export type SessionWrapUpUnresolvedItem = {
  id: string;
  kind: SessionWrapUpUnresolvedKind;
  title: string;
  detail: string;
};

/**
 * One accepted memory that the wrap-up should surface for lifecycle
 * review before handoff (status === "stale" | "contradicted"). The
 * Reports surface renders these as deep-link rows that open the
 * accepted-memory provenance drawer.
 */
export type SessionWrapUpAttentionMemory = {
  id: string;
  title: string;
  status: "stale" | "contradicted";
};

export type SessionWrapUpInput = {
  sourceCount: number;
  eventCount: number;
  issueCount: number;
  decisionCount: number;
  nextActionCount: number;
  importCount: number;
  hasAnalysis: boolean;
  analysisRunning: boolean;
  canRunQuickPass: boolean;
  acceptedMemoryCount: number;
  auditActionCount: number;
  staleMemoryCount: number;
  contradictedMemoryCount: number;
  unresolvedItems?: readonly SessionWrapUpUnresolvedItem[];
  /**
   * Optional per-memory list driving the lifecycle-review preview. When
   * omitted the wrap-up still uses `staleMemoryCount` and
   * `contradictedMemoryCount` for step status and primary action —
   * passing the records is additive.
   */
  attentionMemories?: readonly SessionWrapUpAttentionMemory[];
  resumePromptReady: boolean;
};

export type SessionWrapUpStep = {
  id: SessionWrapUpStepId;
  label: string;
  status: SessionWrapUpStepStatus;
  statusLabel: string;
  detail: string;
};

export type SessionWrapUpAction = {
  id: SessionWrapUpActionId;
  label: string;
  detail: string;
  enabled: boolean;
};

export type SessionWrapUpViewModel = {
  steps: SessionWrapUpStep[];
  primaryAction: SessionWrapUpAction;
  unresolved: {
    total: number;
    preview: SessionWrapUpUnresolvedItem[];
    hiddenCount: number;
  };
  attentionMemories: {
    total: number;
    preview: SessionWrapUpAttentionMemory[];
    hiddenCount: number;
  };
};

export function buildSessionWrapUp(input: SessionWrapUpInput): SessionWrapUpViewModel {
  const hasEvidence = input.sourceCount > 0 || input.eventCount > 0 || input.importCount > 0;
  const hasReviewedWork =
    input.hasAnalysis ||
    input.issueCount > 0 ||
    input.decisionCount > 0 ||
    input.nextActionCount > 0;
  const attentionMemoryCount = input.staleMemoryCount + input.contradictedMemoryCount;

  const steps: SessionWrapUpStep[] = [
    {
      id: "capture",
      label: "자료 캡처됨",
      status: hasEvidence ? "done" : "attention",
      statusLabel: hasEvidence ? "준비됨" : "자료 필요",
      detail: hasEvidence
        ? `출처 ${input.sourceCount}개와 타임라인 이벤트 ${input.eventCount}개가 이 세션에 있습니다.`
        : "지속 가능한 인계 자료를 만들려면 먼저 명시적인 자료를 추가하세요.",
    },
    {
      id: "review",
      label: "세션 검토됨",
      status: input.analysisRunning ? "waiting" : hasReviewedWork ? "done" : hasEvidence ? "ready" : "attention",
      statusLabel: input.analysisRunning ? "실행 중" : hasReviewedWork ? "검토됨" : hasEvidence ? "준비됨" : "대기 중",
      detail: input.analysisRunning
        ? "Quick Pass 실행 중 — 완료되면 검토 결과가 표시됩니다."
        : hasReviewedWork
          ? `이슈 ${input.issueCount}개, 결정 ${input.decisionCount}개, 다음 액션 ${input.nextActionCount}개가 있습니다.`
          : hasEvidence
            ? "캡처된 자료를 이슈·결정·다음 액션으로 변환하려면 Quick Pass를 실행하세요."
            : "자료를 가져온 후 검토를 시작할 수 있습니다.",
    },
    {
      id: "memory",
      label: "프로젝트 메모리 저장됨",
      status:
        input.acceptedMemoryCount > 0
          ? attentionMemoryCount > 0
            ? "attention"
            : "done"
          : hasReviewedWork
            ? "ready"
            : "attention",
      statusLabel:
        input.acceptedMemoryCount > 0
          ? attentionMemoryCount > 0
            ? "검토 필요"
            : "저장됨"
          : hasReviewedWork
            ? "검토"
            : "아직 없음",
      detail:
        input.acceptedMemoryCount > 0
          ? attentionMemoryCount > 0
            ? `승인된 메모리 ${input.acceptedMemoryCount}건 저장됨 — 인계 전 ${describeAttentionMemory(input)}`
            : `승인된 메모리 ${input.acceptedMemoryCount}건 · 감사 액션 ${input.auditActionCount}건.`
          : hasReviewedWork
            ? "검토된 사실을 지속적인 승인 메모리로 만들려면 프로젝트 메모리를 여세요."
            : "세션에서 검토된 자료가 생기면 승인 메모리를 만들 수 있습니다.",
    },
    {
      id: "handoff",
      label: "인계 준비",
      status: input.resumePromptReady ? "ready" : hasEvidence ? "attention" : "waiting",
      statusLabel: input.resumePromptReady ? "준비됨" : hasEvidence ? "검토 필요" : "대기 중",
      detail: input.resumePromptReady
        ? "Resume 프롬프트와 .mori 내보내기가 준비되었습니다."
        : "유용한 인계 자료를 만들려면 자료와 Quick Pass 또는 데모 요약 데이터가 필요합니다.",
    },
  ];

  return {
    steps,
    primaryAction: choosePrimaryAction(input, { hasEvidence, hasReviewedWork }),
    unresolved: buildUnresolvedPreview(input.unresolvedItems ?? []),
    attentionMemories: buildAttentionMemoryPreview(input.attentionMemories ?? []),
  };
}

function choosePrimaryAction(
  input: SessionWrapUpInput,
  derived: { hasEvidence: boolean; hasReviewedWork: boolean },
): SessionWrapUpAction {
  if (!derived.hasEvidence) {
    return {
      id: "addEvidence",
      label: "자료 추가",
      detail: "자료 추적을 위해 먼저 명시적인 가져오기를 시작하세요.",
      enabled: true,
    };
  }
  if (input.analysisRunning) {
    return {
      id: "waitForAnalysis",
      label: "Quick Pass 실행 중",
      detail: "Mori가 캡처된 자료에서 검토 자료를 도출하는 중입니다.",
      enabled: false,
    };
  }
  if (!derived.hasReviewedWork) {
    return {
      id: "runQuickPass",
      label: "Quick Pass 실행",
      detail: "이슈, 결정, 다음 액션을 생성하고 Resume 프롬프트를 강화합니다.",
      enabled: input.canRunQuickPass,
    };
  }
  if (input.acceptedMemoryCount === 0) {
    return {
      id: "reviewMemory",
      label: "프로젝트 메모리 검토",
      detail: "다음 세션 전에 지속적인 승인 메모리로 전환할 항목을 결정하세요.",
      enabled: true,
    };
  }
  if (input.staleMemoryCount + input.contradictedMemoryCount > 0) {
    return {
      id: "reviewMemoryHealth",
      label: "메모리 상태 검토",
      detail: `${describeAttentionMemory(input)} 보고서나 Resume 프롬프트에 메모리를 사용하기 전에 검토하세요.`,
      enabled: true,
    };
  }
  return {
    id: "reviewHandoff",
    label: "인계 검토",
    detail: "Resume 프롬프트를 복사하거나 다음 작업 세션을 위한 .mori 패키지를 내보내세요.",
    enabled: true,
  };
}

function buildUnresolvedPreview(items: readonly SessionWrapUpUnresolvedItem[]): SessionWrapUpViewModel["unresolved"] {
  const preview = items.slice(0, 3).map((item) => ({ ...item }));
  return {
    total: items.length,
    preview,
    hiddenCount: Math.max(0, items.length - preview.length),
  };
}

function buildAttentionMemoryPreview(
  items: readonly SessionWrapUpAttentionMemory[],
): SessionWrapUpViewModel["attentionMemories"] {
  const preview = items.slice(0, 3).map((item) => ({ ...item }));
  return {
    total: items.length,
    preview,
    hiddenCount: Math.max(0, items.length - preview.length),
  };
}

function describeAttentionMemory(input: Pick<SessionWrapUpInput, "staleMemoryCount" | "contradictedMemoryCount">): string {
  const parts: string[] = [];
  if (input.staleMemoryCount > 0) {
    parts.push(`오래됨 ${input.staleMemoryCount}건`);
  }
  if (input.contradictedMemoryCount > 0) {
    parts.push(`모순 ${input.contradictedMemoryCount}건`);
  }
  const count = input.staleMemoryCount + input.contradictedMemoryCount;
  return `승인된 메모리 ${count}건에 라이프사이클 검토 필요${parts.length > 0 ? ` (${parts.join(", ")})` : ""}`;
}
