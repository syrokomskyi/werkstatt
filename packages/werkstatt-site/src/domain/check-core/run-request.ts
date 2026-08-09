/*
<MODULE_CONTRACT>
<purpose>Check run request and status schemas for the check-warpgogol ecosystem.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial implementation as part of check-core package extraction.</item>
</CHANGE_SUMMARY>
*/

import { z } from "zod";
import { checkTargetSchema } from "./target.ts";

export const checkRunStatusKindSchema = z.enum([
  "queued",
  "running",
  "pass",
  "warn",
  "fail",
  "error",
]);

export const checkRunRequestSchema = z.object({
  schemaVersion: z.literal(1),
  runId: z.string().min(1),
  createdAt: z.string().datetime(),
  target: checkTargetSchema,
  source: z.enum(["ui", "cli", "deploy-alt", "api"]),
  options: z.object({
    maxPages: z.number().int().positive().max(20),
    audienceProfileId: z.string().min(1).optional(),
    generateActionPack: z.boolean(),
    allowAiReview: z.boolean(),
  }),
});

export const checkRunStatusSchema = z.object({
  schemaVersion: z.literal(1),
  runId: z.string().min(1),
  targetId: z.string().min(1),
  status: checkRunStatusKindSchema,
  updatedAt: z.string().datetime(),
  summary: z
    .object({
      error: z.number().int().nonnegative(),
      warning: z.number().int().nonnegative(),
      info: z.number().int().nonnegative(),
    })
    .optional(),
  reportPath: z.string().optional(),
  actionPackPath: z.string().optional(),
  error: z
    .object({
      message: z.string(),
      code: z.string().optional(),
    })
    .optional(),
});

export type CheckRunStatusKind = z.infer<typeof checkRunStatusKindSchema>;
export type CheckRunRequest = z.infer<typeof checkRunRequestSchema>;
export type CheckRunStatus = z.infer<typeof checkRunStatusSchema>;

export function parseCheckRunRequest(value: unknown): CheckRunRequest {
  return checkRunRequestSchema.parse(value);
}

export function parseCheckRunStatus(value: unknown): CheckRunStatus {
  return checkRunStatusSchema.parse(value);
}
