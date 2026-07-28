/*
<MODULE_CONTRACT>
<purpose>
  Environment resolver for observability — extracts OTLP endpoint/token
  and deployment environment from a MetricsPusherEnv or global process.env.
  Extracted from pusher.ts for testability and reuse.
</purpose>
<non-goals>
  <item>Do not import node: modules — must be Workers-compatible.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Architecture review 2026-07-14: extract env resolution from pusher.ts.</item>
</CHANGE_SUMMARY>
*/

import type { WarpgogolEnvironment } from "./conventions.ts";

export interface MetricsPusherEnv {
  endpoint?: string;
  token?: string;
}

interface ProcessEnvLike {
  env?: Record<string, string | undefined>;
}

function getGlobalProcess(): ProcessEnvLike | undefined {
  if (typeof globalThis === "undefined") return undefined;
  const g = globalThis as Record<string, unknown>;
  return typeof g["process"] === "object" && g["process"] !== null
    ? (g["process"] as ProcessEnvLike)
    : undefined;
}

export function resolvePusherEnv(env?: MetricsPusherEnv): { endpoint?: string; token?: string } {
  if (env) return env;
  const proc = getGlobalProcess();
  if (proc?.env) {
    return {
      endpoint: proc.env["WARPGOGOL_OTLP_ENDPOINT"],
      token: proc.env["WARPGOGOL_OTLP_TOKEN"],
    };
  }
  return {};
}

export function detectEnvironment(): WarpgogolEnvironment {
  const proc = getGlobalProcess();
  const raw = proc?.env ? (proc.env["WARPGOGOL_DEPLOYMENT_ENV"] ?? proc.env["NODE_ENV"]) : undefined;
  if (raw === "production") return "production";
  if (raw === "preview") return "preview";
  if (raw === "ci") return "ci";
  return "development";
}
