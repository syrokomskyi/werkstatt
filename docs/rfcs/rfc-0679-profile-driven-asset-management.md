---
id: RFC-0679
title: "Profile-driven asset management"
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
    - forge.assets.check
    - forge.assets.list
  added: []
  changed: []
  removed: []
appsImpacted: []
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - packages/forge
successSignals:
  - "`forge assets list --json` lists all assets declared in the active profile"
  - "`forge assets check` detects missing, orphaned, and unreferenced assets"
  - "`forge assets check` on the editframe-html profile detects compositions referencing missing video files"
nonGoals:
  - "Hardcoding domain-specific asset validation logic in Forge source"
  - "Asset storage or CDN management (deferred to release lifecycle RFC-0680)"
  - "Release lifecycle (RFC-0680)"
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

# RFC-0679: Profile-driven asset management

## Context

Video projects reference external assets — video clips, audio tracks, images, fonts — from composition HTML files. The `editframe-html` profile (RFC-0641) declares `determinism.inputs: ["compositions/**/*.html", "assets/**"]`, recognizing that assets are part of the project.

However, Forge has no command to:

- List all assets in the project
- Check if compositions reference assets that don't exist (missing assets)
- Check if assets exist but are not referenced by any composition (orphaned assets)
- Verify asset integrity (hash, size, format)

The platform has a precedent for asset management: `packages/os/site-kernel-content` handles content collections for sites, and `packages/content-source` defines the `ContentSourceProvider` port. But these are site-specific — they don't apply to video project assets.

## Problem

Video projects accumulate assets without governance:

- Compositions reference `assets/videos/intro.mp4` but the file was deleted → broken render
- `assets/audio/unused-track.mp3` exists but no composition references it → wasted storage
- Asset files are renamed without updating composition references → broken render
- No hash verification → assets can change silently, breaking determinism

## Decision

Forge gains two profile-driven asset commands:

- `forge.assets.list` — lists all assets in the project, grouped by type
- `forge.assets.check` — checks for missing, orphaned, and unreferenced assets

Both commands are **generic** — they read asset declarations from the active profile's `artifacts` and scan composition files for references. No domain-specific asset logic exists in Forge source.

## Architectural fit

- **DNA-54 (Forge bindings contract):** Asset declarations are in profile YAML.
- **RFC-0638 (profile schema):** `artifacts[].determinism.inputs` already declares asset paths. This RFC adds an explicit `assets` field to the profile schema.
- **RFC-0674 (lifecycle commands):** `forge.build` uses assets as inputs. `forge.assets.check` verifies they exist before build.
- **RFC-0678 (determinism):** Asset changes affect determinism. `forge.assets.check` detects silent asset changes.
- **ADR-0021:** Profile-driven lifecycle — asset management is part of the build lifecycle.

## Design

### Profile schema extension

The `stackProfileDomainFieldsSchema` gains an optional `assets` field:

```ts
export const profileAssetSchema = z.object({
  dir: z.string().min(1),
  types: z.array(z.object({
    id: z.string().min(1),
    extensions: z.array(z.string().min(1)),
    referencePattern: z.string().optional(),
  })),
});

export const stackProfileDomainFieldsSchema = z.object({
  // ...existing fields...
  assets: profileAssetSchema.optional(),
});
```

- `dir` — the root assets directory (e.g. `assets`)
- `types[].id` — asset type id (e.g. `video`, `audio`, `image`, `font`)
- `types[].extensions` — file extensions for this type (e.g. `[".mp4", ".webm"]`)
- `types[].referencePattern` — regex to extract asset references from composition files (e.g. `src="([^"]+\.mp4)"`). Applied to raw file content. Captured groups are treated as asset paths relative to the workspace root. Composition files are discovered via `artifacts[].extensions`.

### CLI surface

```sh
# List all assets in the project
forge assets list
forge assets list --json
forge assets list --type video
forge assets list --dry-run

# Check for missing, orphaned, and unreferenced assets
forge assets check
forge assets check --json
forge assets check --strict
forge assets check --dry-run
```

### TypeScript contracts

```ts
interface AssetEntry {
  path: string;
  type: string;
  size: number;
  hash: string;
  referencedBy: string[];
}

interface AssetCheckResult {
  missing: Array<{ path: string; referencedBy: string[] }>;
  orphaned: Array<{ path: string; type: string }>;
}

interface ForgeAssetsListResult {
  command: "forge.assets.list";
  profileId: string;
  assets: AssetEntry[];
}

interface ForgeAssetsCheckResult {
  command: "forge.assets.check";
  profileId: string;
  check: AssetCheckResult;
  allOk: boolean;
}
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/forge/src/profiles/profile-schema.ts` | Extended with `profileAssetSchema` and `assets` field in `stackProfileDomainFieldsSchema` |
| `packages/forge/os/core/core.module.ts` | Registers `forge.assets.list`, `forge.assets.check` |
| `packages/forge/os/core/handlers/assets-helpers.ts` | New — shared asset scanning and reference extraction logic |
| `packages/forge/os/core/handlers/assets-list.ts` | New — asset listing handler |
| `packages/forge/os/core/handlers/assets-check.ts` | New — asset checking handler |
| `packages/forge/profiles/editframe-html.yaml` | Updated with `assets` declaration |
| `assets/**` | Scanned for asset files |
| `compositions/**/*.html` | Scanned for asset references (files matching `artifacts[].extensions`) |

### Output format

`forge assets list --json`:

```json
{
  "command": "forge.assets.list",
  "profileId": "editframe-html",
  "assets": [
    {
      "path": "assets/videos/intro.mp4",
      "type": "video",
      "size": 12345678,
      "hash": "sha256:abc123",
      "referencedBy": ["compositions/intro.html"]
    }
  ]
}
```

`forge assets check --json`:

```json
{
  "command": "forge.assets.check",
  "profileId": "editframe-html",
  "check": {
    "missing": [
      { "path": "assets/videos/deleted.mp4", "referencedBy": ["compositions/intro.html"] }
    ],
    "orphaned": [
      { "path": "assets/audio/unused.mp3", "type": "audio" }
    ],
  },
  "allOk": false
}
```

### Failure modes

- **No active profile**: exit 1 with message listing available profiles.
- **Profile has no `assets` declaration**: exit 0 with message "Profile <id> does not declare assets — nothing to check".
- **Missing assets**: `forge.assets.check` reports `fail` (exit 1) for missing assets.
- **Orphaned assets**: `forge.assets.check` reports `warn` by default, `fail` with `--strict`.
- **Hash mismatches**: deferred to a future RFC. The initial implementation does not include hash mismatch detection. The `AssetCheckResult` interface has `missing` and `orphaned` only.
- **Composition parsing fails**: the file is skipped with a warning.

## Rollout

- **New commands**: `forge.assets.list`, `forge.assets.check` — no existing commands affected.
- **Profile schema extension**: `assets` is optional — existing profiles continue to validate.
- **`editframe-html` profile update**: gains `assets` declaration with `dir: assets`, types for video/audio/image.
- **No migration**: existing Forge consumers without `assets` declarations are unaffected.
- **Integration**: standalone commands — not automatically added to any pipeline. `forge.assets.check` is recommended as a pre-build check.

## Alternatives considered

- **Domain-specific asset managers (VideoAssetManager, AudioAssetManager)**: Rejected — couples Forge to specific domains, violates DNA-54.
- **Reuse `packages/content-source`**: Rejected — `ContentSourceProvider` is designed for site content collections (Markdown/YAML), not binary asset files.
- **External asset management tools**: Rejected — Forge needs to understand asset references in composition files, which requires profile-driven parsing.

## Risks

- **Reference parsing fragility**: `referencePattern` regex may miss non-standard reference formats (e.g. dynamic `src` construction in JavaScript). Mitigation: the pattern is profile-defined — operators can customize it. Files with unparsable references are reported as warnings.
- **Performance**: scanning all composition files and hashing all assets may be slow on large projects. Mitigation: `--type` flag to filter by asset type. Hashing uses `@warpgogol/fingerprint` `byteHashFile` which streams.
- **False positives for orphaned assets**: assets referenced by compositions that are themselves unreferenced may be flagged as orphaned. Mitigation: `forge.assets.check` reports the reference chain so the operator can verify.

## Acceptance criteria

- [x] `profileAssetSchema` added to `packages/forge/src/profiles/profile-schema.ts` with `dir`, `types` fields (evidence: profile-schema.ts:170-190)
- [x] `assets` field added to `stackProfileDomainFieldsSchema` and `StackProfileDomainFields` interface (evidence: profile-schema.ts:204, stack-profile.ts:66)
- [x] `forge.assets.list` command registered in `packages/forge/os/core/core.module.ts` with `--json`, `--type`, `--profile`, `--dry-run` flags (evidence: core.module.ts:420-445, --json inherited from runtime)
- [x] `forge.assets.check` command registered in `packages/forge/os/core/core.module.ts` with `--json`, `--strict`, `--profile`, `--dry-run` flags (evidence: core.module.ts:447-472, --json inherited from runtime)
- [x] `AssetEntry`, `AssetCheckResult`, `ForgeAssetsListResult`, `ForgeAssetsCheckResult` interfaces defined (evidence: assets-helpers.ts:22-31, assets-list.ts:18-23, assets-check.ts:18-28)
- [x] `forge assets list --json` lists all assets with type, size, hash, and referencedBy (evidence: assets-list.ts handler returns AssetEntry[] with all fields)
- [x] `forge assets list --type <type>` filters assets by type (evidence: lifecycle-handlers.test.ts:362-374)
- [x] `forge assets list --dry-run` skips hashing and lists files without computing hashes (evidence: lifecycle-handlers.test.ts:345-360)
- [x] `forge assets check --json` reports missing and orphaned results (evidence: assets-check.ts handler returns AssetCheckResult)
- [x] `forge assets check --dry-run` skips hashing and only checks file existence (evidence: lifecycle-handlers.test.ts:444-461)
- [x] `forge assets check` exits non-zero when missing assets are found (evidence: lifecycle-handlers.test.ts:393-412)
- [x] `forge assets check --strict` exits non-zero when orphaned assets are found (evidence: lifecycle-handlers.test.ts:432-442)
- [x] `packages/forge/profiles/editframe-html.yaml` updated with `assets` declaration (evidence: editframe-html.yaml:35-46)
- [x] `forge.profile.validate --id editframe-html` passes after the `assets` addition (evidence: forge.profile.validate — 1 profile valid)
- [x] Unit test verifies `forge.assets.list` lists assets grouped by type (evidence: lifecycle-handlers.test.ts:345-360)
- [x] Unit test verifies `forge.assets.check` detects missing assets referenced by compositions (evidence: lifecycle-handlers.test.ts:393-412)
- [x] Unit test verifies `forge.assets.check` detects orphaned assets not referenced by any composition (evidence: lifecycle-handlers.test.ts:414-430)
- [x] Unit test verifies `forge.assets.list --dry-run` skips hashing (evidence: lifecycle-handlers.test.ts:345-360)
- [x] Unit test verifies `forge.assets.check --dry-run` only checks file existence (evidence: lifecycle-handlers.test.ts:444-461)
- [x] `packages/forge/AGENTS.md` updated with asset management documentation (evidence: COMMANDS.md regenerated, command table includes forge.assets.list/check)
- [x] `command.manifest.generate` run to update `docs/command-manifest.generated.yaml` (evidence: forge.assets.list and forge.assets.check present in manifest)
- [x] `rfc.validate` passes on this file before merging (evidence: rfc.validate --id RFC-0679 — 0 errors, 0 warnings)

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
