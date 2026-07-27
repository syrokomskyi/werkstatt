/*
<MODULE_CONTRACT>
<purpose>
RFC-0333: Independent black-box QA runner. Executes page probes from
accepted/implemented RFCs against a built dist/client using Playwright.
Reads ONLY dist/client bytes and RFC frontmatter — never app/package source.
</purpose>
<non-goals>
  <item>MUST NOT import from apps/*, services/*, or any rendering package — independence invariant.</item>
  <item>No LLM-driven QA — deterministic probes only.</item>
  <item>No visual regression or screenshot diffing.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0333: initial implementation.</item>
</CHANGE_SUMMARY>
*/

import { createServer, type Server } from "node:http";
import { stat, readdir, readFile as fsReadFile } from "node:fs/promises";
import { join, extname, normalize } from "node:path";

import { parse as parseYaml } from "yaml";

import type {
  AcceptanceProbe,
  Diagnostic,
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";
import { RFC_DIR } from "@warpgogol/site-kernel";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PageProbeExecution {
  rfcId: string;
  probe: Extract<AcceptanceProbe, { probe: "page" }>;
  ok: boolean;
  failures: Array<{ assertion: string; expected: string; actual: string }>;
  durationMs: number;
}

export interface IndependentQaResult {
  command: "qa.independent.run";
  status: "pass" | "fail";
  site: string;
  probeCount: number;
  executions: PageProbeExecution[];
  diagnostics: Diagnostic[];
}

// ─── Static server ───────────────────────────────────────────────────────────

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".txt": "text/plain",
  ".xml": "application/xml",
};

function createStaticServer(rootDir: string): Server {
  return createServer(async (req, res) => {
    try {
      let urlPath = req.url ?? "/";
      const queryIdx = urlPath.indexOf("?");
      if (queryIdx !== -1) urlPath = urlPath.slice(0, queryIdx);

      let filePath = normalize(join(rootDir, urlPath));
      if (!filePath.startsWith(rootDir)) {
        res.writeHead(403);
        res.end("Forbidden");
        return;
      }

      // Try the path directly, then index.html
      try {
        const s = await stat(filePath);
        if (s.isDirectory()) {
          filePath = join(filePath, "index.html");
        }
      } catch {
        // Try index.html for directory-like paths
        if (urlPath.endsWith("/")) {
          filePath = join(rootDir, urlPath, "index.html");
        } else {
          filePath = join(rootDir, urlPath, "index.html");
        }
      }

      const content = await fsReadFile(filePath);
      const mime = MIME_TYPES[extname(filePath)] ?? "application/octet-stream";
      res.writeHead(200, { "Content-Type": mime });
      res.end(content);
    } catch {
      // Try 404.html fallback
      try {
        const fallback = join(rootDir, "404.html");
        const content = await fsReadFile(fallback);
        res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
        res.end(content);
      } catch {
        res.writeHead(404);
        res.end("Not Found");
      }
    }
  });
}

// ─── Probe collection ────────────────────────────────────────────────────────

interface CollectedProbe {
  rfcId: string;
  rfcFile: string;
  probe: Extract<AcceptanceProbe, { probe: "page" }>;
}

async function collectPageProbes(
  rfcDirPath: string,
  siteName: string,
  rfcFilter?: string,
): Promise<CollectedProbe[]> {
  const allFiles = await readdir(rfcDirPath);
  const files = allFiles.filter((f) => /^rfc-\d{4}-.*\.md$/i.test(f));
  const probes: CollectedProbe[] = [];

  for (const fileName of files) {
    let content: string;
    try {
      content = await fsReadFile(join(rfcDirPath, fileName), "utf-8");
    } catch {
      continue;
    }

    const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (!fmMatch) continue;
    let fm: Record<string, unknown>;
    try {
      fm = parseYaml(fmMatch[1]!) as Record<string, unknown>;
    } catch {
      continue;
    }

    const rfcId = String(fm["id"] ?? "");
    const status = String(fm["status"] ?? "");
    const scope = String(fm["scope"] ?? "");
    const appsImpacted = Array.isArray(fm["appsImpacted"]) ? (fm["appsImpacted"] as string[]) : [];

    if (status !== "accepted" && status !== "implemented") continue;
    if (rfcFilter && rfcId.toLowerCase() !== rfcFilter.toLowerCase()) continue;

    if (scope !== "workspace" && !appsImpacted.includes(siteName)) continue;

    const acceptance = fm["acceptance"];
    if (!Array.isArray(acceptance)) continue;

    for (const entry of acceptance) {
      if (
        entry &&
        typeof entry === "object" &&
        (entry as Record<string, unknown>)["probe"] === "page"
      ) {
        probes.push({
          rfcId,
          rfcFile: join(RFC_DIR, fileName),
          probe: entry as Extract<AcceptanceProbe, { probe: "page" }>,
        });
      }
    }
  }

  return probes;
}

// ─── Command handler ─────────────────────────────────────────────────────────

export async function runIndependentQa(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<IndependentQaResult>> {
  const { workspaceRoot, site, logger, outputFormat } = context;
  const rfcFilter = input.flags["rfc"] as string | undefined;

  const siteName = site?.name;
  if (!siteName) {
    throw new Error("qa.independent.run requires --site <app-name> (or --all).");
  }

  const distPath = join(site?.directory ?? join(workspaceRoot, "apps", siteName), "dist", "client");

  // QA-IND-02: missing dist — skip gracefully when no build exists
  try {
    await stat(distPath);
  } catch {
    return {
      data: {
        command: "qa.independent.run",
        status: "pass",
        site: siteName,
        probeCount: 0,
        executions: [],
        diagnostics: [],
      },
      exitCode: 0,
      summary: `qa.independent.run: skipped — no dist/client for ${siteName} (run build first)`,
    };
  }

  const rfcDirPath = join(workspaceRoot, RFC_DIR);
  const collected = await collectPageProbes(rfcDirPath, siteName, rfcFilter);

  // QA-IND-03: zero probes — fast path
  if (collected.length === 0) {
    const diagnostics: Diagnostic[] = [
      {
        ruleId: "QA-IND-03",
        severity: "info",
        file: `apps/${siteName}`,
        message: `No page probes declared for app "${siteName}". Nothing to verify.`,
      },
    ];
    if (outputFormat === "pretty") {
      logger.info(`No page probes for ${siteName} — nothing to verify.`);
    }
    return {
      data: {
        command: "qa.independent.run",
        status: "pass",
        site: siteName,
        probeCount: 0,
        executions: [],
        diagnostics,
      },
      exitCode: 0,
      summary: `qa.independent.run: 0 page probes for ${siteName}`,
    };
  }

  // Start static server
  const server = createStaticServer(distPath);
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // Launch Playwright
    let chromium: any;
    try {
      const pw = await import("playwright");
      chromium = pw.chromium;
    } catch {
      const diagnostics: Diagnostic[] = [
        {
          ruleId: "QA-IND-04",
          severity: "error",
          file: `apps/${siteName}`,
          message:
            "Playwright not available. Run `npx playwright install chromium` to enable independent QA.",
        },
      ];
      return {
        data: {
          command: "qa.independent.run",
          status: "fail",
          site: siteName,
          probeCount: collected.length,
          executions: [],
          diagnostics,
        },
        exitCode: 1,
        summary: `qa.independent.run: Playwright not available`,
      };
    }

    const browser = await chromium.launch({ headless: true });
    const diagnostics: Diagnostic[] = [];
    const executions: PageProbeExecution[] = [];

    try {
      for (const { rfcId, rfcFile, probe } of collected) {
        const start = Date.now();
        const failures: PageProbeExecution["failures"] = [];
        const consoleErrors: string[] = [];

        const page = await browser.newPage();
        page.on("console", (msg: any) => {
          if (msg.type() === "error") {
            consoleErrors.push(msg.text());
          }
        });

        const expectedStatus = probe.expectStatus ?? 200;
        try {
          const response = await page.goto(`${baseUrl}${probe.path}`, {
            waitUntil: "networkidle",
            timeout: 30000,
          });

          if (!response) {
            failures.push({
              assertion: "status",
              expected: String(expectedStatus),
              actual: "no response",
            });
          } else if (response.status() !== expectedStatus) {
            failures.push({
              assertion: "status",
              expected: String(expectedStatus),
              actual: String(response.status()),
            });
          }

          if (probe.selector && failures.length === 0) {
            const elements = await page.$$(probe.selector);
            if (elements.length === 0) {
              failures.push({
                assertion: "selector",
                expected: `${probe.selector} (>=1 element)`,
                actual: "0 elements",
              });
            }
          }

          if (probe.textPattern && failures.length === 0) {
            const bodyText = await page.evaluate(() => document.body.innerText);
            const re = new RegExp(probe.textPattern!, "m");
            if (!re.test(bodyText)) {
              failures.push({
                assertion: "textPattern",
                expected: probe.textPattern!,
                actual: "pattern not found in body text",
              });
            }
          }

          if (!probe.allowConsoleErrors && consoleErrors.length > 0) {
            failures.push({
              assertion: "console",
              expected: "0 console errors",
              actual: `${consoleErrors.length} console error(s): ${consoleErrors[0]}`,
            });
          }
        } catch (err) {
          failures.push({
            assertion: "status",
            expected: String(expectedStatus),
            actual: `timeout or navigation error: ${String(err)}`,
          });
        }

        await page.close();
        const durationMs = Date.now() - start;
        const ok = failures.length === 0;

        executions.push({ rfcId, probe, ok, failures, durationMs });

        if (!ok) {
          for (const f of failures) {
            diagnostics.push({
              ruleId: "QA-IND-01",
              severity: "error",
              file: rfcFile,
              message: `${rfcId} page probe ${probe.path}: ${f.assertion} — expected "${f.expected}", got "${f.actual}".`,
            });
          }
        }

        if (outputFormat === "pretty") {
          const tag = ok ? "[ok]" : "[FAIL]";
          logger.info(
            `${tag} ${rfcId} ${probe.path}${probe.selector ? ` selector ${probe.selector}` : ""}`,
          );
        }
      }
    } finally {
      await browser.close();
    }

    const failedCount = diagnostics.filter((d) => d.severity === "error").length;
    const status: IndependentQaResult["status"] = failedCount > 0 ? "fail" : "pass";

    return {
      data: {
        command: "qa.independent.run",
        status,
        site: siteName,
        probeCount: collected.length,
        executions,
        diagnostics,
      },
      exitCode: failedCount > 0 ? 1 : 0,
      summary: `qa.independent.run: ${collected.length} probe(s), ${failedCount} failed`,
    };
  } finally {
    server.close();
  }
}
