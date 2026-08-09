/*
<MODULE_CONTRACT>
<purpose>Validates RFC-0081 generated-file governance protocol: every generated file must carry the GENERATED_MARKER, and files without it are project-specific.</purpose>
<non-goals>
  <item>Do not modify any files — read-only validation.</item>
  <item>Do not run generators with mutatesState=true.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Implements generated.marker.validate command for RFC-0081 protocol.</item>
  <item>Accepted public-readiness RFCs: humans.txt and security.txt are generated marker-managed public artifacts; IndexNow key files are excluded because the protocol requires exact key-only body.</item>
  <item>RFC-0310: include generated src/pages/404.astro in author marker validation.</item>
</CHANGE_SUMMARY>
*/

import { readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/werkstatt/kernel";
import { requireAstroSitePaths } from "@warpgogol/werkstatt-site/paths";
import { loadSystemManifestSync, type SystemManifest } from "@warpgogol/werkstatt-site/content";
import { hasGeneratedMarker } from "@warpgogol/werkstatt-site/codegen";
import { defaultLanguageFromManifest } from "./lib/i18n.ts";
import { GENERATOR_OWNERSHIP_MAP } from "./generator-ownership.ts";

const REGISTRY_ONLY_PATHS = new Set(
  GENERATOR_OWNERSHIP_MAP.filter((e) => e.markerPolicy === "registry-only").map((e) => e.path),
);

function _isRegistryOnly(appRelativePath: string): boolean {
  const posixPath = appRelativePath.replace(/\\/g, "/");
  return REGISTRY_ONLY_PATHS.has(posixPath);
}

interface MarkerEntry {
  file: string;
  status: "managed" | "project-specific" | "stale-managed" | "missing-generated";
}

export interface GeneratedMarkerValidateData {
  command: "generated.marker.validate";
  status: "ok" | "warn" | "fail";
  managedFiles: number;
  projectSpecificFiles: number;
  staleManagedFiles: string[];
  unmarkedGeneratedFiles: string[];
  missingGeneratedFiles: string[];
  entries: MarkerEntry[];
}

async function readFileIfExists(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, "utf8");
  } catch {
    return null;
  }
}

function getSupportedLanguages(manifest: SystemManifest): string[] {
  const i18n = manifest.i18n;
  if (i18n?.supported) {
    return Object.keys(i18n.supported);
  }
  return [defaultLanguageFromManifest(manifest)];
}

export async function runGeneratedMarkerValidate(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<GeneratedMarkerValidateData>> {
  const strict = input.flags.strict === true;
  // RFC-0085: phase-aware checking lets SITES_CHECK_AUTHOR_PIPELINE skip
  // build-only artifacts (public/sitemap.xml, public/llms.txt, public/llms-full.txt)
  // that don't exist until `pnpm --filter <id> build` runs, while
  // SITES_CHECK_POSTBUILD_PIPELINE inspects exactly those.
  // `--phase=author`    → skip build-only files.
  // `--phase=postbuild` → only build-only files.
  // (no flag / `--phase=all`) → full check (preserved default for CI and sites-check.run).
  const phase = String(input.flags.phase ?? "all").toLowerCase();
  const includeAuthor = phase !== "postbuild";
  const includeBuildOnly = phase !== "author";
  const paths = requireAstroSitePaths(context);
  const { manifest } = loadSystemManifestSync(paths.contentDirectory);
  const langs = getSupportedLanguages(manifest);
  const appDir = paths.appDirectory;

  const authorAbsPaths: string[] = [
    join(appDir, "AGENTS.md"),
    join(paths.contentDirectory, "AGENTS.md"),
    join(paths.stylesDirectory, "AGENTS.md"),
    join(paths.srcDirectory, "pages", "index.astro"),
    join(paths.srcDirectory, "pages", "404.astro"),
    // RFC-0160: unprefixed default-language page route.
    join(paths.srcDirectory, "pages", "[...slug].astro"),
    join(paths.srcDirectory, "pages", "[lang]", "[...slug].astro"),
    join(paths.srcDirectory, "middleware.ts"),
    join(paths.srcDirectory, "content.config.ts"),
    join(paths.srcDirectory, "env.d.ts"),
    join(paths.stylesDirectory, "global.css"),
    join(paths.srcDirectory, "scripts", "layout-orchestrator.ts"),
    // RFC-0375: public/_headers, _redirects, .assetsignore, ai.txt, humans.txt,
    // security.txt are now Category B (registry-only) — removed from marker validation.
    join(paths.contentPagesDirectory, "root-redirect.md"),
    join(paths.stylesDirectory, "biome.generated.css"),
  ];
  const buildOnlyAbsPaths: string[] = [
    // RFC-0375: robots.txt, sitemap.xml, llms.txt, llms-full.txt are now Category B
    // (registry-only) — removed from marker validation. Existence is checked by
    // generated.files.validate instead.
  ];
  const expectedAbsPaths: string[] = [
    ...(includeAuthor ? authorAbsPaths : []),
    ...(includeBuildOnly ? buildOnlyAbsPaths : []),
  ];

  const passport = manifest.release?.passport;
  if (passport?.enabled && includeAuthor) {
    // Cosmic overlay pages live under src/content/pages/<lang>/cosmic/ —
    // author-time generated content, not build output.
    for (const lang of langs) {
      expectedAbsPaths.push(
        join(paths.contentPagesDirectory, lang, "cosmic", "passport.md"),
        join(paths.contentPagesDirectory, lang, "cosmic", "star-map.md"),
      );
    }
  }

  const missingGeneratedFiles: string[] = [];
  const unmarkedGeneratedFiles: string[] = [];
  const staleManagedFiles: string[] = [];
  let managedCount = 0;
  let projectSpecificCount = 0;
  const entries: MarkerEntry[] = [];

  for (const absPath of expectedAbsPaths) {
    const content = await readFileIfExists(absPath);
    const relPath = relative(appDir, absPath).replace(/\\/g, "/");

    if (content === null) {
      missingGeneratedFiles.push(relPath);
      entries.push({ file: relPath, status: "missing-generated" });
      continue;
    }

    if (hasGeneratedMarker(content)) {
      managedCount++;
      entries.push({ file: relPath, status: "managed" });
    } else {
      projectSpecificCount++;
      unmarkedGeneratedFiles.push(relPath);
      entries.push({ file: relPath, status: "project-specific" });
    }
  }

  const hasViolations =
    missingGeneratedFiles.length > 0 ||
    staleManagedFiles.length > 0 ||
    (strict && unmarkedGeneratedFiles.length > 0);

  const status: "ok" | "warn" | "fail" =
    missingGeneratedFiles.length > 0 || staleManagedFiles.length > 0
      ? "fail"
      : unmarkedGeneratedFiles.length > 0
        ? "warn"
        : "ok";

  const parts: string[] = [
    `[generated.marker.validate]`,
    `${managedCount} managed`,
    `${projectSpecificCount} project-specific`,
  ];
  if (missingGeneratedFiles.length > 0) {
    parts.push(`${missingGeneratedFiles.length} missing`);
  }
  if (staleManagedFiles.length > 0) {
    parts.push(`${staleManagedFiles.length} stale`);
  }

  return {
    data: {
      command: "generated.marker.validate",
      status,
      managedFiles: managedCount,
      projectSpecificFiles: projectSpecificCount,
      staleManagedFiles,
      unmarkedGeneratedFiles,
      missingGeneratedFiles,
      entries,
    },
    exitCode: hasViolations ? 1 : 0,
    summary: parts.join(", "),
  };
}
