---
rfcId: RFC-0550
auditId: AUDIT-RFC-0550-01
date: 2026-07-27
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0550

## Verdict: Needs revision

The RFC addresses a real gap in the forge-bootstrap transplant flow, but the `satisfies: [DNA-54]` claim is decorative — the RFC body does not explain how build verification extends the Forge bindings contract, and the Design section hardcodes `pnpm build` instead of referencing `ref(forge.yaml bindings.commands.scopedBuild)`. Several blind spots around the build command source, timeout, and install/build ordering need resolution before implementation.

## Mechanical validation (rfc.validate)

Pass — 2 warnings (V-19): `amendedBy` back-fill needed on RFC-0545 and RFC-0546. These are administrative and will be resolved during the enhance step.

## Axis A — Structural completeness

- **Decision** is present tense and clear: "The forge-bootstrap skill runs `pnpm install` and `pnpm build` after transplant migration." Good.
- **File system responsibilities** table names one concrete path (`packages/forge/skills/meta/forge-bootstrap/SKILL.md`). Correct — this is a skill-only change.
- **Failure modes** section is thorough: covers unfixable errors, install failure, timeout, fix regressions, and operator decline. Good.
- **Rollout** describes default behavior, existing-project impact, and new-project scope. Good.
- **Alternatives considered** has 3 real alternatives with rejection reasons. Good.
- **Risks** includes agent misinterpretation and false-positive detection. Good.
- **Acceptance criteria** are mostly checkable, but two items are vague:
  - "Build errors are parsed and categorized (missing modules, type errors, build failures)" — what constitutes correct categorization? The RFC should specify that the parsing produces a structured list with error code, file, and message.
  - "If the operator accepts, the skill fixes errors in-session and re-runs build to verify" — "fixes errors" is open-ended. The RFC should constrain the fix scope (e.g. "install missing deps, fix import paths, resolve type errors — not business logic changes").
- **Implementation notes** are explicit behavioral rules with MUST NOTs. Good.
- **Step numbering mismatch**: the RFC says "step 6.6 → 6.7" but the actual SKILL.md transplant sub-steps are numbered 1–7 (not 6.1–6.7). Post-setup is sub-step 6, Fill forge.yaml is sub-step 7. The RFC's numbering convention (prefixing with 6.) is reasonable, but the new step should be labeled 6.7 and the current "Fill forge.yaml" (sub-step 7) becomes 6.8. The RFC should explicitly state this renumbering.

## Axis B — DNA alignment

- **`satisfies: [DNA-54]` is decorative.** DNA-54 is the Forge bindings contract: "Canonical forge skill bodies must not contain hardcoded project-specific literals." The RFC body says DNA-54 "extends the forge-bootstrap skill process to include build verification as a post-setup step" — but build verification is a process change, not a bindings contract extension. The RFC does not explain how adding a build step extends or enforces DNA-54. **Finding: the RFC must either (a) explain how build verification relates to the bindings contract — e.g. the build command must be resolved via `ref(forge.yaml bindings.commands.scopedBuild)` rather than hardcoded, or (b) remove DNA-54 from `satisfies` if no genuine relationship exists.**
- **Hardcoded `pnpm build` in Design section.** The step says "Run `pnpm build` and capture stdout/stderr." This hardcodes a project-specific command in the skill body — exactly what DNA-54 prohibits. The skill should resolve the build command via `ref(forge.yaml bindings.commands.scopedBuild)`. Similarly, `pnpm install` should use the package manager from `forge.yaml project.packageManager` (already the convention in the existing skill). **Finding: replace `pnpm build` with `ref(forge.yaml bindings.commands.scopedBuild)` and `pnpm install` with the package-manager-aware install command derived from `forge.yaml project.packageManager`.**
- **No conflict with existing DNA invariants.** The RFC does not conflict with any DNA entry.

## Axis C — Ecosystem fit

- **Package boundaries**: only touches `packages/forge` — correct. No cross-package imports introduced.
- **Pipeline placement**: not applicable — no new build pipeline check. The RFC explicitly states this is not a CLI command (nonGoals).
- **Command lifecycle**: `commands.proposed/added/changed/removed` all empty — correct. No new commands.
- **AGENTS.md updates**: the RFC does not mention updating `packages/forge/AGENTS.md`. The change is to a skill file only; the AGENTS.md Output contract section already covers skill reports using `aiLanguage` with zero CLI commands. No update needed — but the RFC should state this explicitly.
- **Cosmic naming**: not applicable.

## Axis D — Forward-only compliance

No issues. The RFC adds a step to the transplant flow without maintaining a parallel path. It amends RFC-0545 and RFC-0546 directly. No compatibility shim, no flag, no legacy path.

## Axis E — Agent-facing policy

- **Status gate**: correct — "Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented)."
- **Implementation notes** reference RFC-0224 (accepted→implemented) and RFC-0334 (supersede escalation). Good.
- **Mandatory ask before fixing**: "Agents MUST NOT fix build errors without asking the operator first" — strong agent-facing policy. Good.
- **No self-authorizing language**: the RFC does not grant implementation permission while draft.
- No issues.

## Axis F — Pragmatism

- **Minimal command surface**: no new commands — correct. The RFC explicitly rejects a separate `forge.build.check` CLI command (nonGoals).
- **Existing patterns**: extends the existing forge-bootstrap skill rather than creating a new mechanism. Good.
- **Scope discipline**: `packagesImpacted: [forge]`, `appsImpacted: []` — correct. `nonGoals` are meaningful (greenfield exclusion, no silent suppression, no build guarantee).
- **Arbitrary constants**: the 120s timeout and 3-round fix limit are reasonable defaults but should be acknowledged as tunable. Minor.

## Axis G — Blind spots

- **Build command source is unspecified.** The RFC says "Run `pnpm build`" but doesn't clarify whether this is the root workspace build (`pnpm build`), the app-specific build (`pnpm --filter <appName> run build`), or the forge.yaml `scopedBuild` binding. In a turborepo, `pnpm build` at the root runs all workspaces — which may include unrelated packages and produce irrelevant errors. The RFC should specify: use `ref(forge.yaml bindings.commands.scopedBuild)` scoped to the transplanted app.
- **`scopedBuild` binding may be null.** If the migration adapter could not derive a build command (e.g. the source project had no `scripts.build`), the binding is null and the skill cannot run a build. The RFC must handle this case: skip build verification with a note, or ask the operator for the build command.
- **120s timeout is too low for turborepo builds.** A turborepo with 10+ packages can take 60–180s for a clean build. The RFC should either increase the default (300s) or make it configurable. The failure mode "Build takes too long" mentions 120s as if it's sufficient — it is not for medium-sized projects.
- **Double `pnpm install` ambiguity.** The RFC says "Run `pnpm install` (already part of post-setup, but now capture warnings)." It is unclear whether this is a second install run or an enhancement of the existing post-setup install. If it's a second run, it wastes time. The RFC should state: "enhance the existing post-setup `pnpm install` to capture and report bin-link warnings" — not "run `pnpm install` again."
- **Bin-link warning handling is underspecified.** The error categories table says "Run `pnpm build` first to create dist/ before re-running `pnpm install`" — but this implies running build before install completes, which is impossible (install must succeed before build can run). The actual fix for bin-link warnings is: run `pnpm install` (warnings are expected), then `pnpm build`, then `pnpm install` again to resolve bin-links. The RFC should correct this.
- **No consideration of `pnpm install` failure after migration.** The failure modes section mentions "`pnpm install` itself fails" but the Design section doesn't handle it in the step flow. If install fails, the skill cannot proceed to build verification. The step should check install exit code before proceeding.

## Questions for the author

1. How does build verification extend DNA-54 (Forge bindings contract)? If the connection is that the build command must be resolved via `ref(forge.yaml bindings.commands.scopedBuild)` rather than hardcoded, state this explicitly. If there is no genuine connection, remove DNA-54 from `satisfies`.
2. What build command does the skill run — root `pnpm build`, app-scoped `pnpm --filter <appName> run build`, or `ref(forge.yaml bindings.commands.scopedBuild)`? How does the skill handle a null `scopedBuild` binding?
3. Is the "Run `pnpm install`" in step 6.7 a second install or an enhancement of the existing post-setup install? If second, why? If enhancement, reword to avoid ambiguity.
