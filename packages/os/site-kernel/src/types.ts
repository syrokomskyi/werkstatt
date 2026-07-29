/*
<MODULE_CONTRACT>
<purpose>Defines types and interfaces for kernel command execution and logging within the application framework.</purpose>
<non-goals>
  <item>Do not implement command execution logic or side effects.</item>
  <item>Do not handle raw input parsing or transport orchestration.</item>
  <item>Do not manage application lifecycle or state outside of defined commands.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0260: add KernelFlagSpec and the optional `flags` schema on KernelCommandDefinition / KernelRegisteredCommandInfo.</item>
  <item>RFC-0267: add the WorkspaceIO port field to KernelRuntimeContext.</item>
  <item>RFC-0326: add fileIntents to KernelRuntimeContext; add filesModified to KernelExecutionReport and KernelPipelineReport.</item>
  <item>RFC-0390: add cacheable to KernelCommandMetadata; add cached to KernelExecutionReport; add force to ExecuteKernelPipelineOptions; update reads JSDoc.</item>
  <item>RFC-0518: add GateMetadata, GateSeverity, GatePhase, GateConditional types and optional gate field to KernelCommandMetadata.</item>
  <item>RFC-0579: add KernelNextStep interface and optional nextSteps field to KernelCommandResult and KernelExecutionReport.</item>
</CHANGE_SUMMARY>
*/

import type { WorkspaceIO, WriteIntent } from "./workspace-io.ts";
// @ai-invariant: Kernel command contracts must stay explicit so agents cannot pass untyped command inputs.

export type KernelOutputFormat = "pretty" | "json";
export type KernelCommandScope = "app" | "workspace";
export type KernelLogLevel = "info" | "warn" | "error" | "success" | "section";
export type PipelineLogSeverity = "debug" | "info" | "notice" | "warning" | "error";
export type PipelineLogKind =
  "progress" | "expected-fallback" | "advisory" | "external-tool" | "diagnostic" | "error";

export type KernelFlagValue = boolean | string | string[];
export interface DiscoveredSiteWorkspace {
  name: string;
  directory: string;
  toolsDirectory: string;
  configPath?: string;
  packageName?: string;
}

export interface KernelLogEvent {
  level: KernelLogLevel;
  message: string;
  details?: unknown;
  timestamp: string;
  severity?: PipelineLogSeverity;
  kind?: PipelineLogKind;
  command?: string;
  pipeline?: string;
  app?: string;
  packageName?: string;
  module?: string;
  file?: string;
  line?: number;
  ruleId?: string;
  dedupeKey?: string;
  count?: number;
  data?: Record<string, unknown>;
}

export interface KernelLogger {
  section(message: string, details?: unknown): void;
  info(message: string, details?: unknown): void;
  warn(message: string, details?: unknown): void;
  error(message: string, details?: unknown): void;
  success(message: string, details?: unknown): void;
  event(event: Omit<KernelLogEvent, "level" | "timestamp"> & { level?: KernelLogLevel }): void;
  getEvents(): KernelLogEvent[];
}
export interface KernelCommandInput {
  argv: string[];
  args: string[];
  flags: Record<string, KernelFlagValue>;
}

export interface KernelCommandMetadata {
  description: string;
  scope: KernelCommandScope;
  mutatesState?: boolean;
  requiresNetwork?: boolean;
  supportsAllSites?: boolean;
  timeoutMs?: number;
  expectedDurationMs?: number;
  longRunning?: boolean;
  /**
   * RFC-0390: when false, the pipeline executor never caches this command's
   * result. Required for commands that depend on external state (network,
   * secrets, time). Commands without `reads` MUST set this to false;
   * command.reads.validate enforces this. Defaults to true.
   */
  cacheable?: boolean;
  /**
   * RFC-0518: declarative gate metadata. Optional. When present, describes the
   * gate's severity, phase, conditional logic, surfaces protected, rules enforced,
   * and workflow steps blocked on failure. Consumed by ecosystem.manifest.generate
   * and gate.catalog.generate (RFC-0519). Does NOT affect execution.
   */
  gate?: GateMetadata;
}

// ---------------------------------------------------------------------------
// RFC-0518: declarative gate metadata on command definitions
// ---------------------------------------------------------------------------

export type GateSeverity = "error" | "warning" | "mixed";
export type GatePhase = "author" | "postbuild" | "workspace" | "mission" | "release";

export interface GateConditional {
  kind: "entitlement" | "flag" | "config";
  ref: string;
  description: string;
}

export interface GateMetadata {
  severity: GateSeverity;
  phase: GatePhase;
  conditional?: GateConditional;
  surfaces?: string[];
  rules?: string[];
  blocks?: string[];
}

// ---------------------------------------------------------------------------
// RFC-0260: typed kernel command flag schemas
// ---------------------------------------------------------------------------
// A command that declares `flags` opts into strict parsing: unknown flags are
// rejected (KERNEL-FLAG-01) instead of silently ignored, and required flags
// are enforced (KERNEL-FLAG-03) before `execute()` runs. Commands without a
// `flags` schema keep the legacy heuristic-parser behavior unchanged.

export interface KernelFlagSpec {
  kind: "boolean" | "string" | "string[]";
  required?: boolean;
  default?: KernelFlagValue;
  /** One-line description; consumed by --help and future generators (rfc-0266). */
  description: string;
}

export interface KernelRegisteredCommandInfo extends KernelCommandMetadata {
  name: string;
  provider: "workspace" | "site";
  siteName?: string;
  /** The name of the KernelModule that registered this command. */
  module?: string;
  /** RFC-0260: declared flag schema, when the command opts in. */
  flags?: Record<string, KernelFlagSpec>;
  /** RFC-0266: declared IO globs, when the command opts in. */
  reads?: string[];
  writes?: string[];
}

export interface KernelNextStep {
  action: string;
  kind: "required" | "optional";
}

export interface KernelCommandResult<TData = unknown> {
  data?: TData;
  exitCode?: number;
  summary?: string;
  timing?: KernelCommandTiming;
  nextSteps?: KernelNextStep[];
}

// ---------------------------------------------------------------------------
// RFC-0203: canonical Diagnostic model
// ---------------------------------------------------------------------------
// The single shape every static check uses to report a finding. Promoted from
// the RFC-0074 audit finding (`auditFindingSchema`) and graduated into the
// kernel so the contract lives next to KernelCommandResult and the failure
// renderer (formatFailureDiagnostics). `@warpgogol/site-kernel-checks` provides the
// zod realization (`diagnosticSchema`).

export type DiagnosticSeverity = "error" | "warning" | "info";

/** Structured supporting evidence attached to a Diagnostic (RFC-0074 lineage). */
export interface DiagnosticEvidence {
  kind: "rule" | "rendered" | "source" | "config" | "cache" | "runtime";
  ruleFile?: string;
  ruleId?: string;
  file?: string;
  url?: string;
  snippet?: string;
}

export interface Diagnostic {
  /** Stable id from the rule registry, e.g. "KEL-01", "BIOME-TOKEN-02". */
  ruleId: string;
  severity: DiagnosticSeverity;
  /** One human-readable sentence. No trailing newline. */
  message: string;
  /** Workspace-relative POSIX path. Optional: some violations are global. */
  file?: string;
  line?: number;
  column?: number;
  /** Imperative remediation a human or agent can execute. */
  fixHint?: string;
  /** Structured supporting evidence. */
  evidence?: DiagnosticEvidence[];
  /** Rule-specific structured extras for machine consumers. */
  data?: Record<string, unknown>;
  /** @deprecated Legacy audit fields retained during the RFC-0203 migration. */
  id?: string;
  blockId?: string;
  /** @deprecated Use `fixHint`. Kept while audit findings migrate. */
  suggestion?: string;
}

/** Canonical per-command result payload carried inside KernelCommandResult.data. */
export interface CheckResult {
  command: string;
  status: "pass" | "warn" | "fail";
  diagnostics: Diagnostic[];
  summary: { error: number; warning: number; info: number };
}

export interface KernelRuntimeContext {
  workspaceRoot: string;
  site?: DiscoveredSiteWorkspace;
  /** True only when --site <name> was passed explicitly by the caller. False when site was resolved by cwd inference. */
  siteExplicit: boolean;
  logger: KernelLogger;
  dryRun: boolean;
  outputFormat: KernelOutputFormat;
  /**
   * RFC-0267: the WorkspaceIO port. The executor selects the adapter:
   * read-only (throws KERNEL-META-01 on mutation) for `mutatesState: false`
   * commands, recording (captures intents, touches nothing) under
   * `--dry-run`, else the default fs-backed adapter. Ambient `node:fs`
   * imports in unmigrated command modules keep working — adoption is
   * ratcheted, new-code-first.
   */
  io: WorkspaceIO;
  /**
   * RFC-0326: the WriteIntent[] captured by the tracing adapter during this
   * invocation. Set by the executor from `createDefaultIO().intents` (real
   * runs) or `createRecordingIO().intents` (dry runs). Absent for read-only
   * commands (no mutations possible). The executor converts these to
   * `filesModified` on the execution report.
   */
  fileIntents?: WriteIntent[];
}

export interface KernelCommandDefinition<TData = unknown> extends KernelCommandMetadata {
  name: string;
  /**
   * RFC-0260: declared flag schema. When present, unknown flags are rejected
   * (KERNEL-FLAG-01), string/string[] flags without a value fail
   * (KERNEL-FLAG-02), and missing `required` flags fail (KERNEL-FLAG-03) —
   * all before `execute()` runs. Absent means the command stays on the
   * legacy heuristic parser path (deprecated; see KERNEL_BOOLEAN_FLAGS).
   */
  flags?: Record<string, KernelFlagSpec>;
  /**
   * RFC-0266: workspace-root-relative path globs this command reads.
   * RFC-0390: now the functional cache input declaration. When non-empty,
   * the pipeline executor hashes matching files via @warpgogol/fingerprint
   * and skips re-execution on cache hit. The literal token "<app>" stands
   * in for the app-scoped root on app-scope commands.
   */
  reads?: string[];
  /**
   * RFC-0266: workspace-root-relative path globs this command writes. Should
   * be non-empty whenever `mutatesState` is true (CMD-MAN-02).
   */
  writes?: string[];
  execute(
    input: KernelCommandInput,
    context: KernelRuntimeContext,
  ): Promise<void | KernelCommandResult<TData>> | void | KernelCommandResult<TData>;
}
export interface KernelPipelineStep {
  command: string;
  args?: string[];
  timeoutMs?: number;
  expectedDurationMs?: number;
  skip?: boolean;
  skipReason?: string;
}

export interface KernelModuleRegistry {
  registerCommand(command: KernelCommandDefinition): void;
  registerPipeline(name: string, steps: KernelPipelineStep[]): void;
}

export interface KernelModule {
  name: string;
  version: string;
  register(registry: KernelModuleRegistry): void | Promise<void>;
}

export interface KernelAppConfig {
  name?: string;
  description?: string;
  /** Direct module objects — used when moduleLoaders is absent (legacy/full-registry path). */
  modules?: KernelModule[];
  /** Lazy module loaders — enables manifest-driven single-module loading. Functions are defined in kernel.config.ts so import() resolves from the workspace root. */
  moduleLoaders?: Record<string, () => Promise<KernelModule>>;
  pipelines?: Record<string, KernelPipelineStep[]>;
}
export interface KernelExecutionReport<TData = unknown> {
  siteName?: string;
  commandName: string;
  data?: TData;
  exitCode: number;
  ok: boolean;
  summary?: string;
  metadata: KernelCommandDefinition<TData>;
  logs: KernelLogEvent[];
  logSummary?: {
    error: number;
    warning: number;
    notice: number;
    expectedFallback: number;
    suppressedDebug: number;
  };
  timing: KernelCommandTiming;
  nextSteps?: KernelNextStep[];
  /**
   * RFC-0326: workspace-root-relative POSIX paths of files this command
   * actually wrote, mkdir'd, or removed during this invocation. Empty array
   * when no mutations occurred or when the command is unmigrated (ambient
   * node:fs, IO-01 baseline). Derived from the tracing adapter's WriteIntent[].
   */
  filesModified?: string[];
  /** RFC-0390: true when this report was served from the command-result cache instead of real execution. */
  cached?: boolean;
}

export interface KernelPipelineReport {
  siteName?: string;
  pipelineName: string;
  exitCode: number;
  ok: boolean;
  steps: KernelExecutionReport[];
  timing: KernelPipelineTimingSummary;
  /**
   * RFC-0326: deduplicated union of all step reports' filesModified arrays.
   */
  filesModified?: string[];
}

export type PipelineStepStatus = "pass" | "warn" | "fail" | "skipped" | "timeout";

export interface KernelCommandTiming {
  durationMs: number;
  timeoutMs?: number;
  expectedDurationMs?: number;
  exceededTimeout: boolean;
}

export interface PipelineStepTiming extends KernelCommandTiming {
  pipeline: string;
  command: string;
  app?: string;
  packageName?: string;
  status: PipelineStepStatus;
  startedAtMonotonicMs: number;
  endedAtMonotonicMs: number;
  fromCache?: boolean;
}

export interface KernelPipelineTimingSummary {
  pipeline: string;
  app?: string;
  totalDurationMs: number;
  stepCount: number;
  slowestSteps: PipelineStepTiming[];
  timeoutCount: number;
  warningCount: number;
  failedStep?: string;
}

export interface ExecuteKernelCommandOptions {
  workspaceRoot: string;
  commandName: string;
  siteName?: string;
  allSites?: boolean;
  argv?: string[];
  dryRun?: boolean;
  outputFormat?: KernelOutputFormat;
  /** Set to true when siteName was derived from an explicit --site flag, not cwd inference. */
  siteExplicit?: boolean;
}

export interface ExecuteKernelPipelineOptions {
  workspaceRoot: string;
  pipelineName: string;
  siteName?: string;
  allSites?: boolean;
  dryRun?: boolean;
  outputFormat?: KernelOutputFormat;
  /** RFC-0390: when true, bypass cache reads for a full re-execution. Successful results are still written. */
  force?: boolean;
}

export interface SiteWorkspacesListResult {
  workspaceRoot: string;
  sites: DiscoveredSiteWorkspace[];
}
export function defineKernelConfig(config: KernelAppConfig): KernelAppConfig {
  return config;
}
