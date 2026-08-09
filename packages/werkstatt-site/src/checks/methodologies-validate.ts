/*
<MODULE_CONTRACT>
<purpose>RFC-0665: validates the workshop-level methodologies config at systems/methodologies.md. Checks schema, known methodology IDs, instrument references, and gate config. Workspace-scoped command.</purpose>
<non-goals>
  <item>Does not execute methodologies — only validates the config file.</item>
  <item>Does not check external package availability.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0665: initial implementation of methodologies.validate command.</item>
</CHANGE_SUMMARY>
*/

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type {
  CheckResult,
  Diagnostic,
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/werkstatt/kernel";
import { diagnosticsResult } from "./result-helpers.ts";
import {
  METHODOLOGIES_CONFIG_PATH,
  KNOWN_METHODOLOGY_IDS,
  KNOWN_INSTRUMENT_TYPES,
  parseMethodologiesConfig,
  type MethodologiesConfig,
} from "./methodologies-config.ts";

export async function runMethodologiesValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const diagnostics: Diagnostic[] = [];
  const { workspaceRoot } = context;
  const configPath = join(workspaceRoot, METHODOLOGIES_CONFIG_PATH);

  if (!existsSync(configPath)) {
    diagnostics.push({
      ruleId: "METH-VAL-01",
      severity: "error",
      file: METHODOLOGIES_CONFIG_PATH,
      message: `Config file not found at ${METHODOLOGIES_CONFIG_PATH}. Create it with all 8 methodologies (visual-regression active: false by default).`,
      fixHint:
        "Create systems/methodologies.md with all 8 methodologies (visual-regression active: false by default).",
    });
    return diagnosticsResult("methodologies.validate", diagnostics);
  }

  let config: MethodologiesConfig;
  try {
    const content = readFileSync(configPath, "utf-8");
    config = parseMethodologiesConfig(content);
  } catch (err) {
    diagnostics.push({
      ruleId: "METH-VAL-02",
      severity: "error",
      file: METHODOLOGIES_CONFIG_PATH,
      message: `Config schema validation failed: ${err instanceof Error ? err.message : String(err)}`,
      fixHint:
        "Ensure instruments[], methodologies[], and gate sections are present with valid values.",
    });
    return diagnosticsResult("methodologies.validate", diagnostics);
  }

  const instrumentIds = new Set(config.instruments.map((i) => i.id));
  const knownMethodologyIdSet = new Set<string>(KNOWN_METHODOLOGY_IDS);
  const knownInstrumentTypeSet = new Set<string>(KNOWN_INSTRUMENT_TYPES);

  for (const instrument of config.instruments) {
    if (!knownInstrumentTypeSet.has(instrument.type)) {
      diagnostics.push({
        ruleId: "METH-VAL-04",
        severity: "error",
        file: METHODOLOGIES_CONFIG_PATH,
        message: `Unknown instrument type '${instrument.type}' for instrument '${instrument.id}'. Available: ${KNOWN_INSTRUMENT_TYPES.join(", ")}.`,
      });
    }
  }

  for (const methodology of config.methodologies) {
    if (!knownMethodologyIdSet.has(methodology.id)) {
      diagnostics.push({
        ruleId: "METH-VAL-03",
        severity: "error",
        file: METHODOLOGIES_CONFIG_PATH,
        message: `Unknown methodology id '${methodology.id}'. Available: ${KNOWN_METHODOLOGY_IDS.join(", ")}.`,
      });
    }

    if (!instrumentIds.has(methodology.instrument)) {
      diagnostics.push({
        ruleId: "METH-VAL-04",
        severity: "error",
        file: METHODOLOGIES_CONFIG_PATH,
        message: `Methodology '${methodology.id}' references unknown instrument '${methodology.instrument}'.`,
      });
    }
  }

  if (config.gate.aggregation !== "all-must-pass") {
    diagnostics.push({
      ruleId: "METH-VAL-02",
      severity: "error",
      file: METHODOLOGIES_CONFIG_PATH,
      message: `Gate aggregation must be 'all-must-pass' (got '${config.gate.aggregation}').`,
    });
  }

  if (diagnostics.length > 0) {
    return diagnosticsResult("methodologies.validate", diagnostics);
  }

  const activeCount = config.methodologies.filter((m) => m.active).length;

  const data: CheckResult = {
    command: "methodologies.validate",
    status: "pass",
    diagnostics: [],
    summary: {
      error: 0,
      warning: 0,
      info: 0,
    },
  };

  return {
    data,
    exitCode: 0,
    summary: `methodologies.validate: pass — ${config.instruments.length} instrument(s), ${config.methodologies.length} methodology(s), ${activeCount} active`,
  };
}
