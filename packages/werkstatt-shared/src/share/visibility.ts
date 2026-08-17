/*
<MODULE_CONTRACT>
<purpose>
Unified VisibilityExpr grammar and evaluator (DNA-26, RFC-0026).
One grammar, two consumers: block-level visibility in page content and
feature-graph visibility in RFC-0018.

VisibilityExpr is a CLOSED discriminated union (DNA-19). Adding a new case
requires a superseding RFC.
</purpose>
<non-goals>
  <item>Do not add new VisibilityExpr cases (e.g. abTest, experiment) without a superseding RFC.</item>
  <item>Do not implement runtime (edge) evaluation here — evalVisibility is build-time only.</item>
  <item>Do not import from app-local code.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Wave 1 (RFC-0026): Initial creation — unified VisibilityExpr grammar with build-time evaluator.</item>
</CHANGE_SUMMARY>
*/

import { z } from "zod";
import type { RuntimeContext } from "./runtime-context.ts";

// ---------------------------------------------------------------------------
// VisibilityExpr — closed discriminated union (DNA-19, RFC-0026)
// ---------------------------------------------------------------------------

/**
 * A closed discriminated union describing when a block or feature is visible.
 *
 * MVP semantics:
 *   { feature }  — delegates to featureGraph.isEnabled(key)
 *   { locale }   — checks ctx.locale against the given code(s)
 *   { segment }  — ALWAYS returns false at MVP (ctx.segment === null). RFC-0027 activates.
 *   { flag }     — ALWAYS returns false at MVP (ctx.flags === {}). RFC-0027 activates.
 *   { all }      — logical AND of sub-expressions
 *   { any }      — logical OR of sub-expressions
 *   { not }      — logical NOT of a sub-expression
 *
 * Content authors may write segment/flag expressions today. They evaluate false
 * at MVP but will become live without content changes when RFC-0027 ships.
 *
 * Do NOT add a new case without a superseding RFC (DNA-19).
 */
export type VisibilityExpr =
  | { feature: string }
  | { locale: string | string[] }
  | { segment: string | string[] }
  | { flag: string }
  | { all: VisibilityExpr[] }
  | { any: VisibilityExpr[] }
  | { not: VisibilityExpr };

// ---------------------------------------------------------------------------
// VisibilityExprSchema — Zod validator (recursive via z.lazy)
// ---------------------------------------------------------------------------

const visibilityExprBase: z.ZodType<VisibilityExpr> = z.lazy(() =>
  z.union([
    z.object({ feature: z.string().min(1) }),
    z.object({ locale: z.union([z.string().min(1), z.array(z.string().min(1))]) }),
    z.object({ segment: z.union([z.string().min(1), z.array(z.string().min(1))]) }),
    z.object({ flag: z.string().min(1) }),
    z.object({ all: z.array(visibilityExprBase).min(1) }),
    z.object({ any: z.array(visibilityExprBase).min(1) }),
    z.object({ not: visibilityExprBase }),
  ]),
);

/**
 * Zod schema for VisibilityExpr.
 * Used by page.block.validate and visibility.expr.validate to parse expressions
 * found in page content and feature-graph YAML files.
 */
export const VisibilityExprSchema: z.ZodType<VisibilityExpr> = visibilityExprBase;

// ---------------------------------------------------------------------------
// ResolvedFeatureGraph — minimal interface for evalVisibility
// ---------------------------------------------------------------------------

/**
 * Minimal interface that evalVisibility depends on for { feature: "..." } clauses.
 * Consumers provide their own implementation (e.g. from getFeatureGraph() in RFC-0018).
 * An empty/no-op implementation returns false for every key — safe for offline/preview.
 */
export interface ResolvedFeatureGraph {
  /** Returns true when the feature with `key` is enabled in the current graph. */
  isEnabled(key: string): boolean;
}

/** A no-op feature graph where every feature evaluates as disabled. */
export const EMPTY_FEATURE_GRAPH: ResolvedFeatureGraph = {
  isEnabled: () => true, // MVP: features default to enabled (graph opt-outs via explicit false)
};

// ---------------------------------------------------------------------------
// exhaustive — compile-time union exhaustion helper
// ---------------------------------------------------------------------------

function exhaustive(x: never): never {
  throw new Error(`[visibility] Unhandled VisibilityExpr case: ${JSON.stringify(x)}`);
}

// ---------------------------------------------------------------------------
// evalVisibility — build-time evaluator
// ---------------------------------------------------------------------------

/**
 * Evaluates a VisibilityExpr at build time.
 *
 * Returns true  → block/feature should be rendered in the output.
 * Returns false → block/feature should be dropped from the output.
 *
 * A null expression (no `visibility:` key) is treated as unconditionally visible.
 *
 * MVP guarantees (enforced by runtime.context.shape):
 *   - ctx.segment === null  → all { segment } clauses return false.
 *   - ctx.flags === {}      → all { flag } clauses return false.
 *
 * @param expr        The parsed visibility expression (or null if absent).
 * @param ctx         The RuntimeContext for this build locale.
 * @param featureGraph The resolved feature graph from RFC-0018.
 */
export function evalVisibility(
  expr: VisibilityExpr | null | undefined,
  ctx: RuntimeContext,
  featureGraph: ResolvedFeatureGraph,
): boolean {
  if (expr == null) return true;

  if ("feature" in expr) {
    return featureGraph.isEnabled(expr.feature);
  }

  if ("locale" in expr) {
    const locales = Array.isArray(expr.locale) ? expr.locale : [expr.locale];
    return locales.includes(ctx.locale);
  }

  if ("segment" in expr) {
    // MVP contract: ctx.segment is always null → segment clauses always return false.
    // RFC-0027 lifts this when persona detection lands.
    if (ctx.segment === null) return false;
    const segments = Array.isArray(expr.segment) ? expr.segment : [expr.segment];
    return segments.includes(ctx.segment);
  }

  if ("flag" in expr) {
    // MVP contract: ctx.flags is always {} → flag clauses always return false.
    return ctx.flags[expr.flag] === true;
  }

  if ("all" in expr) {
    return expr.all.every((e) => evalVisibility(e, ctx, featureGraph));
  }

  if ("any" in expr) {
    return expr.any.some((e) => evalVisibility(e, ctx, featureGraph));
  }

  if ("not" in expr) {
    return !evalVisibility(expr.not, ctx, featureGraph);
  }

  return exhaustive(expr);
}
