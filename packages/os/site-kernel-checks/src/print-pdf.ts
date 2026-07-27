/*
<MODULE_CONTRACT>
<purpose>
RFC-0257: PDF generation and validation commands using Playwright Chromium.
print.pdf.generate runs in build.post and produces PDFs from the built static site.
print.pdf.validate verifies that all expected PDFs exist and are non-empty.
</purpose>
<non-goals>
  <item>Do not generate PDFs into public/ — they need the built HTML/CSS.</item>
  <item>Do not overwrite existing PDFs unless --force is passed.</item>
  <item>Do not implement client-side PDF generation.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0257: Initial creation — PDF generation and validation commands.</item>
</CHANGE_SUMMARY>
*/

import type { KernelCommandResult, KernelRuntimeContext } from "@gogol/site-kernel";
import { existsSync, mkdirSync, statSync } from "node:fs";
import { writeFile, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { createServer } from "node:http";
import { loadSystemManifest, parseMarkdownFrontmatter } from "@gogol/site-kernel-content";
import { pageIdToContentFileSlug } from "@gogol/share/content";
import type { PrintPdfGenerateResult } from "@gogol/share/schemas/print";
import { defaultLanguageFromManifest } from "./lib/i18n.ts";

// ---------------------------------------------------------------------------
// print.pdf.generate
// ---------------------------------------------------------------------------

export async function runPrintPdfGenerate(
  input: any,
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
  const distDir = join(appDir, "dist", "client");
  const force = input?.force === true || input?.f === true;

  // 1. Read system.md and check output.printPdf
  let manifest: any;
  try {
    const result = await loadSystemManifest(contentDir);
    manifest = result.manifest;
  } catch {
    return {
      exitCode: 1,
      summary: "Failed to load system manifest.",
    };
  }

  if (manifest?.output?.printPdf !== true) {
    return {
      exitCode: 0,
      summary: "PDF generation disabled for this app.",
      data: {
        generated: 0,
        skipped: 0,
        disabled: 0,
        errors: [],
        outputDir: "",
      } satisfies PrintPdfGenerateResult,
    };
  }

  // 2. Check dist/client exists
  if (!existsSync(distDir)) {
    return {
      exitCode: 1,
      summary: `dist/client not found at ${relative(appDir, distDir)}. Run the Astro build first.`,
    };
  }

  // 3. Discover routable pages
  const languages: string[] = manifest.i18n?.supported
    ? Object.keys(manifest.i18n.supported)
    : [defaultLanguageFromManifest(manifest)];

  interface PageTarget {
    route: string;
    lang: string;
    pdfPath: string;
    printCfg: Record<string, unknown> | undefined;
  }

  const targets: PageTarget[] = [];
  for (const page of manifest.pages ?? []) {
    const pageId = page.pageId;
    const fileSlug = pageIdToContentFileSlug(pageId);
    const locales = page.locales ?? languages;

    for (const lang of locales) {
      const pageFile = join(contentDir, "pages", lang, `${fileSlug}.md`);
      if (!existsSync(pageFile)) continue;

      const raw = await readFile(pageFile, "utf-8");
      const { data } = parseMarkdownFrontmatter(raw);
      const printCfg = (data as Record<string, unknown>).print as
        Record<string, unknown> | undefined;

      // Skip pages with print.enabled: false
      if (printCfg?.enabled === false) continue;

      const routeSlug = page.routes?.[lang] ?? fileSlug;
      // Build the route path — default language is unprefixed
      const isDefaultLang = lang === defaultLanguageFromManifest(manifest);
      const routePath = isDefaultLang ? `/${routeSlug}` : `/${lang}/${routeSlug}`;

      // PDF path: dist/client/_print/<lang>/<path>.pdf
      const pdfPath = join(distDir, "_print", lang, `${routeSlug || "index"}.pdf`);

      targets.push({ route: routePath, lang, pdfPath, printCfg });
    }
  }

  // 4. Filter out existing PDFs (idempotent) unless --force
  const toGenerate: PageTarget[] = [];
  let skipped = 0;
  for (const target of targets) {
    if (!force && existsSync(target.pdfPath) && statSync(target.pdfPath).size > 0) {
      skipped++;
    } else {
      toGenerate.push(target);
    }
  }

  if (toGenerate.length === 0) {
    return {
      exitCode: 0,
      summary: `No PDFs to generate. ${skipped} skipped, ${targets.length - skipped} disabled.`,
      data: {
        generated: 0,
        skipped,
        disabled: targets.length - skipped - 0,
        errors: [],
        outputDir: join(distDir, "_print"),
      } satisfies PrintPdfGenerateResult,
    };
  }

  // 5. Start a static HTTP server over dist/client
  const server = createServer(async (req, res) => {
    let urlPath = req.url ?? "/";
    if (urlPath.includes("?")) {
      urlPath = urlPath.split("?")[0];
    }
    if (urlPath === "/") urlPath = "/index.html";
    // Try the path as-is, then with /index.html
    let filePath = join(distDir, urlPath);
    if (!existsSync(filePath)) {
      filePath = join(distDir, urlPath, "index.html");
    }
    if (!existsSync(filePath) && !urlPath.endsWith(".html")) {
      filePath = join(distDir, `${urlPath}.html`);
    }
    if (!existsSync(filePath)) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    try {
      const data = await readFile(filePath);
      const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
      const mimeTypes: Record<string, string> = {
        html: "text/html",
        css: "text/css",
        js: "text/javascript",
        json: "application/json",
        png: "image/png",
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        webp: "image/webp",
        svg: "image/svg+xml",
        woff2: "font/woff2",
        pdf: "application/pdf",
        ico: "image/x-icon",
        txt: "text/plain",
        xml: "application/xml",
      };
      res.writeHead(200, { "Content-Type": mimeTypes[ext] ?? "application/octet-stream" });
      res.end(data);
    } catch {
      res.writeHead(500);
      res.end("Internal error");
    }
  });

  const port = await new Promise<number>((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      resolve(typeof addr === "object" && addr ? addr.port : 0);
    });
  });

  if (port === 0) {
    return {
      exitCode: 1,
      summary: "Failed to start static file server for PDF generation.",
    };
  }

  // 6. Launch Playwright and generate PDFs
  let generated = 0;
  const errors: Array<{ route: string; error: string }> = [];
  let browser: any = null;

  try {
    const playwright = await import("playwright");
    browser = await playwright.chromium.launch({ headless: true });

    for (const target of toGenerate) {
      try {
        const page = await browser.newPage();
        const url = `http://127.0.0.1:${port}${target.route}?print`;
        await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });

        // Expand details if configured
        if (target.printCfg?.expandDetails !== false) {
          await page.evaluate(() => {
            document.querySelectorAll("details").forEach((d) => {
              (d as HTMLDetailsElement).open = true;
            });
          });
        }

        // Determine PDF options from print config
        const orientation = target.printCfg?.orientation as string | undefined;
        const pageSize = target.printCfg?.pageSize as string | undefined;
        const margins = target.printCfg?.margins as string | undefined;

        const marginMap: Record<
          string,
          { top: string; bottom: string; left: string; right: string }
        > = {
          normal: { top: "20mm", bottom: "20mm", left: "15mm", right: "15mm" },
          narrow: { top: "10mm", bottom: "10mm", left: "10mm", right: "10mm" },
          none: { top: "0", bottom: "0", left: "0", right: "0" },
        };

        const pdfBuffer = await page.pdf({
          format: pageSize ?? "a4",
          landscape: orientation === "landscape",
          margin: marginMap[margins ?? "normal"],
          printBackground: true,
          preferCSSPageSize: true,
        });

        // Ensure parent directory exists
        const parentDir = join(target.pdfPath, "..");
        mkdirSync(parentDir, { recursive: true });
        await writeFile(target.pdfPath, pdfBuffer);
        generated++;
        await page.close();
      } catch (err: any) {
        errors.push({ route: target.route, error: err.message ?? String(err) });
      }
    }
  } catch (err: any) {
    return {
      exitCode: 1,
      summary: `Playwright error: ${err.message ?? String(err)}. Ensure Playwright Chromium is installed (pnpm exec playwright install chromium).`,
      data: {
        generated,
        skipped,
        disabled: 0,
        errors,
        outputDir: join(distDir, "_print"),
      } satisfies PrintPdfGenerateResult,
    };
  } finally {
    if (browser) await browser.close().catch(() => {});
    server.close();
  }

  const result: PrintPdfGenerateResult = {
    generated,
    skipped,
    disabled:
      targets.length - toGenerate.length - skipped > 0
        ? targets.length - toGenerate.length - skipped
        : 0,
    errors,
    outputDir: join(distDir, "_print"),
  };

  if (errors.length > 0) {
    return {
      exitCode: 1,
      summary: `Generated ${generated} PDFs, skipped ${skipped}, ${errors.length} error${errors.length === 1 ? "" : "s"}.`,
      data: result,
    };
  }

  return {
    exitCode: 0,
    summary: `Generated ${generated} PDFs, skipped ${skipped}.`,
    data: result,
  };
}

// ---------------------------------------------------------------------------
// print.pdf.validate
// ---------------------------------------------------------------------------

export async function runPrintPdfValidate(
  _input: any,
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
  const distDir = join(appDir, "dist", "client");
  const printDir = join(distDir, "_print");

  // Check if printPdf is enabled
  let manifest: any;
  try {
    const result = await loadSystemManifest(contentDir);
    manifest = result.manifest;
  } catch {
    return {
      exitCode: 1,
      summary: "Failed to load system manifest.",
    };
  }

  if (manifest?.output?.printPdf !== true) {
    return {
      exitCode: 0,
      summary: "PDF generation disabled for this app. Nothing to validate.",
    };
  }

  if (!existsSync(printDir)) {
    return {
      exitCode: 1,
      summary: `Print directory not found: ${relative(appDir, printDir)}. Run print.pdf.generate first.`,
    };
  }

  // Discover expected PDFs from the route registry
  const languages: string[] = manifest.i18n?.supported
    ? Object.keys(manifest.i18n.supported)
    : [defaultLanguageFromManifest(manifest)];

  interface ExpectedPdf {
    route: string;
    lang: string;
    pdfPath: string;
  }

  const expected: ExpectedPdf[] = [];
  for (const page of manifest.pages ?? []) {
    const pageId = page.pageId;
    const fileSlug = pageIdToContentFileSlug(pageId);
    const locales = page.locales ?? languages;

    for (const lang of locales) {
      const pageFile = join(contentDir, "pages", lang, `${fileSlug}.md`);
      if (!existsSync(pageFile)) continue;

      const raw = await readFile(pageFile, "utf-8");
      const { data } = parseMarkdownFrontmatter(raw);
      const printCfg = (data as Record<string, unknown>).print as
        Record<string, unknown> | undefined;

      if (printCfg?.enabled === false) continue;

      const routeSlug = page.routes?.[lang] ?? fileSlug;
      const pdfPath = join(printDir, lang, `${routeSlug || "index"}.pdf`);
      expected.push({ route: `/${lang}/${routeSlug}`, lang, pdfPath });
    }
  }

  const missing: Array<{ route: string; file: string }> = [];
  const empty: Array<{ route: string; file: string }> = [];
  const MIN_PDF_SIZE = 1024; // 1KB minimum

  for (const exp of expected) {
    if (!existsSync(exp.pdfPath)) {
      missing.push({ route: exp.route, file: relative(appDir, exp.pdfPath) });
    } else {
      const size = statSync(exp.pdfPath).size;
      if (size < MIN_PDF_SIZE) {
        empty.push({ route: exp.route, file: relative(appDir, exp.pdfPath) });
      }
    }
  }

  if (missing.length > 0 || empty.length > 0) {
    const violations: Array<{ rule: string; route: string; file: string; message: string }> = [];
    for (const m of missing) {
      violations.push({
        rule: "PRINT-PDF-01",
        route: m.route,
        file: m.file,
        message: `Missing PDF for route ${m.route}: ${m.file}`,
      });
    }
    for (const e of empty) {
      violations.push({
        rule: "PRINT-PDF-02",
        route: e.route,
        file: e.file,
        message: `PDF is empty or too small for route ${e.route}: ${e.file}`,
      });
    }
    return {
      exitCode: 1,
      summary: `${missing.length} missing, ${empty.length} empty PDF${missing.length + empty.length === 1 ? "" : "s"}.`,
      data: { expected: expected.length, missing: missing.length, empty: empty.length, violations },
    };
  }

  return {
    exitCode: 0,
    summary: `All ${expected.length} expected PDF${expected.length === 1 ? "" : "s"} are present and non-empty.`,
    data: { expected: expected.length, missing: 0, empty: 0 },
  };
}
