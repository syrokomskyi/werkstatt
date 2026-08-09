/*
<MODULE_CONTRACT>
<purpose>Werkstatt plugin contract types (werkstatt/plugin@1). Defines the typed interface
that a stack plugin implements and registers with the engine (RFC-0770).</purpose>
<non-goals>
  <item>Do not implement plugin logic — only type definitions.</item>
  <item>Do not import from any @warpgogol/* package except site-kernel/types for KernelModule/KernelPipelineStep.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0770: initial plugin contract types — WerkstattPlugin, WerkstattPluginHooks, PluginHookContext, HookResult, StackPathConventions, StackInvariant, DeployAdapterFactory.</item>
</CHANGE_SUMMARY>
*/

import type { KernelModule, KernelPipelineStep } from "@warpgogol/site-kernel/types";

/**
 * Placeholder type for deploy adapter factories.
 * Exact shape re-homed by RFC-0772 when the engine package is filled.
 */
export type DeployAdapterFactory = unknown;

/**
 * Context passed to plugin lifecycle hooks.
 */
export interface PluginHookContext {
  workspaceRoot: string;
  logger: {
    info(message: string, details?: unknown): void;
    warn(message: string, details?: unknown): void;
    error(message: string, details?: unknown): void;
  };
  workpiecePath?: string;
  missionId?: string;
}

/**
 * Result returned by plugin lifecycle hooks.
 */
export interface HookResult {
  success: boolean;
  errors?: string[];
  warnings?: string[];
  data?: unknown;
}

/**
 * Path conventions for project workspaces.
 */
export interface StackPathConventions {
  contentDir: string;
  distDir: string;
  entryPoints: string[];
}

/**
 * Stack invariants surfaced to agents (AGENTS.md generation, doctor checks).
 */
export interface StackInvariant {
  id: string;
  description: string;
  check?: string;
}

/**
 * Lifecycle hooks the engine calls at fixed points.
 * The hook list is closed at five hooks (RFC-0770).
 * Adding a new hook requires a superseding RFC, not an amendment.
 */
export interface WerkstattPluginHooks {
  /** mission.materialize: scaffold/regenerate the workpiece after authored data injection. */
  materialize?: (ctx: PluginHookContext) => Promise<HookResult>;
  /** Build the workpiece (replaces the hardcoded astro/pnpm build call). */
  build?: (ctx: PluginHookContext) => Promise<HookResult>;
  /** Quality gate after build (site: Axiom; game: engine-specific checks; video: render verify). */
  checkGate?: (ctx: PluginHookContext & { baseUrl?: string }) => Promise<HookResult>;
  /** release.prepare: produce behavior snapshots / stack-specific release evidence. */
  releaseEvidence?: (ctx: PluginHookContext) => Promise<HookResult>;
  /** onboarding.scaffold: create a new project workspace of this stack. */
  scaffoldProject?: (ctx: PluginHookContext & { projectId: string }) => Promise<HookResult>;
}

/**
 * The plugin contract (werkstatt/plugin@1).
 * A stack plugin implements this interface and registers it with the engine.
 * One plugin per workshop — the engine refuses to start with zero or multiple.
 */
export interface WerkstattPlugin {
  schema: "werkstatt/plugin@1";
  /** Plugin id: "werkstatt-site" | "werkstatt-game" | "werkstatt-video". */
  id: string;
  /** Forge stack profile id, e.g. "astro-typescript-turborepo". */
  profileId: string;
  /** Kernel modules the plugin contributes (validators, codegen, content, onboarding). */
  moduleLoaders: Record<string, () => Promise<KernelModule>>;
  /** Named pipelines the plugin owns or extends (e.g. build.prepare steps). */
  pipelines?: Record<string, KernelPipelineStep[]>;
  /** Deploy adapters keyed by adapter id (e.g. "cloudflare-workers", "github-pages", "local-render"). */
  deployAdapters?: Record<string, DeployAdapterFactory>;
  /** Lifecycle hooks the engine calls at fixed points. All optional; engine has neutral defaults. */
  hooks?: WerkstattPluginHooks;
  /** Path conventions for project workspaces (content dir, dist dir, entry points). */
  paths: StackPathConventions;
  /** Stack invariants surfaced to agents (AGENTS.md generation, doctor checks). */
  invariants?: StackInvariant[];
}
