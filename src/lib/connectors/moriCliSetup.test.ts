import { describe, expect, it } from "vitest";
import {
  getMoriCliTargetPath,
  MoriCliSetupUnavailableError,
  stageMoriCli,
} from "./moriCliSetup";

describe("moriCliSetup browser boundary", () => {
  it("reports desktop-only staging honestly in browser tests", async () => {
    await expect(stageMoriCli()).rejects.toBeInstanceOf(MoriCliSetupUnavailableError);
    await expect(getMoriCliTargetPath()).rejects.toBeInstanceOf(MoriCliSetupUnavailableError);
  });
});
