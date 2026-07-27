/*
<MODULE_CONTRACT>
<purpose>Maintains packages/os/site-kernel-checks/src/command-tables/04-content-quality.ts as an authored site-kernel-checks authored module so agents can evolve it without rediscovering local boundaries.</purpose>
<non-goals>
  <item>Do not implement command logic here — reference runners from validators/.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0348: updated header to v2 two-block contract.</item>
</CHANGE_SUMMARY>
*/

import type { CheckCommandEntry } from "./types.ts";
import { runPageContentValidation, runNamingContentLint } from "../checks/page-content.ts";
import { runThinCopyValidation, runSharedUiThinCopyValidation } from "../checks/thin-copy.ts";
import {
  runDesignSystemTokenLint,
  runHardcodedColorLint,
  runBiomeCoverageHint,
} from "../checks/tokens.ts";
import { runMirroringValidation } from "../checks/mirroring.ts";
import { runSemanticDriftValidation } from "../checks/semantic-drift.ts";
// compass.* handlers migrated to @webgogol/forge — see packages/forge/os/compass/
import { runContentVoiceLint } from "../content-voice.ts";
import { runPbpContentValidate } from "../content-pbp.ts";
import { runContentReferencesValidate } from "../content-references.ts";
import { runB2bModelValidate } from "../b2b-model.ts";
import { runEffectsContractValidate, runEffectsCoverageAudit } from "../effects-contract.ts";
import { runContentCoverageValidate } from "../content-coverage.ts";
import { runFooterLegalValidate } from "../footer-legal.ts";
import { runLegalTranslationValidate } from "../legal-translation.ts";
import { runLabelsShapeHint } from "../labels-shape.ts";
import { runUiI18nLint } from "../ui-i18n.ts";
import { runShareI18nLint } from "../share-i18n.ts";
import { runUiSilentDefaultsLint } from "../ui-silent-defaults.ts";
import { runContentLinksValidate } from "../content-links.ts";
import { runCssImportantLint } from "../css-important-lint.ts";
import { runGeneratorOwnershipLint } from "../generator-ownership.ts";
import { runAstroExportsLint } from "../astro-exports.ts";
import { runImportExtensionsLint } from "../import-extensions.ts";
import { runBarrelSizeLint } from "../barrel-size-lint.ts";
import { runFsWalkLint } from "../fs-walk-lint.ts";
import { runDedupHelperLint } from "../dedup-helper-lint.ts";
import { runFileSizeLint } from "../file-size-lint.ts";
import { runTsconfigShapeLint } from "../tsconfig-shape.ts";
import { runDocsCommandsGenerate, runDocsCommandsValidate } from "../docs-commands.ts";
import { runContentClaimValidate, runContentClaimReport } from "../content-claims.ts";
import { runComparativeClaimValidate } from "../comparative-claims.ts";
import { runContentFreshnessValidate, runContentFreshnessReport } from "../content-freshness.ts";
import { runContentDerivedValidate, runContentDerivedStamp } from "../content-derived.ts";
import { runSourceBindingValidate } from "../content-source-binding.ts";
import {
  runClaimLedgerAppend,
  runClaimLedgerQuery,
  runClaimLedgerProject,
} from "../content-ledger.ts";
import { runContentPlanBuild, runContentPlanStatus, runContentPlanRoute } from "../content-plan.ts";
import {
  runSourceMonitorTenantAdd,
  runSourceMonitorTenantEnable,
  runSourceMonitorTenantDisable,
  runSourceMonitorStatus,
  runSourceMonitorRun,
} from "../source-monitor.ts";

export const CONTENT_QUALITY_COMMANDS: CheckCommandEntry[] = [
  {
    name: "content.validate",
    description: "Validate page content frontmatter for required fields.",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: ["<app>/src/content/pages/**/*.md", "<app>/src/content/system.md"],
    execute: runPageContentValidation,
  },
  {
    name: "thin-copy.validate",
    description: "Detect hardcoded copy in Astro templates.",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: ["<app>/src/pages/**/*.astro"],
    execute: runThinCopyValidation,
  },
  {
    name: "shared-ui.thin-copy.validate",
    description:
      "Detect hardcoded copy in shared UI Astro sections under packages/ui/src/sections.",
    scope: "workspace",
    flags: {},
    supportsAllSites: true,
    reads: ["packages/ui/src/sections/**/*.astro"],
    execute: runSharedUiThinCopyValidation,
  },
  {
    name: "pbp.content.validate",
    description:
      "Validate business-profile markdown against PBP schemas and report NEED_THIS markers (RFC-0073, RFC-0471).",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: ["<site>/src/content/business-profile/**/*.md"],
    execute: runPbpContentValidate,
  },
  {
    name: "content.references.validate",
    description:
      "Validate every braceless collection.file.field content reference across src/content/** with file and line diagnostics (RFC-0073, RFC-0529).",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: ["<app>/src/content/**/*.md"],
    execute: runContentReferencesValidate,
  },
  {
    name: "b2b.model.validate",
    description:
      "When businessModel: b2b-only is declared in system.md, validate no B2C-specific page IDs, route slugs, navigation labels, or consumer-law prose references (§ 312g/312j, Verbraucher-Widerrufsrecht) exist (RFC-0487). No-op when businessModel is absent.",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: [
      "<app>/src/content/system.md",
      "<app>/src/content/navigation/**/*.md",
      "<app>/src/content/prose/**/*.md",
      "<app>/src/content/pages/**/*.md",
    ],
    execute: runB2bModelValidate,
  },
  {
    name: "effects.contract.validate",
    description:
      "Validate every authored effects[] assignment against the shared effect contract (target×kind admissibility, duplicate-stack) — RFC-0156.",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: ["<app>/src/content/system.md", "<app>/src/content/pages/**/*.md"],
    execute: runEffectsContractValidate,
  },
  {
    name: "effects.coverage.audit",
    description:
      "Report surviving legacy effect props in packages/ui renderers and how many files reference the effects system — RFC-0156.",
    scope: "workspace",
    flags: {},
    reads: ["packages/ui/src/{sections,components}/**/*.astro"],
    execute: runEffectsCoverageAudit,
  },
  {
    name: "content.voice.lint",
    description:
      "Lint synthesized content against forbidden phrases and preferred phrasing from voice-profile, biome, and family tone templates (RFC-0073).",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: ["<app>/src/content/**/*.md", "packages/ontology/site-families/**/*.yaml"],
    execute: runContentVoiceLint,
  },
  {
    name: "content.coverage.validate",
    description:
      "Validate onboarding author atoms coverage against synthesized content; no-op when atoms.yaml is absent (RFC-0073).",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: ["<app>/onboarding/.input/**/*.yaml", "<app>/src/content/**/*.md"],
    execute: runContentCoverageValidate,
  },
  /* Styling */
  {
    name: "tokens.ds.lint",
    description: "Lint CSS custom properties against design-system token rules.",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: ["<app>/src/styles/**/*.css"],
    execute: runDesignSystemTokenLint,
  },
  {
    name: "tokens.colors.lint",
    description: "Lint styles for raw rgba and hex color usage.",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: ["<app>/src/styles/**/*.css"],
    execute: runHardcodedColorLint,
  },
  {
    name: "css.important.lint",
    description:
      "Lint CSS files for forbidden !important declarations to maintain cascade hygiene.",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: ["<app>/src/styles/**/*.css"],
    execute: runCssImportantLint,
  },
  /* RFC-0071 */
  {
    name: "biome.coverage.hint",
    description: "Advisory — surface biome-coverage gaps without blocking the build.",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: ["<app>/src/content/system.md", "<app>/src/content/pages/**/*.md"],
    execute: runBiomeCoverageHint,
  },
  /* RFC-0087 */
  {
    name: "generator.ownership.lint",
    description:
      "Lint generator ownership map: every generated file under apps/<id>/ must be written by exactly one kernel command. Detects multi-owner paths (RFC-0087).",
    scope: "workspace",
    flags: {},
    supportsAllSites: true,
    reads: ["packages/os/site-kernel-checks/src/**/*.ts", "packages/os/site-kernel/src/**/*.ts"],
    execute: runGeneratorOwnershipLint,
  },
  /* RFC-0089 */
  {
    name: "astro.exports.lint",
    description:
      "Lint workspace package.json exports maps: every .astro file referenced as a subpath export target MUST also have a sibling key with the .astro suffix, and both MUST point to the same source file (RFC-0089).",
    scope: "workspace",
    flags: {},
    supportsAllSites: true,
    reads: ["packages/*/package.json", "packages/ui/src/{sections,components,pages}/**/*.astro"],
    execute: runAstroExportsLint,
  },
  /* RFC-0092 */
  {
    name: "import.extensions.lint",
    description:
      "Lint relative imports in packages/: every relative specifier MUST end in the on-disk .ts/.tsx extension (RFC-0092).",
    scope: "workspace",
    flags: {},
    supportsAllSites: true,
    reads: ["packages/*/src/**/*.ts", "packages/*/src/**/*.tsx"],
    execute: runImportExtensionsLint,
  },
  /* RFC-0264 */
  {
    name: "barrel.size.lint",
    description:
      "Guard the @gogol/share barrel split: BARREL-01 fails when a package's root src/index.ts exceeds the export-line threshold (error for @gogol/share, warning elsewhere); BARREL-02 fails when a symbol is exported from both the root barrel and a declared subpath (RFC-0264).",
    scope: "workspace",
    supportsAllSites: true,
    flags: {},
    reads: ["packages/*/src/index.ts", "packages/*/package.json"],
    execute: runBarrelSizeLint,
  },
  /* RFC-0303 */
  {
    name: "fs.walk.lint",
    description:
      "WALK-01: fails when a packages/** source file declares its own nested recursive readdir walker instead of importing collectFiles from @gogol/share/fs (RFC-0303).",
    scope: "workspace",
    supportsAllSites: true,
    flags: {},
    reads: ["packages/*/src/**/*.ts", "packages/*/src/**/*.tsx"],
    execute: runFsWalkLint,
  },
  {
    name: "dedup.helper.lint",
    description:
      "DEDUP-01: fails when a reserved shared-helper identifier (fileExists, collectFiles, readJsonFile, getLineColumn, collectMarkdownFiles, discoverWorkspacePackages) is re-declared locally instead of imported from its canonical home (RFC-0303).",
    scope: "workspace",
    supportsAllSites: true,
    flags: {},
    reads: ["packages/*/src/**/*.ts", "packages/*/src/**/*.tsx"],
    execute: runDedupHelperLint,
  },
  {
    name: "file.size.lint",
    description:
      "SIZE-01: flags a packages/** .ts/.tsx source file exceeding a 600-line threshold (warning 601-1200, error 1200+), against a shrink-only ratchet baseline. Pass --write-baseline to regenerate the baseline after a split wave (RFC-0303).",
    scope: "workspace",
    supportsAllSites: true,
    flags: {
      "write-baseline": {
        kind: "boolean",
        description: "Regenerate the oversized-file baseline instead of validating against it.",
      },
    },
    reads: ["packages/*/src/**/*.ts", "packages/*/src/**/*.tsx"],
    execute: runFileSizeLint,
  },
  {
    name: "tsconfig.shape.lint",
    description:
      "Lint tsconfig.json files under packages/: shared base must allow .ts imports and node-lib must rewrite emitted relative imports (RFC-0092).",
    scope: "workspace",
    flags: {},
    supportsAllSites: true,
    reads: ["packages/*/tsconfig.json", "tsconfig/*.json"],
    execute: runTsconfigShapeLint,
  },
  /* RFC-0222 */
  {
    name: "docs.commands.generate",
    description: "Generate docs/COMMANDS.md from the live Site OS command registry (RFC-0222).",
    scope: "workspace",
    flags: {},
    mutatesState: true,
    writes: ["docs/COMMANDS.md"],
    reads: ["packages/os/site-kernel-checks/src/command-tables/**/*.ts"],
    execute: runDocsCommandsGenerate,
  },
  {
    name: "docs.commands.validate",
    description: "Validate docs/COMMANDS.md against the live Site OS command registry (RFC-0222).",
    scope: "workspace",
    flags: {},
    reads: ["docs/COMMANDS.md", "packages/os/site-kernel-checks/src/command-tables/**/*.ts"],
    execute: runDocsCommandsValidate,
  },
  /* RFC-0095 */
  {
    name: "labels.shape.hint",
    description:
      "Soft warnings on labels.md shape — currently flags brandTagline strings longer than the header's truncation comfort zone (~40 chars). Always exits 0; emits hints (RFC-0095).",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: ["<app>/src/content/site/*/labels.md"],
    execute: runLabelsShapeHint,
  },
  /* RFC-0189 */
  {
    name: "ui.i18n.lint",
    description:
      "Scan packages/ui/src/{sections,components}/ for hardcoded human-readable strings and non-trivial resolveLabel fallbacks (RFC-0189).",
    scope: "workspace",
    flags: {
      path: {
        kind: "string",
        description: "Override the default scan path.",
      },
    },
    supportsAllSites: true,
    reads: ["packages/ui/src/{sections,components}/**/*.astro"],
    execute: runUiI18nLint,
  },
  /* RFC-0230 */
  {
    name: "share.i18n.lint",
    description:
      "Scan registered @gogol/share UI-facing helper targets for unclassified hardcoded public strings (RFC-0230).",
    scope: "workspace",
    flags: {
      path: {
        kind: "string",
        description: "Override the default scan path.",
      },
    },
    supportsAllSites: true,
    reads: ["packages/share/src/**/*.ts"],
    execute: runShareI18nLint,
  },
  /* RFC-0206 */
  {
    name: "content.links.validate",
    description:
      "Validate authored content URLs and anchors: detect broken same-page anchors, language-prefixed anchors, and unresolved internal paths (RFC-0206).",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: ["<app>/src/content/**/*.md"],
    execute: runContentLinksValidate,
  },
  /* RFC-0205 */
  {
    name: "ui.silent-defaults.lint",
    description:
      'Scan packages/ui/src/{sections,components}/ for silent empty-string fallbacks (?? "", = "", defaultContent) on UI-visible text props (RFC-0205).',
    scope: "workspace",
    flags: {
      path: {
        kind: "string",
        description: "Override the default scan path.",
      },
    },
    supportsAllSites: true,
    reads: ["packages/ui/src/{sections,components}/**/*.astro"],
    execute: runUiSilentDefaultsLint,
  },
  /* RFC-0095: DE/EU locale legal-page guard */
  {
    name: "footer.legal.validate",
    description:
      "For DE/AT/CH locales, verify footer.legalIds in site/<lang>/labels.md is non-empty (Impressum + Datenschutz are legally required by § 5 TMG and DSGVO). RFC-0095.",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: ["<app>/src/content/site/*/labels.md", "<app>/src/content/system.md"],
    execute: runFooterLegalValidate,
  },
  /* RFC-0174 */
  {
    name: "legal.translation.validate",
    description:
      "Validate the RFC-0174 binding-language policy: every page `translation` block is internally consistent (status enum, binding never disabled, mandatory notice on while a locale is unofficial, binding-language file present, disabled locales have a fallback).",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: ["<app>/src/content/pages/**/*.md"],
    execute: runLegalTranslationValidate,
  },
  /* Content naming */
  {
    name: "naming.content.lint",
    description: "Lint content page filenames for kebab-case naming convention.",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: ["<app>/src/content/pages/**/*.md"],
    execute: runNamingContentLint,
  },
  /* SEO */
  {
    name: "semantic.drift.validate",
    description: "Validate SEO metadata fields for drift, duplication, and length issues.",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: ["<app>/src/content/pages/**/*.md"],
    execute: runSemanticDriftValidation,
  },
  // compass.* migrated to @webgogol/forge — see packages/forge/os/compass/
  /* Compass scaffolding — migrated to @webgogol/forge */
  {
    name: "content.claim.validate",
    description:
      "Validate CKL claim sidecars (*.claims.yaml): schema, field-path resolution, external sourceRef (RFC-0212).",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: ["<app>/src/content/**/*.claims.yaml"],
    execute: runContentClaimValidate,
  },
  {
    name: "comparative.claim.validate",
    description:
      "Validate comparative commercial claims: source, Stand date, cadence, review gate (RFC-0323).",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: ["<app>/src/content/**/*.claims.yaml"],
    execute: runComparativeClaimValidate,
  },
  {
    name: "content.claim.report",
    description:
      "Report CKL provenance coverage over load-bearing business fields; never fails (RFC-0212).",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    cacheable: false,
    execute: runContentClaimReport,
  },
  {
    name: "content.freshness.validate",
    description:
      "Evaluate CKL claim temporal windows; write the authored Freshness Ledger; expired blocking claims fail (RFC-0213).",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: ["<app>/src/content/**/*.claims.yaml"],
    execute: runContentFreshnessValidate,
  },
  {
    name: "content.freshness.report",
    description: "CKL Freshness Ledger health view; never fails (RFC-0213).",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    cacheable: false,
    execute: runContentFreshnessReport,
  },
  {
    name: "content.derived.validate",
    description:
      "Detect outdated derived claims (translation/copy whose sourceHash drifted from its source) (RFC-0215).",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: ["<app>/src/content/**/*.md", "<app>/src/content/**/*.claims.yaml"],
    execute: runContentDerivedValidate,
  },
  {
    name: "content.derived.stamp",
    description:
      "Re-stamp a derived claim's sourceHash + asOf after updating it; refuses on missing source (RFC-0215).",
    scope: "app",
    flags: {
      subject: {
        kind: "string",
        description: "Claim subject path.",
      },
    },
    supportsAllSites: false,
    cacheable: false,
    execute: runContentDerivedStamp,
  },
  /* RFC-0217: claim ledger */
  {
    name: "content.claim.ledger.append",
    description:
      "Append an immutable ClaimEvent to the append-only ledger (src/content/ledger/claims.ndjson); idempotent by event id (RFC-0217).",
    scope: "app",
    flags: {
      subject: {
        kind: "string",
        description: "Claim subject path.",
      },
      actor: {
        kind: "string",
        description: "Claim ledger actor id.",
      },
      "as-of": {
        kind: "string",
        description: "Claim validity date in YYYY-MM-DD form.",
      },
      event: {
        kind: "string",
        description: "Claim ledger event kind.",
      },
      provenance: {
        kind: "string",
        description: "Claim provenance value.",
      },
      value: {
        kind: "string",
        description: "Claim value payload.",
      },
      "source-ref": {
        kind: "string",
        description: "Claim source reference id.",
      },
      supersedes: {
        kind: "string",
        description: "Claim event id superseded by this event.",
      },
    },
    supportsAllSites: false,
    cacheable: false,
    execute: runClaimLedgerAppend,
  },
  {
    name: "content.claim.ledger.query",
    description:
      "Query a claim's value as of a date, or its full lineage across the ledger (RFC-0217).",
    scope: "app",
    flags: {
      subject: {
        kind: "string",
        description: "Claim subject path.",
      },
      "as-of": {
        kind: "string",
        description: "Claim validity date in YYYY-MM-DD form.",
      },
      lineage: {
        kind: "boolean",
        description: "Include claim lineage records.",
      },
    },
    supportsAllSites: false,
    reads: ["<app>/src/content/ledger/claims.ndjson"],
    execute: runClaimLedgerQuery,
  },
  {
    name: "content.claim.ledger.project",
    description:
      "Project the temporal knowledge graph (src/knowledge.generated.yaml) and per-page temporal SEO (src/seo/temporal.generated.yaml) from the ledger; emits CKL-LEDG-01/02 integrity diagnostics (RFC-0217).",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: ["<app>/src/content/ledger/claims.ndjson"],
    execute: runClaimLedgerProject,
  },
  /* RFC-0216: maintenance planner */
  {
    name: "content.plan.build",
    description:
      "Consolidate CKL freshness/source/derived signals into dated MaintenanceTasks; write src/maintenance-plan.generated.yaml (RFC-0216).",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: ["<app>/src/content/**/*.claims.yaml", "<app>/src/content/ledger/claims.ndjson"],
    execute: runContentPlanBuild,
  },
  {
    name: "content.plan.status",
    description:
      "Report open/overdue/blocking maintenance tasks and the amber/red gate counts; never fails (RFC-0216).",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    cacheable: false,
    execute: runContentPlanStatus,
  },
  {
    name: "content.plan.route",
    description:
      "Export maintenance tasks to the Lagebild agent-intake outbox (Phase 2 stub) (RFC-0216).",
    scope: "app",
    flags: {},
    supportsAllSites: false,
    cacheable: false,
    execute: runContentPlanRoute,
  },
  /* RFC-0214: external source binding + Truth Monitor */
  {
    name: "source.binding.validate",
    description:
      "Validate source descriptors (integrations/truth-sources/*.yaml) and check every claim sourceRef resolves; surface Truth Monitor outbox divergences (RFC-0214).",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: ["integrations/truth-sources/*.yaml", "<app>/src/content/**/*.claims.yaml"],
    execute: runSourceBindingValidate,
  },
  {
    name: "source.monitor.tenant.add",
    description:
      "Register a source descriptor in the Truth Monitor registry (disabled by default) (RFC-0214).",
    scope: "workspace",
    flags: {
      source: {
        kind: "string",
        description: "Source descriptor id or source label.",
      },
    },
    supportsAllSites: false,
    cacheable: false,
    execute: runSourceMonitorTenantAdd,
  },
  {
    name: "source.monitor.tenant.enable",
    description: "Enable monitoring for a registered source descriptor (RFC-0214).",
    scope: "workspace",
    flags: {
      source: {
        kind: "string",
        description: "Source descriptor id or source label.",
      },
    },
    supportsAllSites: false,
    cacheable: false,
    execute: runSourceMonitorTenantEnable,
  },
  {
    name: "source.monitor.tenant.disable",
    description: "Disable monitoring for a registered source descriptor (RFC-0214).",
    scope: "workspace",
    flags: {
      source: {
        kind: "string",
        description: "Source descriptor id or source label.",
      },
    },
    supportsAllSites: false,
    cacheable: false,
    execute: runSourceMonitorTenantDisable,
  },
  {
    name: "source.monitor.status",
    description:
      "Show registered/enabled Truth Monitor sources and their current state (RFC-0214).",
    scope: "workspace",
    flags: {},
    supportsAllSites: false,
    cacheable: false,
    execute: runSourceMonitorStatus,
  },
  {
    name: "source.monitor.run",
    description:
      "Fetch all enabled sources, compare to bound claim values, write divergences to the outbox (RFC-0214).",
    scope: "workspace",
    flags: {},
    supportsAllSites: false,
    cacheable: false,
    execute: runSourceMonitorRun,
  },
];
