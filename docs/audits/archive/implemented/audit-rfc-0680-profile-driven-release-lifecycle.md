---
auditId: AUDIT-RFC-0680
date: 2026-08-04
reviewer:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
targetRfc: RFC-0680
verdict: needs-revision
---

# Audit: RFC-0680 — Profile-driven release lifecycle

## Verdict: needs-revision

The RFC fills a clear gap (no release lifecycle for non-site projects) and fits the profile-driven architecture. However, several design issues need resolution before implementation.

## Findings

### A-1 (Major): R2/S3 client attribution is wrong

The RFC (line 211) says "upload files to R2 using `@warpgogol/fingerprint` R2 client". `@warpgogol/fingerprint` is a hashing package — it has no R2 client. The R2 upload logic needs to either:

- Use the Cloudflare R2 REST API directly via `fetch`
- Use `@aws-sdk/client-s3` (R2 is S3-compatible)
- Use the existing R2 upload code from `packages/os/site-kernel-integrity` if it exists

**Recommendation:** Use `@aws-sdk/client-s3` for both R2 and S3 targets (R2 is S3-compatible). Declare the dependency in `packages/forge/package.json`. For `local` target, use plain `fs.copyFile`. Remove the incorrect `@warpgogol/fingerprint` R2 client reference.

### A-2 (Major): `version` field in manifest is unsourced

The `ReleaseManifest` interface has a `version: string` field, but the profile schema has no `version` field. Where does the version come from? Options:

- From `package.json` `version` field
- From a new `release.version` profile field
- From a `--version` CLI flag

**Recommendation:** Read from `package.json` `version` field in the workspace root. This is consistent with how the platform version is resolved elsewhere. Add a note in the RFC.

### A-3 (Major): `s3` target requires SDK dependency but none is declared

The `target: z.enum(["local", "r2", "s3"])` includes S3, but no S3 SDK is listed in `packagesImpacted` or dependencies. If we use `@aws-sdk/client-s3` (A-1), this covers both R2 and S3.

**Recommendation:** Declare `@aws-sdk/client-s3` as a dependency. Both R2 and S3 use the same SDK with different endpoint configuration.

### A-4 (Minor): `schemaVersion` mentioned in risks but not in interface

The risks section (line 287) says "include a `schemaVersion` field in the manifest" but the `ReleaseManifest` interface doesn't have it.

**Recommendation:** Add `schemaVersion: string` to `ReleaseManifest` interface, defaulting to `"1"`.

### A-5 (Minor): `forge.validate.artifacts` reference is wrong

The RFC (line 199) says "Run `forge.validate.artifacts` (RFC-0677)". The actual command name is `forge.validate`, not `forge.validate.artifacts`.

**Recommendation:** Fix to `forge.validate` (RFC-0677).

### A-6 (Minor): `includeArtifacts` semantics unclear

`includeArtifacts` is `z.array(z.string()).optional()`. The algorithm says "or all artifacts if not declared". What are "all artifacts"? All artifacts with `produce` commands? All artifacts with `determinism`?

**Recommendation:** Clarify: "When `includeArtifacts` is omitted, all artifacts with `produce.output` declared are included. When present, only artifacts whose `id` matches an entry in `includeArtifacts` are included."

### A-7 (Minor): No `--profile` flag mentioned in CLI surface but listed in acceptance criteria

The CLI surface section doesn't show `--profile` for either command, but the acceptance criteria list it.

**Recommendation:** Add `--profile` to the CLI surface examples.

## Questions for the author

1. Should S3 support be deferred to a future RFC (only `local` and `r2` in initial implementation)?
2. Should `version` come from `package.json` or from a profile field?
