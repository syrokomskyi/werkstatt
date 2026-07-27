---
rfcId: RFC-0534
auditId: AUDIT-RFC-0534-01
date: 2026-07-26
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0534

## Verdict: Needs revision

The RFC's central premise — extending `onboarding.scaffold` with a git hook configuration step — is invalid because `onboarding.scaffold` was removed by RFC-0532 (status: implemented). The onboarding flow is now `fo-onboard` skill → `onboarding.synthesize` → `sternsystem.register` → `mission.materialize`. Additionally, the `satisfies: [DNA-53]` claim is unexplained in the RFC body.

## Mechanical validation (rfc.validate)

Pass — `rfc.validate RFC-0534 --json` returned zero violations.

## Axis A — Structural completeness

- **Failure modes** table does not specify exit codes or warn-vs-fail behavior. The skill runs terminal commands (`git config`, `chmod`, `node ... ecosystem.commit --dry-run`); each failure mode should state the expected exit code and whether the skill aborts or continues.
- **Output format** says "Not applicable — the skill produces human/agent-readable output via terminal commands." This is acceptable for a skill-only RFC with no kernel command, but the skill's verification output (success/failure of each step) should be described informally.
- **Acceptance criteria** are checkable, but criterion "onboarding.scaffold includes git config core.hooksPath hooks/ step" references a non-existent command (see Axis C).

## Axis B — DNA alignment

- **Failure**: `satisfies: [DNA-53]` is not explained in the RFC body. DNA-53 is about semantic fingerprint governance — "All project hashes for platform, content, release artifacts, snapshots, and generated manifests use the shared `@gogol/fingerprint` package." This RFC is about a setup skill for git hooks and env documentation. The RFC body makes zero mention of fingerprinting, hashes, or `@gogol/fingerprint`. The connection to DNA-53 is indirect at best (RFC-0533 enforces DNA-53 via `ecosystem.commit` which computes the platformSemanticHash; this RFC sets up the hook for RFC-0533). The RFC must either explain how it protects DNA-53 or remove the `satisfies` entry.

## Axis C — Ecosystem fit

- **CRITICAL — Failure**: The RFC repeatedly references `onboarding.scaffold` as a pipeline that needs a new step (lines 107, 116, 147, 165, 191). But `onboarding.scaffold` was **removed** by RFC-0532 (status: implemented, `commands.removed` includes `onboarding.scaffold`). The onboarding flow is now:
  1. `fo-onboard` skill (AI orchestration, `.agents/skills/fo-onboard/`)
  2. `onboarding.synthesize` (deterministic input validation)
  3. `sternsystem.register` (creates registry entry + opens first mission, in `packages/os/site-kernel-handoff`)
  4. `mission.materialize` (generates boilerplate from templates)

  Evidence: `packages/os/site-kernel-onboarding/src/module.ts` CHANGE_SUMMARY line 15: "RFC-0532: Remove brief.validate, onboarding.input.validate, onboarding.phase.validate, onboarding.scaffold, onboarding.checklist." RFC-0532 acceptance criterion line 368: "Old commands (...) are removed from @gogol/site-kernel-onboarding."

  The `packagesImpacted` field lists `packages/os/site-kernel-onboarding` — but the onboarding command surface has been removed from that package. The correct target for hook configuration during onboarding is either the `fo-onboard` skill or `sternsystem.register` in `packages/os/site-kernel-handoff`.

- **Failure**: `related` lists `RFC-0346` but not `RFC-0388` (which superseded RFC-0346 for the `.env.example` mandate per DNA-40). The RFC body itself references RFC-0388 (line 96) but the frontmatter does not.
- **Failure**: `related` does not list `RFC-0532` — the RFC that removed `onboarding.scaffold` and restructured the onboarding flow. This is a significant omission given RFC-0534's dependency on the onboarding flow.

## Axis D — Forward-only compliance

No issues. The RFC does not propose backward compatibility layers, shims, or dual-paths.

## Axis E — Agent-facing policy

No issues. The RFC does not contain self-authorizing language. Implementation notes reference correct governance rules (RFC-0224, RFC-0334, RFC-0330). The dependency on RFC-0533 is explicitly stated.

## Axis F — Pragmatism

- **Minor**: The `setup-ecosystem` skill is a reasonable addition that automates a manual step. No over-engineering.
- **Minor**: The `.env.example` documentation of `ECOSYSTEM_COMMIT` is debatable. DNA-40 requires `.env.example` to document env vars read from `process.env` by Node code. `ECOSYSTEM_COMMIT` is set by `ecosystem.commit` (Node) and read by the pre-commit hook (shell script), not read from `process.env` by platform code. The RFC acknowledges this tension in Risks (line 183) and in the Decision (line 105). The argument that documenting it "follows the spirit of the convention" is reasonable but should be explicit about whether this is a DNA-40 obligation or a voluntary documentation improvement.
- **Internal clarity**: The nonGoals say "Do not add ECOSYSTEM_COMMIT to .env files" (line 59) while the Decision says "Documents the ECOSYSTEM_COMMIT transient env var in .env.example" (line 105). The distinction between `.env` (persistent) and `.env.example` (documentation template) is correct but subtle — the RFC should make this distinction explicit to avoid confusion.

## Axis G — Blind spots

- **Failure**: The RFC does not consider the `fo-onboard` skill as the correct target for hook configuration during onboarding. This is the same ecosystem drift issue from Axis C — the RFC assumes `onboarding.scaffold` exists and does not explore the actual onboarding flow.
- **Minor**: The README.md "Quick start" section (lines 44-62) already includes `git lfs install` but not `git config core.hooksPath hooks/`. The RFC should specify where exactly the setup section goes — after "Quick start" or as a new "Setup" section.
- **Minor**: The RFC does not consider what happens when an operator runs the `setup-ecosystem` skill on a fresh clone before `pnpm install`. The skill runs `node packages/os/site-kernel/bin/site-kernel.mjs run ecosystem.commit --dry-run` — this requires dependencies to be installed. The skill should either check for `node_modules/` or run `pnpm install` first.

## Questions for the author

1. `onboarding.scaffold` was removed by RFC-0532 (implemented). The onboarding flow is now `fo-onboard` skill → `onboarding.synthesize` → `sternsystem.register` → `mission.materialize`. Which of these should include the `git config core.hooksPath hooks/` step, and should `packagesImpacted` be updated to target `packages/os/site-kernel-handoff` (where `sternsystem.register` lives) or `.agents/skills/fo-onboard/`?
2. How does this RFC satisfy DNA-53 (semantic fingerprint governance)? The RFC body doesn't mention fingerprinting or `@gogol/fingerprint`. Should the `satisfies` field be removed, or should the body explain the indirect protection chain (setup skill → hook activation → `ecosystem.commit` enforcement → DNA-53)?
3. Should `RFC-0532` and `RFC-0388` be added to the `related` list, given that RFC-0532 removed `onboarding.scaffold` (making this RFC's onboarding section invalid) and RFC-0388 superseded RFC-0346 for the `.env.example` mandate?
