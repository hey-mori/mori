/**
 * Home "기억 상태" derivation.
 *
 * Buckets every remembered session into one honest lifecycle state so the home
 * overview can show a real distribution of the work Mori is holding — never a
 * fabricated count. Each session lands in exactly one bucket (mutually
 * exclusive, priority-ordered), so the four counts always sum to the number of
 * sessions and the dot-matrix reads as an honest partition:
 *
 *   - 가져옴 (imported): captured but not yet analyzed — nothing reconstructed.
 *   - 검토 필요 (review): analyzed, with open issues that want a look before the
 *     memory is trusted. (Unconfirmed decisions are near-universal, so they do
 *     not by themselves flag review — open issues are the sharp signal.)
 *   - 재개 가능 (resumable): analyzed, no open issues, with a concrete pending
 *     next action to continue.
 *   - 저장됨 (saved): analyzed and settled — durable memory, nothing pending.
 *
 * Pure and dependency-light (just the metric snapshot shape) so it is unit
 * testable without rendering or storage.
 */
import type { HomeSessionMetricSnapshot } from "./homeOverview";
import type { ProductStateTone } from "../product-state/productStateLabels";

export type MemoryStateKey = "imported" | "review" | "resumable" | "saved";

export type MemoryStateBucket = {
  key: MemoryStateKey;
  /** Korean label — calm, product-vocabulary aligned. */
  label: string;
  /** One-line explanation for the tooltip / a11y. */
  description: string;
  /** Honest count of sessions in this state. */
  count: number;
  /** Semantic tone, shared with the app's tone vocabulary. */
  tone: ProductStateTone;
};

export type HomeMemoryState = {
  /** Always four buckets, in display order. */
  buckets: MemoryStateBucket[];
  /** Total remembered sessions (sum of bucket counts). */
  total: number;
  /** No remembered sessions at all — caller shows the empty state. */
  isEmpty: boolean;
  /** The largest bucket count, handy for normalising a proportional viz. */
  peak: number;
};

/** Display order, matching the legend reading order. */
const ORDER: MemoryStateKey[] = ["imported", "review", "saved", "resumable"];

const META: Record<
  MemoryStateKey,
  { label: string; description: string; tone: ProductStateTone }
> = {
  imported: {
    label: "가져옴",
    description: "가져왔지만 아직 분석하지 않은 작업",
    tone: "accent",
  },
  review: {
    label: "검토 필요",
    description: "이슈·미확정 결정이 있어 확인이 필요한 작업",
    tone: "warning",
  },
  saved: {
    label: "저장됨",
    description: "분석을 마치고 정리된 기억",
    tone: "success",
  },
  resumable: {
    label: "재개 가능",
    description: "다음 단계가 정해져 이어갈 수 있는 작업",
    tone: "neutral",
  },
};

/** Classify one session into its single memory-state bucket (priority-ordered). */
export function classifyMemoryState(
  metric: HomeSessionMetricSnapshot,
): MemoryStateKey {
  if (!metric.hasReconstructedWork) return "imported";
  if ((metric.openIssues ?? 0) > 0) return "review";
  if ((metric.pendingNextActions ?? 0) > 0) return "resumable";
  return "saved";
}

/** Build the home memory-state distribution from per-session metric snapshots. */
export function buildHomeMemoryState(
  metrics: HomeSessionMetricSnapshot[],
): HomeMemoryState {
  const counts: Record<MemoryStateKey, number> = {
    imported: 0,
    review: 0,
    resumable: 0,
    saved: 0,
  };
  for (const metric of metrics) counts[classifyMemoryState(metric)] += 1;

  const buckets = ORDER.map((key) => ({
    key,
    label: META[key].label,
    description: META[key].description,
    tone: META[key].tone,
    count: counts[key],
  }));
  const total = metrics.length;
  const peak = buckets.reduce((max, bucket) => Math.max(max, bucket.count), 0);

  return { buckets, total, isEmpty: total === 0, peak };
}
