import { test, expect, describe } from "vitest";
import {
  normalizeSegment,
  matchesRecord,
  countMatching,
  buildRecordIndex,
  countMatchingIndexed,
  pathKey,
  enumerateCandidateTuples,
  buildEligibilityMatrix,
  nearestLiveAncestor,
  liveChildrenOf,
  liveSiblingsOf,
  type AxisFieldMap,
} from "../eligibility.ts";
import type { SurfaceAxis, SurfaceRecord, EligibilityPolicy, AxisTuple } from "../types.ts";

const SEGMENT_PATTERN = /^[a-z0-9-]+$/;

const defaultPolicy: EligibilityPolicy = {
  minRecordsPerDepth: { 0: 1, 1: 1, 2: 1 },
  noindexBelowPerDepth: {},
  redirectPolicy: "nearest-ancestor",
  trailingSlash: true,
  segmentPattern: SEGMENT_PATTERN,
};

const axes: SurfaceAxis[] = [
  { id: "trade", universe: ["elektriker", "friseur"] },
  { id: "region", universe: ["berlin", "hamburg"] },
];

const axisFieldMap: AxisFieldMap = { trade: "trade", region: "region" };

const records: SurfaceRecord[] = [
  { trade: "elektriker", region: "berlin", status: "active" },
  { trade: "elektriker", region: "hamburg", status: "active" },
  { trade: "friseur", region: "berlin", status: "active" },
  { trade: "friseur", region: "hamburg", status: "archived" },
];

describe("normalizeSegment", () => {
  test("lowercases and converts underscores to dashes", () => {
    expect(normalizeSegment("Hello_World", SEGMENT_PATTERN)).toBe("hello-world");
  });

  test("trims whitespace", () => {
    expect(normalizeSegment("  berlin  ", SEGMENT_PATTERN)).toBe("berlin");
  });

  test("throws on invalid characters", () => {
    expect(() => normalizeSegment("hello world!", SEGMENT_PATTERN)).toThrow();
  });

  test("passes through already-normalized segment", () => {
    expect(normalizeSegment("elektriker", SEGMENT_PATTERN)).toBe("elektriker");
  });
});

describe("matchesRecord", () => {
  test("matches when all constrained axes match", () => {
    expect(
      matchesRecord(records[0]!, { trade: "elektriker", region: "berlin" }, axisFieldMap),
    ).toBe(true);
  });

  test("does not match when one axis differs", () => {
    expect(matchesRecord(records[0]!, { trade: "friseur", region: "berlin" }, axisFieldMap)).toBe(
      false,
    );
  });

  test("matches when tuple is empty (no constraints)", () => {
    expect(matchesRecord(records[0]!, {}, axisFieldMap)).toBe(true);
  });

  test("matches when only one axis is constrained", () => {
    expect(matchesRecord(records[0]!, { trade: "elektriker" }, axisFieldMap)).toBe(true);
    expect(matchesRecord(records[0]!, { trade: "friseur" }, axisFieldMap)).toBe(false);
  });

  test("returns false when axis field is missing from map", () => {
    expect(matchesRecord(records[0]!, { unknown: "x" }, axisFieldMap)).toBe(false);
  });

  test("matches array field values", () => {
    const rec: SurfaceRecord = { tags: ["a", "b"], status: "active" };
    expect(matchesRecord(rec, { tags: "a" }, { tags: "tags" })).toBe(true);
    expect(matchesRecord(rec, { tags: "c" }, { tags: "tags" })).toBe(false);
  });
});

describe("countMatching", () => {
  test("counts all active records for empty tuple", () => {
    expect(countMatching(records, {}, axisFieldMap)).toBe(3);
  });

  test("counts matching records for a specific tuple", () => {
    expect(countMatching(records, { trade: "elektriker" }, axisFieldMap)).toBe(2);
    expect(countMatching(records, { trade: "friseur" }, axisFieldMap)).toBe(1);
  });

  test("excludes archived records", () => {
    expect(countMatching(records, { trade: "friseur", region: "hamburg" }, axisFieldMap)).toBe(0);
  });
});

describe("buildRecordIndex + countMatchingIndexed", () => {
  const index = buildRecordIndex(records, axisFieldMap);

  test("index count matches linear count for empty tuple", () => {
    expect(countMatchingIndexed({}, axisFieldMap, index)).toBe(3);
  });

  test("index count matches linear count for specific tuple", () => {
    expect(countMatchingIndexed({ trade: "elektriker" }, axisFieldMap, index)).toBe(2);
    expect(countMatchingIndexed({ trade: "friseur", region: "berlin" }, axisFieldMap, index)).toBe(
      1,
    );
  });

  test("returns 0 for non-existent axis", () => {
    expect(countMatchingIndexed({ unknown: "x" }, axisFieldMap, index)).toBe(0);
  });

  test("returns 0 for non-existent value", () => {
    expect(countMatchingIndexed({ trade: "nonexistent" }, axisFieldMap, index)).toBe(0);
  });
});

describe("pathKey", () => {
  test("depth 0 produces just '0'", () => {
    expect(pathKey(0, {}, ["trade", "region"])).toBe("0");
  });

  test("depth 1 includes first axis value", () => {
    expect(pathKey(1, { trade: "elektriker" }, ["trade", "region"])).toBe("1|elektriker");
  });

  test("depth 2 includes both axis values", () => {
    expect(pathKey(2, { trade: "elektriker", region: "berlin" }, ["trade", "region"])).toBe(
      "2|elektriker|berlin",
    );
  });

  test("missing axis value becomes empty string", () => {
    expect(pathKey(2, { trade: "elektriker" }, ["trade", "region"])).toBe("2|elektriker|");
  });
});

describe("enumerateCandidateTuples", () => {
  test("depth 0 yields single empty tuple", () => {
    const tuples = [...enumerateCandidateTuples(axes, 0)];
    expect(tuples).toEqual([{}]);
  });

  test("depth 1 yields all first-axis values", () => {
    const tuples = [...enumerateCandidateTuples(axes, 1)];
    expect(tuples).toHaveLength(2);
    expect(tuples[0]).toEqual({ trade: "elektriker" });
    expect(tuples[1]).toEqual({ trade: "friseur" });
  });

  test("depth 2 yields cartesian product", () => {
    const tuples = [...enumerateCandidateTuples(axes, 2)];
    expect(tuples).toHaveLength(4);
    expect(tuples.map((t) => `${t.trade}/${t.region}`).sort()).toEqual([
      "elektriker/berlin",
      "elektriker/hamburg",
      "friseur/berlin",
      "friseur/hamburg",
    ]);
  });

  test("empty universe yields nothing", () => {
    const emptyAxes: SurfaceAxis[] = [{ id: "trade", universe: [] }];
    expect([...enumerateCandidateTuples(emptyAxes, 1)]).toHaveLength(0);
  });
});

describe("buildEligibilityMatrix", () => {
  const matrix = buildEligibilityMatrix(axes, axisFieldMap, records, defaultPolicy);

  test("has correct axis order", () => {
    expect(matrix.axisOrder).toEqual(["trade", "region"]);
  });

  test("root entry (depth 0) is live with 3 records", () => {
    const root = matrix.byKey.get("0");
    expect(root).toBeDefined();
    expect(root!.recordCount).toBe(3);
    expect(root!.indexable).toBe(true);
  });

  test("elektriker depth 1 is live with 2 records", () => {
    const entry = matrix.byKey.get("1|elektriker");
    expect(entry).toBeDefined();
    expect(entry!.recordCount).toBe(2);
    expect(entry!.indexable).toBe(true);
  });

  test("friseur depth 1 is live with 1 record", () => {
    const entry = matrix.byKey.get("1|friseur");
    expect(entry).toBeDefined();
    expect(entry!.recordCount).toBe(1);
    expect(entry!.indexable).toBe(true);
  });

  test("friseur/hamburg depth 2 is not live (archived only)", () => {
    const entry = matrix.byKey.get("2|friseur|hamburg");
    expect(entry).toBeUndefined();
  });

  test("elektriker/berlin depth 2 is live", () => {
    const entry = matrix.byKey.get("2|elektriker|berlin");
    expect(entry).toBeDefined();
    expect(entry!.indexable).toBe(true);
  });

  test("forceNonIndexableDepths gates a depth as regional-gated", () => {
    const matrix2 = buildEligibilityMatrix(axes, axisFieldMap, records, defaultPolicy, {
      forceNonIndexableDepths: [2],
      maxStubDepth: 2,
    });
    const entry = matrix2.byKey.get("2|elektriker|berlin");
    expect(entry).toBeDefined();
    expect(entry!.indexable).toBe(false);
    expect(entry!.decision.reason).toBe("regional-gated");
  });
});

describe("nearestLiveAncestor", () => {
  const matrix = buildEligibilityMatrix(axes, axisFieldMap, records, defaultPolicy);

  test("returns root for depth 1 entry", () => {
    const entry = matrix.byKey.get("1|elektriker")!;
    const ancestor = nearestLiveAncestor(entry, matrix, defaultPolicy);
    expect(ancestor?.depth).toBe(0);
  });

  test("returns nearest live ancestor for depth 2 entry", () => {
    const entry = matrix.byKey.get("2|elektriker|berlin")!;
    const ancestor = nearestLiveAncestor(entry, matrix, defaultPolicy);
    expect(ancestor?.depth).toBe(1);
    expect(ancestor?.tuple.trade).toBe("elektriker");
  });

  test("redirectPolicy root always returns root", () => {
    const rootPolicy = { ...defaultPolicy, redirectPolicy: "root" as const };
    const entry = matrix.byKey.get("2|elektriker|berlin")!;
    const ancestor = nearestLiveAncestor(entry, matrix, rootPolicy);
    expect(ancestor?.depth).toBe(0);
  });
});

describe("liveChildrenOf", () => {
  const matrix = buildEligibilityMatrix(axes, axisFieldMap, records, defaultPolicy);

  test("root has live children at depth 1", () => {
    const root = matrix.byKey.get("0")!;
    const children = liveChildrenOf(root, matrix);
    expect(children).toHaveLength(2);
    expect(children.map((c) => c.tuple.trade).sort()).toEqual(["elektriker", "friseur"]);
  });

  test("elektriker depth 1 has live children at depth 2", () => {
    const parent = matrix.byKey.get("1|elektriker")!;
    const children = liveChildrenOf(parent, matrix);
    expect(children).toHaveLength(2);
    expect(children.map((c) => c.tuple.region).sort()).toEqual(["berlin", "hamburg"]);
  });

  test("friseur depth 1 has one live child (berlin)", () => {
    const parent = matrix.byKey.get("1|friseur")!;
    const children = liveChildrenOf(parent, matrix);
    expect(children).toHaveLength(1);
    expect(children[0]!.tuple.region).toBe("berlin");
  });
});

describe("liveSiblingsOf", () => {
  const matrix = buildEligibilityMatrix(axes, axisFieldMap, records, defaultPolicy);

  test("depth 0 has no siblings", () => {
    const root = matrix.byKey.get("0")!;
    expect(liveSiblingsOf(root, matrix)).toHaveLength(0);
  });

  test("elektriker at depth 1 has friseur as sibling", () => {
    const entry = matrix.byKey.get("1|elektriker")!;
    const siblings = liveSiblingsOf(entry, matrix);
    expect(siblings).toHaveLength(1);
    expect(siblings[0]!.tuple.trade).toBe("friseur");
  });

  test("elektriker/berlin at depth 2 has elektriker/hamburg as sibling", () => {
    const entry = matrix.byKey.get("2|elektriker|berlin")!;
    const siblings = liveSiblingsOf(entry, matrix);
    expect(siblings).toHaveLength(1);
    expect(siblings[0]!.tuple.region).toBe("hamburg");
  });
});
