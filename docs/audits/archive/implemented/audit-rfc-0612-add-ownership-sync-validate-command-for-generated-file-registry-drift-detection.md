---
rfcId: RFC-0612
auditId: AUDIT-RFC-0612-01
date: 2026-07-31
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0612

## Verdict: Needs revision

The RFC's core concept (registry drift detection) is sound and addresses a real gap, but the pipeline placement is factually wrong — `generated.stale.validate` lives in `build.prepare` and `sites-check-author`, not in `build.post`, making the stated integration point impossible. Additionally, the proposed `markerPolicy: "static"` enum value doesn't exist in the current `OwnershipEntry` interface, and the TypeScript contract diverges from the established `CheckResult` + `Diagnostic[]` pattern.

## Mechanical validation (rfc.validate)

Pass — zero violations.

## Axis A — Structural completeness

1. **Pipeline placement is contradictory.** The RFC says "runs in the `build.post` pipeline after `build.prepare`, before `generated.stale.validate`" (line 103, 176). But `generated.stale.validate` is in `SITES_BUILD_PREPARE_PIPELINE` (`build-prepare.ts:128`) and `SITES_CHECK_AUTHOR_PIPELINE` (`sites-check-author.ts:260`), NOT in `SITES_BUILD_POST_PIPELINE` (`build-post.ts`). `build.post` runs after the Astro build and deals with `dist/` artifacts. The acceptance criterion on line 198 is impossible as stated.

2. **`markerPolicy: "static"` doesn't exist.** The current `OwnershipEntry` interface (`generator-ownership.ts:47`) defines `markerPolicy?: "embedded" | "registry-only"`. The RFC proposes `"static"` (lines 172, 179, 188) without updating the interface contract. Either extend the enum explicitly or reuse the existing `STATIC_ASSET_EXEMPT_DIRS` pattern from `generated-stale-validate.ts:42`.

3. **TypeScript contract diverges from established pattern.** `OwnershipSyncResult` (lines 131-139) uses `status: "pass" | "fail"` + `violations[]`. The existing validators (`generated.stale.validate`, `generated.files.validate`) return `KernelCommandResult<CheckResult>` with `Diagnostic[]`. The contract should match the codebase pattern.

4. **nonGoals contradicts file system responsibilities.** Line 63 says "Do not check files outside public/ and src/", but the file system table (line 148) lists `src/pages/**/*.astro`, `src/middleware.ts`, `src/content.config.ts`, `src/env.d.ts` as scanned paths. The nonGoals should say "Do not check authored content files in `src/content/`" instead.

## Axis B — DNA alignment

1. **DNA-58 alignment is indirect.** DNA-58 (`architecture-dna.md:247-249`) is about "Generated-file content determinism" — byte-identical output from generators. `ownership.sync.validate` checks registry completeness, not content determinism. The RFC argues registry drift causes false positives in `generated.stale.validate`, undermining the chain — but this is a second-order effect, not direct enforcement of DNA-58. Consider whether `satisfies: []` with a `related: [DNA-58]` is more honest, or add a new DNA invariant for registry completeness.

## Axis C — Ecosystem fit

1. **Pipeline placement incorrect** (see Axis A-1). The command should be placed in `SITES_BUILD_PREPARE_PIPELINE` before `generated.stale.validate`, not in `SITES_BUILD_POST_PIPELINE`.

2. **Command table registration not mentioned.** New commands must be registered in `src/command-tables/` (the data-driven `CheckCommandEntry[]` tables). The RFC's file system responsibilities table doesn't list this.

3. **No AGENTS.md update identified.** If the command adds a new pipeline step, `packages/os/site-kernel-checks/AGENTS.md` may need a module table entry for `src/ownership-sync-validate.ts`.

## Axis D — Forward-only compliance

No issues. No compatibility shims or dual paths proposed.

## Axis E — Agent-facing policy

No issues. Status gate is correct (draft → accepted → implemented). Implementation notes reference RFC-0224 and RFC-0334 correctly.

## Axis F — Pragmatism

1. **Alternative not considered: extend `generated.files.validate`.** The RFC rejects extending `generated.stale.validate` (line 183) but doesn't consider extending `generated.files.validate` (RFC-0375), which already checks the forward direction (declared files exist). Adding an OWN-02 check to `generated.files.validate` would be a natural extension — the RFC should explain why a new command is preferred over extending either existing validator.

2. **`markerPolicy: "static"` vs. existing exemption pattern.** The existing `STATIC_ASSET_EXEMPT_DIRS` in `generated-stale-validate.ts:42` already handles static asset exemptions. The RFC should justify why a new enum value is better than reusing this pattern.

## Axis G — Blind spots

1. **`conditional` entries not addressed.** `GENERATOR_OWNERSHIP_MAP` has entries with `conditional: true` (e.g., CMS admin files, lines 548-561). These are skipped by `generated.stale.validate` and `generated.files.validate`. The RFC doesn't specify whether conditional entries would trigger OWN-02 (phantom registration) when the condition isn't met.

2. **`{system}` placeholder not addressed.** Some entries use `systems/{system}/public/...` (bordbuch entries, lines 535-545). The RFC lists placeholder expansions (line 153) but omits `{system}`. The `generated.files.validate` expands `{system}` but `generated.stale.validate` does not — the RFC must specify which expansion set it uses.

3. **No performance estimate.** The RFC says "scanning `public/` after `build.prepare` is fast" (line 190) but doesn't estimate file count or I/O patterns. Warpgogol-com's `public/` can contain hundreds of preview images, surface pages, and media variants.

## Questions for the author

1. Which pipeline should `ownership.sync.validate` actually run in — `build.prepare` (before `generated.stale.validate`) or `sites-check-author`? The current placement in `build.post` is impossible because `generated.stale.validate` is not in that pipeline.
2. Should `markerPolicy` be extended with `"static"` or should the existing `STATIC_ASSET_EXEMPT_DIRS` pattern be reused? If extending the enum, the `OwnershipEntry` interface contract must be updated.
3. How should `conditional: true` entries be handled — should they be exempt from OWN-02 when their condition isn't met?
