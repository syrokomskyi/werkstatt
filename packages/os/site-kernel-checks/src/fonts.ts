/*
<MODULE_CONTRACT>
<purpose>RFC-0371: Fontsource CSS import font validators. fonts.contract.validate
is an author-time validator with 4 rules (no font binaries in public/, at least
one @fontsource import, packages in package.json, approved licenses).
fonts.origin.validate is a postbuild validator that fails any rendered head
that references an external font origin.</purpose>
<non-goals>
  <item>Do not generate font CSS — fonts.imports.generate in site-kernel-codegen handles that.</item>
  <item>Do not copy font binary files — Vite bundles woff2 from node_modules as hashed _astro/ assets.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0164: initial implementation (fonts.generate + fonts.selfhost.validate).</item>
  <item>ADR-0001: added Playfair Display and DM Mono to the self-hosted registry.</item>
  <item>RFC-0371: removed fonts.generate, fonts.selfhost.validate, SELF_HOSTED_FONTS registry; added fonts.contract.validate and fonts.origin.validate.</item>
</CHANGE_SUMMARY>
*/

import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, relative } from "node:path";
import { createRequire } from "node:module";
import { collectFiles } from "@warpgogol/share/fs";
import {
  runSeoTechnicalRuntimeInstrument,
  type SeoRuntimeState,
  toDeterministicContext,
} from "@syrokomskyi/axiom-study";

const EXTERNAL_FONT_ORIGIN =
  /(fonts\.googleapis\.com|fonts\.gstatic\.com|use\.typekit\.net|fonts\.bunny\.net)/i;

// ---------------------------------------------------------------------------
// RFC-0371: fonts.contract.validate (author-time, 4 rules)
// ---------------------------------------------------------------------------

const APPROVED_FONTSOURCE_LICENSES = ["OFL-1.1", "Apache-2.0", "MIT", "BSD-3-Clause", "CC-BY-4.0"];

const FONTSOURCE_IMPORT_RE = /@import\s+["'](@fontsource\/[\w-]+\/[\w-]+\.css)["']/g;
const FONTSOURCE_PKG_RE = /@fontsource\/[\w-]+/;
const FONT_BINARY_EXTENSIONS = [".woff2", ".woff", ".ttf", ".otf"];

interface FontViolation {
  rule: string;
  file: string;
  detail: string;
}

export async function runFontsContractValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const app = context.site;
  if (!app) {
    return { exitCode: 1, summary: "fonts.contract.validate must run inside an app context." };
  }
  const appDir = app.directory;
  const violations: FontViolation[] = [];

  // Rule 1: font-binary-in-public — no font binary files in public/
  const publicDir = join(appDir, "public");
  if (existsSync(publicDir)) {
    const fontFiles = await collectFiles(publicDir, {
      extensions: FONT_BINARY_EXTENSIONS,
      ignore: () => false,
    });
    for (const abs of fontFiles) {
      violations.push({
        rule: "font-binary-in-public",
        file: abs,
        detail:
          "Font binary file found in public/ — fonts must be bundled by Vite from @fontsource node_modules.",
      });
    }
  }

  // Rule 2: no-fontsource-import — at least one @fontsource import in src/styles/**/*.css
  const stylesDir = join(appDir, "src", "styles");
  let hasFontsourceImport = false;
  if (existsSync(stylesDir)) {
    const cssFiles = await collectFiles(stylesDir, {
      extensions: [".css"],
      ignore: () => false,
    });
    for (const abs of cssFiles) {
      const css = await readFile(abs, "utf8");
      FONTSOURCE_IMPORT_RE.lastIndex = 0;
      if (FONTSOURCE_IMPORT_RE.test(css)) {
        hasFontsourceImport = true;
      }
    }
  }
  if (!hasFontsourceImport) {
    violations.push({
      rule: "no-fontsource-import",
      file: stylesDir,
      detail:
        'No @fontsource/* CSS import found in src/styles/ — add @import "@fontsource/..." to fonts.imports.css.',
    });
  }

  // Rule 3: fontsource-package-missing — @fontsource/* imports must be in package.json dependencies
  let pkgJson: { dependencies?: Record<string, string>; devDependencies?: Record<string, string> } =
    {};
  const pkgJsonPath = join(appDir, "package.json");
  if (existsSync(pkgJsonPath)) {
    pkgJson = JSON.parse(await readFile(pkgJsonPath, "utf8"));
  }
  const allDeps = { ...pkgJson.dependencies, ...pkgJson.devDependencies };
  const importedPackages = new Set<string>();
  if (existsSync(stylesDir)) {
    const cssFiles = await collectFiles(stylesDir, {
      extensions: [".css"],
      ignore: () => false,
    });
    for (const abs of cssFiles) {
      const css = await readFile(abs, "utf8");
      let match: RegExpExecArray | null;
      FONTSOURCE_IMPORT_RE.lastIndex = 0;
      while ((match = FONTSOURCE_IMPORT_RE.exec(css)) !== null) {
        const pkgMatch = match[1].match(FONTSOURCE_PKG_RE);
        if (pkgMatch) {
          importedPackages.add(pkgMatch[0]);
        }
      }
    }
  }
  for (const pkg of importedPackages) {
    if (!allDeps[pkg]) {
      violations.push({
        rule: "fontsource-package-missing",
        file: pkgJsonPath,
        detail: `@fontsource package "${pkg}" is imported in CSS but not listed in package.json dependencies.`,
      });
    }
  }

  // Rule 4: fontsource-license-unapproved — each @fontsource/* package must have an approved license
  const requireFromApp = createRequire(join(appDir, "package.json"));
  for (const pkg of importedPackages) {
    try {
      const pkgJsonResolved = requireFromApp.resolve(`${pkg}/package.json`);
      const fontPkgJson = JSON.parse(await readFile(pkgJsonResolved, "utf8"));
      const license = fontPkgJson.license;
      if (!license || !APPROVED_FONTSOURCE_LICENSES.includes(license)) {
        violations.push({
          rule: "fontsource-license-unapproved",
          file: pkgJsonResolved,
          detail: `@fontsource package "${pkg}" has license "${license ?? "missing"}" — approved: ${APPROVED_FONTSOURCE_LICENSES.join(", ")}.`,
        });
      }
    } catch {
      violations.push({
        rule: "fontsource-license-unapproved",
        file: pkg,
        detail: `Cannot resolve @fontsource package "${pkg}" from node_modules — run pnpm install.`,
      });
    }
  }

  if (violations.length === 0) {
    return {
      exitCode: 0,
      summary: "fonts.contract.validate: ok (4 rules passed)",
      data: { violations: [] },
    };
  }
  return {
    exitCode: 1,
    summary: `fonts.contract.validate: ${violations.length} violation(s) found`,
    data: { violations },
  };
}

// ---------------------------------------------------------------------------
// RFC-0371: fonts.origin.validate (postbuild)
// ---------------------------------------------------------------------------

export async function runFontsOriginValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const app = context.site;
  if (!app) {
    return { exitCode: 1, summary: "fonts.origin.validate must run inside an app context." };
  }
  const distDir = join(app.directory, "dist");
  const violations: Array<{ file: string; match: string }> = [];

  const htmlFiles = await collectFiles(distDir, { extensions: [".html"], ignore: () => false });
  const seoStates: SeoRuntimeState[] = [];
  for (const abs of htmlFiles) {
    const html = await readFile(abs, "utf8");
    const match = html.match(EXTERNAL_FONT_ORIGIN);
    if (match) {
      violations.push({ file: abs, match: match[0] });
    }
    const relPath = relative(app.directory, abs).replace(/\\/g, "/");
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const langMatch = html.match(/<html[^>]*\slang=["']([^"']+)["']/i);
    const canonicalMatch = html.match(/<link\s+rel=["']canonical["']\s+href=["']([^"']+)["']/i);
    seoStates.push({
      url: `https://build.local/${relPath}`,
      locale: langMatch?.[1] ?? "de",
      profileId: app.name ?? "site",
      logicalPath: relPath,
      title: titleMatch?.[1] ?? "untitled",
      jsonLd: [],
      ogTags: {},
      sitemapUrls: [],
      renderedUrl: `https://build.local/${relPath}`,
      ...(canonicalMatch?.[1] ? { canonicalUrl: canonicalMatch[1] } : {}),
    });
  }

  // RFC-0016: call axiom-study seo-runtime instrument
  let instrumentRunId: string | undefined;
  if (seoStates.length > 0) {
    try {
      const instrumentCtx = toDeterministicContext({
        origin: "build-time",
        recordedAt: new Date().toISOString(),
        auditId: "fonts.origin.validate",
        environment: {},
      });
      const instrumentResult = runSeoTechnicalRuntimeInstrument({
        context: instrumentCtx,
        states: seoStates,
      });
      instrumentRunId = instrumentResult.instrumentRun.instrumentRunId;
    } catch {
      // Instrument failure must not break the gate
    }
  }

  if (violations.length === 0) {
    return {
      exitCode: 0,
      summary: "fonts.origin.validate: ok (no external font origins in dist)",
      data: { violations: [], instrumentRunId },
    };
  }
  return {
    exitCode: 1,
    summary: `fonts.origin.validate: ${violations.length} external font reference(s) found`,
    data: { violations, instrumentRunId },
  };
}
