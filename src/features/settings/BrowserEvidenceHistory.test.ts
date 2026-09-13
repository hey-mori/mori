import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BrowserActivityRow, BrowserHistoryControls } from "./BrowserEvidenceHistory";
import {
  createBrowserEvidenceHistory,
  type BrowserEvidenceHistoryItem,
} from "../../lib/browser/browserEvidenceHistory";

const item: BrowserEvidenceHistoryItem = {
  key: "private-key",
  kind: "navigation_committed",
  observedAt: "2026-09-12T01:02:03.004Z",
  receivedAt: "2026-09-12T01:02:05.006Z",
  provider: "chrome",
  url: "https://example.com/docs",
  runtimeId: null,
  tabId: "1",
  windowId: "2",
  transitionType: "link",
  transitionQualifiers: [],
};
describe("Browser activity presentation", () => {
  it("renders navigation with observed time primary and receipt only in details", () => {
    const html = renderToStaticMarkup(createElement(BrowserActivityRow, { item }));
    const summary = html.slice(0, html.indexOf("</summary>"));
    expect(summary).toContain("페이지 이동");
    expect(summary).toContain(item.observedAt);
    expect(summary).not.toContain(item.receivedAt);
    expect(html).toContain("Mori 수신 시각");
    expect(html).toContain(item.receivedAt);
    expect(html).not.toContain(item.key);
    expect(html).not.toMatch(/<img|<a |deliveryId|SQLite/);
  });
  it("renders activation with or without a URL using action text, not color", () => {
    for (const url of [item.url, null]) {
      const html = renderToStaticMarkup(
        createElement(BrowserActivityRow, { item: { ...item, kind: "tab_activated", url } }),
      );
      expect(html).toContain("탭 전환");
      expect(html).toContain(url ?? "탭 활성화");
      expect(html).toContain("<summary>");
    }
  });
  it("distinguishes loading, empty, older, end, failure and retry states", () => {
    const initial = createBrowserEvidenceHistory({
      page: async () => ({ items: [], nextCursor: null }),
    }).getState();
    const cases = [
      [{ loading: "first" }, "활동을 불러오는 중..."],
      [{ loading: "older", loaded: true, items: [item] }, "이전 활동을 불러오는 중..."],
      [{ loaded: true }, "저장된 브라우저 활동이 없습니다"],
      [
        {
          loaded: true,
          items: [item],
          nextCursor: { snapshotSequence: 2, sequence: 1, observedAt: item.observedAt },
        },
        "이전 활동 더 보기",
      ],
      [{ loaded: true, items: [item] }, "마지막 활동까지 확인했습니다"],
      [{ error: "first" }, "다시 시도"],
      [{ error: "older", loaded: true, items: [item] }, "다시 시도"],
    ] as const;
    for (const [patch, label] of cases) {
      const html = renderToStaticMarkup(
        createElement(BrowserHistoryControls, {
          state: { ...initial, ...patch, items: "items" in patch ? [...patch.items] : [] },
          onOlder() {},
          onRetry() {},
        }),
      );
      expect(html).toContain(label);
      if ("error" in patch) {
        expect(html).toContain('role="alert"');
        expect(html).not.toContain("저장된 브라우저 활동이 없습니다");
      }
    }
  });
});
