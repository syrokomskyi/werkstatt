/*
<MODULE_CONTRACT>
<purpose>RFC-0358/RFC-0379: Zod schemas for deployment config, secret references, channel model, and propagation results.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0358: initial leitstand schemas.</item>
  <item>RFC-0379: remove cloudflare-pages/vercel from adapter enum, add null; replace flat target/credentials/lastPropagation with channel model (channels + per-channel lastPropagated with operational state).</item>
  <item>RFC-0595: add RouteFact with contentHash: string | null and optional redirectTarget.</item>
</CHANGE_SUMMARY>
*/

import { z } from "zod";

export const deploymentAdapterNameSchema = z.enum(["cloudflare-workers", "netlify", "null"]);

export const secretRefSchema = z
  .string()
  .regex(/^(env|github-secret|cloudflare-secret):[A-Z0-9_]+$/);

export const deploymentChannelSchema = z.object({
  workerName: z.string(),
  url: z.string().url(),
  secretsFile: secretRefSchema.optional(),
});

export const lastPropagatedChannelSchema = z.object({
  releaseId: z.string(),
  at: z.string().datetime(),
  healthy: z.boolean(),
  state: z.enum(["succeeded", "failed", "failed-stale", "in-progress"]),
  operationId: z.string(),
  leaseExpiresAt: z.string().datetime().nullable(),
});

export const deploymentConfigSchema = z.object({
  adapter: deploymentAdapterNameSchema,
  channels: z.object({
    alt: deploymentChannelSchema.optional(),
    main: deploymentChannelSchema,
  }),
  lastPropagated: z
    .object({
      alt: lastPropagatedChannelSchema.optional(),
      main: lastPropagatedChannelSchema.optional(),
    })
    .default({}),
});

export const healthCheckSchema = z.object({
  name: z.string(),
  url: z.string(),
  status: z.number().int(),
  passed: z.boolean(),
  detail: z.string(),
  expectedHash: z.string().optional(),
  actualHash: z.string().optional(),
});

export const propagationResultSchema = z.object({
  systemId: z.string(),
  releaseId: z.string(),
  state: z.enum(["succeeded", "failed", "failed-stale", "in-progress"]),
  deploymentUrl: z.string(),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable(),
  healthChecks: z.array(healthCheckSchema),
});

export const routeFactSchema = z.object({
  path: z.string(),
  contentHash: z.string().nullable(),
  redirectTarget: z.string().optional(),
});

export type DeploymentAdapterName = z.infer<typeof deploymentAdapterNameSchema>;
export type SecretRef = z.infer<typeof secretRefSchema>;
export type DeploymentChannel = z.infer<typeof deploymentChannelSchema>;
export type LastPropagatedChannel = z.infer<typeof lastPropagatedChannelSchema>;
export type DeploymentConfig = z.infer<typeof deploymentConfigSchema>;
export type HealthCheck = z.infer<typeof healthCheckSchema>;
export type PropagationResult = z.infer<typeof propagationResultSchema>;
export type RouteFact = z.infer<typeof routeFactSchema>;
