import { describe, expect, it } from "vitest";
import {
  pageShellHasAside,
  resolveNoticeRole,
  resolveNoticeToneClass,
  resolvePageShellMaxWidthClass,
} from "./pageShell";

describe("resolvePageShellMaxWidthClass", () => {
  it("maps each preset to its modifier class", () => {
    expect(resolvePageShellMaxWidthClass("default")).toBe("is-default");
    expect(resolvePageShellMaxWidthClass("wide")).toBe("is-wide");
    expect(resolvePageShellMaxWidthClass("full")).toBe("is-full");
  });

  it("defaults to the default preset when omitted", () => {
    expect(resolvePageShellMaxWidthClass()).toBe("is-default");
  });
});

describe("pageShellHasAside", () => {
  it("treats null / undefined / false as no aside", () => {
    expect(pageShellHasAside(null)).toBe(false);
    expect(pageShellHasAside(undefined)).toBe(false);
    expect(pageShellHasAside(false)).toBe(false);
  });

  it("treats any real node as having an aside", () => {
    expect(pageShellHasAside("rail")).toBe(true);
    expect(pageShellHasAside(0)).toBe(true);
    expect(pageShellHasAside({})).toBe(true);
  });
});

describe("resolveNoticeToneClass", () => {
  it("maps each tone to a semantic class", () => {
    expect(resolveNoticeToneClass("info")).toBe("notice-banner-info");
    expect(resolveNoticeToneClass("success")).toBe("notice-banner-success");
    expect(resolveNoticeToneClass("warning")).toBe("notice-banner-warning");
    expect(resolveNoticeToneClass("danger")).toBe("notice-banner-danger");
  });

  it("defaults to info", () => {
    expect(resolveNoticeToneClass()).toBe("notice-banner-info");
  });
});

describe("resolveNoticeRole", () => {
  it("uses alert for warning and danger", () => {
    expect(resolveNoticeRole("warning")).toBe("alert");
    expect(resolveNoticeRole("danger")).toBe("alert");
  });

  it("uses status for info and success", () => {
    expect(resolveNoticeRole("info")).toBe("status");
    expect(resolveNoticeRole("success")).toBe("status");
    expect(resolveNoticeRole()).toBe("status");
  });
});
