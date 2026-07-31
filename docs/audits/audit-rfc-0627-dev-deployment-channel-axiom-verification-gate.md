---
rfcId: RFC-0627
auditId: AUDIT-RFC-0627-01
date: 2026-07-31
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0627

## Verdict: Needs revision

The RFC is architecturally sound and well-structured, but contains a factual error about where `leitstand.deploy` should be registered, leaves the `rolled-back` state's reachability ambiguous after changing rollback to auto-step, and has exit code collisions between the deploy phase and the `mission.check` phase. Six findings across four axes need resolution before implementation.

## Mechanical validation (rfc.validate)

Pass with 1 warning.

- **V-30 (warning):** `@warpgogol/ontology` is in `packagesImpacted` but `breaksC` is not `true`. RFC-0608 (the amended RFC) set `breaksC: true` for the same package. The RFC should set `breaksC: true` to match the established pattern.

## Axis A — Structural completeness

1. **Exit code collision between deploy and axiom phases.** The failure modes table assigns exit codes 2–7 to `leitstand.deploy`, but `mission.check` (invoked by `leitstand.deploy`) also uses exit codes 2–7 (2=server fail, 3=health timeout, 4=playwright missing, 5=axiom-study missing, 6=build failure, 7=sitemap missing). When `leitstand.deploy` exits with code 4, the operator cannot distinguish a wrangler deploy failure (if the RFC intended 4 for that) from a Playwright missing error. The RFC should use distinct exit code ranges (e.g., 10+ for deploy-phase failures, 20+ for axiom-phase failures) or explicitly document that exit codes 4–7 are passed through from `mission.check` while 2–3 are `leitstand.deploy`'s own.

## Axis B — DNA alignment

No issues. The RFC correctly amends RFC-0608 (not supersedes), extends DNA-48's state machine and DNA-49's channel model, and explains the extension in the Architectural fit section.

## Axis C — Ecosystem fit

1. **Command registration location is wrong.** The file system responsibilities table says `leitstand.deploy` is registered in `packages/os/site-kernel-checks/src/command-tables/infra-contracts.ts`. But existing leitstand commands (`leitstand.propagate`, `leitstand.promote`, `leitstand.rollback`, `leitstand.health`) are registered in `packages/os/site-kernel-handoff/src/leitstand/leitstand.module.ts`. `infra-contracts.ts` contains `mission.check` and check commands, not leitstand commands. The RFC should list `leitstand.module.ts` as the registration location.

2. **`packagesImpacted` may be incorrect.** If `leitstand.deploy` is registered in `leitstand.module.ts` (in `site-kernel-handoff`), then `@warpgogol/site-kernel-checks` may not need changes. The RFC should either justify why `site-kernel-checks` is impacted or remove it from `packagesImpacted`.

3. **`leitstand.status` and `leitstand.health` not updated.** The current `leitstand.status` shows `alt` and `main` channels; `leitstand.health` accepts `--channel alt|main`. With the new `dev` channel, both commands need updating to support `dev`. The RFC doesn't mention these changes in the rollout or file system responsibilities.

4. **Compass XML sync not mentioned.** The RFC changes the deployment chain, which may affect `docs/verification-plan.xml` or `docs/development-plan.xml`. The RFC should identify which `docs/*.xml` files need synchronization (root AGENTS.md Compass document duties).

5. **AGENTS.md updates are vague.** Rollout step 7 says "AGENTS.md updates" without specifying which files. At minimum, `packages/os/site-kernel-handoff/AGENTS.md` (Leitstand section) needs updating to document the new `dev` channel, `leitstand.deploy` command, and the three-stage deployment chain.

## Axis D — Forward-only compliance

1. **`rolled-back` state reachability is ambiguous.** The auto-step rollback model transitions one step back: `promoted` → `alt-deployed`, `alt-deployed` → `dev-deployed`, `dev-deployed` → `published`. This means `rolled-back` is no longer reachable via `leitstand.rollback`. But the `releaseStateSchema` still includes `rolled-back`. The RFC should clarify: is `rolled-back` kept for compatibility only, or is it reachable through a different path (e.g., explicit `--to-release` rollback that skips multiple steps)?

2. **Main rollback behavior change not explicitly called out.** RFC-0608 transitions main rollback → `rolled-back`. This RFC changes it to `alt-deployed` (one step back). This is a behavioral amendment to RFC-0608 that should be explicitly documented in the Architectural fit section, not just in the rollout.

## Axis E — Agent-facing policy

No issues. The status gate is correct (draft → accepted → implemented), implementation notes reference RFC-0224 preconditions and RFC-0334 supersede escalation, and the anti-bypass rules are explicit.

## Axis F — Pragmatism

1. **V-30 warning: `breaksC` not set.** `@warpgogol/ontology` is in `packagesImpacted` and the RFC modifies `packages/ontology/src/operations/release.ts` and `leitstand.ts`. RFC-0608 set `breaksC: true` for the same type of change. The RFC should set `breaksC: true` to match the established pattern and clear the V-30 warning.

## Axis G — Blind spots

1. **`leitstand.deploy` state check undefined.** The RFC doesn't specify what release states `leitstand.deploy` accepts. If Axiom fails (exit 1, release is `dev-deployed`), can the operator fix the issues and re-run `leitstand.deploy`? The release is already `dev-deployed`, not `published`. The RFC should specify whether `leitstand.deploy` accepts `published` only, or also `dev-deployed` (idempotent re-deploy).

2. **Axiom evidence freshness undefined.** The failure modes table mentions "Axiom evidence stale or missing" but doesn't define "stale". `findings.yaml` contains `recordedAt` and `capsuleRef` but no `releaseId`. How does `leitstand.propagate` verify the evidence belongs to the current release and not a previous one? The RFC should specify the freshness check (e.g., compare `recordedAt` to release `publishedAt`, or bind `releaseId` into the evidence capsule).

3. **Existing `alt-deployed` releases are stuck.** The RFC says existing `alt-deployed` releases "remain as-is" but `leitstand.propagate` now requires `dev-deployed` state. An existing `alt-deployed` release cannot be re-propagated. The RFC should clarify that existing `alt-deployed` releases can only be promoted or rolled back, not re-propagated through the new chain.

## Questions for the author

1. What release states does `leitstand.deploy` accept — only `published`, or also `dev-deployed` (for re-deploy after fixing Axiom issues without going back to `published`)?
2. How does `leitstand.propagate` determine that Axiom evidence is "stale"? What field or timestamp is compared, and how is the evidence bound to a specific release?
3. Is `rolled-back` still a reachable state in the new auto-step rollback model, or is it kept in the enum for compatibility only? If reachable, under what conditions?
