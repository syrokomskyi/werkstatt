/*
<MODULE_CONTRACT>
<purpose>
  [RFC-0192] Axis-generic eligibility engine. The legacy foerderung matrix generalized over an
  arbitrary record set and a declarative axis→field binding: enumerate candidate tuples per depth,
  count matching active records, derive live / noindex / redirect-stub decisions, and expose
  live children / siblings for internal-link grids. Pure — no I/O.
</purpose>
<non-goals>
  <item>Do not build URLs or blocks (the Blueprint provider does).</item>
  <item>Do not read content (the kernel command supplies records + universes).</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0192: initial axis-generic engine.</item>
</CHANGE_SUMMARY>
*/

import type {
  AxisTuple,
  EligibilityPolicy,
  IndexDecision,
  SurfaceAxis,
  SurfaceRecord,
} from "./types.ts";

/** Axis id → the record field carrying that axis's membership value(s). */
export type AxisFieldMap = Readonly<Record<string, string>>;

/** Pre-built index: axisId → value → Set<record index>. */
export interface RecordIndex {
  byAxisValue: ReadonlyMap<string, ReadonlyMap<string, ReadonlySet<number>>>;
  records: readonly SurfaceRecord[];
}

/** A single resolved combination at one depth. */
export interface MatrixEntry {
  depth: number;
  tuple: AxisTuple;
  recordCount: number;
  indexable: boolean;
  noindex: boolean;
  decision: IndexDecision;
}

export interface EligibilityMatrix {
  /** All emitted entries (live + shallow stubs), ordered by depth then enumeration order. */
  entries: MatrixEntry[];
  /** pathKey → entry, for ancestor/child/sibling lookups. */
  byKey: Map<string, MatrixEntry>;
  /** depth → set of live pathKeys. */
  liveKeysByDepth: Map<number, Set<string>>;
  axisOrder: readonly string[];
}

const DEFAULT_MAX_STUB_DEPTH = 1;

/** Lowercase, dash-only normalization. Throws on characters outside the policy pattern. */
export function normalizeSegment(value: string, pattern: RegExp): string {
  const trimmed = value.trim().toLowerCase().replace(/_/g, "-");
  if (!pattern.test(trimmed)) {
    throw new Error(`Invalid surface URL segment: "${value}" (normalized: "${trimmed}")`);
  }
  return trimmed;
}

/** True when `value` (string or array) includes the wanted axis value. */
function fieldIncludes(value: SurfaceRecord[string], wanted: string): boolean {
  if (Array.isArray(value)) return value.includes(wanted);
  return value === wanted;
}

/**
 * Axis-generic membership test: a record matches a partial tuple when, for every constrained axis,
 * the record's bound field carries the chosen value. An unconstrained axis imposes no filter.
 */
export function matchesRecord(
  record: SurfaceRecord,
  tuple: AxisTuple,
  axisFieldMap: AxisFieldMap,
): boolean {
  for (const [axisId, wanted] of Object.entries(tuple)) {
    if (wanted === undefined) continue;
    const field = axisFieldMap[axisId];
    if (!field) return false;
    if (!fieldIncludes(record[field], wanted)) return false;
  }
  return true;
}

/** Count active records matching the tuple. */
export function countMatching(
  records: readonly SurfaceRecord[],
  tuple: AxisTuple,
  axisFieldMap: AxisFieldMap,
): number {
  let count = 0;
  for (const record of records) {
    if (record.status === "archived") continue;
    if (matchesRecord(record, tuple, axisFieldMap)) count += 1;
  }
  return count;
}

/** Build a per-axis-value index so countMatching can run in intersection time instead of linear time. */
export function buildRecordIndex(
  records: readonly SurfaceRecord[],
  axisFieldMap: AxisFieldMap,
): RecordIndex {
  const byAxisValue = new Map<string, Map<string, Set<number>>>();
  for (let i = 0; i < records.length; i += 1) {
    const record = records[i];
    if (record.status === "archived") continue;
    for (const [axisId, field] of Object.entries(axisFieldMap)) {
      const value = record[field];
      if (value === undefined) continue;
      let axisMap = byAxisValue.get(axisId);
      if (!axisMap) {
        axisMap = new Map<string, Set<number>>();
        byAxisValue.set(axisId, axisMap);
      }
      if (Array.isArray(value)) {
        for (const v of value) {
          let set = axisMap.get(v);
          if (!set) {
            set = new Set<number>();
            axisMap.set(v, set);
          }
          set.add(i);
        }
      } else {
        let set = axisMap.get(value);
        if (!set) {
          set = new Set<number>();
          axisMap.set(value, set);
        }
        set.add(i);
      }
    }
  }
  // Freeze inner structures so callers cannot mutate them.
  const frozenByAxisValue = new Map<string, ReadonlyMap<string, ReadonlySet<number>>>();
  for (const [axisId, axisMap] of byAxisValue) {
    const frozenAxisMap = new Map<string, ReadonlySet<number>>();
    for (const [value, set] of axisMap) {
      frozenAxisMap.set(value, set);
    }
    frozenByAxisValue.set(axisId, frozenAxisMap);
  }
  return { byAxisValue: frozenByAxisValue, records };
}

/** O(k) count using the pre-built index, where k is the number of matching records. */
export function countMatchingIndexed(
  tuple: AxisTuple,
  axisFieldMap: AxisFieldMap,
  index: RecordIndex,
): number {
  let candidates: Set<number> | undefined;
  for (const [axisId, wanted] of Object.entries(tuple)) {
    if (wanted === undefined) continue;
    const field = axisFieldMap[axisId];
    if (!field) return 0;
    const axisMap = index.byAxisValue.get(axisId);
    if (!axisMap) return 0;
    const set = axisMap.get(wanted);
    if (!set) return 0;
    if (candidates === undefined) {
      candidates = new Set(set);
    } else {
      for (const idx of candidates) {
        if (!set.has(idx)) candidates.delete(idx);
      }
      if (candidates.size === 0) return 0;
    }
  }
  if (candidates === undefined) {
    // No axis constrained — count all active records.
    let count = 0;
    for (const record of index.records) {
      if (record.status !== "archived") count += 1;
    }
    return count;
  }
  let count = 0;
  for (const idx of candidates) {
    const record = index.records[idx];
    if (record && record.status !== "archived") count += 1;
  }
  return count;
}

/** Stable key for a (depth, tuple) pair. */
export function pathKey(depth: number, tuple: AxisTuple, axisOrder: readonly string[]): string {
  const parts: string[] = [String(depth)];
  for (let i = 0; i < depth; i += 1) {
    parts.push(tuple[axisOrder[i]!] ?? "");
  }
  return parts.join("|");
}

/** Enumerate every candidate tuple at `depth` (cartesian over the first `depth` axes' universes). */
export function* enumerateCandidateTuples(
  axes: readonly SurfaceAxis[],
  depth: number,
): Generator<AxisTuple> {
  if (depth === 0) {
    yield {};
    return;
  }
  const head = axes.slice(0, depth);
  const indices = new Array(depth).fill(0);
  const universes = head.map((axis) => axis.universe);
  // Guard against an empty universe producing an infinite/empty product.
  if (universes.some((u) => u.length === 0)) return;
  for (;;) {
    const tuple: AxisTuple = {};
    for (let i = 0; i < depth; i += 1) tuple[head[i]!.id] = universes[i]![indices[i]!];
    yield tuple;
    let carry = depth - 1;
    while (carry >= 0) {
      indices[carry] += 1;
      if (indices[carry] < universes[carry]!.length) break;
      indices[carry] = 0;
      carry -= 1;
    }
    if (carry < 0) break;
  }
}

function deriveDecision(
  depth: number,
  recordCount: number,
  policy: EligibilityPolicy,
  forceNonIndexable: boolean,
): IndexDecision {
  const min = policy.minRecordsPerDepth[depth] ?? 1;
  const recordGate = recordCount >= min;
  const noindexThreshold = policy.noindexBelowPerDepth[depth];
  const noindex = recordGate && noindexThreshold !== undefined && recordCount < noindexThreshold;
  if (recordGate && forceNonIndexable) {
    // RFC-0240: a depth gated behind the regional-hub-or-higher tier — the record gate passed but
    // the resolved entitlement tier has not unlocked this depth (e.g. d3 region hubs on the base tier).
    return { recordGate, indexable: false, noindex: true, reason: "regional-gated" };
  }
  return {
    recordGate,
    indexable: recordGate,
    noindex,
    ...(recordGate ? {} : { reason: "too-few-records" as const }),
  };
}

/**
 * Build the eligibility matrix. Shallow empty combinations (depth ≤ maxStubDepth) are emitted as
 * non-live stubs (for 301 redirects); deeper empty combinations are dropped so the build graph
 * stays bounded.
 */
export function buildEligibilityMatrix(
  axes: readonly SurfaceAxis[],
  axisFieldMap: AxisFieldMap,
  records: readonly SurfaceRecord[],
  policy: EligibilityPolicy,
  options?: {
    maxDepth?: number;
    maxStubDepth?: number;
    /** RFC-0240: depths forced non-indexable (dropped) unless the resolved entitlement tier unlocks them. */
    forceNonIndexableDepths?: readonly number[];
  },
): EligibilityMatrix {
  const axisOrder = axes.map((axis) => axis.id);
  const maxDepth = options?.maxDepth ?? axes.length;
  const maxStubDepth = options?.maxStubDepth ?? DEFAULT_MAX_STUB_DEPTH;
  const forceNonIndexableDepths = new Set(options?.forceNonIndexableDepths ?? []);

  const entries: MatrixEntry[] = [];
  const byKey = new Map<string, MatrixEntry>();
  const liveKeysByDepth = new Map<number, Set<string>>();
  const recordIndex = buildRecordIndex(records, axisFieldMap);

  for (let depth = 0; depth <= maxDepth; depth += 1) {
    const liveSet = new Set<string>();
    liveKeysByDepth.set(depth, liveSet);
    for (const tuple of enumerateCandidateTuples(axes, depth)) {
      const recordCount = countMatchingIndexed(tuple, axisFieldMap, recordIndex);
      const decision = deriveDecision(
        depth,
        recordCount,
        policy,
        forceNonIndexableDepths.has(depth),
      );
      if (!decision.indexable && depth > maxStubDepth) continue;
      const entry: MatrixEntry = {
        depth,
        tuple,
        recordCount,
        indexable: decision.indexable,
        noindex: decision.noindex,
        decision,
      };
      const key = pathKey(depth, tuple, axisOrder);
      entries.push(entry);
      byKey.set(key, entry);
      if (decision.indexable) liveSet.add(key);
    }
  }

  return { entries, byKey, liveKeysByDepth, axisOrder };
}

/** Walk shallower, dropping one axis at a time, to the nearest live ancestor (or root). */
export function nearestLiveAncestor(
  entry: MatrixEntry,
  matrix: EligibilityMatrix,
  policy: EligibilityPolicy,
): MatrixEntry | null {
  if (policy.redirectPolicy === "root") {
    return matrix.byKey.get(pathKey(0, {}, matrix.axisOrder)) ?? null;
  }
  for (let depth = entry.depth - 1; depth >= 0; depth -= 1) {
    const tuple: AxisTuple = {};
    for (let i = 0; i < depth; i += 1) {
      const axisId = matrix.axisOrder[i]!;
      if (entry.tuple[axisId] !== undefined) tuple[axisId] = entry.tuple[axisId];
    }
    const key = pathKey(depth, tuple, matrix.axisOrder);
    if (matrix.liveKeysByDepth.get(depth)?.has(key)) return matrix.byKey.get(key) ?? null;
  }
  return matrix.byKey.get(pathKey(0, {}, matrix.axisOrder)) ?? null;
}

/** Live entries one level deeper that extend the given parent tuple. */
export function liveChildrenOf(parent: MatrixEntry, matrix: EligibilityMatrix): MatrixEntry[] {
  const childDepth = parent.depth + 1;
  const liveKeys = matrix.liveKeysByDepth.get(childDepth);
  if (!liveKeys) return [];
  const results: MatrixEntry[] = [];
  for (const key of liveKeys) {
    const entry = matrix.byKey.get(key);
    if (!entry) continue;
    const matchesParent = matrix.axisOrder.slice(0, parent.depth).every((axisId) => {
      const pv = parent.tuple[axisId];
      return pv === undefined || pv === entry.tuple[axisId];
    });
    if (matchesParent) results.push(entry);
  }
  return results;
}

/** Live entries at the same depth sharing the same parent tuple. */
export function liveSiblingsOf(entry: MatrixEntry, matrix: EligibilityMatrix): MatrixEntry[] {
  if (entry.depth === 0) return [];
  const parentDepth = entry.depth - 1;
  const parentTuple: AxisTuple = {};
  for (let i = 0; i < parentDepth; i += 1) {
    const axisId = matrix.axisOrder[i]!;
    if (entry.tuple[axisId] !== undefined) parentTuple[axisId] = entry.tuple[axisId];
  }
  const parentEntry: MatrixEntry = {
    depth: parentDepth,
    tuple: parentTuple,
    recordCount: 0,
    indexable: true,
    noindex: false,
    decision: { recordGate: true, indexable: true, noindex: false },
  };
  return liveChildrenOf(parentEntry, matrix).filter(
    (sibling) =>
      pathKey(sibling.depth, sibling.tuple, matrix.axisOrder) !==
      pathKey(entry.depth, entry.tuple, matrix.axisOrder),
  );
}
