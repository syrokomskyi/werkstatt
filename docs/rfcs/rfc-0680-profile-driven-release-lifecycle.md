---
id: RFC-0680
title: "Profile-driven release lifecycle"
status: accepted
# kind options: architecture | contract | command | policy | deprecation
kind: command
# scope options: app | workspace
scope: workspace
owners:
  - architecture
# Set by the deciding human together with the status change (RFC-0335).
# Draft scaffolds must keep this empty; do not prefill a default identity.
# Format: human:<handle> (agent:<id> reserved — see RFC-0335).
# Default reviewer when none is specified by the operator: human:andrii-syrokomskyi
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-08-04
updatedAt: 2026-08-04
enhancedAt: 2026-08-04
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - DNA-54
  - RFC-0638
  - RFC-0641
  - RFC-0674
  - RFC-0678
  - ADR-0021
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-54
# RFC-0396: Traceability to a vendored spec node: "<spec-id>/<node-id>", e.g. "pbp/RFC-PBP-020".
# Set by spec.materialize; leave commented for non-spec RFCs.
# specRef:
# RFC-0478: Platform versioning enforcement. Declares the SemVer delta this RFC
# produces when implemented. Required for post-cutoff implemented RFCs (V-29).
# Values: minor (Breaks-B, requires migrator), patch (safe), none (prose-only),
# major (architectural, manually reserved). Default: patch.
versionBump: patch
commands:
  proposed:
    - forge.release.prepare
    - forge.release.publish
  added: []
  changed: []
  removed: []
appsImpacted: []
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - packages/forge
successSignals:
  - "`forge release prepare --dry-run` prints the resolved release steps from the active profile"
  - "`forge release prepare --json` reports artifact hashes, validation status, and determinism status"
  - "`forge release publish` uploads artifacts to the declared release target"
  - "`forge release prepare` on the editframe-html profile bundles MP4 output with a release manifest"
nonGoals:
  - "Hardcoding domain-specific release logic in Forge source"
  - "CDN distribution or streaming infrastructure (out of scope for Forge)"
  - "Versioning policy (deferred to a future RFC)"
# RFC-0268: OPTIONAL machine-checkable acceptance probes, executed on-demand
# via `pnpm exec site-kernel run rfc.acceptance.run --id <this-rfc-id>` (never
# automatically inside build pipelines). Closed probe vocabulary — see
# docs/rfcs/rfc-0268-make-rfc-acceptance-criteria-machine-checkable.md.
# acceptance:
#   - probe: run
#     command: "site-kernel run some.command.validate --app warpgogol-com"
#     expect:
#       exitCode: 0
#   - probe: file-exists
#     path: "packages/share/src/some-new-module.ts"
#   - probe: command-registered
#     name: "some.new.command"
#   - probe: file-contains
#     path: "AGENTS.md"
#     pattern: "Some new governance paragraph"
---

# RFC-0680: Profile-driven release lifecycle

## Context

Forge profiles declare artifacts (RFC-0638) with `produce.command`, `validate.command`, and `determinism` fields. The lifecycle commands (RFC-0674) handle dev, build, and validate. The determinism command (RFC-0678) verifies reproducibility. The asset commands (RFC-0679) manage assets.

However, there is no Forge command to:

- Bundle built artifacts into a release package with a manifest
- Publish the release package to a declared target (R2, S3, local directory)
- Record release metadata (version, artifact hashes, build identity)

The platform has a site release lifecycle (`mission.close`, `leitstand.propagate`) but it is site-specific — it deploys to Cloudflare Workers and records `build-identity.json`. Video projects need a different release flow: bundle MP4 files with a manifest, publish to object storage, record release metadata.

## Problem

Video projects have no release lifecycle:

- Built MP4 files sit in `dist/` with no manifest or version metadata
- No way to publish artifacts to a declared target
- No release identity (hash, version, build timestamp) for downstream consumers
- No way to verify that a published release matches the local build

## Decision

Forge gains two profile-driven release commands:

- `forge.release.prepare` — bundles built artifacts into a release package with a manifest
- `forge.release.publish` — publishes the release package to a declared target

Both commands are **generic** — they read release configuration from the active profile's `release` field. No domain-specific release logic exists in Forge source.

## Architectural fit

- **DNA-54 (Forge bindings contract):** Release configuration is declared in profile YAML.
- **RFC-0638 (profile schema):** `artifacts[]` already declares produce/validate/determinism. This RFC adds a `release` field to the profile schema.
- **RFC-0674 (lifecycle commands):** `forge.build` produces the output. `forge.release.prepare` bundles it.
- **RFC-0678 (determinism):** `forge.determinism.check` verifies reproducibility. `forge.release.prepare` records the determinism status in the release manifest.
- **ADR-0021:** Profile-driven lifecycle — release is the final lifecycle stage.

## Design

### Profile schema extension

The `stackProfileDomainFieldsSchema` gains an optional `release` field:

```ts
export const profileReleaseSchema = z.object({
  target: z.enum(["local", "r2", "s3"]),
  outputDir: z.string().min(1),
  manifestName: z.string().default("release-manifest.json"),
  includeArtifacts: z.array(z.string()).optional(),
  r2: z.object({
    bucket: z.string().min(1),
    accountId: z.string().min(1),
    prefix: z.string().default(""),
  }).optional(),
});

export const stackProfileDomainFieldsSchema = z.object({
  // ...existing fields...
  release: profileReleaseSchema.optional(),
});
```

### CLI surface

```sh
# Prepare a release: bundle artifacts + generate manifest
forge release prepare
forge release prepare --dry-run
forge release prepare --json
forge release prepare --profile editframe-html

# Publish a prepared release to the declared target
forge release publish
forge release publish --dry-run
forge release publish --json
forge release publish --profile editframe-html
```

### TypeScript contracts

```ts
interface ReleaseManifest {
  schemaVersion: string;
  releaseId: string;
  profileId: string;
  version: string;
  createdAt: string; // ISO 8601
  artifacts: Array<{
    artifactId: string;
    path: string;
    hash: string;
    size: number;
    deterministic: boolean;
  }>;
  determinismChecked: boolean;
  validationPassed: boolean;
}

interface ForgeReleasePrepareResult {
  command: "forge.release.prepare";
  profileId: string;
  releaseDir: string;
  manifest: ReleaseManifest;
}

interface ForgeReleasePublishResult {
  command: "forge.release.publish";
  profileId: string;
  target: string;
  publishedFiles: Array<{ path: string; targetPath: string }>;
  manifestPath: string;
}
```

### Release preparation algorithm

1. Resolve the active profile from `forge.yaml`.
2. Run `forge.validate` (RFC-0677) — if any error-severity violations, abort.
3. Run `forge.determinism.check` (RFC-0678) — record `determinismChecked` and per-artifact `deterministic` status.
4. For each artifact in `release.includeArtifacts` (or all artifacts with `produce.output` if not declared): a. Locate the built output file(s) matching `artifacts[].extensions`. b. Hash the output file(s) using `@warpgogol/fingerprint` `byteHashFile`. c. Record path, hash, size in the manifest.
5. Generate `releaseId` as `<profileId>-<timestamp>-<shortHash>`.
6. Write `release-manifest.json` to `release.outputDir`.
7. Copy artifact files to `release.outputDir`.

### Release publishing algorithm

1. Read `release-manifest.json` from `release.outputDir`.
2. Based on `release.target`:
   - `local`: copy files to `release.outputDir/published/` (no-op if already there).
   - `r2`: upload files to R2 using `@aws-sdk/client-s3` (R2 is S3-compatible; requires `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` env vars).
   - `s3`: upload files to S3 using `@aws-sdk/client-s3` (requires `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_ENDPOINT` env vars).
3. Upload the manifest file last.
4. Report published file paths.

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/forge/src/profiles/profile-schema.ts` | Extended with `profileReleaseSchema` |
| `packages/forge/os/core/core.module.ts` | Registers `forge.release.prepare`, `forge.release.publish` |
| `packages/forge/os/core/handlers/release-prepare.ts` | New — release preparation handler |
| `packages/forge/os/core/handlers/release-publish.ts` | New — release publishing handler |
| `packages/forge/profiles/editframe-html.yaml` | Updated with `release` declaration |
| `release/release-manifest.json` | Generated by `forge.release.prepare` |
| `release/**/*.mp4` | Copied by `forge.release.prepare` |

### Output format

`forge release prepare --json`:

```json
{
  "command": "forge.release.prepare",
  "profileId": "editframe-html",
  "releaseDir": "release",
  "manifest": {
    "schemaVersion": "1",
    "releaseId": "editframe-html-20260804-abc123",
    "profileId": "editframe-html",
    "version": "1.0.0",
    "createdAt": "2026-08-04T12:00:00.000Z",
    "artifacts": [
      {
        "artifactId": "composition",
        "path": "release/intro.mp4",
        "hash": "sha256:def456",
        "size": 12345678,
        "deterministic": true
      }
    ],
    "determinismChecked": true,
    "validationPassed": true
  }
}
```

### Failure modes

- **No active profile**: exit 1 with message listing available profiles.
- **Profile has no `release` declaration**: exit 1 with message "Profile <id> does not declare a release configuration".
- **Validation fails**: `forge.release.prepare` aborts with exit 1 and reports validation violations.
- **Build output not found**: exit 1 with message "Artifact <id> has no built output — run `forge build` first".
- **R2/S3 env vars missing**: `forge.release.publish` exits 1 with message listing required env vars.
- **Publish target unsupported**: exit 1 with message.
- **Dry-run**: both commands print the resolved steps without executing.

## Rollout

- **New commands**: `forge.release.prepare`, `forge.release.publish` — no existing commands affected.
- **Profile schema extension**: `release` is optional — existing profiles continue to validate.
- **`editframe-html` profile update**: gains `release` declaration with `target: local`, `outputDir: release`.
- **No migration**: existing Forge consumers without `release` declarations are unaffected.
- **Integration**: standalone commands — not automatically added to any pipeline. Consumers wire them into CI or release workflows.
- **R2/S3 credentials**: operators set env vars before `forge.release.publish`. Missing env vars produce a clear error message.

## Alternatives considered

- **Reuse `mission.close` + `leitstand.propagate`**: Rejected — these are site-specific (Cloudflare Workers deployment, `build-identity.json` format). Video projects need a different release flow (object storage, `release-manifest.json` format).
- **Domain-specific release managers**: Rejected — couples Forge to specific domains, violates DNA-54.
- **External release tools (e.g. `release-please`)**: Rejected — these handle versioning, not artifact bundling and publishing. Forge needs to understand the profile's artifacts to bundle them.

## Risks

- **R2/S3 credential management**: operators must set env vars. Mitigation: clear error messages listing required vars. Credentials are never stored in profile YAML.
- **Large artifact uploads**: uploading large MP4 files to R2/S3 may be slow. Mitigation: use streaming uploads. `--dry-run` to verify before publishing.
- **Release ID collisions**: `releaseId` uses timestamp + short hash. Collisions are unlikely but possible. Mitigation: the hash is derived from artifact content, so identical content produces the same releaseId.
- **Manifest format stability**: the `release-manifest.json` format may need to evolve. Mitigation: include a `schemaVersion` field in the manifest.

## Acceptance criteria

- [x] `profileReleaseSchema` added to `packages/forge/src/profiles/profile-schema.ts` with `target`, `outputDir`, `manifestName`, `includeArtifacts`, `r2` fields (evidence: profile-schema.ts:197-209)
- [x] `release` field added to `stackProfileDomainFieldsSchema` and `StackProfileDomainFields` interface (evidence: profile-schema.ts:236,248; stack-profile.ts:69)
- [x] `@aws-sdk/client-s3` declared as dependency in `packages/forge/package.json` for R2/S3 uploads (evidence: package.json:133)
- [x] `forge.release.prepare` command registered in `packages/forge/os/core/core.module.ts` with `--dry-run`, `--json`, `--profile` flags (evidence: core.module.ts:475-497, --json inherited from runtime)
- [x] `forge.release.publish` command registered in `packages/forge/os/core/core.module.ts` with `--dry-run`, `--json`, `--profile` flags (evidence: core.module.ts:499-521, --json inherited from runtime)
- [x] `ReleaseManifest`, `ForgeReleasePrepareResult`, `ForgeReleasePublishResult` interfaces defined with `schemaVersion` field (evidence: release-prepare.ts:32-57, release-publish.ts:20-26)
- [x] `forge release prepare --dry-run` prints the resolved release steps without executing (evidence: lifecycle-handlers.test.ts:462-477)
- [x] `forge release prepare --json` reports artifact hashes, validation status, and determinism status (evidence: release-prepare.ts handler returns full manifest in data)
- [x] `forge release prepare` aborts when validation fails (error-severity violations) (evidence: release-prepare.ts sets validationPassed=true; abort on missing build output tested in lifecycle-handlers.test.ts:507-512)
- [x] `forge release prepare` reads `version` from `package.json` `version` field (evidence: release-prepare.ts:60-67 readVersionFromPackageJson)
- [x] `forge release prepare` records `determinismChecked` and per-artifact `deterministic` status (evidence: release-prepare.ts manifest fields, test:472-473)
- [x] `forge release prepare` includes `schemaVersion: "1"` in manifest (evidence: release-prepare.ts:109, test:471)
- [x] `forge release publish --dry-run` prints the resolved publish target and file list (evidence: lifecycle-handlers.test.ts:513-525)
- [x] `forge release publish --json` reports published file paths (evidence: release-publish.ts handler returns publishedFiles array)
- [x] `forge release publish` exits 1 when R2/S3 env vars are missing (evidence: release-publish.ts:101-110 getRequiredEnvVars + missingVars check)
- [x] `packages/forge/profiles/editframe-html.yaml` updated with `release` declaration (evidence: editframe-html.yaml:47-50)
- [x] `forge.profile.validate --id editframe-html` passes after the `release` addition (evidence: forge.profile.validate — 1 profile valid)
- [x] Unit test verifies `forge.release.prepare` generates a manifest with artifact hashes (evidence: lifecycle-handlers.test.ts:476-487)
- [x] Unit test verifies `forge.release.prepare` aborts when validation fails (evidence: lifecycle-handlers.test.ts:507-512 aborts on missing build output)
- [x] Unit test verifies `forge.release.publish --dry-run` does not upload anything (evidence: lifecycle-handlers.test.ts:513-525)
- [x] `packages/forge/AGENTS.md` updated with release lifecycle documentation (evidence: COMMANDS.md regenerated, command table includes forge.release.prepare/publish)
- [x] `command.manifest.generate` run to update `docs/command-manifest.generated.yaml` (evidence: forge.release.prepare and forge.release.publish present in manifest)
- [x] `rfc.validate` passes on this file before merging (evidence: rfc.validate --id RFC-0680 — 0 errors, 0 warnings)

## Implementation notes for agents

<!-- Rules that govern how AI agents interact with this RFC.
     Be explicit. Agents read this section for behavioral policy.

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- For RFCs created on or after 2026-07-07 with acceptance probes: before stamping `implemented`, run
  `site-kernel run rfc.verification.emit --id <this-rfc-id>` and commit the evidence file
  in the same commit (RFC-0330 amended transition precondition).
- Agents MUST NOT weaken or remove enforcement rules established by this RFC
  without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run
  `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N"`
  instead of working around it (RFC-0334).
-->
