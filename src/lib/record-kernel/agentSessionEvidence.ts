/**
 * The `sessionEvidence` property of an `agent-session` record: the structural
 * Git observations its source holds, with where each one was read.
 *
 * Meaning is narrow on purpose (see `src-tauri/src/session_evidence.rs`):
 *   - a PR entry means "this session's source links to this PR". It is not
 *     authorship, not a merge, not success. Anything verified against GitHub
 *     must be stored apart from it, never folded into it;
 *   - a branch entry means "this branch name was seen in the session's Git
 *     context". It is not the current branch, and several may be seen;
 *   - `coverage: "partial"` means the source has not been read to the end, so a
 *     PR missing from the list may still be in it.
 *
 * Only structured fields enter the record: no transcript prose, no request text,
 * no absolute paths. The locator is the source segment (the transcript's own
 * session id) plus a 1-based record number, which is enough to find the line.
 * Values that change on every poll without new meaning (how many times a link
 * repeated, bytes scanned) are left out, so an unchanged source writes nothing.
 */
import type { SessionEvidence } from "../trace/sources/ai/sessionEvidence";

export type RecordedPr = {
  repository: string;
  number: number;
  url: string;
  firstObservedAt: string;
  line: number;
};

export type RecordedBranch = {
  name: string;
  basis: string;
  firstObservedAt: string;
  lastObservedAt: string;
  line: number;
};

export type RecordedSessionEvidence = {
  coverage: "complete" | "partial";
  /** The transcript segment the locators point into. */
  segment: string;
  prs: RecordedPr[];
  branches: RecordedBranch[];
  repositories: string[];
  /** The segment this transcript continues in (Claude `continued-in`). */
  continuesIn?: string;
};

export function recordedSessionEvidence(
  evidence: SessionEvidence | undefined,
  segment: string,
): RecordedSessionEvidence | undefined {
  if (!evidence) return undefined;
  const recorded: RecordedSessionEvidence = {
    coverage: evidence.complete ? "complete" : "partial",
    segment,
    prs: evidence.prs.map((pr) => ({
      repository: pr.repository,
      number: pr.number,
      url: pr.url,
      firstObservedAt: pr.firstObservedAt,
      line: pr.firstLine,
    })),
    branches: evidence.branches.map((branch) => ({
      name: branch.name,
      basis: branch.basis,
      firstObservedAt: branch.firstObservedAt,
      lastObservedAt: branch.lastObservedAt,
      line: branch.firstLine,
    })),
    repositories: [...evidence.repositories],
  };
  if (evidence.continuedInSessionId) recorded.continuesIn = evidence.continuedInSessionId;
  return recorded;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Read the property back, tolerating records written before it existed or by
 *  a newer shape. Anything malformed reads as "no evidence recorded". */
export function readSessionEvidence(value: unknown): RecordedSessionEvidence | undefined {
  if (!isRecord(value)) return undefined;
  if (value.coverage !== "complete" && value.coverage !== "partial") return undefined;
  const list = (entry: unknown) => (Array.isArray(entry) ? entry.filter(isRecord) : []);
  const text = (entry: unknown) => (typeof entry === "string" ? entry : "");
  const count = (entry: unknown) => (typeof entry === "number" && Number.isFinite(entry) ? entry : 0);
  const prs = list(value.prs)
    .map((pr) => ({
      repository: text(pr.repository),
      number: count(pr.number),
      url: text(pr.url),
      firstObservedAt: text(pr.firstObservedAt),
      line: count(pr.line),
    }))
    .filter((pr) => pr.repository && pr.number > 0);
  const branches = list(value.branches)
    .map((branch) => ({
      name: text(branch.name),
      basis: text(branch.basis),
      firstObservedAt: text(branch.firstObservedAt),
      lastObservedAt: text(branch.lastObservedAt),
      line: count(branch.line),
    }))
    .filter((branch) => branch.name);
  const repositories = Array.isArray(value.repositories)
    ? value.repositories.filter((entry): entry is string => typeof entry === "string" && entry.length > 0)
    : [];
  const recorded: RecordedSessionEvidence = {
    coverage: value.coverage,
    segment: text(value.segment),
    prs,
    branches,
    repositories,
  };
  if (text(value.continuesIn)) recorded.continuesIn = text(value.continuesIn);
  return recorded;
}
