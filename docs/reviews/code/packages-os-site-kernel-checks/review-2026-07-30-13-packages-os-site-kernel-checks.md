---
reviewId: REVIEW-CODE-2026-07-30-01
date: 2026-07-30
reviewer:
  skill: fo-review
  model: unknown
verdict: needs-revision
diffRange: a419c58...HEAD
filesReviewed:
  - packages/os/site-kernel-checks/src/generated-stale-validate.ts
  - packages/os/site-kernel-checks/src/generated-files-validate.ts
  - packages/os/site-kernel-checks/src/command-tables/01-codegen.ts
  - packages/os/site-kernel-checks/src/pipelines/build-prepare.ts
  - packages/os/site-kernel-checks/src/pipelines/sites-check-author.ts
  - packages/os/site-kernel-checks/src/tests/generated-stale-validate.test.ts
  - packages/os/site-kernel-checks/AGENTS.md
  - docs/rfcs/rfc-0600-add-generated-stale-validate-command-for-orphaned-git-tracked-generated-files.md
---

# Code Review: a419c58...HEAD (RFC-0600 generated.stale.validate)

### Verdict: Needs revision

The implementation is functionally correct — typecheck passes, 7 unit tests cover all acceptance criteria, and the command is properly registered and wired into three pipelines. Two findings require attention: a potential false-positive path for non-app-scoped workspace-absolute entries and a missing `writes`/`reads` declaration in the command registration.

### Mechanical floor

Pass — `tsc --noEmit` and `vitest run` both pass. `command.manifest.validate` reports no errors for `generated.stale.validate`. `rfc.validate` reports no errors for RFC-0600.

### Axis A — Structural correctness

- **Finding A-1 (Duplicated message string)**: The STALE-01 diagnostic message `File in public/ is not produced by any registered generator and is not a declared static asset.` is duplicated at lines 119 and 134. Extract to a const `STALE_MESSAGE` to avoid drift if the message is ever updated.

### Axis B — DNA alignment

No issues. The implementation aligns with DNA-18 (generator ownership) and the `GENERATOR_OWNERSHIP_MAP` contract. No new DNA invariant is introduced or amended.

### Axis C — Ecosystem fit

- **Finding C-1 (Missing `writes`/`reads` in command registration)**: The `generated.stale.validate` command entry in `01-codegen.ts:596-606` does not declare `reads` or `writes` arrays. While the command is read-only (no `writes` needed), it should declare `reads` to document its filesystem scan scope. Compare with `generated.files.validate` which also omits `reads` — this is consistent with the sibling command but inconsistent with other validators in the same table that do declare `reads`.

### Axis D — Forward-only compliance

No issues. No compatibility shims, no legacy paths, no dual-paths. The command is entirely new.

### Axis E — Agent-facing clarity

No issues. `MODULE_CONTRACT` and `CHANGE_SUMMARY` are present on both new files. The purpose, non-goals, and responsibilities are clearly documented. Variable names are descriptive (`posixFile`, `relToPublic`, `relToSite`, `contentPagePath`).

### Axis F — Pragmatism

No issues. The command earns its existence — it detects a class of orphaned files that `generated.files.validate` cannot (reverse direction). Helper reuse from `generated-files-validate.ts` is appropriate. Scope is limited to `public/` as specified.

### Axis G — Blind spots

- **Finding G-1 (Workspace-absolute entries produce false positives for multi-app workspaces)**: When `app` is undefined and `context.site?.directory` is undefined, the code at line 70 skips non-workspace-absolute entries. But workspace-absolute entries (e.g., `docs/ecosystem.generated.yaml`) are still added to `expectedPaths` at line 93. These paths are outside `public/` and will never match any file in `public/`, so they don't cause false positives directly. However, the `expectedPaths` set contains absolute workspace paths while `posixFile` at line 98 is also absolute — so the comparison at line 102 works correctly. No false positive, but the set contains irrelevant entries that waste memory. Minor — not blocking.

- **Finding G-2 (Preview image lang extraction assumes 3-level path)**: The lang extraction at line 113 uses `parts[2]` which assumes the path structure `public/preview/{lang}/{slug}.png`. If a preview image is placed directly at `public/preview/{slug}.png` (missing lang dir), `parts[2]` would be `{slug}.png` which is not a valid lang. The content page check at line 125 would then look for `src/content/pages/{slug}.png/{slug}.md` which would fail, and the file would be flagged as stale. This is correct behavior (malformed preview path should be flagged), but the lang extraction could be more explicit about validating the lang directory name.

### Spec compliance

| Requirement from RFC-0600 | Status | Evidence |
| --- | --- | --- |
| Command registered in 01-codegen.ts | Done | `01-codegen.ts:596-606` |
| runGeneratedStaleValidate implemented | Done | `generated-stale-validate.ts:45-140` |
| STALE-01 detects orphaned files | Done | Test at `generated-stale-validate.test.ts:56-70` |
| Static assets in public/textures/ exempt | Done | `STATIC_ASSET_EXEMPT_DIRS` at line 41, test at `:72-86` |
| Preview images for existing pages exempt | Done | Content-aware resolver at `:107-128`, test at `:88-104` |
| Preview images for deleted pages flagged | Done | Test at `:106-121` |
| Added to SITES_BUILD_PREPARE_PIPELINE | Done | `build-prepare.ts:123-124` |
| Added to SITES_BUILD_PREPARE_DEV_PIPELINE | Done | `build-prepare.ts:176-177` |
| Added to SITES_CHECK_AUTHOR_PIPELINE | Done | `sites-check-author.ts:259-260` |
| Uses collectFiles from @warpgogol/share/fs | Done | Import at line 30 |
| Uses diagnosticsResult() | Done | Import at line 31, call at line 139 |
| Uses expandGlob and resolveEntryPath | Done | Imports at lines 34-38 |
| Unit test covers all scenarios | Done | 7 tests, all passing |
| rfc.validate passes | Done | No errors for RFC-0600 |

### Questions for the author

1. Should the `reads` array be added to the command registration for `generated.stale.validate` to document its filesystem scan scope, or is the omission consistent with the sibling `generated.files.validate` command?
2. Should the duplicated STALE-01 message string be extracted to a constant, or is the duplication acceptable given the two call sites are in the same function?
