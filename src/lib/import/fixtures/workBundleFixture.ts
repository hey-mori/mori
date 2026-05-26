/**
 * Realistic — but fully synthetic — "AI coding work bundle" fixture.
 *
 * One coherent work session on a fictional `acme-notes-app` project: adding an
 * offline note-sync queue. It is intentionally spread across the source types
 * a real AI coding session leaves behind, so the work-bundle preview and the
 * end-to-end import path can be exercised against a believable composite:
 *
 *   1. a Claude design conversation (transcript paste),
 *   2. a Codex CLI run log (connector JSONL),
 *   3. a git diff of the change,
 *   4. a terminal build/test log (connector JSONL),
 *   5. a manual hand-off note.
 *
 * Everything below is invented. No real accounts, no secrets, no real file
 * paths, no tokens. The connector ids and event shapes are valid for the
 * current parser (see `src/lib/connectors/types.ts`).
 */
import { parseConnectorJsonl } from "../../connectors/validation";
import { normalizeConnectorEventBatch } from "../../connectors/normalizeConnectorEvents";
import { normalizeAiTranscript } from "../normalizeAiTranscript";
import { normalizeGitDiff } from "../normalizeGitDiff";
import { normalizeManualNote } from "../normalizeManualNote";
import type { NormalizedImportCandidate } from "../types";
import type { WorkBundleItem } from "../workBundle";

export const WORK_BUNDLE_FIXTURE_PROJECT_LABEL = "acme-notes-app";

/** A Claude design discussion that preceded the implementation. */
export const workBundleClaudeTranscript = `User: We need offline note sync for acme-notes-app. When the user edits a note offline, the change should be queued and flushed when the connection returns. What is the safest design?

Assistant: I recommend an append-only write queue persisted in IndexedDB. Each queued mutation carries a note id, a logical timestamp, and the field-level patch. On reconnect we flush the queue oldest-first.

The one real risk is conflict resolution: if the same note was edited on another device while offline, a naive last-write-wins flush silently drops the remote edit. I suggest a per-field merge with a conflict marker when both sides changed the same field.

Decision: use an IndexedDB-backed queue in src/sync/queue.ts, and a field-level merge in src/sync/conflict.ts. Last-write-wins only for non-overlapping fields.

Next steps:
- Implement the queue with oldest-first flush.
- Implement field-level conflict merge with a conflict marker.
- Add a failing test first, then make it pass.

Open question: how should we surface an unresolved conflict to the user? Leaving that as an open issue for now.`;

/** A Codex CLI run that implemented the design above. */
export const workBundleCodexRunJsonl = `{"id":"codex-evt-001","connectorId":"codexCliWrapper","kind":"session_started","occurredAt":"2026-05-22T09:30:00Z","sessionId":"codex-offline-sync-2026-05-22","projectPath":"~/code/acme-notes-app","sourceTitle":"Implement offline note sync queue","summary":"Started a Codex run to implement the offline write queue and conflict merge.","privacy":{"captureMethod":"local_cli_wrapper","rawDataPolicy":"summary_only","redacted":false},"provenance":{"toolName":"mori-codex-wrapper","toolVersion":"0.4.0"}}
{"id":"codex-evt-002","connectorId":"codexCliWrapper","kind":"prompt_submitted","occurredAt":"2026-05-22T09:30:40Z","sessionId":"codex-offline-sync-2026-05-22","projectPath":"~/code/acme-notes-app","sourceTitle":"Build the queue","summary":"User asked Codex to add an IndexedDB write queue with oldest-first flush and a field-level conflict merge.","privacy":{"captureMethod":"local_cli_wrapper","rawDataPolicy":"summary_only","redacted":false},"provenance":{"toolName":"mori-codex-wrapper"}}
{"id":"codex-evt-003","connectorId":"codexCliWrapper","kind":"assistant_message","occurredAt":"2026-05-22T09:31:10Z","sessionId":"codex-offline-sync-2026-05-22","projectPath":"~/code/acme-notes-app","sourceTitle":"Implementation plan","summary":"Codex outlined queue.ts (enqueue/flush) and conflict.ts (field merge), plus a queue.test.ts covering an offline edit then flush.","privacy":{"captureMethod":"local_cli_wrapper","rawDataPolicy":"summary_only","redacted":false},"provenance":{"toolName":"mori-codex-wrapper"}}
{"id":"codex-evt-004","connectorId":"codexCliWrapper","kind":"file_changed","occurredAt":"2026-05-22T09:33:20Z","sessionId":"codex-offline-sync-2026-05-22","projectPath":"~/code/acme-notes-app","sourceTitle":"Add src/sync/queue.ts","summary":"Created the IndexedDB-backed write queue with oldest-first flush in src/sync/queue.ts.","filePath":"src/sync/queue.ts","git":{"repoPath":"~/code/acme-notes-app","branch":"feature/offline-sync","files":[{"path":"src/sync/queue.ts","changeType":"added","additions":74,"deletions":0}]},"privacy":{"captureMethod":"local_cli_wrapper","rawDataPolicy":"summary_only","redacted":false},"provenance":{"toolName":"mori-codex-wrapper"}}
{"id":"codex-evt-005","connectorId":"codexCliWrapper","kind":"file_changed","occurredAt":"2026-05-22T09:36:05Z","sessionId":"codex-offline-sync-2026-05-22","projectPath":"~/code/acme-notes-app","sourceTitle":"Add src/sync/conflict.ts","summary":"Added field-level conflict merge with a conflict marker in src/sync/conflict.ts.","filePath":"src/sync/conflict.ts","git":{"repoPath":"~/code/acme-notes-app","branch":"feature/offline-sync","files":[{"path":"src/sync/conflict.ts","changeType":"added","additions":48,"deletions":0}]},"privacy":{"captureMethod":"local_cli_wrapper","rawDataPolicy":"summary_only","redacted":false},"provenance":{"toolName":"mori-codex-wrapper"}}
{"id":"codex-evt-006","connectorId":"codexCliWrapper","kind":"command_started","occurredAt":"2026-05-22T09:38:00Z","sessionId":"codex-offline-sync-2026-05-22","projectPath":"~/code/acme-notes-app","sourceTitle":"Run sync tests","summary":"Ran the new sync test for the first time.","command":"npm test -- src/sync/queue.test.ts","privacy":{"captureMethod":"local_cli_wrapper","rawDataPolicy":"summary_only","redacted":false},"provenance":{"toolName":"mori-codex-wrapper"}}
{"id":"codex-evt-007","connectorId":"codexCliWrapper","kind":"command_finished","occurredAt":"2026-05-22T09:38:21Z","sessionId":"codex-offline-sync-2026-05-22","projectPath":"~/code/acme-notes-app","sourceTitle":"Tests failing","summary":"queue.test.ts failed: flush replayed a stale edit over a newer remote change.","command":"npm test -- src/sync/queue.test.ts","tool":{"name":"npm","exitCode":1,"durationMs":4200},"privacy":{"captureMethod":"local_cli_wrapper","rawDataPolicy":"summary_only","redacted":false},"provenance":{"toolName":"mori-codex-wrapper"}}
{"id":"codex-evt-008","connectorId":"codexCliWrapper","kind":"file_changed","occurredAt":"2026-05-22T09:41:30Z","sessionId":"codex-offline-sync-2026-05-22","projectPath":"~/code/acme-notes-app","sourceTitle":"Fix flush ordering","summary":"Made flush compare logical timestamps before applying a queued patch in src/sync/queue.ts.","filePath":"src/sync/queue.ts","git":{"repoPath":"~/code/acme-notes-app","branch":"feature/offline-sync","files":[{"path":"src/sync/queue.ts","changeType":"modified","additions":11,"deletions":3}]},"privacy":{"captureMethod":"local_cli_wrapper","rawDataPolicy":"summary_only","redacted":false},"provenance":{"toolName":"mori-codex-wrapper"}}
{"id":"codex-evt-009","connectorId":"codexCliWrapper","kind":"command_finished","occurredAt":"2026-05-22T09:43:02Z","sessionId":"codex-offline-sync-2026-05-22","projectPath":"~/code/acme-notes-app","sourceTitle":"Tests passing","summary":"queue.test.ts passed: 6 tests green, stale edits no longer replay over newer remote changes.","command":"npm test -- src/sync/queue.test.ts","tool":{"name":"npm","exitCode":0,"durationMs":3900},"privacy":{"captureMethod":"local_cli_wrapper","rawDataPolicy":"summary_only","redacted":false},"provenance":{"toolName":"mori-codex-wrapper"}}
{"id":"codex-evt-010","connectorId":"codexCliWrapper","kind":"commit_created","occurredAt":"2026-05-22T09:45:18Z","sessionId":"codex-offline-sync-2026-05-22","projectPath":"~/code/acme-notes-app","sourceTitle":"Commit offline sync queue","summary":"Committed the offline sync queue and conflict merge on feature/offline-sync.","git":{"repoPath":"~/code/acme-notes-app","branch":"feature/offline-sync","shortHeadCommit":"a1b2c3d","additions":133,"deletions":6,"files":[{"path":"src/sync/queue.ts","changeType":"added","additions":85,"deletions":3},{"path":"src/sync/conflict.ts","changeType":"added","additions":48,"deletions":0}]},"privacy":{"captureMethod":"local_cli_wrapper","rawDataPolicy":"summary_only","redacted":false},"provenance":{"toolName":"mori-codex-wrapper"}}
{"id":"codex-evt-011","connectorId":"codexCliWrapper","kind":"session_finished","occurredAt":"2026-05-22T09:46:00Z","sessionId":"codex-offline-sync-2026-05-22","projectPath":"~/code/acme-notes-app","sourceTitle":"Run complete","summary":"Codex run finished; offline sync queue implemented and committed.","privacy":{"captureMethod":"local_cli_wrapper","rawDataPolicy":"summary_only","redacted":false},"provenance":{"toolName":"mori-codex-wrapper"}}`;

/** The git diff captured for the change above. */
export const workBundleGitDiff = `diff --git a/src/sync/queue.ts b/src/sync/queue.ts
new file mode 100644
index 0000000..a1b2c3d
--- /dev/null
+++ b/src/sync/queue.ts
@@ -0,0 +1,12 @@
+export type QueuedMutation = {
+  noteId: string;
+  at: number;
+  patch: Record<string, unknown>;
+};
+
+export function flushQueue(queue: QueuedMutation[]): QueuedMutation[] {
+  return [...queue]
+    .sort((a, b) => a.at - b.at)
+    .filter((mutation) => mutation.patch !== undefined);
+}
diff --git a/src/sync/conflict.ts b/src/sync/conflict.ts
new file mode 100644
index 0000000..b2c3d4e
--- /dev/null
+++ b/src/sync/conflict.ts
@@ -0,0 +1,9 @@
+export function mergeFields(local: Record<string, unknown>, remote: Record<string, unknown>) {
+  const merged: Record<string, unknown> = { ...remote };
+  for (const key of Object.keys(local)) {
+    if (remote[key] !== undefined && remote[key] !== local[key]) {
+      merged[key] = { conflict: true, local: local[key], remote: remote[key] };
+    } else merged[key] = local[key];
+  }
+  return merged;
+}`;

/** A terminal build/lint log captured around the same work. */
export const workBundleTerminalLogJsonl = `{"id":"term-evt-001","connectorId":"terminalShell","kind":"command_started","occurredAt":"2026-05-22T10:15:00Z","sessionId":"term-offline-sync-2026-05-22","projectPath":"~/code/acme-notes-app","sourceTitle":"Build","summary":"Ran the production build after the sync change.","command":"npm run build","privacy":{"captureMethod":"local_cli_wrapper","rawDataPolicy":"summary_only","redacted":false},"provenance":{"toolName":"mori-capture"}}
{"id":"term-evt-002","connectorId":"terminalShell","kind":"command_finished","occurredAt":"2026-05-22T10:15:44Z","sessionId":"term-offline-sync-2026-05-22","projectPath":"~/code/acme-notes-app","sourceTitle":"Build passed","summary":"npm run build succeeded; bundle emitted with no type errors.","command":"npm run build","tool":{"name":"npm","exitCode":0,"durationMs":44000},"privacy":{"captureMethod":"local_cli_wrapper","rawDataPolicy":"summary_only","redacted":false},"provenance":{"toolName":"mori-capture"}}
{"id":"term-evt-003","connectorId":"terminalShell","kind":"command_started","occurredAt":"2026-05-22T10:18:00Z","sessionId":"term-offline-sync-2026-05-22","projectPath":"~/code/acme-notes-app","sourceTitle":"Lint","summary":"Ran the linter over the sync module.","command":"npm run lint -- src/sync","privacy":{"captureMethod":"local_cli_wrapper","rawDataPolicy":"summary_only","redacted":false},"provenance":{"toolName":"mori-capture"}}
{"id":"term-evt-004","connectorId":"terminalShell","kind":"command_finished","occurredAt":"2026-05-22T10:18:12Z","sessionId":"term-offline-sync-2026-05-22","projectPath":"~/code/acme-notes-app","sourceTitle":"Lint clean","summary":"npm run lint reported no issues in src/sync.","command":"npm run lint -- src/sync","tool":{"name":"npm","exitCode":0,"durationMs":12000},"privacy":{"captureMethod":"local_cli_wrapper","rawDataPolicy":"summary_only","redacted":false},"provenance":{"toolName":"mori-capture"}}`;

/** A short hand-off note the developer left for the next session. */
export const workBundleManualNote = `Offline sync — hand-off note

Decision: queue lives in src/sync/queue.ts (IndexedDB, oldest-first flush). Conflicts handled per-field in src/sync/conflict.ts; last-write-wins only for non-overlapping fields.

Done: queue + conflict merge implemented, tests green, build + lint clean, committed on feature/offline-sync.

Open issue: we still have no UI to surface an unresolved conflict marker to the user — the merge writes a { conflict: true } shape but nothing renders it yet.

Next: design the conflict-resolution UI and decide whether to block sync on an unresolved conflict.`;

/**
 * Normalize each fixture source into a {@link WorkBundleItem}, bound to the
 * given session. Returns the bundle in chronological work order: design
 * conversation → Codex run → git diff → terminal log → hand-off note.
 */
export function buildWorkBundleFixtureItems(input: {
  projectId: string;
  sessionId: string;
}): WorkBundleItem[] {
  const { projectId, sessionId } = input;

  const transcript = normalizeAiTranscript({
    projectId,
    sessionId,
    platform: "claude",
    title: "오프라인 노트 동기화 설계",
    text: workBundleClaudeTranscript,
    capturedAt: "2026-05-22T09:00:00Z",
  });

  const codex = connectorCandidates(workBundleCodexRunJsonl, projectId, sessionId);
  const terminal = connectorCandidates(workBundleTerminalLogJsonl, projectId, sessionId);

  const gitDiff = normalizeGitDiff({
    projectId,
    sessionId,
    title: "offline sync queue 변경",
    diffText: workBundleGitDiff,
    origin: "~/code/acme-notes-app feature/offline-sync",
    capturedAt: "2026-05-22T10:12:00Z",
  });

  const note = normalizeManualNote({
    projectId,
    sessionId,
    title: "오프라인 동기화 핸드오프",
    note: workBundleManualNote,
    capturedAt: "2026-05-22T10:25:00Z",
  });

  const items: WorkBundleItem[] = [
    { id: "bundle-ai-transcript", origin: "ai-transcript", candidate: transcript },
  ];
  codex.forEach((candidate, index) =>
    items.push({ id: `bundle-codex-run-${index}`, origin: "connector-jsonl", candidate }),
  );
  items.push({ id: "bundle-git-diff", origin: "git-diff", candidate: gitDiff });
  terminal.forEach((candidate, index) =>
    items.push({ id: `bundle-terminal-log-${index}`, origin: "connector-jsonl", candidate }),
  );
  items.push({ id: "bundle-manual-note", origin: "manual-note", candidate: note });

  return items;
}

function connectorCandidates(
  jsonl: string,
  projectId: string,
  sessionId: string,
): NormalizedImportCandidate[] {
  const outcome = parseConnectorJsonl(jsonl);
  return normalizeConnectorEventBatch({
    projectId,
    sessionId,
    events: outcome.events,
  }).map((candidate) => ({ source: candidate.source, events: candidate.events }));
}
