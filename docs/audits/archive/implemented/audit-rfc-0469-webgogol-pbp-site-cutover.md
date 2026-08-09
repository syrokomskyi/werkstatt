---
rfcId: RFC-0469
auditId: AUDIT-RFC-0469-01
date: 2026-07-20
auditor:
  skill: fo-idea-audit
  model: unknown
verdict: approved
---

# Audit: RFC-0469

## Verdict: Approved

The RFC is a well-defined cutover plan with clear preconditions, code changes, verification steps, and rollback safety. It correctly preserves the `SemanticSiteProfile` interface to avoid page route changes. The `pbp.cutover.check` command is pragmatic and well-specified. Minor findings on ecosystem fit and blind spots do not block implementation.

## Mechanical validation (rfc.validate)

Pass — 0 violations.

## Axis A — Structural completeness

- **Decision** is present tense and specific: cutover preconditions, semantic profile adapter, collection switch, page route switch, OS validation switch, cutover check command, execution steps, rollback plan.
- **CLI surface** specifies exact command: `pnpm exec werkstatt run pbp.cutover.check --app warpgogol-com`.
- **TypeScript contracts** — `PbpCutoverCheckResult` interface is minimal and purpose-driven.
- **File system responsibilities** table names 7 concrete paths.
- **Output format** documents the JSON shape with all fields.
- **Failure modes** covers check failure, build failure, visual regression, Schema.org mismatch, legacy import found.
- **Rollout** describes preconditions, execution, coexistence, post-cutover, dependency chain.
- **Alternatives considered** has 3 real alternatives with rejection reasons.
- **Risks** covers semantic profile mismatch, Schema.org regression, missing data, build performance, owner decisions.
- **Acceptance criteria** — 14 items, all checkable.
- **Implementation notes** — 8 explicit behavioral rules including atomic commit, no legacy deletion, interface preservation, grep verification.
- No issues.

## Axis B — DNA alignment

- **DNA-1 (Monorepo boundary):** Cutover changes in site workspace and `@gogol/pbp`. No site-local schemas. Correct.
- **DNA-20 (Business layer):** This RFC is the point where `@gogol/business` ceases to be canonical for `warpgogol-com`. The package itself is not deleted (RFC-0470). This is a forward-only replacement — no compatibility layer (ADR-043 explicitly rejected).
- **DNA-55 (Spec vendoring):** Cutover preconditions reference `pbp-specification-package/migration-plan` §26. Correct.
- `satisfies: [DNA-1, DNA-20]` — both are real invariants and the RFC body explains how each is enforced.
- No issues.

## Axis C — Ecosystem fit

- **Package boundaries:** `buildPbpSemanticProfile` in `packages/pbp/`, page routes in site workspace. Correct.
- **Pipeline placement:** `pbp.cutover.check` is a standalone command, not a build pipeline hook. Correct — it's a pre-cutover verification, not a build-time check.
- **Compass sync:** The RFC does not mention which `docs/*.xml` files need synchronization. Since it changes `packages/os/site-kernel-checks/src/content-business.ts` to use `pbpSchemaById`, `docs/technology.xml` may need an update for the changed validation source. **Minor finding.**
- **AGENTS.md updates:** The RFC does not mention updating `systems/warpgogol-com/AGENTS.md` to reflect the cutover from `@gogol/business` to `@gogol/pbp`. **Minor finding.**
- **Cosmic naming:** Not applicable — no manifest or component changes.
- **Command lifecycle:** `commands.proposed: []`, `commands.added: []` — **the `pbp.cutover.check` command is described in the RFC body but not listed in `commands.added`.** This should be in `commands.proposed` or `commands.added`. **Finding — the command should be registered in the frontmatter.**
- One finding (command lifecycle).

## Axis D — Forward-only compliance

- No compatibility shims. The `SemanticSiteProfile` interface is preserved, but this is an adapter pattern, not a compatibility layer — the data source changes completely.
- ADR-043 (no compatibility layer) is explicitly referenced and honored.
- No dual-paths. The cutover is a single atomic commit.
- Legacy files are not deleted (RFC-0470) but are no longer read.
- No issues.

## Axis E — Agent-facing policy

- **Status gate:** RFC is `draft`. Implementation notes correctly state "Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented)." No self-authorizing language.
- **Implementation notes** reference RFC-0224, RFC-0334. Correct.
- **Anti-fabrication:** The cutover is code changes only — no content authoring. The preconditions check for owner decisions (RFC-0468) and content (RFC-0468) to be complete. Correct separation.
- **Storage policy:** Not applicable — no persistence changes.
- No issues.

## Axis F — Pragmatism

- **Minimal command surface:** `pbp.cutover.check` is a new command, but it's justified — it verifies preconditions that no existing command covers. The alternatives section explains why a flag on an existing command is insufficient.
- **Lean contracts:** `PbpCutoverCheckResult` is minimal. `buildPbpSemanticProfile` and `buildPbpPageSemanticModel` are thin adapters. Good.
- **Existing patterns:** The RFC follows the existing `buildSiteSemanticProfile` pattern from `@gogol/business` with a PBP replacement. Consistent.
- **Scope discipline:** `appsImpacted: ["warpgogol-com"]`, `packagesImpacted: ["@gogol/pbp", "@gogol/business", "@gogol/share", "@gogol/ui"]`. The inclusion of `@gogol/business` and `@gogol/ui` is correct — `@gogol/business` is being switched away from, and `@gogol/ui` may have imports that reference business types. Good.
- **Rollback plan:** 6-step rollback is well-designed. Legacy files as safety net is pragmatic.
- No issues.

## Axis G — Blind spots

- **Performance:** The RFC mentions build performance risk and mitigates with Wave 1 scope. Adequate.
- **False positives:** The `grep -r "@gogol/business"` check could match comments or type imports that don't affect runtime. **Minor finding — the grep should exclude comments or be scoped to import statements.**
- **Edge cases:** The RFC considers missing data (FAQ, people) and explains they continue using their own collections. Does not explicitly consider what happens if `compilePbpProfile` fails during build after cutover. **Minor finding — the failure mode should specify that the build fails with a clear error message pointing to the compiler output.**
- **Migration path:** The 12-step cutover process is well-documented with exact order.
- **Security/privacy:** Not applicable — no new data exposure.
- No blocking issues.

## Questions for the author

1. Should `pbp.cutover.check` be listed in `commands.proposed` or `commands.added` in the RFC frontmatter? It's described in the body but missing from the command lifecycle buckets.
2. The `grep -r "@gogol/business"` check in step 9 — should it be scoped to import statements only, or is a blanket grep acceptable? Comments referencing `@gogol/business` would cause false positives.
3. What happens if `compilePbpProfile` throws during `astro build` after cutover? Should the error message guide the operator to run `pbp.cutover.check` for diagnostics?
