/*
<MODULE_CONTRACT>
<purpose>Implements RFC-0468 pbp.migration.validate for owner-decision-register.yaml
and migration-coverage-report.yaml structure and coverage validation.</purpose>
<non-goals>
  <item>Do not validate concrete site-specific values (item counts, topic names) — only structural invariants.</item>
  <item>Do not mutate content files.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>ADR-0032: Moved RFC-0468 validation from packages/pbp unit test to site-kernel-checks validator.</item>
</CHANGE_SUMMARY>
*/

import { readFile, access } from "node:fs/promises";
import { join } from "node:path";
import { parseMarkdownFrontmatter } from "@warpgogol/werkstatt-site/content";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/werkstatt/kernel";
import { passResult, failResult } from "./result-helpers.ts";
import { getContentDisciplinePaths } from "./content-discipline.ts";

async function readYaml(filePath: string): Promise<Record<string, unknown>> {
  const raw = await readFile(filePath, "utf-8");
  const wrapped = `---\n${raw}\n---\n`;
  return parseMarkdownFrontmatter(wrapped).data;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function runPbpMigrationValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const paths = getContentDisciplinePaths(context);
  const bizDir = paths.businessDirectory;
  const violations: string[] = [];

  const registerPath = join(bizDir, "owner-decision-register.yaml");
  const reportPath = join(bizDir, "migration-coverage-report.yaml");

  if (!(await fileExists(registerPath))) {
    violations.push(
      "owner-decision-register.yaml — file not found in src/content/business-profile/",
    );
  }
  if (!(await fileExists(reportPath))) {
    violations.push(
      "migration-coverage-report.yaml — file not found in src/content/business-profile/",
    );
  }

  if (violations.length > 0) {
    return failResult("pbp.migration.validate", violations);
  }

  await validateRegister(registerPath, violations);
  await validateReport(reportPath, violations);

  if (violations.length > 0) {
    return failResult("pbp.migration.validate", violations);
  }

  return passResult("pbp.migration.validate", "Migration register and coverage report validated");
}

async function validateRegister(filePath: string, violations: string[]): Promise<void> {
  let data: Record<string, unknown>;
  try {
    data = await readYaml(filePath);
  } catch (error) {
    violations.push(
      `owner-decision-register.yaml — parse error: ${error instanceof Error ? error.message : String(error)}`,
    );
    return;
  }

  if (data.schemaVersion !== "1.0.0") {
    violations.push(
      `owner-decision-register.yaml — schemaVersion must be "1.0.0", got "${data.schemaVersion}"`,
    );
  }

  const items = data.items as Array<Record<string, unknown>> | undefined;
  if (!Array.isArray(items) || items.length === 0) {
    violations.push("owner-decision-register.yaml — items must be a non-empty array");
    return;
  }

  for (let i = 0; i < items.length; i++) {
    const item = items[i]!;
    const prefix = `owner-decision-register.yaml — items[${i}]`;
    if (item.id === undefined) violations.push(`${prefix}: missing id`);
    if (item.topic === undefined) violations.push(`${prefix}: missing topic`);
    if (item.question === undefined) violations.push(`${prefix}: missing question`);
    if (item.status === undefined) violations.push(`${prefix}: missing status`);
    if (item.blocks === undefined) violations.push(`${prefix}: missing blocks`);
    if (item.id !== undefined && item.id !== i + 1) {
      violations.push(`${prefix}: id must be ${i + 1}, got ${item.id}`);
    }
    if (item.status !== undefined && item.status !== "open") {
      violations.push(`${prefix}: status must be "open", got "${item.status}"`);
    }
    if (item.blocks !== undefined && !Array.isArray(item.blocks)) {
      violations.push(`${prefix}: blocks must be an array`);
    }
  }
}

async function validateReport(filePath: string, violations: string[]): Promise<void> {
  let data: Record<string, unknown>;
  try {
    data = await readYaml(filePath);
  } catch (error) {
    violations.push(
      `migration-coverage-report.yaml — parse error: ${error instanceof Error ? error.message : String(error)}`,
    );
    return;
  }

  if (data.schemaVersion !== "1.0.0") {
    violations.push(
      `migration-coverage-report.yaml — schemaVersion must be "1.0.0", got "${data.schemaVersion}"`,
    );
  }

  if (data.coveragePercentage !== 100) {
    violations.push(
      `migration-coverage-report.yaml — coveragePercentage must be 100, got ${data.coveragePercentage}`,
    );
  }

  if (data.mappedEntities !== data.totalLegacyEntities) {
    violations.push(
      "migration-coverage-report.yaml — mappedEntities must equal totalLegacyEntities",
    );
  }

  const unmapped = data.unmappedEntities as unknown[] | undefined;
  if (!Array.isArray(unmapped) || unmapped.length > 0) {
    violations.push("migration-coverage-report.yaml — unmappedEntities must be an empty array");
  }

  if (data.verifiedEntities !== data.mappedEntities) {
    violations.push("migration-coverage-report.yaml — verifiedEntities must equal mappedEntities");
  }

  const mappings = data.legacySourceMappings as Array<Record<string, unknown>> | undefined;
  if (!Array.isArray(mappings) || mappings.length === 0) {
    violations.push(
      "migration-coverage-report.yaml — legacySourceMappings must be a non-empty array",
    );
    return;
  }

  for (let i = 0; i < mappings.length; i++) {
    const mapping = mappings[i]!;
    const prefix = `migration-coverage-report.yaml — legacySourceMappings[${i}]`;
    if (mapping.legacyFile === undefined) violations.push(`${prefix}: missing legacyFile`);
    if (mapping.targetEntities === undefined) violations.push(`${prefix}: missing targetEntities`);
    if (mapping.category === undefined) violations.push(`${prefix}: missing category`);
  }

  const validation = data.validation as Record<string, unknown[]> | undefined;
  if (validation && Array.isArray(validation.errors) && validation.errors.length > 0) {
    violations.push(
      `migration-coverage-report.yaml — validation.errors must be empty, got ${validation.errors.length} error(s)`,
    );
  }
}
