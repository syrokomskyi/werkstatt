/*
<MODULE_CONTRACT>
<purpose>
  RFC-0087 generator ownership lint. Enforces the single-owner invariant:
  every generated file under apps/<id>/ must be written by exactly one kernel
  command. Multi-owner files are forbidden — they cause drift between onboarding
  output and build output.
</purpose>
<non-goals>
  <item>Do not validate template token coverage (grep-class lint, separate concern).</item>
  <item>Do not validate idempotency (fixture tests, separate concern).</item>
  <item>Do not check app-level files — this is a package-level static lint.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0087: Initial implementation — static ownership map + conflict detector.</item>
  <item>RFC-0262: register props.types.generate's packages/ui-relative generated-types outputs.</item>
  <item>Accepted public-readiness RFCs: register IndexNow, humans.txt, and security.txt generated outputs.</item>
  <item>RFC-0309: register generated public icon and webmanifest outputs.</item>
  <item>RFC-0310: register generated 404 Astro route.</item>
</CHANGE_SUMMARY>
*/

import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";
import { resultFromViolations } from "./result-helpers.ts";

// ---------------------------------------------------------------------------
// GENERATOR_OWNERSHIP_MAP
// RFC-0087: every generated file under apps/<id>/ has exactly one owner.
// Add new entries here when introducing a generator that writes to apps/<id>/.
// ---------------------------------------------------------------------------

export interface OwnershipEntry {
  path: string;
  command: string;
  /**
   * Marker policy for this generated file.
   * - "embedded" (default): file carries the GENERATED_MARKER in-file (Category A).
   * - "registry-only": file has no in-file marker, identified solely via this registry (Category B).
   *
   * Rule: `public/**` and binary files → "registry-only"; everything else → "embedded".
   */
  markerPolicy?: "embedded" | "registry-only";
  /**
   * Repo-relative path to the command's source module (e.g. "packages/os/site-kernel-checks/src/robots.ts").
   * Used by `generated.edit.guard` for Category B owner resolution.
   */
  module?: string;
}

export const GENERATOR_OWNERSHIP_MAP: OwnershipEntry[] = [
  // overlay.pages.generate — RFC-0026 / RFC-0047 overlay content pages
  { path: "src/content/pages/root-redirect.md", command: "overlay.pages.generate" },
  { path: "src/content/pages/{lang}/cosmic/passport.md", command: "overlay.pages.generate" },
  { path: "src/content/pages/{lang}/cosmic/star-map.md", command: "overlay.pages.generate" },

  // routes.generate — RFC-0078 thin runtime entrypoints
  { path: "src/pages/index.astro", command: "routes.generate" },
  { path: "src/pages/404.astro", command: "routes.generate" },
  // RFC-0160: unprefixed default-language page route.
  { path: "src/pages/[...slug].astro", command: "routes.generate" },
  { path: "src/pages/[lang]/[...slug].astro", command: "routes.generate" },
  { path: "src/middleware.ts", command: "routes.generate" },
  { path: "src/content.config.ts", command: "routes.generate" },
  { path: "src/env.d.ts", command: "routes.generate" },

  // api.routes.generate — RFC-0149 section-owned Astro APIRoute re-exports + env schema.
  // Route stem is dynamic (one per section api[] entry on used sections); the
  // {route} placeholder declares single ownership of the whole src/pages/api/ tree.
  { path: "src/pages/api/{route}.ts", command: "api.routes.generate" },
  { path: "src/env.schema.generated.mjs", command: "api.routes.generate" },

  // env.example.generate — RFC-0168 (Session C): generated, leak-guarded secret template.
  { path: ".env.example", command: "env.example.generate" },

  // styles.global.generate — RFC-0078 global stylesheet boilerplate
  { path: "src/styles/global.css", command: "styles.global.generate" },

  // scripts.orchestrator.generate — RFC-0078 layout orchestrator
  { path: "src/scripts/layout-orchestrator.ts", command: "scripts.orchestrator.generate" },

  // public.infrastructure.generate — RFC-0078 public static infrastructure
  {
    path: "public/_headers",
    command: "public.infrastructure.generate",
    markerPolicy: "registry-only",
    module: "packages/os/site-kernel-codegen/src/app-boilerplate.ts",
  },
  {
    path: "public/_redirects",
    command: "public.infrastructure.generate",
    markerPolicy: "registry-only",
    module: "packages/os/site-kernel-codegen/src/app-boilerplate.ts",
  },
  {
    path: "public/.assetsignore",
    command: "public.infrastructure.generate",
    markerPolicy: "registry-only",
    module: "packages/os/site-kernel-codegen/src/app-boilerplate.ts",
  },

  // agents.generate — RFC-0079 generated AGENTS.md files
  { path: "AGENTS.md", command: "agents.generate" },
  { path: "src/content/AGENTS.md", command: "agents.generate" },
  { path: "src/styles/AGENTS.md", command: "agents.generate" },

  // biome.css.generate — RFC-0025 / RFC-0071 biome-scoped CSS
  { path: "src/styles/biome.generated.css", command: "biome.css.generate" },

  // RFC-0371: Fontsource CSS imports (biome-driven).
  { path: "src/styles/fonts.imports.css", command: "fonts.imports.generate" },

  // RFC-0166: per-page Markdown twins ({route} claims the public *.md twin tree).
  {
    path: "public/index.md",
    command: "page.markdown.generate",
    markerPolicy: "registry-only",
    module: "packages/os/site-kernel-checks/src/page-markdown.ts",
  },
  {
    path: "public/{route}.md",
    command: "page.markdown.generate",
    markerPolicy: "registry-only",
    module: "packages/os/site-kernel-checks/src/page-markdown.ts",
  },

  // RFC-0169: resolved subscription entitlements.
  { path: "src/entitlements.generated.yaml", command: "entitlements.resolve" },

  // RFC-0165: RSS feed.
  {
    path: "public/feed.xml",
    command: "feed.generate",
    markerPolicy: "registry-only",
    module: "packages/os/site-kernel-checks/src/feed.ts",
  },

  // legal.scaffold — RFC-0096 Impressum / Datenschutz stubs (DE/AT/CH locales only)
  { path: "src/content/pages/{lang}/impressum.md", command: "legal.scaffold" },
  { path: "src/content/pages/{lang}/datenschutz.md", command: "legal.scaffold" },
  { path: "src/content/prose/{lang}/impressum.md", command: "legal.scaffold" },
  { path: "src/content/prose/{lang}/datenschutz.md", command: "legal.scaffold" },

  // i18n.middleware.generate — RFC-0055 language redirect middleware
  { path: "src/middleware/language-redirect.ts", command: "i18n.middleware.generate" },

  // open-source.generate — RFC-0489 deployment-specific SBOM registry
  { path: "src/content/pages/{lang}/open-source.md", command: "open-source.generate" },
  { path: "src/content/prose/{lang}/open-source.md", command: "open-source.generate" },
  { path: "src/content/data/{lang}/open-source-registry.json", command: "open-source.generate" },
  {
    path: "public/open-source/THIRD_PARTY_NOTICES.txt",
    command: "open-source.generate",
    markerPolicy: "registry-only",
    module: "packages/os/site-kernel-codegen/src/open-source-page.ts",
  },
  {
    path: "public/open-source/THIRD_PARTY_LICENSES.txt",
    command: "open-source.generate",
    markerPolicy: "registry-only",
    module: "packages/os/site-kernel-codegen/src/open-source-page.ts",
  },
  {
    path: "public/open-source/sbom.cdx.json",
    command: "open-source.generate",
    markerPolicy: "registry-only",
    module: "packages/os/site-kernel-codegen/src/open-source-page.ts",
  },

  // material.credits.generate — RFC-0220 material credits page
  { path: "src/content/pages/{lang}/credits.md", command: "material.credits.generate" },
  { path: "src/content/prose/{lang}/credits.md", command: "material.credits.generate" },

  // robots.generate — RFC-0052 canonical robots.txt builder (single owner per RFC-0087)
  {
    path: "public/robots.txt",
    command: "robots.generate",
    markerPolicy: "registry-only",
    module: "packages/os/site-kernel-checks/src/robots.ts",
  },

  // sitemap.generate — RFC-0049 sitemap.xml generation
  {
    path: "public/sitemap.xml",
    command: "sitemap.generate",
    markerPolicy: "registry-only",
    module: "packages/os/site-kernel-checks/src/sitemap.ts",
  },

  // llms.generate — RFC-0050 LLM-facing text exports
  {
    path: "public/llms.txt",
    command: "llms.generate",
    markerPolicy: "registry-only",
    module: "packages/os/site-kernel-checks/src/llms.ts",
  },
  {
    path: "public/llms-full.txt",
    command: "llms.generate",
    markerPolicy: "registry-only",
    module: "packages/os/site-kernel-checks/src/llms.ts",
  },

  // ai.generate — RFC-0051 AI policy file
  {
    path: "public/ai.txt",
    command: "ai.generate",
    markerPolicy: "registry-only",
    module: "packages/os/site-kernel-checks/src/ai.ts",
  },

  // Accepted public-readiness RFCs.
  {
    path: "public/{app}-indexnow.txt",
    command: "indexnow.key.generate",
    markerPolicy: "registry-only",
    module: "packages/os/site-kernel-checks/src/public-surface/indexnow.ts",
  },
  {
    path: "public/humans.txt",
    command: "humans.generate",
    markerPolicy: "registry-only",
    module: "packages/os/site-kernel-checks/src/public-surface/humans.ts",
  },
  {
    path: "public/.well-known/security.txt",
    command: "security.txt.generate",
    markerPolicy: "registry-only",
    module: "packages/os/site-kernel-checks/src/public-surface/security.ts",
  },

  // RFC-0309: generated installable icon and webmanifest suite.
  {
    path: "public/favicon.svg",
    command: "public.icons.generate",
    markerPolicy: "registry-only",
    module: "packages/os/site-kernel-checks/src/public-surface/icons.ts",
  },
  {
    path: "public/favicon.ico",
    command: "public.icons.generate",
    markerPolicy: "registry-only",
    module: "packages/os/site-kernel-checks/src/public-surface/icons.ts",
  },
  {
    path: "public/apple-touch-icon.png",
    command: "public.icons.generate",
    markerPolicy: "registry-only",
    module: "packages/os/site-kernel-checks/src/public-surface/icons.ts",
  },
  {
    path: "public/icon-192.png",
    command: "public.icons.generate",
    markerPolicy: "registry-only",
    module: "packages/os/site-kernel-checks/src/public-surface/icons.ts",
  },
  {
    path: "public/icon-512.png",
    command: "public.icons.generate",
    markerPolicy: "registry-only",
    module: "packages/os/site-kernel-checks/src/public-surface/icons.ts",
  },
  {
    path: "public/icon-maskable-192.png",
    command: "public.icons.generate",
    markerPolicy: "registry-only",
    module: "packages/os/site-kernel-checks/src/public-surface/icons.ts",
  },
  {
    path: "public/icon-maskable-512.png",
    command: "public.icons.generate",
    markerPolicy: "registry-only",
    module: "packages/os/site-kernel-checks/src/public-surface/icons.ts",
  },
  {
    path: "public/manifest.webmanifest",
    command: "public.icons.generate",
    markerPolicy: "registry-only",
    module: "packages/os/site-kernel-checks/src/public-surface/icons.ts",
  },

  // props.types.generate — RFC-0262 manifest propsSchema -> generated TypeScript
  // prop types. Workspace-relative (packages/ui/, not apps/<id>/) — the
  // {id} placeholder claims the whole generated-types surface for both layers.
  {
    path: "packages/ui/src/sections/{id}/{id}.types.generated.ts",
    command: "props.types.generate",
  },
  {
    path: "packages/ui/src/components/{id}/{id}.types.generated.ts",
    command: "props.types.generate",
  },

  // RFC-0286: Agent Surface Manifest — public JSON projection.
  {
    path: "public/.well-known/agent.json",
    command: "agent.manifest.generate",
    markerPolicy: "registry-only",
    module: "packages/os/site-kernel-checks/src/agent-manifest.ts",
  },

  // RFC-0289: OpenAPI 3.1 projection.
  {
    path: "public/.well-known/agent.openapi.json",
    command: "agent.openapi.generate",
    markerPolicy: "registry-only",
    module: "packages/os/site-kernel-checks/src/agent-openapi.ts",
  },

  // RFC-0287: Agent Knowledge files.
  {
    path: "public/api/agent/v1/*.json",
    command: "agent.knowledge.generate",
    markerPolicy: "registry-only",
    module: "packages/os/site-kernel-checks/src/agent-knowledge.ts",
  },

  // RFC-0290: Agent route JSON bridges (Vite cannot import .yaml directly).
  {
    path: "src/agent-surface.generated.json",
    command: "agent.routes.generate",
    markerPolicy: "registry-only",
    module: "packages/os/site-kernel-checks/src/agent/agent-routes.ts",
  },
  {
    path: "src/agent-capabilities.generated.json",
    command: "agent.routes.generate",
    markerPolicy: "registry-only",
    module: "packages/os/site-kernel-checks/src/agent/agent-routes.ts",
  },

  // RFC-0192: Programmatic Surface manifest + PSEO pages.
  {
    path: "public/.well-known/pseo-manifest.json",
    command: "surface.generate",
    markerPolicy: "registry-only",
    module: "packages/os/site-kernel-checks/src/surface/generate.ts",
  },

  // RFC-0198: Surface star-map SVG.
  {
    path: "public/.well-known/pseo-star-map.svg",
    command: "surface.starmap",
    markerPolicy: "registry-only",
    module: "packages/os/site-kernel-checks/src/surface/starmap.ts",
  },

  // RFC-0295: Warpgogol check hints.
  {
    path: "public/.well-known/warpgogol-check.json",
    command: "warpgogol.check-hints.generate",
    markerPolicy: "registry-only",
    module: "packages/os/site-kernel-check-warpgogol/src/commands/hints.ts",
  },

  // RFC-0028: Cosmic passport key rotation.
  {
    path: "public/.well-known/cosmic-passport-key.json",
    command: "passport.key.rotate",
    markerPolicy: "registry-only",
    module: "packages/os/site-kernel-checks/src/passport.ts",
  },

  // RFC-0150: OG preview images.
  {
    path: "public/og-image.png",
    command: "preview.images.generate",
    markerPolicy: "registry-only",
    module: "packages/os/site-kernel-checks/src/preview-images.ts",
  },

  // RFC-0473: Bordbuch public projections (unified ledger, workspace-scoped).
  {
    path: "systems/{system}/public/.well-known/bordbuch.json",
    command: "bordbuch.generate",
    markerPolicy: "registry-only",
    module: "packages/os/site-kernel-handoff/src/bordbuch/bordbuch-generate.ts",
  },
  {
    path: "systems/{system}/public/.well-known/bordbuch/index.html",
    command: "bordbuch.generate",
    markerPolicy: "registry-only",
    module: "packages/os/site-kernel-handoff/src/bordbuch/bordbuch-generate.ts",
  },

  // RFC-0171: Decap CMS admin config.
  {
    path: "public/admin/config.yml",
    command: "cms.schema.generate",
    markerPolicy: "registry-only",
    module: "packages/os/site-kernel-checks/src/cms.ts",
  },
  {
    path: "public/admin/index.html",
    command: "cms.schema.generate",
    markerPolicy: "registry-only",
    module: "packages/os/site-kernel-checks/src/cms.ts",
  },

  // RFC-0204: Responsive image variants (public outputs).
  {
    path: "public/_img/**/*.webp",
    command: "image.variants.generate",
    markerPolicy: "registry-only",
    module: "packages/os/site-kernel-checks/src/image-variants.ts",
  },

  // RFC-0210: Video delivery formats (public outputs).
  {
    path: "public/_video/**",
    command: "video.variants.generate",
    markerPolicy: "registry-only",
    module: "packages/os/site-kernel-checks/src/video-variants.ts",
  },

  // RFC-0234: Living-photo clip delivery (public outputs).
  {
    path: "public/_video/live/**",
    command: "live.variants.generate",
    markerPolicy: "registry-only",
    module: "packages/os/site-kernel-checks/src/live-variants.ts",
  },
];

// ---------------------------------------------------------------------------
// generator.ownership.lint
// ---------------------------------------------------------------------------

export function runGeneratorOwnershipLint(
  _input: KernelCommandInput,
  _context: KernelRuntimeContext,
): KernelCommandResult {
  const violations: string[] = [];

  // Build path → [command1, command2, ...] map
  const pathOwners = new Map<string, string[]>();

  for (const entry of GENERATOR_OWNERSHIP_MAP) {
    const existing = pathOwners.get(entry.path) ?? [];
    existing.push(entry.command);
    pathOwners.set(entry.path, existing);
  }

  // Check for multi-owner paths
  for (const [filePath, owners] of pathOwners) {
    if (owners.length > 1) {
      violations.push(
        `${filePath} is written by ${owners.length} commands: ${owners.join(", ")}. ` +
          "Pick one owner (RFC-0087) and route the others through it or a shared builder.",
      );
    }
  }

  return resultFromViolations("generator.ownership.lint", violations);
}
