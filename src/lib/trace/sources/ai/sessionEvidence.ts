/**
 * Session outcome evidence as the Rust readers report it, plus the two
 * source classifications the capture policy reads. Field meanings are fixed in
 * `src-tauri/src/session_evidence.rs`: an observation says only "this session's
 * source contains this", never that the session created, merged, or finished it.
 */

export type PrObservation = {
  /** `owner/name` as the source wrote it. */
  repository: string;
  number: number;
  url: string;
  firstObservedAt: string;
  /** 1-based record number of the first link in the segment. */
  firstLine: number;
  observations: number;
};

export type BranchObservation = {
  name: string;
  /** `record`: from timestamped transcript records. `session-meta`: stated once
   *  for the session (Codex, at start). */
  basis: "record" | "session-meta" | string;
  firstObservedAt: string;
  lastObservedAt: string;
  /** 1-based record number of the first sighting, 0 for `session-meta`. */
  firstLine: number;
};

export type SessionEvidence = {
  prs: PrObservation[];
  branches: BranchObservation[];
  repositories: string[];
  /** The session this transcript continues in (Claude `continued-in`). */
  continuedInSessionId?: string;
  /** True only when the whole source was inspected. */
  complete: boolean;
  scannedBytes?: number;
};

/** What a transcript holds, decided from a complete read only; `unknown` when
 *  the read was partial or failed. */
export type SessionActivityClass = "conversation" | "command-only" | "empty" | "unknown";

/** Whether a person drove the session, from the source's own marker. */
export type SessionInteraction = "interactive" | "automation" | "unknown";

export function activityClassOf(value: string | undefined): SessionActivityClass | undefined {
  return value === "conversation" || value === "command-only" || value === "empty" || value === "unknown"
    ? value
    : undefined;
}

/**
 * Claude records an `entrypoint` per line. `cli` is the interactive terminal;
 * the SDK entrypoints (`sdk-cli`, `sdk-ts`, ...) are programmatic runs such as
 * `claude -p`. Anything else is not guessed.
 */
export function claudeInteraction(entrypoint: string | undefined): SessionInteraction {
  const value = (entrypoint ?? "").trim();
  if (value === "cli") return "interactive";
  if (value.startsWith("sdk")) return "automation";
  return "unknown";
}

/**
 * Codex states `session_meta.source`: `exec` is a scripted `codex exec` run;
 * `cli` and `vscode` are the interactive front ends. Anything else is unknown.
 */
export function codexInteraction(source: string | undefined): SessionInteraction {
  const value = (source ?? "").trim();
  if (value === "exec") return "automation";
  if (value === "cli" || value === "vscode") return "interactive";
  return "unknown";
}

/** A short stable signature: changes when a PR, branch, continuation, or the
 *  coverage is newly observed. A branch merely seen again does not change it. */
export function evidenceSignature(evidence: SessionEvidence | undefined): string {
  if (!evidence) return "-";
  const prs = evidence.prs.map((pr) => `${pr.repository.toLowerCase()}#${pr.number}`).join(",");
  const branches = evidence.branches.map((branch) => branch.name).join(",");
  return `${evidence.complete ? "c" : "p"}:${prs}:${branches}:${evidence.continuedInSessionId ?? ""}`;
}
