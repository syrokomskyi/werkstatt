/*
<MODULE_CONTRACT>
<purpose>Plugin hook invocation helper. Provides a typed wrapper for calling
plugin lifecycle hooks with error handling and neutral defaults (RFC-0770/0772).</purpose>
<keywords>plugin, hooks, invocation, RFC-0770, RFC-0772</keywords>
<non-goals>
  <item>Do not implement hook logic — that lives in the plugin.</item>
  <item>Do not bypass the registry — all hooks go through resolve().</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0772: initial hook invocation helper with neutral defaults.</item>
</CHANGE_SUMMARY>
*/

import type { WerkstattPlugin, PluginHookContext, HookResult } from "../plugin-contract.ts";
import type { PluginRegistry } from "../plugin-registry.ts";

/**
 * Invoke a plugin hook by name. If the hook is not registered (undefined),
 * returns a neutral success result. If no plugin is registered, throws PLUGIN-01.
 */
export async function invokeHook<T extends PluginHookContext>(
  registry: PluginRegistry,
  hookName: keyof import("../plugin-contract.ts").WerkstattPluginHooks,
  ctx: T,
): Promise<HookResult> {
  const plugin: WerkstattPlugin = registry.resolve();
  const hook = plugin.hooks?.[hookName] as ((ctx: T) => Promise<HookResult>) | undefined;
  if (!hook) {
    return { success: true, data: undefined };
  }
  return hook(ctx);
}

/**
 * Invoke the materialize hook (mission.materialize: scaffold/regenerate workpiece).
 */
export async function invokeMaterializeHook(
  registry: PluginRegistry,
  ctx: PluginHookContext,
): Promise<HookResult> {
  return invokeHook(registry, "materialize", ctx);
}

/**
 * Invoke the build hook (replaces hardcoded astro/pnpm build call).
 */
export async function invokeBuildHook(
  registry: PluginRegistry,
  ctx: PluginHookContext,
): Promise<HookResult> {
  return invokeHook(registry, "build", ctx);
}

/**
 * Invoke the checkGate hook (quality gate after build).
 */
export async function invokeCheckGateHook(
  registry: PluginRegistry,
  ctx: PluginHookContext & { baseUrl?: string },
): Promise<HookResult> {
  return invokeHook(registry, "checkGate", ctx);
}

/**
 * Invoke the releaseEvidence hook (release.prepare: behavior snapshots).
 */
export async function invokeReleaseEvidenceHook(
  registry: PluginRegistry,
  ctx: PluginHookContext,
): Promise<HookResult> {
  return invokeHook(registry, "releaseEvidence", ctx);
}

/**
 * Invoke the scaffoldProject hook (onboarding.scaffold: create new project workspace).
 */
export async function invokeScaffoldProjectHook(
  registry: PluginRegistry,
  ctx: PluginHookContext & { projectId: string },
): Promise<HookResult> {
  return invokeHook(registry, "scaffoldProject", ctx);
}
