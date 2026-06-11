import { describe, expect, it } from "vitest";
import type { Decision, TimelineEvent } from "../../domain/types";
import { buildClientWorkLog } from "./clientWorkLog";

const at = (hour: number, minute: number) =>
  `2026-06-01T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00Z`;

function ev(
  id: string,
  hour: number,
  minute: number,
  title: string,
  opts: { actor?: string; openedByUser?: boolean } = {},
): TimelineEvent {
  return {
    id,
    start: at(hour, minute),
    title,
    actor: opts.actor ?? "assistant",
    openedByUser: opts.openedByUser ?? false,
  } as unknown as TimelineEvent;
}

function dec(title: string, sourceEventIds: string[]): Decision {
  return { title, sourceEventIds } as unknown as Decision;
}

describe("buildClientWorkLog", () => {
  it("turns a multi-sitting session into dated work-log entries and reads scope growth", () => {
    const events = [
      ev("e1", 1, 0, "벡터스토어 확인해줘", { actor: "user", openedByUser: true }),
      ev("e2", 1, 2, "확인"),
      ev("e3", 1, 5, "결정"),
      ev("e4", 1, 7, "더 진행"),
      // 40-minute break opens a second sitting
      ev("e5", 1, 47, "이제 삭제 기능 만들자", { actor: "user", openedByUser: true }),
      ev("e6", 1, 50, "구현"),
      ev("e7", 1, 52, "완료"),
      ev("e8", 1, 54, "커밋"),
    ];
    const log = buildClientWorkLog({
      events,
      decisions: [dec("임베딩 어댑터 도입", ["e2"])],
    });
    expect(log.entries).toHaveLength(2);
    expect(log.scope.opening).toBe("벡터스토어 확인해줘");
    expect(log.scope.additions).toEqual(["이제 삭제 기능 만들자"]);
    expect(log.entries[0].dateLabel).toBe("6월 1일");
    expect(log.entries[0].spanLabel).toBe("01:00 – 01:07");
    expect(log.entries[0].durationLabel).toBe("7분");
    // the decision in the window leads the entry summary
    expect(log.entries[0].summary).toBe("임베딩 어댑터 도입");
    expect(log.totalDurationLabel).toBe("약 14분");
  });

  it("makes one entry for a single continuous sitting, with no scope additions", () => {
    const events = [
      ev("e1", 1, 0, "관리 페이지 만들자", { actor: "user", openedByUser: true }),
      ev("e2", 1, 2, "진행"),
      ev("e3", 1, 5, "더"),
      ev("e4", 1, 8, "끝"),
    ];
    const log = buildClientWorkLog({ events, decisions: [] });
    expect(log.entries).toHaveLength(1);
    expect(log.scope.opening).toBe("관리 페이지 만들자");
    expect(log.scope.additions).toEqual([]);
    expect(log.entries[0].durationLabel).toBe("8분");
  });

  it("stays empty and honest when there is nothing dated to log", () => {
    const log = buildClientWorkLog({ events: [], decisions: [] });
    expect(log.entries).toEqual([]);
    expect(log.scope.opening).toBe("세션 작업");
    expect(log.totalDurationLabel).toBeNull();
  });
});
