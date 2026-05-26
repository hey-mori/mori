import type { TimelineEvent } from "../../domain/types";
import { createImportId } from "./id";
import { categorizeFile, isLikelyGitDiff, parseGitDiff, type GitDiffFile } from "./parseGitDiff";
import { assessGitDiffFidelity } from "./captureFidelity";
import type { NormalizedImportCandidate, NormalizeBaseInput } from "./types";

export type NormalizeGitDiffInput = NormalizeBaseInput & {
  title?: string;
  diffText: string;
  origin?: string;
};

export class GitDiffParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GitDiffParseError";
  }
}

export function normalizeGitDiff(input: NormalizeGitDiffInput): NormalizedImportCandidate {
  if (!isLikelyGitDiff(input.diffText)) {
    throw new GitDiffParseError(
      "Input does not look like a unified git diff. Expected lines starting with 'diff --git' or '@@'.",
    );
  }

  const capturedAt = input.capturedAt ?? new Date().toISOString();
  const parsed = parseGitDiff(input.diffText);

  if (parsed.files.length === 0) {
    throw new GitDiffParseError("No file headers found in the diff. Make sure the entire diff was pasted.");
  }

  const title = input.title?.trim() || buildDefaultTitle(parsed.files);
  const sourceId = createImportId("src-gitdiff", title, capturedAt);
  const eventId = createImportId("evt-gitdiff", title, capturedAt);

  const summary = buildSummary(parsed.files, parsed.totals);
  const fileBreakdown = summarizeBreakdown(parsed.files);

  const event: TimelineEvent = {
    id: eventId,
    sessionId: input.sessionId,
    projectId: input.projectId,
    start: capturedAt,
    type: "fileCode",
    title,
    summary,
    sourceRefs: [sourceId],
    linkedIssueIds: [],
    linkedDecisionIds: [],
    relationshipIds: [],
    trustLevel: "verified",
    confidence: 0.97,
    createdBy: "import",
    userModified: false,
  };

  return {
    source: {
      id: sourceId,
      sessionId: input.sessionId,
      kind: "gitDiff",
      title,
      detail: `${parsed.totals.files} file${parsed.totals.files === 1 ? "" : "s"} · +${parsed.totals.additions}/-${parsed.totals.deletions}${fileBreakdown ? ` · ${fileBreakdown}` : ""}${input.origin ? ` · ${input.origin}` : ""}`,
      uri: input.origin,
      trustLevel: "verified",
      redactionStatus: "notNeeded",
      rawRetention: "retained",
      capturedAt,
      relatedEventIds: [eventId],
      captureFidelity: assessGitDiffFidelity(input.diffText),
    },
    events: [event],
  };
}

function buildDefaultTitle(files: GitDiffFile[]): string {
  if (files.length === 1) {
    const file = files[0];
    const verb =
      file.changeType === "added"
        ? "Added"
        : file.changeType === "deleted"
          ? "Deleted"
          : file.changeType === "renamed"
            ? "Renamed"
            : "Updated";
    return `${verb} ${file.path}`;
  }
  return `Git diff: ${files.length} files`;
}

function buildSummary(files: GitDiffFile[], totals: { files: number; additions: number; deletions: number }): string {
  const lead = `Git diff covering ${totals.files} file${totals.files === 1 ? "" : "s"} (+${totals.additions} / -${totals.deletions}).`;
  const topFiles = files
    .slice()
    .sort((a, b) => b.additions + b.deletions - (a.additions + a.deletions))
    .slice(0, 4)
    .map((file) => {
      const tag = file.changeType !== "modified" ? ` (${file.changeType})` : "";
      return `${file.path}${tag} +${file.additions}/-${file.deletions}`;
    });
  return [lead, topFiles.length ? `Top changes: ${topFiles.join("; ")}.` : ""].filter(Boolean).join(" ");
}

function summarizeBreakdown(files: GitDiffFile[]): string {
  const counts = { code: 0, test: 0, docs: 0, config: 0, other: 0 };
  for (const file of files) {
    counts[categorizeFile(file.path)] += 1;
  }
  const parts: string[] = [];
  if (counts.code) parts.push(`${counts.code} code`);
  if (counts.test) parts.push(`${counts.test} test`);
  if (counts.docs) parts.push(`${counts.docs} docs`);
  if (counts.config) parts.push(`${counts.config} config`);
  if (counts.other) parts.push(`${counts.other} other`);
  return parts.join(", ");
}
