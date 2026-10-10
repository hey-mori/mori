import { describe, expect, it } from "vitest";
import { readableAgentText, withoutPasteMarkers } from "./agentText";

describe("agent text as a person reads it", () => {
  it("drops the slash-command wrappers and says the command once, with its arguments", () => {
    expect(readableAgentText("<command-name>/model</command-name> <command-message>model</command-message> <command-args>opus</command-args>")).toBe("/model opus");
  });

  it("keeps a command's output and pasted text, without their tags", () => {
    expect(readableAgentText("<local-command-stdout>Set model to Opus</local-command-stdout>")).toBe("Set model to Opus");
    expect(readableAgentText('<pasted_content id="40b2"> # OCI CI 개선 </pasted_content>')).toBe("# OCI CI 개선");
  });

  it("leaves ordinary text and unknown tags alone", () => {
    expect(readableAgentText("CI 실행 기록 100건을 수집했습니다.")).toBe("CI 실행 기록 100건을 수집했습니다.");
    expect(readableAgentText("use <div> here")).toBe("use <div> here");
    expect(withoutPasteMarkers("a")).toBe("a");
  });
});
