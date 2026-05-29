import type { MockSession } from "../../domain/types";
import {
  buildClientSafeMoriPackage,
  createMoriPackageFromSession,
  getPackageAuditTrail,
  getPackageConsolidatedMemories,
} from "../mori-package";
import type {
  StoredAcceptedProjectMemory,
  StoredMemoryReviewAction,
} from "../storage/storageTypes";

export type MoriPackageExportPlanCounts = {
  sessions: number;
  sources: number;
  events: number;
  issues: number;
  decisions: number;
  nextActions: number;
  memories: number;
  auditRows: number;
};

export type MoriPackageExportPlan = {
  full: MoriPackageExportPlanCounts & {
    sensitiveMemories: number;
  };
  clientSafe: MoriPackageExportPlanCounts & {
    droppedMemories: number;
    droppedAuditRows: number;
  };
};

export function buildMoriPackageExportPlan({
  view,
  consolidatedMemories,
  auditTrail,
}: {
  view: MockSession;
  consolidatedMemories: readonly StoredAcceptedProjectMemory[];
  auditTrail: readonly StoredMemoryReviewAction[];
}): MoriPackageExportPlan {
  const fullPackage = createMoriPackageFromSession(view, {
    consolidatedMemories: [...consolidatedMemories],
    auditTrail: [...auditTrail],
  });
  const clientSafePackage = buildClientSafeMoriPackage(fullPackage);
  const fullMemories = getPackageConsolidatedMemories(fullPackage);
  const fullAuditTrail = getPackageAuditTrail(fullPackage);
  const clientSafeMemories = getPackageConsolidatedMemories(clientSafePackage);
  const clientSafeAuditTrail = getPackageAuditTrail(clientSafePackage);

  return {
    full: {
      ...countPackageRecords(view),
      memories: fullMemories.length,
      auditRows: fullAuditTrail.length,
      sensitiveMemories: fullMemories.filter((memory) => memory.sensitivity !== "normal").length,
    },
    clientSafe: {
      ...countPackageRecords(view),
      memories: clientSafeMemories.length,
      auditRows: clientSafeAuditTrail.length,
      droppedMemories: fullMemories.length - clientSafeMemories.length,
      droppedAuditRows: fullAuditTrail.length - clientSafeAuditTrail.length,
    },
  };
}

function countPackageRecords(view: MockSession): Omit<
  MoriPackageExportPlanCounts,
  "memories" | "auditRows"
> {
  return {
    sessions: 1,
    sources: view.sources.length,
    events: view.events.length,
    issues: view.issues.length,
    decisions: view.decisions.length,
    nextActions: view.nextActions.length,
  };
}
