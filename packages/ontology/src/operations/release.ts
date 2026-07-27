/*
<MODULE_CONTRACT>
<purpose>RFC-0357: Zod schemas for release manifest, behavior snapshot wrapper, and snapshot diff.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0357: initial release and behavior snapshot schemas.</item>
</CHANGE_SUMMARY>
*/

import { z } from "zod";
import { STERNSYSTEM_ID_REGEX, MISSION_ID_REGEX, RELEASE_ID_REGEX } from "./naming-policy.ts";
import { releaseArtifactRefSchema as artifactRefSchema } from "./artifact-store.ts";

export const releaseStateSchema = z.enum(["prepared", "published", "rolled-back"]);

export const releaseManifestSchema = z.object({
  schemaVersion: z.string().min(1),
  releaseId: z.string().regex(RELEASE_ID_REGEX),
  systemId: z.string().regex(STERNSYSTEM_ID_REGEX),
  missionId: z.string().regex(MISSION_ID_REGEX),
  semver: z.string(),
  platformVersion: z.string(),
  createdAt: z.string().datetime(),
  publishedAt: z.string().datetime().nullable(),
  state: releaseStateSchema,
  commitSha: z.string(),
  platformSemanticHash: z.string(),
  siteContentHash: z.string(),
  distTreeHash: z.string(),
  distArtifactHash: z.string().nullable(),
  artifact: artifactRefSchema.nullable(),
  behaviorSnapshotHash: z.string(),
  readableSnapshotHash: z.string(),
  qualityReportHash: z.string().nullable(),
  snapshotDiffVerdict: z.enum(["pass", "fail"]),
  migratorVerdict: z.enum(["pass", "fail"]),
  versionCompareVerdict: z.enum(["in-sync", "catch-up", "refuse-downgrade"]),
});

export const releaseArtifactRefSchema = z.object({
  store: z.literal("werkstatt-local"),
  algorithm: z.literal("sha256"),
  digest: z.string(),
  uri: z.string(),
  manifestHash: z.string(),
});

export const behaviorSnapshotDifferenceSchema = z.object({
  field: z.string(),
  kind: z.enum(["added", "removed", "changed"]),
  detail: z.string(),
});

export const behaviorSnapshotDiffSchema = z.object({
  schemaVersion: z.string().min(1),
  baselineHash: z.string(),
  candidateHash: z.string(),
  verdict: z.enum(["pass", "fail"]),
  differences: z.array(behaviorSnapshotDifferenceSchema),
});

export type ReleaseState = z.infer<typeof releaseStateSchema>;
export type ReleaseManifest = z.infer<typeof releaseManifestSchema>;
export type BehaviorSnapshotDifference = z.infer<typeof behaviorSnapshotDifferenceSchema>;
export type BehaviorSnapshotDiff = z.infer<typeof behaviorSnapshotDiffSchema>;
