import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ProjectLiveSection } from "./ProjectLiveSection";
import { buildScopedProjection } from "../../lib/live-intake/buildProjectProjection";
import { INTAKE_ROW_VERSION, type IntakeRequestRow } from "../../lib/live-intake/intakeTypes";

const NOW = Date.parse("2026-10-09T12:00:00.000Z");
const ago = (minutes: number) => new Date(NOW - minutes * 60_000).toISOString();
const row = (partial: Partial<IntakeRequestRow> & { id: string; sessionKey: string }): IntakeRequestRow => ({
  schemaVersion: INTAKE_ROW_VERSION,
  projectPath: "/p",
  sessionLabel: "p",
  title: "요청",
  titleTruncated: false,
  startedAt: ago(10),
  endedAt: ago(2),
  stepCount: 1,
  tools: [],
  files: [],
  hasError: false,
  status: "completed",
  locator: { path: partial.sessionKey, offset: 0 },
  observedAt: ago(1),
  ...partial,
});

describe("현재 상황 header", () => {
  it("does not show a count from half an hour ago as live because another session was just seen", () => {
    const projection = buildScopedProjection(
      [
        row({ id: "fresh", sessionKey: "/a", observedAt: ago(1) }),
        row({ id: "wait", sessionKey: "/b", status: "waitingForUser", endedAt: ago(31), observedAt: ago(30) }),
      ],
      { now: NOW, label: "infra" },
    );
    const html = renderToStaticMarkup(<ProjectLiveSection projection={projection} now={NOW} />);
    expect(html).not.toContain("ctx-live-dot");
    expect(html).toContain("30분 전 기준");
  });

  it("shows the live dot when every count was seen moments ago", () => {
    const projection = buildScopedProjection(
      [row({ id: "wait", sessionKey: "/b", status: "waitingForUser", observedAt: ago(1) })],
      { now: NOW, label: "infra" },
    );
    const html = renderToStaticMarkup(<ProjectLiveSection projection={projection} now={NOW} />);
    expect(html).toContain("ctx-live-dot");
    expect(html).not.toContain("기준");
  });
});

describe("현재 상황 aside for unconfirmed observations", () => {
  it("says unconfirmed work was seen even when no member was observed", () => {
    const html = renderToStaticMarkup(<ProjectLiveSection projection={null} unconfirmedObserved={2} />);
    expect(html).toContain("확정하지 않은 세션 2개의 관찰은 넣지 않았습니다");
    expect(html).not.toContain("ctx-live-count");
  });

  it("renders nothing when there is nothing observed at all", () => {
    expect(renderToStaticMarkup(<ProjectLiveSection projection={null} />)).toBe("");
  });
});

describe("sessions that went on after Mori looked", () => {
  it("lists them apart, by session title, with what was last observed", () => {
    const projection = buildScopedProjection(
      [row({ id: "b", sessionKey: "/a", status: "blocked", endedAt: ago(125), observedAt: ago(120) })],
      { now: NOW, label: "infra", sourceActiveAt: () => ago(1) },
    );
    const html = renderToStaticMarkup(
      <ProjectLiveSection projection={projection} now={NOW} sessionTitleOf={() => "PCF 저장소 작업"} />,
    );
    expect(html).toContain("관측 이후 계속된 세션 1");
    expect(html).toContain("PCF 저장소 작업");
    expect(html).toContain("관측 당시 막힘");
    expect(html).not.toContain("ctx-live-count is-blocked");
  });
});
