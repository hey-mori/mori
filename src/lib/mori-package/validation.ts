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

  // Each slice must be an array of records carrying their identity
  // fields — so an externally-supplied package is trustworthy before
  // import, not just structurally array-shaped.
  requireRecordArray(pkg.projects, "projects", issues, ["id"]);
  requireRecordArray(pkg.sessions, "sessions", issues, ["id"]);
  requireRecordArray(pkg.events, "events", issues, ["id", "type"]);
  requireRecordArray(pkg.issues, "issues", issues, ["id"]);
  requireRecordArray(pkg.decisions, "decisions", issues, ["id"]);
  requireRecordArray(pkg.relationships, "relationships", issues, ["id"]);
  requireRecordArray(pkg.sources, "sources", issues, ["id"]);
  requireRecordArray(pkg.nextActions, "nextActions", issues, ["id"]);
  requireRecordArray(pkg.artifacts, "artifacts", issues, ["id"]);
  requireRecordArray(pkg.summaries, "summaries", issues, ["id"]);

  if (!isObject(pkg.privacy)) issues.push({ path: "privacy", message: "Privacy settings are required" });
  if (!isObject(pkg.theme)) issues.push({ path: "theme", message: "Theme settings are required" });

  // `consolidatedMemories` is optional and additive — absent is valid
  // (older packages). When present it must be an array.
  if (pkg.consolidatedMemories !== undefined && !Array.isArray(pkg.consolidatedMemories)) {
    issues.push({ path: "consolidatedMemories", message: "Must be an array when present" });
  }

  // `auditTrail` is optional and additive in the same way — absent is
  // valid (older packages). When present it must be an array.
  if (pkg.auditTrail !== undefined && !Array.isArray(pkg.auditTrail)) {
    issues.push({ path: "auditTrail", message: "Must be an array when present" });
  }

  if (Array.isArray(pkg.sessions) && isObject(pkg.manifest) && pkg.manifest.primarySessionId) {
    const hasPrimarySession = pkg.sessions.some((session) => isObject(session) && session.id === pkg.manifest?.primarySessionId);
    if (!hasPrimarySession) {
      issues.push({ path: "manifest.primarySessionId", message: "Primary session must exist in sessions" });
    }
  }

  return { valid: issues.length === 0, issues };
}

/**
 * Require an array whose every element is an object carrying each of
 * `requiredStringFields` as a non-empty string. Reports a precise path
 * (`events[3].id`) so a malformed external package is rejected with an
 * actionable message rather than failing silently later.
 */
function requireRecordArray(
  value: unknown,
  path: string,
  issues: MoriPackageValidationIssue[],
  requiredStringFields: string[],
) {
  if (!Array.isArray(value)) {
    issues.push({ path, message: "Must be an array" });
    return;
  }
  value.forEach((record, index) => {
    if (!isObject(record)) {
      issues.push({ path: `${path}[${index}]`, message: "Must be an object" });
      return;
    }
    for (const field of requiredStringFields) {
      const fieldValue = record[field];
      if (typeof fieldValue !== "string" || fieldValue.length === 0) {
        issues.push({
          path: `${path}[${index}].${field}`,
          message: "Must be a non-empty string",
        });
      }
    }
  });
}

function isObject(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
