/*
<MODULE_CONTRACT>
<purpose>Maintains packages/os/site-kernel-checks/src/command-tables/07-structure-naming.ts as an authored site-kernel-checks authored module so agents can evolve it without rediscovering local boundaries.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0260: register kernel.flags.lint (typed kernel command flag schema governance).</item>
  <item>RFC-0261: register check.fixture.lint (fixture coverage ratchet for *.validate/*.lint commands).</item>
</CHANGE_SUMMARY>
*/

import type { CheckCommandEntry } from "./types.ts";
import {
  runMirrorTriadValidation,
  runQuartetMirrorValidation,
  runDispatcherSyncValidation,
} from "../structure.ts";
// werkstatt.operation.validate migrated to @webgogol/forge — see packages/forge/os/werkstatt/
import { runNamingPolicyValidate } from "../structure/naming-policy.ts";
import {
  runRouteSlimValidation,
  runFeatureVisibilityValidation,
  runSemanticMirrorValidate,
} from "../semantic.ts";
import {
  runFeatureGraphValidate,
  runFeatureLinksValidate,
  runFeatureProjectionsValidate,
} from "../feature-graph.ts";
import { runFeaturePolicyValidate, runFeatureReferencesValidate } from "../feature-policy.ts";
import { runStructureHierarchyValidate } from "../structure-hierarchy.ts";
import { runNavigationSectionValidate } from "../navigation-section.ts";
import {
  runNamingPagesLint,
  runNamingComponentsLint,
  runNamingStylesLint,
  runAssetsStructureLint,
  runNamingSuffixesLint,
  runNamingLayoutsLint,
} from "../naming.ts";
import { runScriptsPlacementValidation } from "../scripts-placement.ts";
import { runCssImportantLint } from "../css-important-lint.ts";
import { runKernelResultEnvelopeLint } from "../kernel-result-envelope-lint.ts";
import { runDiagnosticShapeLint } from "../diagnostic-shape-lint.ts";
import { runWarningDiagnosticsLint } from "../warning-diagnostics-lint.ts";
import { runKernelFlagsLint } from "../kernel-flags-lint.ts";
import { runKernelIoLint } from "../kernel-io-lint.ts";
import { runCheckFixtureLint } from "../check-fixture-lint.ts";
import { runPipelineLogHygieneValidate } from "../pipeline/pipeline-log-hygiene.ts";
import { runSchemaDriftValidate } from "../schema-drift.ts";
import { runContentTypesValidate } from "../content-types.ts";
import { runShareUtilityLint } from "../share-utility.ts";
import { runI18nConfigValidate } from "../i18n-config-validate.ts";
import { runI18nDetectImplement } from "../i18n-detect-implement.ts";
import { runPbpProfileValidate } from "../pbp-profile.ts";
import { runImageVariantsGenerate, runImageVariantsValidate } from "../image-variants.ts";
import {
  runVideoVariantsGenerate,
  runVideoVariantsValidate,
  runVideoDistPrune,
} from "../video/video-variants.ts";
import { runLiveVariantsGenerate } from "../live-variants.ts";
import { runLagebildValidate } from "../lagebild.ts";
import { runCloudflareAssetsValidate } from "../cloudflare-assets.ts";
import { runCloudflareResidencyValidate } from "../cloudflare-residency.ts";
import { runCloudflareRegionalServicesValidate } from "../cloudflare-regional-services.ts";
import { runOnboardingYamlImportLint } from "../onboarding-yaml-import-lint.ts";
import { runGeneratorOwnershipLint } from "../generator-ownership.ts";
import { runAstroExportsLint } from "../astro-exports.ts";
import { runImportExtensionsLint } from "../import-extensions.ts";
import { runTsconfigShapeLint } from "../tsconfig-shape.ts";
import { runContentLayoutsValidation } from "../checks/content-layouts.ts";

export const STRUCTURE_NAMING_COMMANDS: CheckCommandEntry[] = [
  /* Wave 1: structural mirror + dispatcher */
  {
    name: "mirror.triad.validate",
    description: "Validate three-way mirror between component content files and schema files.",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: ["<app>/src/content/**/*.md", "<app>/src/content/schemas/**/*.ts"],
    execute: runMirrorTriadValidation,
  },
  {
    name: "mirror.quartet.validate",
    description:
      "Validate four-way quartet mirror: .astro + content .md + schema .ts + optional public/scripts/*.js (RFC-0009).",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: [
      "<app>/src/pages/**/*.astro",
      "<app>/src/content/**/*.md",
      "<app>/src/content/schemas/**/*.ts",
    ],
    execute: runQuartetMirrorValidation,
  },
  {
    name: "dispatcher.sync.validate",
    description: "Validate that dispatcher registrations match actual content and schema files.",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: ["<app>/src/content/**/*.md", "<app>/src/content/schemas/**/*.ts"],
    execute: runDispatcherSyncValidation,
  },
  // naming.convention.lint migrated to @webgogol/forge — see packages/forge/os/naming/
  /* Wave 2: workspace-wide naming convention — migrated to @webgogol/forge */
  // werkstatt.operation.validate migrated to @webgogol/forge — see packages/forge/os/werkstatt/
  /* RFC-0361: Consolidated naming policy validator */
  {
    name: "naming.policy.validate",
    description:
      "Validate naming policies for Sternsystem ids, mission ids, release ids, and Bordbuch entries across all Werkstatt artifacts (RFC-0361).",
    scope: "workspace",
    flags: {
      system: {
        kind: "string",
        description: "Limit validation to one system id.",
      },
    },
    supportsAllSites: false,
    reads: ["systems/registry.yaml", "systems/*/system.pin.json", "fleet/fleet.sites.yaml"],
    execute: runNamingPolicyValidate,
  },
  /* RFC-0030 */
  {
    name: "kernel.result.envelope.lint",
    description:
      "Lint every check command file in @gogol/site-kernel-checks for the legacy flat `return { command, status, violations }` shape (DNA-35, RFC-0030).",
    scope: "workspace",
    flags: {},
    supportsAllSites: true,
    reads: ["packages/os/site-kernel-checks/src/**/*.ts"],
    execute: runKernelResultEnvelopeLint,
  },
  /* RFC-0203 / RFC-0261 */
  {
    name: "diagnostic.shape.lint",
    description:
      "Lint @gogol/site-kernel-checks for RFC-0203 diagnostic shape: DSL-02 fails on an unregistered ruleId; DSL-03 on an empty ruleId; DSL-01 on an unreadable source dir; DSL-04 ratchets resultFromViolations/failResult shim usage against a shrink-only baseline (RFC-0261). Pass --write-baseline to regenerate the DSL-04 baseline.",
    scope: "workspace",
    supportsAllSites: true,
    flags: {
      "write-baseline": {
        kind: "boolean",
        description: "Regenerate the DSL-04 shim-usage baseline instead of validating against it.",
      },
    },
    reads: ["packages/os/site-kernel-checks/src/**/*.ts"],
    execute: runDiagnosticShapeLint,
  },
  /* RFC-0247 */
  {
    name: "warning.diagnostics.lint",
    description:
      "Lint @gogol/site-kernel-checks for actionable warnings that are emitted only in summary prose instead of canonical Diagnostic[] data.",
    scope: "workspace",
    flags: {},
    supportsAllSites: true,
    reads: ["packages/os/site-kernel-checks/src/**/*.ts"],
    execute: runWarningDiagnosticsLint,
  },
  /* RFC-0260 */
  {
    name: "kernel.flags.lint",
    description:
      "Lint typed kernel command flag schemas (RFC-0260): KERNEL-FLAG-04 fails when a schema-carrying command's handler reads an undeclared flag; KERNEL-FLAG-05 ratchets commands still on the deprecated heuristic parse path. Pass --write-baseline to regenerate the baseline after a migration wave.",
    scope: "workspace",
    supportsAllSites: true,
    flags: {
      "write-baseline": {
        kind: "boolean",
        description: "Regenerate the heuristic-path baseline instead of validating against it.",
      },
    },
    reads: ["packages/os/site-kernel-checks/src/**/*.ts", "packages/os/site-kernel/src/**/*.ts"],
    execute: runKernelFlagsLint,
  },
  /* RFC-0267 */
  {
    name: "kernel.io.lint",
    description:
      "Lint kernel command modules (RFC-0267): IO-01 forbids direct node:fs/node:fs/promises/node:child_process " +
      "imports outside a shrink-only baseline — new/migrated command modules must receive IO from " +
      "KernelRuntimeContext.io (the WorkspaceIO port) instead. Pass --write-baseline to regenerate the baseline " +
      "after a migration wave.",
    scope: "workspace",
    supportsAllSites: true,
    flags: {
      "write-baseline": {
        kind: "boolean",
        description: "Regenerate the offender-file baseline instead of validating against it.",
      },
    },
    reads: ["packages/os/site-kernel-checks/src/**/*.ts", "packages/os/site-kernel/src/**/*.ts"],
    execute: runKernelIoLint,
  },
  /* RFC-0261 */
  {
    name: "check.fixture.lint",
    description:
      "Lint fixture coverage (RFC-0261): every *.validate/*.lint command must have a covering test file with at least one failing and one passing fixture. CHECK-FIX-01 no covering test; CHECK-FIX-02 covering test missing a fail or pass fixture; CHECK-FIX-03 coverage undecidable. Pass --write-baseline to regenerate the shrink-only baseline.",
    scope: "workspace",
    supportsAllSites: true,
    flags: {
      "write-baseline": {
        kind: "boolean",
        description: "Regenerate the fixture-coverage baseline instead of validating against it.",
      },
    },
    reads: ["packages/os/site-kernel-checks/src/**/*.ts"],
    execute: runCheckFixtureLint,
  },
  /* RFC-0254 */
  {
    name: "pipeline.log.hygiene.validate",
    description:
      "Validate structured pipeline log hygiene: raw console noise, fallback dedupe keys, and allowlist rationales (RFC-0254).",
    scope: "workspace",
    flags: {},
    supportsAllSites: true,
    reads: ["packages/os/site-kernel/src/**/*.ts", "packages/os/site-kernel-checks/src/**/*.ts"],
    execute: runPipelineLogHygieneValidate,
  },
  /* Wave 3: semantic integrity */
  {
    name: "route.thin.validate",
    description:
      "Validate that page route files contain no style blocks or inline style attributes.",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: ["<app>/src/pages/**/*.astro"],
    execute: runRouteSlimValidation,
  },
  {
    name: "feature.policy.validate",
    description: "Validate RFC-0183 Feature Policy fields in existing RFC-0047 content domains.",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: ["<app>/src/content/system.md", "<app>/src/content/**"],
    execute: runFeaturePolicyValidate,
  },
  {
    name: "feature.visibility.validate",
    description: "Transitional alias for RFC-0183 Feature Policy validation.",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: ["<app>/src/content/system.md", "<app>/src/content/**"],
    execute: runFeatureVisibilityValidation,
  },
  {
    name: "feature.graph.validate",
    description: "Validate feature graph structure and artifact mapping per RFC-0018.",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: ["<app>/src/content/system.md", "<app>/src/content/**"],
    execute: runFeatureGraphValidate,
  },
  {
    name: "feature.references.validate",
    description:
      "Transitional alias for feature.policy.validate (RFC-0183). Validates policy field shape; target-id ↔ content reference-graph deferred.",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: ["<app>/src/content/system.md", "<app>/src/content/**"],
    execute: runFeatureReferencesValidate,
  },
  {
    name: "feature.links.validate",
    description: "Validate internal link resolution and semantic target integrity.",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: ["<app>/src/content/**/*.md"],
    execute: runFeatureLinksValidate,
  },
  {
    name: "feature.projections.validate",
    description: "Validate semantic projection integrity and disabled target leaks.",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: ["<app>/src/content/system.md", "<app>/src/content/**"],
    execute: runFeatureProjectionsValidate,
  },
  /* Wave 3.5: RFC-0019 */
  {
    name: "structure.hierarchy.validate",
    description:
      "Validate that page routes delegate breadcrumb rendering through section/navigation-section.astro (RFC-0019).",
    scope: "app",
    flags: {
      json: {
        kind: "boolean",
        description: "Emit machine-readable JSON output.",
      },
    },
    supportsAllSites: true,
    reads: ["<app>/src/pages/**/*.astro", "packages/ui/src/sections/navigation-section/**/*.astro"],
    execute: runStructureHierarchyValidate,
  },
  {
    name: "navigation.section.validate",
    description:
      'Validate that content-declared pages with breadcrumb components declare a section with role "navigation" (RFC-0019).',
    scope: "app",
    flags: {
      json: {
        kind: "boolean",
        description: "Emit machine-readable JSON output.",
      },
    },
    supportsAllSites: true,
    reads: ["<app>/src/content/system.md", "<app>/src/content/pages/**/*.md"],
    execute: runNavigationSectionValidate,
  },
  /* Wave 4: layer-specific naming */
  {
    name: "naming.pages.lint",
    description:
      "Validate that visitor-facing route files sit under a [param]/ directory and dynamic params are lowercase.",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: ["<app>/src/pages/**/*.astro"],
    execute: runNamingPagesLint,
  },
  /* Wave 4.5: RFC-0020 */
  {
    name: "naming.suffixes.lint",
    description:
      "Validate layer-specific file suffix contracts per RFC-0020: -component for src/components root, -section for src/components/section, no suffix tokens in src/pages or src/styles.",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: ["<app>/src/components/**", "<app>/src/pages/**", "<app>/src/styles/**"],
    execute: runNamingSuffixesLint,
  },
  {
    name: "naming.layouts.lint",
    description:
      "Validate src/layouts/ singleton contract per RFC-0020: only layout.astro is permitted as a file-level entry.",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: ["<app>/src/layouts/**"],
    execute: runNamingLayoutsLint,
  },
  /* Wave 4.6: RFC-0021 */
  {
    name: "content.layouts.validate",
    description:
      "Validate layouts content layer structure per RFC-0021: src/content/layouts/[lang]/*.md and src/content/schemas/layouts/*.ts exist, schemas have no -component suffix.",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: ["<app>/src/content/layouts/**", "<app>/src/content/schemas/layouts/**"],
    execute: runContentLayoutsValidation,
  },
  /* Wave 5: layer-specific placement */
  {
    name: "scripts.placement.validate",
    description:
      "Enforce RFC-0011 script placement contract: detect AP-18/AP-19 violations (SP-01..SP-06) in .astro files.",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: ["<app>/src/pages/**/*.astro", "<app>/src/components/**/*.astro"],
    execute: runScriptsPlacementValidation,
  },
  {
    name: "naming.components.lint",
    description:
      "Validate that src/components/ contains no CSS or Markdown files (CSS → src/styles/, content → src/content/components/).",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: ["<app>/src/components/**"],
    execute: runNamingComponentsLint,
  },
  {
    name: "naming.styles.lint",
    description:
      "Validate that all CSS files live under src/styles/ and that src/styles/global.css exists.",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: ["<app>/src/styles/**"],
    execute: runNamingStylesLint,
  },
  {
    name: "assets.structure.lint",
    description:
      "Validate that raster image assets (png, jpg, webp, avif, gif) are placed in src/assets/images/.",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: ["<app>/src/assets/images/**"],
    execute: runAssetsStructureLint,
  },
  /* RFC-0033 */
  {
    name: "schema.drift.validate",
    description:
      "Scan apps/*/src/content/schemas/ for non-proxy Zod schema definitions and exit non-zero if found. Prevents reintroduction of app-local schemas retired in RFC-0033 (DNA-10, RFC-0033).",
    scope: "workspace",
    flags: {},
    supportsAllSites: true,
    reads: ["<app>/src/content/schemas/**/*.ts"],
    execute: runSchemaDriftValidate,
  },
  /* RFC-0034 */
  {
    name: "content-types.validate",
    description:
      "Validate that every manifest.yaml in packages/ui/src/{components,sections}/ with contentSchemaKey has a matching .types.ts sibling (DNA-10, RFC-0034).",
    scope: "workspace",
    flags: {},
    supportsAllSites: true,
    reads: [
      "packages/ui/src/{components,sections}/**/*.manifest.yaml",
      "packages/ui/src/{components,sections}/**/*.types.ts",
    ],
    execute: runContentTypesValidate,
  },
  /* RFC-0037 */
  {
    name: "share.utility.lint",
    description:
      "Validate that apps use @gogol/share utilities instead of re-implementing them locally. Per RFC-0037: allows astro:content imports in @gogol/share.",
    scope: "workspace",
    flags: {},
    supportsAllSites: true,
    reads: ["<app>/src/**/*.ts", "<app>/src/**/*.tsx", "packages/share/src/**/*.ts"],
    execute: runShareUtilityLint,
  },
  /* RFC-0038 */
  {
    name: "i18n.config.validate",
    description:
      "Validate i18n configuration in src/content/assets/system.md. Checks default language, supported languages, and orphan content files (RFC-0038).",
    scope: "workspace",
    flags: {},
    supportsAllSites: true,
    reads: ["<app>/src/content/system.md"],
    execute: runI18nConfigValidate,
  },
  /* RFC-0038 Wave 4 */
  {
    name: "i18n.detect.implement",
    description:
      "Auto-generate language detection middleware from system.md i18n config. Generates src/middleware/language-detect.ts and src/scripts/language-persist.ts (RFC-0038).",
    scope: "workspace",
    flags: {},
    supportsAllSites: false,
    mutatesState: true,
    writes: ["<app>/src/middleware/language-detect.ts", "<app>/src/scripts/language-persist.ts"],
    reads: ["<app>/src/content/system.md"],
    execute: runI18nDetectImplement,
  },
  /* RFC-0024 */
  {
    name: "pbp.profile.validate",
    description:
      "Validate PBP profile for an app. Checks business-profile collections exist, schemas parse correctly, and localized overlays resolve without missing anchors (RFC-0024).",
    scope: "workspace",
    flags: {},
    supportsAllSites: false,
    reads: ["<app>/src/content/business-profile/**/*.md", "packages/pbp/src/**/*.ts"],
    execute: runPbpProfileValidate,
  },
  /* RFC-0204 */
  {
    name: "image.variants.generate",
    description:
      "RFC-0204 build-portable image provider: pre-generate responsive width variants. Runs in build.prepare; idempotent.",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    mutatesState: true,
    longRunning: true,
    expectedDurationMs: 60_000,
    timeoutMs: 600_000,
    writes: ["<app>/src/image-variants.generated.yaml", "<app>/public/_img/**"],
    reads: [
      "<app>/src/content/system.md",
      "<app>/src/assets/images/**",
      "<app>/public/**/*.{png,jpg,jpeg,webp,avif,gif}",
    ],
    execute: runImageVariantsGenerate,
  },
  {
    name: "image.variants.validate",
    description:
      "RFC-0204 build-portable image provider: validate that src/image-variants.generated.yaml exists and every listed variant file is present (RFC-0204).",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: ["<app>/src/image-variants.generated.yaml", "<app>/public/_img/**"],
    execute: runImageVariantsValidate,
  },
  /* RFC-0210 */
  {
    name: "video.variants.generate",
    description:
      "RFC-0210 unified media contract: derive per-profile delivery formats (HLS ABR + MP4 + WebM + poster) from source videos via ffmpeg. Runs in build.prepare; content-addressed cache, idempotent.",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    mutatesState: true,
    longRunning: true,
    expectedDurationMs: 180_000,
    timeoutMs: 1_200_000,
    writes: [
      "<app>/src/video-manifest.generated.yaml",
      "<app>/public/_video/**",
      "<app>/.cache/video/**",
    ],
    reads: ["<app>/src/content/system.md", "<app>/public/**/*.{mp4,webm,mov}"],
    execute: runVideoVariantsGenerate,
  },
  /* RFC-0234 */
  {
    name: "live.variants.generate",
    description:
      "RFC-0234: derive the cross-device delivery set (desktop WebM + iOS-playable MP4 for opaque clips) for every living-photo clip from its single authored source. Runs in build.prepare; content-addressed cache, idempotent. Alpha clips stay poster-only on iOS.",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    mutatesState: true,
    longRunning: true,
    expectedDurationMs: 120_000,
    timeoutMs: 900_000,
    writes: [
      "<app>/src/live-video-manifest.generated.yaml",
      "<app>/public/_video/live/**",
      "<app>/.cache/video-live/**",
    ],
    reads: ["<app>/src/content/system.md", "<app>/public/**/*.{mp4,webm,mov}"],
    execute: runLiveVariantsGenerate,
  },
  {
    name: "video.variants.validate",
    description:
      "RFC-0210 unified media contract: validate that src/video-manifest.generated.yaml exists and every referenced derived artifact is present under public/_video (RFC-0210).",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: ["<app>/src/video-manifest.generated.yaml", "<app>/public/_video/**"],
    execute: runVideoVariantsValidate,
  },
  {
    name: "video.dist.prune",
    description:
      "RFC-0210 build.post: delete bundled feature/background SOURCE videos from dist/client/_astro (served from public/_video instead) so large masters don't break the Cloudflare 25 MiB asset limit. Ambient clips are untouched.",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    mutatesState: true,
    expectedDurationMs: 30_000,
    timeoutMs: 300_000,
    writes: ["<app>/dist/client/_astro/**"],
    reads: ["<app>/dist/client/**/*.html", "<app>/src/video-manifest.generated.yaml"],
    execute: runVideoDistPrune,
  },
  /* RFC-0152 */
  {
    name: "cloudflare.assets.validate",
    description:
      "Post-build guard: fail if rendered HTML references an /_astro/* asset missing from the deployable dist/client directory (RFC-0152).",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: ["<app>/dist/client/**/*.html", "<app>/dist/client/_astro/**"],
    execute: runCloudflareAssetsValidate,
  },
  /* RFC-0181 */
  {
    name: "cloudflare.residency.validate",
    description:
      "Fail if an app's wrangler.jsonc declares kv_namespaces or queues. Cloudflare KV/Queues cannot be EU-pinned; EU-resident delivery uses Upstash (RFC-0181).",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: ["<app>/wrangler.jsonc", "<app>/src/content/system.md"],
    execute: runCloudflareResidencyValidate,
  },
  /* RFC-0182 */
  {
    name: "cloudflare.regional-services.validate",
    description:
      "Validate live Cloudflare Regional Services configuration for hostnames declared in system.md deployment.cloudflare (RFC-0182).",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    cacheable: false,
    execute: runCloudflareRegionalServicesValidate,
  },
  /* RFC-0055 */
  {
    name: "i18n.middleware.generate",
    description:
      "Generate language-redirect middleware from system.md i18n config before Astro build (RFC-0055).",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    mutatesState: true,
    writes: ["<app>/src/middleware/language-redirect.ts"],
    reads: ["<app>/src/content/system.md"],
    execute: runI18nDetectImplement,
  },
];
