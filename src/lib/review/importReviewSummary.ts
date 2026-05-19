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
        ? `${acceptedCount} event${plural(acceptedCount)} ready to apply`
        : pendingCount > 0
          ? `${pendingCount} event${plural(pendingCount)} still need review`
          : "No accepted events yet",
    detail:
      duplicateCount > 0
        ? "Duplicates are identified before apply; review or include them deliberately."
        : "Nothing is written to the session until you accept events and apply.",
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
        title: "Source state",
        status: "blocked",
        statusLabel: "Invalid",
        detail: `${invalidCount} invalid line${plural(invalidCount)} must be fixed before useful events can be reviewed.`,
      };
    }
    if (summary.status === "duplicateOnly") {
      return {
        id: "source",
        title: "Source state",
        status: "attention",
        statusLabel: "Already imported",
        detail: "This source appears to contain only connector events Mori has already seen.",
      };
    }
    if (summary.status === "partialReimport") {
      return {
        id: "source",
        title: "Source state",
        status: "attention",
        statusLabel: "Partial re-import",
        detail: `${summary.newEventCount} new event${plural(summary.newEventCount)} and ${summary.duplicateEventCount} duplicate event${plural(summary.duplicateEventCount)} were detected.`,
      };
    }
    if (summary.status === "historyUnavailable") {
      return {
        id: "source",
        title: "Source state",
        status: "attention",
        statusLabel: "History partial",
        detail: "Saved-session history was unavailable, so duplicate detection only covered this session and this file.",
      };
    }
  }

  if (input.eventCount === 0) {
    return {
      id: "source",
      title: "Source state",
      status: "blocked",
      statusLabel: "No events",
      detail: "This import did not produce timeline events to review.",
    };
  }

  return {
    id: "source",
    title: "Source state",
    status: "ready",
    statusLabel: "Reviewable",
    detail: `${input.eventCount} extracted timeline event${plural(input.eventCount)} are ready for review.`,
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
      title: "Duplicate handling",
      status: historyAvailable === false ? "attention" : "ready",
      statusLabel: historyAvailable === false ? "Limited" : "Clear",
      detail:
        historyAvailable === false
          ? "Saved-session history was unavailable; only current-session and in-file duplicates were checked."
          : "No connector duplicates were detected for this review.",
    };
  }

  if (includeDuplicates || included > 0) {
    return {
      id: "duplicates",
      title: "Duplicate handling",
      status: "attention",
      statusLabel: "Included",
      detail: `${included || duplicateCount} duplicate event${plural(included || duplicateCount)} are included because duplicate import was explicitly enabled.`,
    };
  }

  return {
    id: "duplicates",
    title: "Duplicate handling",
    status: "attention",
    statusLabel: "Skipped",
    detail: `${duplicateCount} duplicate event${plural(duplicateCount)} will stay out unless you re-import with duplicates included.`,
  };
}

function buildReviewItem(input: ImportReviewSummaryInput): ImportReviewSummaryItem {
  if (input.pendingCount > 0) {
    return {
      id: "review",
      title: "Review progress",
      status: "attention",
      statusLabel: "Pending",
      detail: `${input.pendingCount} event${plural(input.pendingCount)} still need accept, edit, or discard.`,
    };
  }
  if (input.acceptedCount > 0) {
    return {
      id: "review",
      title: "Review progress",
      status: "ready",
      statusLabel: "Reviewed",
      detail: `${input.acceptedCount} accepted and ${input.discardedCount} discarded event${plural(input.discardedCount)}.`,
    };
  }
  return {
    id: "review",
    title: "Review progress",
    status: "waiting",
    statusLabel: "No accepts",
    detail: "Accept at least one event before applying this import to the Timeline.",
  };
}

function buildApplyItem(input: ImportReviewSummaryInput): ImportReviewSummaryItem {
  if (input.acceptedCount === 0) {
    return {
      id: "apply",
      title: "Apply effect",
      status: "waiting",
      statusLabel: "Disabled",
      detail: "Apply stays disabled until at least one event is accepted.",
    };
  }
  return {
    id: "apply",
    title: "Apply effect",
    status: "ready",
    statusLabel: "Will write",
    detail: `${input.acceptedCount} accepted event${plural(input.acceptedCount)} will be added to the session Timeline. Issues, decisions, and next actions are derived later by Quick Pass.`,
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

function plural(count: number): string {
  return count === 1 ? "" : "s";
}
