/*
<MODULE_CONTRACT>
<purpose>Maintains packages/os/site-kernel-checks/src/command-tables/08-section-framework.ts as an authored site-kernel-checks authored module so agents can evolve it without rediscovering local boundaries.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Tidied by compass.changesummary.tidy; see git history for prior entries.</item>
</CHANGE_SUMMARY>
*/

import type { CheckCommandEntry } from "./types.ts";
import {
  runSectionShellContractValidate,
  runSectionBackgroundContractValidate,
  runSectionHeaderContractValidate,
  runSectionBodyContractValidate,
  runSectionCtaContractValidate,
  runSectionImageContractValidate,
  runSectionMotionContractValidate,
  runSiteBackgroundContractValidate,
  runLayoutOrchestratorLint,
} from "../section-framework.ts";
import {
  runSectionShellColorTokenLint,
  runSectionShellTokenContractValidate,
} from "../section-shell-tokens.ts";
import {
  runSharedSectionPropsContractValidate,
  runSharedSectionPropsChangelogReport,
} from "../shared-section-props.ts";
import { runSectionPlaceholderLint } from "../section-placeholder.ts";
import { runSectionCssImportValidate } from "../section-framework/css-import.ts";
import { runBiomeTokensValidate } from "../biome-tokens.ts";
import { runTokensCatalogSync } from "../tokens-catalog-sync.ts";

export const SECTION_FRAMEWORK_COMMANDS: CheckCommandEntry[] = [
  /* RFC-0111: static validator suite for the RFC-0101..RFC-0106 section framework */
  {
    name: "section.shell.contract.validate",
    description:
      "Validate every section .astro under packages/ui/src/sections renders through <SectionShell>. Rejects raw <section> roots, missing SectionShell imports, and any reference to the deleted VisualModifiers (RFC-0101 + RFC-0107).",
    scope: "workspace",
    flags: {},
    supportsAllSites: true,
    reads: ["packages/ui/src/sections/**/*.astro"],
    execute: runSectionShellContractValidate,
  },
  {
    name: "section.background.contract.validate",
    description:
      "Validate every section manifest composes the `section-visual` fragment via propsSchemaCompose and does not declare flat legacy visual-modifier props at the manifest propsSchema root (RFC-0101 + RFC-0110).",
    scope: "workspace",
    flags: {},
    supportsAllSites: true,
    reads: ["packages/ui/src/sections/**/*.manifest.yaml"],
    execute: runSectionBackgroundContractValidate,
  },
  {
    name: "section.header.contract.validate",
    description:
      "Validate every section uses <SectionHeader> for headings; raw <h1>/<h2> with section-heading classes inside packages/ui/src/sections are rejected (RFC-0102).",
    scope: "workspace",
    flags: {},
    supportsAllSites: true,
    reads: ["packages/ui/src/sections/**/*.astro"],
    execute: runSectionHeaderContractValidate,
  },
  {
    name: "section.body.contract.validate",
    description:
      "Validate every section archetype declares bodyKind and composes the matching body-{kind} fragment. Cross-checks propsSchema.compose against the catalog (RFC-0103 + RFC-0110).",
    scope: "workspace",
    flags: {},
    supportsAllSites: true,
    reads: ["packages/ui/src/sections/**/*.manifest.yaml", "packages/ontology/src/**/*.ts"],
    execute: runSectionBodyContractValidate,
  },
  {
    name: "section.cta.contract.validate",
    description:
      'Validate CTAs in shared sections render through <SectionCta> or <SectionCtaGroup>. Raw <a class="btn ..."> markup inside packages/ui/src/sections is rejected (RFC-0104).',
    scope: "workspace",
    flags: {},
    supportsAllSites: true,
    reads: ["packages/ui/src/sections/**/*.astro"],
    execute: runSectionCtaContractValidate,
  },
  {
    name: "section.image.contract.validate",
    description:
      "Validate authored images flow through <SectionImage>. Raw <Image> from astro:assets is allowed only in composite sections. Rejects flat imageFade* keys at manifest propsSchema root (RFC-0104 + RFC-0115).",
    scope: "workspace",
    flags: {},
    supportsAllSites: true,
    reads: ["packages/ui/src/sections/**/*.astro", "packages/ui/src/sections/**/*.manifest.yaml"],
    execute: runSectionImageContractValidate,
  },
  /* RFC-0598: colocated CSS import integrity */
  {
    name: "section.css.import.validate",
    description:
      "Validate every colocated .css file under packages/ui/src/sections/ and packages/ui/src/components/ is imported by at least one .astro file (CSS-IMPORT-01) and that .css filename matches colocated .astro filename (CSS-NAME-01).",
    scope: "workspace",
    flags: {},
    supportsAllSites: true,
    reads: [
      "packages/ui/src/sections/**/*.css",
      "packages/ui/src/sections/**/*.astro",
      "packages/ui/src/components/**/*.css",
      "packages/ui/src/components/**/*.astro",
    ],
    execute: runSectionCssImportValidate,
  },
  /* RFC-0122 */
  {
    name: "tokens.colors.section-shell.lint",
    description:
      "Lint CSS under packages/ui/src/components/{section-shell,section-header,section-body,section-cta,section-cta-group,section-image,site-background}: raw #hex, rgb()/rgba(), and hsl()/hsla() are forbidden (RFC-0098 + RFC-0108 + RFC-0122).",
    scope: "workspace",
    flags: {},
    supportsAllSites: true,
    reads: [
      "packages/ui/src/components/{section-shell,section-header,section-body,section-cta,section-cta-group,section-image,site-background}/**/*.css",
    ],
    execute: runSectionShellColorTokenLint,
  },
  /* RFC-0124 */
  {
    name: "tokens.section-shell.contract.validate",
    description:
      "Verify every --ds-* token referenced under the eight section-framework component directories exists in @warpgogol/werkstatt-site/tokens TOKEN_NAME_SET (RFC-0108 + RFC-0124).",
    scope: "workspace",
    flags: {},
    supportsAllSites: true,
    reads: [
      "packages/ui/src/components/{section-shell,section-header,section-body,section-cta,section-cta-group,section-image,site-background}/**/*.css",
      "packages/tokens/src/**/*.ts",
    ],
    execute: runSectionShellTokenContractValidate,
  },
  {
    name: "section.motion.contract.validate",
    description:
      "Per-app: enforce that page motion (reveal / parallax / stagger) stays within the biome motionStance envelope (RFC-0106).",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: ["<app>/src/content/system.md", "<app>/src/content/pages/**/*.md"],
    execute: runSectionMotionContractValidate,
  },
  {
    name: "site.background.contract.validate",
    description:
      "Per-app: validate that the site-background shell block is declared at most once per page and conforms to SiteBackgroundConfig (RFC-0105).",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: ["<app>/src/content/system.md", "<app>/src/content/pages/**/*.md"],
    execute: runSiteBackgroundContractValidate,
  },
  {
    name: "layout.orchestrator.lint",
    description:
      "Per-app: cross-check apps/<id>/src/scripts/layout-orchestrator.ts opt-in flags against the composed pages (RFC-0106).",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: ["<app>/src/scripts/layout-orchestrator.ts", "<app>/src/content/system.md"],
    execute: runLayoutOrchestratorLint,
  },
  /* RFC-0119: shared section props fragment catalog versioning */
  {
    name: "shared.section-props.contract.validate",
    description:
      "Validate the SHARED_SECTION_PROPS catalog: every entry has at least `latest`; when `prior` is present, its schemaVersion is exactly one less than `latest`; no more than two adjacent versions per id (RFC-0119).",
    scope: "workspace",
    flags: {},
    supportsAllSites: true,
    reads: ["packages/ontology/src/**/*.ts"],
    execute: runSharedSectionPropsContractValidate,
  },
  {
    name: "shared.section-props.changelog.report",
    description:
      "Report the latest schemaVersion + changelog one-liner for every fragment in the SHARED_SECTION_PROPS catalog (RFC-0119). Always exits 0 (advisory only).",
    scope: "workspace",
    flags: {},
    supportsAllSites: true,
    cacheable: false,
    execute: runSharedSectionPropsChangelogReport,
  },
  /* RFC-0093 */
  {
    name: "section.placeholder.lint",
    description:
      "Lint packages/ui/src/sections for section components that still render the JSON.stringify scaffold stub. Failing means the section is unfit to ship (RFC-0093).",
    scope: "workspace",
    flags: {},
    supportsAllSites: true,
    reads: ["packages/ui/src/sections/**/*.astro"],
    execute: runSectionPlaceholderLint,
  },
  /* RFC-0201 */
  {
    name: "biome.tokens.validate",
    description:
      "Validate CSS token usage against active app biomes. Reports BIOME-TOKEN-01..04 (RFC-0201).",
    scope: "app",
    flags: {
      app: {
        kind: "string",
        description: "App name to use when no app context is active.",
      },
      all: {
        kind: "boolean",
        description: "Run across all registered apps.",
      },
    },
    supportsAllSites: true,
    reads: ["<app>/src/content/system.md", "<app>/src/**/*.css", "packages/tokens/src/**/*.ts"],
    execute: runBiomeTokensValidate,
  },
  /* tokens.catalog.sync — drift guard between tokens.css and TOKEN_NAMES */
  {
    name: "tokens.catalog.sync",
    description:
      "Verify that every --ds-* custom property in packages/tokens/src/tokens.css is listed in @warpgogol/werkstatt-site/tokens TOKEN_NAMES and vice versa. Reports drift in both directions.",
    scope: "workspace",
    flags: {},
    supportsAllSites: true,
    reads: ["packages/tokens/src/tokens.css", "packages/tokens/src/**/*.ts"],
    execute: runTokensCatalogSync,
  },
];
