import type { ConnectorSourceImportSummary } from "../connectors";

export type ImportReviewSummaryStatus = "ready" | "attention" | "waiting" | "blocked";

export type ImportReviewSummaryItemId = "source" | "duplicates" | "review" | "apply";

export type ImportReviewSummaryItem = {
  id: ImportReviewSummaryItemId;
  title: string;
  status: ImportReviewSummaryStatus;
  statusLabel: string;
  detail: string;
};

export type ImportReviewSummaryInput = {
  eventCount: number;
  acceptedCount: number;
  discardedCount: number;
  pendingCount: number;
  meta?: {
    newEventCount?: number;
    duplicateSkippedCount?: number;
    duplicateIncludedCount?: number;
    invalidLineCount?: number;
    includeDuplicates?: boolean;
    currentSessionDuplicateCount?: number;
    savedSessionDuplicateCount?: number;
    inBatchDuplicateCount?: number;
    savedSessionHistoryAvailable?: boolean;
    sourceImportSummary?: ConnectorSourceImportSummary;
  } | null;
};

export type ImportReviewSummaryViewModel = {
  headline: string;
  detail: string;
  items: ImportReviewSummaryItem[];
};

export function buildImportReviewSummary(
  input: ImportReviewSummaryInput,
): ImportReviewSummaryViewModel {
  const duplicateCount = getDuplicateCount(input);
  const invalidCount =
    input.meta?.invalidLineCount ??
    input.meta?.sourceImportSummary?.invalidLineCount ??
    0;
  const acceptedCount = input.acceptedCount;
  const pendingCount = input.pendingCount;

  const items: ImportReviewSummaryItem[] = [
    buildSourceItem(input, invalidCount),
    buildDuplicateItem(input, duplicateCount),
    buildReviewItem(input),
    buildApplyItem(input),
  ];

  return {
    headline:
      acceptedCount > 0
        ? `${acceptedCount}개 이벤트가 적용 준비되었습니다`
        : pendingCount > 0
          ? `${pendingCount}개 이벤트가 검토 대기 중입니다`
          : "수락된 이벤트가 아직 없습니다",
    detail:
      duplicateCount > 0
        ? "적용 전에 중복이 식별됩니다. 의도적으로 포함하거나 검토 후 결정하세요."
        : "이벤트를 수락하고 적용하기 전까지 세션에 어떤 것도 기록되지 않습니다.",
    items,
  };
}

function buildSourceItem(
  input: ImportReviewSummaryInput,
  invalidCount: number,
): ImportReviewSummaryItem {
  const summary = input.meta?.sourceImportSummary;
  if (summary) {
    if (summary.status === "invalidOnly") {
      return {
        id: "source",
        title: "출처 상태",
        status: "blocked",
        statusLabel: "잘못된 항목",
        detail: `${invalidCount}개의 잘못된 줄을 먼저 수정해야 유효한 이벤트를 검토할 수 있습니다.`,
      };
    }
    if (summary.status === "duplicateOnly") {
      return {
        id: "source",
        title: "출처 상태",
        status: "attention",
        statusLabel: "이미 가져온 항목",
        detail: "이 출처는 Mori가 이미 본 connector 이벤트로만 이루어진 것으로 보입니다.",
      };
    }
    if (summary.status === "partialReimport") {
      return {
        id: "source",
        title: "출처 상태",
        status: "attention",
        statusLabel: "부분 재가져오기",
        detail: `새 이벤트 ${summary.newEventCount}개와 중복 이벤트 ${summary.duplicateEventCount}개가 감지되었습니다.`,
      };
    }
    if (summary.status === "historyUnavailable") {
      return {
        id: "source",
        title: "출처 상태",
        status: "attention",
        statusLabel: "기록 부분 확인",
        detail: "저장 세션 기록을 사용할 수 없어 현재 세션과 이 파일 내부의 중복만 확인했습니다.",
      };
    }
  }

  if (input.eventCount === 0) {
    return {
      id: "source",
      title: "출처 상태",
      status: "blocked",
      statusLabel: "이벤트 없음",
      detail: "이 가져오기에서는 검토할 Timeline 이벤트가 생성되지 않았습니다.",
    };
  }

  return {
    id: "source",
    title: "출처 상태",
    status: "ready",
    statusLabel: "검토 가능",
    detail: `${input.eventCount}개의 Timeline 이벤트가 검토 준비되었습니다.`,
  };
}

function buildDuplicateItem(
  input: ImportReviewSummaryInput,
  duplicateCount: number,
): ImportReviewSummaryItem {
  const included = input.meta?.duplicateIncludedCount ?? 0;
  const includeDuplicates = input.meta?.includeDuplicates === true;
  const historyAvailable = input.meta?.savedSessionHistoryAvailable;

  if (duplicateCount === 0 && included === 0) {
    return {
      id: "duplicates",
      title: "중복 처리",
      status: historyAvailable === false ? "attention" : "ready",
      statusLabel: historyAvailable === false ? "제한적" : "깨끗",
      detail:
        historyAvailable === false
          ? "저장 세션 기록을 사용할 수 없어 현재 세션과 이 파일 내부의 중복만 확인했습니다."
          : "이번 검토에서 connector 중복은 감지되지 않았습니다.",
    };
  }

  if (includeDuplicates || included > 0) {
    return {
      id: "duplicates",
      title: "중복 처리",
      status: "attention",
      statusLabel: "포함됨",
      detail: `중복 가져오기가 명시적으로 활성화되어 ${included || duplicateCount}개의 중복 이벤트가 포함됩니다.`,
    };
  }

  return {
    id: "duplicates",
    title: "중복 처리",
    status: "attention",
    statusLabel: "건너뜀",
    detail: `${duplicateCount}개의 중복 이벤트는 중복 포함 옵션으로 다시 가져오지 않는 한 제외됩니다.`,
  };
}

function buildReviewItem(input: ImportReviewSummaryInput): ImportReviewSummaryItem {
  if (input.pendingCount > 0) {
    return {
      id: "review",
      title: "검토 진행",
      status: "attention",
      statusLabel: "대기 중",
      detail: `${input.pendingCount}개의 이벤트가 수락 · 편집 · 폐기 결정을 기다리고 있습니다.`,
    };
  }
  if (input.acceptedCount > 0) {
    return {
      id: "review",
      title: "검토 진행",
      status: "ready",
      statusLabel: "검토 완료",
      detail: `수락 ${input.acceptedCount}개 · 폐기 ${input.discardedCount}개로 처리되었습니다.`,
    };
  }
  return {
    id: "review",
    title: "검토 진행",
    status: "waiting",
    statusLabel: "수락 없음",
    detail: "Timeline에 적용하기 전에 적어도 1개의 이벤트를 수락하세요.",
  };
}

function buildApplyItem(input: ImportReviewSummaryInput): ImportReviewSummaryItem {
  if (input.acceptedCount === 0) {
    return {
      id: "apply",
      title: "적용 효과",
      status: "waiting",
      statusLabel: "비활성",
      detail: "적어도 1개의 이벤트를 수락해야 적용이 활성화됩니다.",
    };
  }
  return {
    id: "apply",
    title: "적용 효과",
    status: "ready",
    statusLabel: "기록 예정",
    detail: `수락된 ${input.acceptedCount}개 이벤트가 세션 Timeline에 추가됩니다. 이슈 · 결정 · 다음 액션은 이후 Quick Pass에서 도출됩니다.`,
  };
}

function getDuplicateCount(input: ImportReviewSummaryInput): number {
  const summary = input.meta?.sourceImportSummary;
  if (summary) return summary.duplicateEventCount;
  const split =
    (input.meta?.currentSessionDuplicateCount ?? 0) +
    (input.meta?.savedSessionDuplicateCount ?? 0) +
    (input.meta?.inBatchDuplicateCount ?? 0);
  if (split > 0) return split;
  return input.meta?.duplicateSkippedCount ?? 0;
}
