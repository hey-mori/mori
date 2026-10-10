import { InfoHint } from "../../components/ui/InfoHint";
import type { MoriRecord } from "../../lib/record-kernel/kernelTypes";
import { sessionRecordFacts } from "./sessionRecordFacts";

const PRS_SHOWN = 8;

/**
 * An agent session shown as its record because the session could not be
 * opened. Says so, and shows what the record kept: the period and the PRs it
 * mentioned. Nothing here claims the work or the PRs still exist.
 */
export function SessionRecordFacts({ record }: { record: MoriRecord }) {
  const facts = sessionRecordFacts(record);
  return (
    <div className="session-record-facts">
      <p className="session-record-facts-lead">
        원본 대화를 열 수 없습니다
        <InfoHint label="원본 대화를 열 수 없는 이유">
          방금 이 세션을 열어 보았지만 대화 파일도, 가져오거나 보관해 둔 사본도 찾지 못했습니다.
          아래는 원본이 있을 때 Mori가 기록해 둔 내용입니다.
        </InfoHint>
      </p>
      {facts.period ? <p className="session-record-facts-row">기간 {facts.period}</p> : null}
      {facts.prs.map(({ repository, numbers }) => (
        <p key={repository} className="session-record-facts-row">
          언급한 PR · {repository} {numbers.slice(0, PRS_SHOWN).map((number) => `#${number}`).join(" ")}
          {numbers.length > PRS_SHOWN ? ` 외 ${numbers.length - PRS_SHOWN}개` : ""}
          {facts.partial ? " (일부만 읽음)" : ""}
        </p>
      ))}
    </div>
  );
}
