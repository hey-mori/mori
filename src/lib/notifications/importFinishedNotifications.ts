import type { StoredSessionImport } from "../storage/storageTypes";
import type { SourceKind } from "../../domain/types";
import type { CompanionNotification } from "./notification";

/**
 * Build "가져오기 완료" notifications from the active session's recent imports.
 *
 * Each notification's id is stable per import (`import-finished:<importId>`)
 * so the renderer's id-based dedupe never duplicates a single batch. Only
 * imports inside the recency window are emitted — older imports are part of
 * the session history, not "fresh" notifications.
 *
 * This is the second producer feeding `composeNotifications` from
 * `useNotifications`; the Companion layer is the first. Future
 * producers (memory-stale detector, package-export pulse) plug in the same
 * way.
 */

/** Default recency window — imports older than 24h aren't "fresh". */
const DEFAULT_RECENCY_MS = 24 * 60 * 60 * 1000;

/** Cap so a single big batch of imports never floods the panel. */
const DEFAULT_LIMIT = 3;

/** Korean labels keyed by source kind so the title reads naturally. */
const IMPORT_LABEL: Partial<Record<SourceKind, string>> = {
  aiConversation: "AI 대화",
  claudeTranscript: "Claude 대화",
  chatgptTranscript: "ChatGPT 대화",
  codexTranscript: "Codex 대화",
  browser: "URL / 페이지",
  file: "파일",
  terminal: "터미널 출력",
  manualNote: "메모",
  gitDiff: "Git diff",
};

export type BuildImportFinishedNotificationsInput = {
  imports: StoredSessionImport[];
  /** Reference time for the recency check. Defaults to `Date.now()`. */
  now?: number;
  /** Override for the 24h window — tests pin this. */
  recencyMs?: number;
  /** Override for the visible cap — tests pin this. */
  limit?: number;
};

export function buildImportFinishedNotifications(
  input: BuildImportFinishedNotificationsInput,
): CompanionNotification[] {
  const now = input.now ?? Date.now();
  const recencyMs = input.recencyMs ?? DEFAULT_RECENCY_MS;
  const limit = input.limit ?? DEFAULT_LIMIT;

  // Most-recent first; drop anything outside the recency window.
  const recent = [...input.imports]
    .filter((entry) => {
      const epoch = new Date(entry.savedAt).getTime();
      if (Number.isNaN(epoch)) return false;
      const age = now - epoch;
      return age >= 0 && age <= recencyMs;
    })
    .sort(
      (a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime(),
    )
    .slice(0, limit);

  return recent.map(toNotification);
}

function toNotification(entry: StoredSessionImport): CompanionNotification {
  const kindLabel = IMPORT_LABEL[entry.source.kind] ?? "소스";
  const eventCount = entry.events.length;
  const title = eventCount > 0
    ? `${kindLabel} ${eventCount}건 가져오기 완료`
    : `${kindLabel} 가져오기 완료`;
  return {
    id: `import-finished:${entry.id}`,
    kind: "import_finished",
    severity: "info",
    title,
    message:
      entry.source.title?.trim() ||
      "방금 추가된 자료입니다. 자료 탭에서 확인할 수 있습니다.",
    basis: "verified",
    linkedItemIds: [entry.source.id],
    evidenceRefs: entry.events.slice(0, 8).map((event) => event.id),
    actionLabel: "자료 열기",
    actionTarget: { kind: "view", view: "evidence" },
    createdAt: entry.savedAt,
  };
}
