/*
<MODULE_CONTRACT>
<purpose>Maintains packages/os/site-kernel-checks/src/command-tables/13-text-normalize.ts as an authored site-kernel-checks authored module so agents can evolve it without rediscovering local boundaries.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0235: introduce the egress text normalization command table.</item>
</CHANGE_SUMMARY>
*/

import type { CheckCommandEntry } from "./types.ts";
import {
  runTextNormalizeApply,
  runTextNormalizeValidate,
  runTextNormalizeReport,
  runTextNormalizeRulesList,
} from "../text-normalize.ts";

export const TEXT_NORMALIZE_COMMANDS: CheckCommandEntry[] = [
  {
    name: "text.normalize.apply",
    description:
      "Per-app: egress adapter — rewrite every text artifact under dist/client (HTML, llms.txt, Markdown twins, feed.xml, sitemap*.xml, JSON-LD, SVG text) through the per-site text.normalize config, stripping AI-authorship typographic signals. Excludes signed passport JSON, keys, and _astro bundles. Runs in build.post after all dist mutation (RFC-0235).",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: [
      "<app>/dist/client/**/*.html",
      "<app>/dist/client/**/*.txt",
      "<app>/dist/client/**/*.md",
      "<app>/dist/client/**/*.xml",
      "<app>/dist/client/**/*.svg",
    ],
    execute: runTextNormalizeApply,
  },
  {
    name: "text.normalize.validate",
    description:
      "Per-app: warn-only backstop — re-scan dist/client for residual enabled signals and report them as RFC-0203 Diagnostics. Never gates the build; flags an unhandled output channel (RFC-0235).",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: [
      "<app>/dist/client/**/*.html",
      "<app>/dist/client/**/*.txt",
      "<app>/dist/client/**/*.md",
      "<app>/dist/client/**/*.xml",
      "<app>/dist/client/**/*.svg",
    ],
    execute: runTextNormalizeValidate,
  },
  {
    name: "text.normalize.report",
    description:
      "Per-app: advisory — list typographic signals present in authored source (src/content). The egress adapter normalizes these on output; source cleanup is optional. Always exits 0 (RFC-0235).",
    scope: "app",
    flags: {
      app: {
        kind: "string",
        description: "App name to use when no app context is active.",
      },
    },
    supportsAllSites: true,
    reads: ["<app>/src/content/**/*.md", "<app>/src/content/**/*.yaml"],
    execute: runTextNormalizeReport,
  },
  {
    name: "text.normalize.rules.list",
    description:
      "Enumerate the text-normalization signal registry (id, default, Unicode set, replacement) so an agent discovers the contract without reading source. Advisory — always exits 0 (RFC-0235).",
    scope: "workspace",
    flags: {},
    supportsAllSites: true,
    cacheable: false,
    execute: runTextNormalizeRulesList,
  },
];
