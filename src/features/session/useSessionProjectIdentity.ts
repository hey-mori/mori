import { useEffect, useState } from "react";
import { getKernelRepository } from "../../lib/record-kernel/kernelRepository";
import { sessionProjectIdentity, type SessionProjectIdentity } from "./sessionProjectIdentity";

/**
 * The reviewed project of the open session, read fresh from the kernel each
 * time the session changes. Read-only. A read that fell back to an unreliable
 * store, or a session with no kernel record (a manual session), is `unknown`,
 * so the view claims no project rather than a wrong one.
 */
export function useSessionProjectIdentity(sessionId: string | null): SessionProjectIdentity {
  const [identity, setIdentity] = useState<{ sessionId: string | null; value: SessionProjectIdentity }>({
    sessionId: null,
    value: { kind: "unknown" },
  });

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    void (async () => {
      const repo = getKernelRepository();
      const [record, contexts] = await Promise.all([repo.getRecord(sessionId), repo.listContexts()]);
      if (cancelled) return;
      const reliable = !record.fellBack && !contexts.fellBack;
      const value = reliable ? sessionProjectIdentity(record.data, contexts.data) : ({ kind: "unknown" } as const);
      setIdentity({ sessionId, value });
    })().catch(() => {
      if (!cancelled) setIdentity({ sessionId, value: { kind: "unknown" } });
    });
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  // A result for a previous session is never shown for this one.
  return identity.sessionId === sessionId ? identity.value : { kind: "unknown" };
}
