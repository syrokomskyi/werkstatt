/*
<MODULE_CONTRACT>
<purpose>RFC-0684: validates the workshop-level suppression config at systems/axiom-suppressions.yaml. Checks schema, conflicting rules, broad patterns, and unknown rule IDs (from evidence). Workspace-scoped command.</purpose>
<performance>
  <item>collectKnownRuleIdsFromEvidence scans all mission evidence directories for study-run.json files. Cost is O(N) where N = number of missions with evidence. Each file is read and JSON-parsed once. Acceptable for workspace-scoped validation (typically fewer than 50 missions).</item>
</performance>
<non-goals>
  <item>Does not apply suppressions — only validates the config file.</item>
  <item>Does not check external package availability.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0684: initial implementation of suppressions.validate command.</item>
  <item>RFC-0688: add SUPPRESS-VAL-06 warning for rules using messagePattern/descriptionPattern without titlePattern. Add titlePattern to ruleSignature for conflict detection. Extend isBroadPattern check to titlePattern.</item>
</CHANGE_SUMMARY>
*/

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type {
  CheckResult,
  Diagnostic,
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";
import { diagnosticsResult } from "./result-helpers.ts";
import {
  WORKSHOP_SUPPRESSIONS_PATH,
  parseSuppressionsConfig,
  type SuppressionRule,
  type SuppressionsConfig,
} from "./suppressions-config.ts";

function ruleSignature(rule: SuppressionRule): string {
  return JSON.stringify({
    ruleId: rule.ruleId,
    channel: rule.channel,
    channelNot: rule.channelNot,
    contentType: rule.contentType,
    urlPattern: rule.urlPattern,
    titlePattern: rule.titlePattern,
    messagePattern: rule.messagePattern,
    descriptionPattern: rule.descriptionPattern,
  });
}

function isBroadPattern(pattern: string): boolean {
  const trimmed = pattern.trim();
  if (trimmed.length < 10) return true;
  const words = trimmed.split(/\s+/);
  if (words.length === 1) return true;
  return false;
}

function collectKnownRuleIdsFromEvidence(workspaceRoot: string): Set<string> | undefined {
  const missionsDir = join(workspaceRoot, "missions");
  if (!existsSync(missionsDir)) return undefined;

  const knownRuleIds = new Set<string>();
  let foundAnyEvidence = false;

  try {
    const missionDirs = readdirSync(missionsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);

    for (const missionDirName of missionDirs) {
      const evidenceDir = join(missionsDir, missionDirName, "evidence", "axiom");
      const studyRunPath = join(evidenceDir, "study-run.json");
      if (!existsSync(studyRunPath)) continue;

      try {
        const content = readFileSync(studyRunPath, "utf-8");
        const studyRun = JSON.parse(content) as { findings?: Array<{ ruleId?: string }> };
        if (studyRun.findings && Array.isArray(studyRun.findings)) {
          foundAnyEvidence = true;
          for (const f of studyRun.findings) {
            if (typeof f.ruleId === "string") {
              knownRuleIds.add(f.ruleId);
            }
          }
        }
      } catch {
        // Skip malformed evidence files
      }
    }
  } catch {
    // Ignore directory read errors
  }

  return foundAnyEvidence ? knownRuleIds : undefined;
}

export async function runSuppressionsValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const diagnostics: Diagnostic[] = [];
  const { workspaceRoot } = context;
  const configPath = join(workspaceRoot, WORKSHOP_SUPPRESSIONS_PATH);

  if (!existsSync(configPath)) {
    diagnostics.push({
      ruleId: "SUPPRESS-VAL-01",
      severity: "warning",
      file: WORKSHOP_SUPPRESSIONS_PATH,
      message: `Suppression config file not found at ${WORKSHOP_SUPPRESSIONS_PATH}. Suppressions are optional — create this file to define false-positive suppression rules.`,
      fixHint:
        "Create systems/axiom-suppressions.yaml with suppression rules for known false-positive categories.",
    });
    return diagnosticsResult("suppressions.validate", diagnostics);
  }

  let config: SuppressionsConfig;
  try {
    const content = readFileSync(configPath, "utf-8");
    config = parseSuppressionsConfig(content);
  } catch (err) {
    diagnostics.push({
      ruleId: "SUPPRESS-VAL-02",
      severity: "error",
      file: WORKSHOP_SUPPRESSIONS_PATH,
      message: `Config schema validation failed: ${err instanceof Error ? err.message : String(err)}`,
      fixHint:
        "Ensure suppressions[] array is present with valid rules. Each rule requires ruleId, category, and reason.",
    });
    return diagnosticsResult("suppressions.validate", diagnostics);
  }

  // Check for conflicting rules (same ruleId + same conditions)
  const seenSignatures = new Map<string, number>();
  for (let i = 0; i < config.suppressions.length; i++) {
    const rule = config.suppressions[i];
    const sig = ruleSignature(rule);
    if (seenSignatures.has(sig)) {
      diagnostics.push({
        ruleId: "SUPPRESS-VAL-03",
        severity: "error",
        file: WORKSHOP_SUPPRESSIONS_PATH,
        message: `Conflicting rule at index ${i}: duplicate of rule at index ${seenSignatures.get(
          sig,
        )}. Same ruleId + same conditions produces a no-op.`,
      });
    } else {
      seenSignatures.set(sig, i);
    }
  }

  // Warn on broad patterns
  for (let i = 0; i < config.suppressions.length; i++) {
    const rule = config.suppressions[i];
    if (rule.messagePattern && isBroadPattern(rule.messagePattern)) {
      diagnostics.push({
        ruleId: "SUPPRESS-VAL-04",
        severity: "warning",
        file: WORKSHOP_SUPPRESSIONS_PATH,
        message: `Rule at index ${i} (ruleId: ${rule.ruleId}) has a broad messagePattern: "${rule.messagePattern}". Broad patterns may suppress real findings. Use a more specific pattern.`,
      });
    }
    if (rule.descriptionPattern && isBroadPattern(rule.descriptionPattern)) {
      diagnostics.push({
        ruleId: "SUPPRESS-VAL-04",
        severity: "warning",
        file: WORKSHOP_SUPPRESSIONS_PATH,
        message: `Rule at index ${i} (ruleId: ${rule.ruleId}) has a broad descriptionPattern: "${rule.descriptionPattern}". Broad patterns may suppress real findings. Use a more specific pattern.`,
      });
    }
    if (rule.titlePattern && isBroadPattern(rule.titlePattern)) {
      diagnostics.push({
        ruleId: "SUPPRESS-VAL-04",
        severity: "warning",
        file: WORKSHOP_SUPPRESSIONS_PATH,
        message: `Rule at index ${i} (ruleId: ${rule.ruleId}) has a broad titlePattern: "${rule.titlePattern}". Broad patterns may suppress real findings. Use a more specific pattern.`,
      });
    }
  }

  // Warn on messagePattern/descriptionPattern without titlePattern (SUPPRESS-VAL-06)
  for (let i = 0; i < config.suppressions.length; i++) {
    const rule = config.suppressions[i];
    if ((rule.messagePattern || rule.descriptionPattern) && !rule.titlePattern) {
      const field = rule.messagePattern ? "messagePattern" : "descriptionPattern";
      diagnostics.push({
        ruleId: "SUPPRESS-VAL-06",
        severity: "warning",
        file: WORKSHOP_SUPPRESSIONS_PATH,
        message: `Rule at index ${i} (ruleId: ${rule.ruleId}) uses ${field} without titlePattern — ${field} matches against a non-existent Finding field and will never fire. Use titlePattern to match against finding.title.`,
        fixHint: `Replace ${field} with titlePattern, or add titlePattern as a fallback.`,
      });
    }
  }

  // Warn on unknown rule IDs (from evidence)
  const knownRuleIds = collectKnownRuleIdsFromEvidence(workspaceRoot);
  if (knownRuleIds !== undefined) {
    for (let i = 0; i < config.suppressions.length; i++) {
      const rule = config.suppressions[i];
      if (!knownRuleIds.has(rule.ruleId)) {
        diagnostics.push({
          ruleId: "SUPPRESS-VAL-05",
          severity: "warning",
          file: WORKSHOP_SUPPRESSIONS_PATH,
          message: `Rule at index ${i} references unknown ruleId: "${rule.ruleId}". This ruleId was not found in any study-run.json evidence. The rule may be stale or the Axiom rule may have been renamed.`,
        });
      }
    }
  }

  if (diagnostics.some((d) => d.severity === "error")) {
    return diagnosticsResult("suppressions.validate", diagnostics);
  }

  const data: CheckResult = {
    command: "suppressions.validate",
    status: diagnostics.length > 0 ? "warn" : "pass",
    diagnostics,
    summary: {
      error: diagnostics.filter((d) => d.severity === "error").length,
      warning: diagnostics.filter((d) => d.severity === "warning").length,
      info: diagnostics.filter((d) => d.severity === "info").length,
    },
  };

  const warningCount = data.summary.warning;
  return {
    data,
    exitCode: 0,
    summary: `suppressions.validate: ${data.status} — ${config.suppressions.length} rule(s), ${warningCount} warning(s)`,
  };
}
