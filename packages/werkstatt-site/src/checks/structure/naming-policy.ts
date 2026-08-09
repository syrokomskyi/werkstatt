/*
<MODULE_CONTRACT>
<purpose>RFC-0361 §2: naming.policy.validate — consolidated naming policy validator for all Werkstatt artifacts.</purpose>
<non-goals>
  <item>Does not validate filenames — that is naming.convention.lint (DNA-6).</item>
  <item>Does not provide --fix — rewriting ids is high risk.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0361: initial naming.policy.validate command handler.</item>
</CHANGE_SUMMARY>
*/

import path from "node:path";
import { parse as yamlParse } from "yaml";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";
import {
  STERNSYSTEM_ID_REGEX,
  MISSION_ID_REGEX,
  RELEASE_ID_REGEX,
  BORDBUCH_EVENT_ID_REGEX,
  isLatinOnly,
} from "@warpgogol/ontology/operations";

interface NamingViolation {
  artifact: string;
  field: string;
  value: string;
  rule: string;
  message: string;
}

interface ParseError {
  file: string;
  detail: string;
}

export interface NamingPolicyValidateData {
  validatedSystems: number;
  validatedMissions: number;
  validatedReleases: number;
  validatedBordbuchEntries: number;
  parseErrors: ParseError[];
  violations: NamingViolation[];
}

function flagString(input: KernelCommandInput, key: string): string | undefined {
  const v = input.flags[key];
  return typeof v === "string" ? v : undefined;
}

function checkLatinOnly(
  value: string,
  field: string,
  artifact: string,
  violations: NamingViolation[],
): boolean {
  if (!isLatinOnly(value)) {
    violations.push({
      artifact,
      field,
      value,
      rule: "non-ascii",
      message: `${field} contains non-ASCII characters — only ASCII a-z, 0-9, hyphens permitted`,
    });
    return false;
  }
  return true;
}

async function validateRegistry(
  context: KernelRuntimeContext,
  systemFilter: string | undefined,
  violations: NamingViolation[],
  parseErrors: ParseError[],
): Promise<{
  systems: Array<{ id: string; cosmicStar: string; status: string }>;
  validatedSystems: number;
}> {
  const { workspaceRoot } = context;
  const registryPath = path.join(workspaceRoot, "systems", "registry.yaml");
  if (!(await context.io.exists(registryPath))) {
    return { systems: [], validatedSystems: 0 };
  }

  let raw: string;
  try {
    raw = await context.io.readFile(registryPath);
  } catch (err) {
    parseErrors.push({ file: "systems/registry.yaml", detail: (err as Error).message });
    return { systems: [], validatedSystems: 0 };
  }

  let parsed: { systems?: Array<Record<string, unknown>> };
  try {
    parsed = yamlParse(raw);
  } catch (err) {
    parseErrors.push({ file: "systems/registry.yaml", detail: (err as Error).message });
    return { systems: [], validatedSystems: 0 };
  }

  const systems = parsed.systems ?? [];
  const result: Array<{ id: string; cosmicStar: string; status: string }> = [];
  const cosmicStars = new Map<string, string[]>();

  for (let i = 0; i < systems.length; i++) {
    const sys = systems[i];
    const id = String(sys.id ?? "");
    const cosmicStar = String(sys.cosmicStar ?? "");
    const status = String(sys.status ?? "registered");

    if (systemFilter && id !== systemFilter) continue;

    if (!checkLatinOnly(id, `systems[${i}].id`, "registry", violations)) continue;
    if (!STERNSYSTEM_ID_REGEX.test(id)) {
      violations.push({
        artifact: "registry",
        field: `systems[${i}].id`,
        value: id,
        rule: "sternsystem-id-kebab-case-latin-only",
        message: `Sternsystem id must be kebab-case, lowercase, latin-only (a-z, 0-9, hyphens)`,
      });
      continue;
    }

    // Track cosmicStar uniqueness
    if (cosmicStar) {
      const existing = cosmicStars.get(cosmicStar) ?? [];
      existing.push(id);
      cosmicStars.set(cosmicStar, existing);
    }

    result.push({ id, cosmicStar, status });
  }

  // Check cosmicStar uniqueness across active/registered
  for (const [star, owners] of cosmicStars) {
    const activeOwners = owners.filter((_, idx) => {
      const sys = systems.find((s) => s.id === owners[idx]);
      return sys && (sys.status === "active" || sys.status === "registered");
    });
    if (activeOwners.length > 1) {
      violations.push({
        artifact: "registry",
        field: "cosmicStar",
        value: star,
        rule: "duplicate-cosmic-star",
        message: `cosmicStar '${star}' is used by multiple active systems: ${activeOwners.join(", ")}`,
      });
    }
  }

  return { systems: result, validatedSystems: result.length };
}

async function validateMissions(
  context: KernelRuntimeContext,
  systemFilter: string | undefined,
  knownSystemIds: Set<string>,
  violations: NamingViolation[],
  parseErrors: ParseError[],
): Promise<number> {
  const { workspaceRoot } = context;
  const missionsDir = path.join(workspaceRoot, "missions");
  if (!(await context.io.exists(missionsDir))) return 0;

  let entries: string[];
  try {
    entries = (await context.io.readdir(missionsDir))
      .filter((entry) => entry.isDirectory)
      .map((entry) => entry.name);
  } catch {
    return 0;
  }

  let count = 0;
  for (const dir of entries) {
    const manifestPath = path.join(missionsDir, dir, "mission.yaml");
    if (!(await context.io.exists(manifestPath))) continue;

    let raw: string;
    try {
      raw = await context.io.readFile(manifestPath);
    } catch (err) {
      parseErrors.push({ file: `missions/${dir}/mission.yaml`, detail: (err as Error).message });
      continue;
    }

    if (raw.trim().length === 0) {
      parseErrors.push({
        file: `missions/${dir}/mission.yaml`,
        detail: "empty file (partial write)",
      });
      continue;
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = yamlParse(raw);
    } catch (err) {
      parseErrors.push({ file: `missions/${dir}/mission.yaml`, detail: (err as Error).message });
      continue;
    }

    const missionId = String(parsed.missionId ?? "");
    const systemId = String(parsed.systemId ?? "");

    if (systemFilter && systemId !== systemFilter) continue;
    count++;

    // Directory/manifest alignment
    if (dir !== missionId) {
      violations.push({
        artifact: "mission",
        field: "missionId",
        value: missionId,
        rule: "directory-manifest-mismatch",
        message: `directory '${dir}' does not match manifest missionId '${missionId}'`,
      });
    }

    if (!checkLatinOnly(missionId, "missionId", "mission", violations)) continue;
    if (!MISSION_ID_REGEX.test(missionId)) {
      violations.push({
        artifact: "mission",
        field: "missionId",
        value: missionId,
        rule: "mission-id-format",
        message: `mission id must match <system-id>-m<NNNNNN>`,
      });
    }

    if (!knownSystemIds.has(systemId)) {
      violations.push({
        artifact: "mission",
        field: "systemId",
        value: systemId,
        rule: "unknown-system-id",
        message: `mission references unknown system '${systemId}'`,
      });
    }
  }

  return count;
}

async function validateBordbuchs(
  context: KernelRuntimeContext,
  systemFilter: string | undefined,
  knownSystemIds: Set<string>,
  violations: NamingViolation[],
  parseErrors: ParseError[],
): Promise<number> {
  const { workspaceRoot } = context;
  let totalEntries = 0;

  const systemsDir = path.join(workspaceRoot, "systems");
  if (!(await context.io.exists(systemsDir))) return 0;

  let systemDirs: string[];
  try {
    systemDirs = (await context.io.readdir(systemsDir))
      .filter((entry) => entry.isDirectory)
      .map((entry) => entry.name);
  } catch {
    return 0;
  }

  for (const sysDir of systemDirs) {
    if (systemFilter && sysDir !== systemFilter) continue;
    if (!knownSystemIds.has(sysDir)) continue;

    const bordbuchPath = path.join(systemsDir, sysDir, "bordbuch", "events.ndjson");
    if (!(await context.io.exists(bordbuchPath))) continue;

    let raw: string;
    try {
      raw = await context.io.readFile(bordbuchPath);
    } catch (err) {
      parseErrors.push({
        file: `systems/${sysDir}/bordbuch/events.ndjson`,
        detail: (err as Error).message,
      });
      continue;
    }

    const lines = raw.split("\n").filter((l) => l.trim().length > 0);
    let expectedId = 1;
    let prevOccurredAt: string | null = null;

    for (let i = 0; i < lines.length; i++) {
      let entry: Record<string, unknown>;
      try {
        entry = yamlParse(lines[i]);
      } catch (err) {
        parseErrors.push({
          file: `systems/${sysDir}/bordbuch/events.ndjson`,
          detail: `line ${i + 1}: ${(err as Error).message}`,
        });
        continue;
      }

      totalEntries++;

      const id = String(entry.id ?? "");
      const expectedIdStr = `event-${String(expectedId).padStart(6, "0")}`;
      if (id !== expectedIdStr) {
        violations.push({
          artifact: "bordbuch",
          field: "id",
          value: id,
          rule: "event-id-gap",
          message: `expected '${expectedIdStr}', got '${id}'`,
        });
      }
      expectedId++;

      if (!BORDBUCH_EVENT_ID_REGEX.test(id)) {
        violations.push({
          artifact: "bordbuch",
          field: "id",
          value: id,
          rule: "event-id-format",
          message: `Bordbuch event id must match event-<NNNNNN>`,
        });
      }

      const occurredAt = String(entry.occurredAt ?? "");
      if (prevOccurredAt && occurredAt < prevOccurredAt) {
        violations.push({
          artifact: "bordbuch",
          field: "occurredAt",
          value: occurredAt,
          rule: "occurred-at-decreasing",
          message: `occurredAt '${occurredAt}' is before previous '${prevOccurredAt}'`,
        });
      }
      prevOccurredAt = occurredAt;

      const missionId = entry.missionId as string | null;
      if (missionId && !MISSION_ID_REGEX.test(missionId)) {
        violations.push({
          artifact: "bordbuch",
          field: "missionId",
          value: missionId,
          rule: "mission-id-format",
          message: `Bordbuch missionId '${missionId}' does not match mission id format`,
        });
      }

      const releaseId = entry.releaseId as string | null;
      if (releaseId && !RELEASE_ID_REGEX.test(releaseId)) {
        violations.push({
          artifact: "bordbuch",
          field: "releaseId",
          value: releaseId,
          rule: "release-id-format",
          message: `Bordbuch releaseId '${releaseId}' does not match release id format`,
        });
      }
    }
  }

  return totalEntries;
}

export async function runNamingPolicyValidate(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<NamingPolicyValidateData>> {
  const { logger } = context;
  const systemFilter = flagString(input, "system");

  const violations: NamingViolation[] = [];
  const parseErrors: ParseError[] = [];

  const { systems, validatedSystems } = await validateRegistry(
    context,
    systemFilter,
    violations,
    parseErrors,
  );

  const knownSystemIds = new Set(systems.map((s) => s.id));

  const validatedMissions = await validateMissions(
    context,
    systemFilter,
    knownSystemIds,
    violations,
    parseErrors,
  );

  const validatedBordbuchEntries = await validateBordbuchs(
    context,
    systemFilter,
    knownSystemIds,
    violations,
    parseErrors,
  );

  for (const v of violations) {
    logger.error(`  [${v.rule}] ${v.message}`);
  }
  for (const e of parseErrors) {
    logger.error(`  [parse-error] ${e.file}: ${e.detail}`);
  }

  const totalErrors = violations.length + parseErrors.length;

  return {
    data: {
      validatedSystems,
      validatedMissions,
      validatedReleases: 0,
      validatedBordbuchEntries,
      parseErrors,
      violations,
    },
    exitCode: totalErrors > 0 ? 1 : 0,
    summary:
      totalErrors > 0
        ? undefined
        : `[naming.policy.validate] ${validatedSystems} system${validatedSystems === 1 ? "" : "s"}, ${validatedMissions} mission${validatedMissions === 1 ? "" : "s"}, ${validatedBordbuchEntries} Bordbuch entries — 0 violations`,
  };
}
