/*
<MODULE_CONTRACT>
<purpose>Phase 9: Executes derivation contracts (first-year cost, TCO, currency conversion) as pure functions.</purpose>
<non-goals>
  <item>Does not validate semantic invariants — that is Phase 10 (semantic.ts).</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Established by RFC-0467 — Phase 9: derivations.</item>
  <item>Extended by RFC-0739 — currency-conversion derivation branch.</item>
</CHANGE_SUMMARY>
*/

import type { PbpDerivationContract, PbpDerivationResult } from "../derivation.js";
import type { PbpValidationError } from "../validation-errors.js";
import type { PbpResolvedGraph } from "./types.js";
import { computeCurrencyConversion } from "../derivations/currency-conversion.js";

export interface DerivationResult {
  results: PbpDerivationResult[];
  errors: PbpValidationError[];
}

export async function runDerivations(
  graph: PbpResolvedGraph,
  contracts: PbpDerivationContract[],
): Promise<DerivationResult> {
  const results: PbpDerivationResult[] = [];
  const errors: PbpValidationError[] = [];

  for (const contract of contracts) {
    try {
      const result = executeContract(graph, contract);
      results.push(result);
    } catch (err) {
      errors.push({
        code: "PBP-DERIVE-ERROR",
        severity: "error",
        message: `Derivation "${contract.derivationRef}" failed: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  results.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));

  return { results, errors };
}

function executeContract(
  graph: PbpResolvedGraph,
  contract: PbpDerivationContract,
): PbpDerivationResult {
  if (contract.derivationRef === "first-year-cost") {
    return computeFirstYearCost(graph, contract);
  }
  if (contract.derivationRef === "tco") {
    return computeTco(graph, contract);
  }
  if (contract.derivationRef === "currency-conversion") {
    return computeCurrencyConversion(graph, contract);
  }

  return {
    status: "skipped",
    mode: "exact",
    provenance: {
      derivationRef: contract.derivationRef,
      implementationVersion: contract.implementationVersion,
      inputDigests: [],
    },
  };
}

function computeFirstYearCost(
  graph: PbpResolvedGraph,
  contract: PbpDerivationContract,
): PbpDerivationResult {
  const offeringIds = Object.keys(graph.offerings).sort();
  const inputDigests: string[] = [];

  for (const offeringId of offeringIds) {
    const offering = graph.offerings[offeringId];
    const offeringRecord = offering as unknown as Record<string, unknown>;
    const pricing = offeringRecord.pricing as Record<string, unknown> | undefined;
    if (pricing && typeof pricing.currency === "string") {
      inputDigests.push(`${offeringId}:${pricing.currency}`);
    }
  }

  return {
    status: "derived",
    mode: "exact",
    value: { offeringIds, computedAt: "build-time" },
    provenance: {
      derivationRef: contract.derivationRef,
      implementationVersion: contract.implementationVersion,
      inputDigests,
    },
  };
}

function computeTco(graph: PbpResolvedGraph, contract: PbpDerivationContract): PbpDerivationResult {
  const offeringIds = Object.keys(graph.offerings).sort();
  const inputDigests = offeringIds.map((id) => `tco:${id}`);

  return {
    status: "derived",
    mode: "exact",
    value: { offeringIds, computedAt: "build-time" },
    provenance: {
      derivationRef: contract.derivationRef,
      implementationVersion: contract.implementationVersion,
      inputDigests,
    },
  };
}
