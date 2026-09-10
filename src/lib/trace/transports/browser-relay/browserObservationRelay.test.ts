import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { acknowledgeBrowserObservationRelayRequest } from "./browserObservationRelay";

describe("Browser observation relay ack bridge", () => {
  it("routes relay observations through the existing Browser ingress", () => {
    const ack = acknowledgeBrowserObservationRelayRequest({
      requestId: "relay-1",
      observation: fixture("tab-activated.v1.json"),
    });

    expect(ack).toEqual({
      requestId: "relay-1",
      acknowledgement: {
        ok: true,
        kind: "tab_activated",
        route: "trace",
      },
    });
  });

  it("returns ingress rejections without throwing", () => {
    const ack = acknowledgeBrowserObservationRelayRequest({
      requestId: "relay-2",
      observation: { ...observationFixture("tab-activated.v1.json"), version: 2 },
    });

    expect(ack).toMatchObject({
      requestId: "relay-2",
      acknowledgement: {
        ok: false,
        code: "unsupported_envelope",
        errors: [expect.objectContaining({ code: "unsupported_version" })],
      },
    });
  });
});

function fixture(fileName: string): unknown {
  return JSON.parse(
    readFileSync(
      join(process.cwd(), "src", "lib", "trace", "sources", "browser", "fixtures", fileName),
      "utf8",
    ),
  );
}

function observationFixture(fileName: string): Record<string, unknown> {
  return fixture(fileName) as Record<string, unknown>;
}
