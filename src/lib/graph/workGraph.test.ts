import { describe, expect, it } from "vitest";
import { buildWorkGraph, type WorkGraphProject } from "./workGraph";

const projects: WorkGraphProject[] = [
  {
    key: "ng-gw",
    label: "ng-gw",
    sessions: [
      { sessionId: "s1", title: "JWT" },
      { sessionId: "s2", title: "라우팅" },
    ],
  },
  {
    key: "mori",
    label: "mori",
    sessions: [{ sessionId: "s3", title: "리포트" }],
  },
];

describe("buildWorkGraph", () => {
  it("returns only the hub when there are no projects", () => {
    const graph = buildWorkGraph([]);
    expect(graph.nodes).toHaveLength(1);
    expect(graph.nodes[0]?.kind).toBe("hub");
    expect(graph.links).toHaveLength(0);
  });

  it("seeds the hub at the centre of the unit square", () => {
    const graph = buildWorkGraph(projects);
    const hub = graph.nodes.find((node) => node.kind === "hub");
    expect(hub).toMatchObject({ seedX: 0.5, seedY: 0.5 });
  });

  it("emits one node per project and per shown session", () => {
    const graph = buildWorkGraph(projects);
    expect(graph.nodes.filter((n) => n.kind === "project")).toHaveLength(2);
    expect(graph.nodes.filter((n) => n.kind === "session")).toHaveLength(3);
  });

  it("links the hub to each project (spoke) and each project to its sessions (twig)", () => {
    const graph = buildWorkGraph(projects);
    expect(graph.links.filter((l) => l.spoke)).toHaveLength(2);
    expect(graph.links.filter((l) => !l.spoke)).toHaveLength(3);
    const spoke = graph.links.find((l) => l.spoke);
    expect(spoke?.source).toBe("hub");
    expect(spoke?.target).toBe("proj:ng-gw");
  });

  it("sizes project nodes by session count and carries the count label", () => {
    const graph = buildWorkGraph(projects);
    const ngGw = graph.nodes.find((n) => n.id === "proj:ng-gw");
    const mori = graph.nodes.find((n) => n.id === "proj:mori");
    expect(ngGw?.count).toBe(2);
    expect((ngGw?.r ?? 0)).toBeGreaterThan(mori?.r ?? 0);
  });

  it("keeps session seeds inside the unit square", () => {
    const graph = buildWorkGraph(projects);
    for (const node of graph.nodes) {
      expect(node.seedX).toBeGreaterThanOrEqual(0);
      expect(node.seedX).toBeLessThanOrEqual(1);
      expect(node.seedY).toBeGreaterThanOrEqual(0);
      expect(node.seedY).toBeLessThanOrEqual(1);
    }
  });

  it("caps the sessions plotted per project but keeps the true count", () => {
    const dense: WorkGraphProject[] = [
      {
        key: "p",
        label: "p",
        sessions: Array.from({ length: 20 }, (_, i) => ({
          sessionId: `s${i}`,
          title: `t${i}`,
        })),
      },
    ];
    const graph = buildWorkGraph(dense, { maxSessionsPerProject: 8 });
    expect(graph.nodes.filter((n) => n.kind === "session")).toHaveLength(8);
    expect(graph.nodes.find((n) => n.kind === "project")?.count).toBe(20);
  });

  it("is deterministic — same input, same topology", () => {
    expect(buildWorkGraph(projects)).toEqual(buildWorkGraph(projects));
  });
});
