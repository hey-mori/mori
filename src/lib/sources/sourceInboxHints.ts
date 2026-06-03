import type { ConnectorInboxFile, ConnectorInboxListing } from "../desktop";
import type { ConnectorJsonlPreview } from "../connectors";

export const SOURCE_INBOX_PREVIEW_LIMIT = 3;

const ALL_CONNECTOR_FAMILIES = [
  "claude-code",
  "codex-cli",
  "opencode-cli",
  "local-capture",
  "mcp",
  "terminal",
  "git",
  "other",
] as const;

const INBOX_FAMILIES_BY_PROVIDER: Record<string, string[]> = {
  claude: ["claude-code"],
  codex: ["codex-cli"],
  opencode: ["opencode-cli"],
  terminal: ["local-capture", "terminal"],
  git: ["local-capture", "git"],
  note: ["local-capture"],
  ide: ["local-capture"],
  mcp: ["mcp"],
  connector: [...ALL_CONNECTOR_FAMILIES],
};

export type SourceInboxHint = {
  providerId: string;
  families: string[];
  files: ConnectorInboxFile[];
  latestFile: ConnectorInboxFile | null;
  fileCount: number;
  rootPath: string;
  rootExists: boolean;
};

export type SourceInboxFreshness = {
  status: "new" | "partial" | "duplicate" | "empty" | "invalid" | "unknown";
  tone: "green" | "orange" | "gray" | "red";
  label: string;
  detail: string;
};

export function getInboxFamiliesForProvider(providerId: string): string[] {
  return [...(INBOX_FAMILIES_BY_PROVIDER[providerId] ?? [])];
}

export function buildSourceInboxHint(
  providerId: string,
  inbox: ConnectorInboxListing,
  limit: number = SOURCE_INBOX_PREVIEW_LIMIT,
): SourceInboxHint | null {
  const families = getInboxFamiliesForProvider(providerId);
  if (families.length === 0) return null;

  const familySet = new Set(families);
  const files = inbox.files
    .filter((file) => familySet.has(file.connectorFamily))
    .sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));

  return {
    providerId,
    families,
    files: files.slice(0, Math.max(0, limit)),
    latestFile: files[0] ?? null,
    fileCount: files.length,
    rootPath: inbox.rootPath,
    rootExists: inbox.rootExists,
  };
}

export function describeSourceInboxFreshness(
  preview: Pick<
    ConnectorJsonlPreview,
    | "kind"
    | "invalidLineCount"
    | "newEventCount"
    | "duplicateEventCount"
    | "currentSessionDuplicateCount"
    | "savedSessionDuplicateCount"
    | "inBatchDuplicateCount"
    | "savedSessionHistoryAvailable"
    | "matchedSavedSessions"
  >,
): SourceInboxFreshness {
  if (preview.kind === "errors-only") {
    return {
      status: "invalid",
      tone: "red",
      label: "파싱 오류",
      detail: `${preview.invalidLineCount}개 라인이 유효한 Connector JSONL이 아닙니다.`,
    };
  }

  if (preview.kind === "empty") {
    return {
      status: "empty",
      tone: "gray",
      label: "이벤트 없음",
      detail: "유효한 Connector 이벤트가 없습니다.",
    };
  }

  const newCount = preview.newEventCount;
  const duplicateCount = preview.duplicateEventCount;
  const duplicateDetail = describeDuplicateBreakdown(preview);
  const historyNote = preview.savedSessionHistoryAvailable
    ? ""
    : " 저장 세션 기록은 확인하지 못했습니다.";

  if (newCount > 0 && duplicateCount === 0) {
    return {
      status: "new",
      tone: "green",
      label: `새 이벤트 ${newCount}`,
      detail: `Import Review로 보낼 새 이벤트가 ${newCount}개 있습니다.${historyNote}`,
    };
  }

  if (newCount > 0 && duplicateCount > 0) {
    return {
      status: "partial",
      tone: "orange",
      label: `새 ${newCount} · 이미 ${duplicateCount}`,
      detail: `${duplicateDetail} 기본 가져오기는 새 이벤트만 보냅니다.${historyNote}`,
    };
  }

  if (newCount === 0 && duplicateCount > 0) {
    return {
      status: "duplicate",
      tone: "gray",
      label: `이미 가져옴 ${duplicateCount}`,
      detail: `${duplicateDetail} 새 이벤트가 없습니다.${historyNote}`,
    };
  }

  return {
    status: "unknown",
    tone: "gray",
    label: "확인 완료",
    detail: `중복 여부를 확인했습니다.${historyNote}`,
  };
}

function describeDuplicateBreakdown(
  preview: Pick<
    ConnectorJsonlPreview,
    | "currentSessionDuplicateCount"
    | "savedSessionDuplicateCount"
    | "inBatchDuplicateCount"
    | "matchedSavedSessions"
  >,
): string {
  const parts: string[] = [];
  if (preview.currentSessionDuplicateCount > 0) {
    parts.push(`현재 세션 ${preview.currentSessionDuplicateCount}`);
  }
  if (preview.savedSessionDuplicateCount > 0) {
    const sessions = preview.matchedSavedSessions
      .map((entry) => entry.title ?? entry.sessionId)
      .slice(0, 2)
      .join(", ");
    parts.push(
      `저장 세션 ${preview.savedSessionDuplicateCount}${sessions ? ` (${sessions})` : ""}`,
    );
  }
  if (preview.inBatchDuplicateCount > 0) {
    parts.push(`파일 내부 반복 ${preview.inBatchDuplicateCount}`);
  }
  return parts.length > 0 ? `이미 가져온 항목: ${parts.join(" · ")}.` : "";
}
