/*
<MODULE_CONTRACT>
<purpose>Command table for RFC-0305 analytics, Messkanon, Matomo Binding, and Matomo fleet controls.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0305: Register analytics/matomo command surfaces.</item>
</CHANGE_SUMMARY>
*/

import type { CheckCommandEntry } from "./types.ts";
import {
  runAnalyticsBindingValidate,
  runAnalyticsMesskanonValidate,
  runMatomoExportValidate,
  runMatomoProvisionValidate,
  runMatomoProxyValidate,
  runMatomoSilenceValidate,
  runMatomoSmokeValidate,
} from "../analytics-matomo.ts";

export const ANALYTICS_MATOMO_COMMANDS: CheckCommandEntry[] = [
  {
    name: "analytics.messkanon.validate",
    description: "Validate the tool-independent Warpgogol Messkanon ontology (RFC-0305).",
    scope: "workspace",
    flags: {},
    reads: ["packages/werkstatt-site/src/domain/ontology/analytics/messkanon.yaml"],
    execute: runAnalyticsMesskanonValidate,
  },
  {
    name: "analytics.binding.validate",
    description:
      "Validate the Matomo Binding against Messkanon and secret-free governance rules (RFC-0305).",
    scope: "workspace",
    flags: {},
    reads: ["packages/werkstatt-site/src/domain/ontology/analytics/**"],
    execute: runAnalyticsBindingValidate,
  },
  {
    name: "matomo.proxy.validate",
    description:
      "Validate the first-party Matomo proxy backend composition and proxy source policy (RFC-0305).",
    scope: "workspace",
    flags: {},
    reads: ["services/matomo-proxy/**"],
    execute: runMatomoProxyValidate,
  },
  {
    name: "matomo.provision.validate",
    description: "Validate offline Matomo provisioning registry and plan scaffolding (RFC-0305).",
    scope: "workspace",
    flags: {},
    reads: [
      "packages/os/site-kernel-checks/src/analytics/matomo/provisioning.ts",
      "packages/werkstatt-site/src/domain/ontology/analytics/matomo-fleet.registry.yaml",
    ],
    execute: runMatomoProvisionValidate,
  },
  {
    name: "matomo.smoke.validate",
    description: "Validate offline Matomo first-signal smoke-test scaffolding (RFC-0305).",
    scope: "workspace",
    flags: {},
    reads: ["packages/os/site-kernel-checks/src/analytics/matomo/smoke.ts"],
    execute: runMatomoSmokeValidate,
  },
  {
    name: "matomo.silence.validate",
    description: "Validate Matomo zero-hit silence-detection diagnostics scaffolding (RFC-0305).",
    scope: "workspace",
    flags: {},
    reads: ["packages/os/site-kernel-checks/src/analytics/matomo/silence.ts"],
    execute: runMatomoSilenceValidate,
  },
  {
    name: "matomo.export.validate",
    description: "Validate Matomo Notausgang analytics export package scaffolding (RFC-0305).",
    scope: "workspace",
    flags: {},
    reads: ["packages/os/site-kernel-checks/src/analytics/matomo/export.ts"],
    execute: runMatomoExportValidate,
  },
];
