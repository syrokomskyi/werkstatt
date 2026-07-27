import { parse as yamlParse } from "yaml";
/*
<MODULE_CONTRACT>
<purpose>Maintains packages/os/site-kernel-checks/src/pseo-proof.ts as an authored site-kernel-checks authored module so agents can evolve it without rediscovering local boundaries.</purpose>
<non-goals>
  <item>Do not infer rankings, leads, or indexation from missing observability data.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0280: demand-map proof gate reads real generated signal data.</item>
</CHANGE_SUMMARY>
*/

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  CheckResult,
  Diagnostic,
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@gogol/site-kernel";
import { diagnosticsResult } from "../result-helpers.ts";

const DEMAND_MAP_FILE = "src/surface/demand-map.generated.yaml";
const EVIDENCE_JOIN_FILE = "src/surface/evidence-join.generated.yaml";
const VISIBILITY_OUTCOMES_FILE = "src/surface/visibility/outcomes.generated.yaml";

interface GeneratedRows {
  rows?: unknown[];
  outcomes?: unknown[];
  generatedAt?: string | null;
  blueprint?: string;
}

async function readRows(appDir: string, file: string): Promise<GeneratedRows | null> {
  const path = join(appDir, file);
  if (!existsSync(path)) return null;
  return yamlParse(await readFile(path, "utf8")) as GeneratedRows;
}

function validGeneratedAt(value: unknown): boolean {
  if (value === null) return true;
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

export async function runPseoProofValidate(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const app = context.site;
  if (!app) return { exitCode: 1, summary: "pseo.proof.validate must run inside an app context." };
  const blueprint = typeof input.flags.blueprint === "string" ? input.flags.blueprint : undefined;
  const diagnostics: Diagnostic[] = [];
  const demandMap = await readRows(app.directory, DEMAND_MAP_FILE);
  const evidenceJoin = await readRows(app.directory, EVIDENCE_JOIN_FILE);
  const visibilityOutcomes = await readRows(app.directory, VISIBILITY_OUTCOMES_FILE);

  if (!demandMap) {
    diagnostics.push({
      ruleId: "PSEO-PROOF-01",
      severity: "warning",
      file: DEMAND_MAP_FILE,
      message: "Demand-map proof input is missing; proof status is not enough data.",
    });
  } else if (!validGeneratedAt(demandMap.generatedAt)) {
    diagnostics.push({
      ruleId: "PSEO-PROOF-02",
      severity: "error",
      file: DEMAND_MAP_FILE,
      message: "Demand-map proof input has invalid generatedAt metadata.",
    });
  } else if ((demandMap.rows ?? []).length === 0) {
    diagnostics.push({
      ruleId: "PSEO-PROOF-01",
      severity: "warning",
      file: DEMAND_MAP_FILE,
      message:
        "Demand-map proof input contains no mapped demand rows; proof status is not enough data.",
    });
  }

  if (!evidenceJoin) {
    diagnostics.push({
      ruleId: "PSEO-PROOF-03",
      severity: "warning",
      file: EVIDENCE_JOIN_FILE,
      message: "Evidence-join proof input is missing; proof status is not enough data.",
    });
  } else if (!validGeneratedAt(evidenceJoin.generatedAt)) {
    diagnostics.push({
      ruleId: "PSEO-PROOF-04",
      severity: "error",
      file: EVIDENCE_JOIN_FILE,
      message: "Evidence-join proof input has invalid generatedAt metadata.",
    });
  } else if ((evidenceJoin.rows ?? []).length === 0) {
    diagnostics.push({
      ruleId: "PSEO-PROOF-03",
      severity: "warning",
      file: EVIDENCE_JOIN_FILE,
      message:
        "Evidence-join proof input contains no joined Werk rows; proof status is not enough data.",
    });
  }

  if (
    blueprint &&
    demandMap?.blueprint &&
    demandMap.blueprint !== blueprint &&
    demandMap.blueprint !== "all"
  ) {
    diagnostics.push({
      ruleId: "PSEO-PROOF-02",
      severity: "error",
      file: DEMAND_MAP_FILE,
      message: `Demand-map proof input belongs to blueprint "${demandMap.blueprint}", expected "${blueprint}".`,
    });
  }
  if (
    blueprint &&
    evidenceJoin?.blueprint &&
    evidenceJoin.blueprint !== blueprint &&
    evidenceJoin.blueprint !== "all"
  ) {
    diagnostics.push({
      ruleId: "PSEO-PROOF-04",
      severity: "error",
      file: EVIDENCE_JOIN_FILE,
      message: `Evidence-join proof input belongs to blueprint "${evidenceJoin.blueprint}", expected "${blueprint}".`,
    });
  }

  if (!visibilityOutcomes) {
    diagnostics.push({
      ruleId: "PSEO-PROOF-05",
      severity: "warning",
      file: VISIBILITY_OUTCOMES_FILE,
      message: "Visibility outcome proof input is missing; proof status is not enough data.",
    });
  } else if (!validGeneratedAt(visibilityOutcomes.generatedAt)) {
    diagnostics.push({
      ruleId: "PSEO-PROOF-05",
      severity: "error",
      file: VISIBILITY_OUTCOMES_FILE,
      message: "Visibility outcome proof input has invalid generatedAt metadata.",
    });
  } else if ((visibilityOutcomes.outcomes ?? []).length === 0) {
    diagnostics.push({
      ruleId: "PSEO-PROOF-05",
      severity: "warning",
      file: VISIBILITY_OUTCOMES_FILE,
      message:
        "Visibility outcome proof input contains no cluster outcomes; proof status is not enough data.",
    });
  }

  return diagnosticsResult("pseo.proof.validate", diagnostics);
}
