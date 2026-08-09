/*
<MODULE_CONTRACT>
<purpose>
Implements RFC-0071 site-family validation and discovery commands.
Validates packages/ontology/site-families/<id>/family.yaml and lists family metadata
for workflow-time onboarding decisions.
</purpose>
<non-goals>
  <item>Do not mutate family files.</item>
  <item>Do not validate companion cultural or linguistic rule semantics beyond file presence.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0071: Add family.contract.validate and family.list.</item>
</CHANGE_SUMMARY>
*/

import { access, readdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, relative } from "node:path";
import YAML from "yaml";
import { SiteFamilyContract, biomeSchema, constellationSchema } from "@warpgogol/werkstatt-site/ontology";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";

interface FamilyViolation {
  file: string;
  errors: string[];
}

interface FamilyContractData {
  command: "family.contract.validate";
  familiesScanned: number;
  violations: FamilyViolation[];
}

interface FamilyListEntry {
  id: string;
  displayName: string;
  threshold: number;
  signals: Record<string, unknown>;
  candidateBiomes: string[];
  candidateConstellations: string[];
}

interface FamilyListData {
  command: "family.list";
  families: FamilyListEntry[];
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

async function readYaml(target: string): Promise<unknown> {
  return YAML.parse(await readFile(target, "utf8"));
}

async function listFamilyDirs(root: string): Promise<string[]> {
  try {
    const entries = await readdir(root, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => join(root, entry.name))
      .sort();
  } catch {
    return [];
  }
}

function hasArchetypeCatalog(workspaceRoot: string): boolean {
  return existsSync(join(workspaceRoot, "packages", "ontology", "archetypes", "sections"));
}

export async function runFamilyContractValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<FamilyContractData>> {
  const familiesRoot = join(context.workspaceRoot, "packages", "ontology", "site-families");
  const familyDirs = await listFamilyDirs(familiesRoot);
  const violations: FamilyViolation[] = [];
  const archetypeCatalogPresent = hasArchetypeCatalog(context.workspaceRoot);

  for (const familyDir of familyDirs) {
    const familyYamlPath = join(familyDir, "family.yaml");
    const relFamilyYaml = relative(context.workspaceRoot, familyYamlPath);
    const folderName = familyDir.split(/[/\\]/).pop() ?? "";
    const errors: string[] = [];

    if (!(await pathExists(familyYamlPath))) {
      errors.push("Missing family.yaml");
      violations.push({ file: relative(context.workspaceRoot, familyDir), errors });
      continue;
    }

    const companionFiles = [
      "tone-of-voice.template.yaml",
      "cultural-rules.yaml",
      "linguistic-rules.yaml",
    ];
    for (const companion of companionFiles) {
      if (!(await pathExists(join(familyDir, companion)))) {
        errors.push(`Missing companion file: ${companion}`);
      }
    }

    let parsed: unknown;
    try {
      parsed = await readYaml(familyYamlPath);
    } catch (error) {
      errors.push(`YAML parse error: ${error instanceof Error ? error.message : String(error)}`);
      violations.push({ file: relFamilyYaml, errors });
      continue;
    }

    const familyResult = SiteFamilyContract.safeParse(parsed);
    if (!familyResult.success) {
      errors.push(
        ...familyResult.error.issues.map(
          (issue) => `${issue.path.map(String).join(".") || "root"}: ${issue.message}`,
        ),
      );
      violations.push({ file: relFamilyYaml, errors });
      continue;
    }

    const family = familyResult.data;
    if (family.id !== folderName) {
      errors.push(`id must match folder name (${folderName})`);
    }

    for (const biomeId of family.recipe.candidateBiomes) {
      const biomePath = join(
        context.workspaceRoot,
        "packages",
        "ontology",
        "biomes",
        `${biomeId}.yaml`,
      );
      if (!(await pathExists(biomePath))) {
        errors.push(`candidate biome does not exist: ${biomeId}`);
        continue;
      }
      try {
        const biomeParsed = biomeSchema.safeParse(await readYaml(biomePath));
        if (!biomeParsed.success) {
          errors.push(`candidate biome invalid: ${biomeId}`);
        } else if (biomeParsed.data.family !== family.id) {
          errors.push(
            `candidate biome ${biomeId} points to family ${biomeParsed.data.family}, expected ${family.id}`,
          );
        }
      } catch (error) {
        errors.push(
          `candidate biome unreadable: ${biomeId} (${error instanceof Error ? error.message : String(error)})`,
        );
      }
    }

    for (const constellationId of family.recipe.candidateConstellations) {
      const constellationPath = join(
        context.workspaceRoot,
        "packages",
        "ontology",
        "constellations",
        `${constellationId}.yaml`,
      );
      if (!(await pathExists(constellationPath))) {
        errors.push(`candidate constellation does not exist: ${constellationId}`);
        continue;
      }
      try {
        const constellationParsed = constellationSchema.safeParse(
          await readYaml(constellationPath),
        );
        if (!constellationParsed.success) {
          errors.push(`candidate constellation invalid: ${constellationId}`);
        }
      } catch (error) {
        errors.push(
          `candidate constellation unreadable: ${constellationId} (${error instanceof Error ? error.message : String(error)})`,
        );
      }
    }

    if (archetypeCatalogPresent) {
      for (const archetypeId of family.recipe.requiredSectionArchetypes) {
        const archetypePath = join(
          context.workspaceRoot,
          "packages",
          "ontology",
          "archetypes",
          "sections",
          `${archetypeId}.yaml`,
        );
        if (!(await pathExists(archetypePath))) {
          errors.push(`required section archetype does not exist: ${archetypeId}`);
        }
      }
    } else if (family.recipe.requiredSectionArchetypes.length === 0) {
      errors.push("requiredSectionArchetypes must not be empty");
    }

    for (const schemaType of family.recipe.agentReadinessBaseline.requireStructuredData) {
      if (!/^[A-Z][A-Za-z0-9]+$/.test(schemaType)) {
        errors.push(`invalid schema.org type name: ${schemaType}`);
      }
    }

    if (errors.length > 0) {
      violations.push({ file: relFamilyYaml, errors });
    }
  }

  return {
    data: {
      command: "family.contract.validate",
      familiesScanned: familyDirs.length,
      violations,
    },
    exitCode: violations.length > 0 ? 1 : 0,
    summary:
      violations.length > 0
        ? `family.contract.validate: ${violations.length} family file(s) invalid`
        : `family.contract.validate: ${familyDirs.length} family file(s) valid`,
  };
}

export async function runFamilyList(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<FamilyListData>> {
  const familiesRoot = join(context.workspaceRoot, "packages", "ontology", "site-families");
  const familyDirs = await listFamilyDirs(familiesRoot);
  const families: FamilyListEntry[] = [];

  for (const familyDir of familyDirs) {
    const familyYamlPath = join(familyDir, "family.yaml");
    if (!(await pathExists(familyYamlPath))) continue;
    try {
      const parsed = SiteFamilyContract.safeParse(await readYaml(familyYamlPath));
      if (!parsed.success) continue;
      families.push({
        id: parsed.data.id,
        displayName: parsed.data.displayName,
        threshold: parsed.data.detection.threshold,
        signals: parsed.data.detection.signals,
        candidateBiomes: parsed.data.recipe.candidateBiomes,
        candidateConstellations: parsed.data.recipe.candidateConstellations,
      });
    } catch {
      // Skip invalid files; family.contract.validate is the authoritative failure surface.
    }
  }

  return {
    data: {
      command: "family.list",
      families,
    },
    exitCode: 0,
    summary: `family.list: ${families.length} family entries`,
  };
}
