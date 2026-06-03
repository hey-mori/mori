import { describe, expect, it } from "vitest";
import {
  ExplicitEmitterSetupUnavailableError,
  stageExplicitEmitters,
} from "./explicitEmitterSetup";

describe("explicitEmitterSetup browser boundary", () => {
  it("reports desktop-only staging honestly in browser tests", async () => {
    await expect(stageExplicitEmitters()).rejects.toBeInstanceOf(
      ExplicitEmitterSetupUnavailableError,
    );
  });
});
