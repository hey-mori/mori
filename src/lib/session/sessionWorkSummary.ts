/**
 * Session work summary — a deterministic, real-time "what was done" account
 * of a session, built from its events with no LLM. The 개요 tab leads with
 * this so a session is legible the moment it is imported, even before (or
 * without) Quick Pass. It reuses the timeline lane classifier so the summary
 * and the timeline agree.
 *
 * This is the factual scaffold ("447 conversation turns, 216 file changes
 * over ~141 hours, mostly X / Y"). An LLM summary, when available, layers a
 * narrative on top; it never replaces this.
 */
import type { SourceRef, TimelineEvent } from "../../domain/types";
import { buildImportDigest, type ImportDigest } from "../import/importDigest";
import { getTimelineLaneForEvent } from "../timeline/activityModel";

export type SessionWorkFile = { name: string; count: number };

export type SessionWorkSummary = {
  /** One-line Korean narrative assembled from the counts. */
  headline: string;
  /** Per-lane breakdown + span (reused from the import digest). */
  digest: ImportDigest;
  /** Most-touched file basenames (from code/file events), highest first. */
  topFiles: SessionWorkFile[];
  /** True when there is essentially nothing to summarize. */
  isEmpty: boolean;
};

export function buildSessionWorkSummary(
  events: readonly TimelineEvent[],
  sources?: readonly SourceRef[] | ReadonlyMap<string, SourceRef>,
): SessionWorkSummary {
  const digest = buildImportDigest(events, sources);
  const topFiles = extractTopFiles(events, sources);
  return {
    headline: buildHeadline(digest, topFiles),
    digest,
    topFiles,
    isEmpty: digest.eventCount === 0,
  };
}

function buildHeadline(digest: ImportDigest, topFiles: SessionWorkFile[]): string {
  if (digest.eventCount === 0) return "아직 이 세션에 들어온 작업이 없습니다.";

  const parts: string[] = [];
  if (digest.conversationTurns > 0) parts.push(`대화 ${digest.conversationTurns}회`);
  if (digest.fileChanges > 0) parts.push(`파일 변경 ${digest.fileChanges}건`);
  if (digest.toolCalls > 0) parts.push(`명령 ${digest.toolCalls}회`);
  if (digest.research > 0) parts.push(`리서치 ${digest.research}건`);
  if (digest.buildRuns > 0) parts.push(`빌드·테스트 ${digest.buildRuns}회`);

  const lead = digest.span.durationLabel ? `${digest.span.durationLabel} 동안 ` : "";
  const body = parts.length > 0 ? parts.join(", ") : `이벤트 ${digest.eventCount}건`;
  const files =
    topFiles.length > 0
      ? ` 주로 ${topFiles.slice(0, 3).map((file) => file.name).join(", ")}${
          topFiles.length > 3 ? " 등" : ""
        }을 작업했습니다.`
      : ".";
  return `${lead}${body}${files}`;
}

const FILE_PATH = /([A-Za-z]:\\[^\s:]+|\/[\w./-]+|[\w.-]+\.[A-Za-z][\w]*)/g;

function extractTopFiles(
  events: readonly TimelineEvent[],
  sources?: readonly SourceRef[] | ReadonlyMap<string, SourceRef>,
): SessionWorkFile[] {
  const counts = new Map<string, number>();
  for (const event of events) {
    if (getTimelineLaneForEvent({ event, sources }) !== "files") continue;
    const name = basenameFromText(event.title) ?? basenameFromText(event.summary);
    if (!name) continue;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, 5);
}

function basenameFromText(text: string): string | null {
  const matches = text.match(FILE_PATH);
  if (!matches || matches.length === 0) return null;
  // Prefer the last path-like token (the file, after a tool label like "Edit:").
  const path = matches[matches.length - 1]!;
  const base = path.split(/[\\/]/).filter(Boolean).pop() ?? path;
  // Must look like a filename (has an extension) to avoid catching prose.
  return /\.[A-Za-z][\w]*$/.test(base) ? base : null;
}
