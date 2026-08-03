/*
<MODULE_CONTRACT>
<purpose>RFC-0647: Ensure Playwright Chromium is installed. Thin wrapper around preflightChromium from @syrokomskyi/axiom-factory-app. Used by build.post pipeline and mission.materialize.</purpose>
<non-goals>
  <item>Does not implement launch-verify-install-retry logic — delegated to preflightChromium in the Axiom CLI package.</item>
  <item>Do not install browsers other than Chromium — only Chromium is needed by print.pdf.generate and qa.independent.run.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0647: extracted ensurePlaywrightChromium from mission-materialize.ts, upgraded to launch verification, added PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD support.</item>
  <item>Migrated to thin wrapper around preflightChromium from @syrokomskyi/axiom-factory-app — removed duplicated launch-verify-install-retry logic.</item>
</CHANGE_SUMMARY>
*/

import { preflightChromium } from "@syrokomskyi/axiom-factory-app/run/axiom-cli";
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
 * Ensure Playwright Chromium is installed and launchable.
 *
 * Launches Chromium to verify (not just a directory check — catches corrupt installs).
 * If launch fails, delegates to `preflightChromium` from `@syrokomskyi/axiom-factory-app`
 * for auto-install + retry. `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD` is handled by `preflightChromium`.
 *
 * Callers that need non-fatal semantics (e.g. `mission.materialize`) should wrap
 * this in a try/catch and log the error.
 */
export async function ensureChromium(
  _workspaceRoot: string,
  logger: { info: (msg: string) => void },
): Promise<PlaywrightChromiumEnsureResult> {
  try {
    const { chromium } = await import("playwright");
    const browser = await chromium.launch({ headless: true });
    const revision = browser.version();
    await browser.close();
    logger.info(`  Playwright Chromium: already installed (${revision})`);
    return { installed: true, chromiumRevision: revision, skipped: true };
  } catch {
    // Not installed — delegate to preflightChromium for auto-install + retry
  }

  await preflightChromium(false);

  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });
  const revision = browser.version();
  await browser.close();
  logger.info(`  Playwright Chromium: installed (${revision})`);
  return { installed: true, chromiumRevision: revision, skipped: false };
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
