---
rfcId: RFC-0599
auditId: AUDIT-RFC-0599-01
date: 2026-07-30
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0599

## Verdict: Needs revision

The RFC correctly identifies the root cause and proposes a sound fix, but the TypeScript contract references path properties that do not exist on `AstroSitePaths`, and the line references throughout the RFC point to the wrong code block. These are factual errors that would mislead an implementing agent.

## Mechanical validation (rfc.validate)

Pass — zero violations.

## Axis A — Structural completeness

1. **TypeScript contract references non-existent path properties.** The code snippet at RFC lines 135–141 uses `paths.contentProseDirectory` and `paths.contentDataDirectory`. The `AstroSitePaths` interface (`packages/os/site-kernel-astro/src/index.ts:18-28`) does not define these fields. The actual generator code at `open-source-page.ts:949-955` uses `path.join(paths.contentDirectory, "prose", lang, "open-source.md")` and `path.join(paths.contentDirectory, "data", lang, "open-source-registry.json")`. An agent implementing the RFC verbatim would produce code that does not compile.

2. **Incorrect line references.** The Problem section states "lines 751-762" and the Implementation notes state "lines 751-771" for the fingerprint cache short-circuit. The actual fingerprint cache check is at `open-source-page.ts:800-820`. Lines 751-771 contain the `hasSystemPage` guard and i18n config loading, not the fingerprint cache logic. An agent following the line references would look at the wrong code block.

## Axis B — DNA alignment

3. **DNA-18 is a weak fit.** DNA-18 ("Uni registry is the single UI index") concerns the deterministic generation of `uni.registry.yaml` from `manifest.yaml` files. The bug here is about generator output completeness for `open-source.generate`, which is governed by the RFC-0087 idempotency contract (referenced in the RFC body at line 98 but not listed in `satisfies`). The RFC should either find a more fitting DNA invariant or acknowledge that this is a bug fix that doesn't directly satisfy a DNA invariant — which is acceptable for a `command` kind RFC.

## Axis C — Ecosystem fit

4. **Ownership map already declares all output paths.** `packages/os/site-kernel-checks/src/generator-ownership.ts:159-180` already declares all 6 output path patterns for `open-source.generate`. The RFC should note that the `declaredOutputPaths` array in the fix must match these ownership map entries, establishing a single source of truth. Currently the RFC lists `generator-ownership.ts` only as "Reference" without specifying this coupling.

## Axis D — Forward-only compliance

No issues. The fix replaces the incomplete short-circuit with a complete one — no compatibility shim or dual-path.

## Axis E — Agent-facing policy

No issues. The RFC correctly prohibits `--force` bypass and fingerprint cache removal. Implementation notes reference the correct status gate (accepted → implemented).

## Axis F — Pragmatism

5. **`appsImpacted` is under-scoped.** The RFC lists only `warpgogol-com`, but the bug affects every site with `openSource` page enabled in `system.md`. The fix is in the shared `@warpgogol/site-kernel-codegen` package and applies to all sites. Either list all impacted sites or state "all sites with `openSource` enabled" explicitly.

## Axis G — Blind spots

6. **`dryRun` interaction not addressed.** The existing code wraps output writes in `if (!context.dryRun)` (lines 911, 947). The RFC should clarify that the `declaredOutputPaths` existence check runs regardless of `dryRun` — in dry-run mode, the check still inspects disk state from previous real runs, and missing outputs trigger full regeneration (which then skips writes in dry-run). This is the correct behavior but should be explicit.

7. **"Five categories" framing is misleading.** The RFC lists 5 output categories including the fingerprint cache (item 5), but the `declaredOutputPaths` array only checks categories 1–4. The fingerprint cache is not checked because if it's missing, the generator already falls through to full regeneration (line 818-820 catch block). The RFC should clarify that only categories 1–4 are part of the completeness check.

## Questions for the author

1. Should the `declaredOutputPaths` array be derived from `GENERATOR_OWNERSHIP_MAP` in `generator-ownership.ts` rather than hardcoded in `open-source-page.ts`, to ensure the completeness check and ownership map never drift?
2. Is there a DNA invariant that more directly covers generator output idempotency (RFC-0087), or should `satisfies` be left empty since this is a bug fix, not an invariant enforcement?
3. Should `appsImpacted` list all sites with `openSource` enabled, or is `warpgogol-com` sufficient as the trigger site?
