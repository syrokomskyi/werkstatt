/*
<MODULE_CONTRACT>
<purpose>Check target schemas, parsing, redaction, and host resolution for the check-warpgogol ecosystem.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial implementation as part of check-core package extraction.</item>
</CHANGE_SUMMARY>
*/

import { z } from "zod";

export const checkTargetAuthRefSchema = z.object({
  kind: z.enum(["header", "basic", "cookie-file"]),
  secretRef: z.string().min(1),
});

export const checkTargetPolicySchema = z.object({
  respectRobots: z.boolean().default(true),
  allowScreenshots: z.boolean().default(true),
  allowAiReview: z.boolean().default(false),
  allowExternalLinks: z.boolean().default(false),
});

export const checkTargetSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  baseUrl: z.string().url(),
  label: z.string().min(1).optional(),
  expectedBrand: z.string().min(1).optional(),
  mode: z.enum(["public", "private-alt", "local"]),
  allowedHosts: z.array(z.string().min(1)).min(1),
  startPaths: z.array(z.string().startsWith("/")).optional(),
  maxPages: z.number().int().positive().max(200).optional(),
  localeHints: z.record(z.string(), z.array(z.string().startsWith("/"))).optional(),
  auth: checkTargetAuthRefSchema.optional(),
  policy: checkTargetPolicySchema.default({
    respectRobots: true,
    allowScreenshots: true,
    allowAiReview: false,
    allowExternalLinks: false,
  }),
});

export type CheckTargetAuthRef = z.infer<typeof checkTargetAuthRefSchema>;
export type CheckTargetPolicy = z.infer<typeof checkTargetPolicySchema>;
export type CheckTarget = z.infer<typeof checkTargetSchema>;

export interface RedactedCheckTarget extends Omit<CheckTarget, "auth"> {
  auth?: Omit<CheckTargetAuthRef, "secretRef"> & { secretRef: "[redacted]" };
}

export function parseCheckTarget(value: unknown): CheckTarget {
  return checkTargetSchema.parse(value);
}

export function redactCheckTarget(target: CheckTarget): RedactedCheckTarget {
  if (!target.auth) {
    const { auth: _auth, ...redacted } = target;
    return redacted;
  }
  return {
    ...target,
    auth: {
      kind: target.auth.kind,
      secretRef: "[redacted]",
    },
  };
}

export function targetBaseHost(target: CheckTarget): string {
  return new URL(target.baseUrl).host;
}
