import { test, expect } from "vitest";
import fc from "fast-check";
import { computeLayout } from "../layout.ts";
import type { StarMapGraph, StarMapNode, StarMapEdge } from "../types.ts";

const nodeKinds = ["constellation", "star", "planet", "moon"] as const;

const arbNode = fc.record({
  id: fc.string({ minLength: 1, maxLength: 10 }).map((s) => `n-${s}`),
  label: fc.string({ minLength: 1, maxLength: 10 }),
  kind: fc.constantFrom(...nodeKinds),
});

const arbGraph = fc.record({
  nodes: fc.array(arbNode, { minLength: 1, maxLength: 10 }),
  edges: fc.array(
    fc.record({
      from: fc.string({ minLength: 1, maxLength: 10 }),
      to: fc.string({ minLength: 1, maxLength: 10 }),
    }),
    { maxLength: 5 },
  ),
  appId: fc.constant("test-app"),
  constellation: fc.constant("test-constellation"),
});

test("PBT: computeLayout is deterministic — same graph always produces same positions", () => {
  fc.assert(
    fc.property(arbGraph, fc.integer({ min: 100, max: 2000 }), (graph, size) => {
      const a = computeLayout(graph, size, size);
      const b = computeLayout(graph, size, size);
      expect(a).toEqual(b);
    }),
  );
});

test("PBT: computeLayout produces integer coordinates for star/planet/moon nodes", () => {
  fc.assert(
    fc.property(arbGraph, fc.integer({ min: 100, max: 2000 }), (graph, size) => {
      const positions = computeLayout(graph, size, size);
      for (const p of positions) {
        const node = graph.nodes.find((n) => n.id === p.nodeId);
        if (node && node.kind !== "constellation") {
          expect(Number.isInteger(p.x)).toBe(true);
          expect(Number.isInteger(p.y)).toBe(true);
        }
      }
    }),
  );
});

test("PBT: computeLayout places constellation at center", () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 100, max: 2000 }),
      fc.integer({ min: 100, max: 2000 }),
      (width, height) => {
        const graph: StarMapGraph = {
          appId: "test",
          constellation: "test",
          nodes: [{ id: "c", label: "C", kind: "constellation" }],
          edges: [],
        };
        const positions = computeLayout(graph, width, height);
        const center = positions.find((p) => p.nodeId === "c");
        expect(center).toBeDefined();
        expect(center!.x).toBe(width / 2);
        expect(center!.y).toBe(height / 2);
      },
    ),
  );
});
