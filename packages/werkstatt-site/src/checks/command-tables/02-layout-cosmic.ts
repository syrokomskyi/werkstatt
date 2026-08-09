/*
<MODULE_CONTRACT>
<purpose>Maintains packages/os/site-kernel-checks/src/command-tables/02-layout-cosmic.ts as an authored site-kernel-checks authored module so agents can evolve it without rediscovering local boundaries.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Tidied by compass.changesummary.tidy; see git history for prior entries.</item>
</CHANGE_SUMMARY>
*/

import type { CheckCommandEntry } from "./types.ts";
import { runAppLayoutValidate } from "../app-layout.ts";
import { runSystemManifestValidate, runConstellationComposeValidate } from "../system-manifest.ts";
import { runBiomeContractValidate } from "../biome.ts";
import { runFamilyContractValidate, runFamilyList } from "../family.ts";
import { runCosmicCatalogValidate, runCosmicNameUnique } from "../cosmic.ts";
import { runCosmicLiteralsLint } from "../cosmic-literals-lint.ts";
import { runClientEditValidate } from "../client-edit.ts";
import { runContentSurfaceValidate } from "../content-surface.ts";
import { runContentAssetContractValidate } from "../content-asset-contract.ts";
import { runAssetReferenceValidate } from "../asset-reference.ts";
import { runContentSourceParity } from "../content-source-parity.ts";

export const LAYOUT_COSMIC_COMMANDS: CheckCommandEntry[] = [
  /* Wave 0 (RFC-0025): Cosmic overlay + feature-first layout */
  {
    name: "app.layout.validate",
    description:
      "Validate the feature-first app layout contract (DNA-21, RFC-0025): no src/assets/images/, no tokens-override.css, src/content/ present, src/content/system.md present, no per-feature CSS.",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: ["<app>/src/content/system.md", "<app>/src/content/**"],
    execute: runAppLayoutValidate,
  },
  {
    name: "system.manifest.validate",
    description:
      "Validate apps/<app>/src/content/system.md against systemManifestSchema, fail on legacy system.yaml, check identity.systemStar usage, and verify constellation slugs resolve (DNA-23, RFC-0025, RFC-0077).",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: ["<app>/src/content/system.md"],
    execute: runSystemManifestValidate,
  },
  {
    name: "biome.contract.validate",
    description:
      "Validate all biome YAML files against the RFC-0071 extended biome schema, cross-check family linkage, check system.md identity.biome references, and detect forbidden app-local CSS drift.",
    scope: "workspace",
    flags: {},
    supportsAllSites: true,
    reads: ["packages/ontology/site-families/**/*.yaml", "<app>/src/content/system.md"],
    execute: runBiomeContractValidate,
  },
  {
    name: "family.contract.validate",
    description:
      "Validate packages/ontology/site-families/<id>/family.yaml contracts, companion files, and recipe references (RFC-0071).",
    scope: "workspace",
    flags: {},
    supportsAllSites: true,
    reads: ["packages/ontology/site-families/**/*.yaml"],
    execute: runFamilyContractValidate,
  },
  {
    name: "family.list",
    description:
      "List all site-family entries and their detection signals for onboarding workflows (RFC-0071).",
    scope: "workspace",
    flags: {},
    supportsAllSites: true,
    cacheable: false,
    execute: runFamilyList,
  },
  {
    name: "cosmic.catalog.validate",
    description:
      "Validate every cosmicName in every manifest.yaml is a member of the correct closed catalog for its layer: star→page, planet→section, moon→component (DNA-23, RFC-0025).",
    scope: "workspace",
    flags: {},
    supportsAllSites: true,
    reads: [
      "packages/ui/src/sections/**/*.manifest.yaml",
      "packages/ui/src/components/**/*.manifest.yaml",
    ],
    execute: runCosmicCatalogValidate,
  },
  {
    name: "cosmic.name.unique",
    description:
      "Validate every cosmicName is unique across the entire workspace — no two manifests may share the same cosmicName (DNA-23, RFC-0025).",
    scope: "workspace",
    flags: {},
    supportsAllSites: true,
    reads: [
      "packages/ui/src/sections/**/*.manifest.yaml",
      "packages/ui/src/components/**/*.manifest.yaml",
    ],
    execute: runCosmicNameUnique,
  },
  {
    name: "cosmic.literals.lint",
    description:
      "Fail when any Star/Planet/Moon cosmic-catalog name appears as a string literal in packages/share/src — cosmic-name-keyed dispatch behavior must derive from @warpgogol/werkstatt-site/ontology/archetypes instead (RFC-0263).",
    scope: "workspace",
    supportsAllSites: true,
    flags: {},
    reads: ["packages/share/src/**/*.ts"],
    execute: runCosmicLiteralsLint,
  },
  {
    name: "constellation.compose.validate",
    description:
      "Validate constellation slot order against the app's section manifests: missing required slots and order violations exit non-zero (DNA-23, RFC-0025).",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: ["<app>/src/content/system.md", "packages/ui/src/sections/**/*.manifest.yaml"],
    execute: runConstellationComposeValidate,
  },
  {
    name: "client.edit.validate",
    description:
      "Deploy gate: validate every system.md clientEditable[] key resolves to an existing content file (DNA-22, RFC-0025).",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: ["<app>/src/content/system.md", "<app>/src/content/**"],
    execute: runClientEditValidate,
  },
  /* RFC-0047: CMS-friendly thin app content surface */
  {
    name: "content.surface.validate",
    description:
      "Validate CMS-friendly thin app content surface: single system.md, semantic folders, no legacy components/sections/features/layouts or app-local component schema/dispatcher surfaces, content-local assets, public exceptions only, author-facing block types (RFC-0047, RFC-0077).",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: ["<app>/src/content/**"],
    execute: runContentSurfaceValidate,
  },
  {
    name: "content.asset.contract.validate",
    description:
      "Validate RFC-0248 content asset resolver/validator parity, bare-filename token syntax, multi-domain lookup, and default-language fallback.",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: ["<app>/src/content/**", "packages/share/src/content/**"],
    execute: runContentAssetContractValidate,
  },
  /* RFC-0141: Content Source Provider seam validators */
  {
    name: "content.source.parity",
    description:
      "Migration guard: verify the filesystem Content Source Provider enumerates the same content set as the on-disk files, with one well-formed {lang}/{slug} id per file and no collisions (RFC-0141).",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: ["<app>/src/content/**"],
    execute: runContentSourceParity,
  },
  {
    name: "asset.reference.validate",
    description:
      "Verify every content asset token resolves through the active (filesystem) Content Source Provider with default-language fallback. Warning mode: reports unresolved tokens without failing the build (RFC-0141).",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: ["<app>/src/content/**"],
    execute: runAssetReferenceValidate,
  },
];
