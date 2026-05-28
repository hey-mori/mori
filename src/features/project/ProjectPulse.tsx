import { useMemo } from "react";
import { buildContributionGrid } from "../../lib/home/contributionGrid";
import { buildProjectActivityStats } from "../../lib/project/projectActivityStats";
import { WorkActivityCard } from "../../components/activity/WorkActivityCard";

/**
 * The project page's "작업 활동" card — the same shared panel Home renders,
 * scoped to a single project. It shows the project's session cadence (the
 * contribution heatmap) plus a 세션 / 현재 연속 / 최장 연속 / 최근 활동 stat strip
 * (no 프로젝트 tile, since we are already inside one project, and no lens toggle).
 *
 * Magnitudes (decisions / open issues / next actions) are no longer a separate
 * card here — they live as counts beside their group in "이 프로젝트 종합".
 *
 * Everything derives from the project's session timestamps, so nothing new is
 * loaded.
 */
export function ProjectPulse({ timestamps }: { timestamps: ReadonlyArray<string> }) {
  const grid = useMemo(
    () => buildContributionGrid({ timestamps: [...timestamps], metric: "sessions" }),
    [timestamps],
  );
  const stats = useMemo(() => buildProjectActivityStats(timestamps), [timestamps]);

  if (stats.sessions === 0) return null;

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
    <WorkActivityCard
      grid={grid}
      stats={statItems}
      sub={`최근 ${grid.weekCount}주 · 활동 ${grid.activeDays}일`}
    />
  );
}

function shortDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}
