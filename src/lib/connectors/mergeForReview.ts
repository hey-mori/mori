/**
 * Merge multiple `NormalizedImportCandidate`-like results from
 * `normalizeConnectorEventBatch` into ONE candidate suitable for the existing
 * Import Review UI.
 *
 * Why merge? `normalizeConnectorEventBatch` buckets events by
 * `(connectorId, externalSessionId)`, which is the right grouping for
 * Project Memory and traceability — but the Import Review surface today is
 * single-source. Rather than rewrite Import Review to handle N candidates,
 * we merge the connector buckets into a single composite source so the user
 * gets one Review draft with every connector event inside it.
 *
 * Provenance is preserved per-event (each `TimelineEvent.sourceRefs` still
 * carries the bucket's source id), and the merged source's `detail` reports
 * exactly which connector sessions contributed.
 *
 * If the input has zero or one candidate, returns it as-is (no merging
 * needed). The merged source's `kind` falls back to `manualNote` when the
 * buckets disagree, which routes through the same `SOURCE_REGISTRY` row as
 * the manual-paste path.
 */
import type { SourceKind, SourceRef, TimelineEvent } from "../../domain/types";
import type { NormalizedImportCandidate } from "../import/types";
import type { NormalizedImportCandidateLike } from "./types";

export function mergeConnectorCandidatesForReview(
  candidates: NormalizedImportCandidateLike[],
): NormalizedImportCandidate | null {
  if (candidates.length === 0) return null;
  if (candidates.length === 1) {
    const only = candidates[0]!;
    return { source: only.source, events: only.events };
  }

  // Pick the kind that's shared by every bucket; otherwise fall back to
  // manualNote so the merged row still resolves cleanly in the source
  // registry. This matches the existing behaviour for unknown connector ids.
  const distinctKinds = new Set(candidates.map((entry) => entry.source.kind));
  const mergedKind: SourceKind = distinctKinds.size === 1
    ? candidates[0]!.source.kind
    : "manualNote";

  const earliestCapturedAt = candidates
    .map((entry) => entry.source.capturedAt)
    .sort((a, b) => new Date(a).getTime() - new Date(b).getTime())[0]!;

  const allEvents: TimelineEvent[] = [];
  const seenEventIds = new Set<string>();
  for (const entry of candidates) {
    for (const event of entry.events) {
      if (seenEventIds.has(event.id)) continue;
      seenEventIds.add(event.id);
      allEvents.push(event);
    }
  }
  allEvents.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

  const sourceTitle = `Connector JSONL · ${candidates.length} sessions · ${allEvents.length} events`;
  const sourceDetail = candidates
    .map((entry) => `${entry.source.title} (${entry.events.length})`)
    .join(" · ");

  // Worst-case trust + retention so the merged row never over-claims. If any
  // bucket was inferred we surface inferred; if any retained raw text we
  // surface retained. Redaction status stays "redacted" only when every
  // bucket was redacted; otherwise "pending" so Import Review can flag it.
  const mergedTrustLevel = candidates.some((entry) => entry.source.trustLevel === "inferred")
    ? "inferred"
    : candidates.some((entry) => entry.source.trustLevel === "observed")
      ? "observed"
      : "verified";
  const mergedRetention = candidates.some((entry) => entry.source.rawRetention === "retained")
    ? "retained"
    : candidates.some((entry) => entry.source.rawRetention === "summaryOnly")
      ? "summaryOnly"
      : "deleted";
  const mergedRedaction: SourceRef["redactionStatus"] = candidates.every(
    (entry) => entry.source.redactionStatus === "redacted",
  )
    ? "redacted"
    : candidates.some((entry) => entry.source.redactionStatus === "redacted")
      ? "pending"
      : "notNeeded";

  const sessionId = candidates[0]!.source.sessionId;
  const mergedSourceId = `src-conn-merge-${earliestCapturedAt}-${allEvents.length}`;

  const source: SourceRef = {
    id: mergedSourceId,
    sessionId,
    kind: mergedKind,
    title: sourceTitle,
    detail: sourceDetail,
    trustLevel: mergedTrustLevel,
    redactionStatus: mergedRedaction,
    rawRetention: mergedRetention,
    capturedAt: earliestCapturedAt,
    relatedEventIds: allEvents.map((event) => event.id),
  };

  // Important: the underlying events keep their *original* `sourceRefs`
  // (each event still points at the bucket source id) so per-event
  // provenance survives the merge. The merged source is added on top — it's
  // the "JSONL import batch" wrapper, not a replacement for the per-bucket
  // source id.
  const rewiredEvents = allEvents.map((event) => ({
    ...event,
    sourceRefs: Array.from(new Set([mergedSourceId, ...event.sourceRefs])),
  }));

  return { source, events: rewiredEvents };
}
