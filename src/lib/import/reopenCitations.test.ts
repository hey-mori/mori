import { describe, expect, it } from "vitest";
import { eventIdsCitedOutsideAdoptedRun } from "./reopenCitations";

const run = (runId: string, eventId: string) =>
  ({
    runId,
    issues: [{ sourceEventIds: [eventId] }],
    decisions: [],
    nextActions: [],
    relationships: [],
  }) as never;

describe("eventIdsCitedOutsideAdoptedRun", () => {
  it("collects accepted memory evidence for this session only", () => {
    const cited = eventIdsCitedOutsideAdoptedRun(
      "s1",
      [
        { evidenceRefs: [{ kind: "event", sessionId: "s1", eventId: "e1" }, { kind: "event", sessionId: "s2", eventId: "e2" }] },
      ] as never,
      null,
    );
    expect([...cited!]).toEqual(["e1"]);
  });

  it("collects runs other than the adopted one, never the adopted run", () => {
    const cited = eventIdsCitedOutsideAdoptedRun("s1", [], {
      sessionId: "s1",
      runs: [run("r1", "old"), run("r2", "adopted")],
      currentRunId: "r2",
    });
    expect([...cited!]).toEqual(["old"]);
  });

  it("is unknown when accepted memory could not be read", () => {
    expect(eventIdsCitedOutsideAdoptedRun("s1", null, null)).toBeNull();
  });
});
