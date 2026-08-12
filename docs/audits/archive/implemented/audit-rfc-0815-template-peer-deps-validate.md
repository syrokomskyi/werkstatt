---
rfcId: RFC-0815
auditId: AUDIT-RFC-0815-01
date: 2026-08-12
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0815

## Verdict: Needs revision

The RFC addresses a real gap (peer dependency validation of the onboarding template), but the proposed implementation approach has a critical blind spot: `pnpm install --dry-run` in a temp directory cannot resolve `workspace:*` dependencies that the template declares. The pipeline placement is also ambiguous — a `scope: workspace` command inside a per-site pipeline runs redundantly per site without justification.

## Mechanical validation (rfc.validate)

Pass — zero violations.

## Axis A — Structural completeness

- **A-1: Acceptance criteria missing unit test criterion.** The RFC proposes a new validator with complex resolution logic (temp directory, `pnpm install --dry-run`, peer dep extraction), but no acceptance criterion requires unit tests. RFC-0800 included unit test criteria for `template.deps.drift`. This RFC should follow the same pattern.

## Axis B — DNA alignment

- **B-1: DNA-36 reference is decorative.** The RFC body says "DNA-36 (scaffold-generated): Scaffold quality is only as good as the template it generates from." But DNA-36 in `docs/architecture-dna.md:159-161` defines the onboarding *package* — "The OS package that owns the onboarding lifecycle — input/brief contracts, phase outputs, and app scaffolding." It says nothing about scaffold *quality* or template integrity. The RFC stretches the interpretation beyond the invariant's actual content. Since `kind: command`, `satisfies` is not required, but the body should not claim alignment it doesn't have.

## Axis C — Ecosystem fit

- **C-1: Pipeline placement ambiguity.** The command declares `scope: workspace` (correct — the template is shared across all sites), but the RFC integrates it into `SITES_BUILD_CHECK_PIPELINE`, which is a per-site pipeline driven by `runAppsCheckImpl` in `@/packages/werkstatt-site/src/checks/module.ts:279-345`. This means the workspace-level check runs once per site. The RFC does not address this redundancy. Either place it in a workspace-level pipeline, make it site-scoped, or explicitly document that the redundancy is acceptable (idempotent, short-circuits after first run).

- **C-2: Missing AGENTS.md update.** `packages/werkstatt-site/AGENTS.md:57-65` documents check commands in a "Check commands" section (`template.deps.drift`, `deployment.gate.validate`, `ownership.generator.cross-check`). The RFC does not mention updating this section. RFC-0800 included an acceptance criterion for AGENTS.md documentation.

## Axis D — Forward-only compliance

No issues.

## Axis E — Agent-facing policy

No issues. No self-authorizing language, no NEEDS CLARIFICATION markers, no storage policy violations.

## Axis F — Pragmatism

- **F-1: Alternative of extending `template.deps.drift` not considered.** The RFC proposes a new command but does not consider whether `template.deps.drift` could be extended with a `--check-peer-deps` flag. The two checks share the same template file, the same pipeline, and the same conceptual domain (template integrity). The alternatives section considers CI-only checks, pre-commit hooks, and manual discipline, but not extending the existing command. A justification for why a separate command is needed (vs. a flag) would strengthen the RFC.

## Axis G — Blind spots

- **G-1 (CRITICAL): `workspace:*` dependencies break the proposed implementation.** The template at `packages/werkstatt-site/src/onboarding/templates/package.template.json:60-62` declares three `workspace:*` dependencies: `@warpgogol/forge`, `@warpgogol/werkstatt`, `@warpgogol/werkstatt-site`. Step 2 of the implementation approach says "Runs `pnpm install --dry-run --json` in a temp directory seeded with the template's dependency set." `pnpm install` in a temp directory outside the monorepo workspace cannot resolve `workspace:*` references — pnpm has no workspace context. The command would fail with `ERR_PNPM_NO_MATCHING_VERSION` or similar. The RFC must address this: either strip `workspace:*` deps before resolution, run the dry-run inside the monorepo workspace context, or use a different resolution strategy.

- **G-2: Performance cost is multiplicative.** The RFC states "Resolving a full dependency tree takes 5-10 seconds. Acceptable for a build-check pipeline step that runs once per build." But if integrated into `SITES_BUILD_CHECK_PIPELINE` (per-site), the check runs once per site per build. With N sites, the cost is N × 5-10 seconds. The RFC should either justify the per-site execution or propose a workspace-level execution path.

- **G-3: Alternative approach has the same `workspace:*` problem.** The "simpler, no temp install" alternative proposes `pnpm list --depth Infinity --json` on the workspace. But the workspace's resolved dependency tree includes all packages in the monorepo, not just the template's deps. Filtering by the template's declared packages would not catch peer deps of transitive dependencies that are only resolved through the template's specific version ranges. The alternative is not equivalent to the primary approach.

## Questions for the author

1. How will the validator handle `workspace:*` dependencies in the template? `pnpm install --dry-run` in a temp directory cannot resolve them — what is the concrete resolution strategy?
2. Why is this command in `SITES_BUILD_CHECK_PIPELINE` (per-site) rather than a workspace-level pipeline? If per-site execution is intentional, how is the redundancy justified?
3. Why a new command rather than a `--check-peer-deps` flag on `template.deps.drift`? Both checks read the same template file and run in the same pipeline.
