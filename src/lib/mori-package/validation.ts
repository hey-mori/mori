import type { MoriPackageV0, MoriPackageValidationIssue, MoriPackageValidationResult } from "./types";

export function validateMoriPackage(value: unknown): MoriPackageValidationResult {
  const issues: MoriPackageValidationIssue[] = [];
  const pkg = value as Partial<MoriPackageV0> | undefined;

  if (!isObject(pkg)) {
    return { valid: false, issues: [{ path: "$", message: "Package must be an object" }] };
  }

  if (!isObject(pkg.manifest)) {
    issues.push({ path: "manifest", message: "Manifest is required" });
  } else {
    if (pkg.manifest.appName !== "Mori") issues.push({ path: "manifest.appName", message: "Must be Mori" });
    if (pkg.manifest.formatVersion !== "0.1.0") issues.push({ path: "manifest.formatVersion", message: "Unsupported package version" });
    if (!pkg.manifest.packageId) issues.push({ path: "manifest.packageId", message: "Package id is required" });
  }

  requireArray(pkg.projects, "projects", issues);
  requireArray(pkg.sessions, "sessions", issues);
  requireArray(pkg.events, "events", issues);
  requireArray(pkg.issues, "issues", issues);
  requireArray(pkg.decisions, "decisions", issues);
  requireArray(pkg.relationships, "relationships", issues);
  requireArray(pkg.sources, "sources", issues);
  requireArray(pkg.nextActions, "nextActions", issues);
  requireArray(pkg.artifacts, "artifacts", issues);
  requireArray(pkg.summaries, "summaries", issues);

  if (!isObject(pkg.privacy)) issues.push({ path: "privacy", message: "Privacy settings are required" });
  if (!isObject(pkg.theme)) issues.push({ path: "theme", message: "Theme settings are required" });

  if (Array.isArray(pkg.sessions) && isObject(pkg.manifest) && pkg.manifest.primarySessionId) {
    const hasPrimarySession = pkg.sessions.some((session) => isObject(session) && session.id === pkg.manifest?.primarySessionId);
    if (!hasPrimarySession) {
      issues.push({ path: "manifest.primarySessionId", message: "Primary session must exist in sessions" });
    }
  }

  return { valid: issues.length === 0, issues };
}

function requireArray(value: unknown, path: string, issues: MoriPackageValidationIssue[]) {
  if (!Array.isArray(value)) {
    issues.push({ path, message: "Must be an array" });
  }
}

function isObject(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
