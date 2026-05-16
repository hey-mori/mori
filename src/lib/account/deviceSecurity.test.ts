import { describe, expect, it } from "vitest";
import { buildDeviceSecuritySummary } from "./deviceSecurity";

describe("buildDeviceSecuritySummary", () => {
  it("maps the browser runtime to localStorage", () => {
    const summary = buildDeviceSecuritySummary({ isDesktop: false });

    expect(summary.isDesktop).toBe(false);
    expect(summary.runtimeState).toBe("browserLocalStorage");
    expect(summary.runtime.label).toBe("브라우저 localStorage");
  });

  it("maps the desktop runtime to SQLite", () => {
    const summary = buildDeviceSecuritySummary({ isDesktop: true });

    expect(summary.isDesktop).toBe(true);
    expect(summary.runtimeState).toBe("desktopSQLite");
    expect(summary.runtime.label).toBe("데스크톱 SQLite");
  });

  it("never reports a remote session in either runtime", () => {
    expect(buildDeviceSecuritySummary({ isDesktop: false }).remoteSessionCount).toBe(
      0,
    );
    expect(buildDeviceSecuritySummary({ isDesktop: true }).remoteSessionCount).toBe(
      0,
    );
  });
});
