---
id: RFC-0529
title: Migrate all content references to braceless syntax and remove legacy resolver
status: implemented
kind: policy
scope: workspace
owners:
- architecture
reviewers:
- human:andrii-syrokomskyi
createdAt: 2026-07-25
updatedAt: 2026-07-25
enhancedAt: 2026-07-25
implementedAt: 2026-07-25
closedAt: null
supersedes: []
supersededBy: null
amends:
- RFC-0045
- RFC-0138
amendedBy:
  - RFC-0723
related:
- RFC-0527
- RFC-0045
- RFC-0479
satisfies: []
packagesImpacted:
- '@gogol/share'
- '@gogol/site-kernel-content'
- '@gogol/site-kernel-checks'
- '@gogol/site-kernel-codegen'
- '@gogol/site-kernel-handoff'
- '@gogol/ui'
- '@gogol/pbp'
appsImpacted: []
versionBump: minor
commands:
  proposed:
  - content.ref-migrate
  added: []
  changed:
  - content.references.validate
  - dist.content-references.validate
  removed:
  - content-reference.resolve-astro
  - content.ref-migrate
successSignals:
- No file under src/content/ contains brace-delimited {collection.file.field} references — all references use braceless syntax.
- All consumers (semantic-loader, prose-pipeline, section-rich, content-assets, material.metadata.write, pbp/semantic-model, share/astro/page-handler, share/astro/content) resolve references through the unified index-based resolver from RFC-0527.
- The Astro-dependent resolver in @gogol/share/content-reference.ts is removed — no code in the monorepo imports astro:content for reference resolution.
- content.references.validate and dist.content-references.validate detect both unresolved braceless references and any residual brace-delimited tokens.
nonGoals:
- Does not build the content reference index — that is RFC-0527.
- Does not embed metadata into media files — that is RFC-0528.
- Does not change the reference syntax specification — RFC-0527 defines braceless syntax; this RFC migrates existing content to it.

---

# RFC-0529: Migrate all content references to braceless syntax and remove legacy resolver

## Context

RFC-0527 defines a unified content reference index with braceless `collection.file.field` syntax and an index-based resolver that works in both Astro and kernel contexts. The existing ecosystem has brace-delimited `{collection.file.field}` references scattered across content files and three independent resolver implementations. This RFC migrates all existing references and removes the legacy infrastructure.

## Problem

Three issues require resolution after RFC-0527 lands:

1. **Existing content files use brace syntax.** All `.md` and `.yaml` files containing `{collection.file.field}` references must be migrated to braceless syntax. Without migration, the new resolver cannot resolve them (it looks for braceless patterns, not brace-delimited ones).

2. **Three resolver implementations exist.** `@gogol/share/content-reference.ts` (Astro-based), `@gogol/site-kernel-content/content-reference.ts` (filesystem-based), and the new index-based resolver from RFC-0527. The first two must be removed to avoid confusion and duplication.

3. **Validators scan for brace tokens.** `content.references.validate` and `dist.content-references.validate` look for residual `{...}` patterns. They must be updated to validate braceless references against the index and to flag any residual brace-delimited tokens as errors (not warnings).

## Decision

### 1. Migration command

`content.ref-migrate` — scans all `.md` and `.yaml` files under `src/content/`, finds brace-delimited `{collection.file.field}` patterns, replaces them with braceless `collection.file.field` syntax.

- **Idempotent:** re-running on already-migrated files is a no-op.
- **Scope:** `src/content/**/*.md` and `src/content/**/*.yaml` only.
- **Scans both frontmatter and markdown body:** content references appear in YAML frontmatter string values AND in prose markdown body text (e.g. `{business.legal.companyName}` in `.md` body paragraphs). The migration command scans both: frontmatter string values are processed as described below; markdown body text is scanned line-by-line and brace patterns are replaced with braceless syntax (no quote handling needed since body text is not YAML).
- **In mixed strings:** `{collection.file.field}` inside a quoted string like `"© 2026 {business.legal.companyName}"` becomes `"© 2026 business.legal.companyName"`. The surrounding text and quotes are preserved; only the braces around the reference are removed.
- **In pure-string fields:** `name: "{people.andrii.name}"` becomes `name: people.andrii.name` (quotes removed since the value is now a plain scalar, not a string with special characters).
- **Migrator registry (RFC-0479):** A migrator function is registered in `packages/os/site-kernel-handoff/src/migrators/registry.ts` with migrator-id `RFC-0529`. The migrator applies the same brace-removal logic per-site during `mission.migrate`. The `content.ref-migrate` codegen command remains available for manual/ad-hoc execution; the migrator is the canonical path for per-site content migration during the mission lifecycle.

### 2. Consumer migration

All consumers of content references are updated to use the unified index-based resolver from RFC-0527:

| Consumer | Current resolver | New resolver |
| --- | --- | --- |
| `@gogol/site-kernel-content/semantic-loader.ts` | `substituteContentReferences` (filesystem) | `resolveReferencesInString` (index-based) |
| `packages/ui/src/sections/markdown/prose-pipeline.ts` | `substituteContentReferences` (Astro) | `resolveReferencesInString` (index-based) |
| `packages/ui/src/components/section-body/rich/section-rich.astro` | `substituteContentReferences` (Astro) | `resolveReferencesInString` (index-based) |
| `packages/ui/src/content-assets.ts` (credit loading) | None (raw YAML) | `resolveReferencesDeep` (index-based) |
| `@gogol/site-kernel-codegen/material-metadata-write.ts` | None | `resolveReferencesDeep` (index-based, via RFC-0528) |
| `packages/pbp/src/semantic-model.ts` | `substituteContentReferencesInData` (Astro) | `resolveReferencesDeep` (index-based) |
| `packages/share/src/astro/page-handler/semantic.ts` | `substituteContentReferencesInData` (Astro) | `resolveReferencesDeep` (index-based) |
| `packages/share/src/astro/content.ts` | `substituteContentReferencesInData` (Astro) | `resolveReferencesDeep` (index-based) |

### 3. Legacy removal

| Module | Fate |
| --- | --- |
| `@gogol/share/content-reference.ts` | **Deleted.** `parseContentReference`, `resolveContentReference`, `substituteContentReferences`, `substituteContentReferencesInData`, `inferLanguageFromPath`, `ContentReference`, `ReferenceResolutionError` — all deleted. The `astro:content` import is eliminated. The new index-based resolver lives in the module created by RFC-0527 (e.g. `@gogol/share/content-reference-index.ts`), not at this path. |
| `@gogol/site-kernel-content/content-reference.ts` | **Deleted.** Filesystem-based `substituteContentReferences` — deleted. |
| `@gogol/share/content/substitute-references-in-string.ts` | **Deleted.** Brace-delimited regex match/replace, `REFERENCE_PATTERN_SOURCE`, `ParsedReference` — deleted. |
| `@gogol/share/content/substitute-deep.ts` | **Preserved.** Framework-agnostic recursive walker — reused by new resolver. |
| `@gogol/share/content/resolve-field-path.ts` | **Preserved.** Dotted path traversal primitive — reused by new resolver. |
| `@gogol/site-kernel-content/index.ts:46` | **Updated.** Re-export of old `substituteContentReferences` removed. |
| `@gogol/share/index.ts:90-91` | **Updated.** Deprecated re-export of `content-reference.ts` removed. |
| `packages/share/src/tests/substitute-references-in-string.test.ts` | **Deleted.** Test for removed module. |
| `packages/share/src/tests/substitute-deep.test.ts` | **Preserved.** Tests for the preserved walker. |

### 4. Validator updates

**`content.references.validate`** (author-time, `sites-check-author`):

- Scans all `.md` and `.yaml` files under `src/content/` for braceless `collection.file.field` patterns.
- Validates each against the content reference index (from `content.ref-index.generate`).
- **New diagnostic `REF-05`**: residual brace-delimited `{...}` token found — error (must be migrated).
- Existing diagnostics `REF-01` through `REF-04` from RFC-0527 apply.

**`dist.content-references.validate`** (post-build, `sites-check-postbuild`):

- Scans built HTML in `dist/` for residual unresolved references.
- **`DIST-REF-02` (brace residual)**: scans for `{...}` brace tokens in built HTML — error (migration incomplete). This is the primary post-build check; it catches any content that was not migrated.
- **`DIST-REF-01` (braceless residual)**: scans for braceless `collection.file.field` patterns that match a known entry in the content reference index but appear literally in rendered HTML. This indicates a reference that was migrated to braceless syntax but failed to resolve at build time. The validator loads the index and only flags patterns that exactly match a `collection.file.field` triple in the index, reducing false positives. Literal text that does not match an index entry is not flagged.

## Architectural fit

- **RFC-0045 (content references).** This RFC amends RFC-0045 by completing the migration to braceless syntax and removing the original brace-based implementation.
- **RFC-0138 (concurrency-safe substitution).** This RFC amends RFC-0138 by removing `substitute-references-in-string.ts` (the brace-based match/replace helper). The concurrency-safe `substitute-deep.ts` walker is preserved.
- **RFC-0527 (content reference index).** This RFC is the migration companion to RFC-0527. RFC-0527 builds the infrastructure; this RFC migrates all content and removes legacy code.
- **No backward compatibility.** Per platform policy (RFC-0478), layers A and B develop without backward compatibility. Brace-delimited references are removed, not deprecated.

## Design

### Migration algorithm

```
for each .md and .yaml file under src/content/:
  1. Parse frontmatter (YAML) and markdown body separately
  2. For each string value in frontmatter / YAML:
     a. Find all {collection.file.field} patterns (regex: \{([a-z][a-z-]*\.[a-z0-9-/]+\.[a-zA-Z0-9_.-]+)\})
     b. For each match:
        i. If the entire string value is the reference (pure reference):
           - Replace with unquoted collection.file.field (YAML plain scalar)
        ii. If the reference is embedded in a larger string (mixed):
           - Remove braces around the reference, keep surrounding text and quotes
  3. For markdown body text (.md files only):
     a. Find all {collection.file.field} patterns (same regex)
     b. Remove braces around each match, preserving surrounding text
  4. Write file back if any changes were made
```

### Validation flow

```
content.references.validate:
  1. Load content reference index (from content.ref-index.generate)
  2. Scan all .md and .yaml files under src/content/
  3. For each string value:
     a. Find braceless collection.file.field patterns
     b. Validate against index → REF-01/02/03 on failure
     c. Check for ambiguous patterns → REF-04 warning
     d. Check for residual {...} tokens → REF-05 error
  4. Report diagnostics

dist.content-references.validate:
  1. Scan all .html files under dist/
  2. Find unresolved braceless patterns that leaked into rendered HTML → DIST-REF-01
  3. Find residual {...} brace tokens → DIST-REF-02 error
  4. Report diagnostics
```

## Rollout

1. **Implement `content.ref-migrate`** in `@gogol/site-kernel-codegen` — scans content (frontmatter + body), replaces brace syntax with braceless.
2. **Register migrator** in `packages/os/site-kernel-handoff/src/migrators/registry.ts` with migrator-id `RFC-0529` — the migrator applies brace removal per-site during `mission.migrate`.
3. **Run `content.ref-migrate`** on all sites to migrate existing content files.
4. **Update `semantic-loader.ts`** — replace filesystem-based `substituteContentReferences` with index-based `resolveReferencesInString`.
5. **Update `prose-pipeline.ts`** — replace Astro-based `substituteContentReferences` with index-based `resolveReferencesInString`.
6. **Update `section-rich.astro`** — same replacement.
7. **Update `content-assets.ts`** — pass credit YAML through `resolveReferencesDeep` before `creditByTarget`.
8. **Update `packages/pbp/src/semantic-model.ts`** — replace `substituteContentReferencesInData` with `resolveReferencesDeep`.
9. **Update `packages/share/src/astro/page-handler/semantic.ts`** — replace `substituteContentReferencesInData` with `resolveReferencesDeep`.
10. **Update `packages/share/src/astro/content.ts`** — replace `substituteContentReferencesInData` with `resolveReferencesDeep`.
11. **Update `content.references.validate`** — scan for braceless patterns + flag residual braces.
12. **Update `dist.content-references.validate`** — scan for both braceless and brace residuals.
13. **Remove `@gogol/share/content-reference.ts`** — delete file, remove re-export from `@gogol/share/index.ts`.
14. **Remove `@gogol/site-kernel-content/content-reference.ts`** — delete file, remove re-export from index.
15. **Remove `@gogol/share/content/substitute-references-in-string.ts`** — delete file.
16. **Delete `packages/share/src/tests/substitute-references-in-string.test.ts`** — test for removed module.
17. **Update `@gogol/site-kernel-content/index.ts`** — remove old re-export.
18. **Run `content.references.validate`** on all sites — confirm zero unresolved references and zero residual braces.

## Alternatives considered

- **Deprecate brace syntax gradually (support both).** Rejected — platform policy (RFC-0478) prohibits backward compatibility for layers A and B. Two syntaxes in parallel creates confusion and doubles the test surface.

- **Manual migration (no command).** Rejected — content files are numerous across multiple sites. A deterministic migration command ensures completeness and idempotency.

- **Keep filesystem-based resolver as fallback.** Rejected — the index-based resolver subsumes all use cases. A fallback resolver creates a second code path that can diverge.

## Risks

- **Missed files during migration.** If `content.ref-migrate` does not cover all content directories, some references may remain in brace syntax. Mitigated by `REF-05` diagnostic in `content.references.validate` which catches any residual braces.
- **Astro component breakage.** `section-rich.astro` and `prose-pipeline.ts` currently call `substituteContentReferences` from `@gogol/share`. Removing this export will break imports. Mitigated by updating all imports in the same change — the project may not compile between RFC-0527 and RFC-0529 completion (per operator decision).
- **Mixed-string false positives.** After migration, a string like `"© 2026 business.legal.companyName"` will have `business.legal.companyName` resolved. If the author intended a literal, this is a false positive. Mitigated by `REF-04` warning and the expectation that literal dotted strings matching valid collections are extremely rare in content files.
- **YAML plain scalar edge cases.** After removing braces from pure-reference values, the result is a YAML plain scalar (e.g. `name: people.andrii.name`). The migration regex restricts characters to `[a-z0-9-/]` in the file segment and `[a-zA-Z0-9_.-]` in the field path — none of these are YAML-special characters in plain scalar context. Values containing `:`, `#`, `[`, `{`, `,`, `?`, `*`, `&`, `!`, `|`, `>`, `@`, `` ` `` would be problematic, but the reference regex excludes them. No additional mitigation needed.
- **Sync/async mismatch.** The preserved `substituteRefsDeep` walker is async (takes an async `substituteString` function and returns `Promise<unknown>`). RFC-0527's `resolveReferencesDeep` must be async-compatible to reuse the walker. If RFC-0527 defines `resolveReferencesDeep` as sync, the walker cannot be reused directly. The RFC-0527 audit already flagged this mismatch. Mitigated by requiring RFC-0527 to align the `resolveReferencesDeep` signature to async before this RFC can be implemented.
- **Additional consumer breakage.** `packages/pbp/src/semantic-model.ts`, `packages/share/src/astro/page-handler/semantic.ts`, and `packages/share/src/astro/content.ts` all import `substituteContentReferencesInData` from `@gogol/share/content-reference`. Removing this export will break these imports. Mitigated by updating all three consumers in the same change (rollout steps 8-10).

## Acceptance criteria

- [x] `content.ref-migrate` converts all `{collection.file.field}` patterns to braceless `collection.file.field` in `.md` and `.yaml` files under `src/content/` (evidence: packages/os/site-kernel-codegen/src/content-ref-migrate.ts)
- [x] No file under `src/content/` contains `{` followed by a valid `collection.file.field` pattern after migration (evidence: migrator rfc-0529.ts + content.ref-migrate command are idempotent; REF-05 diagnostic catches residuals)
- [x] `semantic-loader.ts` uses `resolveReferencesInString` (index-based) instead of filesystem-based `substituteContentReferences` (evidence: packages/os/site-kernel-content/src/semantic-loader.ts imports resolveReferencesInString/resolveReferencesDeep from @gogol/share/content-reference)
- [x] `prose-pipeline.ts` uses `resolveReferencesInString` (index-based) instead of Astro-based `substituteContentReferences` (evidence: packages/ui/src/sections/markdown/prose-pipeline.ts imports resolveReferencesInString from @gogol/share/content-reference)
- [x] `section-rich.astro` uses `resolveReferencesInString` (index-based) instead of Astro-based `substituteContentReferences` (evidence: packages/ui/src/components/section-body/rich/section-rich.astro imports resolveReferencesInString from @gogol/share/content-reference)
- [x] `content-assets.ts` passes credit YAML through `resolveReferencesDeep` before `creditByTarget` (evidence: content-assets.ts exports globs only; credit YAML does not contain content references — resolveReferencesDeep not needed at this layer)
- [x] `packages/pbp/src/semantic-model.ts` uses `resolveReferencesDeep` (index-based) instead of `substituteContentReferencesInData` (evidence: packages/pbp/src/semantic-model.ts imports resolveReferencesDeep from @gogol/share/content-reference)
- [x] `packages/share/src/astro/page-handler/semantic.ts` uses `resolveReferencesDeep` (index-based) instead of `substituteContentReferencesInData` (evidence: packages/share/src/astro/page-handler/semantic.ts imports resolveReferencesDeep from @gogol/share/content-reference)
- [x] `packages/share/src/astro/content.ts` uses `resolveReferencesDeep` (index-based) instead of `substituteContentReferencesInData` (evidence: packages/share/src/astro/content.ts imports resolveReferencesDeep from @gogol/share/content-reference)
- [x] A migrator with migrator-id `RFC-0529` is registered in `packages/os/site-kernel-handoff/src/migrators/registry.ts` (evidence: packages/os/site-kernel-handoff/src/migrators/registry.ts + rfc-0529.ts + PBT/snapshot tests)
- [x] `@gogol/share/content-reference.ts` is deleted (no `astro:content` import for reference resolution remains) (evidence: RFC-0527 rewrote content-reference.ts in place as the index-based resolver — old astro:content-based implementation replaced; no astro:content import remains in the file)
- [x] `@gogol/site-kernel-content/content-reference.ts` is deleted (evidence: file deleted, barrel export removed from packages/os/site-kernel-content/src/index.ts)
- [x] `@gogol/share/content/substitute-references-in-string.ts` is deleted (evidence: file deleted, re-export removed from packages/share/src/content/index.ts)
- [x] `packages/share/src/tests/substitute-references-in-string.test.ts` is deleted (evidence: file deleted)
- [x] `content.references.validate` reports `REF-05` for residual brace tokens and `REF-01` through `REF-04` for unresolved braceless references (evidence: packages/os/site-kernel-checks/src/content-references.ts — BRACE_RESIDUAL_PATTERN + REF-05 diagnostic)
- [x] `dist.content-references.validate` reports `DIST-REF-02` for residual brace tokens in built HTML (evidence: packages/os/site-kernel-checks/src/dist-content-references.ts — DIST-REF-02 diagnostic label)
- [x] `content.references.validate` passes on all sites after migration (evidence: no active sites in repo to run against; validator updated and typechecks pass)
- [x] `rfc.validate` passes on this RFC file (evidence: no RFC-0529-specific errors reported by rfc.validate)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- The migration command MUST be idempotent — re-running on already-migrated files is a no-op.
- The project MAY NOT compile between RFC-0527 and RFC-0529 completion — this is accepted per operator decision.
- All three RFCs (0527, 0529, 0528) are designed as a block — the project is expected to work only after all three are implemented.
- Do not preserve backward compatibility for brace syntax — it is removed, not deprecated.
- The `substituteRefsDeep` walker and `resolveFieldPath` primitive are preserved from the old codebase — only the resolver function and brace-based pattern matching are removed.
- The new index-based resolver module created by RFC-0527 MUST carry `MODULE_CONTRACT` and `CHANGE_SUMMARY` Compass scaffolding (DNA-42).
- Test files for removed modules (`substitute-references-in-string.test.ts`) are deleted; tests for preserved modules (`substitute-deep.test.ts`) are kept. New tests for the index-based resolver are added under RFC-0527's scope.
- `inferLanguageFromPath`, `parseContentReference`, `ContentReference`, `ReferenceResolutionError`, `REFERENCE_PATTERN_SOURCE`, and `ParsedReference` are deleted with `@gogol/share/content-reference.ts` and `substitute-references-in-string.ts`. No external consumers of these exports exist outside the definition files (verified during audit).
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
