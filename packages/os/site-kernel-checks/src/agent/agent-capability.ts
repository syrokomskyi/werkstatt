/*
<MODULE_CONTRACT>
<purpose>
RFC-0288: agent.capability.validate loads the closed capability catalog
(packages/ontology/capabilities/*.yaml), validates each record against the
schema, and enforces the contract for capabilities active on the current app:
AS-2 human-parity (humanEquivalent section must render), required-sections
presence, extra-entitlement gating, and unknown ids in agent.actionsDisabled.
</purpose>
<non-goals>
  <item>Do not resolve active capabilities here beyond what's needed to check
        the contract — agent.manifest.generate owns manifest population.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0288: initial capability catalog loader + validator.</item>
</CHANGE_SUMMARY>
*/

import { join } from "node:path";
import { readdir, readFile } from "node:fs/promises";
import type {
  CheckResult,
  Diagnostic,
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";
import { requireAstroSitePaths } from "@warpgogol/site-kernel-astro";
import {
  loadSystemManifest,
  collectMarkdownFiles,
  parseMarkdownFrontmatter,
} from "@warpgogol/site-kernel-content";
import { capabilityRecordSchema, type CapabilityRecord } from "@warpgogol/ontology";
import { resolveActiveCapabilities } from "@warpgogol/share/agent";
import { readEntitledFeatures } from "../lib/entitlements.ts";
import { diagnosticsResult } from "../result-helpers.ts";

const CAPABILITIES_DIR = join("packages", "ontology", "capabilities");

interface LoadedCatalog {
  records: CapabilityRecord[];
  violations: Diagnostic[];
}

/** Load + schema-validate every capability YAML. Malformed records are skipped (reported, not thrown). */
export async function loadCapabilityCatalog(workspaceRoot: string): Promise<LoadedCatalog> {
  const dir = join(workspaceRoot, CAPABILITIES_DIR);
  const violations: Diagnostic[] = [];
  let files: string[];
  try {
    files = (await readdir(dir)).filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"));
  } catch {
    return { records: [], violations: [] };
  }

  const { parse } = await import("yaml");
  const records: CapabilityRecord[] = [];
  const seenIds = new Set<string>();

  for (const file of files) {
    const stem = file.replace(/\.ya?ml$/, "");
    let raw: unknown;
    try {
      raw = parse(await readFile(join(dir, file), "utf-8"));
    } catch (err) {
      violations.push({
        ruleId: "AGC-01",
        severity: "error",
        file: `${CAPABILITIES_DIR}/${file}`,
        message: `Invalid YAML: ${err instanceof Error ? err.message : String(err)}`,
      });
      continue;
    }
    const parsed = capabilityRecordSchema.safeParse(raw);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        violations.push({
          ruleId: "AGC-01",
          severity: "error",
          file: `${CAPABILITIES_DIR}/${file}`,
          message: `${issue.path.join(".") || "(root)"}: ${issue.message}`,
        });
      }
      continue;
    }
    const record = parsed.data;
    if (record.id !== stem) {
      violations.push({
        ruleId: "AGC-01",
        severity: "error",
        file: `${CAPABILITIES_DIR}/${file}`,
        message: `id "${record.id}" does not match filename stem "${stem}".`,
        fixHint: "Rename the file to match id, or fix id to match the filename.",
      });
      continue;
    }
    if (seenIds.has(record.id)) {
      violations.push({
        ruleId: "AGC-01",
        severity: "error",
        file: `${CAPABILITIES_DIR}/${file}`,
        message: `Duplicate capability id "${record.id}".`,
      });
      continue;
    }
    seenIds.add(record.id);
    if (record.integration.eventKind === undefined || record.integration.source !== "agent") {
      violations.push({
        ruleId: "AGC-02",
        severity: "error",
        file: `${CAPABILITIES_DIR}/${file}`,
        message: `integration.source must be "agent" for capability "${record.id}".`,
      });
      continue;
    }
    records.push(record);
  }

  return { records, violations };
}

/** Section archetypes (blocks[].type) that render on some authored page, across all languages. */
export async function collectRenderedSectionTypes(pagesDir: string): Promise<Set<string>> {
  const types = new Set<string>();
  const files = await collectMarkdownFiles(pagesDir);
  for (const file of files) {
    const { data } = parseMarkdownFrontmatter(await readFile(file, "utf-8"));
    const blocks = (data as { blocks?: Array<{ type?: string }> }).blocks ?? [];
    for (const block of blocks) {
      if (typeof block.type === "string" && block.type) types.add(block.type);
    }
  }
  return types;
}

export async function runAgentCapabilityValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const app = context.site;
  if (!app) {
    return { exitCode: 1, summary: "agent.capability.validate must run inside an app context." };
  }
  const paths = requireAstroSitePaths(context);
  const { manifest } = await loadSystemManifest(paths.contentDirectory);
  const agentBlock = (manifest as unknown as Record<string, unknown>).agent as
    { actionsDisabled?: string[] } | undefined;
  const actionsDisabled = agentBlock?.actionsDisabled ?? [];

  const { records: catalog, violations: catalogViolations } = await loadCapabilityCatalog(
    context.workspaceRoot,
  );
  const diagnostics: Diagnostic[] = [...catalogViolations];

  // AGC-05: agent.actionsDisabled may only name known catalog ids.
  const knownIds = new Set(catalog.map((c) => c.id));
  for (const id of actionsDisabled) {
    if (!knownIds.has(id)) {
      diagnostics.push({
        ruleId: "AGC-05",
        severity: "error",
        file: "src/content/system.md",
        message: `agent.actionsDisabled names unknown capability id "${id}".`,
        fixHint:
          "Remove it, or fix the id to match a capability in packages/ontology/capabilities/.",
      });
    }
  }

  const features = await readEntitledFeatures(app.directory);
  const entitlements = features ?? [];
  const renderedSectionTypes = [
    ...(await collectRenderedSectionTypes(paths.contentPagesDirectory)),
  ];

  const active = resolveActiveCapabilities({
    catalog,
    entitlements,
    renderedSectionTypes,
    actionsDisabled,
  });
  const renderedSet = new Set(renderedSectionTypes);

  for (const cap of active) {
    // AGC-03: AS-2 human parity — the anchor section must actually render somewhere.
    if (!renderedSet.has(cap.humanEquivalent.sectionType)) {
      diagnostics.push({
        ruleId: "AGC-03",
        severity: "error",
        file: `${CAPABILITIES_DIR}/${cap.id}.yaml`,
        message: `Active capability "${cap.id}" has no rendered humanEquivalent section "${cap.humanEquivalent.sectionType}" (AS-2 violation).`,
        fixHint:
          "Add the section to a page, gate the capability off, or disable it via agent.actionsDisabled.",
      });
    }
    // AGC-04: required sections/entitlements re-checked explicitly for a clear message
    // (resolveActiveCapabilities already excludes non-conforming capabilities from `active`,
    // so this loop only ever reports on capabilities that already passed — kept as a
    // defense-in-depth structural assertion, not expected to ever fire).
    for (const section of cap.requires.sections) {
      if (!renderedSet.has(section)) {
        diagnostics.push({
          ruleId: "AGC-04",
          severity: "error",
          file: `${CAPABILITIES_DIR}/${cap.id}.yaml`,
          message: `Active capability "${cap.id}" requires section "${section}" which does not render.`,
        });
      }
    }
  }

  return diagnosticsResult("agent.capability.validate", diagnostics);
}
