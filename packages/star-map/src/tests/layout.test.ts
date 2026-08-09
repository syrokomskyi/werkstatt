import { test, expect, describe } from "vitest";
import { computeLayout } from "../layout.ts";
import type { StarMapGraph } from "../types.ts";

function makeGraph(overrides: Partial<StarMapGraph> = {}): StarMapGraph {
  return {
    appId: "test-app",
    constellation: "test-constellation",
    nodes: [],
    edges: [],
    ...overrides,
  };
}

describe("computeLayout", () => {
  test("places constellation at center", () => {
    const graph = makeGraph({
      nodes: [{ id: "c", label: "Constellation", kind: "constellation" }],
    });
    const positions = computeLayout(graph, 1200, 800);
    const center = positions.find((p) => p.nodeId === "c");
    expect(center).toBeDefined();
    expect(center!.x).toBe(600);
    expect(center!.y).toBe(400);
  });

  test("places a single star at top center of primary ring", () => {
    const graph = makeGraph({
      nodes: [
        { id: "c", label: "Const", kind: "constellation" },
        { id: "s1", label: "Vega", kind: "star" },
      ],
    });
    const positions = computeLayout(graph, 1200, 800);
    const star = positions.find((p) => p.nodeId === "s1");
    expect(star).toBeDefined();
    // Single star at angle -PI/2 (top), radius = min(1200,800) * 0.28 = 224
    expect(star!.x).toBe(600);
    expect(star!.y).toBe(400 - 224);
  });

  test("places multiple stars evenly on ring", () => {
    const graph = makeGraph({
      nodes: [
        { id: "c", label: "Const", kind: "constellation" },
        { id: "s1", label: "Vega", kind: "star" },
        { id: "s2", label: "Sirius", kind: "star" },
      ],
    });
    const positions = computeLayout(graph, 1200, 800);
    const stars = positions.filter((p) => p.nodeId.startsWith("s"));
    expect(stars).toHaveLength(2);
  });

  test("is deterministic — same input produces same output", () => {
    const graph = makeGraph({
      nodes: [
        { id: "c", label: "Const", kind: "constellation" },
        { id: "s1", label: "Vega", kind: "star" },
        { id: "s2", label: "Sirius", kind: "star" },
      ],
    });
    const a = computeLayout(graph, 1200, 800);
    const b = computeLayout(graph, 1200, 800);
    expect(a).toEqual(b);
  });

  test("places planets around their parent star", () => {
    const graph = makeGraph({
      nodes: [
        { id: "c", label: "Const", kind: "constellation" },
        { id: "s1", label: "Vega", kind: "star" },
        { id: "p1", label: "Europa", kind: "planet" },
        { id: "p2", label: "Io", kind: "planet" },
      ],
      edges: [
        { from: "c", to: "s1" },
        { from: "s1", to: "p1" },
        { from: "s1", to: "p2" },
      ],
    });
    const positions = computeLayout(graph, 1200, 800);
    expect(positions.find((p) => p.nodeId === "p1")).toBeDefined();
    expect(positions.find((p) => p.nodeId === "p2")).toBeDefined();
  });

  test("places moons around their parent planet", () => {
    const graph = makeGraph({
      nodes: [
        { id: "c", label: "Const", kind: "constellation" },
        { id: "s1", label: "Vega", kind: "star" },
        { id: "p1", label: "Europa", kind: "planet" },
        { id: "m1", label: "Oberon", kind: "moon" },
      ],
      edges: [
        { from: "c", to: "s1" },
        { from: "s1", to: "p1" },
        { from: "p1", to: "m1" },
      ],
    });
    const positions = computeLayout(graph, 1200, 800);
    expect(positions.find((p) => p.nodeId === "m1")).toBeDefined();
  });

  test("handles empty graph gracefully", () => {
    const graph = makeGraph();
    const positions = computeLayout(graph, 1200, 800);
    expect(positions).toEqual([]);
  });

  test("produces integer coordinates", () => {
    const graph = makeGraph({
      nodes: [
        { id: "c", label: "Const", kind: "constellation" },
        { id: "s1", label: "Vega", kind: "star" },
        { id: "s2", label: "Sirius", kind: "star" },
        { id: "s3", label: "Polaris", kind: "star" },
      ],
    });
    const positions = computeLayout(graph, 1200, 800);
    for (const p of positions) {
      expect(Number.isInteger(p.x)).toBe(true);
      expect(Number.isInteger(p.y)).toBe(true);
    }
  });
});
