/*
<MODULE_CONTRACT>
<purpose>Maintains packages/os/site-kernel-checks/src/pipelines/build-prepare.ts as an authored site-kernel-checks authored module so agents can evolve it without rediscovering local boundaries.</purpose>
<non-goals>
  <item>Do not validate; only generate and prepare artifacts.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Extracted from module.ts.</item>
  <item>RFC-0493: added yaml.parse.validate after yaml.contract.lint.</item>
  <item>RFC-0528: moved material.metadata.write from before variant generators to after live.variants.generate.</item>
  <item>RFC-0557: added workpiece.imports.validate as first step before yaml.contract.lint.</item>
  <item>RFC-0571: added config.regenerate as first step before workpiece.imports.validate.</item>
  <item>RFC-0597: added SITES_BUILD_PREPARE_DEV_PIPELINE — codegen-only subset for dev-mode mission materialization.</item>
</CHANGE_SUMMARY>
*/

import type { KernelPipelineStep } from "@warpgogol/site-kernel";

export const SITES_BUILD_PREPARE_PIPELINE: KernelPipelineStep[] = [
  // RFC-0571: regenerate root config files from templates before any validation or codegen
  { command: "config.regenerate" },
  // RFC-0557: validate workpiece @warpgogol/* imports resolve from root node_modules before any generators run
  { command: "workpiece.imports.validate" },
  // RFC-0376: enforce YAML-only contract before any generators run
  { command: "yaml.contract.lint" },
  // RFC-0493: parse-check all .yaml files after extension contract, before generators
  { command: "yaml.parse.validate" },
  // RFC-0527: generate the content reference index before any resolver consumers run
  { command: "content.ref-index.generate" },
  // RFC-0078 Tier 3: regenerate tools/ kernel wiring (idempotent, no-op when templates unchanged)
  { command: "kernel.wire" },
  // RFC-0079: generate AGENTS.md for the app from template
  { command: "agents.generate" },
  { command: "overlay.pages.generate" },
  { command: "routes.generate" },
  { command: "not-found.generate" },
  // RFC-0140: generate section-owned server API routes for used sections
  { command: "api.routes.generate" },
  // RFC-0168 (Session C): mirror the freshly-written env schema into a personalized .env.example
  { command: "env.example.generate" },
  // RFC-0169: resolve subscription entitlements before module-gating generators run
  { command: "entitlements.resolve" },
  // RFC-0192: expand the Programmatic Surface into src/surface.generated.yaml (pseo-gated)
  // after entitlements are known and before routes/sitemap consume the registry.
  { command: "surface.generate" },
  // RFC-0196: report freshness decay (non-failing) after the surface is materialized.
  { command: "surface.freshness" },
  // RFC-0198: render the surface star-map from the manifest.
  { command: "surface.starmap" },
  // RFC-0213: compute the freshness ledger before agent.knowledge.generate reads it.
  // This ensures src/freshness.generated.yaml exists so knowledge files get freshness metadata.
  { command: "content.freshness.validate" },
  // RFC-0287: project the business layer into static per-domain knowledge files
  // before the manifest is assembled, so it can reflect what was just written.
  { command: "agent.knowledge.generate" },
  // RFC-0286: assemble the Agent Surface Manifest (knowledge/action refs + protocol
  // interfaces) after entitlements and the final page/route set are known.
  { command: "agent.manifest.generate" },
  // RFC-0289: project the manifest into a static OpenAPI 3.1 document.
  { command: "agent.openapi.generate" },
  // RFC-0290: generate the thin Agent Gate route re-exports (needs the manifest's action ids).
  { command: "agent.routes.generate" },
  // RFC-0308: sign agent surface artifacts with detached Ed25519 proofs (no-op without PASSPORT_SIGNING_KEY).
  { command: "agent.surface.sign" },
  { command: "styles.global.generate" },
  { command: "scripts.orchestrator.generate" },
  { command: "public.infrastructure.generate" },
  { command: "security.txt.generate" },
  { command: "indexnow.key.generate" },
  { command: "humans.generate" },
  { command: "public.icons.generate" },
  { command: "headers.security.generate" },
  { command: "open-source.generate" },
  { command: "material.credits.generate" },
  { command: "icons.generate" },
  // RFC-0025 / RFC-0071: generate biome-scoped CSS from system.md biome config
  { command: "biome.css.generate" },
  // RFC-0371: generate Fontsource CSS imports from biome fonts section before Astro build
  { command: "fonts.imports.generate" },
  // RFC-0171: regenerate the Decap CMS admin config from content (no-op for fs apps)
  { command: "cms.schema.generate" },
  { command: "archetype.registry.build" },
  // RFC-0055: generate language-redirect middleware before Astro build
  { command: "i18n.middleware.generate" },
  // RFC-0049: generate sitemap.xml into public/ before Astro build copies it to dist/
  { command: "sitemap.generate" },
  // RFC-0150: generate OG preview PNG images into public/ before Astro build
  { command: "preview.images.generate", expectedDurationMs: 30_000, timeoutMs: 300_000 },
  // RFC-0050: generate llms.txt + llms-full.txt into public/ before Astro build
  { command: "llms.generate" },
  // RFC-0318: prune stale generated public twins before writing the current set.
  { command: "public.managed.clean" },
  // RFC-0166: per-page Markdown twins into public/ before Astro build copies them to dist/
  { command: "page.markdown.generate" },
  // RFC-0165: RSS feed from dated article pages into public/
  { command: "feed.generate" },
  // RFC-0051: generate ai.txt into public/ before Astro build
  { command: "ai.generate" },
  { command: "ai.policy.generate" },
  // RFC-0052: generate robots.txt into public/ before Astro build
  { command: "robots.generate" },
  { command: "public.artifact.generate" },
  // RFC-0204: generate responsive image variants from content assets before Astro build
  { command: "image.variants.generate", expectedDurationMs: 60_000, timeoutMs: 600_000 },
  // RFC-0210: derive per-profile video delivery formats (HLS/MP4/WebM/poster) before Astro build
  { command: "video.variants.generate", expectedDurationMs: 180_000, timeoutMs: 1_200_000 },
  // RFC-0234: derive the cross-device delivery set for living-photo clips (desktop WebM + iOS MP4)
  { command: "live.variants.generate", expectedDurationMs: 120_000, timeoutMs: 900_000 },
  // RFC-0528: write IPTC/XMP metadata into derived media variants after all variant generators
  // (graceful skip when exiftool toolchain absent).
  { command: "material.metadata.write" },
  // Wave 0 (RFC-0023): validate manifests in packages/ui before rebuilding registry
  { command: "manifest.contract.validate" },
  { command: "mirror.quintet.validate" },
  // Wave 0 (RFC-0023): rebuild registry so uni.registry.validate in build.check is always fresh
  { command: "uni.registry.build" },
  // RFC-0295: generate Warpgogol check hints before generated.files.validate checks them
  { command: "warpgogol.check-hints.generate" },
  // RFC-0375: verify all registry-declared generated files exist after all generators have run
  { command: "generated.files.validate" },
];

// RFC-0597: codegen-only subset for dev-mode mission materialization.
// Includes all generators that produce files consumed by `astro dev` (src/ files,
// middleware, styles, surface artifacts) plus generated.files.validate as a safety net
// and uni.registry.build for the cosmic registry needed at runtime.
// Excludes: media transcoding (video/image/live variants), static public file generation
// (sitemap, preview images, llms, feed, robots, ai, page.markdown, public.artifact),
// material.metadata.write, warpgogol.check-hints.generate, and workspace-scoped
// validators (manifest.contract.validate, mirror.quintet.validate).
export const SITES_BUILD_PREPARE_DEV_PIPELINE: KernelPipelineStep[] = [
  { command: "config.regenerate" },
  { command: "workpiece.imports.validate" },
  { command: "yaml.contract.lint" },
  { command: "yaml.parse.validate" },
  { command: "content.ref-index.generate" },
  { command: "kernel.wire" },
  { command: "agents.generate" },
  { command: "overlay.pages.generate" },
  { command: "routes.generate" },
  { command: "not-found.generate" },
  { command: "api.routes.generate" },
  { command: "env.example.generate" },
  { command: "entitlements.resolve" },
  { command: "surface.generate" },
  { command: "surface.freshness" },
  { command: "surface.starmap" },
  { command: "content.freshness.validate" },
  { command: "agent.knowledge.generate" },
  { command: "agent.manifest.generate" },
  { command: "agent.openapi.generate" },
  { command: "agent.routes.generate" },
  { command: "agent.surface.sign" },
  { command: "styles.global.generate" },
  { command: "scripts.orchestrator.generate" },
  { command: "public.infrastructure.generate" },
  { command: "security.txt.generate" },
  { command: "indexnow.key.generate" },
  { command: "humans.generate" },
  { command: "public.icons.generate" },
  { command: "headers.security.generate" },
  { command: "open-source.generate" },
  { command: "material.credits.generate" },
  { command: "icons.generate" },
  { command: "biome.css.generate" },
  { command: "fonts.imports.generate" },
  { command: "cms.schema.generate" },
  { command: "archetype.registry.build" },
  { command: "uni.registry.build" },
  { command: "i18n.middleware.generate" },
  { command: "generated.files.validate" },
];
