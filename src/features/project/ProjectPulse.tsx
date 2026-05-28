import { useMemo } from "react";
import { buildContributionGrid } from "../../lib/home/contributionGrid";
import { buildProjectActivityStats } from "../../lib/project/projectActivityStats";
import type { ProjectSynthesis } from "../../lib/project/projectSynthesis";
import { ContributionHeatmap } from "../../components/activity/ContributionHeatmap";
import { MoriMetricStrip } from "../../components/ui/MoriMetricStrip";

/**
 * "프로젝트 개요" — the project page's summarised, at-a-glance band.
 *
 * Two complementary summaries sit side by side:
 *   - 작업 활동: the shared contribution heatmap (the "잔디", same component as
 *     Home) plus a stat strip (세션 / 현재 연속 / 최장 연속 / 최근 활동), scoped to
 *     this one project — the *cadence* of the work.
 *   - 작업 종합: colour-coded magnitude bars for decisions / open issues /
 *     pending next actions — the *shape* of the accumulated work.
 *
 * Everything derives from session timestamps and the already-computed
 * synthesis, so it adds a chart without loading anything new. Status colours
 * stay semantic; the heatmap keeps its own green data-viz ramp.
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
  const grid = useMemo(
    () => buildContributionGrid({ timestamps: [...timestamps], metric: "sessions" }),
    [timestamps],
  );
  const stats = useMemo(() => buildProjectActivityStats(timestamps), [timestamps]);

  const bars = BARS.map((bar) => ({ ...bar, count: synthesis.totals[bar.key] }));
  const maxCount = Math.max(1, ...bars.map((bar) => bar.count));
  const hasActivity = stats.sessions > 0;
  const hasWork = bars.some((bar) => bar.count > 0);

  if (!hasActivity && !hasWork) return null;

  const statItems = [
    { key: "sessions", label: "세션", value: String(stats.sessions), hint: "이 프로젝트의 작업 실행" },
    {
      key: "streak-current",
      label: "현재 연속",
      value: `${stats.currentStreak}일`,
      hint: "연속으로 작업한 날",
    },
    {
      key: "streak-longest",
      label: "최장 연속",
      value: `${stats.longestStreak}일`,
      hint: "가장 길게 이어간 흐름",
    },
    { key: "recent", label: "최근 활동", value: shortDate(stats.lastActive), hint: "마지막 세션 날짜" },
  ];

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
        background: "var(--mori-surface)",
      }}
    >
      {hasActivity ? (
        <div
          style={{
            flex: "2 1 440px",
            minWidth: 280,
            display: "flex",
            flexDirection: "column",
            gap: 14,
          }}
        >
          <Eyebrow>작업 활동</Eyebrow>
          <ContributionHeatmap grid={grid} />
          <MoriMetricStrip items={statItems} />
        </div>
      ) : null}

      {hasWork ? (
        <div
          style={{
            flex: "1 1 230px",
            minWidth: 210,
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          <Eyebrow>작업 종합</Eyebrow>
          <div style={{ display: "grid", gap: 11, alignContent: "center", flex: 1 }}>
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
