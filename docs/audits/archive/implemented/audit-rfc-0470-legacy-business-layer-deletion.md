---
rfcId: RFC-0470
auditId: AUDIT-RFC-0470-01
date: 2026-07-20
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0470

## Verdict: Needs revision

The RFC correctly identifies the goal (delete `@gogol/business` and legacy content after PBP cutover) but its core precondition claim — "no site, package, or OS command imports from them" — is factually false. 13 real code imports from `@gogol/business` exist outside `packages/business/`, spanning `@gogol/pbp`, `@gogol/site-kernel-checks` (7 files), codegen/onboarding templates, and `systems/warpgogol-com` page routes. The deletion manifest does not account for these dependencies and would break the build.

## Mechanical validation (rfc.validate)

Pass for RFC-0470 specifically. The 5 `rfc.validate` errors target RFC-0466/0467/0468 (unchecked acceptance criteria, empty reviewers) — not RFC-0470.

## Axis A — Structural completeness

- **Decision** is clear and actionable: delete package, content, dependencies; update docs.
- **Deletion preconditions** (§1) list 8 checkbox items — good, but see Axis G for the blind spot.
- **Deletion manifest** (§2) is concrete with file listings.
- **Post-deletion verification** (§4) lists 10 grep+build+test commands — thorough.
- **Failure modes** specifies build/test/install failure scenarios with fixes.
- **Rollout** describes execution sequence and irreversibility.
- **Alternatives considered** has 4 real alternatives with rejection reasons.
- **Risks** identifies 5 risks with mitigations.
- **Acceptance criteria** has 14 checkable items.
- **Implementation notes** has 12 explicit behavioral rules for agents.
- **Missing:** No "File system responsibilities" entry for `packages/os/site-kernel-checks/` files that need modification (not deletion). The table only lists deletions and doc updates, not code refactoring.

## Axis B — DNA alignment

- **DNA-1 (Monorepo boundary):** RFC claims "Deletion removes a package and content directory. No boundary violation." This is correct for the deletion itself, but the RFC does not address that `@gogol/site-kernel-checks` imports `recordClaimsSchema` from `@gogol/business/schemas` — moving this schema is a package boundary concern.
- **DNA-20 (Business layer):** The RFC formally supersedes DNA-20. However, `satisfies: [DNA-1, DNA-20]` is questionable — this RFC _deletes_ the DNA-20 invariant, it doesn't _satisfy_ it. The RFC should use `supersedes` semantics, not `satisfies`. The `related` list includes DNA-20, which is correct, but `satisfies` implies the RFC upholds the invariant, not destroys it.
- **DNA-55 (Spec vendoring):** Listed in `related` but not in `satisfies` — correct.

## Axis C — Ecosystem fit

- **Critical finding: 13 unaddressed imports.** The RFC states "no site, package, or OS command imports from them" (line 108) and lists `@gogol/business` removal as a precondition (line 128: `grep -r "@gogol/business" systems/ packages/ services/ --include="*.ts" --include="*.astro"` returns 0 results). But this grep will **fail today** because:
  - `packages/pbp/src/semantic-profile.ts` — 2 imports (`buildPageSemanticModel` re-export)
  - `packages/os/site-kernel-checks/src/` — 7 files importing `recordClaimsSchema`, `getBusinessSchema`, `PERSON_AFFILIATIONS`, `ClaimAnnotation`
  - `packages/os/site-kernel-codegen/src/templates/app-boilerplate/src/content.config.template.ts` — `businessCollections` import
  - `packages/os/site-kernel-onboarding/src/templates/runtime/content.config.template.ts` — `businessCollections` import
  - `systems/warpgogol-com/src/content.config.ts` — `businessCollections` import
  - `systems/warpgogol-com/src/pages/*.astro` — 4 files importing `buildPageSemanticModel`, `buildSiteSemanticProfile`

  The RFC's deletion manifest does not include a migration plan for these imports. Deleting `packages/business/` without migrating them will break the build.

- **`packagesImpacted` is incomplete.** The RFC lists `@gogol/business`, `@gogol/pbp`, `@gogol/share`, `@gogol/ui`, `@gogol/site-kernel-checks`. Missing: `@gogol/site-kernel-codegen` and `@gogol/site-kernel-onboarding` (both have template files importing `businessCollections`), and `@gogol/content-source` (comment-only reference, but should be verified).

- **`buildPageSemanticModel` ownership.** The RFC's §6 states `@gogol/share/semantic` is NOT deleted because `buildPageSemanticModel` is "still used by the PBP semantic profile adapter." But `buildPageSemanticModel` currently lives in `packages/business/src/semantic-model.ts`, not `@gogol/share`. The RFC needs to specify where this function moves before `packages/business/` can be deleted.

- **`recordClaimsSchema` ownership.** 7 files in `site-kernel-checks` import `recordClaimsSchema` from `@gogol/business/schemas`. The RFC does not specify where this schema moves. It is used by content quality checks (claims, freshness, derived content, source monitoring) — these are not business-layer code, they are check infrastructure that happens to use a schema defined in the business package.

- **`businessCollections` in templates.** The codegen and onboarding templates still import `businessCollections` from `@gogol/business/astro`. The RFC does not mention updating these templates to use `pbpCollections` from `@gogol/pbp/astro` instead.

- **Compass sync.** The RFC does not mention which `docs/*.xml` files need updating. DNA-20 is referenced in `docs/requirements.xml` and possibly other Compass files.

## Axis D — Forward-only compliance

- **No compatibility shim.** The RFC explicitly rejects a compatibility shim (ADR-043) — correct.
- **Single atomic deletion.** The RFC mandates a single atomic commit — correct.
- **No dual-path.** The RFC does not propose keeping legacy behavior alive — correct.
- **However:** The RFC's preconditions assume all imports are already gone, but they are not. The "forward-only" path would be to migrate all imports first (in the same RFC), then delete. The RFC as written skips the migration step.

## Axis E — Agent-facing policy

- **Status gate:** RFC correctly states agents MAY implement only when status is `accepted` or `implemented`.
- **Implementation notes** reference RFC-0224, RFC-0334 — correct.
- **Anti-fabrication:** The RFC does not claim content will be auto-generated — correct.
- **Storage policy:** N/A — no persistence changes.
- **Missing:** The RFC says "Deletion MUST NOT execute until `PbpCutoverChecklist.ready === true`" but does not specify what happens if the checklist is `true` but imports still exist. The checklist's `noSiteImportsFromLegacy` check (seen in `pbp-cutover-check.ts:47`) only checks site imports, not package imports.

## Axis F — Pragmatism

- **No new command.** Correct — deletion is manual.
- **Lean contracts.** N/A — deletion RFC.
- **Scope discipline.** `appsImpacted` lists only `warpgogol-com` — correct (only site). `packagesImpacted` is incomplete (see Axis C).
- **`nonGoals` are meaningful** — 6 explicit non-goals, each referencing the owning RFC.

## Axis G — Blind spots

- **Critical: Import migration not addressed.** The RFC assumes all imports from `@gogol/business` are already eliminated, but 13 code imports exist across 4 packages and the site. The deletion preconditions (grep returning 0 results) will fail. The RFC needs a migration section that:
  1. Moves `recordClaimsSchema` and `PERSON_AFFILIATIONS` to `@gogol/share` or `@gogol/site-kernel-checks` (they are check infrastructure, not business logic)
  2. Moves `buildPageSemanticModel` to `@gogol/share` or `@gogol/pbp` (it is a semantic model builder, not business logic)
  3. Moves `getBusinessSchema` / `businessSchemaById` / `parseBusinessEntryData` to `@gogol/site-kernel-checks` or deletes them if unused after cutover
  4. Replaces `businessCollections` with `pbpCollections` in codegen/onboarding templates and site `content.config.ts`
  5. Removes `buildSiteSemanticProfile` from site page routes (already done in this session for `systems/warpgogol-com`, but templates still reference it)

- **FAQ/people content.** The RFC notes FAQ and people files will be deleted from `business/` and says "if still needed, they should be moved to a separate content collection before this RFC executes." But it does not verify whether they ARE still needed. The `people.ts` check in `site-kernel-checks` imports `PERSON_AFFILIATIONS` from `@gogol/business/schemas` — this suggests people content is still actively checked.

- **`content.business.validate` command.** The command table (`04-content-quality.ts:96`) references `content.business.validate` which validates against `@gogol/business` schemas. This command needs to be removed or rewritten to use PBP schemas.

- **Mission workpieces.** Old mission workpieces (`missions/warpgogol-com-m000002..m000004`) still import `@gogol/business`. These are historical artifacts and should probably be excluded from the grep, but the RFC does not mention them.

- **`pnpm-workspace.yaml`.** The RFC checks `grep -r "@gogol/business" pnpm-workspace.yaml` but `@gogol/business` is not referenced there (it's a workspace package, auto-resolved). This precondition is meaningless.

## Questions for the author

1. Where does `recordClaimsSchema` move? It is imported by 7 files in `@gogol/site-kernel-checks` for content quality checks (claims, freshness, derived content). These checks are not business-layer code — they are check infrastructure. Should the schema move to `@gogol/share/schemas`, `@gogol/site-kernel-checks`, or a new package?

2. Where does `buildPageSemanticModel` move? It currently lives in `packages/business/src/semantic-model.ts` and is re-exported by `@gogol/pbp`. The RFC says `@gogol/share/semantic` is NOT deleted because this function is "still used by the PBP semantic profile adapter" — but the function is not in `@gogol/share`, it's in `@gogol/business`. The RFC must specify the migration target.

3. How are `businessCollections` references in codegen/onboarding templates and `content.config.ts` handled? The RFC's deletion manifest does not mention replacing these with `pbpCollections`. Without this, new sites scaffolded after deletion will fail to build.
