---
auditId: AUDIT-RFC-0679
date: 2026-08-04
reviewer:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
targetRfc: RFC-0679
verdict: needs-revision
---

# Audit: RFC-0679 — Profile-driven asset management

## Verdict: needs-revision

The RFC has a clear architectural fit (DNA-54, RFC-0638) and introduces two useful commands. However, there are several design gaps that need to be addressed before implementation.

## Findings

### A-1 (Major): `hashMismatches` requires `.asset-hashes.json` but no schema is defined

The RFC (line 250) says: "Hash mismatches require a stored hash file (`.asset-hashes.json`) — if no hash file exists, this check is skipped."

But the RFC does not define:
- The schema of `.asset-hashes.json`
- Who writes it (a separate command? `forge.assets.check --update-hashes`?)
- Where it lives (workspace root? `assets/`? `dist/`?)
- How it relates to the determinism cache from RFC-0678

**Recommendation:** Either define the `.asset-hashes.json` schema and a command to generate it, or remove `hashMismatches` from the initial implementation and defer it to a future RFC. The `AssetCheckResult` interface should make `hashMismatches` optional or remove it.

### A-2 (Major): `referencePattern` is a regex but the RFC doesn't define how composition files are discovered

The RFC says `referencePattern` extracts asset references from composition files, but doesn't specify:
- Which files are scanned for references (all files matching `artifacts[].extensions`? A separate `compositions` glob?)
- How `referencedBy` paths are resolved (relative to workspace root? relative to the composition file?)

**Recommendation:** Define that composition files are discovered via `artifacts[].extensions` (already declared in the profile), and that `referencedBy` paths are relative to the workspace root. The `referencePattern` regex is applied to the raw content of each composition file, and captured groups are treated as asset paths relative to the workspace root.

### A-3 (Minor): `--type` flag for `forge.assets.list` is not in the acceptance criteria

The CLI surface (line 155) shows `forge assets list --type video`, and the risks section mentions it, but it's not in the acceptance criteria.

**Recommendation:** Add acceptance criterion: "`forge assets list --type <type>` filters assets by type".

### A-4 (Minor): `profileAssetSchema` is defined but not added to `stackProfileDomainFieldsSchema`

The RFC (line 139) shows `assets: profileAssetSchema.optional()` in `stackProfileDomainFieldsSchema`, but the acceptance criteria don't mention adding it to the domain fields schema and interface.

**Recommendation:** Add acceptance criterion: "`assets` field added to `stackProfileDomainFieldsSchema` and `StackProfileDomainFields` interface".

### A-5 (Minor): No `--dry-run` flag

The other lifecycle commands (`forge.build`, `forge.validate`, `forge.determinism.check`) all have `--dry-run`. `forge.assets.check` should too — to print what would be checked without hashing files.

**Recommendation:** Add `--dry-run` flag to both commands. For `forge.assets.list`, it skips hashing. For `forge.assets.check`, it skips hashing and only checks file existence.

### A-6 (Minor): `forge.assets.list` and `forge.assets.check` share significant logic

Both commands need to: resolve active profile, scan the assets directory, hash files, scan composition files for references. The RFC should note that they share a common helper module (e.g. `assets-helpers.ts`).

**Recommendation:** Note in the file system responsibilities table that a shared `assets-helpers.ts` module will be created.

## Questions for the author

1. Should `hashMismatches` be deferred to a future RFC, or should the `.asset-hashes.json` schema be defined here?
2. Should composition file scanning use `artifacts[].extensions` or a separate field in `profileAssetSchema`?
