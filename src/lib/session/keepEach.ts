/**
 * Keeping several at-risk conversations the user chose, one after another.
 * Each is kept or fails on its own: a failure is reported and the rest are
 * still kept. Nothing here chooses what to keep.
 */
export type KeepOutcome = { sessionId: string; kept: boolean };

export async function keepEach(
  sessionIds: readonly string[],
  keep: (sessionId: string) => Promise<unknown>,
  onProgress: (done: number, total: number) => void = () => {},
): Promise<KeepOutcome[]> {
  const outcomes: KeepOutcome[] = [];
  for (const sessionId of sessionIds) {
    try {
      await keep(sessionId);
      outcomes.push({ sessionId, kept: true });
    } catch {
      outcomes.push({ sessionId, kept: false });
    }
    onProgress(outcomes.length, sessionIds.length);
  }
  return outcomes;
}

/** The total size of what is about to be kept, when every size is known. */
export function totalBytes(sizes: ReadonlyArray<number | undefined>): number | undefined {
  if (sizes.length === 0 || sizes.some((size) => size === undefined)) return undefined;
  return sizes.reduce<number>((sum, size) => sum + (size ?? 0), 0);
}
