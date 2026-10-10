import { describe, expect, it } from "vitest";
import { labelText, readableAgentLabel, readableAgentText } from "./agentText";

describe("agent text as a person reads it", () => {
  it("drops the slash-command wrappers and the repeated command message, keeping the arguments", () => {
    expect(readableAgentText("<command-name>/model</command-name> <command-message>model</command-message> <command-args>opus</command-args>")).toBe("/model opus");
  });

  it("keeps a command's output and pasted text, without their tags", () => {
    expect(readableAgentText("<local-command-stdout>Set model to Opus</local-command-stdout>")).toBe("Set model to Opus");
    expect(readableAgentText('<pasted_content id="40b2"> # OCI CI 개선 </pasted_content>')).toBe("# OCI CI 개선");
  });

  it("drops an injected reminder or caveat with its content", () => {
    expect(readableAgentText("<system-reminder>Contents of CLAUDE.md: never push</system-reminder>\nfix the bug")).toBe("fix the bug");
    expect(readableAgentText("<local-command-caveat>Caveat: The messages below were generated</local-command-caveat>")).toBe("");
  });

  it("leaves prose that mentions a tag, and its line breaks and indentation, as written", () => {
    const prose = "The importer strips `<command-name>` and `<system-reminder>` wrappers now.";
    expect(readableAgentText(prose)).toBe(prose);
    expect(readableAgentText("def f():\n    return 1\n\nnext para")).toBe("def f():\n    return 1\n\nnext para");
    expect(readableAgentText("use <div> here")).toBe("use <div> here");
  });

  it("stays fast on a long unclosed wrapper", () => {
    const started = Date.now();
    readableAgentText(`<command-name>${" ".repeat(50_000)}`);
    readableAgentText(`<command-name>${"\n".repeat(50_000)}x`);
    expect(Date.now() - started).toBeLessThan(500);
  });
});


describe("agent text as a title", () => {
  it("is never blank: transport with nothing readable says what it was", () => {
    expect(readableAgentLabel("<bash-stdout></bash-stdout><bash-stderr></bash-stderr>")).toBe("셸 명령");
    expect(readableAgentLabel("<command-name>/model</command-name>")).toBe("/model");
    expect(readableAgentLabel("고쳐줘")).toBe("고쳐줘");
    expect(readableAgentLabel("")).toBe("");
  });

  it("drops only a leading tool glyph", () => {
    expect(labelText("🔧 Bash: ls")).toBe("Bash: ls");
    expect(labelText("↳ 도구 결과")).toBe("↳ 도구 결과");
  });
});
