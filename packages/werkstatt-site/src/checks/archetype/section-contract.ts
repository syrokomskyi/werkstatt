/*
<MODULE_CONTRACT>
<purpose>section.contract.validate — validates the RFC-0072 section folder contract surface
(colocated .astro/.css/types/story files per section manifest).</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0303: split out of archetype.ts (Phase 3 file-size split).</item>
</CHANGE_SUMMARY>
*/

import { join, relative, basename, dirname } from "node:path";
import { fileExists as pathExists } from "@warpgogol/werkstatt-site/share/fs";
import { manifestSchema } from "@warpgogol/werkstatt-site/ontology";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";
import { collectFilesMatching, readYamlFile } from "./shared.ts";

interface SectionContractResult {
  scanned: number;
  violations: number;
  details: Array<{ section: string; errors: string[] }>;
}

export async function runSectionContractValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<SectionContractResult>> {
  const sectionsRoot = join(context.workspaceRoot, "packages", "ui", "src", "sections");
  const manifestFiles = await collectFilesMatching(sectionsRoot, (filePath) =>
    filePath.endsWith(".manifest.yaml"),
  );
  const details: SectionContractResult["details"] = [];

  for (const manifestFile of manifestFiles) {
    const stem = basename(manifestFile).replace(".manifest.yaml", "");
    const folder = dirname(manifestFile);
    const relSection = relative(context.workspaceRoot, folder).replace(/\\/g, "/");
    const errors: string[] = [];
    const astroFile = join(folder, `${stem}.astro`);
    const cssFile = join(folder, `${stem}.css`);
    const typesFile = join(folder, `${stem}.types.ts`);
    // RFC-0262: the manifest propsSchema is the only authored prop contract;
    // its TypeScript mirror is generated, not hand-written.
    const generatedTypesFile = join(folder, `${stem}.types.generated.ts`);
    const propsSchemaFile = join(folder, `${stem}.props.schema.ts`);
    const storyFile = join(folder, `${stem}.story.md`);

    if (!(await pathExists(astroFile))) errors.push(`missing ${basename(astroFile)}`);
    if (!(await pathExists(cssFile))) {
      context.logger.warn(
        `${relSection}: missing ${basename(cssFile)} (legacy section without dedicated CSS file)`,
      );
    }
    if (!(await pathExists(storyFile))) {
      context.logger.warn(
        `${relSection}: missing ${basename(storyFile)} (legacy section without RFC-0072 story file)`,
      );
    }

    try {
      const manifest = await readYamlFile(manifestFile, (value) => manifestSchema.parse(value));
      if (manifest.layer !== "section") {
        errors.push(`manifest layer must be section, got ${manifest.layer}`);
      }
      if (
        manifest.contentSchemaKey &&
        !(await pathExists(typesFile)) &&
        !(await pathExists(generatedTypesFile)) &&
        !(await pathExists(propsSchemaFile))
      ) {
        errors.push(
          `missing ${basename(generatedTypesFile)} (run props.types.generate), ${basename(typesFile)}, or ${basename(propsSchemaFile)}`,
        );
      }
    } catch (error) {
      errors.push(`invalid manifest: ${error instanceof Error ? error.message : String(error)}`);
    }

    if (errors.length > 0) {
      details.push({ section: relSection, errors });
    }
  }

  return {
    exitCode: details.length > 0 ? 1 : 0,
    data: { scanned: manifestFiles.length, violations: details.length, details },
    summary: details.length === 0 ? `OK - ${manifestFiles.length} sections valid` : undefined,
  };
}
