import { useMemo } from "react";
import { buildProjectActivity } from "../../lib/project/projectActivity";
import type { ProjectSynthesis } from "../../lib/project/projectSynthesis";

/**
 * "프로젝트 개요" — the project page's summarised, at-a-glance band.
 *
 * The page used to lead with stacked lists; this gives it a visual top line
 * instead. Two complementary summaries sit side by side:
 *   - 활동: a session-count sparkline over the project's life (the *trend*),
 *   - 작업 종합: colour-coded magnitude bars for decisions / open issues /
 *     pending next actions (the *shape* of the accumulated work).
 *
 * It derives everything from session timestamps and the already-computed
 * synthesis, so it adds a chart without loading anything new. Status colours
 * stay semantic (decisions green, open issues red, next actions blue); brand
 * purple is reserved for the activity sparkline as the signature visual.
 */

const BARS = [
  { key: "decisions", label: "결정", fill: "var(--green)", track: "var(--green-50)" },
  { key: "openIssues", label: "미해결", fill: "var(--red)", track: "var(--red-50)" },
  { key: "pendingNextActions", label: "다음 할 일", fill: "var(--blue)", track: "var(--blue-50)" },
] as const;

export function ProjectPulse({
  timestamps,
  synthesis,
}: {
  timestamps: ReadonlyArray<string>;
  synthesis: ProjectSynthesis;
}) {
  const activity = useMemo(() => buildProjectActivity(timestamps), [timestamps]);

  const bars = BARS.map((bar) => ({ ...bar, count: synthesis.totals[bar.key] }));
  const maxCount = Math.max(1, ...bars.map((bar) => bar.count));
  const hasActivity = activity.total > 0;
  const hasWork = bars.some((bar) => bar.count > 0);

  if (!hasActivity && !hasWork) return null;

  return (
    <section
      aria-label="프로젝트 개요"
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 32,
        alignItems: "stretch",
        padding: "16px 18px",
        border: "1px solid var(--line)",
        borderRadius: 12,
        background: "var(--panel-soft)",
      }}
    >
      {hasActivity ? (
        <div
          style={{
            flex: "1 1 320px",
            minWidth: 240,
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          <Eyebrow>활동</Eyebrow>
          <div
            aria-hidden="true"
            style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 54 }}
          >
            {activity.buckets.map((bucket, index) => (
              <div
                key={index}
                title={`${shortDate(bucket.start)} · ${bucket.count}회`}
                style={{
                  flex: "1 1 0",
                  minWidth: 3,
                  maxWidth: 16,
                  height:
                    bucket.count > 0
                      ? `${Math.max(32, (bucket.count / activity.maxCount) * 100)}%`
                      : "10%",
                  background: bucket.count > 0 ? "var(--purple)" : "var(--line)",
                  borderRadius: 3,
                }}
              />
            ))}
          </div>
          <span style={{ fontSize: 12.5, color: "var(--muted)", fontWeight: 600 }}>
            {shortDate(activity.firstAt)} – {shortDate(activity.lastAt)} · 세션 {activity.total}개
          </span>
        </div>
      ) : null}

      {hasWork ? (
        <div
          style={{
            flex: "1 1 280px",
            minWidth: 240,
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          <Eyebrow>작업 종합</Eyebrow>
          <div style={{ display: "grid", gap: 9, alignContent: "center", flex: 1 }}>
            {bars.map((bar) => (
              <div
                key={bar.key}
                style={{
                  display: "grid",
                  gridTemplateColumns: "70px 1fr auto",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <span style={{ fontSize: 12.5, color: "var(--muted)", fontWeight: 600 }}>
                  {bar.label}
                </span>
                <span
                  style={{
                    display: "block",
                    height: 8,
                    borderRadius: 5,
                    background: bar.track,
                    overflow: "hidden",
                  }}
                >
                  <span
                    style={{
                      display: "block",
                      height: "100%",
                      width: `${(bar.count / maxCount) * 100}%`,
                      minWidth: bar.count > 0 ? 6 : 0,
                      background: bar.fill,
                      borderRadius: 5,
                    }}
                  />
                </span>
                <span
                  style={{
                    fontSize: 14,
                    fontWeight: 700,
                    color: "var(--text)",
                    minWidth: 22,
                    textAlign: "right",
                  }}
                >
                  {bar.count}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: "0.05em",
        textTransform: "uppercase",
        color: "var(--muted-2)",
      }}
    >
      {children}
    </span>
  );
}

function shortDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}
