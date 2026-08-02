/*
<MODULE_CONTRACT>
<purpose>RFC-0647: Ensure Playwright Chromium is installed. Launches Chromium to verify; auto-installs if missing and PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD is not set. Used by build.post pipeline and mission.materialize.</purpose>
<non-goals>
  <item>Do not install browsers other than Chromium — only Chromium is needed by print.pdf.generate and qa.independent.run.</item>
  <item>Do not manage Playwright system dependencies (apt-get install) — that is the operator's responsibility.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0647: extracted ensurePlaywrightChromium from mission-materialize.ts, upgraded to launch verification, added PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD support.</item>
</CHANGE_SUMMARY>
*/

import { execSync } from "node:child_process";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";

export interface PlaywrightChromiumEnsureResult {
  installed: boolean;
  chromiumRevision: string | null;
  skipped: boolean;
}

/**
 * Pure function: ensure Playwright Chromium is installed and launchable.
 *
 * - Launches Chromium to verify (not just a directory check — catches corrupt installs).
 * - If launch fails and `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD` is set, throws.
 * - If launch fails and env var is not set, runs `pnpm exec playwright install chromium`
 *   (120s timeout) and retries the launch.
 * - Throws on any unrecoverable failure.
 *
 * Callers that need non-fatal semantics (e.g. `mission.materialize`) should wrap
 * this in a try/catch and log the error.
 */
export async function ensureChromium(
  workspaceRoot: string,
  logger: { info: (msg: string) => void },
): Promise<PlaywrightChromiumEnsureResult> {
  const skipDownload = process.env["PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD"] === "1";

  // Step 1: try launching Chromium to verify it's actually working
  try {
    const { chromium } = await import("playwright");
    const browser = await chromium.launch({ headless: true });
    const revision = browser.version();
    await browser.close();
    logger.info(`  Playwright Chromium: already installed (${revision})`);
    return { installed: true, chromiumRevision: revision, skipped: true };
  } catch {
    // Launch failed — continue to auto-install or env-var bail
  }

  if (skipDownload) {
    throw new Error(
      "Playwright Chromium launch failed and PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1. " +
        "Run 'pnpm exec playwright install chromium' manually.",
    );
  }

  // Step 2: auto-install Chromium
  logger.info(`  Playwright Chromium: not found — installing…`);
  try {
    execSync("pnpm exec playwright install chromium", {
      cwd: workspaceRoot,
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 120_000,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Playwright Chromium install failed: ${msg}. ` +
        `Run 'pnpm exec playwright install chromium' manually.`,
    );
  }

  // Step 3: retry launch after install
  try {
    const { chromium } = await import("playwright");
    const browser = await chromium.launch({ headless: true });
    const revision = browser.version();
    await browser.close();
    logger.info(`  Playwright Chromium: installed (${revision})`);
    return { installed: true, chromiumRevision: revision, skipped: false };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Chromium launch failed after install: ${msg}`);
  }
}

/**
 * Thin kernel command handler wrapping {@link ensureChromium} for pipeline/CLI use.
 * Failure is fatal (exitCode: 1) when called as a pipeline step.
 */
export async function runPlaywrightChromiumEnsure(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<PlaywrightChromiumEnsureResult>> {
  try {
    const result = await ensureChromium(context.workspaceRoot, context.logger);
    return {
      data: result,
      exitCode: 0,
      summary: `playwright.chromium.ensure: ${result.skipped ? "already present" : "installed"}${result.chromiumRevision ? ` (${result.chromiumRevision})` : ""}`,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      data: { installed: false, chromiumRevision: null, skipped: false },
      exitCode: 1,
      summary: `playwright.chromium.ensure: ${msg}`,
    };
  }
}
