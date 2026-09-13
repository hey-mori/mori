import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, vi } from "vitest";
import { type BrowserObservationEnvelopeV1 } from "../trace/sources/browser";
import { acknowledgeBrowserObservationRelayRequest } from "../trace/transports/browser-relay/browserObservationRelay";
import { createBrowserLiveSource, contextFreshness } from "./browserLiveSource";
import type { BrowserEvidenceInput, BrowserEvidenceRepository } from "./browserEvidenceRepository";

const fixture = (name: string): BrowserObservationEnvelopeV1 =>
  JSON.parse(
    readFileSync(
      join(process.cwd(), "src/lib/trace/sources/browser/fixtures", `${name}.v1.json`),
      "utf8",
    ),
  );
function setup() {
  const rows: BrowserEvidenceInput[] = [];
  const repository: BrowserEvidenceRepository = {
    append: vi.fn(async (row) => {
      rows.push(row);
      return rows.length;
    }),
    recent: vi.fn(async (limit) =>
      rows.slice(-limit).map((row, i) => ({ ...row, sequence: i + 1 })),
    ),
  };
  const source = createBrowserLiveSource(repository, () => new Date("2026-09-12T00:00:00.000Z"));
  const deliver = (observation: unknown, requestId = "delivery-1") =>
    acknowledgeBrowserObservationRelayRequest({ requestId, observation }, source.accept);
  return { rows, source, repository, deliver };
}

describe("Browser application evidence boundary", () => {
  it("requests context recovery only after a trace has reached storage", async () => {
    const { deliver } = setup();
    expect((await deliver(fixture("tab-activated"))).acknowledgement).toMatchObject({
      ok: true,
      contextRequired: true,
    });
    expect((await deliver(fixture("context-snapshot"))).acknowledgement).not.toHaveProperty(
      "contextRequired",
    );
    expect((await deliver(fixture("navigation-committed"))).acknowledgement).not.toHaveProperty(
      "contextRequired",
    );
  });

  it("asks for a fresh snapshot when the last received context expires", async () => {
    let time = Date.parse("2026-09-12T00:00:00Z");
    const source = createBrowserLiveSource(setup().repository, () => new Date(time));
    const deliver = (observation: unknown) =>
      acknowledgeBrowserObservationRelayRequest({ requestId: "stale", observation }, source.accept);
    await deliver(fixture("context-snapshot"));
    time += 60_000;
    expect((await deliver(fixture("tab-activated"))).acknowledgement).toMatchObject({
      ok: true,
      contextRequired: true,
    });
  });

  it("keeps context in memory and does not append it to history", async () => {
    const { source, rows, deliver } = setup();
    expect((await deliver(fixture("context-snapshot"))).acknowledgement.ok).toBe(true);
    expect(source.latestContext().context?.tabs.length).toBeGreaterThan(0);
    expect(source.latestContext().freshness).toBe("recent");
    expect(rows).toEqual([]);
    expect(contextFreshness(source.getState(), Date.parse("2026-09-12T00:02:00Z"))).toBe("stale");
    expect(setup().source.latestContext()).toEqual({ context: null, freshness: "unknown" });
  });

  it("does not let a delayed older snapshot replace current state", async () => {
    const { source, deliver } = setup();
    const observation = fixture("context-snapshot");
    observation.observedAt = "2026-09-12T00:00:00Z";
    await deliver(observation);
    await deliver({ ...observation, observedAt: "2026-09-11T00:00:00Z" });
    expect(source.getState().context?.observedAt).toBe("2026-09-12T00:00:00.000Z");
  });

  it.each(["tab-activated", "navigation-committed"])(
    "persists %s and projects a source evidence read model",
    async (name) => {
      const { source, rows, deliver } = setup();
      expect((await deliver(fixture(name))).acknowledgement).toMatchObject({
        ok: true,
        route: "trace",
      });
      expect(rows).toHaveLength(1);
      expect(rows[0].deliveryId).toBe("delivery-1");
      expect((await source.recentEvidence())[0].traceEvent.source.kind).toBe("browser");
      expect(JSON.stringify(rows)).not.toMatch(/title|body|memory|episode|query|fragment/i);
    },
  );

  it("waits for the write and reports a private failure without claiming success", async () => {
    const { source, deliver, repository } = setup();
    let reject!: (error: Error) => void;
    repository.append = () =>
      new Promise((_, fail) => {
        reject = fail;
      });
    let settled = false;
    const result = deliver(fixture("navigation-committed")).then((ack) => {
      settled = true;
      return ack;
    });
    await Promise.resolve();
    expect(settled).toBe(false);
    expect(source.getState().lastReceivedAt).toBeNull();
    reject(new Error("secret URL and database location"));
    const ack = await result;
    expect(ack.acknowledgement).toMatchObject({ ok: false, code: "persistence_failed" });
    expect(JSON.stringify(ack)).not.toContain("secret");
    expect(source.getState().lastError).toBe("persistence_failed");
  });

  it("drops titles and unknown payloads before either sink", async () => {
    const { rows, source, deliver } = setup();
    const observation = fixture("navigation-committed");
    const raw = JSON.parse(JSON.stringify(observation));
    raw.payload.tab = {
      ...raw.payload.tab,
      title: "PRIVATE",
      cookies: "PRIVATE",
      formInput: "PRIVATE",
    };
    raw.payload.runtime.label = "PRIVATE";
    raw.payload.raw = "PRIVATE";
    await deliver(raw);
    expect(rows).toHaveLength(1);
    expect(JSON.stringify(rows)).not.toContain("PRIVATE");
    const snapshot = JSON.parse(JSON.stringify(fixture("context-snapshot")));
    snapshot.payload.windows[0].tabs[0].title = "PRIVATE";
    await deliver(snapshot);
    expect(JSON.stringify(source.latestContext())).not.toContain("PRIVATE");
  });

  it.each([
    "https://example.com/?token=x",
    "https://example.com/#x",
    "https://user:pass@example.com/",
    "file:///private",
    "chrome://settings",
  ])("refuses unsafe URLs: %s", async (url) => {
    const { rows, deliver } = setup();
    const observation = JSON.parse(JSON.stringify(fixture("navigation-committed")));
    observation.payload.details.url = url;
    expect((await deliver(observation)).acknowledgement.ok).toBe(false);
    expect(rows).toEqual([]);
  });

  it("refuses private windows and malformed optional values without throwing", async () => {
    const { rows, deliver } = setup();
    const observation = JSON.parse(JSON.stringify(fixture("navigation-committed")));
    observation.payload.window = { id: 1, incognito: true };
    expect((await deliver(observation)).acknowledgement.ok).toBe(false);
    observation.payload.window = { id: 1 };
    observation.payload.tab = { id: { private: "data" } };
    expect((await deliver(observation)).acknowledgement.ok).toBe(false);
    expect(rows).toEqual([]);
  });

  it("never imports application or persistence into Trace core", () => {
    for (const name of readdirSync(join(process.cwd(), "src/lib/trace/core"))) {
      const text = readFileSync(join(process.cwd(), "src/lib/trace/core", name), "utf8");
      expect(text).not.toMatch(/from ["'].*(?:browser|sqlite|app\/|storage|react|zustand)/);
    }
  });
});
