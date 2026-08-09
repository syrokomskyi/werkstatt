/*
<MODULE_CONTRACT>
<purpose>Generates engineering-only app boilerplate from src/content/system.md for radically thin Astro sites.</purpose>
<non-goals>
  <item>Do not generate customer-owned content under src/content/pages/prose/business/navigation/site except platform overlays.</item>
  <item>Do not mutate dist/ output.</item>
  <item>Do not manage tools/ kernel wiring.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Implements RFC-0078 Tier 1 and Tier 2 app boilerplate generators.</item>
  <item>RFC-0079: runGenerateAgentsDocs — generate AGENTS.md for each app from template.</item>
  <item>RFC-0313: public.infrastructure.generate no longer seeds ai.txt; ai.generate owns the studio default policy.</item>
  <item>RFC-0309: routes.generate no longer emits a favicon.ico redirect route; public.icons.generate owns the binary favicon.</item>
  <item>RFC-0310: routes.generate emits the generated shared 404 route.</item>
  <item>RFC-0318: public.infrastructure.generate merges generated retired-surface redirects.</item>
</CHANGE_SUMMARY>
*/

import path from "node:path";
import * as fs from "node:fs/promises";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/werkstatt/kernel";
import { requireAstroSitePaths } from "@warpgogol/werkstatt-site/paths";
import { loadSystemManifestSync } from "@warpgogol/werkstatt-site/content";
import { hasGeneratedMarker, buildGeneratedHeader } from "./generated-marker.ts";
import {
  type GeneratedResult,
  type WarningEntry,
  readFileIfExists,
  readTemplate,
  applyTokens,
  buildRetiredSurfaceRedirectBlock,
  buildRetiredPageRoutesBlock,
  buildRetiredTombstoneSlugs,
  getSupportedLanguages,
  getDefaultLanguage,
  getBiomeDisplayName,
  getAppNameDisplay,
  getBiome,
  getDomainFromManifest,
  runGeneratedFileSet,
  buildCosmicPageMetadata,
} from "./app-boilerplate-helpers.ts";

export async function runGenerateOverlayPages(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<GeneratedResult>> {
  const paths = requireAstroSitePaths(context);
  const { manifest } = loadSystemManifestSync(paths.contentDirectory);
  const appId = manifest.app;
  const langs = getSupportedLanguages(manifest);
  const defaultLang = getDefaultLanguage(manifest);
  const overlayHeader = buildGeneratedHeader({
    ownerCommand: "overlay.pages.generate",
    site: appId,
    filePath: "src/content/pages/cosmic/passport.md",
  }).trimEnd();
  const rootRedirectHeader = buildGeneratedHeader({
    ownerCommand: "overlay.pages.generate",
    site: appId,
    filePath: "src/content/pages/root-redirect.md",
  }).trimEnd();
  // Per-overlay text. Title and description must be app-specific so search
  // engines and the Cosmic Passport itself don't show generic "Cosmic Passport"
  // on every site. Source from system.md identity.tagline when present,
  // otherwise fall back to a stable per-overlay default. This keeps the
  // generator idempotent: identical system.md → identical output, every time.
  //
  // RFC-0515: Brand resolution is locale-aware. The default locale uses the
  // tagline-derived brand; non-default locales use manifest.app (locale-neutral)
  // to avoid embedding the master-locale tagline in non-DE page metadata.
  //
  // SEO budgets: <title> capped at 70 chars; meta description at 160. We use
  // the *brand head* of the tagline (everything before the first em-dash) so
  // long taglines like "Brand — long descriptive subtitle" yield "Brand"
  // for the title and reserve the full subtitle for the description.

  const files: Array<{ absolutePath: string; content: string }> = [
    {
      absolutePath: path.join(paths.contentPagesDirectory, "root-redirect.md"),
      content: applyTokens(readTemplate("src/content/pages/root-redirect.template.md"), {
        site: manifest.app,
        DEFAULT_LANG: defaultLang,
        GENERATED_HEADER: rootRedirectHeader,
      }),
    },
  ];

  if (manifest.release?.passport?.enabled) {
    for (const lang of langs) {
      const { passportTitle, passportDescription, starMapTitle, starMapDescription } =
        buildCosmicPageMetadata(manifest, lang);
      files.push({
        absolutePath: path.join(paths.contentPagesDirectory, lang, "cosmic", "passport.md"),
        content: applyTokens(readTemplate("src/content/pages/{lang}/cosmic/passport.template.md"), {
          site: manifest.app,
          LANG: lang,
          TITLE: passportTitle,
          DESCRIPTION: passportDescription,
          GENERATED_HEADER: overlayHeader,
        }),
      });
      files.push({
        absolutePath: path.join(paths.contentPagesDirectory, lang, "cosmic", "star-map.md"),
        content: applyTokens(readTemplate("src/content/pages/{lang}/cosmic/star-map.template.md"), {
          site: manifest.app,
          LANG: lang,
          TITLE: starMapTitle,
          DESCRIPTION: starMapDescription,
          GENERATED_HEADER: overlayHeader,
        }),
      });
    }
  }

  return runGeneratedFileSet("overlay.pages.generate", context, files);
}

export async function runGenerateRoutes(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<GeneratedResult>> {
  const paths = requireAstroSitePaths(context);
  const { manifest } = loadSystemManifestSync(paths.contentDirectory);
  const appId = manifest.app;
  const routesHeader = buildGeneratedHeader({
    ownerCommand: "routes.generate",
    site: appId,
    filePath: "src/pages/index.astro",
  }).trimEnd();
  const routesTokens = { GENERATED_HEADER: routesHeader };
  const tombstoneSlugs = buildRetiredTombstoneSlugs(manifest);
  const tombstoneHeader = buildGeneratedHeader({
    ownerCommand: "routes.generate",
    site: appId,
    filePath: "src/middleware/retired-tombstones.ts",
  }).trimEnd();
  const tombstoneTokens = {
    GENERATED_HEADER: tombstoneHeader,
    TOMBSTONE_PREFIXES: JSON.stringify(tombstoneSlugs),
  };
  return runGeneratedFileSet("routes.generate", context, [
    {
      absolutePath: path.join(paths.srcDirectory, "pages", "index.astro"),
      content: applyTokens(readTemplate("src/pages/index.template.astro"), routesTokens),
    },
    {
      // RFC-0160: unprefixed default-language pages (/<slug>).
      absolutePath: path.join(paths.srcDirectory, "pages", "[...slug].astro"),
      content: applyTokens(readTemplate("src/pages/[...slug].template.astro"), routesTokens),
    },
    {
      absolutePath: path.join(paths.srcDirectory, "pages", "[lang]", "[...slug].astro"),
      content: applyTokens(readTemplate("src/pages/[lang]/[...slug].template.astro"), routesTokens),
    },
    {
      absolutePath: path.join(paths.srcDirectory, "pages", "404.astro"),
      content: applyTokens(readTemplate("src/pages/404.template.astro"), routesTokens),
    },
    {
      absolutePath: path.join(paths.srcDirectory, "middleware.ts"),
      content: applyTokens(readTemplate("src/middleware.template.ts"), routesTokens),
    },
    {
      absolutePath: path.join(paths.srcDirectory, "middleware", "retired-tombstones.ts"),
      content: applyTokens(
        readTemplate("src/middleware/retired-tombstones.ts.template"),
        tombstoneTokens,
      ),
    },
    {
      absolutePath: path.join(paths.srcDirectory, "content.config.ts"),
      content: applyTokens(readTemplate("src/content.config.template.ts"), routesTokens),
    },
    {
      absolutePath: path.join(paths.srcDirectory, "env.d.ts"),
      content: applyTokens(readTemplate("src/env.d.template.ts"), routesTokens),
    },
  ]);
}

export async function runGenerateGlobalStyles(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<GeneratedResult>> {
  const paths = requireAstroSitePaths(context);
  const { manifest } = loadSystemManifestSync(paths.contentDirectory);
  const localCssPath = path.join(paths.stylesDirectory, "local.css");
  const localCssExists = (await readFileIfExists(localCssPath)) !== null;
  const stylesHeader = buildGeneratedHeader({
    ownerCommand: "styles.global.generate",
    site: manifest.app,
    filePath: "src/styles/global.css",
  }).trimEnd();
  const files: Array<{ absolutePath: string; content: string }> = [
    {
      absolutePath: path.join(paths.stylesDirectory, "global.css"),
      content: applyTokens(readTemplate("src/styles/global.template.css"), {
        BIOME: getBiome(manifest),
        GENERATED_HEADER: stylesHeader,
      }),
    },
  ];
  if (!localCssExists && !context.dryRun) {
    await fs.mkdir(path.dirname(localCssPath), { recursive: true });
    await fs.writeFile(localCssPath, readTemplate("src/styles/local.template.css"), "utf8");
  }
  return runGeneratedFileSet("styles.global.generate", context, files);
}

export async function runGenerateScriptsOrchestrator(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<GeneratedResult>> {
  const paths = requireAstroSitePaths(context);
  const { manifest } = loadSystemManifestSync(paths.contentDirectory);
  const scriptsHeader = buildGeneratedHeader({
    ownerCommand: "scripts.orchestrator.generate",
    site: manifest.app,
    filePath: "src/scripts/layout-orchestrator.ts",
  }).trimEnd();
  return runGeneratedFileSet("scripts.orchestrator.generate", context, [
    {
      absolutePath: path.join(paths.srcDirectory, "scripts", "layout-orchestrator.ts"),
      content: applyTokens(readTemplate("src/scripts/layout-orchestrator.template.ts"), {
        GENERATED_HEADER: scriptsHeader,
      }),
    },
  ]);
}

export async function runGenerateAgentsDocs(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<GeneratedResult>> {
  const paths = requireAstroSitePaths(context);
  const { manifest } = loadSystemManifestSync(paths.contentDirectory);
  const appId = manifest.app;
  const biomeId = getBiome(manifest);
  const biomeDisplayName = getBiomeDisplayName(context.workspaceRoot, biomeId);
  const defaultLang = getDefaultLanguage(manifest);
  const supportedLangs = getSupportedLanguages(manifest).join(", ");
  const appNameDisplay = getAppNameDisplay(manifest);

  const agentsMdPath = path.join(paths.appDirectory, "AGENTS.md");
  const existing = await readFileIfExists(agentsMdPath);

  // If the file exists but has no GENERATED BY marker, check for a site-specific notes section
  // and preserve it when regenerating
  const siteSpecificPattern = /## Site-specific notes\n([\s\S]*?)(?=\n## |$)/;
  let siteSpecificSection = "";
  if (existing !== null && hasGeneratedMarker(existing)) {
    const match = existing.match(siteSpecificPattern);
    if (match) {
      const body = match[1].replace(/\s*<!-- Add site-specific rules[\s\S]*?-->\s*/g, "").trim();
      if (body.length > 0) {
        siteSpecificSection = `\n${body}`;
      }
    }
  }

  const tokens: Record<string, string> = {
    APP_ID: appId,
    APP_NAME_DISPLAY: appNameDisplay,
    BIOME_ID: biomeId,
    BIOME_DISPLAY_NAME: biomeDisplayName,
    DEFAULT_LANG: defaultLang,
    SUPPORTED_LANGS: supportedLangs,
    GENERATED_HEADER: buildGeneratedHeader({
      ownerCommand: "agents.generate",
      site: appId,
      filePath: "AGENTS.md",
    }).trimEnd(),
  };

  let rootContent = applyTokens(readTemplate("AGENTS.template.md"), tokens);

  // Inject preserved site-specific notes if any
  if (siteSpecificSection.length > 0) {
    rootContent = rootContent.replace(
      /<!-- Add site-specific rules that cannot be captured[\s\S]*?-->\s*<!-- This section is preserved[\s\S]*?-->/,
      siteSpecificSection,
    );
  }

  return runGeneratedFileSet("agents.generate", context, [
    { absolutePath: agentsMdPath, content: rootContent },
    {
      absolutePath: path.join(paths.contentDirectory, "AGENTS.md"),
      content: applyTokens(readTemplate("src/content/AGENTS.template.md"), tokens),
    },
    {
      absolutePath: path.join(paths.stylesDirectory, "AGENTS.md"),
      content: applyTokens(readTemplate("src/styles/AGENTS.template.md"), tokens),
    },
  ]);
}

export async function runGeneratePublicInfrastructure(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<GeneratedResult>> {
  const paths = requireAstroSitePaths(context);
  const { manifest } = loadSystemManifestSync(paths.contentDirectory);
  const domainFlag = input.flags.domain;
  const domain =
    typeof domainFlag === "string"
      ? domainFlag
      : Array.isArray(domainFlag)
        ? domainFlag[0]
        : getDomainFromManifest(manifest);

  if (!domain) {
    return {
      data: {
        command: "public.infrastructure.generate",
        status: "fail",
        generated: [],
        warnings: [
          {
            file: "public",
            message: "Missing domain. Pass --domain=<fqdn> or declare a manifest URL.",
          },
        ],
      },
      exitCode: 1,
      summary: "[public.infrastructure.generate] missing domain",
    };
  }

  const defaultLang = getDefaultLanguage(manifest);
  const tokens: Record<string, string> = {
    DOMAIN: domain,
    DEFAULT_LANG: defaultLang,
    RETIRED_SURFACE_REDIRECTS: buildRetiredSurfaceRedirectBlock(
      manifest,
      paths.appDirectory,
      domain,
    ),
    RETIRED_PAGE_ROUTES: buildRetiredPageRoutesBlock(manifest),
    GENERATED_HEADER: buildGeneratedHeader({
      ownerCommand: "public.infrastructure.generate",
      site: manifest.app,
      filePath: "public/_headers",
    }).trimEnd(),
  };
  // robots.txt is owned by `robots.generate` (RFC-0052) — the build pipeline's
  // canonical builder reads identity.domain + system.md robots: block.
  // Writing it from a scaffold template too caused drift on every build (the
  // generator would overwrite the scaffold output with a different format).
  const files: Array<{ absolutePath: string; content: string }> = [
    {
      absolutePath: path.join(paths.publicDirectory, "_headers"),
      content: applyTokens(readTemplate("public/_headers.template"), tokens),
    },
    {
      absolutePath: path.join(paths.publicDirectory, "_redirects"),
      content: applyTokens(readTemplate("public/_redirects.template"), tokens),
    },
    {
      absolutePath: path.join(paths.publicDirectory, ".assetsignore"),
      content: readTemplate("public/.template.assetsignore"),
    },
  ];

  return runGeneratedFileSet("public.infrastructure.generate", context, files);
}

export async function runAppBoilerplateValidate(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<GeneratedResult>> {
  const commands = [
    runGenerateOverlayPages,
    runGenerateRoutes,
    runGenerateGlobalStyles,
    runGenerateScriptsOrchestrator,
    runGeneratePublicInfrastructure,
    runGenerateAgentsDocs,
  ];
  const generated: string[] = [];
  const warnings: WarningEntry[] = [];
  let exitCode = 0;

  for (const command of commands) {
    const result = await command(input, { ...context, dryRun: true });
    const data = result.data as GeneratedResult | undefined;
    if (data?.generated) {
      generated.push(...data.generated);
    }
    if (data?.warnings) {
      warnings.push(...data.warnings);
    }
    if ((result.exitCode ?? 0) !== 0) {
      exitCode = result.exitCode ?? 1;
    }
  }

  return {
    data: {
      command: "app.boilerplate.validate",
      status: exitCode === 0 ? "ok" : "fail",
      generated,
      warnings: warnings.length > 0 ? warnings : undefined,
    },
    exitCode,
    summary:
      exitCode === 0
        ? "[app.boilerplate.validate] generated boilerplate is reproducible"
        : "[app.boilerplate.validate] boilerplate validation failed",
  };
}
