/**
 * Cross-session attention for the workbench canvas strip.
 *
 * Mori never invents urgency: the strip surfaces only the placed panels that
 * carry a real open issue or an unconfirmed decision, drawn from already-saved
 * session memory. Sessions with nothing pending never appear. The result is
 * deduped by session (the first panel showing a session is the jump target) so
 * the strip never repeats a session even when it is laid out in two panels, and
 * ordered most-urgent first.
 */

export type WorkbenchAttentionMeta = {
  title: string;
  openIssues: number;
  unconfirmedDecisions: number;
};

export type WorkbenchAttentionItem = {
  panelId: string;
  sessionId: string;
  title: string;
  openIssues: number;
  unconfirmedDecisions: number;
  total: number;
};

export function buildWorkbenchAttention(
  panels: ReadonlyArray<{ id: string; sessionId: string }>,
  metaById: ReadonlyMap<string, WorkbenchAttentionMeta>,
): WorkbenchAttentionItem[] {
  const seen = new Set<string>();
  const items: WorkbenchAttentionItem[] = [];
  for (const panel of panels) {
    if (seen.has(panel.sessionId)) continue;
    const meta = metaById.get(panel.sessionId);
    if (!meta) continue;
    const openIssues = Math.max(0, Math.trunc(meta.openIssues));
    const unconfirmedDecisions = Math.max(0, Math.trunc(meta.unconfirmedDecisions));
    const total = openIssues + unconfirmedDecisions;
    if (total === 0) continue;
    seen.add(panel.sessionId);
    items.push({
      panelId: panel.id,
      sessionId: panel.sessionId,
      title: meta.title,
      openIssues,
      unconfirmedDecisions,
      total,
    });
  }
  items.sort(
    (a, b) =>
      b.openIssues - a.openIssues ||
      b.unconfirmedDecisions - a.unconfirmedDecisions ||
      b.total - a.total,
  );
  return items;
}
