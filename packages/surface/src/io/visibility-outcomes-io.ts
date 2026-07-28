/*
<MODULE_CONTRACT>
<purpose>
  RFC-0473: I/O helper for reading PSEO visibility outcomes from a Sternsystem's
  generated outcomes file. Extracted from site-kernel-checks so bordbuch.generate
  in site-kernel-handoff can read visibility outcomes without depending on site-kernel-checks.
</purpose>
<non-goals>
  <item>Do not write outcomes — that lives in site-kernel-checks visibility commands.</item>
  <item>Do not interpret outcomes or propose cluster actions.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0473: extract readVisibilityOutcomes from site-kernel-checks for cross-package reuse.</item>
</CHANGE_SUMMARY>
*/

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parse as yamlParse } from "yaml";
import type { ClusterOutcome } from "../visibility.ts";

export interface OutcomesPayload {
  generatedAt: string | null;
  policy: {
    observationWindowDays: number;
    expand: { indexationRateMin: number; medianImpressionsMin: number };
    prune: { afterWindows: number; impressionsMax: number };
    enrich: { requirePositiveDemand: boolean };
  };
  outcomes: ClusterOutcome[];
  demandCorrections: Array<{
    clusterId: string;
    realizedImpressions: number;
    demandVolume: number;
  }>;
}

const OUTCOMES_FILE = "src/surface/visibility/outcomes.generated.yaml";

export async function readVisibilityOutcomes(appDir: string): Promise<OutcomesPayload | null> {
  const path = join(appDir, OUTCOMES_FILE);
  if (!existsSync(path)) return null;
  return yamlParse(await readFile(path, "utf8")) as OutcomesPayload;
}
