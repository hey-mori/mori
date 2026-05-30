import { useState } from "react";
import { Check, ClipboardCopy, Flag, ListChecks, ShieldCheck, TriangleAlert } from "lucide-react";
import type { MockSession } from "../../domain/types";
import { buildPulse, type Pulse } from "../../lib/timeline-lab/pulse";
import type { NarrativeMomentKind } from "../../lib/timeline-lab/narrative";
import { InfoHint } from "../../components/ui/InfoHint";

/** Stat tiles that map onto a filterable moment kind become drill-down buttons. */
const STAT_FOCUS_KIND: Record<string, NarrativeMomentKind> = {
  decisions: "decision",
  issues: "issue",
};

/**
 * 맥동 · the session read as vital signs.
 *
 * The other three lenses walk through content; this one steps back and answers
 * "what kind of session was this?" before you read a word of it: how much
 * happened, how the work split across the arc, how grounded the reconstruction
 * is, whether the issues actually closed, and where the effort clustered in
 * time. It closes with the carry-forward, including a one-tap resume prompt, so
 * the glance layer is also the launch pad for the next session.
 */
export function PulseView({
  view,
  onFocusKind,
}: {
  view: MockSession;
  onFocusKind?: (kind: NarrativeMomentKind) => void;
}) {
  const pulse = buildPulse(view);

  if (pulse.totalMoments === 0) {
    return <div className="lab-empty">이 세션에는 아직 재구성할 이벤트가 없습니다.</div>;
  }

  return (
    <div className="lab-pulse">
      <header className="lab-pulse-head">
        <h4>세션 맥동</h4>
        <InfoHint label="맥동 설명">
          이 세션이 어떤 작업이었는지 숫자로 먼저 보여줍니다. 얼마나 많은 일이
          있었고, 작업이 어느 국면에 몰렸고, 재구성이 얼마나 근거에 기반했고,
          이슈가 실제로 닫혔는지, 그리고 시간상 어디에 힘이 실렸는지입니다.
        </InfoHint>
      </header>

      <div className="lab-pulse-health" data-tone={pulse.health.tone} role="img"
        aria-label={`근거 ${pulse.health.groundedPct}퍼센트, ${pulse.health.label}`}>
        <div className="lab-pulse-health-row">
          <span className="lab-pulse-health-label">{pulse.health.label}</span>
          <span className="lab-pulse-health-pct">근거 {pulse.health.groundedPct}%</span>
        </div>
        <div className="lab-pulse-health-track">
          <span className="lab-pulse-health-fill" style={{ width: `${pulse.health.groundedPct}%` }} />
        </div>
      </div>

      <div className="lab-pulse-stats">
        {pulse.stats.map((stat) => {
          const focusKind = STAT_FOCUS_KIND[stat.id];
          const canFocus = onFocusKind && focusKind && Number(stat.value) > 0;
          const inner = (
            <>
              <span className="lab-pulse-stat-value">{stat.value}</span>
              <span className="lab-pulse-stat-label">{stat.label}</span>
              {stat.detail ? <span className="lab-pulse-stat-detail">{stat.detail}</span> : null}
            </>
          );
          if (canFocus) {
            return (
              <button
                key={stat.id}
                type="button"
                className="lab-pulse-stat is-focusable"
                data-tone={stat.tone}
                data-emphasis={stat.emphasis}
                onClick={() => onFocusKind(focusKind)}
                title={`${stat.label} ${stat.value}개를 서사에서 보기`}
              >
                {inner}
              </button>
            );
          }
          return (
            <div key={stat.id} className="lab-pulse-stat" data-tone={stat.tone} data-emphasis={stat.emphasis}>
              {inner}
            </div>
          );
        })}
      </div>

      <div className="lab-pulse-grid">
        <PhaseDistribution pulse={pulse} />
        <TrustComposition pulse={pulse} />
        <IssueResolution pulse={pulse} />
        <Momentum pulse={pulse} />
      </div>

      <Carry continuation={pulse.continuation} resumePrompt={pulse.resumePrompt} />
    </div>
  );
}

function Panel({
  title,
  hint,
  empty,
  children,
}: {
  title: string;
  hint: string;
  empty?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="lab-pulse-panel">
      <header className="lab-pulse-panel-head">
        <h5>{title}</h5>
        <InfoHint label={`${title} 설명`}>{hint}</InfoHint>
      </header>
      {empty ? <p className="lab-pulse-panel-empty">표시할 데이터가 없습니다.</p> : children}
    </section>
  );
}

function PhaseDistribution({ pulse }: { pulse: Pulse }) {
  return (
    <Panel
      title="국면 분포"
      hint="작업이 탐색·결정·구현·점검·정리 중 어디에 얼마나 몰렸는지를 비중으로 보여줍니다."
      empty={pulse.phases.length === 0}
    >
      <div className="lab-pulse-bar" role="img" aria-label="국면별 비중">
        {pulse.phases.map((phase) => (
          <span
            key={phase.id}
            className="lab-pulse-bar-seg"
            data-tone={phase.tone}
            style={{ flexGrow: phase.count }}
            title={`${phase.label} ${phase.count}개 · ${phase.pct}%`}
          />
        ))}
      </div>
      <ul className="lab-pulse-legend">
        {pulse.phases.map((phase) => (
          <li key={phase.id} data-tone={phase.tone}>
            <span className="lab-pulse-swatch" aria-hidden="true" />
            <span className="lab-pulse-legend-label">{phase.label}</span>
            <span className="lab-pulse-legend-val">{phase.pct}%</span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function TrustComposition({ pulse }: { pulse: Pulse }) {
  const verified = pulse.trust.find((t) => t.level === "verified")?.pct ?? 0;
  return (
    <Panel
      title="근거 구성"
      hint="각 순간이 얼마나 단단한 근거 위에 있는지입니다. 확인된 비중이 높을수록 재구성을 더 믿을 수 있습니다."
      empty={pulse.trust.length === 0}
    >
      <div className="lab-pulse-trust-head">
        <ShieldCheck size={14} aria-hidden="true" />
        <span>
          확인 <strong>{verified}%</strong>
        </span>
      </div>
      <div className="lab-pulse-bar" role="img" aria-label="근거 수준 비중">
        {pulse.trust.map((slice) => (
          <span
            key={slice.level}
            className="lab-pulse-bar-seg"
            data-tone={slice.tone}
            style={{ flexGrow: slice.count }}
            title={`${slice.label} ${slice.count}개 · ${slice.pct}%`}
          />
        ))}
      </div>
      <ul className="lab-pulse-legend">
        {pulse.trust.map((slice) => (
          <li key={slice.level} data-tone={slice.tone}>
            <span className="lab-pulse-swatch" aria-hidden="true" />
            <span className="lab-pulse-legend-label">{slice.label}</span>
            <span className="lab-pulse-legend-val">{slice.count}</span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function IssueResolution({ pulse }: { pulse: Pulse }) {
  const { open, resolved, total, resolvedPct } = pulse.issues;
  return (
    <Panel
      title="이슈 해결"
      hint="이 세션에서 떠오른 이슈 중 실제로 닫힌 비율입니다. 남은 이슈는 아래 이어가기로 넘어갑니다."
      empty={total === 0}
    >
      <div className="lab-pulse-resolve">
        <span className="lab-pulse-resolve-pct">{resolvedPct}%</span>
        <span className="lab-pulse-resolve-caption">해결됨</span>
      </div>
      <div
        className="lab-pulse-meter"
        role="img"
        aria-label={`${total}건 중 ${resolved}건 해결`}
      >
        <span className="lab-pulse-meter-fill" style={{ width: `${resolvedPct}%` }} />
      </div>
      <div className="lab-pulse-resolve-row">
        <span className="lab-pulse-chip" data-tone="green">
          <Check size={11} aria-hidden="true" />
          해결 {resolved}
        </span>
        <span className="lab-pulse-chip" data-tone="red">
          <TriangleAlert size={11} aria-hidden="true" />
          미해결 {open}
        </span>
      </div>
    </Panel>
  );
}

function Momentum({ pulse }: { pulse: Pulse }) {
  const empty = pulse.momentum.length === 0;
  return (
    <Panel
      title="활동 흐름"
      hint="세션을 같은 시간 폭으로 잘라, 각 구간에 몇 개의 순간이 있었는지입니다. 결정·이슈가 있던 구간은 점으로 표시됩니다."
      empty={empty}
    >
      <div className="lab-pulse-spark" role="img" aria-label="시간대별 활동량">
        {pulse.momentum.map((bucket, index) => (
          <span key={index} className="lab-pulse-spark-col" title={`${bucket.label} · ${bucket.count}개`}>
            {bucket.pivotal ? <span className="lab-pulse-spark-dot" aria-hidden="true" /> : null}
            <span
              className="lab-pulse-spark-bar"
              data-pivotal={bucket.pivotal ? "true" : undefined}
              style={{ height: `${Math.max(bucket.pct, bucket.count > 0 ? 8 : 2)}%` }}
            />
          </span>
        ))}
      </div>
      {!empty ? (
        <div className="lab-pulse-spark-axis">
          <span>{pulse.momentum[0]?.label}</span>
          <span>{pulse.momentum[pulse.momentum.length - 1]?.label}</span>
        </div>
      ) : null}
    </Panel>
  );
}

function Carry({
  continuation,
  resumePrompt,
}: {
  continuation: Pulse["continuation"];
  resumePrompt: string | null;
}) {
  const { openIssues, nextActions } = continuation;
  const isEmpty = openIssues.length === 0 && nextActions.length === 0 && !resumePrompt;
  if (isEmpty) return null;
  return (
    <section className="lab-carry" aria-label="이어가기">
      <header className="lab-carry-head">
        <ListChecks size={14} aria-hidden="true" />
        <h4>이어가기</h4>
        <InfoHint label="이어가기 설명">
          이 세션을 떠난 뒤에도 남는 것: 해결되지 않은 이슈, 남은 다음 작업,
          그리고 다음 세션을 시작할 때 붙여 넣을 재개 프롬프트입니다.
        </InfoHint>
      </header>
      <div className="lab-carry-grid">
        {openIssues.length > 0 ? (
          <div className="lab-carry-col">
            <span className="lab-carry-label">
              <Flag size={11} aria-hidden="true" />
              미해결 이슈 {openIssues.length}
            </span>
            <ul>
              {openIssues.map((issue) => (
                <li key={issue.id}>{issue.title}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {nextActions.length > 0 ? (
          <div className="lab-carry-col">
            <span className="lab-carry-label">
              <ListChecks size={11} aria-hidden="true" />
              다음 작업 {nextActions.length}
            </span>
            <ul>
              {nextActions.map((action) => (
                <li key={action.id}>{action.title}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
      {resumePrompt ? <ResumeBlock prompt={resumePrompt} /> : null}
    </section>
  );
}

function ResumeBlock({ prompt }: { prompt: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(prompt);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };
  const Icon = copied ? Check : ClipboardCopy;
  return (
    <div className="lab-carry-resume">
      <div className="lab-carry-resume-head">
        <span className="lab-carry-label">재개 프롬프트</span>
        <button type="button" className="lab-carry-copy" onClick={handleCopy} aria-live="polite">
          <Icon size={12} aria-hidden="true" />
          {copied ? "복사됨" : "복사"}
        </button>
      </div>
      <p>{prompt}</p>
    </div>
  );
}
