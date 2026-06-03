/**
 * Invariant tests for `connectors/terminal-helper/mori-capture.sh`.
 *
 * The terminal helper is not a separate event-producing connector. It is a
 * user-invoked launcher for `mori-local-capture.py`, so it must stay free of
 * shell hooks, history reads, watchers, and terminalShell-specific JSONL.
 */
import { describe, expect, it } from "vitest";
import terminalHelper from "../../../connectors/terminal-helper/mori-capture.sh?raw";

describe("connectors/terminal-helper/mori-capture.sh", () => {
  it("wraps local-capture instead of emitting a separate terminalShell schema", () => {
    expect(terminalHelper).toContain("MORI_LOCAL_CAPTURE");
    expect(terminalHelper).toContain("mori-local-capture.py");
    expect(terminalHelper).toContain("--git-repo");
    expect(terminalHelper).toContain("--git-commit");
    expect(terminalHelper).toContain("--note");
    expect(terminalHelper).toContain("--transcript");
    expect(terminalHelper).not.toContain('"terminalShell"');
    expect(terminalHelper).not.toContain("'terminalShell'");
  });

  it("does not install shell hooks or read shell history", () => {
    expect(terminalHelper).not.toMatch(/\bPROMPT_COMMAND\b/);
    expect(terminalHelper).not.toMatch(/\bprecmd\b/);
    expect(terminalHelper).not.toMatch(/\bpreexec\b/);
    expect(terminalHelper).not.toMatch(/\.bash_history/);
    expect(terminalHelper).not.toMatch(/\.zsh_history/);
  });
});
