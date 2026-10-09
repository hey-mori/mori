/**
 * The retention view's data, assembled when the user looks at it: what Mori
 * registered and keeps (local stores only), the cleanup period the agent's
 * settings state, and, only for sources near or past their estimate, whether
 * the file is still there (an existence check, never a read).
 */
import { claudeCodeCleanupPolicy } from "../../lib/claude/claudeTauri";
import { resolveFileLocations } from "../../lib/file-provenance/fileProvenanceBridge";
import { getKernelRepository } from "../../lib/record-kernel/kernelRepository";
import { loadAutoImportMetas } from "../../lib/session/autoImportMetaStore";
import { retentionSources } from "../../lib/session/retentionInventory";
import {
  assessRetention,
  type CleanupPolicyInput,
  type RetentionAssessment,
  type RetentionSourceInput,
} from "../../lib/session/retentionRisk";
import { loadStoredSessionSummariesWithMetrics } from "../../app/sessionStore";

export type RetentionView = {
  policy: CleanupPolicyInput;
  assessments: RetentionAssessment[];
};

const UNSET: CleanupPolicyInput = { periodDays: null, source: "unset" };

export async function loadCleanupPolicy(): Promise<CleanupPolicyInput> {
  try {
    return await claudeCodeCleanupPolicy();
  } catch {
    return UNSET;
  }
}

export async function loadRetentionView(now: number = Date.now()): Promise<RetentionView> {
  const repo = getKernelRepository();
  const [policy, sources, links, records] = await Promise.all([
    loadCleanupPolicy(),
    repo.listSources(),
    repo.listSourceLinks(),
    repo.listRecords(),
  ]);
  const importedSessionIds = new Set(
    loadStoredSessionSummariesWithMetrics()
      .filter((summary) => (summary.eventCount ?? 0) > 0)
      .map((summary) => summary.sessionId),
  );
  const inputs = retentionSources({
    metas: loadAutoImportMetas(),
    sources: sources.data,
    links: links.data,
    records: records.data,
    importedSessionIds,
  });
  return { policy, assessments: await withPresence(inputs, policy, now) };
}

/** Check that the files whose cleanup estimate is near or past still exist. */
async function withPresence(
  inputs: RetentionSourceInput[],
  policy: CleanupPolicyInput,
  now: number,
): Promise<RetentionAssessment[]> {
  const first = inputs.map((input) => assessRetention(input, policy, now));
  const toCheck = first.filter(
    (a) => a.sourcePath && (a.cleanup.state === "approaching" || a.cleanup.state === "mayBeEligible"),
  );
  let found = new Map<string, "present" | "missing">();
  try {
    const located = await resolveFileLocations(toCheck.map((a) => a.sourcePath!));
    found = new Map(located.map((l) => [l.path, l.status === "present" ? "present" : "missing"] as const));
  } catch {
    // Unknown stays unknown: nothing is flagged on a failed check.
  }
  return first.map((a) => {
    const presence = a.sourcePath ? found.get(a.sourcePath) : undefined;
    return presence ? assessRetention({ ...a, presence }, policy, now) : a;
  });
}
