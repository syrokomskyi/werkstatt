/*
<MODULE_CONTRACT>
<purpose>
RFC-0382: Command handlers for kernel.cache.status and kernel.cache.clear commands, delegating to the CacheLayer abstraction.
</purpose>
<non-goals>
  <item>Do not implement cache storage logic — delegates to CacheLayer.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0382: initial implementation — runKernelCacheStatus and runKernelCacheClear handlers.</item>
</CHANGE_SUMMARY>
*/

import type { KernelCommandInput, KernelCommandResult, KernelRuntimeContext } from "../types.ts";
import { createCacheLayer, type CacheStatus } from "./cache-layer.ts";

export async function runKernelCacheStatus(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CacheStatus>> {
  const cache = await createCacheLayer(context.workspaceRoot);
  const status = await cache.status();

  if (context.outputFormat === "pretty") {
    if (status.available) {
      context.logger.section("Kernel cache status");
      context.logger.success(`Available — ${status.dbPath}`);
      context.logger.info(`DB size: ${(status.dbSizeBytes / 1024).toFixed(1)} KB`);
      for (const ns of status.namespaces) {
        context.logger.info(
          `  ${ns.name}: ${ns.entries} entries, hit ratio ${(ns.hitRatio * 100).toFixed(1)}%`,
        );
      }
    } else {
      context.logger.warn(`Cache unavailable: ${status.unavailableReason ?? "unknown reason"}`);
    }
  }

  return {
    data: status,
    summary: status.available
      ? `Cache active — ${status.namespaces.length} namespace(s)`
      : `Cache unavailable: ${status.unavailableReason ?? "unknown"}`,
  };
}

export async function runKernelCacheClear(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<{ cleared: boolean; dbPath: string; namespace?: string }>> {
  const cache = await createCacheLayer(context.workspaceRoot);
  const namespace = input.flags["namespace"] as string | undefined;

  await cache.clear(namespace);
  const status = await cache.status();

  if (context.outputFormat === "pretty") {
    context.logger.success(
      namespace
        ? `Cleared namespace "${namespace}" from ${status.dbPath}`
        : `Cleared all namespaces from ${status.dbPath}`,
    );
  }

  return {
    data: { cleared: true, dbPath: status.dbPath, namespace },
    summary: namespace ? `Cleared namespace "${namespace}"` : "Cleared all cache namespaces",
  };
}
