import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  browserNavigationCommittedToTraceEvent,
  browserObservationToTraceEvent,
  browserTabActivatedToTraceEvent,
} from "./browserTrace";
import { browserResourceFromUrl, buildBrowserContextSnapshot } from "./browserContext";
import {
  browserObservationEnvelopeToContextSnapshot,
  browserObservationEnvelopeToTraceEvent,
  type BrowserContextSnapshotEnvelopeV1,
  type BrowserHistoryStateUpdatedEnvelopeV1,
  type BrowserNavigationCommittedEnvelopeV1,
  type BrowserObservationEnvelopeV1,
  type BrowserTabActivatedEnvelopeV1,
} from "./browserObservationEnvelope";

const runtime = {
  id: "chrome-stable",
  provider: "chrome" as const,
  label: "Chrome",
  observedAt: "2026-09-09T00:00:00.000Z",
};

describe("browser context source-local model", () => {
  it("represents windows, tabs, and current resources separately", () => {
    const snapshot = buildBrowserContextSnapshot({
      observedAt: "2026-09-09T00:00:00.000Z",
      runtime,
      windows: [{ runtimeWindowId: 3, focused: true }],
      tabs: [
        {
          runtimeTabId: 21,
          windowId: 3,
          active: true,
          title: "Mori",
          url: "https://github.com/example/mori?token=secret#section",
        },
      ],
    });

    expect(snapshot.windows).toHaveLength(1);
    expect(snapshot.tabs).toHaveLength(1);
    expect(snapshot.resources).toHaveLength(1);
    expect(snapshot.windows[0]?.id).not.toBe(snapshot.tabs[0]?.id);
    expect(snapshot.tabs[0]?.currentResourceId).toBe(snapshot.resources[0]?.id);
    expect(snapshot.resources[0]?.url).toBe("https://github.com/example/mori");
    expect(snapshot.resources[0]?.privacy).toMatchObject({
      queryCaptured: false,
      fragmentCaptured: false,
      contentCaptured: false,
      credentialsCaptured: false,
    });
  });

  it("allows one resource to be opened by multiple runtime tabs", () => {
    const snapshot = buildBrowserContextSnapshot({
      observedAt: "2026-09-09T00:00:00.000Z",
      runtime,
      windows: [{ runtimeWindowId: 3, focused: true }],
      tabs: [
        { runtimeTabId: 21, windowId: 3, active: true, url: "https://example.com/docs" },
        { runtimeTabId: 22, windowId: 3, active: false, url: "https://example.com/docs" },
      ],
    });

    expect(snapshot.tabs.map((tab) => tab.id)).toEqual(["browser-tab-21", "browser-tab-22"]);
    expect(snapshot.resources).toHaveLength(1);
    expect(snapshot.tabs[0]?.currentResourceId).toBe(snapshot.tabs[1]?.currentResourceId);
  });
});

describe("browser trace projection", () => {
  it("projects tab activation into TraceEvent metadata without changing the Trace core shape", () => {
    const resource = browserResourceFromUrl({
      url: "https://github.com/example/mori",
      title: "Mori",
    });
    const event = browserTabActivatedToTraceEvent({
      occurredAt: "2026-09-09T00:01:00.000Z",
      runtime,
      window: {
        id: "browser-window-3",
        runtimeWindowId: "3",
        focused: true,
      },
      tab: {
        id: "browser-tab-21",
        runtimeTabId: "21",
        windowId: "browser-window-3",
        active: true,
        currentResourceId: resource.id,
        title: "Mori",
      },
      resource,
    });

    expect(event.source.kind).toBe("browser");
    expect(event.kind).toBe("browser.tab_activated");
    expect(event.metadata.tab.runtimeTabId).toBe("21");
    expect(event.metadata.resource?.url).toBe("https://github.com/example/mori");
    expect(event).not.toHaveProperty("url");
    expect(event).not.toHaveProperty("tabId");
    expect(event).not.toHaveProperty("windowId");
    expect(event).not.toHaveProperty("profileId");
    expect(event).not.toHaveProperty("accountId");
  });

  it("projects navigation as an observable event, not a semantic flow", () => {
    const event = browserNavigationCommittedToTraceEvent({
      occurredAt: "2026-09-09T00:02:00.000Z",
      runtime,
      tab: {
        id: "browser-tab-21",
        runtimeTabId: "21",
        windowId: "browser-window-3",
        active: true,
      },
      url: "https://docs.oracle.com/en-us/iaas/?session=abc#top",
      title: "OCI docs",
    });

    expect(event.kind).toBe("browser.navigation_committed");
    expect(event.metadata.resource?.url).toBe("https://docs.oracle.com/en-us/iaas/");
    expect(JSON.stringify(event)).not.toContain("research_started");
    expect(JSON.stringify(event)).not.toContain("working_on_project");
  });

  it("keeps the union projector source-local", () => {
    const event = browserObservationToTraceEvent({
      kind: "navigation_committed",
      occurredAt: "2026-09-09T00:02:00.000Z",
      runtime,
      tab: {
        id: "browser-tab-21",
        runtimeTabId: "21",
        windowId: "browser-window-3",
        active: true,
      },
      url: "https://example.com/path",
    });

    expect(event.source.provider).toBe("chrome");
    expect(event.metadata.privacy.contentCaptured).toBe(false);
  });
});

describe("browser observation v1 envelope adapter", () => {
  it("turns context snapshot envelopes into Browser Context", () => {
    const snapshot = browserObservationEnvelopeToContextSnapshot(
      fixture<BrowserContextSnapshotEnvelopeV1>("context-snapshot.v1.json"),
    );

    expect(snapshot.runtime.provider).toBe("chrome");
    expect(snapshot.windows[0]?.tabIds).toEqual(["browser-tab-21"]);
    expect(snapshot.tabs[0]?.currentResourceId).toBe(snapshot.resources[0]?.id);
    expect(snapshot.resources[0]?.url).toBe("https://github.com/swarea/mori");
  });

  it("turns tab activation envelopes into Browser Trace", () => {
    const event = browserObservationEnvelopeToTraceEvent(
      fixture<BrowserTabActivatedEnvelopeV1>("tab-activated.v1.json"),
    );

    expect(event.kind).toBe("browser.tab_activated");
    expect(event.metadata.tab.id).toBe("browser-tab-21");
    expect(event.metadata.window?.id).toBe("browser-window-3");
    expect(event.metadata.resource?.url).toBe("https://example.com/a");
  });

  it("turns navigation committed envelopes into Browser Trace", () => {
    const event = browserObservationEnvelopeToTraceEvent(
      fixture<BrowserNavigationCommittedEnvelopeV1>("navigation-committed.v1.json"),
    );

    expect(event.kind).toBe("browser.navigation_committed");
    expect(event.occurredAt).toBe("2026-09-09T00:02:00.000Z");
    expect(event.metadata.resource?.url).toBe("https://docs.oracle.com/en-us/iaas/");
    expect(event.metadata.privacy.queryCaptured).toBe(false);
  });

  it("turns history state envelopes into distinct observable Browser Trace", () => {
    const event = browserObservationEnvelopeToTraceEvent(
      fixture<BrowserHistoryStateUpdatedEnvelopeV1>("history-state-updated.v1.json"),
    );

    expect(event.kind).toBe("browser.history_state_updated");
    expect(event.title).toBe("History state updated");
    expect(event.summary).toBe(
      "Browser tab history state changed to https://example.com/app/route-two",
    );
    expect(event.metadata.resource?.url).toBe("https://example.com/app/route-two");
  });

  it("does not use TraceEvent as the cross-repository wire shape", () => {
    const envelope = fixture<BrowserObservationEnvelopeV1>("tab-activated.v1.json");

    expect(envelope).toMatchObject({
      version: 1,
      source: "browser",
      kind: "tab_activated",
      payload: expect.any(Object),
    });
    expect(envelope).not.toHaveProperty("metadata");
    expect(envelope).not.toHaveProperty("confidence");
  });
});

function fixture<T extends BrowserObservationEnvelopeV1>(fileName: string): T {
  return JSON.parse(
    readFileSync(
      join(process.cwd(), "src", "lib", "trace", "sources", "browser", "fixtures", fileName),
      "utf8",
    ),
  ) as T;
}
