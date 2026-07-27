/*
<MODULE_CONTRACT>
<purpose>
RFC-0354: Zod schemas for the Sternsystem bundle contract — the durable site unit,
fleet registry, and version pin. These schemas are the machine-checkable contract
for all Sternsystem operations.
RFC-0561: fleetRegistryEntrySchema gains optional owner field (did:web VC subject id).
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
</CHANGE_SUMMARY>
*/

import { z } from "zod";
import { starNameSchema } from "../cosmic/index.ts";
import { deploymentConfigSchema } from "./leitstand.ts";

const semverRe = /^\d+\.\d+\.\d+$/;
const sha256Re = /^sha256:[0-9a-f]{64}$/;
const kebabRe = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const repoRe = /^(git@|https?:\/\/|\.\/|\.\.\/|\/).+$/;
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

export const fleetRegistryEntrySchema = z.object({
  id: z.string().regex(kebabRe, "id must be kebab-case, lowercase, latin-only"),
  cosmicStar: starNameSchema,
  repo: z.string().regex(repoRe, "repo must be a valid git URL (SSH, HTTPS) or local file path"),
  pinnedPlatform: z.string().regex(semverRe, "pinnedPlatform must be x.y.z"),
  currentMission: z.string().nullable().default(null),
  lastRelease: z.string().nullable().default(null),
  status: z.enum(["registered", "active", "paused", "archived"]),
  registeredAt: z.string().datetime(),
  mirror: z
    .string()
    .regex(repoRe, "mirror must be a valid git URL (SSH, HTTPS) or local file path")
    .optional(),
  deployment: deploymentConfigSchema.optional(),
  owner: z
    .string()
    .regex(didWebRe, "owner must be a did:web identifier (did:web:<domain>#<key-version>)")
    .optional()
    .describe("VC subject id of the site owner (RFC-0558, RFC-0561)"),
  notes: z.string().default(""),
});

export const fleetRegistrySchema = z.object({
  schemaVersion: z.string().min(1),
  systems: z.array(fleetRegistryEntrySchema),
});

export type SystemPin = z.infer<typeof systemPinSchema>;
export type FleetRegistryEntry = z.infer<typeof fleetRegistryEntrySchema>;
export type FleetRegistry = z.infer<typeof fleetRegistrySchema>;
