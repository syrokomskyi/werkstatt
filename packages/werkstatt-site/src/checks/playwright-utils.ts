/*
<MODULE_CONTRACT>
<purpose>
RFC-0843: Shared Playwright utilities for all Playwright-based validators.
Provides type-safe evaluateInPage wrapper, external request blocking, and
URL classification to prevent network-idle wait timeouts and page.evaluate(string)
footguns.
</purpose>
<non-goals>
  <item>Does not modify PlaywrightCaptureAdapter — it uses domcontentloaded and is not affected.</item>
  <item>Does not provide browser launch helpers — each validator manages its own browser lifecycle.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0843: initial creation — evaluateInPage, blockExternalRequests, isExternalUrl.</item>
</CHANGE_SUMMARY>
*/

import type { Page, BrowserContext } from "playwright";

/**
 * Type-safe wrapper for page.evaluate.
 * Only accepts function references — strings are rejected by TypeScript.
 * This prevents the footgun where page.evaluate(string) returns the function
 * object instead of the result of calling it.
 */
export async function evaluateInPage<T>(page: Page, fn: () => T): Promise<T> {
  return page.evaluate(fn);
}

/**
 * Check whether a URL is external to the allowed origin.
 * data: and blob: URLs are local — never classified as external.
 * Invalid URLs are not external — let Playwright handle them.
 */
export function isExternalUrl(url: string, allowedOrigin: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "data:" || parsed.protocol === "blob:") {
      return false;
    }
    const allowed = new URL(allowedOrigin);
    return parsed.hostname !== allowed.hostname || parsed.port !== allowed.port;
  } catch {
    return false;
  }
}

/**
 * Block all external requests on a BrowserContext.
 * Only requests to the allowed origin (local static server) are permitted;
 * everything else is aborted immediately to prevent network timeouts.
 */
export async function blockExternalRequests(
  context: BrowserContext,
  allowedOrigin: string,
): Promise<void> {
  await context.route("**/*", (route) => {
    const url = route.request().url();
    if (isExternalUrl(url, allowedOrigin)) {
      return route.abort();
    }
    return route.continue();
  });
}
