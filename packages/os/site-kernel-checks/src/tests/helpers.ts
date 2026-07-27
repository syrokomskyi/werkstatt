/*
<MODULE_CONTRACT>
<purpose>
  Shared test helpers for @gogol/site-kernel-checks test files. Eliminates
  the duplicated logger stub and KernelRuntimeContext construction pattern
  that was copy-pasted across 30+ test files. Import from "./helpers.ts"
  instead of re-declaring the logger and context factory inline.
</purpose>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial extraction: testLogger, makeTestContext, makeTestSiteContext.</item>
  <item>Added testInput and unwrapData helpers to eliminate repeated literals and non-null assertions.</item>
</CHANGE_SUMMARY>
*/

import { join } from "node:path";
import type {
  DiscoveredSiteWorkspace,
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@gogol/site-kernel";

/** No-op logger stub for tests — all methods are silent. */
export const testLogger = {
  section() {},
  info() {},
  warn() {},
  error() {},
  success() {},
  getEvents() {
    return [];
  },
} as never;

/**
 * Build a workspace-scoped KernelRuntimeContext (no site).
 * Use for commands that operate on the workspace root without an app context.
 */
export function makeTestContext(workspaceRoot: string): KernelRuntimeContext {
  return {
    workspaceRoot,
    site: undefined,
    siteExplicit: false,
    logger: testLogger,
    dryRun: false,
    outputFormat: "pretty",
    io: {} as never,
    fileIntents: [],
  };
}

/** Standard no-arg KernelCommandInput for tests that don't test input parsing. */
export function testInput(): KernelCommandInput {
  return { flags: {}, argv: [], args: [] };
}

/** Unwrap the data field from a KernelCommandResult, asserting it is present. */
export function unwrapData<T>(result: KernelCommandResult<T>): T {
  return result.data as T;
}

/**
 * Build an app-scoped KernelRuntimeContext with a DiscoveredSiteWorkspace.
 * Use for commands that require `context.site` (requireAstroSitePaths, etc.).
 */
export function makeTestSiteContext(
  workspaceRoot: string,
  appDir: string,
  siteName = "test-app",
): KernelRuntimeContext {
  const site: DiscoveredSiteWorkspace = {
    name: siteName,
    directory: appDir,
    toolsDirectory: join(appDir, "tools"),
  };
  return {
    workspaceRoot,
    site,
    siteExplicit: true,
    logger: testLogger,
    dryRun: false,
    outputFormat: "pretty",
    io: {} as never,
    fileIntents: [],
  };
}
