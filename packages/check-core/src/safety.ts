/*
<MODULE_CONTRACT>
<purpose>Target safety validation for the check-webgogol ecosystem: detects secrets and unsafe patterns in check targets.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial implementation as part of check-core package extraction.</item>
</CHANGE_SUMMARY>
*/

import type { Diagnostic } from "@gogol/site-kernel";
import type { CheckTarget } from "./target.ts";
import { targetBaseHost } from "./target.ts";

const RAW_SECRET_PATTERNS = [/^sk-[A-Za-z0-9_-]{20,}$/, /^eyJ[A-Za-z0-9_-]{20,}\./];

export function validateTargetSafety(target: CheckTarget): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const host = targetBaseHost(target);
  if (!target.allowedHosts.includes(host)) {
    diagnostics.push({
      ruleId: "CW-SAFE-01",
      severity: "error",
      message: `Target baseUrl host "${host}" is not present in allowedHosts.`,
      fixHint: "Add the exact host to allowedHosts or correct baseUrl.",
      data: { host, allowedHosts: target.allowedHosts },
    });
  }
  if (
    target.auth?.secretRef &&
    RAW_SECRET_PATTERNS.some((pattern) => pattern.test(target.auth!.secretRef))
  ) {
    diagnostics.push({
      ruleId: "CW-SAFE-02",
      severity: "error",
      message: "Target auth.secretRef looks like a raw secret instead of an indirection.",
      fixHint: "Store the secret outside the target file and reference it by environment/key name.",
    });
  }
  if (target.policy.allowAiReview && target.mode !== "public") {
    diagnostics.push({
      ruleId: "CW-SAFE-03",
      severity: "error",
      message: "AI review is enabled for a non-public target.",
      fixHint: "Disable allowAiReview or use a public target with redacted evidence.",
    });
  }
  return diagnostics;
}
