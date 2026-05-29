import { CornerDownRight, Flag, ListChecks, TriangleAlert } from "lucide-react";
import type { MockSession } from "../../domain/types";
import {
  buildNarrative,
  type NarrativeMoment,
  type NarrativeMomentKind,
} from "../../lib/timeline-lab/narrative";
import { InfoHint } from "../../components/ui/InfoHint";

const KIND_LABEL: Record<NarrativeMomentKind, string> = {
  conversation: "대화",
  decision: "결정",
  issue: "이슈",
  code: "구현",
  research: "조사",
  note: "기록",
  other: "기타",
};

/**
 * 서사 — the session rebuilt as a single vertical story.
 *
 * One spine the eye reads top to bottom. Each moment carries the causal reason
 * that led into it (rendered between nodes, so the list reads as a thread, not
 * a pile), with decisions and issues elevated inline. A closing "이어가기" block
 * collects what is still open so the story has an ending the user can act on.
 */
export function NarrativeStoryView({ view }: { view: MockSession }) {
  const { moments, continuation } = buildNarrative(view);

  if (moments.length === 0) {
    return <LabEmpty>이 세션에는 아직 재구성할 이벤트가 없습니다.</LabEmpty>;
  }

  return (
    <div className="lab-narrative">
      <ol className="lab-spine">
        {moments.map((moment) => (
          <MomentNode key={moment.id} moment={moment} />
        ))}
      </ol>
      <ContinuationBlock continuation={continuation} />
    </div>
  );
}

function MomentNode({ moment }: { moment: NarrativeMoment }) {
  return (
    <li
      className="lab-moment"
      data-tone={moment.tone}
      data-kind={moment.kind}
      data-importance={moment.importance}
    >
      {moment.connection ? (
        <p className="lab-connection">
          <CornerDownRight size={13} aria-hidden="true" />
          <span>{moment.connection}</span>
        </p>
      ) : null}
      <div className="lab-moment-row">
        <span className="lab-moment-rail" aria-hidden="true">
          <span className="lab-moment-dot" />
        </span>
        <div className="lab-moment-body">
          <div className="lab-moment-head">
            {moment.timeLabel ? (
              <span className="lab-moment-time">{moment.timeLabel}</span>
            ) : null}
            <span className="lab-moment-kind">{KIND_LABEL[moment.kind]}</span>
          </div>
          <h4 className="lab-moment-title">{moment.title}</h4>
          {moment.summary ? <p className="lab-moment-summary">{moment.summary}</p> : null}
          {moment.decisions.length > 0 || moment.issues.length > 0 ? (
            <div className="lab-moment-elevated">
              {moment.decisions.map((decision) => (
                <span key={decision.id} className="lab-tag lab-tag-decision" title={decision.rationale}>
                  <Flag size={11} aria-hidden="true" />
                  {decision.title}
                </span>
              ))}
              {moment.issues.map((issue) => (
                <span key={issue.id} className="lab-tag lab-tag-issue">
                  <TriangleAlert size={11} aria-hidden="true" />
                  {issue.title}
                </span>
              ))}
            </div>
          ) : null}
          {moment.evidence.length > 0 ? (
            <div className="lab-moment-evidence">
              {moment.evidence.map((chip, index) => (
                <span key={index} className="lab-evidence" data-tone={chip.tone}>
                  {chip.label}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </li>
  );
}

function ContinuationBlock({
  continuation,
}: {
  continuation: ReturnType<typeof buildNarrative>["continuation"];
}) {
  const { openIssues, nextActions, resumePrompt } = continuation;
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
            <span className="lab-carry-label">미해결 이슈 {openIssues.length}</span>
            <ul>
              {openIssues.map((issue) => (
                <li key={issue.id}>{issue.title}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {nextActions.length > 0 ? (
          <div className="lab-carry-col">
            <span className="lab-carry-label">다음 작업 {nextActions.length}</span>
            <ul>
              {nextActions.map((action) => (
                <li key={action.id}>{action.title}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
      {resumePrompt ? (
        <div className="lab-carry-resume">
          <span className="lab-carry-label">재개 프롬프트</span>
          <p>{resumePrompt}</p>
        </div>
      ) : null}
    </section>
  );
}

function LabEmpty({ children }: { children: React.ReactNode }) {
  return <div className="lab-empty">{children}</div>;
}
