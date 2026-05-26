import type { Session, SourceRef, TimelineEvent } from "../../domain/types";

export type ProjectHintBasis =
  | "sessionSourceLabel"
  | "sourceUri"
  | "sourceDetail"
  | "sourceTitle"
  | "sessionProjectId"
  | "unknown";

export type ProjectIdentityHint = {
  projectKey: string;
  projectLabel: string;
  basis: ProjectHintBasis;
  confidence: "high" | "medium" | "low";
  detail: string;
};

export function deriveProjectIdentityHint(args: {
  session: Session;
  sources?: readonly SourceRef[];
  events?: readonly TimelineEvent[];
}): ProjectIdentityHint {
  const sourceLabel = args.session.sourceLabel?.trim();
  if (sourceLabel) {
    return hintFromText(sourceLabel, "sessionSourceLabel", "Session source label", "high");
  }

  const sources = args.sources ?? [];
  const uriSource = sources.find((source) => source.uri?.trim());
  if (uriSource?.uri) {
    const uriHint = hintFromUri(uriSource.uri, "sourceUri", "Source URI");
    if (uriHint) return uriHint;
  }

  const remoteSource = sources.find((source) => /github\.com[:/]|gitlab\.com[:/]|bitbucket\.org[:/]/i.test(source.detail));
  if (remoteSource) {
    const remoteHint = hintFromUri(remoteSource.detail, "sourceDetail", "Source detail");
    if (remoteHint) return remoteHint;
  }

  const pathSource = sources.find((source) => looksLikePath(source.detail) || looksLikePath(source.title));
  if (pathSource) {
    const value = looksLikePath(pathSource.detail) ? pathSource.detail : pathSource.title;
    return hintFromText(value, "sourceDetail", "Source path", "medium");
  }

  const titledSource = sources.find((source) => source.title.trim());
  if (titledSource) {
    return hintFromText(titledSource.title, "sourceTitle", "Source title", "low");
  }

  const projectId = args.session.projectId.trim();
  if (projectId) {
    return {
      projectKey: normalizeKey(projectId),
      projectLabel: projectId,
      basis: "sessionProjectId",
      confidence: "low",
      detail: "Session project id fallback",
    };
  }

  return {
    projectKey: "unknown",
    projectLabel: "Unknown project",
    basis: "unknown",
    confidence: "low",
    detail: "No project hint could be derived",
  };
}

function hintFromText(
  value: string,
  basis: ProjectHintBasis,
  detail: string,
  confidence: ProjectIdentityHint["confidence"],
): ProjectIdentityHint {
  const normalized = normalizePathish(value);
  return {
    projectKey: normalizeKey(normalized),
    projectLabel: labelFromPathish(normalized),
    basis,
    confidence,
    detail,
  };
}

function hintFromUri(
  value: string,
  basis: ProjectHintBasis,
  detail: string,
): ProjectIdentityHint | null {
  const repo = extractRepoSlug(value);
  if (repo) {
    return {
      projectKey: normalizeKey(repo),
      projectLabel: repo,
      basis,
      confidence: "high",
      detail,
    };
  }
  try {
    const url = new URL(value);
    const label = labelFromPathish(url.pathname) || url.hostname;
    return {
      projectKey: normalizeKey(`${url.hostname}/${label}`),
      projectLabel: label,
      basis,
      confidence: "medium",
      detail,
    };
  } catch {
    return looksLikePath(value) ? hintFromText(value, basis, detail, "medium") : null;
  }
}

function extractRepoSlug(value: string): string | null {
  const match = value.match(/(?:github\.com|gitlab\.com|bitbucket\.org)[:/]+([^/\s:]+)\/([^/\s#.]+)(?:\.git)?/i);
  if (!match) return null;
  return `${match[1]}/${match[2]!.replace(/\.git$/i, "")}`;
}

function looksLikePath(value: string | undefined): boolean {
  if (!value) return false;
  return /[A-Za-z]:[\\/]/.test(value) || value.includes("/") || value.includes("\\");
}

function normalizePathish(value: string): string {
  return value.trim().replace(/\\/g, "/").replace(/\/+$/g, "");
}

function labelFromPathish(value: string): string {
  const cleaned = normalizePathish(value);
  return cleaned.split("/").filter(Boolean).pop() ?? cleaned;
}

function normalizeKey(value: string): string {
  return normalizePathish(value).toLocaleLowerCase().replace(/\s+/g, "-");
}
