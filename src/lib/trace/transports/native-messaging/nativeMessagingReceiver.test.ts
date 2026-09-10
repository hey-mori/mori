import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildBrowserNativeHostManifest,
  decodeNativeMessagingFrames,
  encodeNativeMessagingFrame,
  encodeNativeMessagingTextFrame,
  extensionIdToNativeMessagingOrigin,
  isValidNativeMessagingHostName,
  MORI_BROWSER_NATIVE_HOST_NAME,
  receiveBrowserNativeMessagingInput,
} from ".";

describe("Native Messaging framing", () => {
  it("round-trips a JSON message with the native length prefix", () => {
    const frame = encodeNativeMessagingFrame({ ok: true, text: "hello" });
    const decoded = decodeNativeMessagingFrames(frame);

    expect(decoded.status).toBe("accepted");
    if (decoded.status !== "accepted") return;
    expect(JSON.parse(decoded.messages[0] ?? "{}")).toEqual({ ok: true, text: "hello" });
  });

  it("rejects truncated payloads before JSON parsing", () => {
    const frame = encodeNativeMessagingFrame({ ok: true });
    const result = decodeNativeMessagingFrames(frame.subarray(0, frame.byteLength - 1));

    expect(result).toMatchObject({
      status: "rejected",
      error: { code: "truncated_payload" },
    });
  });

  it("rejects oversized input before Browser ingress", () => {
    const frame = encodeNativeMessagingFrame({ ok: true });
    const result = decodeNativeMessagingFrames(frame, { maxMessageBytes: 2 });

    expect(result).toMatchObject({
      status: "rejected",
      error: { code: "oversized_message" },
    });
  });
});

describe("Browser Native Messaging receiver", () => {
  it("routes a framed tab activation through the existing Browser ingress", () => {
    const frame = frameFixture("tab-activated.v1.json");
    const result = receiveBrowserNativeMessagingInput(frame);

    expect(result.acknowledgements).toEqual([
      { ok: true, kind: "tab_activated", route: "trace" },
    ]);
    expect(readAcks(result.output)).toEqual(result.acknowledgements);
  });

  it("routes a framed context snapshot through the existing Browser ingress", () => {
    const frame = frameFixture("context-snapshot.v1.json");
    const result = receiveBrowserNativeMessagingInput(frame);

    expect(result.acknowledgements).toEqual([
      { ok: true, kind: "context_snapshot", route: "context" },
    ]);
  });

  it("separates malformed transport JSON from unsupported Browser envelopes", () => {
    const malformed = receiveBrowserNativeMessagingInput(encodeNativeMessagingTextFrame("{ nope"));
    expect(malformed.acknowledgements[0]).toMatchObject({
      ok: false,
      code: "invalid_json",
    });

    const unsupported = receiveBrowserNativeMessagingInput(
      encodeNativeMessagingFrame({
        ...fixture("navigation-committed.v1.json"),
        version: 2,
      }),
    );
    expect(unsupported.acknowledgements[0]).toMatchObject({
      ok: false,
      code: "unsupported_envelope",
      ingressErrors: [expect.objectContaining({ code: "unsupported_version" })],
    });
  });

  it("keeps Browser ingress independent from Native Messaging transport", () => {
    const ingress = readFileSync(
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

    expect(ingress).not.toContain("native-messaging");
    expect(ingress).not.toContain("NativeMessaging");
    expect(ingress).not.toContain("decodeNativeMessagingFrames");
  });

  it("keeps the receiver out of Core, Memory, Flow, and persistence layers", () => {
    const receiverText = readFileSync(
      join(
        process.cwd(),
        "src",
        "lib",
        "trace",
        "transports",
        "native-messaging",
        "nativeMessagingReceiver.ts",
      ),
      "utf8",
    );
    const imports = importSpecifiers(receiverText);

    expect(imports).toContain("../../sources/browser");
    expect(imports.some((specifier) => /record-kernel|project-memory|memory-api/.test(specifier))).toBe(
      false,
    );
    expect(imports.some((specifier) => /storage|session|import|timeline-lab/.test(specifier))).toBe(
      false,
    );
  });
});

describe("Browser Native Messaging host manifest", () => {
  it("builds the Mori host manifest with explicit allowed extension origins", () => {
    const manifest = buildBrowserNativeHostManifest({
      hostPath: "C:\\Program Files\\Mori\\mori-browser-native-host.exe",
      extensionIds: ["aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"],
    });

    expect(isValidNativeMessagingHostName(MORI_BROWSER_NATIVE_HOST_NAME)).toBe(true);
    expect(manifest).toEqual({
      name: "com.swarea.mori.browser",
      description: "Mori Browser observation receiver",
      path: "C:\\Program Files\\Mori\\mori-browser-native-host.exe",
      type: "stdio",
      allowed_origins: ["chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/"],
    });
  });

  it("rejects wildcard or malformed extension origins", () => {
    expect(() => extensionIdToNativeMessagingOrigin("*")).toThrow(/32-character/);
    expect(() =>
      buildBrowserNativeHostManifest({
        hostPath: "C:\\Mori\\host.exe",
        allowedOrigins: ["chrome-extension://*/"],
      }),
    ).toThrow(/allowed origin/);
  });
});

function frameFixture(fileName: string): Uint8Array {
  return encodeNativeMessagingFrame(JSON.parse(readFileSync(fixturePath(fileName), "utf8")));
}

function fixture(fileName: string): Record<string, unknown> {
  return JSON.parse(readFileSync(fixturePath(fileName), "utf8")) as Record<string, unknown>;
}

function fixturePath(fileName: string): string {
  return join(process.cwd(), "src", "lib", "trace", "sources", "browser", "fixtures", fileName);
}

function readAcks(output: Uint8Array): unknown[] {
  const decoded = decodeNativeMessagingFrames(output);
  if (decoded.status !== "accepted") return [];
  return decoded.messages.map((message) => JSON.parse(message) as unknown);
}

function importSpecifiers(text: string): string[] {
  const refs: string[] = [];
  const pattern = /\b(?:import|export)\s+(?:type\s+)?[\s\S]*?\sfrom\s+["']([^"']+)["']/g;
  for (const match of text.matchAll(pattern)) {
    refs.push(match[1] ?? "");
  }
  return refs;
}
