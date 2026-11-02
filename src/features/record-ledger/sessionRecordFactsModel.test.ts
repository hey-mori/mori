import { describe, expect, it } from "vitest";
import type { MoriRecord } from "../../lib/record-kernel/kernelTypes";
import { sessionRecordFacts } from "./sessionRecordFactsModel";

const record = (extra: Partial<MoriRecord>): MoriRecord => ({ id: "auto-claude-x", schemaId: "agent-session", title: "t", properties: {}, ...extra }) as MoriRecord;

describe("what a session record still says", () => {
  it("names the period from its observed start and end", () => {
    const facts = sessionRecordFacts(record({ occurredStart: "2026-09-02T08:52:34", occurredEnd: "2026-09-09T13:38:58" }));
    expect(facts.period).toBe("9월 2일 – 9월 9일");
  });

  it("is one day when it started and ended the same day, and nothing when undated", () => {
    expect(sessionRecordFacts(record({ occurredStart: "2026-09-02T08:00:00", occurredEnd: "2026-09-02T09:00:00" })).period).toBe("9월 2일");
    expect(sessionRecordFacts(record({})).period).toBeNull();
  });

  it("lists the PRs its stored evidence recorded, once each", () => {
    const pr = (number: number) => ({ repository: "swarea/infra", number, url: `https://github.com/swarea/infra/pull/${number}`, line: 3 });
    const facts = sessionRecordFacts(
      record({ properties: { sessionEvidence: { coverage: "complete", segment: "s", prs: [pr(12), pr(13), pr(12)], branches: [], continuesIn: [] } } }),
    );
    expect(facts.prs).toEqual([{ repository: "swarea/infra", numbers: [12, 13] }]);
  });
});
