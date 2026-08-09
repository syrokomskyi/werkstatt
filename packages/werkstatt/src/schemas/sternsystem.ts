/*
<MODULE_CONTRACT>
<purpose>
RFC-0354: Zod schemas for the Sternsystem bundle contract — the durable site unit,
fleet registry, and version pin. These schemas are the machine-checkable contract
for all Sternsystem operations.
RFC-0561: fleetRegistryEntrySchema gains optional owner field (did:web VC subject id).
RFC-0574: replace repo/mirror with parameterized mirrors[] array.
RFC-0752: add cloudflareZoneId to fleetRegistryEntrySchema, services[] with subdomains to fleetRegistrySchema.
RFC-0751: extend serviceEntrySchema with deployment fields (kind, url, publicEndpoints, routes, upstreams, lastDeployed, healthCheckPath).
</purpose>
<non-goals>
  <item>Do not perform file IO or git operations — pure shape only.</item>
  <item>Do not define mission or release schemas — those live in subsequent RFCs.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0354: initial Sternsystem schemas (SystemPin, FleetRegistryEntry, FleetRegistry).</item>
  <item>RFC-0479: migratorCursor changed from SemVer string to string[] (migrator-id list).</item>
  <item>RFC-0561: add optional owner field (did:web VC subject id) to fleetRegistryEntrySchema.</item>
  <item>RFC-0574: replace repo/mirror with mirrors[] array (mirrorEntrySchema, mirrorStorageTypeSchema).</item>
  <item>RFC-0752: add cloudflareZoneId to fleetRegistryEntrySchema, serviceSubdomainSchema + serviceEntrySchema + services[] to fleetRegistrySchema.</item>
  <item>RFC-0751: extend serviceEntrySchema with kind, url, publicEndpoints, routes, upstreams, lastDeployed, healthCheckPath.</item>
</CHANGE_SUMMARY>
*/

import { z } from "zod";
import { starNameSchema } from "@warpgogol/werkstatt-site/ontology/cosmic";
import { deploymentConfigSchema } from "./leitstand.ts";

const semverRe = /^\d+\.\d+\.\d+$/;
const sha256Re = /^sha256:[0-9a-f]{64}$/;
const kebabRe = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const didWebRe = /^did:web:[a-z0-9.-]+#.+$/;

export const systemPinSchema = z.object({
  schemaVersion: z.string().min(1),
  systemId: z.string().regex(kebabRe, "systemId must be kebab-case, lowercase, latin-only"),
  cosmicStar: starNameSchema,
  pinnedAt: z.string().datetime(),
  platform: z.object({
    version: z.string().regex(semverRe, "platform.version must be x.y.z"),
    commit: z.string().min(7),
    rfcHead: z.string().regex(/^RFC-\d{4}$/, "rfcHead must be RFC-NNNN"),
    platformSemanticHash: z
      .string()
      .regex(sha256Re, "platformSemanticHash must be sha256: prefixed hex"),
  }),
  migratorCursor: z.array(z.string()),
  capabilities: z.array(
    z.object({
      semanticId: z.string().min(1),
      version: z.string().min(1),
      intent: z.array(z.string()),
    }),
  ),
});

export const mirrorStorageTypeSchema = z.enum(["non-bare", "bare", "bundle"]);

export type MirrorStorageType = z.infer<typeof mirrorStorageTypeSchema>;

export const mirrorEntrySchema = z.object({
  path: z.string().min(1, "mirror path must be non-empty"),
  storageType: mirrorStorageTypeSchema,
});

export type MirrorEntry = z.infer<typeof mirrorEntrySchema>;

export const fleetRegistryEntrySchema = z.object({
  id: z.string().regex(kebabRe, "id must be kebab-case, lowercase, latin-only"),
  cosmicStar: starNameSchema,
  mirrors: z.array(mirrorEntrySchema).min(1, "mirrors must contain at least 1 entry"),
  pinnedPlatform: z.string().regex(semverRe, "pinnedPlatform must be x.y.z"),
  currentMission: z.string().nullable().default(null),
  lastRelease: z.string().nullable().default(null),
  status: z.enum(["registered", "active", "paused", "archived"]),
  registeredAt: z.string().datetime(),
  deployment: deploymentConfigSchema.optional(),
  cloudflareZoneId: z
    .string()
    .min(1, "cloudflareZoneId must be non-empty")
    .optional()
    .describe("Cloudflare zone ID for DNS and Workers route management (RFC-0752)"),
  owner: z
    .string()
    .regex(didWebRe, "owner must be a did:web identifier (did:web:<domain>#<key-version>)")
    .optional()
    .describe("VC subject id of the site owner (RFC-0558, RFC-0561)"),
  notes: z.string().default(""),
});

export const serviceSubdomainSchema = z.object({
  domain: z.string().min(1, "subdomain domain must be non-empty"),
  zone: z.string().min(1, "subdomain zone must be non-empty"),
});

export const serviceEntrySchema = z.object({
  id: z.string().regex(kebabRe, "service id must be kebab-case, lowercase, latin-only"),
  kind: z.enum(["proxy-worker", "scheduled-worker"]),
  workerName: z.string().min(1, "workerName must be non-empty"),
  hostedBy: z.enum(["studio"]),
  url: z.string().min(1, "url must be non-empty"),
  workersDevUrl: z.string().min(1, "workersDevUrl must be non-empty").optional(),
  publicEndpoints: z.boolean().default(false),
  routes: z.array(z.string()).optional(),
  upstreams: z.array(z.string()).optional(),
  subdomains: z.array(serviceSubdomainSchema).default([]),
  lastDeployed: z
    .object({
      at: z.string().datetime().nullable(),
      state: z.enum(["succeeded", "failed"]).nullable(),
      operationId: z.string().nullable(),
    })
    .default({ at: null, state: null, operationId: null }),
  healthCheckPath: z.string().optional(),
});

export const fleetRegistrySchema = z.object({
  schemaVersion: z.string().min(1),
  systems: z.array(fleetRegistryEntrySchema),
  services: z.array(serviceEntrySchema).optional(),
});

export type SystemPin = z.infer<typeof systemPinSchema>;
export type FleetRegistryEntry = z.infer<typeof fleetRegistryEntrySchema>;
export type FleetRegistry = z.infer<typeof fleetRegistrySchema>;
export type ServiceSubdomain = z.infer<typeof serviceSubdomainSchema>;
export type ServiceEntry = z.infer<typeof serviceEntrySchema>;
