import { test, expect } from "vitest";
import fc from "fast-check";
import {
  normalizeSegment,
  matchesRecord,
  countMatching,
  buildRecordIndex,
  countMatchingIndexed,
  pathKey,
  enumerateCandidateTuples,
  buildEligibilityMatrix,
  type AxisFieldMap,
} from "../eligibility.ts";
import type { SurfaceAxis, SurfaceRecord, EligibilityPolicy } from "../types.ts";

const SEGMENT_PATTERN = /^[a-z0-9-]+$/;

const defaultPolicy: EligibilityPolicy = {
  minRecordsPerDepth: { 0: 1, 1: 1, 2: 1 },
  noindexBelowPerDepth: {},
  redirectPolicy: "nearest-ancestor",
  trailingSlash: true,
  segmentPattern: SEGMENT_PATTERN,
};

test("PBT: normalizeSegment is idempotent", () => {
  fc.assert(
    fc.property(
      fc.stringMatching(SEGMENT_PATTERN).map((s) => s.replace(/_/g, "-")),
      (s) => {
        const once = normalizeSegment(s, SEGMENT_PATTERN);
        const twice = normalizeSegment(once, SEGMENT_PATTERN);
        expect(twice).toBe(once);
      },
    ),
  );
});

test("PBT: countMatchingIndexed matches countMatching for any tuple", () => {
  const axes: SurfaceAxis[] = [
    { id: "trade", universe: ["elektriker", "friseur", "baker"] },
    { id: "region", universe: ["berlin", "hamburg", "munich"] },
  ];
  const axisFieldMap: AxisFieldMap = { trade: "trade", region: "region" };
  const records: SurfaceRecord[] = [
    { trade: "elektriker", region: "berlin", status: "active" },
    { trade: "elektriker", region: "hamburg", status: "active" },
    { trade: "friseur", region: "berlin", status: "active" },
    { trade: "friseur", region: "hamburg", status: "archived" },
    { trade: "baker", region: "munich", status: "active" },
  ];
  const index = buildRecordIndex(records, axisFieldMap);

  const tupleArb = fc.record({
    trade: fc.constantFrom("elektriker", "friseur", "baker", undefined),
    region: fc.constantFrom("berlin", "hamburg", "munich", undefined),
  });

  fc.assert(
    fc.property(tupleArb, (tuple) => {
      const linear = countMatching(records, tuple, axisFieldMap);
      const indexed = countMatchingIndexed(tuple, axisFieldMap, index);
      expect(indexed).toBe(linear);
    }),
  );
});

test("PBT: pathKey is deterministic for the same input", () => {
  const axisOrder = ["a", "b", "c"];
  const tupleArb = fc.record({
    a: fc.constantFrom("x", "y", undefined),
    b: fc.constantFrom("z", "w", undefined),
    c: fc.constantFrom("q", "r", undefined),
  });
  const depthArb = fc.integer({ min: 0, max: 3 });

  fc.assert(
    fc.property(tupleArb, depthArb, (tuple, depth) => {
      const k1 = pathKey(depth, tuple, axisOrder);
      const k2 = pathKey(depth, tuple, axisOrder);
      expect(k1).toBe(k2);
    }),
  );
});

test("PBT: enumerateCandidateTuples count equals product of universe sizes", () => {
  const universeArb = fc.array(fc.stringMatching(SEGMENT_PATTERN), { minLength: 1, maxLength: 5 });
  const axesArb = fc.array(
    fc.record({ id: fc.stringMatching(SEGMENT_PATTERN), universe: universeArb }),
    { minLength: 1, maxLength: 3 },
  );

  fc.assert(
    fc.property(axesArb, (axes) => {
      const depth = axes.length;
      const tuples = [...enumerateCandidateTuples(axes, depth)];
      const expected = axes.reduce((acc, a) => acc * a.universe.length, 1);
      expect(tuples).toHaveLength(expected);
    }),
  );
});

test("PBT: buildEligibilityMatrix entries are ordered by depth", () => {
  const axes: SurfaceAxis[] = [
    { id: "trade", universe: ["elektriker", "friseur"] },
    { id: "region", universe: ["berlin", "hamburg"] },
  ];
  const axisFieldMap: AxisFieldMap = { trade: "trade", region: "region" };
  const records: SurfaceRecord[] = [
    { trade: "elektriker", region: "berlin", status: "active" },
    { trade: "friseur", region: "hamburg", status: "active" },
  ];

  fc.assert(
    fc.property(fc.boolean(), (forceGate) => {
      const matrix = buildEligibilityMatrix(axes, axisFieldMap, records, defaultPolicy, {
        forceNonIndexableDepths: forceGate ? [2] : [],
      });
      for (let i = 1; i < matrix.entries.length; i++) {
        expect(matrix.entries[i]!.depth).toBeGreaterThanOrEqual(matrix.entries[i - 1]!.depth);
      }
    }),
  );
});

test("PBT: matchesRecord with empty tuple always returns true", () => {
  const recordArb: fc.Arbitrary<SurfaceRecord> = fc.record({
    field: fc.string(),
    status: fc.constantFrom("active", "archived"),
  });

  fc.assert(
    fc.property(recordArb, (record) => {
      expect(matchesRecord(record, {}, {})).toBe(true);
    }),
  );
});
