/*
<MODULE_CONTRACT>
<purpose>RFC-0647: Ensure Playwright Chromium is installed. Thin wrapper around preflightChromium from @syrokomskyi/axiom-factory-app. Used by build.post pipeline and mission.materialize.</purpose>
<non-goals>
  <item>Does not modify preflightChromium in the Axiom CLI package — retry is in this wrapper only.</item>
  <item>Do not install browsers other than Chromium — only Chromium is needed by print.pdf.generate and qa.independent.run.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0647: extracted ensurePlaywrightChromium from mission-materialize.ts, upgraded to launch verification, added PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD support.</item>
  <item>Migrated to thin wrapper around preflightChromium from @syrokomskyi/axiom-factory-app — removed duplicated launch-verify-install-retry logic.</item>
  <item>ADR-0026: Playwright version is pinned to exact 1.62.1 across all workspaces; root postinstall script runs `playwright install chromium` after every pnpm install, making the fallback path below a safety net rather than the common path.</item>
  <item>RFC-0813: extracted isChromiumInstalled pure function for reuse by playwright.preflight.check.</item>
  <item>RFC-0845: added retry logic (3 attempts, 2s/4s exponential backoff) around preflightChromium call for network failure resilience.</item>
</CHANGE_SUMMARY>
*/

import { preflightChromium } from "@syrokomskyi/axiom-factory-app/run/axiom-cli";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/werkstatt/kernel";

export interface PlaywrightChromiumEnsureResult {
  installed: boolean;
  chromiumRevision: string | null;
  skipped: boolean;
}

export interface ChromiumInstallStatus {
  installed: boolean;
  error?: string;
  revision?: string;
}

/**
 * Check if Playwright Chromium is installed and launchable.
 *
 * Attempts `chromium.launch({ headless: true })` and returns the result.
 * Does NOT attempt auto-install — that is `ensureChromium`'s job.
 *
 * Returns `{ installed: true, revision }` on success, `{ installed: false, error }` on failure.
 * The error message is the original launch error so callers can distinguish
 * "binary not found" from "sandbox/library issues".
 */
export async function isChromiumInstalled(_workspaceRoot: string): Promise<ChromiumInstallStatus> {
  try {
    const { chromium } = await import("playwright");
    const browser = await chromium.launch({ headless: true });
    const revision = browser.version();
    await browser.close();
    return { installed: true, revision };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return { installed: false, error };
  }
}

/**
 * Ensure Playwright Chromium is installed and launchable.
 *
 * Launches Chromium to verify (not just a directory check — catches corrupt installs).
 * If launch fails, delegates to `preflightChromium` from `@syrokomskyi/axiom-factory-app`
 * for auto-install. Retries up to 3 times with 2s/4s exponential backoff on failure.
 * `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD` is handled by `preflightChromium`.
 *
 * Callers that need non-fatal semantics (e.g. `mission.materialize`) should wrap
 * this in a try/catch and log the error.
 */
const ENSURE_CHROMIUM_MAX_ATTEMPTS = 3;
const ENSURE_CHROMIUM_BACKOFF_DELAYS_MS = [2_000, 4_000];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function ensureChromium(
  _workspaceRoot: string,
  logger: { info: (msg: string) => void; warn?: (msg: string) => void },
): Promise<PlaywrightChromiumEnsureResult> {
  const status = await isChromiumInstalled(_workspaceRoot);
  if (status.installed) {
    logger.info(`  Playwright Chromium: already installed (${status.revision})`);
    return { installed: true, chromiumRevision: status.revision ?? null, skipped: true };
  }

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= ENSURE_CHROMIUM_MAX_ATTEMPTS; attempt++) {
    try {
      await preflightChromium(false);

      const { chromium } = await import("playwright");
      const browser = await chromium.launch({ headless: true });
      const revision = browser.version();
      await browser.close();
      logger.info(`  Playwright Chromium: installed (${revision})`);
      return { installed: true, chromiumRevision: revision, skipped: false };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < ENSURE_CHROMIUM_MAX_ATTEMPTS) {
        const warn = logger.warn ?? logger.info;
        warn(`  Playwright Chromium: install attempt ${attempt} failed — ${lastError.message}`);
        await sleep(ENSURE_CHROMIUM_BACKOFF_DELAYS_MS[attempt - 1]);
      }
    }
  }

  throw lastError ?? new Error("Playwright Chromium installation failed after all retries");
}

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
