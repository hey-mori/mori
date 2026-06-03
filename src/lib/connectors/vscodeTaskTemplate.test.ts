/**
 * Invariant tests for `connectors/vscode-task/mori-tasks.json`.
 *
 * The VS Code artifact is a task template, not an extension and not a watcher.
 * Every task must remain an explicit launcher for `mori-local-capture.py`.
 */
import { describe, expect, it } from "vitest";
import tasksRaw from "../../../connectors/vscode-task/mori-tasks.json?raw";

type VscodeTaskFile = {
  tasks: Array<{
    label: string;
    type: string;
    command: string;
    args: string[];
    problemMatcher: unknown[];
  }>;
  inputs?: Array<{ id: string; type: string }>;
};

describe("connectors/vscode-task/mori-tasks.json", () => {
  const parsed = JSON.parse(tasksRaw) as VscodeTaskFile;

  it("defines explicit Mori tasks that invoke local-capture only", () => {
    expect(parsed.tasks.map((task) => task.label)).toEqual([
      "Mori: capture Git snapshot",
      "Mori: capture last commit",
      "Mori: capture a note",
    ]);
    for (const task of parsed.tasks) {
      expect(task.type).toBe("shell");
      expect(task.command).toBe("python3");
      expect(task.args[0]).toContain("mori-local-capture.py");
      expect(task.problemMatcher).toEqual([]);
    }
  });

  it("captures only explicit safe inputs", () => {
    const args = parsed.tasks.flatMap((task) => task.args);
    expect(args).toContain("--git-repo");
    expect(args).toContain("--git-commit");
    expect(args).toContain("--note");
    expect(args).toContain("${workspaceFolder}");
    expect(parsed.inputs?.some((input) => input.id === "moriNote")).toBe(true);
  });

  it("does not configure watchers, background tasks, or extension activation", () => {
    const lower = tasksRaw.toLowerCase();
    expect(lower).not.toContain("watch");
    expect(lower).not.toContain("background");
    expect(lower).not.toContain("activationevents");
    expect(lower).not.toContain("filesystemwatcher");
  });
});
