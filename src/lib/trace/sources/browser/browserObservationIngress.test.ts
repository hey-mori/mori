import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ingestBrowserObservation,
  ingestBrowserObservationJson,
  validateBrowserObservationEnvelope,
} from "./browserObservationIngress";
import type {
  BrowserHistoryStateUpdatedEnvelopeV1,
  BrowserObservationEnvelopeV1,
} from "./browserObservationEnvelope";

describe("browser observation ingress", () => {
  it("accepts a valid context_snapshot and routes it to Browser Context", () => {
    const result = ingestBrowserObservation(fixture("context-snapshot.v1.json"));

    expect(result.status).toBe("accepted");
    if (result.status !== "accepted") return;
    expect(result.route).toBe("context");
    expect(result.kind).toBe("context_snapshot");
    if (result.route !== "context") return;
    expect(result.context.resources[0]?.url).toBe("https://github.com/swarea/mori");
    expect(result.context.windows[0]?.tabIds).toEqual(["browser-tab-21"]);
  });

  it("accepts a valid tab_activated and routes it to Browser Trace", () => {
    const result = ingestBrowserObservation(fixture("tab-activated.v1.json"));

    expect(result.status).toBe("accepted");
    if (result.status !== "accepted") return;
    expect(result.route).toBe("trace");
    expect(result.kind).toBe("tab_activated");
    if (result.route !== "trace") return;
    expect(result.traceEvent.kind).toBe("browser.tab_activated");
    expect(result.traceEvent.metadata.resource?.url).toBe("https://example.com/a");
  });

  it("accepts a valid navigation_committed and routes it to Browser Trace", () => {
    const result = ingestBrowserObservation(fixture("navigation-committed.v1.json"));

    expect(result.status).toBe("accepted");
    if (result.status !== "accepted") return;
    expect(result.route).toBe("trace");
    expect(result.kind).toBe("navigation_committed");
    if (result.route !== "trace") return;
    expect(result.traceEvent.kind).toBe("browser.navigation_committed");
    expect(result.traceEvent.metadata.resource?.url).toBe("https://docs.oracle.com/en-us/iaas/");
  });

  it("accepts history_state_updated in v1 and keeps it distinct from a document commit", () => {
    const result = ingestBrowserObservation(fixture("history-state-updated.v1.json"));

    expect(result.status).toBe("accepted");
    if (result.status !== "accepted") return;
    expect(result.route).toBe("trace");
    expect(result.kind).toBe("history_state_updated");
    if (result.route !== "trace") return;
    expect(result.traceEvent.kind).toBe("browser.history_state_updated");
    expect(result.traceEvent.metadata.resource?.url).toBe("https://example.com/app/route-two");
  });

  it("parses explicit local JSON text before ingress", () => {
    const text = readFileSync(fixturePath("tab-activated.v1.json"), "utf8");
    const result = ingestBrowserObservationJson(text);

    expect(result.status).toBe("accepted");
    if (result.status !== "accepted") return;
    expect(result.route).toBe("trace");
  });

  it("rejects malformed JSON without throwing", () => {
    const result = ingestBrowserObservationJson("{ nope");

    expect(result).toMatchObject({
      status: "rejected",
      errors: [{ code: "invalid_json", field: null }],
    });
  });

  it("rejects unsupported versions", () => {
    const result = validateBrowserObservationEnvelope({
      ...fixture("tab-activated.v1.json"),
      version: 2,
    });

    expect(result).toMatchObject({
      status: "rejected",
      errors: expect.arrayContaining([expect.objectContaining({ code: "unsupported_version" })]),
    });
  });

  it("rejects wrong source", () => {
    const result = validateBrowserObservationEnvelope({
      ...fixture("tab-activated.v1.json"),
      source: "desktop",
    });

    expect(result).toMatchObject({
      status: "rejected",
      errors: expect.arrayContaining([expect.objectContaining({ code: "wrong_source" })]),
    });
  });

  it("rejects unknown kind", () => {
    const result = validateBrowserObservationEnvelope({
      ...fixture("tab-activated.v1.json"),
      kind: "tab_closed",
    });

    expect(result).toMatchObject({
      status: "rejected",
      errors: expect.arrayContaining([expect.objectContaining({ code: "unknown_kind" })]),
    });
  });

  it("rejects missing timestamp", () => {
    const { observedAt: _observedAt, ...withoutTimestamp } = fixture("tab-activated.v1.json");
    const result = validateBrowserObservationEnvelope(withoutTimestamp);

    expect(result).toMatchObject({
      status: "rejected",
      errors: expect.arrayContaining([expect.objectContaining({ field: "observedAt" })]),
    });
  });

  it("rejects invalid timestamp", () => {
    const result = validateBrowserObservationEnvelope({
      ...fixture("tab-activated.v1.json"),
      observedAt: "not-a-date",
    });

    expect(result).toMatchObject({
      status: "rejected",
      errors: expect.arrayContaining([expect.objectContaining({ code: "invalid_timestamp" })]),
    });
  });

  it("rejects missing required payload", () => {
    const { payload: _payload, ...withoutPayload } = fixture("tab-activated.v1.json");
    const result = validateBrowserObservationEnvelope(withoutPayload);

    expect(result).toMatchObject({
      status: "rejected",
      errors: expect.arrayContaining([expect.objectContaining({ field: "payload" })]),
    });
  });

  it("rejects missing kind-specific payload fields", () => {
    const result = validateBrowserObservationEnvelope({
      ...fixture("navigation-committed.v1.json"),
      payload: {
        runtime: { provider: "chrome" },
      },
    });

    expect(result).toMatchObject({
      status: "rejected",
      errors: expect.arrayContaining([expect.objectContaining({ field: "payload.details" })]),
    });
  });

  it("rejects malformed URL fields", () => {
    const result = validateBrowserObservationEnvelope({
      ...fixture("navigation-committed.v1.json"),
      payload: {
        ...fixture("navigation-committed.v1.json").payload,
        details: {
          tabId: 21,
          url: "not a url",
        },
      },
    });

    expect(result).toMatchObject({
      status: "rejected",
      errors: expect.arrayContaining([expect.objectContaining({ code: "invalid_url" })]),
    });
  });

  it("rejects URLs that still carry credentials, query, or fragment", () => {
    const result = validateBrowserObservationEnvelope({
      ...fixture("navigation-committed.v1.json"),
      payload: {
        ...fixture("navigation-committed.v1.json").payload,
        details: {
          tabId: 21,
          url: "https://user:pass@example.com/a?token=123#secret",
        },
      },
    });

    expect(result).toMatchObject({
      status: "rejected",
      errors: expect.arrayContaining([expect.objectContaining({ code: "unsanitized_url" })]),
    });
  });

  it.each([
    "https://example.com/app?token=private",
    "https://example.com/app#private",
  ])("rejects unsanitized history-state URL: %s", (url) => {
    const observation = fixture<BrowserHistoryStateUpdatedEnvelopeV1>(
      "history-state-updated.v1.json",
    );
    const result = validateBrowserObservationEnvelope({
      ...observation,
      payload: {
        ...observation.payload,
        details: { ...observation.payload.details, url },
      },
    });

    expect(result).toMatchObject({
      status: "rejected",
      errors: expect.arrayContaining([expect.objectContaining({ code: "unsanitized_url" })]),
    });
  });

  it("does not import the browser extension repository code", () => {
    const text = readFileSync(
      join(
        process.cwd(),
        "src",
        "lib",
        "trace",
        "sources",
        "browser",
        "browserObservationIngress.ts",
      ),
      "utf8",
    );

    expect(text).not.toContain("mori-browser-extension");
    expect(text).not.toContain("chrome.");
    expect(text).not.toContain("WebSocket");
    expect(text).not.toContain("NativeMessaging");
  });
});

function fixture<T extends BrowserObservationEnvelopeV1 = BrowserObservationEnvelopeV1>(
  fileName: string,
): T {
  return JSON.parse(readFileSync(fixturePath(fileName), "utf8")) as T;
}

function fixturePath(fileName: string): string {
  return join(process.cwd(), "src", "lib", "trace", "sources", "browser", "fixtures", fileName);
}
