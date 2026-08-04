/*
<MODULE_CONTRACT>
<purpose>Consolidated command table for infrastructure contracts: independent QA, gitattributes/generated-edit guard, env contract, fingerprint, agent environment audit, YAML contract lint, and YAML parse validation.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Merged 33-independent-qa.ts, 34-gitattributes.ts, 36-env-contract.ts, 37-fingerprint.ts, 38-agent-environment.ts, 39-yaml-contract.ts into infra-contracts.ts.</item>
  <item>RFC-0493: added yaml.parse.validate command entry.</item>
</CHANGE_SUMMARY>
*/

import type { CheckCommandEntry } from "./types.ts";
import { runIndependentQa } from "../independent-qa.ts";
import { runMissionCheck, runAxiomReport } from "../axiom-adapter.ts";
import { runGitattributesGenerate, runGitattributesValidate } from "../gitattributes.ts";
import { runGeneratedEditGuard } from "../generated-edit-guard.ts";
import {
  runEnvContractValidate,
  runEnvLocalCheck,
  runEnvMainCheck,
  runEnvAltCheck,
  runDeployScriptsValidate,
} from "../env/env-contract.ts";
import { runDeployPreflight } from "../env/deploy-preflight.ts";
import {
  runFingerprintCalculate,
  runFingerprintUsageLint,
  runFingerprintFixturesValidate,
} from "../fingerprint-commands.ts";
import { runAgentEnvironmentAudit } from "../agent/agent-environment-audit.ts";
import { runYamlContractLint } from "../yaml-contract-lint.ts";
import { runYamlParseValidate } from "../yaml-parse-validate.ts";
import { runCommandReadsValidate } from "../command-reads-validate.ts";
import { runPlaywrightChromiumEnsure } from "../playwright-chromium-ensure.ts";
import { runMethodologiesValidate } from "../methodologies-validate.ts";

// Note: evidence.sync and evidence.fetch are registered by createEvidenceModule
// in @warpgogol/site-kernel-handoff/src/evidence/evidence-module.ts (RFC-0651).
// They are NOT included in INFRA_CONTRACTS_COMMANDS to avoid duplicate registration.
// RFC-0652: evidence.sync is invoked by mission.close (mandatory, via executeKernelCommand)
// and leitstand.dev-deploy (best-effort, via executeKernelCommand after axiom.report).
// mission.cleanup removes evidence/axiom/** based on --evidence-retention-days.

export const INFRA_CONTRACTS_COMMANDS: CheckCommandEntry[] = [
  {
    name: "qa.independent.run",
    description:
      "RFC-0333: serve apps/<app>/dist/client and execute every page probe from accepted/implemented " +
      "RFCs in a headless browser. Reads ONLY dist/client and RFC frontmatter — never app/package source. " +
      "QA-IND-01 on assertion failure, QA-IND-02 on missing dist, QA-IND-03 on zero probes (fast path).",
    scope: "app",
    supportsAllSites: true,
    mutatesState: false,
    cacheable: false,
    reads: ["<app>/dist/client/**", "docs/rfcs/**/*.md"],
    flags: {
      rfc: {
        kind: "string",
        description: "Restrict to a single RFC's page probes (e.g. --rfc RFC-0322).",
      },
    },
    execute: runIndependentQa,
  },
  {
    name: "gitattributes.generate",
    description:
      "Rewrite the machine-managed generated-artifacts block in root .gitattributes from " +
      "docs/command-manifest.generated.yaml writes globs + GENERATOR_OWNERSHIP_MAP, marking every " +
      "pattern linguist-generated=true (RFC-0336). Never hand-edit the managed block.",
    scope: "workspace",
    flags: {},
    mutatesState: true,
    reads: ["docs/command-manifest.generated.yaml", ".gitignore", ".gitattributes"],
    writes: [".gitattributes"],
    execute: runGitattributesGenerate,
  },
  {
    name: "gitattributes.validate",
    description:
      "Validate the managed .gitattributes block is present and fresh (GITATTR-01), sorted/normalized " +
      "(GITATTR-02), and warn when a tracked marker-carrying file has no covering pattern (GITATTR-03) (RFC-0336).",
    scope: "workspace",
    flags: {},
    reads: [
      ".gitattributes",
      ".gitignore",
      "docs/command-manifest.generated.yaml",
      "apps/*/**",
      "missions/*/workpiece/**",
    ],
    execute: runGitattributesValidate,
  },
  {
    name: "generated.edit.guard",
    description:
      "Fail when a file carrying GENERATED_MARKER changed without its owning generator/template " +
      "changing in the same range (GEN-EDIT-01), or the marker was removed without a documented " +
      "exemption (GEN-EDIT-02). Range defaults to the working tree vs HEAD; pass --range <rev-range> " +
      "for CI (RFC-0336).",
    scope: "workspace",
    flags: {
      range: {
        kind: "string",
        description: "git rev-range to check (default: working tree vs HEAD).",
      },
      base: {
        kind: "string",
        description: "Shorthand for --range <base>..HEAD.",
      },
    },
    reads: ["**"],
    execute: runGeneratedEditGuard,
  },
  {
    name: "env.contract.validate",
    description:
      "Validate .env.example presence (ENV-CONTRACT-01), comments (ENV-CONTRACT-02), README reference (ENV-CONTRACT-03), " +
      "empty values (ENV-CONTRACT-04), # How to obtain: instructions (ENV-CONTRACT-05), and formatting — no commented-out " +
      "variables, blank line between variable blocks (ENV-CONTRACT-06) — across all env-consuming " +
      "systems/*, services/*, and root (RFC-0388, DNA-40).",
    scope: "workspace",
    flags: {},
    reads: [
      "systems/*/.env.example",
      "services/*/.env.example",
      ".env.example",
      "missions/*/workpiece/.env.example",
      "systems/*/README.md",
      "services/*/README.md",
      "missions/*/workpiece/README.md",
      "services/*/src/**/*.ts",
    ],
    execute: runEnvContractValidate,
  },
  {
    name: "env.local.check",
    description:
      "Check and create .env from .env.example in sites and services when missing (RFC-0388 Rule 7). " +
      "The .env file is a copy of .env.example — the operator fills values afterward.",
    scope: "workspace",
    flags: {},
    mutatesState: true,
    reads: [
      "systems/*/.env.example",
      "services/*/.env.example",
      "missions/*/workpiece/.env.example",
    ],
    writes: ["systems/*/.env", "services/*/.env", "missions/*/workpiece/.env"],
    execute: runEnvLocalCheck,
  },
  {
    name: "env.main.check",
    description:
      "Check and create .env.main from .env.example in sites when missing (RFC-0388 Rule 7). " +
      "The .env.main file is a copy of .env.example — the operator fills values afterward.",
    scope: "workspace",
    flags: {},
    mutatesState: true,
    reads: ["systems/*/.env.example", "missions/*/workpiece/.env.example"],
    writes: ["systems/*/.env.main", "missions/*/workpiece/.env.main"],
    execute: runEnvMainCheck,
  },
  {
    name: "env.alt.check",
    description:
      "Check and create .env.alt from .env.example in sites when missing (RFC-0388 Rule 7). " +
      "The .env.alt file is a copy of .env.example — the operator fills values afterward.",
    scope: "workspace",
    flags: {},
    mutatesState: true,
    reads: ["systems/*/.env.example", "missions/*/workpiece/.env.example"],
    writes: ["systems/*/.env.alt", "missions/*/workpiece/.env.alt"],
    execute: runEnvAltCheck,
  },
  {
    name: "deploy.preflight",
    description:
      "Pre-deploy validation gate (RFC-0388 Rule 5). Validates that the target env file exists, " +
      "contains all keys from .env.example, has no extra keys, and has no empty values. " +
      "Use --site <name> --env main|alt for sites, or --service <name> for services.",
    scope: "workspace",
    flags: {
      site: {
        kind: "string",
        description: "Site name (e.g. warpgogol-com). Required for site deploys.",
      },
      service: {
        kind: "string",
        description: "Service name (e.g. lagebild-sync-worker). Required for service deploys.",
      },
      env: {
        kind: "string",
        description: 'Environment: "main" or "alt". Required with --site.',
      },
    },
    reads: [
      "systems/*/.env.example",
      "systems/*/.env.main",
      "systems/*/.env.alt",
      "services/*/.env.example",
      "services/*/.env",
    ],
    execute: runDeployPreflight,
  },
  {
    name: "deploy.scripts.validate",
    description:
      "Validate deploy scripts in systems/*/package.json (deploy:main with --secrets-file .env.main, " +
      "deploy:alt with --secrets-file .env.alt) and services/*/package.json (deploy with --secrets-file .env) " +
      "(RFC-0388 Rule 6, DNA-40).",
    scope: "workspace",
    flags: {},
    reads: [
      "systems/*/package.json",
      "missions/*/workpiece/package.json",
      "services/*/package.json",
    ],
    execute: runDeployScriptsValidate,
  },
  {
    name: "fingerprint.calculate",
    description:
      "Calculate byte or semantic fingerprint of a file or directory tree (RFC-0364). " +
      "Utility command — not in any pipeline. Use --path <path> --mode semantic|byte.",
    scope: "workspace",
    flags: {
      path: {
        kind: "string",
        required: true,
        description: "Workspace-relative file or directory path to fingerprint.",
      },
      mode: {
        kind: "string",
        default: "semantic",
        description: "Fingerprint mode: semantic or byte.",
      },
    },
    reads: ["packages/**", "integrations/**", "services/**", "docs/rfcs/**"],
    execute: runFingerprintCalculate,
  },
  {
    name: "fingerprint.usage.lint",
    description:
      "Scan authored source for direct hash usage outside @warpgogol/fingerprint and the allowlist (RFC-0364, DNA-53). " +
      "Use --mode warning (default) or --mode fail.",
    scope: "workspace",
    flags: {
      mode: {
        kind: "string",
        default: "warning",
        description: "Diagnostic mode: warning or fail.",
      },
    },
    reads: ["packages/**/*.ts", "packages/**/*.tsx", "packages/fingerprint/allowlist.json"],
    execute: runFingerprintUsageLint,
  },
  {
    name: "fingerprint.fixtures.validate",
    description:
      "Validate fingerprint fixture pairs: comment-only invariance, meaningful change detection, " +
      "JSON key order, Markdown HTML comments, code fences, binary byte changes (RFC-0364).",
    scope: "workspace",
    flags: {},
    reads: ["packages/fingerprint/src/tests/fixtures/**"],
    execute: runFingerprintFixturesValidate,
  },
  {
    name: "agent.environment.audit",
    description:
      "Read-only probe of the local Linux environment: detects installed development " +
      "tools, checks .gitattributes line-ending rule, and emits a structured JSON report. " +
      "Use --emit-prompt to append a system-prompt snippet. Advisory only — never gates " +
      "build pipelines.",
    scope: "workspace",
    reads: [".gitattributes", "AGENTS.md"],
    flags: {
      "emit-prompt": {
        kind: "boolean",
        description:
          "Append a systemPromptSnippet field and print it to stdout when not in --json mode.",
      },
      tools: {
        kind: "string",
        description: "Comma-separated list of tools to probe (default: all in RFC-0368 matrix).",
      },
    },
    execute: runAgentEnvironmentAudit,
  },
  {
    name: "yaml.contract.lint",
    description:
      "Enforce the YAML-only contract for non-tool-mandatory files. " +
      "YAML-CONTRACT-01: non-whitelist .json/.jsonc files. " +
      "YAML-CONTRACT-02: .yml files anywhere. " +
      "YAML-CONTRACT-03: .generated.json files anywhere. " +
      "YAML-CONTRACT-04: missing or unparseable whitelist. " +
      "YAML-CONTRACT-05: .yaml files containing JSON content.",
    scope: "workspace",
    flags: {},
    reads: ["yaml-contract.whitelist.yaml", "**/*.json", "**/*.jsonc", "**/*.yml", "**/*.yaml"],
    execute: runYamlContractLint,
  },
  {
    name: "yaml.parse.validate",
    description:
      "RFC-0493: parse-check all .yaml files. " +
      "YAML-PARSE-01: parse error. " +
      "YAML-PARSE-02: duplicate mapping key.",
    scope: "workspace",
    flags: {},
    reads: ["**/*.yaml"],
    execute: runYamlParseValidate,
  },
  {
    name: "command.reads.validate",
    description:
      "RFC-0390: enforce that every registered kernel command declares `reads` (non-empty) or " +
      "`cacheable: false` (CRC-01), and that `reads` patterns are valid picomatch syntax (CRC-02).",
    scope: "workspace",
    flags: {},
    cacheable: false,
    execute: runCommandReadsValidate,
  },
  {
    name: "mission.check",
    description:
      "RFC-0629/RFC-0630: one-shot native Axiom accessibility check for a mission. " +
      "Uses PlaywrightEvidenceDriver, CrawleeDiscoveryExecutor, " +
      "createAutomatedWebAccessibilityMethodology, runAccessibilityInstrument, " +
      "findingsForObservation, and evaluateClosure from native axiom packages. " +
      "Writes native capsule files: staged-capsule.json, observation-bundle.json, " +
      "study-run.json, evidence-metadata.json. External-preview only. " +
      "RFC-0650: writes runTimestamp to evidence-metadata.json. " +
      "Exit codes: 0=pass, 1=violations or closure blocked, 2=no pages discovered or chromium not installed.",
    scope: "workspace",
    supportsAllSites: false,
    mutatesState: true,
    cacheable: false,
    flags: {
      mission: { kind: "string", required: true, description: "Mission id." },
      "external-preview": {
        kind: "boolean",
        description: "Required — connect to an existing server via --base-url (no local mode).",
      },
      "base-url": {
        kind: "string",
        description: "Base URL for external preview mode (required with --external-preview).",
      },
      "commit-sha": {
        kind: "string",
        description: "Optional commit SHA embedded in evidence-metadata.json.",
      },
      "run-timestamp": {
        kind: "string",
        description:
          "RFC-0650: Explicit run timestamp in YYYY-MM-DDTHH-MM-SS-mmmZ format (ISO 8601 UTC with colons replaced by hyphens). Defaults to current time if not provided. Embedded in evidence-metadata.json.",
      },
      "max-duration": {
        kind: "string",
        description: "Override discovery deadline in ms (default 120000).",
      },
      "max-urls": {
        kind: "string",
        description: "Override max URLs to discover (default 100).",
      },
      "max-depth": {
        kind: "string",
        description: "Override max crawl depth (default 3).",
      },
      locales: {
        kind: "string",
        description:
          "Comma-separated BCP 47 locales (e.g., 'de-DE,uk-UA'). Overrides i18n auto-detection from workpiece.",
      },
      "no-report": {
        kind: "boolean",
        description:
          "Skip report.html generation (axiom.report is auto-invoked separately in leitstand.dev-deploy).",
      },
      json: { kind: "boolean", description: "Output JSON result." },
    },
    writes: ["missions/{mission}/evidence/axiom/**"],
    reads: ["missions/{mission}/workpiece/**", "missions/{mission}/mission.yaml"],
    execute: runMissionCheck,
  },
  {
    name: "axiom.report",
    description:
      "RFC-0633: reads Axiom evidence JSON files (study-run.json, staged-capsule.json, " +
      "observation-bundle.json, evidence-metadata.json) from missions/{mission}/evidence/axiom/ " +
      "and writes a self-contained HTML triage report. Pure renderAxiomReportHtml with HTML escaping. " +
      "Supports --dry-run (RFC-0601). Exit 0 on success regardless of finding severity (renderer, not gate). " +
      "Failure modes: AXIOM-REPORT-01..05.",
    scope: "workspace",
    supportsAllSites: false,
    mutatesState: true,
    cacheable: false,
    flags: {
      mission: { kind: "string", required: true, description: "Mission id." },
      "dry-run": {
        kind: "boolean",
        description: "RFC-0601 dryRun mode: return HTML in data.renderedFiles, skip file write.",
      },
      json: { kind: "boolean", description: "Output JSON result." },
    },
    writes: ["missions/{mission}/evidence/axiom/report.html"],
    reads: ["missions/{mission}/evidence/axiom/**"],
    execute: runAxiomReport,
  },
  {
    name: "playwright.chromium.ensure",
    description:
      "RFC-0647: Ensure Playwright Chromium is installed. Launches Chromium to verify; " +
      "auto-installs if missing and PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD is not set. " +
      "Used by build.post pipeline (step 0) and mission.materialize.",
    scope: "workspace",
    supportsAllSites: false,
    execute: runPlaywrightChromiumEnsure,
  },
  {
    name: "methodologies.validate",
    description:
      "RFC-0665: validates the workshop-level methodologies config at systems/methodologies.md. " +
      "Checks schema (instruments, methodologies, gate), known methodology IDs, instrument references, " +
      "and gate aggregation. Diagnostics: METH-VAL-01 (file not found), METH-VAL-02 (schema violation), " +
      "METH-VAL-03 (unknown methodology id), METH-VAL-04 (unknown instrument ref). " +
      "Exit codes: 0=pass, 1=violations.",
    scope: "workspace",
    supportsAllSites: false,
    mutatesState: false,
    cacheable: false,
    reads: ["systems/methodologies.md"],
    flags: {},
    execute: runMethodologiesValidate,
  },
];
