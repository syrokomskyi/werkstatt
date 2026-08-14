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
  <item>RFC-0653: print.pdf.generate writes to .cache/pdf/<hash>/ with .done marker + manifest.json; add print.pdf.copy command.</item>
  <item>RFC-0843: replace networkidle with load + blockExternalRequests, use browser.newContext(), add 2s settle wait, adopt evaluateInPage wrapper.</item>
</CHANGE_SUMMARY>
*/

import type { KernelCommandResult, KernelRuntimeContext } from "@warpgogol/werkstatt/kernel";
import { writeFileIfChanged } from "@warpgogol/werkstatt/kernel";
import { existsSync, mkdirSync, statSync } from "node:fs";
import { readFile, copyFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { createServer } from "node:http";
import { loadSystemManifest, parseMarkdownFrontmatter } from "@warpgogol/werkstatt-site/content";
import { pageIdToContentFileSlug } from "@warpgogol/werkstatt-site/share/content";
import { stableJsonHash, byteHash } from "@warpgogol/werkstatt/fingerprint";
import type { PrintPdfGenerateResult } from "@warpgogol/werkstatt-site/share/schemas/print";
import { defaultLanguageFromManifest } from "./lib/i18n.ts";
import { blockExternalRequests, evaluateInPage } from "./playwright-utils.ts";

// ---------------------------------------------------------------------------
// print.pdf.generate
// ---------------------------------------------------------------------------

export async function runPrintPdfGenerate(
  input: unknown,
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
  const inputRecord = input as Record<string, unknown> | undefined;
  const force = inputRecord?.force === true || inputRecord?.f === true;

  // 1. Read system.md and check output.printPdf
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

  if ((manifest.output as Record<string, unknown> | undefined)?.printPdf !== true) {
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
  const languages: string[] = (manifest.i18n as Record<string, unknown> | undefined)?.supported
    ? Object.keys((manifest.i18n as Record<string, unknown>).supported as Record<string, unknown>)
    : [defaultLanguageFromManifest(manifest)];

  interface PageTarget {
    route: string;
    routeSlug: string;
    lang: string;
    htmlPath: string;
    printCfg: Record<string, unknown> | undefined;
  }

  const targets: PageTarget[] = [];
  for (const page of (manifest.pages as Array<Record<string, unknown>>) ?? []) {
    const pageId = page.pageId as string;
    const fileSlug = pageIdToContentFileSlug(pageId);
    const locales = (page.locales as string[] | undefined) ?? languages;

    for (const lang of locales) {
      const pageFile = join(contentDir, "pages", lang, `${fileSlug}.md`);
      if (!existsSync(pageFile)) continue;

      const raw = await readFile(pageFile, "utf-8");
      const { data } = parseMarkdownFrontmatter(raw);
      const printCfg = (data as Record<string, unknown>).print as
        Record<string, unknown> | undefined;

      // Skip pages with print.enabled: false
      if (printCfg?.enabled === false) continue;

      const routeSlug = (page.routes as Record<string, string> | undefined)?.[lang] ?? fileSlug;
      // Build the route path — default language is unprefixed
      const isDefaultLang = lang === defaultLanguageFromManifest(manifest);
      const routePath = isDefaultLang ? `/${routeSlug}` : `/${lang}/${routeSlug}`;

      // HTML source path for hash computation
      const htmlPath = isDefaultLang
        ? join(distDir, routeSlug || "", "index.html")
        : join(distDir, lang, routeSlug || "", "index.html");

      targets.push({ route: routePath, routeSlug: routeSlug || "index", lang, htmlPath, printCfg });
    }
  }

  // 4. Compute composite hash from HTML files + print config (RFC-0653)
  const hashInputs: Array<{ route: string; lang: string; htmlHash: string; printCfg: unknown }> =
    [];
  for (const target of targets) {
    let htmlHash = "missing";
    if (existsSync(target.htmlPath)) {
      const htmlContent = await readFile(target.htmlPath, "utf-8");
      htmlHash = byteHash(htmlContent);
    }
    hashInputs.push({
      route: target.route,
      lang: target.lang,
      htmlHash,
      printCfg: target.printCfg,
    });
  }
  const compositeHash = stableJsonHash({ pages: hashInputs }).replace(/^sha256:/, "");
  const cacheBaseDir = join(appDir, ".cache", "pdf");
  const cacheDir = join(cacheBaseDir, compositeHash);
  const doneMarker = join(cacheDir, ".done");

  // 5. Check .done marker for internal cache hit (unless --force)
  if (!force && existsSync(doneMarker)) {
    // Write manifest with current cache dir
    const manifestEntries = targets.map((t) => ({
      lang: t.lang,
      routeSlug: t.routeSlug,
      cacheDir: relative(appDir, cacheDir),
      pdfFile: `${t.routeSlug}.pdf`,
    }));
    await writeFileIfChanged(
      join(cacheBaseDir, "manifest.json"),
      JSON.stringify({ entries: manifestEntries }, null, 2) + "\n",
    );
    return {
      exitCode: 0,
      summary: `PDF cache hit (hash: ${compositeHash.slice(0, 12)}). ${targets.length} PDFs in cache.`,
      data: {
        generated: 0,
        skipped: targets.length,
        disabled: 0,
        errors: [],
        outputDir: relative(appDir, cacheDir),
        cacheHit: true,
      } satisfies PrintPdfGenerateResult & { cacheHit: boolean },
    };
  }

  const toGenerate = targets;

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
  let browser: Awaited<ReturnType<(typeof import("playwright"))["chromium"]["launch"]>> | null =
    null;

  try {
    const playwright = await import("playwright");
    browser = await playwright.chromium.launch({ headless: true });

    const baseUrl = `http://127.0.0.1:${port}`;
    const context = await browser.newContext();
    await blockExternalRequests(context, baseUrl);

    for (const target of toGenerate) {
      try {
        const page = await context.newPage();
        const url = `${baseUrl}${target.route}?print`;
        await page.goto(url, { waitUntil: "load", timeout: 30000 });
        await page.waitForTimeout(2000);

        // Expand details if configured
        if (target.printCfg?.expandDetails !== false) {
          await evaluateInPage(page, () => {
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

        // Ensure parent directory exists in cache
        const pdfPath = join(cacheDir, target.lang, `${target.routeSlug}.pdf`);
        const parentDir = join(pdfPath, "..");
        mkdirSync(parentDir, { recursive: true });
        await writeFileIfChanged(pdfPath, Buffer.from(pdfBuffer));
        generated++;
        await page.close();
      } catch (err: unknown) {
        errors.push({ route: target.route, error: (err as Error).message ?? String(err) });
      }
    }
    await context.close().catch(() => {});
  } catch (err: unknown) {
    return {
      exitCode: 1,
      summary: `Playwright error: ${(err as Error).message ?? String(err)}. Ensure Playwright Chromium is installed (pnpm exec playwright install chromium).`,
      data: {
        generated,
        skipped: 0,
        disabled: 0,
        errors,
        outputDir: relative(appDir, cacheDir),
      } satisfies PrintPdfGenerateResult,
    };
  } finally {
    if (browser) await browser.close().catch(() => {});
    server.close();
  }

  // 7. Write .done marker and manifest (RFC-0653)
  await writeFileIfChanged(doneMarker, new Date().toISOString() + "\n");
  const manifestEntries = targets.map((t) => ({
    lang: t.lang,
    routeSlug: t.routeSlug,
    cacheDir: relative(appDir, cacheDir),
    pdfFile: `${t.routeSlug}.pdf`,
  }));
  await writeFileIfChanged(
    join(cacheBaseDir, "manifest.json"),
    JSON.stringify({ entries: manifestEntries }, null, 2) + "\n",
  );

  const result: PrintPdfGenerateResult = {
    generated,
    skipped: 0,
    disabled: 0,
    errors,
    outputDir: relative(appDir, cacheDir),
  };

  if (errors.length > 0) {
    return {
      exitCode: 1,
      summary: `Generated ${generated} PDFs, ${errors.length} error${errors.length === 1 ? "" : "s"}.`,
      data: result,
    };
  }

  return {
    exitCode: 0,
    summary: `Generated ${generated} PDFs to .cache/pdf/${compositeHash.slice(0, 12)}/.`,
    data: result,
  };
}

// ---------------------------------------------------------------------------
// print.pdf.copy (RFC-0653)
// ---------------------------------------------------------------------------

export async function runPrintPdfCopy(
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
  const cacheBaseDir = join(appDir, ".cache", "pdf");
  const manifestPath = join(cacheBaseDir, "manifest.json");
  const distPrintDir = join(appDir, "dist", "client", "_print");

  if (!existsSync(manifestPath)) {
    return {
      exitCode: 0,
      summary: "No PDF manifest found at .cache/pdf/manifest.json. Nothing to copy.",
      data: {
        command: "print.pdf.copy",
        status: "pass",
        copied: 0,
        outputDir: "dist/client/_print",
      },
    };
  }

  let manifest: {
    entries: Array<{ lang: string; routeSlug: string; cacheDir: string; pdfFile: string }>;
  };
  try {
    const raw = await readFile(manifestPath, "utf-8");
    manifest = JSON.parse(raw);
  } catch (err: unknown) {
    return {
      exitCode: 1,
      summary: `Failed to read PDF manifest: ${(err as Error).message ?? String(err)}`,
      data: {
        command: "print.pdf.copy",
        status: "fail",
        copied: 0,
        outputDir: "dist/client/_print",
      },
    };
  }

  if (!manifest.entries || manifest.entries.length === 0) {
    return {
      exitCode: 0,
      summary: "PDF manifest is empty. Nothing to copy.",
      data: {
        command: "print.pdf.copy",
        status: "pass",
        copied: 0,
        outputDir: "dist/client/_print",
      },
    };
  }

  let copied = 0;
  const missing: string[] = [];

  for (const entry of manifest.entries) {
    const srcPath = join(appDir, entry.cacheDir, entry.lang, entry.pdfFile);
    const destPath = join(distPrintDir, entry.lang, entry.pdfFile);

    if (!existsSync(srcPath)) {
      missing.push(relative(appDir, srcPath));
      continue;
    }

    mkdirSync(join(destPath, ".."), { recursive: true });
    await copyFile(srcPath, destPath);
    copied++;
  }

  if (missing.length > 0) {
    return {
      exitCode: 1,
      summary: `Copied ${copied} PDFs, ${missing.length} missing in cache.`,
      data: {
        command: "print.pdf.copy",
        status: "fail",
        copied,
        outputDir: "dist/client/_print",
        missing,
      },
    };
  }

  return {
    exitCode: 0,
    summary: `Copied ${copied} PDFs to dist/client/_print/.`,
    data: { command: "print.pdf.copy", status: "pass", copied, outputDir: "dist/client/_print" },
  };
}

// ---------------------------------------------------------------------------
// print.pdf.validate
// ---------------------------------------------------------------------------

export async function runPrintPdfValidate(
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
  const distDir = join(appDir, "dist", "client");
  const printDir = join(distDir, "_print");

  // Check if printPdf is enabled
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

  if ((manifest.output as Record<string, unknown> | undefined)?.printPdf !== true) {
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
  const languages: string[] = (manifest.i18n as Record<string, unknown> | undefined)?.supported
    ? Object.keys((manifest.i18n as Record<string, unknown>).supported as Record<string, unknown>)
    : [defaultLanguageFromManifest(manifest)];

  interface ExpectedPdf {
    route: string;
    lang: string;
    pdfPath: string;
  }

  const expected: ExpectedPdf[] = [];
  for (const page of (manifest.pages as Array<Record<string, unknown>>) ?? []) {
    const pageId = page.pageId as string;
    const fileSlug = pageIdToContentFileSlug(pageId);
    const locales = (page.locales as string[] | undefined) ?? languages;

    for (const lang of locales) {
      const pageFile = join(contentDir, "pages", lang, `${fileSlug}.md`);
      if (!existsSync(pageFile)) continue;

      const raw = await readFile(pageFile, "utf-8");
      const { data } = parseMarkdownFrontmatter(raw);
      const printCfg = (data as Record<string, unknown>).print as
        Record<string, unknown> | undefined;

      if (printCfg?.enabled === false) continue;

      const routeSlug = (page.routes as Record<string, string> | undefined)?.[lang] ?? fileSlug;
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
