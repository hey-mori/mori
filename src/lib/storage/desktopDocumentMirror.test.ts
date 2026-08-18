import { afterEach, describe, expect, it } from "vitest";
import {
  createDesktopDocumentMirror,
  getDocumentMirrorHealth,
  resetDesktopDocumentMirror,
} from "./desktopDocumentMirror";

afterEach(() => resetDesktopDocumentMirror());

describe("createDesktopDocumentMirror", () => {
  // Browser behaviour must stay byte-identical through the whole promotion, so
  // the wrapper has to be absent there rather than present and failing. A
  // mirror in browser mode would be a queue that throws on every write.
  it("returns null outside Tauri, so the repository is left unwrapped", () => {
    expect(createDesktopDocumentMirror()).toBeNull();
  });

  it("reports no mirror health when there is no mirror", () => {
    expect(getDocumentMirrorHealth()).toBeNull();
  });
});
