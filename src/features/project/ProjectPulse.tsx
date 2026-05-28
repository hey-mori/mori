import { useMemo, type ReactNode } from "react";
import { buildContributionGrid } from "../../lib/home/contributionGrid";
import { buildProjectActivityStats } from "../../lib/project/projectActivityStats";
import type { ProjectSynthesis } from "../../lib/project/projectSynthesis";
import { ContributionHeatmap } from "../../components/activity/ContributionHeatmap";
import { MoriMetricStrip } from "../../components/ui/MoriMetricStrip";

/**
 * The project page's two summary cards, scoped to a single project:
 *   - 작업 활동: the shared contribution heatmap (the "잔디", same component as
 *     Home) plus a 세션 / 현재 연속 / 최장 연속 / 최근 활동 stat strip — the
 *     *cadence* of the work.
 *   - 작업 종합: soft, colour-coded magnitude bars for decisions / open issues /
 *     pending next actions — the *shape* of the accumulated work.
 *
 * They are two separate cards (not one band) sharing the page's card chrome and
 * the standard section-title type, so they line up with the hero and the
 * 종합 / 세션 sections below. Everything derives from session timestamps and the
 * already-computed synthesis, so no session bodies are loaded here.
 */

// Softened semantic fills — the full-strength tokens read too hot as wide bars,
// so each is mixed toward white. Tracks stay on the existing soft tints.
const BARS = [
  {
    key: "decisions",
    label: "결정",
    fill: "color-mix(in srgb, var(--green) 62%, white)",
    track: "color-mix(in srgb, var(--green) 12%, white)",
  },
  {
    key: "openIssues",
    label: "미해결",
    fill: "color-mix(in srgb, var(--red) 60%, white)",
    track: "color-mix(in srgb, var(--red) 12%, white)",
  },
  {
    key: "pendingNextActions",
    label: "다음 할 일",
    fill: "color-mix(in srgb, var(--blue) 58%, white)",
    track: "color-mix(in srgb, var(--blue) 12%, white)",
  },
] as const;

const CARD_STYLE = {
  display: "flex",
  flexDirection: "column",
  gap: 14,
  padding: "16px 20px",
  border: "1px solid var(--line)",
  borderRadius: 12,
  background: "var(--mori-surface)",
} as const;

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

  const twoUp = hasActivity && hasWork;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: twoUp ? "minmax(0, 1.7fr) minmax(220px, 1fr)" : "1fr",
        gap: 16,
        alignItems: "start",
      }}
    >
      {hasActivity ? (
        <PulseCard title="작업 활동">
          <ContributionHeatmap grid={grid} />
          <MoriMetricStrip items={statItems} />
        </PulseCard>
      ) : null}

      {hasWork ? (
        <PulseCard title="작업 종합">
          <div style={{ display: "grid", gap: 12 }}>
            {bars.map((bar) => (
              <div
                key={bar.key}
                style={{
                  display: "grid",
                  gridTemplateColumns: "66px 1fr auto",
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
                    fontSize: 13.5,
                    fontWeight: 700,
                    color: "var(--text)",
                    minWidth: 20,
                    textAlign: "right",
                  }}
                >
                  {bar.count}
                </span>
              </div>
            ))}
          </div>
        </PulseCard>
      ) : null}
    </div>
  );
}

function PulseCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title} style={CARD_STYLE}>
      <h3 className="mori-section-title">{title}</h3>
      {children}
    </section>
  );
}

function shortDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}
