/*
<MODULE_CONTRACT>
<purpose>Maintains packages/check-core/src/audience.ts as an authored check-core authored module so agents can evolve it without rediscovering local boundaries.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial implementation as part of check-core package extraction.</item>
</CHANGE_SUMMARY>
*/

import { z } from "zod";

export const audienceProfileSchema = z.object({
  id: z.string().min(1),
  locale: z.string().min(1),
  label: z.string().min(1),
  audience: z.string().min(1),
  goals: z.array(z.string().min(1)).min(1),
  anxieties: z.array(z.string().min(1)).default([]),
  vocabulary: z.array(z.string().min(1)).default([]),
});

export const audienceReviewSchema = z.object({
  schemaVersion: z.literal(1),
  runId: z.string().min(1),
  targetId: z.string().min(1),
  profileId: z.string().min(1),
  generatedAt: z.string().datetime(),
  cached: z.boolean(),
  verdict: z.enum(["pass", "warn", "fail"]),
  summary: z.string(),
  recommendations: z.array(
    z.object({
      url: z.string().url(),
      sectionId: z.string().optional(),
      severity: z.enum(["error", "warning", "info"]),
      message: z.string(),
      changeHint: z.string(),
    }),
  ),
});

export type AudienceProfile = z.infer<typeof audienceProfileSchema>;
export type AudienceReview = z.infer<typeof audienceReviewSchema>;

export function parseAudienceProfile(value: unknown): AudienceProfile {
  return audienceProfileSchema.parse(value);
}

export function parseAudienceReview(value: unknown): AudienceReview {
  return audienceReviewSchema.parse(value);
}
