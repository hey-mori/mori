import { useMemo } from "react";
import { buildProjectActivity } from "../../lib/project/projectActivity";

/**
 * Compact per-project activity summary: a sparkline of session counts over time
 * (weekly, or monthly for long-lived projects) plus the active span and total.
 * A lightweight stand-in for a full event timeline — it needs only session
 * timestamps. Styled inline so it stays independent of the shared stylesheet.
 */
export function ProjectActivityStrip({
  timestamps,
}: {
  timestamps: ReadonlyArray<string>;
}) {
  const activity = useMemo(() => buildProjectActivity(timestamps), [timestamps]);
  if (activity.total === 0) return null;

  const { buckets, maxCount, total, firstAt, lastAt } = activity;

  return (
    <section
      aria-label="프로젝트 활동"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 20,
        padding: "12px 2px 4px",
      }}
    >
      <div style={{ display: "grid", gap: 3, minWidth: 0 }}>
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.05em",
            textTransform: "uppercase",
            color: "var(--muted-2)",
          }}
        >
          활동
        </span>
        <span style={{ fontSize: 12.5, color: "var(--muted)", fontWeight: 600 }}>
          {shortDate(firstAt)} – {shortDate(lastAt)} · 세션 {total}개
        </span>
      </div>
      <div
        aria-hidden="true"
        style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 30, flex: "0 0 auto" }}
      >
        {buckets.map((bucket, index) => (
          <div
            key={index}
            title={`${shortDate(bucket.start)} · ${bucket.count}회`}
            style={{
              width: 5,
              // Any active week clears a clear minimum so it reads as taller
              // than the faint empty-week baseline, regardless of the busiest
              // week's count.
              height: bucket.count > 0 ? `${Math.max(42, (bucket.count / maxCount) * 100)}%` : "12%",
              background: bucket.count > 0 ? "var(--purple)" : "var(--line)",
              borderRadius: 2,
            }}
          />
        ))}
      </div>
    </section>
  );
}

function shortDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}
