/*
<MODULE_CONTRACT>
<purpose>Shared types and the `rule()` factory for the RFC-0203 diagnostic rule-id registry.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0303 Phase 3: extracted from diagnostics/rules.ts as part of the domain split.</item>
</CHANGE_SUMMARY>
*/

import type { DiagnosticSeverity } from "@warpgogol/werkstatt/kernel";

/**
 * RFC-0233: the diagnostic domain a rule belongs to. `visual` rules form the
 * Visual Control System federation; absence means the rule is undomained.
 */
export type RuleDomain = "visual";

/**
 * RFC-0233: severity-class drives the build-gating policy. `deterministic` rules
 * are provable invariants and gate the build (error); `heuristic` and
 * `perceptual` rules default to `warning` and only gate when a site opts in.
 */
export type RuleSeverityClass = "deterministic" | "heuristic" | "perceptual";

export interface RuleDescriptor {
  id: string;
  /** One-line human title for the rule (shown in docs / dashboards). */
  title: string;
  severityDefault: DiagnosticSeverity;
  /** The command that emits this rule. */
  command: string;
  /** RFC-0233: federation domain (e.g. "visual"). */
  domain?: RuleDomain;
  /** RFC-0233: visual-control tier (1 static, 2 rendered-DOM, 3 LLM). */
  tier?: 1 | 2 | 3;
  /** RFC-0233: severity-class governing the gating policy. */
  severityClass?: RuleSeverityClass;
}

export function rule(
  id: string,
  title: string,
  command: string,
  severityDefault: DiagnosticSeverity = "error",
  facets?: Pick<RuleDescriptor, "domain" | "tier" | "severityClass">,
): RuleDescriptor {
  return { id, title, command, severityDefault, ...facets };
}
