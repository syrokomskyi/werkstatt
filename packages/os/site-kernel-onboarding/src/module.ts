/*
<MODULE_CONTRACT>
<purpose>
createOnboardingModule — registers onboarding.synthesize, biome-token derivation,
config sync, and amend lifecycle commands with the site-kernel registry (DNA-36, RFC-0029, RFC-0532).
</purpose>
<non-goals>
  <item>Do not register general app validation commands unrelated to onboarding lifecycle.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Wave 2 (RFC-0029): Initial creation.</item>
  <item>RFC-0076: Add onboarding input and phase contract validators.</item>
  <item>RFC-0135: Add amend.input.validate + amend gates (coverage delta, atom merge, provenance).</item>
  <item>RFC-0532: Remove brief.validate, onboarding.input.validate, onboarding.phase.validate, onboarding.scaffold, onboarding.checklist. Add onboarding.synthesize for per-system input validation and hashing.</item>
</CHANGE_SUMMARY>
*/

import type { KernelModule } from "@gogol/site-kernel";

export function createOnboardingModule(): KernelModule {
  return {
    name: "onboarding",
    version: "0.1.0",
    async register(registry) {
      const { runOnboardingSynthesize } = await import("./synthesize.ts");
      const { runBiomeTokensDerive, runBiomeSiteBackgroundDerive } =
        await import("./biome-derive.ts");
      const { runConfigRegenerate } = await import("./config-regenerate.ts");
      const { runConfigTemplateSync } = await import("./config-template-sync.ts");
      const { runAmendInputValidate } = await import("./amend.ts");
      const { runAmendSystemMerge } = await import("./amend-system-merge.ts");
      const { runAmendDeltaFiles } = await import("./amend-delta-files.ts");
      const {
        runContentCoverageDelta,
        runAmendAtomsMerge,
        runAmendProvenanceAppend,
        runAmendProvenanceValidate,
      } = await import("./amend-gates.ts");
      registry.registerCommand({
        name: "onboarding.synthesize",
        description:
          "Validate and hash raw client materials from onboarding/<system-id>/.input/ and write a deterministic input manifest to onboarding/<system-id>/.output/input-manifest.json (RFC-0532).",
        scope: "workspace",
        flags: {
          system: {
            kind: "string",
            required: true,
            description: "Sternsystem id for the onboarding input directory.",
          },
        },
        supportsAllSites: true,
        mutatesState: true,
        writes: ["onboarding/{system}/.output/input-manifest.json"],
        reads: ["onboarding/{system}/.input/**/*"],
        cacheable: false,
        execute: runOnboardingSynthesize,
      });

      // RFC-0135: amend-onboarding precondition + gates (hosted here to avoid a
      // checks → onboarding circular dependency).
      registry.registerCommand({
        name: "amend.input.validate",
        description:
          "Validate an amend batch (onboarding/.input/amend-<NNN>/00-amend-brief.md) against the RFC-0135 contract: " +
          "app-present precondition, valid system.md, resolved biome, and strengthen/new-route pageId cross-checks. " +
          "Writes onboarding/.output/amend-<NNN>/a0-intake/input-manifest.json.",
        scope: "app",
        flags: {
          batch: {
            kind: "string",
            description: "Amend batch id, for example amend-007.",
          },
        },
        supportsAllSites: true,
        mutatesState: true,
        writes: ["onboarding/.output/{batch}/a0-intake/input-manifest.json"],
        reads: ["onboarding/.input/{batch}/**/*", "<app>/src/content/system.md"],
        cacheable: false,
        execute: runAmendInputValidate,
      });

      registry.registerCommand({
        name: "amend.system.merge",
        description:
          "Additively merge an amend batch's a2-compose/site-plan-delta.md into the app's CURRENT system.md " +
          "(RFC-0135 amend-001 fix): register new-route pages, expand-locale routes/locales, and new supported " +
          "locales without overwriting existing pages. Idempotent; re-validates the whole manifest. Unlike " +
          "system-md.compile it never reads the greenfield 03-compose site-plan. Supports --dry-run.",
        scope: "app",
        flags: {
          batch: {
            kind: "string",
            description: "Amend batch id, for example amend-007.",
          },
        },
        supportsAllSites: true,
        mutatesState: true,
        writes: ["<app>/src/content/system.md"],
        reads: ["onboarding/.input/{batch}/**/*", "<app>/src/content/system.md"],
        cacheable: false,
        execute: runAmendSystemMerge,
      });

      registry.registerCommand({
        name: "amend.delta.files",
        description:
          "Resolve the repo-relative file set an amend batch is responsible for (RFC-0139): page+prose " +
          "files per touched/required pageId across served locales, plus per-locale business/site/navigation. " +
          "Consumed by amend-check to scope the deterministic validators via --scope-files.",
        scope: "app",
        flags: {
          batch: {
            kind: "string",
            description: "Amend batch id, for example amend-007.",
          },
        },
        supportsAllSites: true,
        reads: ["onboarding/.input/{batch}/**/*", "<app>/src/content/system.md"],
        execute: runAmendDeltaFiles,
      });

      registry.registerCommand({
        name: "content.coverage.delta",
        description:
          "Maintain the cumulative, app-resident coverage ledger (apps/<id>/provenance/coverage-ledger.yaml) " +
          "for an amend batch: record new atoms idempotently and supersede prior source versions (RFC-0135).",
        scope: "app",
        flags: {
          batch: {
            kind: "string",
            description: "Amend batch id, for example amend-007.",
          },
        },
        supportsAllSites: true,
        mutatesState: true,
        writes: ["<app>/provenance/coverage-ledger.yaml"],
        reads: ["onboarding/.input/{batch}/**/*", "<app>/provenance/coverage-ledger.yaml"],
        cacheable: false,
        execute: runContentCoverageDelta,
      });

      registry.registerCommand({
        name: "amend.atoms.merge",
        description:
          "Plan the merge of a strengthen source into an existing page: drop duplicates, flag the review band, " +
          "enforce voice, and refuse system.md-requiring edits (RFC-0135). Writes the batch atoms.yaml + merge plan.",
        scope: "app",
        flags: {
          batch: {
            kind: "string",
            description: "Amend batch id, for example amend-007.",
          },
          page: {
            kind: "string",
            description: "Optional pageId to limit the atom merge plan.",
          },
        },
        supportsAllSites: true,
        mutatesState: true,
        writes: [
          "onboarding/.output/{batch}/a3-author/atoms.yaml",
          "onboarding/.output/{batch}/a3-author/merge-plan-{pageId}.md",
        ],
        reads: ["onboarding/.input/{batch}/**/*", "<app>/src/content/system.md"],
        cacheable: false,
        execute: runAmendAtomsMerge,
      });

      registry.registerCommand({
        name: "amend.provenance.append",
        description:
          "Append one immutable, signed provenance record per amend batch under apps/<id>/provenance/amend/ (RFC-0135). " +
          "Idempotent; refuses to overwrite an existing batch record with different content.",
        scope: "app",
        flags: {
          batch: {
            kind: "string",
            description: "Amend batch id, for example amend-007.",
          },
        },
        supportsAllSites: true,
        mutatesState: true,
        writes: ["<app>/provenance/amend/{batch}.yaml", "<app>/provenance/amend/ledger.md"],
        reads: ["onboarding/.input/{batch}/**/*"],
        cacheable: false,
        execute: runAmendProvenanceAppend,
      });

      registry.registerCommand({
        name: "amend.provenance.validate",
        description:
          "Verify the amend provenance trail: signatures, inputHash format, and that every recorded pageId still exists in system.md (RFC-0135).",
        scope: "app",
        flags: {},
        supportsAllSites: true,
        reads: ["<app>/provenance/amend/**", "<app>/src/content/system.md"],
        execute: runAmendProvenanceValidate,
      });

      registry.registerCommand({
        name: "biome.tokens.derive",
        description:
          "Derive biome palette/typography/spacing/motion/geometry/siteBackground deterministically from RFC-0071 axes input.",
        scope: "workspace",
        flags: {
          axes: {
            kind: "string",
            description: "Path to the biome axes YAML input.",
          },
          biome: {
            kind: "string",
            description: "Path to the biome YAML file to update.",
          },
          out: {
            kind: "string",
            description: "Output YAML path.",
          },
          inplace: {
            kind: "boolean",
            description: "Update the input biome file in place.",
          },
        },
        supportsAllSites: true,
        mutatesState: true,
        writes: ["{--out}", "{--biome}"],
        reads: ["onboarding/.input/**/*"],
        cacheable: false,
        execute: runBiomeTokensDerive,
      });

      // RFC-0114 + RFC-0117 + RFC-0129 step 2: narrower deriver focused on
      // the siteBackground block.
      registry.registerCommand({
        name: "biome.site-background.derive",
        description:
          "Derive the siteBackground block from biome axes only (RFC-0114). Preserves an existing biome.siteBackground when one is already declared.",
        scope: "workspace",
        flags: {
          biome: {
            kind: "string",
            description: "Path to the biome YAML file to update.",
          },
          out: {
            kind: "string",
            description: "Output YAML path.",
          },
          inplace: {
            kind: "boolean",
            description: "Update the input biome file in place.",
          },
        },
        supportsAllSites: true,
        mutatesState: true,
        writes: ["{--out}", "{--biome}"],
        reads: ["onboarding/.input/**/*"],
        cacheable: false,
        execute: runBiomeSiteBackgroundDerive,
      });

      registry.registerCommand({
        name: "config.regenerate",
        description:
          "Re-apply root config templates (astro.config.mjs, tsconfig.json, wrangler.jsonc, .gitignore, postcss.config.cjs, package.json) from site-kernel-onboarding to an existing app (RFC-0078).",
        scope: "app",
        flags: {
          app: {
            kind: "string",
            description: "App name to regenerate config for.",
          },
          force: {
            kind: "boolean",
            description: "Overwrite existing config files when supported.",
          },
        },
        supportsAllSites: true,
        mutatesState: true,
        writes: [
          "<app>/package.json",
          "<app>/astro.config.mjs",
          "<app>/wrangler.jsonc",
          "<app>/.gitignore",
          "<app>/postcss.config.cjs",
        ],
        reads: ["packages/os/site-kernel-onboarding/src/templates/**"],
        cacheable: false,
        execute: runConfigRegenerate,
      });

      registry.registerCommand({
        name: "config.template.sync",
        description:
          "Propagate dependency versions and Vite config blocks from a reference app into the canonical onboarding templates (RFC-0137). " +
          "Overwrites package.template.json dependencies/devDependencies and astro.config.template.mjs optimizeDeps/ssr blocks. " +
          "Use --dry-run to preview changes.",
        scope: "workspace",
        flags: {
          app: {
            kind: "string",
            description: "Reference app name to sync template values from.",
          },
          files: {
            kind: "string",
            description: "Comma-separated template file set to sync.",
          },
          dryRun: {
            kind: "boolean",
            description: "Preview template changes without writing files.",
          },
        },
        supportsAllSites: true,
        mutatesState: true,
        writes: [
          "packages/os/site-kernel-onboarding/src/templates/package.template.json",
          "packages/os/site-kernel-onboarding/src/templates/runtime/astro.config.template.mjs",
        ],
        reads: ["systems/<app>/package.json", "systems/<app>/astro.config.mjs"],
        cacheable: false,
        execute: runConfigTemplateSync,
      });
    },
  };
}
