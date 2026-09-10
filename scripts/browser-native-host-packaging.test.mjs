import { describe, expect, it } from "vitest";
import {
  MORI_BROWSER_NATIVE_HOST_NAME,
  extensionIdToOrigin,
  normalizeOrigin,
  renderNsisHooks,
  renderTauriConfig,
  resolveAllowedOriginsFromEnv,
} from "./lib/browser-native-host-packaging.mjs";

describe("browser native host packaging", () => {
  it("derives unique allowed origins from explicit build input", () => {
    expect(
      resolveAllowedOriginsFromEnv({
        MORI_BROWSER_CHROME_EXTENSION_ID: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
        MORI_BROWSER_ALLOWED_ORIGINS: "chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/",
      }),
    ).toEqual(["chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/"]);
  });

  it("rejects missing or wildcard extension origins", () => {
    expect(() => resolveAllowedOriginsFromEnv({})).toThrow(/MORI_BROWSER_CHROME_EXTENSION_ID/);
    expect(() => extensionIdToOrigin("*")).toThrow(/32-character/);
    expect(() => normalizeOrigin("chrome-extension://*/")).toThrow(/Native Messaging/);
  });

  it("renders an installer hook for Chrome current-user registration", () => {
    const hooks = renderNsisHooks(["chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/"]);

    expect(hooks).toContain(MORI_BROWSER_NATIVE_HOST_NAME);
    expect(hooks).toContain("mori-browser-native-host.exe");
    expect(hooks).toContain("Software\\Google\\Chrome\\NativeMessagingHosts");
    expect(hooks).toContain("chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/");
    expect(hooks).not.toContain("C:\\dev");
    expect(hooks).not.toContain("target\\debug");
  });

  it("renders a Tauri config override that points at generated hooks", () => {
    expect(renderTauriConfig("C:\\tmp\\browser-native-host.nsh")).toEqual({
      bundle: {
        windows: {
          nsis: {
            installMode: "currentUser",
            installerHooks: "C:\\tmp\\browser-native-host.nsh",
          },
        },
      },
    });
  });
});
