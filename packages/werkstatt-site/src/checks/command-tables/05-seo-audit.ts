/*
<MODULE_CONTRACT>
<purpose>Maintains packages/os/site-kernel-checks/src/command-tables/05-seo-audit.ts as an authored site-kernel-checks authored module so agents can evolve it without rediscovering local boundaries.</purpose>
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
  runAuditAgentReadinessValidate,
  runSeoMetaValidate,
  runJsonLdUrlValidate,
  runJsonLdParityValidate,
  runRobotsPageValidate,
  runSeoTechnicalValidate,
  runSeoStructuredDataValidate,
  runSeoInternalLinkingValidate,
  runAnalyticsConfigValidate,
  runFirstPartyDataValidate,
  runInfraBriefValidate,
  runWikidataValidate,
} from "../audit-validators.ts";
import { runAuditLlm } from "../audit-llm.ts";
import { runAppQaValidate } from "../app-qa.ts";
import { runLighthouseValidation, runLighthouseBudgetCheck } from "../lighthouse.ts";
import { runMobileLayoutCheck } from "../mobile-layout-check.ts";

export const SEO_AUDIT_COMMANDS: CheckCommandEntry[] = [
  {
    name: "audit.agent.readiness.validate",
    description:
      "Validate built HTML and machine-readable artifacts for agent readability and key business facts (RFC-0074).",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: ["<app>/dist/client/**/*.html", "<app>/public/llms.txt", "<app>/public/ai.txt"],
    execute: runAuditAgentReadinessValidate,
  },
  {
    name: "seo.meta.validate",
    description:
      "Validate rendered Open Graph / Twitter Card meta on every indexable page; og:url must match canonical (RFC-0162).",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: ["<app>/dist/client/**/*.html"],
    execute: runSeoMetaValidate,
  },
  {
    name: "jsonld.url.validate",
    description:
      "Validate every rendered WebPage JSON-LD node carries its own url (matching canonical) and a unique @id (RFC-0163).",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: ["<app>/dist/client/**/*.html"],
    execute: runJsonLdUrlValidate,
  },
  {
    name: "jsonld.parity",
    description:
      "When business web declares socials/logo, the rendered Organization node must emit sameAs/logo (RFC-0163).",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: ["<app>/dist/client/**/*.html", "<app>/src/content/system.md"],
    execute: runJsonLdParityValidate,
  },
  {
    name: "robots.page.validate",
    description: "A page rendered with noindex must never appear in the sitemap (RFC-0165).",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: ["<app>/dist/client/**/*.html", "<app>/dist/client/sitemap*.xml"],
    execute: runRobotsPageValidate,
  },
  {
    name: "seo.technical.validate",
    description:
      "Validate sitemap, hreflang, robots, llms.txt, and ai.txt consistency against route registry (RFC-0074).",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: [
      "<app>/dist/client/**/*.html",
      "<app>/dist/client/sitemap*.xml",
      "<app>/public/robots.txt",
      "<app>/public/llms.txt",
    ],
    execute: runSeoTechnicalValidate,
  },
  {
    name: "seo.structured-data.validate",
    description:
      "Validate rendered JSON-LD blocks against required structured data declarations (RFC-0074).",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: ["<app>/dist/client/**/*.html"],
    execute: runSeoStructuredDataValidate,
  },
  {
    name: "seo.internal-linking.validate",
    description:
      "Validate internal-linking thresholds and key-page coverage against linking-plan.yaml (RFC-0074).",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: ["<app>/dist/client/**/*.html", "<app>/src/content/system.md"],
    execute: runSeoInternalLinkingValidate,
  },
  {
    name: "analytics.config.validate",
    description:
      "Validate system.md growth configuration against onboarding analytics-config.yaml (RFC-0074).",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: ["<app>/src/content/system.md"],
    execute: runAnalyticsConfigValidate,
  },
  {
    name: "first-party-data.validate",
    description:
      "Validate rendered form fields and consent surface against first-party-data.yaml (RFC-0074).",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: ["<app>/dist/client/**/*.html", "<app>/src/content/system.md"],
    execute: runFirstPartyDataValidate,
  },
  {
    name: "infra.brief.validate",
    description:
      "Validate infrastructure brief outputs against wrangler/workflow surfaces (RFC-0074).",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: ["<app>/src/content/system.md", "<app>/wrangler.toml", "<app>/wrangler.jsonc"],
    execute: runInfraBriefValidate,
  },
  {
    name: "audit.llm.run",
    description:
      "Run a cached LLM audit prompt for a given audit kind and return the shared RFC-0074 envelope.",
    scope: "app",
    flags: {
      kind: {
        kind: "string",
        description: "Command-specific kind selector.",
      },
      archetype: {
        kind: "string",
        description: "Archetype id to target.",
      },
      provider: {
        kind: "string",
        description: "LLM provider id.",
      },
      model: {
        kind: "string",
        description: "LLM model id.",
      },
    },
    supportsAllSites: true,
    cacheable: false,
    execute: runAuditLlm,
  },
  {
    name: "app.qa.validate",
    description:
      "Aggregate RFC-0074 deterministic audits and replay/run LLM audits, then write onboarding/.output/05-audit/audit-report.md.",
    scope: "app",
    flags: {
      "continue-on-error": {
        kind: "boolean",
        description: "Continue QA checks after a command failure.",
      },
      archetype: {
        kind: "string",
        description: "Archetype id to target.",
      },
    },
    supportsAllSites: true,
    cacheable: false,
    execute: runAppQaValidate,
  },
  {
    name: "wikidata.validate",
    description:
      "Validate PBP content and rendered JSON-LD for Wikidata integration readiness (RFC-0531, RFC-0535).",
    scope: "app",
    flags: {
      strict: {
        kind: "boolean",
        description: "Treat missing Wikidata QIDs as errors instead of warnings.",
      },
    },
    supportsAllSites: true,
    reads: [
      "<app>/src/content/business-profile/**/*.md",
      "<app>/src/content/business-profile/{lang}/claims/*.md",
      "<app>/src/content/business-profile/{lang}/evidence-sources/*.md",
      "<app>/src/content/system.md",
      "<app>/dist/client/**/*.html",
    ],
    execute: runWikidataValidate,
  },
  {
    name: "lighthouse.validate",
    description:
      "Performance lint that runs against source — heavy lighthouse runs live in postbuild.",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    cacheable: false,
    execute: runLighthouseValidation,
  },
  {
    name: "lighthouse.budget.check",
    description: "Post-build Lighthouse performance budget check.",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    cacheable: false,
    execute: runLighthouseBudgetCheck,
  },
  {
    name: "mobile.layout.check",
    description:
      "RFC-0838: Playwright mobile layout stability checks — horizontal overflow, rotation stability, CLS.",
    scope: "app",
    flags: {
      mode: { kind: "string", description: "error (default) or warning" },
      "route-timeout": { kind: "string", description: "Per-route timeout in ms (default 30000)" },
      "stability-delta": {
        kind: "string",
        description: "Layout shift threshold in px (default 5)",
      },
      concurrency: {
        kind: "string",
        description: "Number of routes to process in parallel (default 4, ADR-0049)",
      },
      "settle-wait": {
        kind: "string",
        description: "Settle wait per page in ms (default 500, ADR-0049)",
      },
    },
    supportsAllSites: true,
    cacheable: false,
    reads: ["<app>/dist/client/**/*.html"],
    modulePaths: ["checks/mobile-layout-check.ts"],
    execute: runMobileLayoutCheck,
  },
];
