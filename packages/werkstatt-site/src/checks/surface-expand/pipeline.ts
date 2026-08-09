/*
<MODULE_CONTRACT>
<purpose>
  Architecture review 2026-07-10: pure pipeline stages for expandBlueprint. Each stage is a pure
  function that takes typed inputs and returns typed outputs — no I/O, no filesystem, no network.
  The orchestrator (expand.ts) loads data, calls these stages in order, and applies the results.
  This makes each stage independently testable with in-memory data.
</purpose>
<non-goals>
  <item>Do not perform I/O — all data is supplied by the caller.</item>
  <item>Do not return new arrays from in-place mutation stages — gate stages mutate entries directly for performance; only dedupByPageId and applyExistenceGates return new arrays.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Architecture review 2026-07-10: initial extraction of pure pipeline stages.</item>
  <item>Architecture review 2026-07-10 (wg-fix): fix MODULE_CONTRACT to reflect in-place mutation; remove dead ExistenceGateCtx and unused BakeCtx import; make applyExistenceGates generic to eliminate double-cast.</item>
  <item>RFC-0497: add applyIntersectionGate — drops depth-5 entries without approved intersection records.</item>
</CHANGE_SUMMARY>
*/

import {
  buildAxisFieldMap,
  buildTokenDocFreq,
  composeIndexDecision,
  evaluateBudgetGate,
  evaluateDemandGate,
  evaluateEvidenceGate,
  evaluateFreshnessGate,
  evaluateSubstanceGate,
  scoreSubstance,
  type Blueprint,
  type GateResult,
  type IndexDecision,
  type PageEntry,
  type SurfaceNarrative,
  type SurfaceRecord,
  type VirtualRouteEntry,
} from "@warpgogol/surface";
import { toKebabCase } from "@warpgogol/share/string-utils";
import { heroSignature } from "./bake.ts";
import { matchingRecordsForEntry, hasEvidenceValue, ageDays } from "./expand-helpers.ts";

/** Dedup entries by pageId, keeping the first occurrence. Pure. */
export function dedupByPageId(entries: readonly VirtualRouteEntry[]): VirtualRouteEntry[] {
  const seen = new Set<string>();
  return entries.filter((e) => {
    if (seen.has(e.pageId)) return false;
    seen.add(e.pageId);
    return true;
  });
}

/**
 * Apply demand and Werk evidence existence gates. Entries that fail a "do-not-emit" gate are
 * dropped; entries that fail a "noindex" gate are marked noindex. Pure (no I/O).
 */
export function applyExistenceGates<
  TSignal,
  TWork,
  TDemandPolicy extends { missing?: "noindex" | "do-not-emit" },
  TEvidencePolicy extends { existenceSource?: string; minWerkEvidence?: number },
>(
  entries: readonly VirtualRouteEntry[],
  qualifyingDemand: (
    signals: readonly TSignal[],
    entry: VirtualRouteEntry,
    policy: TDemandPolicy,
  ) => Array<unknown>,
  qualifyingWorks: (works: readonly TWork[], entry: VirtualRouteEntry) => Array<unknown>,
  demandPolicies: Readonly<Record<number, TDemandPolicy>>,
  evidencePolicies: Readonly<Record<number, TEvidencePolicy>>,
  demandSignals: readonly TSignal[],
  works: readonly TWork[],
): VirtualRouteEntry[] {
  const hasDemandPolicies = Object.keys(demandPolicies).length > 0;
  const hasEvidencePolicies = Object.values(evidencePolicies).some(
    (p) => p.existenceSource === "works",
  );
  if (!hasDemandPolicies && !hasEvidencePolicies) return [...entries];

  const retained: VirtualRouteEntry[] = [];
  for (const entry of entries) {
    if (!entry.indexable) {
      retained.push(entry);
      continue;
    }
    const gateResults: GateResult[] = [];
    const demandPolicy = demandPolicies[entry.depth];
    if (demandPolicy) {
      const matching = qualifyingDemand(demandSignals, entry, demandPolicy);
      gateResults.push(evaluateDemandGate(matching.length > 0, demandPolicy.missing ?? "noindex"));
    }
    const evidencePolicy = evidencePolicies[entry.depth];
    const minWerk = evidencePolicy?.minWerkEvidence;
    if (evidencePolicy?.existenceSource === "works" || typeof minWerk === "number") {
      const matchingWorks = qualifyingWorks(works, entry);
      gateResults.push(
        evaluateEvidenceGate(
          matchingWorks.length,
          minWerk,
          evidencePolicy?.existenceSource === "works" ? "works" : undefined,
        ),
      );
    }
    if (gateResults.length > 0) {
      const base: IndexDecision = entry.decision ?? {
        recordGate: true,
        indexable: true,
        noindex: entry.noindex,
      };
      const { decision, suppress } = composeIndexDecision(base, gateResults);
      entry.decision = decision;
      if (suppress) continue;
      entry.noindex = decision.noindex;
    }
    retained.push(entry);
  }
  return retained;
}

/** RFC-0497: Intersection record shape for the gate check. */
export interface IntersectionRecord {
  intersectionId: string;
  industryId: string;
  cityId: string;
  serviceId: string;
  publicationDecision: "approved" | "rejected" | "pending";
}

/**
 * RFC-0497: Apply the intersection gate. Drops depth-5 entries that do not have a matching
 * intersection record with `publicationDecision: "approved"`. The gate is configured per-level
 * via `BlueprintLevel.intersection`. Entries at other depths are unaffected. Pure (no I/O).
 */
export function applyIntersectionGate(
  entries: readonly VirtualRouteEntry[],
  intersections: readonly IntersectionRecord[],
  intersectionDepth: number,
): VirtualRouteEntry[] {
  if (intersections.length === 0) {
    return entries.filter((e) => e.depth !== intersectionDepth);
  }

  const approvedKeys = new Set<string>();
  for (const rec of intersections) {
    if (rec.publicationDecision === "approved") {
      approvedKeys.add(`${rec.industryId}::${rec.cityId}::${rec.serviceId}`);
    }
  }

  return entries.filter((entry) => {
    if (entry.depth !== intersectionDepth) return true;
    const industry = entry.axes.industry;
    const city = entry.axes.city;
    const demand = entry.axes.demand;
    if (!industry || !city || !demand) return false;
    return approvedKeys.has(`${industry}::${city}::${demand}`);
  });
}

/** Apply the substance gate to all baked entries. Pure. */
export function applySubstanceGate(entries: VirtualRouteEntry[], blueprint: Blueprint): void {
  const defaultSubstanceMin = blueprint.policy.substanceMin ?? 0;
  const bakedPages = entries.map((e) => e.page).filter((p): p is PageEntry => Boolean(p));
  if (bakedPages.length === 0) return;
  const docFreq = buildTokenDocFreq(bakedPages);
  for (const entry of entries) {
    if (!entry.page) continue;
    const substanceMin =
      blueprint.policy.substanceMinPerDepth?.[entry.depth] ?? defaultSubstanceMin;
    const score = scoreSubstance(entry.page, { docFreq, totalPages: bakedPages.length });
    const base: IndexDecision = entry.decision ?? {
      recordGate: true,
      indexable: true,
      noindex: entry.noindex,
    };
    const { decision } = composeIndexDecision(base, [
      evaluateSubstanceGate(score.value, substanceMin),
    ]);
    entry.decision = decision;
    entry.noindex = decision.noindex;
  }
}

/** Apply evidence gates (approved narrative, required record fields, tuple-specific facts). Pure. */
export function applyEvidenceGates(
  entries: VirtualRouteEntry[],
  blueprint: Blueprint,
  records: readonly SurfaceRecord[],
  narratives: ReadonlyMap<string, SurfaceNarrative>,
  defaultLang: string,
): void {
  const evidenceAxisFieldMap = buildAxisFieldMap(blueprint);
  for (const entry of entries) {
    if (!entry.indexable) continue;
    const evidencePolicy = blueprint.policy.evidencePerDepth?.[entry.depth];
    if (!evidencePolicy) continue;
    const matching = matchingRecordsForEntry(records, entry, evidenceAxisFieldMap);
    const missing: string[] = [];
    if (
      evidencePolicy.approvedNarrative === "required" &&
      !narratives.has(`${defaultLang}|${entry.pageId}`)
    ) {
      missing.push("approvedNarrative");
    }
    for (const field of evidencePolicy.requiredRecordFields ?? []) {
      if (!matching.some((record) => hasEvidenceValue(record[field]))) missing.push(field);
    }
    const factCount = new Set(
      (evidencePolicy.requiredRecordFields ?? [])
        .flatMap((field) => matching.map((record) => record[field]))
        .flatMap((value) => (Array.isArray(value) ? value : [value]))
        .filter(hasEvidenceValue)
        .map(String),
    ).size;
    if (
      typeof evidencePolicy.minTupleSpecificFacts === "number" &&
      factCount < evidencePolicy.minTupleSpecificFacts
    ) {
      missing.push(`tupleSpecificFacts:${factCount}/${evidencePolicy.minTupleSpecificFacts}`);
    }
    const evidencePassed = missing.length === 0;
    const evidenceResult: GateResult = evidencePassed
      ? { gate: "evidence", pass: true, noindex: false }
      : { gate: "evidence", pass: false, reason: "missing-evidence", noindex: true };
    const base: IndexDecision = entry.decision ?? {
      recordGate: true,
      indexable: true,
      noindex: entry.noindex,
    };
    const { decision } = composeIndexDecision(base, [evidenceResult]);
    entry.decision = decision;
    entry.noindex = decision.noindex;
  }
}

/** Apply the freshness (decay) gate. Pure. */
export function applyFreshnessGate(
  entries: VirtualRouteEntry[],
  blueprint: Blueprint,
  records: readonly SurfaceRecord[],
): void {
  if (!blueprint.freshness) return;
  const axisFieldMap = buildAxisFieldMap(blueprint);
  const field = blueprint.freshness.field;
  const now = Date.now();
  for (const entry of entries) {
    if (!entry.indexable) continue;
    const sla = blueprint.freshness.slaDaysPerDepth[entry.depth];
    if (sla === undefined) continue;
    const matching = matchingRecordsForEntry(records, entry, axisFieldMap);
    const rawAges = matching.map((r) =>
      typeof r[field] === "string" ? ageDays(r[field] as string, now) : null,
    );
    const hasInvalidDate = rawAges.some((age) => age === null);
    const ages = rawAges.filter((a): a is number => a !== null);
    if (hasInvalidDate) {
      const base: IndexDecision = entry.decision ?? {
        recordGate: true,
        indexable: true,
        noindex: entry.noindex,
      };
      const { decision } = composeIndexDecision(base, [evaluateFreshnessGate(false, true)]);
      entry.decision = decision;
      entry.noindex = decision.noindex;
      continue;
    }
    if (ages.length === 0) continue;
    const mode = blueprint.freshness.mode ?? "any";
    const sorted = [...ages].sort((a, b) => a - b);
    const effectiveAge =
      mode === "all"
        ? sorted[0]!
        : mode === "median"
          ? sorted[Math.floor(sorted.length / 2)]!
          : sorted[sorted.length - 1]!;
    const base: IndexDecision = entry.decision ?? {
      recordGate: true,
      indexable: true,
      noindex: entry.noindex,
    };
    const { decision } = composeIndexDecision(base, [
      evaluateFreshnessGate(effectiveAge <= sla, false),
    ]);
    entry.decision = decision;
    entry.noindex = decision.noindex;
  }
}

/** Apply the index budget gate (top-K by substance score). Pure. */
export function applyBudgetGate(
  entries: VirtualRouteEntry[],
  indexBudget: number | undefined,
): void {
  if (typeof indexBudget !== "number" || indexBudget < 0) return;
  const live = entries
    .filter((e) => e.indexable && !e.noindex)
    .sort((a, b) => (b.decision?.substanceScore ?? 0) - (a.decision?.substanceScore ?? 0));
  for (let i = indexBudget; i < live.length; i += 1) {
    const entry = live[i]!;
    const base: IndexDecision = entry.decision ?? {
      recordGate: true,
      indexable: true,
      noindex: entry.noindex,
    };
    const { decision } = composeIndexDecision(base, [evaluateBudgetGate(false)]);
    entry.decision = decision;
    entry.noindex = decision.noindex;
  }
  for (let i = 0; i < Math.min(indexBudget, live.length); i += 1) {
    const d = live[i]!.decision;
    if (d) d.withinBudget = true;
  }
}

/** Apply the untranslated-language gate. Pure. */
export function applyUntranslatedGate(
  entries: VirtualRouteEntry[],
  defaultLang: string,
  genLangs: readonly string[],
): void {
  for (const entry of entries) {
    if (!entry.pages) continue;
    const defPage = entry.pages[defaultLang];
    if (!defPage) continue;
    const defSig = heroSignature(defPage);
    const dropped: string[] = [];
    for (const l of genLangs) {
      if (l === defaultLang) continue;
      const page = entry.pages[l];
      if (!page) continue;
      if (heroSignature(page) === defSig) {
        delete entry.pages[l];
        delete entry.routes[l];
        dropped.push(l);
      }
    }
    if (dropped.length) entry.untranslatedLangs = dropped;
  }
}

/** Insert approved string-enriched fields as content blocks. Pure (but reads from enrichedByLang). */
export function insertStringEnrichedFields(
  entries: VirtualRouteEntry[],
  blueprint: Blueprint,
  enrichedByLang: ReadonlyMap<string, ReadonlyMap<string, string>>,
  genLangs: readonly string[],
  defaultLang: string,
  marketSignalHeading: Readonly<Record<string, string>>,
): void {
  const stringEnrichedFields = (blueprint.enrichedFields ?? []).filter(
    (f) => f.kind !== "narrative",
  );
  if (stringEnrichedFields.length === 0) return;
  for (const entry of entries) {
    if (!entry.pages) continue;
    for (const l of Object.keys(entry.pages)) {
      const page = entry.pages[l];
      if (!page) continue;
      const bulk = enrichedByLang.get(l);
      if (!bulk) continue;
      for (const field of stringEnrichedFields) {
        if (field.scopeDepth !== entry.depth) continue;
        const key = `${toKebabCase(entry.pageId)}-${toKebabCase(field.field)}`;
        const value = bulk.get(key);
        if (value) {
          const blocks = page.blocks as Array<{ type: string; props: Record<string, unknown> }>;
          blocks.splice(Math.max(0, blocks.length - 1), 0, {
            type: "markdown",
            props: {
              heading: marketSignalHeading[l] ?? marketSignalHeading[defaultLang]!,
              lead: value,
            },
          });
        }
      }
    }
    entry.page = entry.pages[defaultLang];
  }
}
