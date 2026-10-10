import { describe, expect, it } from "vitest";
import type { MoriRecord } from "../../lib/record-kernel/kernelTypes";
import {
  buildNoteExtractionPanel,
  deriveNoteTitle,
  extractFromNote,
  extractionIdentity,
} from "./noteWorkspace";

const now = new Date("2026-07-16T09:00:00.000Z");

function confirmed(schemaId: string, title: string): MoriRecord {
  return {
    id: `rec-${title}`,
    schemaId,
    title,
    body: title,
    capturedAt: now.toISOString(),
    timeBasis: "unknown",
    status: "active",
    origin: "user",
    ownership: "db",
    contextIds: [],
    properties: {},
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
}

describe("deriveNoteTitle", () => {
  it("names a note from a quoted heading, and keeps a heading that starts with a quote", () => {
    expect(deriveNoteTitle("> ## 결정\n> 본문")).toBe("결정");
    expect(deriveNoteTitle(">> 중첩 인용")).toBe("중첩 인용");
    expect(deriveNoteTitle("# > 인용 제목")).toBe("인용 제목");
  });

  it("uses the first non-empty line", () => {
    expect(deriveNoteTitle("\n\n점심 먹고 러닝\n다음 줄")).toBe("점심 먹고 러닝");
  });
  it("is empty for a blank body and clips long first lines", () => {
    expect(deriveNoteTitle("   \n  ")).toBe("");
    expect(deriveNoteTitle("가".repeat(120)).endsWith("…")).toBe(true);
  });
  it("strips markdown syntax from the title", () => {
    expect(deriveNoteTitle("# **주간 회고** 노트\n본문")).toBe("주간 회고 노트");
  });
  it("unwraps a [[wiki-link]] to its title text", () => {
    expect(deriveNoteTitle("[[할 일 목록]] 참고\n본문")).toBe("할 일 목록 참고");
  });
});

describe("stripInlineMarkdown in extraction", () => {
  it("keeps markdown tokens out of extracted record titles", () => {
    const items = extractFromNote("**다음 주**에 리팩터링을 해야 한다.", now);
    const task = items.find((i) => i.schemaId === "task");
    expect(task?.title.includes("*")).toBe(false);
    expect(task?.title).toContain("다음 주에 리팩터링");
  });
});

describe("extractFromNote", () => {
  it("pulls typed records out of a note and drops the plain-note fallback", () => {
    const items = extractFromNote(
      "점심 먹고 러닝 30분 했다. 다음 주 스프린트 회고를 준비해야 한다.",
      now,
    );
    const schemas = items.map((i) => i.schemaId);
    expect(schemas).toContain("workout");
    expect(schemas).toContain("task");
    expect(schemas).not.toContain("note");
  });

  it("extracts nothing from short or pure-prose bodies", () => {
    expect(extractFromNote("", now)).toEqual([]);
    expect(extractFromNote("오늘은 날씨가 좋았다.", now)).toEqual([]);
  });

  it("gives duplicate extractions distinct keys", () => {
    const items = extractFromNote("러닝 30분 했다. 러닝 30분 했다.", now);
    const keys = items.map((i) => i.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("buildNoteExtractionPanel", () => {
  it("lists confirmed records and drops previews already confirmed", () => {
    const body = "점심 먹고 러닝 30분 했다. 다음 주 회고를 준비해야 한다.";
    const first = extractFromNote(body, now);
    const workout = first.find((i) => i.schemaId === "workout");
    expect(workout).toBeTruthy();
    const panel = buildNoteExtractionPanel(
      body,
      [confirmed("workout", workout!.title)],
      now,
    );
    expect(panel.confirmed).toHaveLength(1);
    expect(
      panel.pending.some(
        (p) => extractionIdentity(p.title) === extractionIdentity(workout!.title),
      ),
    ).toBe(false);
    // the task is still pending
    expect(panel.pending.some((p) => p.schemaId === "task")).toBe(true);
  });

  it("consumes only ONE preview per confirmed record when titles collide (multiset)", () => {
    const body = "스쿼트 했다. 영어 공부했다. 스쿼트 했다.";
    const previews = extractFromNote(body, now);
    const squats = previews.filter((p) => p.schemaId === "workout");
    expect(squats.length).toBe(2);
    // Confirm exactly one of the two identical squat extractions.
    const panel = buildNoteExtractionPanel(body, [confirmed("workout", squats[0].title)], now);
    const pendingSquats = panel.pending.filter((p) => p.schemaId === "workout");
    expect(pendingSquats.length).toBe(1); // the second stays confirmable
  });
});
