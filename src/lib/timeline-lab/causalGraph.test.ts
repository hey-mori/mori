import { describe, expect, it } from "vitest";
import type { Artifact } from "../../domain/types";
import { buildCausalGraph, traceCausalChain } from "./causalGraph";
import { labDecision, labEvent, labIssue, labRelationship, labSession } from "./labFixture";

function labArtifact(overrides: Partial<Artifact> = {}): Artifact {
  return {
    id: "art-1",
    projectId: "p1",
    sessionId: "s1",
    title: "산출물",
    kind: "document",
    sourceEventIds: [],
    createdAt: "2026-05-22T09:40:00Z",
    ...overrides,
  };
}

describe("buildCausalGraph nodes", () => {
  it("creates a node for every event, decision, issue and artifact", () => {
    const graph = buildCausalGraph(
      labSession({
        events: [labEvent({ id: "evt-1" })],
        decisions: [labDecision({ id: "dec-1" })],
        issues: [labIssue({ id: "iss-1" })],
        artifacts: [labArtifact({ id: "art-1" })],
      }),
    );
    expect(graph.nodes.map((n) => n.id).sort()).toEqual(["art-1", "dec-1", "evt-1", "iss-1"]);
    const artifact = graph.nodes.find((n) => n.id === "art-1");
    expect(artifact?.kind).toBe("artifact");
  });
});

describe("buildCausalGraph edges", () => {
  it("keeps only relationships whose endpoints are both present", () => {
    const graph = buildCausalGraph(
      labSession({
        events: [labEvent({ id: "evt-1" }), labEvent({ id: "evt-2" })],
        relationships: [
          labRelationship({ id: "r-ok", fromId: "evt-1", toId: "evt-2" }),
          labRelationship({ id: "r-missing", fromId: "evt-1", toId: "ghost" }),
        ],
      }),
    );
    expect(graph.edges.map((e) => e.id)).toEqual(["r-ok"]);
  });

  it("drops self-referential relationships", () => {
    const graph = buildCausalGraph(
      labSession({
        events: [labEvent({ id: "evt-1" })],
        relationships: [labRelationship({ id: "r-self", fromId: "evt-1", toId: "evt-1" })],
      }),
    );
    expect(graph.edges).toHaveLength(0);
  });

  it("dedupes parallel edges between the same pair", () => {
    const graph = buildCausalGraph(
      labSession({
        events: [labEvent({ id: "evt-1" }), labEvent({ id: "evt-2" })],
        relationships: [
          labRelationship({ id: "r-1", fromId: "evt-1", toId: "evt-2", type: "ledTo" }),
          labRelationship({ id: "r-2", fromId: "evt-1", toId: "evt-2", type: "caused" }),
        ],
      }),
    );
    expect(graph.edges).toHaveLength(1);
    expect(graph.edges[0]?.id).toBe("r-1");
  });
});

describe("buildCausalGraph layering", () => {
  it("layers nodes by causal depth, not by clock", () => {
    const view = labSession({
      // Intentionally out of causal order in time to prove the clock is ignored.
      events: [
        labEvent({ id: "evt-root", start: "2026-05-22T11:00:00Z" }),
        labEvent({ id: "evt-mid", start: "2026-05-22T10:00:00Z" }),
        labEvent({ id: "evt-leaf", start: "2026-05-22T09:00:00Z" }),
      ],
      relationships: [
        labRelationship({ id: "r-1", fromId: "evt-root", toId: "evt-mid" }),
        labRelationship({ id: "r-2", fromId: "evt-mid", toId: "evt-leaf" }),
      ],
    });
    const graph = buildCausalGraph(view);
    const layerOf = (id: string) => graph.nodes.find((n) => n.id === id)?.layer;
    expect(layerOf("evt-root")).toBe(0);
    expect(layerOf("evt-mid")).toBe(1);
    expect(layerOf("evt-leaf")).toBe(2);
    expect(graph.layerCount).toBe(3);
  });

  it("uses the longest path when a node has multiple parents", () => {
    const view = labSession({
      events: [
        labEvent({ id: "a" }),
        labEvent({ id: "b" }),
        labEvent({ id: "c" }),
      ],
      relationships: [
        labRelationship({ id: "r-ab", fromId: "a", toId: "b" }),
        labRelationship({ id: "r-ac", fromId: "a", toId: "c" }),
        labRelationship({ id: "r-bc", fromId: "b", toId: "c" }),
      ],
    });
    const graph = buildCausalGraph(view);
    // c is reachable as a child of a (depth 1) and of b (depth 2); take the max.
    expect(graph.nodes.find((n) => n.id === "c")?.layer).toBe(2);
  });
});

describe("buildCausalGraph crossing reduction", () => {
  it("reorders a layer by its parents' positions to uncross edges", () => {
    // Insertion order a, b, c, d puts layer 1 at c, d. The links a→d and b→c
    // cross in that order; the barycenter sweep should flip layer 1 to d, c.
    const view = labSession({
      events: [
        labEvent({ id: "a" }),
        labEvent({ id: "b" }),
        labEvent({ id: "c" }),
        labEvent({ id: "d" }),
      ],
      relationships: [
        labRelationship({ id: "r-ad", fromId: "a", toId: "d" }),
        labRelationship({ id: "r-bc", fromId: "b", toId: "c" }),
      ],
    });
    const graph = buildCausalGraph(view);
    const orderOf = (id: string) => graph.nodes.find((n) => n.id === id)?.order;
    expect(orderOf("a")).toBe(0);
    expect(orderOf("b")).toBe(1);
    // d follows a (parent at 0), c follows b (parent at 1): no crossing.
    expect(orderOf("d")).toBeLessThan(orderOf("c") as number);
  });

  it("is deterministic across repeated builds", () => {
    const make = () =>
      buildCausalGraph(
        labSession({
          events: [
            labEvent({ id: "a" }),
            labEvent({ id: "b" }),
            labEvent({ id: "c" }),
            labEvent({ id: "d" }),
          ],
          relationships: [
            labRelationship({ id: "r-ad", fromId: "a", toId: "d" }),
            labRelationship({ id: "r-bc", fromId: "b", toId: "c" }),
          ],
        }),
      );
    const first = make().nodes.map((n) => `${n.id}:${n.layer}:${n.order}`);
    const second = make().nodes.map((n) => `${n.id}:${n.layer}:${n.order}`);
    expect(first).toEqual(second);
  });

  it("gives every node in a layer a distinct order index", () => {
    const graph = buildCausalGraph(
      labSession({
        events: [labEvent({ id: "a" }), labEvent({ id: "b" }), labEvent({ id: "c" })],
      }),
    );
    const orders = graph.nodes.map((n) => n.order);
    expect(new Set(orders).size).toBe(3);
    expect(orders.sort()).toEqual([0, 1, 2]);
  });
});

describe("traceCausalChain", () => {
  // a → b → c → d, plus an unrelated pair x → y.
  const chainGraph = () =>
    buildCausalGraph(
      labSession({
        events: [
          labEvent({ id: "a" }),
          labEvent({ id: "b" }),
          labEvent({ id: "c" }),
          labEvent({ id: "d" }),
          labEvent({ id: "x" }),
          labEvent({ id: "y" }),
        ],
        relationships: [
          labRelationship({ id: "r-ab", fromId: "a", toId: "b" }),
          labRelationship({ id: "r-bc", fromId: "b", toId: "c" }),
          labRelationship({ id: "r-cd", fromId: "c", toId: "d" }),
          labRelationship({ id: "r-xy", fromId: "x", toId: "y" }),
        ],
      }),
    );

  it("includes ancestors, self and descendants of the focal node", () => {
    const trace = traceCausalChain(chainGraph(), "c");
    expect([...trace.nodes].sort()).toEqual(["a", "b", "c", "d"]);
  });

  it("includes every edge along the traced chain", () => {
    const trace = traceCausalChain(chainGraph(), "c");
    expect([...trace.edges].sort()).toEqual(["r-ab", "r-bc", "r-cd"]);
  });

  it("excludes nodes and edges on an unconnected chain", () => {
    const trace = traceCausalChain(chainGraph(), "c");
    expect(trace.nodes.has("x")).toBe(false);
    expect(trace.nodes.has("y")).toBe(false);
    expect(trace.edges.has("r-xy")).toBe(false);
  });

  it("traces a root node forward only", () => {
    const trace = traceCausalChain(chainGraph(), "a");
    expect([...trace.nodes].sort()).toEqual(["a", "b", "c", "d"]);
  });

  it("returns just the node itself when it has no relationships", () => {
    const graph = buildCausalGraph(
      labSession({ events: [labEvent({ id: "lonely" })] }),
    );
    const trace = traceCausalChain(graph, "lonely");
    expect([...trace.nodes]).toEqual(["lonely"]);
    expect(trace.edges.size).toBe(0);
  });

  it("does not pull in a sibling that only shares a parent", () => {
    // a → b and a → c. Tracing b must not reach c (no path between them).
    const graph = buildCausalGraph(
      labSession({
        events: [labEvent({ id: "a" }), labEvent({ id: "b" }), labEvent({ id: "c" })],
        relationships: [
          labRelationship({ id: "r-ab", fromId: "a", toId: "b" }),
          labRelationship({ id: "r-ac", fromId: "a", toId: "c" }),
        ],
      }),
    );
    const trace = traceCausalChain(graph, "b");
    expect([...trace.nodes].sort()).toEqual(["a", "b"]);
    expect(trace.nodes.has("c")).toBe(false);
  });
});

describe("buildCausalGraph legend", () => {
  it("lists each present relationship type once", () => {
    const graph = buildCausalGraph(
      labSession({
        events: [labEvent({ id: "e1" }), labEvent({ id: "e2" }), labEvent({ id: "e3" })],
        relationships: [
          labRelationship({ id: "r-1", fromId: "e1", toId: "e2", type: "ledTo" }),
          labRelationship({ id: "r-2", fromId: "e2", toId: "e3", type: "ledTo" }),
          labRelationship({ id: "r-3", fromId: "e1", toId: "e3", type: "caused" }),
        ],
      }),
    );
    expect(graph.legend.map((l) => l.type).sort()).toEqual(["caused", "ledTo"]);
  });

  it("is empty when there are no edges", () => {
    const graph = buildCausalGraph(labSession({ events: [labEvent({ id: "e1" })] }));
    expect(graph.legend).toEqual([]);
    expect(graph.edges).toEqual([]);
  });
});
