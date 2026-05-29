import type { MoriPackageExportPlan } from "./moriPackageExportPlan";

export type HandoffReadinessStatus = "ready" | "attention" | "waiting";

export type HandoffReadinessActionId =
  | "copyResume"
  | "runQuickPass"
  | "addEvidence"
  | "reviewMemory"
  | "reviewMemoryHealth"
  | "openReportBuilder"
  | "openPackageExport";

export type HandoffReadinessAction = {
  id: HandoffReadinessActionId;
  label: string;
  enabled: boolean;
};

export type HandoffReadinessItemId = "resume" | "report" | "package";

export type HandoffReadinessItem = {
  id: HandoffReadinessItemId;
  title: string;
  status: HandoffReadinessStatus;
  statusLabel: string;
  detail: string;
  basis: string[];
  action: HandoffReadinessAction;
};

export type HandoffReadinessViewModel = {
  headline: string;
  detail: string;
  items: HandoffReadinessItem[];
};

export type HandoffReadinessInput = {
  sourceCount: number;
  eventCount: number;
  issueCount: number;
  decisionCount: number;
  nextActionCount: number;
  hasAnalysis: boolean;
  analysisRunning: boolean;
  canRunQuickPass: boolean;
  acceptedMemoryCount: number;
  staleMemoryCount: number;
  contradictedMemoryCount: number;
  resumePromptReady: boolean;
  exportPlan: MoriPackageExportPlan;
};

export function buildHandoffReadiness(
  input: HandoffReadinessInput,
): HandoffReadinessViewModel {
  const hasEvidence = input.sourceCount > 0 || input.eventCount > 0;
  const hasReview =
    input.hasAnalysis ||
    input.issueCount > 0 ||
    input.decisionCount > 0 ||
    input.nextActionCount > 0;
  const packageHasContent =
    hasEvidence ||
    input.acceptedMemoryCount > 0 ||
    input.exportPlan.full.auditRows > 0;

  const items: HandoffReadinessItem[] = [
    buildResumeItem(input, { hasEvidence, hasReview }),
    buildReportItem(input, { hasEvidence, hasReview }),
    buildPackageItem(input, { packageHasContent }),
  ];
  const readyCount = items.filter((item) => item.status === "ready").length;
  const attentionCount = items.filter((item) => item.status === "attention").length;
  const attentionMemoryCount = countAttentionMemory(input);

  return {
    headline:
      readyCount === items.length
        ? "인계 준비가 완료되었습니다"
        : `인계 항목 ${readyCount}/${items.length} 준비 완료`,
    detail:
      attentionMemoryCount > 0
        ? "이후 인계를 활용하기 전에 승인된 메모리 상태를 검토하세요."
        : attentionCount > 0
        ? "세션 외부로 공유하기 전에 주의 항목을 검토하세요."
        : "다음 담당자나 도구에 맞는 출력을 선택하세요.",
    items,
  };
}

function buildResumeItem(
  input: HandoffReadinessInput,
  derived: { hasEvidence: boolean; hasReview: boolean },
): HandoffReadinessItem {
  if (input.resumePromptReady) {
    if (countAttentionMemory(input) > 0) {
      return {
        id: "resume",
        title: "Resume 프롬프트",
        status: "attention",
        statusLabel: "메모리 검토 필요",
        detail: "연속 프롬프트를 사용할 수 있지만, 먼저 승인된 메모리 상태 검토가 필요합니다.",
        basis: [
          derived.hasReview ? "가능한 경우 검토된 세션 출력을 사용합니다." : "캡처된 세션 요약 데이터를 사용합니다.",
          describeAttentionMemory(input),
        ],
        action: { id: "reviewMemoryHealth", label: "메모리 검토", enabled: true },
      };
    }
    return {
      id: "resume",
      title: "Resume 프롬프트",
      status: "ready",
      statusLabel: "준비됨",
      detail: "Claude, Codex, ChatGPT 또는 다음 세션을 위한 연속 프롬프트가 준비되었습니다.",
      basis: [
        derived.hasReview ? "가능한 경우 검토된 세션 출력을 사용합니다." : "캡처된 세션 요약 데이터를 사용합니다.",
        input.acceptedMemoryCount > 0
          ? `승인된 메모리 ${input.acceptedMemoryCount}건이 연속성에 활용됩니다.`
          : "아직 승인된 메모리가 없습니다.",
      ],
      action: { id: "copyResume", label: "프롬프트 복사", enabled: true },
    };
  }

  if (input.analysisRunning) {
    return {
      id: "resume",
      title: "Resume 프롬프트",
      status: "waiting",
      statusLabel: "실행 중",
      detail: "Quick Pass가 검토 자료를 도출하는 중입니다.",
      basis: ["분석이 완료되면 프롬프트가 더 강화됩니다."],
      action: { id: "runQuickPass", label: "Quick Pass 실행 중", enabled: false },
    };
  }

  if (derived.hasEvidence) {
    return {
      id: "resume",
      title: "Resume 프롬프트",
      status: "attention",
      statusLabel: "검토 필요",
      detail: "Quick Pass를 실행하여 자료 기반 연속 프롬프트를 강화하세요.",
      basis: [`출처 ${input.sourceCount}개와 이벤트 ${input.eventCount}개가 캡처되었습니다.`],
      action: { id: "runQuickPass", label: "Quick Pass 실행", enabled: input.canRunQuickPass },
    };
  }

  return {
    id: "resume",
    title: "Resume 프롬프트",
    status: "waiting",
    statusLabel: "대기 중",
    detail: "유용한 연속 컨텍스트를 생성하려면 명시적인 자료를 먼저 추가하세요.",
    basis: ["Mori는 숨겨진 모니터링으로 작업을 추론하지 않습니다."],
    action: { id: "addEvidence", label: "자료 추가", enabled: true },
  };
}

function buildReportItem(
  input: HandoffReadinessInput,
  derived: { hasEvidence: boolean; hasReview: boolean },
): HandoffReadinessItem {
  if (!derived.hasEvidence) {
    return {
      id: "report",
      title: "보고서",
      status: "waiting",
      statusLabel: "대기 중",
      detail: "보고서를 생성할 수 있지만, 빈 보고서는 유용한 인계 자료가 아닙니다.",
      basis: ["보고서 섹션이 인용할 자료를 먼저 추가하세요."],
      action: { id: "addEvidence", label: "자료 추가", enabled: true },
    };
  }

  if (!derived.hasReview) {
    return {
      id: "report",
      title: "보고서",
      status: "attention",
      statusLabel: "초안",
      detail: "Markdown 및 HTML 내보내기를 사용할 수 있지만, 검토된 이슈나 결정이 아직 없습니다.",
      basis: [
        `출처 ${input.sourceCount}개와 이벤트 ${input.eventCount}개가 포함되어 있습니다.`,
        "결정 중심 보고서를 공유하기 전에 Quick Pass를 실행하세요.",
      ],
      action: { id: "openReportBuilder", label: "빌더 열기", enabled: true },
    };
  }

  if (countAttentionMemory(input) > 0) {
    return {
      id: "report",
      title: "보고서",
      status: "attention",
      statusLabel: "메모리 검토 필요",
      detail: "보고서 내보내기를 사용할 수 있지만, 공유 전에 메모리 기반 컨텍스트를 검토하세요.",
      basis: [
        `이슈 ${input.issueCount}개, 결정 ${input.decisionCount}개, 다음 액션 ${input.nextActionCount}개.`,
        describeAttentionMemory(input),
      ],
      action: { id: "reviewMemoryHealth", label: "메모리 검토", enabled: true },
    };
  }

  return {
    id: "report",
    title: "보고서",
    status: "ready",
    statusLabel: "준비됨",
    detail: "Report Builder에서 검토된 세션 상태를 Markdown 또는 HTML로 내보낼 수 있습니다.",
    basis: [
      `이슈 ${input.issueCount}개, 결정 ${input.decisionCount}개, 다음 액션 ${input.nextActionCount}개.`,
      input.acceptedMemoryCount > 0
        ? "승인된 메모리를 보고서 대상에 따라 포함할 수 있습니다."
        : "프로젝트 메모리가 아직 승인되지 않았습니다. 현재 세션 섹션은 계속 내보낼 수 있습니다.",
    ],
    action: { id: "openReportBuilder", label: "보고서 검토", enabled: true },
  };
}

function buildPackageItem(
  input: HandoffReadinessInput,
  derived: { packageHasContent: boolean },
): HandoffReadinessItem {
  if (!derived.packageHasContent) {
    return {
      id: "package",
      title: ".mori 패키지",
      status: "waiting",
      statusLabel: "대기 중",
      detail: "패키지를 만들 수 있지만, 아직 유용한 자료가 포함되지 않습니다.",
      basis: ["인계 패키지를 내보내기 전에 자료를 추가하세요."],
      action: { id: "addEvidence", label: "자료 추가", enabled: true },
    };
  }

  const full = input.exportPlan.full;
  const safe = input.exportPlan.clientSafe;
  const excludesMemory = safe.droppedMemories > 0 || safe.droppedAuditRows > 0;
  const attentionMemoryCount = countAttentionMemory(input);
  const needsMemoryReview = attentionMemoryCount > 0;
  const status: HandoffReadinessStatus = excludesMemory || needsMemoryReview ? "attention" : "ready";

  return {
    id: "package",
    title: ".mori 패키지",
    status,
    statusLabel: needsMemoryReview ? "메모리 검토 필요" : excludesMemory ? "안전 검토 필요" : "준비됨",
    detail: needsMemoryReview
      ? "패키지를 내보낼 수 있지만, 인계 전에 승인된 메모리 상태를 검토하세요."
      : excludesMemory
      ? "전체 내보내기와 클라이언트 안전 내보내기를 사용할 수 있습니다. 클라이언트 안전 버전은 일부 메모리 기록을 의도적으로 제외합니다."
      : "패키지 패널에서 전체 내보내기와 클라이언트 안전 내보내기를 사용할 수 있습니다.",
    basis: [
      `전체: 출처 ${full.sources}개, 이벤트 ${full.events}개, 메모리 기록 ${full.memories}건, 감사 행 ${full.auditRows}건.`,
      `클라이언트 안전: 메모리 기록 ${safe.memories}건 유지, ${safe.droppedMemories}건 · 감사 ${safe.droppedAuditRows}건 제외.`,
      ...(needsMemoryReview ? [describeAttentionMemory(input)] : []),
    ],
    action: {
      id: needsMemoryReview ? "reviewMemoryHealth" : "openPackageExport",
      label: needsMemoryReview ? "메모리 검토" : "내보내기 검토",
      enabled: true,
    },
  };
}

function countAttentionMemory(
  input: Pick<HandoffReadinessInput, "staleMemoryCount" | "contradictedMemoryCount">,
): number {
  return input.staleMemoryCount + input.contradictedMemoryCount;
}

function describeAttentionMemory(
  input: Pick<HandoffReadinessInput, "staleMemoryCount" | "contradictedMemoryCount">,
): string {
  const parts: string[] = [];
  if (input.staleMemoryCount > 0) parts.push(`오래됨 ${input.staleMemoryCount}건`);
  if (input.contradictedMemoryCount > 0) {
    parts.push(`모순 ${input.contradictedMemoryCount}건`);
  }
  const count = countAttentionMemory(input);
  return `승인된 메모리 ${count}건에 라이프사이클 검토가 필요합니다${parts.length > 0 ? ` (${parts.join(", ")})` : ""}.`;
}
