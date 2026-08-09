/*
<MODULE_CONTRACT>
<purpose>
  Pillar registry — maps each pillar key to its derive function and weight.
  Extracted from compute.ts so pillar logic is extensible via a registry
  instead of a hardcoded switch.
</purpose>
<non-goals>
  <item>Do not compute the composite score — that stays in compute.ts.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Architecture review 2026-07-14: extract pillar registry from compute.ts.</item>
</CHANGE_SUMMARY>
*/

import type { NebulaInputs, NebulaPillarScore } from "./types.ts";
import type { NebulaWeightKey } from "./weights.ts";
import { NEBULA_WEIGHTS } from "./weights.ts";
import {
  derivePerformanceScore,
  deriveAccessibilityScore,
  deriveContentHealthScore,
  deriveArchitecturalComplianceScore,
} from "./compute.ts";

export interface PillarEntry {
  readonly key: NebulaWeightKey;
  readonly weight: number;
  derive(inputs: NebulaInputs): number;
}

export const PILLAR_REGISTRY: readonly PillarEntry[] = [
  {
    key: "performance",
    weight: NEBULA_WEIGHTS.performance,
    derive: (inputs) => derivePerformanceScore(inputs.lighthouse),
  },
  {
    key: "accessibility",
    weight: NEBULA_WEIGHTS.accessibility,
    derive: (inputs) => deriveAccessibilityScore(inputs.lighthouse, inputs.axe),
  },
  {
    key: "contentHealth",
    weight: NEBULA_WEIGHTS.contentHealth,
    derive: (inputs) => deriveContentHealthScore(inputs.contentChecks),
  },
  {
    key: "architecturalCompliance",
    weight: NEBULA_WEIGHTS.architecturalCompliance,
    derive: (inputs) => deriveArchitecturalComplianceScore(inputs.dnaChecks),
  },
];

export function computePillarScores(
  inputs: NebulaInputs,
): Record<NebulaWeightKey, NebulaPillarScore> {
  const pillars = {} as Record<NebulaWeightKey, NebulaPillarScore>;
  for (const entry of PILLAR_REGISTRY) {
    const score = entry.derive(inputs);
    const contribution = score * entry.weight;
    pillars[entry.key] = {
      score,
      weight: entry.weight,
      contribution: Math.round(contribution * 100) / 100,
    };
  }
  return pillars;
}
