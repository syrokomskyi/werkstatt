/*
<MODULE_CONTRACT>
<purpose>Maintains packages/os/site-kernel-checks/src/command-tables/01-codegen.ts as an authored site-kernel-checks authored module so agents can evolve it without rediscovering local boundaries.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0262: register props.types.generate and props.contract.validate.</item>
</CHANGE_SUMMARY>
*/

import type { CheckCommandEntry } from "./types.ts";
import {
  runGenerateAgentsDocs,
  runGenerateOverlayPages,
  runGenerateRoutes,
  runGenerateApiRoutes,
  runGenerateGlobalStyles,
  runGenerateScriptsOrchestrator,
  runGeneratePublicInfrastructure,
  runAppBoilerplateValidate,
  runSectionScaffold,
  runSystemMdCompile,
  runLegalScaffold,
  runBiomeCssGenerate,
  runPropsTypesGenerate,
  runFontsImportsGenerate,
} from "@warpgogol/site-kernel-codegen";
import { runKernelWire } from "@warpgogol/site-kernel";
import { runManifestContractValidate, runMirrorQuintetValidate } from "../manifest.ts";
import { runUniRegistryBuild, runUniRegistryValidate } from "../registry.ts";
import {
  runArchetypeRegistryBuild,
  runArchetypeRegistryValidate,
  runCosmicNamePick,
  runCosmicNameRename,
  runPlanetImportPathsLint,
  runSectionContractValidate,
  runSectionSimilarityReport,
  runConstellationContractValidate,
} from "../archetype.ts";
import { runPreviewImagesValidate, runPreviewImagesGenerate } from "../preview-images.ts";
import { runFontsContractValidate, runFontsOriginValidate } from "../fonts.ts";
import { runSitemapGenerate, runSitemapValidate } from "../sitemap.ts";
import { runOnboardingYamlImportLint } from "../onboarding-yaml-import-lint.ts";
import { runGeneratedMarkerValidate } from "../generated-marker-validate.ts";
import { runGeneratedFileLookup } from "../generated-file-lookup.ts";
import { runGeneratedFilesValidate } from "../generated-files-validate.ts";
import { runGeneratedStaleValidate } from "../generated-stale-validate.ts";
import { runGeneratedDriftValidate } from "../generated-drift-validate.ts";
import { runOwnershipSyncValidate } from "../ownership-sync-validate.ts";
import { runBehaviorSnapshotStalenessCheck } from "../behavior-snapshot-staleness.ts";
import { runPropsContractValidate } from "../props-contract.ts";
import { runOpenSourceValidate } from "../open-source-validate.ts";

export const CODEGEN_COMMANDS: CheckCommandEntry[] = [
  {
    name: "agents.generate",
    description: "Generate apps/<app>/AGENTS.md from template using system.md tokens (RFC-0079).",
    scope: "app",
    flags: {},
    mutatesState: true,
    supportsAllSites: true,
    // RFC-0266: declared writes, mirroring GENERATOR_OWNERSHIP_MAP.
    writes: ["<app>/AGENTS.md", "<app>/src/content/AGENTS.md", "<app>/src/styles/AGENTS.md"],
    reads: ["<app>/src/content/system.md"],
    execute: runGenerateAgentsDocs,
  },
  {
    name: "overlay.pages.generate",
    description:
      "Generate engineering-owned overlay content pages (cosmic passport, star map, root redirect) from system.md (RFC-0078).",
    scope: "app",
    flags: {},
    mutatesState: true,
    supportsAllSites: true,
    writes: [
      "<app>/src/content/pages/root-redirect.md",
      "<app>/src/content/pages/{lang}/cosmic/passport.md",
      "<app>/src/content/pages/{lang}/cosmic/star-map.md",
    ],
    reads: ["<app>/src/content/system.md"],
    execute: runGenerateOverlayPages,
  },
  {
    name: "routes.generate",
    description:
      "Generate thin Astro route, middleware, env, and content-config boilerplate from platform templates (RFC-0078).",
    scope: "app",
    flags: {},
    mutatesState: true,
    supportsAllSites: true,
    writes: [
      "<app>/src/pages/index.astro",
      "<app>/src/pages/404.astro",
      "<app>/src/pages/[...slug].astro",
      "<app>/src/pages/[lang]/[...slug].astro",
      "<app>/src/middleware.ts",
      "<app>/src/content.config.ts",
      "<app>/src/env.d.ts",
    ],
    reads: ["<app>/src/content/system.md"],
    execute: runGenerateRoutes,
  },
  {
    name: "api.routes.generate",
    description:
      "Generate thin section-owned server API route re-exports for sections the site uses (RFC-0140).",
    scope: "app",
    flags: {},
    mutatesState: true,
    supportsAllSites: true,
    writes: ["<app>/src/pages/api/{route}.ts", "<app>/src/env.schema.generated.mjs"],
    reads: ["<app>/src/content/system.md"],
    execute: runGenerateApiRoutes,
  },
  {
    name: "styles.global.generate",
    description: "Generate src/styles/global.css from system.md biome configuration (RFC-0078).",
    scope: "app",
    flags: {},
    mutatesState: true,
    supportsAllSites: true,
    writes: ["<app>/src/styles/global.css"],
    reads: ["<app>/src/content/system.md"],
    execute: runGenerateGlobalStyles,
  },
  {
    name: "scripts.orchestrator.generate",
    description:
      "Generate the standard layout orchestrator script from shared platform boilerplate (RFC-0078).",
    scope: "app",
    flags: {},
    mutatesState: true,
    supportsAllSites: true,
    writes: ["<app>/src/scripts/layout-orchestrator.ts"],
    reads: ["<app>/src/content/system.md"],
    execute: runGenerateScriptsOrchestrator,
  },
  {
    name: "public.infrastructure.generate",
    description:
      "Generate public infrastructure files (_headers, _redirects, .assetsignore) from system.md and/or explicit flags (RFC-0078, RFC-0160).",
    scope: "app",
    flags: {
      domain: {
        kind: "string",
        description: "Public domain used when generating infrastructure files.",
      },
    },
    mutatesState: true,
    supportsAllSites: true,
    writes: ["<app>/public/_headers", "<app>/public/_redirects", "<app>/public/.assetsignore"],
    reads: ["<app>/src/content/system.md"],
    execute: runGeneratePublicInfrastructure,
  },
  {
    name: "app.boilerplate.validate",
    description:
      "Dry-run all RFC-0078 app boilerplate generators and report drift against the expected generated output.",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: ["<app>/src/content/system.md"],
    execute: runAppBoilerplateValidate,
  },
  {
    name: "generated.marker.validate",
    description:
      "Verify every known generated file in the app carries the RFC-0081 GENERATED_MARKER. " +
      "Reports managed (marker present), project-specific (no marker), stale (marker present but content outdated), and missing files.",
    scope: "app",
    flags: {
      strict: {
        kind: "boolean",
        description: "Use strict validation mode.",
      },
      phase: {
        kind: "string",
        description: "Validation phase selector.",
      },
    },
    supportsAllSites: true,
    cacheable: false,
    execute: runGeneratedMarkerValidate,
  },
  {
    name: "preview.images.validate",
    description:
      "Validate every routable page resolves an OG preview image, using page-specific output or fallbacks, ensuring public/og-image.png is present.",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: ["<app>/public/og-image.png", "<app>/src/content/system.md"],
    modulePaths: ["preview-images.ts", "preview-templates.ts", "lib/i18n.ts"],
    execute: runPreviewImagesValidate,
  },
  {
    name: "preview.images.generate",
    description:
      "Generate build-time static PNG OG preview images for missing pages, using preset template layouts from site-kernel-checks.",
    scope: "app",
    flags: {
      "force-normalize": {
        kind: "boolean",
        description: "Re-render existing preview cards when source text needs normalization.",
      },
      forceNormalize: {
        kind: "boolean",
        description: "Legacy camelCase alias for --force-normalize.",
      },
    },
    supportsAllSites: true,
    reads: [
      "<app>/src/content/system.md",
      "<app>/src/content/**/*.md",
      "packages/ontology/biomes/**/*.yaml",
    ],
    writes: ["<app>/public/preview/**", "<app>/public/og-image.png"],
    modulePaths: ["preview-images.ts", "preview-templates.ts", "lib/i18n.ts"],
    execute: runPreviewImagesGenerate,
  },
  {
    name: "fonts.imports.generate",
    description:
      "Generate src/styles/fonts.imports.css from the biome YAML fonts section — emits @import @fontsource CSS lines for Vite bundling (RFC-0371).",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    mutatesState: true,
    writes: ["<app>/src/styles/fonts.imports.css"],
    reads: ["<app>/src/content/system.md", "packages/ontology/site-families/**/*.yaml"],
    execute: runFontsImportsGenerate,
  },
  {
    name: "fonts.contract.validate",
    description:
      "Author-time font contract validator (RFC-0371): no font binaries in public/, at least one @fontsource import, packages in package.json, approved licenses.",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: ["<app>/public/**", "<app>/package.json"],
    modulePaths: ["fonts.ts"],
    execute: runFontsContractValidate,
  },
  {
    name: "fonts.origin.validate",
    description:
      "Postbuild validator (RFC-0371): fail if any rendered HTML references an external font origin (fonts.googleapis.com, etc.).",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: ["<app>/dist/client/**/*.html"],
    modulePaths: ["fonts.ts"],
    execute: runFontsOriginValidate,
  },
  {
    name: "manifest.contract.validate",
    description:
      "Validate every *.manifest.yaml in packages/ui/src/{sections,components,pages}/ against @warpgogol/ontology manifestSchema and check colocated .astro exists (DNA-17, RFC-0023).",
    scope: "workspace",
    flags: {},
    supportsAllSites: true,
    reads: ["packages/ui/src/{sections,components,pages}/**/*.manifest.yaml"],
    modulePaths: ["manifest.ts"],
    execute: runManifestContractValidate,
  },
  {
    name: "mirror.quintet.validate",
    description:
      "Validate every .astro file in packages/ui/src/{sections,components,pages}/ has a colocated *.manifest.yaml — the fifth Mirror Quintet leg (DNA-17, RFC-0023).",
    scope: "workspace",
    flags: {},
    supportsAllSites: true,
    reads: ["packages/ui/src/{sections,components,pages}/**/*.astro"],
    modulePaths: ["manifest.ts"],
    execute: runMirrorQuintetValidate,
  },
  {
    name: "uni.registry.build",
    description:
      "Scan all *.manifest.yaml files across workspace apps and packages/ui/, validate each against manifestSchema, and emit uni.registry.yaml at the workspace root (DNA-18, RFC-0023).",
    scope: "workspace",
    flags: {},
    mutatesState: true,
    supportsAllSites: true,
    writes: ["uni.registry.yaml"],
    reads: [
      "packages/ui/src/{sections,components,pages}/**/*.manifest.yaml",
      "<app>/src/content/system.md",
    ],
    modulePaths: ["registry.ts"],
    execute: runUniRegistryBuild,
  },
  {
    name: "uni.registry.validate",
    description:
      "Validate that uni.registry.yaml is fresh — detect NEW, STALE, and CHANGED manifest entries (DNA-18, RFC-0023).",
    scope: "workspace",
    flags: {},
    supportsAllSites: true,
    reads: ["uni.registry.yaml", "packages/ui/src/{sections,components,pages}/**/*.manifest.yaml"],
    modulePaths: ["registry.ts"],
    execute: runUniRegistryValidate,
  },
  {
    name: "onboarding.yaml.import.lint",
    description:
      "Block direct YAML.parse of RFC-0076 onboarding artifacts in kernel onboarding/audit/content-discipline sources; require @warpgogol/share/onboarding-yaml (RFC-0082).",
    scope: "workspace",
    flags: {},
    supportsAllSites: true,
    reads: ["packages/os/site-kernel-checks/src/**/*.ts", "packages/os/site-kernel/src/**/*.ts"],
    modulePaths: ["onboarding-yaml-import-lint.ts"],
    execute: runOnboardingYamlImportLint,
  },
  {
    name: "archetype.registry.build",
    description:
      "Build packages/ontology/archetypes/index.yaml from RFC-0072 archetype YAML files.",
    scope: "workspace",
    flags: {},
    mutatesState: true,
    supportsAllSites: true,
    writes: ["packages/ontology/archetypes/index.yaml"],
    reads: ["packages/ontology/archetypes/**/*.yaml"],
    modulePaths: ["archetype.ts", "archetype/registry-build.ts", "archetype/shared.ts"],
    execute: runArchetypeRegistryBuild,
  },
  {
    name: "archetype.registry.validate",
    description:
      "Validate archetype catalog freshness and ensure every manifest archetype resolves to a known RFC-0072 archetype.",
    scope: "workspace",
    flags: {},
    supportsAllSites: true,
    reads: [
      "packages/ontology/archetypes/index.yaml",
      "packages/ontology/archetypes/**/*.yaml",
      "packages/ui/src/{sections,components}/**/*.manifest.yaml",
    ],
    modulePaths: ["archetype.ts", "archetype/registry-build.ts", "archetype/shared.ts"],
    execute: runArchetypeRegistryValidate,
  },
  {
    name: "cosmic.name.pick",
    description:
      "Pick a deterministic available cosmic name from an archetype's acceptedCosmicNames list.",
    scope: "workspace",
    flags: {
      archetype: {
        kind: "string",
        description: "Archetype id to target.",
      },
    },
    supportsAllSites: true,
    cacheable: false,
    execute: runCosmicNamePick,
  },
  {
    name: "cosmic.name.rename",
    description:
      "Atomically rename a cosmic name (section or component layer) across all known references: archetype YAMLs, constellation YAMLs, section/component manifests, story.md, system.md, and onboarding artifacts (RFC-0083). Requires --from, --to, --layer; supports --dry-run.",
    scope: "workspace",
    flags: {
      "dry-run": {
        kind: "boolean",
        description: "Preview changes without writing files.",
      },
      from: {
        kind: "string",
        description: "Existing cosmic name to rename from.",
      },
      to: {
        kind: "string",
        description: "Target value.",
      },
      layer: {
        kind: "string",
        description: "Cosmic/archetype layer to update.",
      },
    },
    mutatesState: true,
    supportsAllSites: true,
    writes: [
      "packages/ontology/{archetypes,constellations}/**/*.{yaml,yml,md}",
      "packages/ui/src/{sections,components}/**/*.{yaml,yml,md}",
      "apps/**/*.{yaml,yml,md}",
      "onboarding/.output/**/*.{yaml,yml,md}",
    ],
    cacheable: false,
    execute: runCosmicNameRename,
  },
  {
    name: "section.contract.validate",
    description:
      "Validate section folder contract surfaces in packages/ui/src/sections including manifest, astro, css, types/schema, and story files (RFC-0072).",
    scope: "workspace",
    flags: {},
    supportsAllSites: true,
    reads: ["packages/ui/src/sections/**"],
    modulePaths: ["archetype.ts", "archetype/section-contract.ts", "archetype/shared.ts"],
    execute: runSectionContractValidate,
  },
  {
    name: "section.similarity.report",
    description:
      "Emit a rough similarity report across section manifests to support RFC-0072 library growth decisions.",
    scope: "workspace",
    flags: {},
    supportsAllSites: true,
    cacheable: false,
    execute: runSectionSimilarityReport,
  },
  {
    name: "constellation.contract.validate",
    description:
      "Validate constellation YAML files against ontology schema and ensure slot cosmicNames are declared by archetypes (RFC-0072).",
    scope: "workspace",
    flags: {},
    supportsAllSites: true,
    reads: ["packages/ontology/constellations/**/*.yaml", "packages/ontology/archetypes/**/*.yaml"],
    modulePaths: ["archetype.ts", "archetype/constellation.ts", "archetype/shared.ts"],
    execute: runConstellationContractValidate,
  },
  {
    name: "legal.scaffold",
    description:
      "Generate Impressum and Datenschutz page+prose stubs for every DE/AT/CH locale in system.md i18n.supported. Merges nav targets and footer.legalIds/contactIds into the per-locale labels.md. Idempotent. Reads identity.legal.* from system.md; missing fields land as NEED_THIS_<FIELD> placeholders (RFC-0096).",
    scope: "app",
    flags: {
      force: {
        kind: "boolean",
        description: "Overwrite existing generated legal scaffold files.",
      },
    },
    mutatesState: true,
    supportsAllSites: true,
    writes: [
      "<app>/src/content/pages/{lang}/impressum.md",
      "<app>/src/content/pages/{lang}/datenschutz.md",
      "<app>/src/content/prose/{lang}/impressum.md",
      "<app>/src/content/prose/{lang}/datenschutz.md",
    ],
    reads: ["<app>/src/content/system.md"],
    execute: runLegalScaffold,
  },
  {
    name: "section.scaffold",
    description:
      "Generate a starter section folder from an RFC-0072 archetype contract in packages/ui/src/sections.",
    scope: "workspace",
    flags: {
      name: {
        kind: "string",
        description: "Entity or scaffold name.",
      },
      slug: {
        kind: "string",
        description: "Slug to create.",
      },
      archetype: {
        kind: "string",
        description: "Archetype id to target.",
      },
      cosmicName: {
        kind: "string",
        description: "Cosmic catalog name to assign.",
      },
      role: {
        kind: "string",
        description: "Semantic role for the scaffolded section/component.",
      },
    },
    mutatesState: true,
    supportsAllSites: true,
    writes: ["packages/ui/src/sections/{section-id}/**"],
    cacheable: false,
    execute: runSectionScaffold,
  },
  {
    name: "planet.import-paths.lint",
    description:
      "Validate derived planetImportPaths and blockTypeToCosmicName in the archetype registry against on-disk UI manifest files (RFC-0091).",
    scope: "workspace",
    flags: {},
    supportsAllSites: true,
    reads: [
      "packages/ontology/archetypes/**/*.yaml",
      "packages/ui/src/sections/**/*.manifest.yaml",
    ],
    modulePaths: ["archetype.ts", "archetype/registry-build.ts", "archetype/shared.ts"],
    execute: runPlanetImportPathsLint,
  },
  {
    name: "system-md.compile",
    description:
      "Compile system.md from a site-plan/frontmatter source into an app content directory (RFC-0072).",
    scope: "workspace",
    flags: {
      app: {
        kind: "string",
        description: "App name to use when no app context is active.",
      },
      input: {
        kind: "string",
        description: "Input file path.",
      },
      output: {
        kind: "string",
        description: "Output file path.",
      },
    },
    mutatesState: true,
    supportsAllSites: true,
    writes: ["<app>/src/content/system.md"],
    cacheable: false,
    execute: runSystemMdCompile,
  },
  {
    name: "biome.css.generate",
    description:
      "Generate src/styles/biome.generated.css from system.md biome configuration (DNA-23, RFC-0025, RFC-0071).",
    scope: "app",
    flags: {},
    mutatesState: true,
    supportsAllSites: true,
    writes: ["<app>/src/styles/biome.generated.css"],
    reads: ["<app>/src/content/system.md"],
    execute: runBiomeCssGenerate,
  },
  {
    name: "props.types.generate",
    description:
      "RFC-0262: generate <id>.types.generated.ts next to every packages/ui manifest with a propsSchema/propsSchemaCompose (marker + sourceHash, idempotent). The manifest propsSchema is the only authored prop contract.",
    scope: "workspace",
    mutatesState: true,
    supportsAllSites: true,
    writes: [
      "packages/ui/src/sections/{id}/{id}.types.generated.ts",
      "packages/ui/src/components/{id}/{id}.types.generated.ts",
    ],
    flags: {
      "dry-run": {
        kind: "boolean",
        description: "Report what would be written without touching the filesystem.",
      },
    },
    reads: ["packages/ui/src/{sections,components}/**/*.manifest.yaml"],
    execute: runPropsTypesGenerate,
  },
  {
    name: "props.contract.validate",
    description:
      "RFC-0262: validate every packages/ui manifest's generated types file is present, marker-carrying, and fresh (PROPS-01); validate any manifest `example` block against its own propsSchema (PROPS-02).",
    scope: "workspace",
    supportsAllSites: true,
    flags: {},
    reads: [
      "packages/ui/src/{sections,components}/**/*.manifest.yaml",
      "packages/ui/src/{sections,components}/**/*.types.generated.ts",
    ],
    modulePaths: ["props-contract.ts", "result-helpers.ts"],
    execute: runPropsContractValidate,
  },
  {
    name: "kernel.wire",
    description:
      "Generate app-local tools/ kernel wiring from system.md and installed package capabilities (RFC-0078).",
    scope: "workspace",
    flags: {},
    mutatesState: true,
    supportsAllSites: true,
    // RFC-0336: register outputs so command.manifest CMD-MAN-02 stays clean and
    // gitattributes.generate marks the whole tools/ tree linguist-generated.
    writes: [
      "<app>/tools/kernel.config.ts",
      "<app>/tools/modules/*.ts",
      "<app>/tools/runtime/*.ts",
    ],
    reads: ["<app>/src/content/system.md"],
    execute: runKernelWire,
  },
  /* RFC-0375: agent-facing generated file lookup */
  {
    name: "generated.file.lookup",
    description:
      "Resolve any file path to its generation metadata: generated, category, ownerCommand, regenerateCommand, editInstead, detectionMethod (RFC-0375).",
    scope: "workspace",
    flags: {
      path: { kind: "string", description: "File path to look up." },
      diff: { kind: "boolean", description: "Batch lookup all changed files in the git diff." },
      app: {
        kind: "string",
        description: "App id for app-relative path resolution. Required for app-scoped paths.",
      },
      base: { kind: "string", description: "Git ref for --diff range (default: HEAD)." },
      range: { kind: "string", description: "Git ref range for --diff (e.g. main..HEAD)." },
    },
    supportsAllSites: true,
    cacheable: false,
    execute: runGeneratedFileLookup,
  },
  /* RFC-0375: registry-declared file existence validation */
  {
    name: "generated.files.validate",
    description:
      "Check that every registry-declared generated file in GENERATOR_OWNERSHIP_MAP exists on disk (RFC-0375).",
    scope: "workspace",
    flags: {
      app: { kind: "string", description: "App id for app-scoped path resolution." },
    },
    supportsAllSites: true,
    cacheable: false,
    execute: runGeneratedFilesValidate,
  },
  /* RFC-0600: orphaned file stale detection */
  {
    name: "generated.stale.validate",
    description:
      "Detect files in public/ not produced by any registered generator in GENERATOR_OWNERSHIP_MAP (RFC-0600).",
    scope: "workspace",
    flags: {
      app: { kind: "string", description: "App id for app-scoped path resolution." },
    },
    supportsAllSites: true,
    cacheable: false,
    execute: runGeneratedStaleValidate,
  },
  /* RFC-0612: ownership registry drift detection */
  {
    name: "ownership.sync.validate",
    description:
      "Detect files in public/ not covered by GENERATOR_OWNERSHIP_MAP (OWN-01) and entries matching no file (OWN-02) (RFC-0612).",
    scope: "workspace",
    flags: {
      app: { kind: "string", description: "App id for app-scoped path resolution." },
    },
    supportsAllSites: true,
    cacheable: false,
    execute: runOwnershipSyncValidate,
  },
  /* RFC-0721: behavior snapshot staleness warning */
  {
    name: "behavior.snapshot.staleness.check",
    description:
      "Warn when system.md pages[] routes do not match behavior.snapshot.generated.yaml routes (RFC-0721). Advisory — does not fail the pipeline.",
    scope: "workspace",
    flags: {
      app: { kind: "string", description: "App id for app-scoped path resolution." },
    },
    supportsAllSites: true,
    cacheable: false,
    execute: runBehaviorSnapshotStalenessCheck,
  },
  /* RFC-0601: content drift detection in generated files */
  {
    name: "generated.drift.validate",
    description:
      "Detect content drift in text-based generated files by re-invoking owning generators with dryRun and comparing output (RFC-0601, DNA-58).",
    scope: "workspace",
    flags: {
      app: { kind: "string", description: "App id for app-scoped path resolution." },
    },
    supportsAllSites: true,
    cacheable: false,
    execute: runGeneratedDriftValidate,
  },
  /* RFC-0489: open-source SBOM registry validation */
  {
    name: "open-source.validate",
    description:
      "Validate generated open-source registry JSON, CycloneDX SBOM, and downloadable artifacts for deduplication, count consistency, and artifact presence (RFC-0489).",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: [
      "<app>/src/content/data/{lang}/open-source-registry.json",
      "<app>/public/open-source/sbom.cdx.json",
      "<app>/public/open-source/THIRD_PARTY_NOTICES.txt",
      "<app>/public/open-source/THIRD_PARTY_LICENSES.txt",
      "<app>/src/content/system.md",
    ],
    modulePaths: ["open-source-validate.ts", "result-helpers.ts", "lib/file-exists.ts"],
    execute: runOpenSourceValidate,
  },
];
