/*
<MODULE_CONTRACT>
  <purpose>RFC-0608: tests for build-identity.json written by release.prepare into dist/client/.well-known/.</purpose>
  <keywords>RFC-0608, build-identity, release.prepare, test</keywords>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0608: add tests verifying build-identity.json structure matches buildIdentitySchema.</item>
</CHANGE_SUMMARY>
*/

import { test, expect } from "vitest";
import { buildIdentitySchema } from "@warpgogol/ontology/operations";

const VALID_BUILD_IDENTITY = {
  releaseId: "test-sys-r000001",
  systemId: "test-sys",
  missionId: "test-sys-m000001",
  semver: "1.0.0",
  distTreeHash: "sha256:abc123",
  behaviorSnapshotHash: "sha256:def456",
  siteContentHash: "sha256:ghi789",
  platformVersion: "1.0.0",
  platformSemanticHash: "sha256:platform-hash",
  commitSha: "abc123def456",
  buildTimestamp: "2026-01-01T00:00:00.000Z",
  targetPlatform: "cloudflare-workers",
};

test("buildIdentitySchema accepts valid build identity with all required fields", () => {
  const result = buildIdentitySchema.safeParse(VALID_BUILD_IDENTITY);
  expect(result.success).toBe(true);
  if (result.success) {
    expect(result.data.releaseId).toBe("test-sys-r000001");
    expect(result.data.targetPlatform).toBe("cloudflare-workers");
    expect(result.data.distTreeHash).toBe("sha256:abc123");
  }
});

test("buildIdentitySchema rejects empty strings for required fields", () => {
  const emptyReleaseId = { ...VALID_BUILD_IDENTITY, releaseId: "" };
  const result = buildIdentitySchema.safeParse(emptyReleaseId);
  expect(result.success).toBe(false);
});

test("buildIdentitySchema accepts any string for targetPlatform", () => {
  for (const platform of ["cloudflare-workers", "netlify", "null", "vercel"]) {
    const identity = { ...VALID_BUILD_IDENTITY, targetPlatform: platform };
    const result = buildIdentitySchema.safeParse(identity);
    expect(result.success).toBe(true);
  }
});
