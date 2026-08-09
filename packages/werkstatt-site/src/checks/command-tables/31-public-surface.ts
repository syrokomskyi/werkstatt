/*
<MODULE_CONTRACT>
<purpose>Maintains packages/os/site-kernel-checks/src/command-tables/31-public-surface.ts as an authored site-kernel-checks authored module so agents can evolve it without rediscovering local boundaries.</purpose>
<non-goals>
  <item>Do not implement command logic; implementations live in public-surface.ts.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Accepted public-readiness RFC implementation: register IndexNow, humans, AI policy, security.txt, headers, and aggregate public checks.</item>
</CHANGE_SUMMARY>
*/

import type { CheckCommandEntry } from "./types.ts";
import {
  runAiPolicyGenerate,
  runAiPolicyValidate,
  runHeadersSecurityGenerate,
  runHeadersSecurityValidate,
  runHumansGenerate,
  runHumansValidate,
  runIndexNowKeyGenerate,
  runIndexNowKeyValidate,
  runIndexNowSubmit,
  runIndexNowSubmitValidate,
  runNotFoundGenerate,
  runNotFoundValidate,
  runPublicArtifactGenerate,
  runPublicArtifactValidate,
  runPublicDeclarationValidate,
  runPublicIconsGenerate,
  runPublicIconsValidate,
  runPublicManagedClean,
  runPublicOrphansValidate,
  runPublicSurfaceLint,
  runRedirectMapValidate,
  runSecurityTxtGenerate,
  runSecurityTxtValidate,
} from "../public-surface.ts";

export const PUBLIC_SURFACE_COMMANDS: CheckCommandEntry[] = [
  {
    name: "not-found.generate",
    description:
      "Generation boundary for the shared 404 route; routes.generate emits src/pages/404.astro (RFC-0310).",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    mutatesState: true,
    cacheable: false,
    writes: ["<app>/src/pages/404.astro"],
    reads: ["<app>/src/content/system.md"],
    execute: runNotFoundGenerate,
  },
  {
    name: "not-found.validate",
    description:
      "Validate generated 404 route status handling, shared @warpgogol/werkstatt-site/ui import, and absence of app-local styling (RFC-0310).",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: ["<app>/src/pages/404.astro"],
    modulePaths: ["public-surface/not-found.ts", "public-surface/shared.ts", "result-helpers.ts"],
    execute: runNotFoundValidate,
  },
  {
    name: "public.icons.generate",
    description:
      "Generate favicon.ico, favicon.svg, PNG app icons, maskable icons, and manifest.webmanifest (RFC-0309).",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    mutatesState: true,
    cacheable: false,
    writes: [
      "<app>/public/favicon.svg",
      "<app>/public/favicon.ico",
      "<app>/public/apple-touch-icon.png",
      "<app>/public/icon-192.png",
      "<app>/public/icon-512.png",
      "<app>/public/icon-maskable-192.png",
      "<app>/public/icon-maskable-512.png",
      "<app>/public/manifest.webmanifest",
      "<app>/src/pages/favicon.ico.ts",
    ],
    reads: ["<app>/src/content/system.md", "<app>/src/content/favicon.svg"],
    modulePaths: ["public-surface/icons.ts", "public-surface/shared.ts", "result-helpers.ts"],
    execute: runPublicIconsGenerate,
  },
  {
    name: "public.icons.validate",
    description:
      "Validate generated installable icon assets, webmanifest entries, dimensions, and shared head links (RFC-0309).",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: [
      "<app>/public/favicon.svg",
      "<app>/public/manifest.webmanifest",
      "<app>/public/icon-*.png",
      "<app>/src/content/favicon.svg",
    ],
    modulePaths: ["public-surface/icons.ts", "public-surface/shared.ts", "result-helpers.ts"],
    execute: runPublicIconsValidate,
  },
  {
    name: "public.artifact.generate",
    description:
      "Aggregate public artifact generation boundary. Dedicated generators own the actual files (RFC-0307).",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    cacheable: false,
    execute: runPublicArtifactGenerate,
  },
  {
    name: "public.artifact.validate",
    description:
      "Validate required generated public artifacts are present and internally consistent (RFC-0307).",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: ["<app>/public/**"],
    modulePaths: ["public-surface/aggregate.ts", "public-surface/shared.ts", "result-helpers.ts"],
    execute: runPublicArtifactValidate,
  },
  {
    name: "public.declaration.validate",
    description:
      "Validate public declarations do not contradict each other and do not ship placeholders (RFC-0315).",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: ["<app>/public/**"],
    modulePaths: ["public-surface/aggregate.ts", "public-surface/shared.ts", "result-helpers.ts"],
    execute: runPublicDeclarationValidate,
  },
  {
    name: "public.surface.lint",
    description:
      "Lint generated public text artifacts for UTF-8, LF, unresolved refs, Markdown artifacts, and canonical URLs (RFC-0316).",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: ["<app>/public/**"],
    modulePaths: ["public-surface/aggregate.ts", "public-surface/shared.ts", "result-helpers.ts"],
    execute: runPublicSurfaceLint,
  },
  {
    name: "public.managed.clean",
    description:
      "Remove stale generated Markdown twins and empty generated public directories before regeneration (RFC-0318).",
    scope: "app",
    supportsAllSites: true,
    mutatesState: true,
    cacheable: false,
    writes: ["<app>/public/**/*.md", "<app>/public/**"],
    reads: ["<app>/public/**"],
    flags: {
      "dry-run": {
        kind: "boolean",
        description: "Report stale managed public artifacts without deleting them.",
      },
    },
    execute: runPublicManagedClean,
  },
  {
    name: "public.orphans.validate",
    description:
      "Fail when stale old-scheme Markdown twins or empty generated public directories survive generation (RFC-0318).",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: ["<app>/public/**"],
    execute: runPublicOrphansValidate,
    modulePaths: [
      "public-surface/managed-public.ts",
      "public-surface/shared.ts",
      "result-helpers.ts",
    ],
  },
  {
    name: "redirect.map.validate",
    description:
      "Validate generated _redirects retirement policy: source not live, target exists, no chains, generated marker present (RFC-0318).",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: ["<app>/public/_redirects", "<app>/dist/client/**/*.html"],
    modulePaths: [
      "public-surface/managed-public.ts",
      "public-surface/shared.ts",
      "result-helpers.ts",
    ],
    execute: runRedirectMapValidate,
  },
  {
    name: "indexnow.key.generate",
    description:
      "Generate public/<app-id>-indexnow.txt with the exact IndexNow key body (RFC-0311).",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    mutatesState: true,
    cacheable: false,
    writes: ["<app>/public/{app}-indexnow.txt"],
    reads: ["<app>/src/content/system.md"],
    execute: runIndexNowKeyGenerate,
  },
  {
    name: "indexnow.key.validate",
    description: "Validate IndexNow key filename/body and key character constraints (RFC-0311).",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: ["<app>/public/*-indexnow.txt"],
    modulePaths: ["public-surface/indexnow.ts", "public-surface/shared.ts", "result-helpers.ts"],
    execute: runIndexNowKeyValidate,
  },
  {
    name: "indexnow.submit",
    description:
      "Submit all sitemap URLs to IndexNow after deploy; use --base-url for the deployed origin (RFC-0311).",
    scope: "app",
    supportsAllSites: true,
    requiresNetwork: true,
    flags: {
      "base-url": {
        kind: "string",
        description:
          "Canonical deployed origin URL used for keyLocation and sitemap URL filtering.",
      },
      "dry-run": {
        kind: "boolean",
        description: "Resolve the URL batch without posting to IndexNow.",
      },
      urls: {
        kind: "string",
        description:
          "JSON file with changed canonical URLs to intersect with the sitemap page set.",
      },
      all: {
        kind: "boolean",
        description: "Submit the full canonical sitemap page set explicitly.",
      },
    },
    cacheable: false,
    execute: runIndexNowSubmit,
  },
  {
    name: "indexnow.submit.validate",
    description: "Offline validation hook for the IndexNow submit command contract (RFC-0311).",
    scope: "workspace",
    flags: {},
    supportsAllSites: true,
    reads: ["packages/os/site-kernel-checks/src/**/*.ts"],
    modulePaths: ["public-surface/indexnow.ts", "public-surface/shared.ts", "result-helpers.ts"],
    execute: runIndexNowSubmitValidate,
  },
  {
    name: "humans.generate",
    description:
      "Generate public/humans.txt from site identity, team, credits, and stack metadata (RFC-0312).",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    mutatesState: true,
    cacheable: false,
    writes: ["<app>/public/humans.txt"],
    reads: ["<app>/src/content/system.md"],
    execute: runHumansGenerate,
  },
  {
    name: "humans.validate",
    description: "Validate generated humans.txt sections and absence of placeholders (RFC-0312).",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: ["<app>/public/humans.txt"],
    modulePaths: ["public-surface/humans.ts", "public-surface/shared.ts"],
    execute: runHumansValidate,
  },
  {
    name: "ai.policy.generate",
    description: "Generate the studio-wide open AI crawler policy into public/ai.txt (RFC-0313).",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    mutatesState: true,
    cacheable: false,
    writes: ["<app>/public/ai.txt"],
    reads: ["<app>/src/content/system.md"],
    execute: runAiPolicyGenerate,
  },
  {
    name: "ai.policy.validate",
    description:
      "Validate the open-for-training AI crawler stance and robots.txt compatibility (RFC-0313).",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: ["<app>/public/ai.txt", "<app>/public/robots.txt"],
    modulePaths: [
      "public-surface/security.ts",
      "ai.ts",
      "public-surface/shared.ts",
      "result-helpers.ts",
    ],
    execute: runAiPolicyValidate,
  },
  {
    name: "security.txt.generate",
    description:
      "Generate public/.well-known/security.txt with contact, expiry, languages, and canonical URL (RFC-0314).",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    mutatesState: true,
    cacheable: false,
    writes: ["<app>/public/.well-known/security.txt"],
    reads: ["<app>/src/content/system.md"],
    execute: runSecurityTxtGenerate,
  },
  {
    name: "security.txt.validate",
    description: "Validate .well-known/security.txt shape and expiry freshness window (RFC-0314).",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: ["<app>/public/.well-known/security.txt"],
    modulePaths: ["public-surface/security.ts", "public-surface/shared.ts", "result-helpers.ts"],
    execute: runSecurityTxtValidate,
  },
  {
    name: "headers.security.generate",
    description:
      "Security header generation boundary; baseline is emitted by public.infrastructure.generate (RFC-0315).",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    cacheable: false,
    execute: runHeadersSecurityGenerate,
  },
  {
    name: "headers.security.validate",
    description: "Validate active baseline HTTP security headers in public/_headers (RFC-0315).",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: ["<app>/public/_headers"],
    modulePaths: ["public-surface/security.ts", "public-surface/shared.ts", "result-helpers.ts"],
    execute: runHeadersSecurityValidate,
  },
];
