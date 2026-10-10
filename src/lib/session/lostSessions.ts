/**
 * Session records whose original the last discovery pass did not find.
 *
 * The 세션 list shows stored sessions; a discovered session's stored stub is
 * pruned once it leaves the recent window, and its transcript can later be
 * removed by the agent's own cleanup. Its kernel record survives (it is what
 * the calendar and 기록 show), so the list would silently lose a session the
 * rest of Mori still names. This finds those: agent-session records that are
 * not stored, and whose transcript the last discovery pass did not find even
 * though every listing for that agent succeeded. A session merely pruned from
 * the recent window is still on disk and is not listed here. Not finding a
 * file is evidence, not proof (an unreadable folder is skipped silently), so
 * opening one still goes through the resolver, which opens it if it is there.
 */
import type { MoriRecord } from "../record-kernel/kernelTypes";
import { isAutoImportedSessionId } from "./autoImportSessions";

export type DiscoveredSessions = { ids: ReadonlySet<string>; agents: ReadonlySet<string> };

export function lostSessionRecords(
  records: readonly MoriRecord[],
  storedSessionIds: ReadonlySet<string>,
  discovered: DiscoveredSessions | null,
): MoriRecord[] {
  if (!discovered) return [];
  return records.filter((record) => {
    if (record.schemaId !== "agent-session" || !isAutoImportedSessionId(record.id)) return false;
    if (record.status === "discarded" || record.status === "archived") return false;
    if (storedSessionIds.has(record.id) || discovered.ids.has(record.id)) return false;
    const agentId = (record.properties as Record<string, unknown> | undefined)?.agentId;
    // Only an agent whose every listing succeeded (and found something) this
    // pass can vouch for a missing session; a failed listing returns nothing.
    return typeof agentId === "string" && discovered.agents.has(agentId);
  });
}
