/*
<MODULE_CONTRACT>
<purpose>RFC-0684: Zod schemas, loaders, merger, and post-filter for the Axiom finding suppression layer. Defines the shape for suppression rules, loads workshop-level and per-site configs, merges them, and applies suppressions to findings.</purpose>
<non-goals>
  <item>Does not execute Axiom checks — that belongs in mission.check and the external Axiom package.</item>
  <item>Does not validate suppression config — that belongs in suppressions-validate.ts.</item>
  <item>Does not modify evidence files — applySuppressions returns a new array; the caller decides whether to write it back.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0684: initial implementation of suppression config schema, loaders, merger, and applySuppressions post-filter.</item>
</CHANGE_SUMMARY>
*/

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { parse as parseYaml } from "yaml";
import type { Finding } from "@syrokomskyi/axiom-study";

export const suppressionRuleSchema = z.object({
  ruleId: z.string().min(1),
  category: z.string().min(1),
  channel: z.enum(["dev", "alt", "main"]).optional(),
  channelNot: z.enum(["dev", "alt", "main"]).optional(),
  contentType: z.array(z.string()).optional(),
  urlPattern: z.string().optional(),
  messagePattern: z.string().optional(),
  descriptionPattern: z.string().optional(),
  reason: z.string().min(1),
});

export const suppressionsConfigSchema = z.object({
  suppressions: z.array(suppressionRuleSchema),
});

export type SuppressionRule = z.infer<typeof suppressionRuleSchema>;
export type SuppressionsConfig = z.infer<typeof suppressionsConfigSchema>;

export interface SuppressedBy {
  ruleIndex: number;
  ruleId: string;
  category: string;
  reason: string;
}

export type SuppressedFinding = Finding & {
  suppressed?: boolean;
  suppressedBy?: SuppressedBy;
};

export const WORKSHOP_SUPPRESSIONS_PATH = "systems/axiom-suppressions.yaml";
export const WORKPIECE_SUPPRESSIONS_PATH = "axiom-suppressions.yaml";

export function parseSuppressionsConfig(content: string): SuppressionsConfig {
  const raw = parseYaml(content) as unknown;
  return suppressionsConfigSchema.parse(raw);
}

export function loadWorkshopSuppressions(workspaceRoot: string): SuppressionsConfig | undefined {
  const absPath = join(workspaceRoot, WORKSHOP_SUPPRESSIONS_PATH);
  if (!existsSync(absPath)) return undefined;
  const content = readFileSync(absPath, "utf-8");
  return parseSuppressionsConfig(content);
}

export function loadWorkpieceSuppressions(missionDir: string): SuppressionsConfig | undefined {
  const absPath = join(missionDir, "workpiece", WORKPIECE_SUPPRESSIONS_PATH);
  if (!existsSync(absPath)) return undefined;
  const content = readFileSync(absPath, "utf-8");
  return parseSuppressionsConfig(content);
}

export function mergeSuppressions(
  workshop: SuppressionsConfig | undefined,
  workpiece: SuppressionsConfig | undefined,
): SuppressionRule[] {
  const workshopRules = workshop?.suppressions ?? [];
  const workpieceRules = workpiece?.suppressions ?? [];
  // Per-site rules can only ADD new suppressions — they cannot remove workshop-level rules.
  // Concatenation is sufficient: workshop rules fire first, workpiece rules fire for
  // findings not already suppressed by workshop rules (first-match-wins in applySuppressions).
  return [...workshopRules, ...workpieceRules];
}

function matchesCondition(
  finding: Finding,
  rule: SuppressionRule,
  context: { channel: string },
): boolean {
  // ruleId must match
  if (finding.ruleId !== rule.ruleId) return false;

  // channel: suppress if context.channel === channel
  if (rule.channel !== undefined && context.channel !== rule.channel) return false;

  // channelNot: suppress if context.channel !== channelNot
  if (rule.channelNot !== undefined && context.channel === rule.channelNot) return false;

  // contentType: suppress if the finding's URL ends with one of the listed extensions
  if (rule.contentType !== undefined && rule.contentType.length > 0) {
    const url = finding.affectedSubjectId;
    const matched = rule.contentType.some((ext) => url.endsWith(ext));
    if (!matched) return false;
  }

  // urlPattern: suppress if the finding's URL matches the regex
  if (rule.urlPattern !== undefined) {
    try {
      const regex = new RegExp(rule.urlPattern);
      if (!regex.test(finding.affectedSubjectId)) return false;
    } catch {
      return false;
    }
  }

  // messagePattern: suppress if the finding's message contains the pattern (substring match)
  if (rule.messagePattern !== undefined) {
    const message = extractMessage(finding);
    if (message === undefined || !message.includes(rule.messagePattern)) return false;
  }

  // descriptionPattern: suppress if the finding's description contains the pattern (substring match)
  if (rule.descriptionPattern !== undefined) {
    const description = extractDescription(finding);
    if (description === undefined || !description.includes(rule.descriptionPattern)) return false;
  }

  return true;
}

function extractMessage(finding: Finding): string | undefined {
  const ext = finding.extension as Record<string, unknown> | undefined;
  if (ext && typeof ext.message === "string") return ext.message;
  return undefined;
}

function extractDescription(finding: Finding): string | undefined {
  const ext = finding.extension as Record<string, unknown> | undefined;
  if (ext && typeof ext.description === "string") return ext.description;
  return undefined;
}

export function applySuppressions(
  findings: Finding[],
  rules: SuppressionRule[],
  context: { channel: string },
): SuppressedFinding[] {
  return findings.map((finding) => {
    // If already suppressed, keep as-is
    if ((finding as SuppressedFinding).suppressed) return finding;

    for (let i = 0; i < rules.length; i++) {
      const rule = rules[i];
      if (matchesCondition(finding, rule, context)) {
        return {
          ...finding,
          suppressed: true,
          suppressedBy: {
            ruleIndex: i,
            ruleId: rule.ruleId,
            category: rule.category,
            reason: rule.reason,
          },
        } as SuppressedFinding;
      }
    }

    return finding;
  });
}

export function countSuppressedByCategory(findings: SuppressedFinding[]): {
  totalSuppressed: number;
  byCategory: Record<string, number>;
} {
  let totalSuppressed = 0;
  const byCategory: Record<string, number> = {};

  for (const f of findings) {
    if (f.suppressed && f.suppressedBy) {
      totalSuppressed++;
      byCategory[f.suppressedBy.category] = (byCategory[f.suppressedBy.category] ?? 0) + 1;
    }
  }

  return { totalSuppressed, byCategory };
}
