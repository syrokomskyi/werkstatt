---
reviewId: REVIEW-CODE-2026-08-04-02
date: 2026-08-04
reviewer:
  skill: fo-review
  model: claude-sonnet-4-20250514
verdict: needs-revision
diffRange: fca4728b...HEAD
filesReviewed:
  - packages/forge/src/profiles/profile-schema.ts
  - packages/forge/src/profiles/stack-profile.ts
  - packages/forge/os/core/handlers/release-prepare.ts
  - packages/forge/os/core/handlers/release-publish.ts
  - packages/forge/os/core/core.module.ts
  - packages/forge/os/core/handlers/lifecycle-handlers.test.ts
  - packages/forge/profiles/editframe-html.yaml
  - packages/forge/package.json
  - docs/command-manifest.generated.yaml
  - docs/COMMANDS.md
  - docs/rfcs/rfc-0680-profile-driven-release-lifecycle.md
  - docs/rfcs/rfc-0681-cross-platform-rtk-install-in-forge-bootstrap.md
  - docs/rfcs/rfc-0682-cross-platform-test-fixes-in-packages-forge.md
---

# Code Review: fca4728b...HEAD (RFC-0680/0681/0682 session)

### Verdict: Needs revision

The implementation is well-structured and the mechanical floor passes. Three findings require attention: one structural (unused import), one DNA alignment (raw `writeFile` for generated file), and one blind spot (S3 target incomplete).

### Mechanical floor

Pass — `pnpm --filter @warpgogol/forge run build:check` and `pnpm --filter @warpgogol/forge run test` (610 tests, 49 files) pass.

### Axis A — Structural correctness

- **A-1: Unused import `readdir` in release-publish.ts.** Line 14 imports `readdir` from `node:fs/promises` but it is never used in the handler. Dead code.

- **A-2: Unused parameter `artifactId` in `findBuiltArtifacts`.** The `artifactId` parameter (release-prepare.ts:68) is passed but never referenced in the function body. Either remove it or use it for logging/error messages.

- **A-3: Non-null assertions on env vars.** release-publish.ts:183 uses `accessKeyId!` and `secretAccessKey!` — these are safe because `getRequiredEnvVars` + `missingVars` check guarantees they exist, but the non-null assertion is implicit. Consider using a typed guard or explicit check for clarity.

### Axis B — DNA alignment

- **B-1: Raw `writeFile` used for manifest write (DNA-34 violation).** release-prepare.ts:271 uses `writeFile` from `node:fs/promises` to write `release-manifest.json`. Per `packages/AGENTS.md`: "Always use `writeFileIfChanged` from `@warpgogol/site-kernel` (re-exported from `@warpgogol/forge/utils`, RFC-0345) for generated file writes — both text and binary. Do NOT use raw `writeFile` from `node:fs/promises` for generated files." The manifest is a generated file. Use `writeFileIfChanged` instead.

### Axis C — Ecosystem fit

No issues. `forge.release.prepare` and `forge.release.publish` commands registered in `core.module.ts` with correct flags (`--dry-run`, `--profile`). Command manifest and COMMANDS.md regenerated (679 commands). Package boundaries respected — `os/core/` imports from `@warpgogol/fingerprint` and `@warpgogol/share/fs` which is allowed for non-autonomous modules.

### Axis D — Forward-only compliance

No issues. New `release` field is additive to `stackProfileDomainFieldsSchema`. New commands are registered without modifying existing command surface. `ProfileRelease` interface is new — no existing consumers broken.

### Axis E — Agent-facing clarity

No issues. `MODULE_CONTRACT` and `CHANGE_SUMMARY` scaffolding present in both new handlers. `ReleaseManifest` interface is exported and documented. Error messages are clear and actionable ("run `forge build` first", "Run `forge release prepare` first").

### Axis F — Pragmatism

No issues. The split into prepare/publish is the right granularity — prepare is local-only and side-effect-free in dry-run; publish handles remote I/O. The `includeArtifacts` filter is a clean opt-in mechanism. The `findBuiltArtifacts` extension extraction from `produce.output` is a pragmatic fix.

### Axis G — Blind spots

- **G-1: S3 target is incomplete.** `getRequiredEnvVars` for `s3` returns `["S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"]` but the handler also reads `process.env.S3_ENDPOINT` (line 172) which is not in the required list. If `S3_ENDPOINT` is unset, the S3Client receives `undefined` as endpoint, which may default to AWS standard endpoint — but this is not documented. Either add `S3_ENDPOINT` to required vars or document the default behavior.

- **G-2: No timeout on S3 uploads.** `client.send(new PutObjectCommand(...))` has no timeout. A hanging R2/S3 upload will block indefinitely. Consider setting a timeout on the S3Client or using `AbortController`.

- **G-3: `validationPassed` is hardcoded `true`.** release-prepare.ts:240 sets `validationPassed: true` unconditionally. The RFC acceptance criteria says "abort when validation fails (error-severity violations)". The handler does not run validation before preparing the release — it assumes validation passed. This is a semantic gap: the manifest reports validation passed without actually checking.

### Spec compliance

| Requirement from RFC-0680 | Status | Evidence |
| --- | --- | --- |
| `profileReleaseSchema` with target, outputDir, manifestName, includeArtifacts, r2 | Done | profile-schema.ts:197-209 |
| `release` field in `stackProfileDomainFieldsSchema` | Done | profile-schema.ts:236 |
| `@aws-sdk/client-s3` dependency | Done | package.json:133 |
| `forge.release.prepare` registered with --dry-run, --profile | Done | core.module.ts:475-497 |
| `forge.release.publish` registered with --dry-run, --profile | Done | core.module.ts:499-521 |
| `ReleaseManifest` with `schemaVersion` | Done | release-prepare.ts:27-42 |
| `forge release prepare --dry-run` | Done | release-prepare.ts:243-260 |
| Reads version from package.json | Done | release-prepare.ts:56-64 |
| `forge release publish --dry-run` | Done | release-publish.ts:134-153 |
| Publish exits 1 on missing env vars | Done | release-publish.ts:114-126 |
| editframe-html.yaml updated with release | Done | editframe-html.yaml:47-50 |
| Unit tests for prepare/publish | Done | lifecycle-handlers.test.ts:460-545 |

### Questions for the author

1. Should `validationPassed` in the manifest reflect an actual validation run, or is it intentionally set to `true` because the operator is expected to run `forge.validate` separately before `forge.release.prepare`?
2. Is `S3_ENDPOINT` optional (defaulting to AWS standard endpoint) or should it be required for `s3` target?
3. Should `findBuiltArtifacts` use the `artifactId` parameter for better error messages when no files are found?
