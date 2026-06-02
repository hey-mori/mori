import { describe, expect, it } from "vitest";
import { buildMcpConfigSnippet } from "./mcpServerSetup";

describe("buildMcpConfigSnippet", () => {
  it("registers the staged server under the default mori-capture key", () => {
    const snippet = buildMcpConfigSnippet("/home/me/.mori/connectors/mcp/mori-mcp-server.py");
    const parsed = JSON.parse(snippet);
    expect(parsed).toEqual({
      mcpServers: {
        "mori-capture": {
          command: "python",
          args: ["/home/me/.mori/connectors/mcp/mori-mcp-server.py"],
        },
      },
    });
  });

  it("honors a custom server name and python command", () => {
    const snippet = buildMcpConfigSnippet("C:/Users/me/.mori/connectors/mcp/mori-mcp-server.py", {
      serverName: "mori",
      pythonCommand: "python3",
    });
    const parsed = JSON.parse(snippet);
    expect(parsed.mcpServers.mori.command).toBe("python3");
    expect(parsed.mcpServers.mori.args).toEqual([
      "C:/Users/me/.mori/connectors/mcp/mori-mcp-server.py",
    ]);
  });

  it("falls back to defaults for blank options", () => {
    const snippet = buildMcpConfigSnippet("/x/server.py", {
      serverName: "  ",
      pythonCommand: "",
    });
    const parsed = JSON.parse(snippet);
    expect(Object.keys(parsed.mcpServers)).toEqual(["mori-capture"]);
    expect(parsed.mcpServers["mori-capture"].command).toBe("python");
  });

  it("produces valid, indented JSON", () => {
    const snippet = buildMcpConfigSnippet("/x/server.py");
    expect(snippet).toContain('\n  "mcpServers"');
    expect(() => JSON.parse(snippet)).not.toThrow();
  });
});
