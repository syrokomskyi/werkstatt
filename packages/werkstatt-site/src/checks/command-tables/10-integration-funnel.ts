/*
<MODULE_CONTRACT>
<purpose>Data-driven table for integration-port, funnel, chat, billing, and consent commands.</purpose>
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
  runIntegrationConfigValidate,
  runIntegrationSecretsValidate,
  runIntegrationSecretsAudit,
} from "../integration.ts";
import {
  runFunnelContractValidate,
  runFunnelStageValidate,
  runFunnelCopyValidate,
  runFunnelLagebildValidate,
  runFunnelOrgValidate,
} from "../funnel.ts";
import { runFunnelStatechartGenerate, runFunnelStatechartValidate } from "../funnel-statechart.ts";
import { runBillingConfigValidate, runBillingSecretsValidate } from "../billing.ts";
import { runChatConfigValidate } from "../chat.ts";
import { runChatMetadataDriftValidate } from "../chat-metadata-drift.ts";
import { runConsentActivationValidate, runLegalProcessorsValidate } from "../consent.ts";
import { runSemanticParity } from "../semantic-parity.ts";

export const INTEGRATION_FUNNEL_COMMANDS: CheckCommandEntry[] = [
  /* RFC-0168: Integration Port governance */
  {
    name: "integration.config.validate",
    description:
      "Validate that every channel/CRM adapter id configured in system.md integrations.* resolves to the closed adapter catalog. No-op pass when no integrations block is declared (RFC-0168).",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: ["<app>/src/content/system.md"],
    execute: runIntegrationConfigValidate,
  },
  {
    name: "integration.secrets.validate",
    description:
      "Validate that each configured Integration Port adapter's required secret names are projected into the generated env schema. No-op pass when no integrations block is declared (RFC-0168).",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: ["<app>/src/content/system.md", "<app>/.env.example"],
    execute: runIntegrationSecretsValidate,
  },
  {
    name: "integration.secrets.audit",
    description:
      "Gentle, NON-FAILING advisory: report which Integration Port channels/CRM are live vs dormant for this app. Dormant channels fall back to the mailto link (RFC-0168).",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: ["<app>/src/content/system.md", "<app>/.env.example"],
    execute: runIntegrationSecretsAudit,
  },
  /* RFC-0188: Visitor Sales Funnel governance */
  {
    name: "funnel.contract.validate",
    description:
      "Validate the configured funnel version + event sources against the closed catalog, and fail on ANY Make.com reference in the funnel content path. No-op pass when no integrations.funnel block is declared (RFC-0188).",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: ["<app>/src/content/system.md", "<app>/src/content/funnel/**"],
    execute: runFunnelContractValidate,
  },
  {
    name: "funnel.stage.validate",
    description:
      "Validate the platform-owned funnel transition graph is self-consistent (every stage reachable, terminal stages closed) and that any per-app stage mapping references only canonical (non-legacy) stages (RFC-0188).",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: ["<app>/src/content/system.md"],
    execute: runFunnelStageValidate,
  },
  {
    name: "funnel.copy.validate",
    description:
      "Validate localized funnel copy: required locale coverage (de+uk for warpgogol-com), cross-locale file parity, and no retired 39 € tariff copy. No-op pass when no src/content/funnel/ domain exists (RFC-0188).",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: ["<app>/src/content/funnel/**"],
    execute: runFunnelCopyValidate,
  },
  {
    name: "funnel.lagebild.validate",
    description:
      "Validate that an enabled funnel has a CRM destination and an inbound source so stage transitions reach the Lagebild buffer. No-op pass when the funnel block is absent or not enabled (RFC-0188/0186).",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: ["<app>/src/content/system.md"],
    execute: runFunnelLagebildValidate,
  },
  /* RFC-0219: deal-lifecycle state-chart generator + drift-validator */
  {
    name: "funnel.statechart.generate",
    description:
      "Generate docs/specs/visitor-funnel/state-chart.generated.md — a GENERATED, layered Mermaid stateDiagram-v2 document (visitor funnel + subscription lifecycle) with every edge labelled by its trigger, derived deterministically from FUNNEL_TRANSITION_TRIGGERS and SUBSCRIPTION_TRANSITION_TRIGGERS (RFC-0219).",
    scope: "workspace",
    flags: {},
    mutatesState: true,
    supportsAllSites: true,
    writes: ["docs/specs/visitor-funnel/state-chart.generated.md"],
    reads: ["packages/os/site-kernel-checks/src/funnel.ts"],
    execute: runFunnelStatechartGenerate,
  },
  {
    name: "funnel.statechart.validate",
    description:
      "Drift-guard docs/specs/visitor-funnel/state-chart.generated.md byte-for-byte against what funnel.statechart.generate would emit, and assert the trigger↔graph bijection for both the visitor funnel and the subscription lifecycle layers (RFC-0219).",
    scope: "workspace",
    flags: {},
    supportsAllSites: true,
    reads: [
      "docs/specs/visitor-funnel/state-chart.generated.md",
      "packages/os/site-kernel-checks/src/funnel.ts",
    ],
    execute: runFunnelStatechartValidate,
  },
  {
    name: "funnel.org.validate",
    description:
      "Validate that an enabled funnel writes the Organization graph through the crm:supabase-buffer destination. No-op pass when the funnel is absent/disabled (RFC-0190).",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: ["<app>/src/content/system.md"],
    execute: runFunnelOrgValidate,
  },
  /* RFC-0191: Stripe billing governance */
  {
    name: "billing.config.validate",
    description:
      "Validate the Stripe billing wiring: when Stripe is a funnel source, the Stripe webhook must be an inbound source and a CRM destination must exist so lifecycle events reach Lagebild. No-op pass when billing is not configured (RFC-0191).",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: ["<app>/src/content/system.md"],
    execute: runBillingConfigValidate,
  },
  {
    name: "billing.secrets.validate",
    description:
      "Validate that STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET are declared in the generated env schema when Stripe is a funnel source. No-op pass when billing is not configured (RFC-0191).",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: ["<app>/src/content/system.md", "<app>/.env.example"],
    execute: runBillingSecretsValidate,
  },
  /* RFC-0175: chat widget configuration governance */
  {
    name: "chat.config.validate",
    description:
      "Validate that a configured system.md integrations.chat.adapter resolves to the closed chat adapter catalog and that its required public options are present. No-op pass when no chat block is declared (RFC-0175).",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: ["<app>/src/content/system.md"],
    execute: runChatConfigValidate,
  },
  /* Architecture review: drift guard for CHAT_ADAPTER_METADATA vs adapter declarations */
  {
    name: "chat.metadata.drift.validate",
    description:
      "Workspace-scoped drift guard: verify CHAT_ADAPTER_METADATA in @warpgogol/chat matches the requiredOptions/vendorOrigins declared on each ChatWidgetAdapter in chat-adapter-* packages.",
    scope: "workspace",
    flags: {},
    reads: ["packages/chat/src/**/*.ts", "packages/chat-adapter-*/src/**/*.ts"],
    execute: runChatMetadataDriftValidate,
  },
  /* RFC-0177: storage & third-party-script consent policy */
  {
    name: "consent.activation.validate",
    description:
      "Fail if a configured chat widget vendor's origin loads as a script/iframe/preconnect in rendered dist HTML before user activation — the click-to-load guarantee (RFC-0175/0177).",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: ["<app>/dist/client/**/*.html", "<app>/src/content/system.md"],
    execute: runConsentActivationValidate,
  },
  {
    name: "legal.processors.validate",
    description:
      "Fail if a configured chat widget or external destination is not named (processor + recipients) in the Datenschutz/Privacy Policy, or no studio↔client DPA reference is present. No-op pass when nothing is configured (RFC-0177).",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: ["<app>/src/content/system.md", "<app>/src/content/**/*.md"],
    execute: runLegalProcessorsValidate,
  },
  /* RFC-0146: semantic parity regression guard */
  {
    name: "semantic.parity",
    description:
      "Rebuild the llms projections from the consolidated semantic model and assert they match the generated public/llms.txt + llms-full.txt byte-for-byte (RFC-0146 guard).",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: ["<app>/public/llms.txt", "<app>/public/llms-full.txt", "<app>/src/content/system.md"],
    execute: runSemanticParity,
  },
];
