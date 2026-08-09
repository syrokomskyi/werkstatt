/*
<MODULE_CONTRACT>
<purpose>
RFC-0257: Print contract and layout validation commands.
print.contract.validate checks page frontmatter and site labels for print correctness.
print.layout.validate checks shared UI CSS for print-blocking patterns.
</purpose>
<non-goals>
  <item>Do not generate PDFs — that lives in print-pdf.ts.</item>
  <item>Do not validate PDF file presence — that lives in print-pdf.ts.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0257: Initial creation — print contract and layout validators.</item>
</CHANGE_SUMMARY>
*/

import type { KernelCommandResult, KernelRuntimeContext } from "@warpgogol/werkstatt/kernel";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { loadSystemManifest, parseMarkdownFrontmatter } from "@warpgogol/werkstatt-site/content";
import { pageIdToContentFileSlug } from "@warpgogol/werkstatt-site/share/content";
import {
  PRINT_ORIENTATIONS,
  PRINT_PAGE_SIZES,
  PRINT_BACKGROUND_MODES,
  PRINT_REGIONS,
} from "@warpgogol/werkstatt-site/share/schemas/print";
import { defaultLanguageFromManifest } from "./lib/i18n.ts";

interface PrintViolation {
  rule: string;
  severity: "error" | "warning";
  file?: string;
  route?: string;
  message: string;
}

// ---------------------------------------------------------------------------
// print.contract.validate
// ---------------------------------------------------------------------------

export async function runPrintContractValidate(
  _input: unknown,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const app = context.site;
  if (!app) {
    return {
      exitCode: 1,
      summary: "This command must be run inside an app context.",
    };
  }

  const appDir = app.directory;
  const contentDir = join(appDir, "src", "content");
  const violations: PrintViolation[] = [];

  let manifest: Record<string, unknown>;
  try {
    const result = await loadSystemManifest(contentDir);
    manifest = result.manifest as unknown as Record<string, unknown>;
  } catch {
    return {
      exitCode: 1,
      summary: "Failed to load system manifest.",
    };
  }

  const printPdfEnabled =
    (manifest.output as Record<string, unknown> | undefined)?.printPdf === true;
  const languages: string[] = (manifest.i18n as Record<string, unknown> | undefined)?.supported
    ? Object.keys((manifest.i18n as Record<string, unknown>).supported as Record<string, unknown>)
    : [defaultLanguageFromManifest(manifest)];

  // Check site labels for print blocks
  for (const lang of languages) {
    const labelsPath = join(contentDir, "site", lang, "labels.md");
    if (existsSync(labelsPath)) {
      const raw = readFileSync(labelsPath, "utf-8");
      const { data } = parseMarkdownFrontmatter(raw);
      const printBlock = (data as Record<string, unknown>).print;
      if (printBlock && typeof printBlock === "object" && !printPdfEnabled) {
        violations.push({
          rule: "PRINT-CONTRACT-06",
          severity: "warning",
          file: `src/content/site/${lang}/labels.md`,
          message:
            "Site labels have a print block but output.printPdf is not enabled. The browser print dialog still uses these labels.",
        });
      }
    }
  }

  // Validate per-page print frontmatter
  for (const page of (manifest.pages as Array<Record<string, unknown>>) ?? []) {
    const pageId = page.pageId as string;
    const semanticType = page.semanticType as string | undefined;
    const fileSlug = pageIdToContentFileSlug(pageId);
    const locales = (page.locales as string[] | undefined) ?? languages;

    for (const lang of locales) {
      const pageFile = join(contentDir, "pages", lang, `${fileSlug}.md`);
      if (!existsSync(pageFile)) continue;

      const raw = readFileSync(pageFile, "utf-8");
      const { data } = parseMarkdownFrontmatter(raw);
      const printCfg = (data as Record<string, unknown>).print as
        Record<string, unknown> | undefined;

      if (!printCfg) continue;

      const route = (page.routes as Record<string, string> | undefined)?.[lang] ?? fileSlug;

      // PRINT-CONTRACT-01: legal/authority pages cannot opt out
      if (
        printCfg.enabled === false &&
        (semanticType === "legal" || semanticType === "authority")
      ) {
        violations.push({
          rule: "PRINT-CONTRACT-01",
          severity: "error",
          file: relative(appDir, pageFile),
          route: `/${lang}/${route}`,
          message: `Legal/authority page has print.enabled: false. Legal pages must always be printable.`,
        });
      }

      // PRINT-CONTRACT-02: unknown hide regions
      const hide = printCfg.hide;
      if (Array.isArray(hide)) {
        for (const region of hide) {
          if (
            typeof region === "string" &&
            !PRINT_REGIONS.includes(
              region as
                | "navigation"
                | "cta"
                | "breadcrumbs"
                | "site-background"
                | "footer-links"
                | "header-logo"
                | "hero-animation",
            )
          ) {
            violations.push({
              rule: "PRINT-CONTRACT-02",
              severity: "error",
              file: relative(appDir, pageFile),
              route: `/${lang}/${route}`,
              message: `Unknown print.hide region "${region}". Valid values: ${PRINT_REGIONS.join(", ")}.`,
            });
          }
        }
      }

      // PRINT-CONTRACT-03: invalid orientation
      if (
        printCfg.orientation !== undefined &&
        typeof printCfg.orientation === "string" &&
        !PRINT_ORIENTATIONS.includes(printCfg.orientation as "portrait" | "landscape" | "auto")
      ) {
        violations.push({
          rule: "PRINT-CONTRACT-03",
          severity: "error",
          file: relative(appDir, pageFile),
          route: `/${lang}/${route}`,
          message: `Invalid print.orientation "${printCfg.orientation}". Valid values: ${PRINT_ORIENTATIONS.join(", ")}.`,
        });
      }

      // PRINT-CONTRACT-04: invalid pageSize
      if (
        printCfg.pageSize !== undefined &&
        typeof printCfg.pageSize === "string" &&
        !PRINT_PAGE_SIZES.includes(printCfg.pageSize as "legal" | "a4" | "letter")
      ) {
        violations.push({
          rule: "PRINT-CONTRACT-04",
          severity: "error",
          file: relative(appDir, pageFile),
          route: `/${lang}/${route}`,
          message: `Invalid print.pageSize "${printCfg.pageSize}". Valid values: ${PRINT_PAGE_SIZES.join(", ")}.`,
        });
      }

      // PRINT-CONTRACT-05: invalid background mode
      if (
        printCfg.background !== undefined &&
        typeof printCfg.background === "string" &&
        !PRINT_BACKGROUND_MODES.includes(printCfg.background as "preserve" | "flatten")
      ) {
        violations.push({
          rule: "PRINT-CONTRACT-05",
          severity: "error",
          file: relative(appDir, pageFile),
          route: `/${lang}/${route}`,
          message: `Invalid print.background "${printCfg.background}". Valid values: ${PRINT_BACKGROUND_MODES.join(", ")}.`,
        });
      }
    }
  }

  const errors = violations.filter((v) => v.severity === "error");
  const warnings = violations.filter((v) => v.severity === "warning");

  if (errors.length > 0) {
    return {
      exitCode: 1,
      summary: `${errors.length} contract violation${errors.length === 1 ? "" : "s"} found.`,
      data: { violations },
    };
  }

  return {
    exitCode: 0,
    summary:
      warnings.length > 0
        ? `No errors. ${warnings.length} warning${warnings.length === 1 ? "" : "s"}.`
        : "No print contract violations found.",
    data: violations.length > 0 ? { violations } : undefined,
  };
}

// ---------------------------------------------------------------------------
// print.layout.validate
// ---------------------------------------------------------------------------

export async function runPrintLayoutValidate(
  _input: unknown,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const app = context.site;
  if (!app) {
    return {
      exitCode: 1,
      summary: "This command must be run inside an app context.",
    };
  }

  const violations: PrintViolation[] = [];

  // PRINT-LAYOUT-05: print.css must be referenced in layout-component.astro
  const layoutPath = join(
    "packages",
    "werkstatt-site",
    "src",
    "domain",
    "ui",
    "components",
    "layout",
    "layout-component.astro",
  );
  // Check from the monorepo root (context.cwd or app.directory's parent)
  const monorepoRoot = join(app.directory, "..", "..");
  const layoutFull = join(monorepoRoot, layoutPath);
  if (existsSync(layoutFull)) {
    const content = readFileSync(layoutFull, "utf-8");
    if (!content.includes("print.css") && !content.includes("printStylesheetUrl")) {
      violations.push({
        rule: "PRINT-LAYOUT-05",
        severity: "error",
        file: layoutPath,
        message: "layout-component.astro does not reference print.css or printStylesheetUrl.",
      });
    }
  }

  // PRINT-LAYOUT-01: check for position:fixed/sticky without @media print override
  // in shared UI CSS files
  const uiComponentsDir = join(
    monorepoRoot,
    "packages",
    "werkstatt-site",
    "src",
    "domain",
    "ui",
    "src",
    "components",
  );
  if (existsSync(uiComponentsDir)) {
    scanCssForPrintBlocking(uiComponentsDir, violations);
  }

  // PRINT-LAYOUT-03: check for min-height: 100vh without print override
  // (already covered by scanCssForPrintBlocking which checks for this pattern)

  const errors = violations.filter((v) => v.severity === "error");

  if (errors.length > 0) {
    return {
      exitCode: 1,
      summary: `${errors.length} print layout violation${errors.length === 1 ? "" : "s"} found.`,
      data: { violations },
    };
  }

  return {
    exitCode: 0,
    summary: "No print layout violations found.",
  };
}

function scanCssForPrintBlocking(dir: string, violations: PrintViolation[]): void {
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      scanCssForPrintBlocking(join(dir, entry.name), violations);
      continue;
    }
    if (!entry.name.endsWith(".css")) continue;

    const filePath = join(dir, entry.name);
    const content = readFileSync(filePath, "utf-8");

    // Check for position:fixed or position:sticky outside @media print
    const hasFixedOrSticky = /position:\s*(fixed|sticky)/.test(content);
    const hasPrintOverride = /@media\s+print/.test(content);

    if (hasFixedOrSticky && !hasPrintOverride) {
      const match = content.match(/position:\s*(fixed|sticky)/);
      violations.push({
        rule: "PRINT-LAYOUT-01",
        severity: "error",
        file: filePath,
        message: `Component uses position: ${match?.[1] ?? "fixed"} without a @media print override.`,
      });
    }

    // Check for min-height: 100vh without print override
    const hasMinHeight100vh = /min-height:\s*100vh/.test(content);
    if (hasMinHeight100vh && !hasPrintOverride) {
      violations.push({
        rule: "PRINT-LAYOUT-03",
        severity: "error",
        file: filePath,
        message: "Component sets min-height: 100vh without a @media print override.",
      });
    }
  }
}
