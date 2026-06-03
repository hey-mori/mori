import { Fragment } from "react";
import {
  Brain,
  ChevronRight,
  Database,
  DownloadCloud,
  Layers3,
  type LucideIcon,
  PlayCircle,
  Sparkles,
} from "lucide-react";
import { InfoHint } from "../../components/ui/InfoHint";
import { formatCompactCount } from "../../lib/home/homeOverview";
import type {
  HomeMemoryState,
  MemoryStateKey,
} from "../../lib/home/homeMemoryState";

/** One pipeline stage with a real aggregate count. */
export type WorkFlowStage = {
  key: string;
  label: string;
  value: number;
  unit: string;
};

/**
 * Dashboard insight cards — two honest, real-data views that complement the
 * analytics charts: the lifecycle distribution of remembered work (기억 상태)
 * and Mori's capture→memory pipeline as aggregate totals (작업 흐름). Both reuse
 * the dashboard's `.dashboard-chart-card` chrome so they read as native dashboard
 * panels, and every figure is derived from already-imported local data.
 */
export function DashboardInsights({
  memory,
  stages,
  caption,
}: {
  memory: HomeMemoryState;
  stages: WorkFlowStage[];
  caption?: string | null;
}) {
  return (
    <div className="dashboard-insights">
      <MemoryStateCard memory={memory} />
      <WorkFlowCard stages={stages} caption={caption} />
    </div>
  );
}

/** Cap on rendered dots — beyond this each dot stands for several sessions. */
const MAX_DOTS = 64;

function MemoryStateCard({ memory }: { memory: HomeMemoryState }) {
  const { buckets, total, isEmpty } = memory;
  const scaled = total > MAX_DOTS;
  const perDot = scaled ? total / MAX_DOTS : 1;

  const dots: { key: MemoryStateKey; id: string }[] = [];
  if (!isEmpty) {
    for (const bucket of buckets) {
      if (bucket.count === 0) continue;
      const n = scaled
        ? Math.max(1, Math.round(bucket.count / perDot))
        : bucket.count;
      for (let i = 0; i < n; i += 1) {
        dots.push({ key: bucket.key, id: `${bucket.key}-${i}` });
      }
    }
  }

  return (
    <section className="dashboard-chart-card dashboard-insight" aria-label="기억 상태">
      <header>
        <span className="dashboard-chart-title">
          <Brain size={14} aria-hidden="true" />
          기억 상태
          <InfoHint label="기억 상태 설명">
            기억하는 각 작업 세션을 상태별로 나눈 분포입니다. 모든 수치는 실제 가져온 데이터에서 계산됩니다.
          </InfoHint>
        </span>
      </header>

      {isEmpty ? (
        <p className="dashboard-chart-empty">아직 기억된 작업이 없습니다.</p>
      ) : (
        <div className="dash-memory">
          <div
            className="dash-memory-field"
            role="img"
            aria-label={buckets
              .filter((bucket) => bucket.count > 0)
              .map((bucket) => `${bucket.label} ${bucket.count}`)
              .join(", ")}
          >
            {dots.map((dot) => (
              <span
                key={dot.id}
                className={`dash-memory-dot is-${dot.key}`}
                aria-hidden="true"
              />
            ))}
          </div>
          <dl className="dash-memory-legend">
            {buckets.map((bucket) => (
              <div
                key={bucket.key}
                className={`dash-memory-legend-item is-${bucket.key}`}
                title={bucket.description}
                data-zero={bucket.count === 0 ? "true" : undefined}
              >
                <dt>
                  <span className="dash-memory-swatch" aria-hidden="true" />
                  {bucket.label}
                </dt>
                <dd>{formatCompactCount(bucket.count)}</dd>
              </div>
            ))}
          </dl>
          {scaled ? (
            <p className="dash-memory-note">각 점은 약 {Math.round(perDot)}개 작업</p>
          ) : null}
        </div>
      )}
    </section>
  );
}

const STAGE_ICON: Record<string, LucideIcon> = {
  collect: DownloadCloud,
  organize: Layers3,
  extract: Sparkles,
  store: Database,
  resume: PlayCircle,
};

function WorkFlowCard({
  stages,
  caption,
}: {
  stages: WorkFlowStage[];
  caption?: string | null;
}) {
  return (
    <section className="dashboard-chart-card dashboard-insight" aria-label="작업 흐름">
      <header>
        <span className="dashboard-chart-title">
          <Sparkles size={14} aria-hidden="true" />
          작업 흐름
          <InfoHint label="작업 흐름 설명">
            가져온 소스를 정리하고 핵심을 추출해 기억으로 저장하기까지의 단계별 실제 수치입니다.
          </InfoHint>
        </span>
        {caption ? <span className="dash-flow-caption">{caption}</span> : null}
      </header>

      <ol className="dash-flow-track">
        {stages.map((stage, index) => {
          const Icon = STAGE_ICON[stage.key] ?? Layers3;
          return (
            <Fragment key={stage.key}>
              <li
                className="dash-flow-step"
                data-empty={stage.value === 0 ? "true" : undefined}
              >
                <span className="dash-flow-icon" aria-hidden="true">
                  <Icon size={16} />
                </span>
                <span className="dash-flow-figure">
                  <strong>{formatCompactCount(stage.value)}</strong>
                  <small>{stage.unit}</small>
                </span>
                <span className="dash-flow-label">{stage.label}</span>
              </li>
              {index < stages.length - 1 ? (
                <li className="dash-flow-arrow" aria-hidden="true">
                  <ChevronRight size={14} />
                </li>
              ) : null}
            </Fragment>
          );
        })}
      </ol>
    </section>
  );
}
