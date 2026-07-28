---
id: RFC-0550
title: "Post-transplant build verification and error repair in forge-bootstrap"
status: implemented
# kind options: architecture | contract | command | policy | deprecation
kind: architecture
# scope options: app | workspace
scope: workspace
owners:
  - architecture
# Set by the deciding human together with the status change (RFC-0335).
# Draft scaffolds must keep this empty; do not prefill a default identity.
# Format: human:<handle> (agent:<id> reserved — see RFC-0335).
# Default reviewer when none is specified by the operator: human:andrii-syrokomskyi
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-07-27
updatedAt: 2026-07-27
enhancedAt: 2026-07-27
implementedAt: 2026-07-27
closedAt:
supersedes: []
supersededBy:
amends:
  - RFC-0545
  - RFC-0546
amendedBy: []
related:
  - RFC-0542
  - RFC-0545
  - RFC-0546
  - RFC-0547
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-54
# RFC-0396: Traceability to a vendored spec node: "<spec-id>/<node-id>", e.g. "pbp/RFC-PBP-020".
# Set by spec.materialize; leave commented for non-spec RFCs.
# specRef:
# RFC-0478: Platform versioning enforcement. Declares the SemVer delta this RFC
# produces when implemented. Required for post-cutoff implemented RFCs (V-29).
# Values: minor (Breaks-B, requires migrator), patch (safe), none (prose-only),
# major (architectural, manually reserved). Default: patch.
versionBump: patch
commands:
  proposed: []
  added: []
  changed: []
  removed: []
appsImpacted: []
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - forge
successSignals:
  - "forge-bootstrap captures bin-link warnings during the existing post-setup install and reports them to the operator in human language"
  - "forge-bootstrap runs the scopedBuild binding after transplant and captures TypeScript errors, missing modules, and build failures"
  - "When build errors are detected, forge-bootstrap asks the operator if Forge should fix them"
  - "If the operator accepts, forge-bootstrap fixes errors in-session (missing dependencies, broken imports, type errors)"
  - "If the operator declines, forge-bootstrap reports the errors and continues to the welcoming report"
  - "The operator receives a working (or known-broken-with-reported-errors) project after onboarding"
nonGoals:
  - "Adding a separate forge.build.check CLI command — verification runs inside the forge-bootstrap skill, not as a standalone command"
  - "Suppressing build errors silently — all errors are reported to the operator regardless of whether they choose to fix them"
  - "Guaranteeing the transplanted project builds — the source project may have pre-existing errors that Forge cannot fix"
  - "Running build verification for greenfield projects — greenfield projects are scaffolded from profiles and should build by default"
# RFC-0268: OPTIONAL machine-checkable acceptance probes, executed on-demand
# via `pnpm exec site-kernel run rfc.acceptance.run --id <this-rfc-id>` (never
# automatically inside build pipelines). Closed probe vocabulary — see
# docs/rfcs/rfc-0268-make-rfc-acceptance-criteria-machine-checkable.md.
# acceptance:
#   - probe: run
#     command: "site-kernel run some.command.validate --app warpgogol-com"
#     expect:
#       exitCode: 0
#   - probe: file-exists
#     path: "packages/share/src/some-new-module.ts"
#   - probe: command-registered
#     name: "some.new.command"
#   - probe: file-contains
#     path: "AGENTS.md"
#     pattern: "Some new governance paragraph"
---

# RFC-0550: Post-transplant build verification and error repair in forge-bootstrap

## Context

RFC-0545 introduced forge-bootstrap with greenfield and transplant modes. RFC-0546 added the migration-adapter registry for transplant code migration. The transplant flow currently performs: detect adapter → analyze → migrate code → git history transfer → post-setup (pnpm install, pnpm-workspace update, turbo.json update). However, the post-setup step only runs `pnpm install` — it does not run `pnpm build` to verify that the transplanted project actually compiles.

In practice, transplanted projects exhibit two classes of post-migration errors:

1. **Bin-link warnings during `pnpm install`** — packages with `bin` declarations in `package.json` (e.g. `changelog-live`) fail to create symlinks because `dist/` does not exist yet (the project has not been built). pnpm reports ENOENT warnings for every workspace package.

2. **Build failures during `pnpm build`** — missing dependencies (e.g. `playwright-core` not declared in `package.json` but imported in source), broken import paths after directory restructuring, or TypeScript compilation errors.

The operator discovers these errors only when they manually run `pnpm build` after onboarding. This breaks the promise of a working project after onboarding.

## Problem

The forge-bootstrap transplant flow (RFC-0545, RFC-0546) does not verify that the transplanted project builds successfully after migration. The post-setup step runs `pnpm install` but stops there. Two concrete failure modes are unhandled:

1. **Bin-link ENOENT warnings** — `pnpm install` produces dozens of warnings for packages with `bin` fields pointing to unbuilt `dist/` paths. These are noise but indicate missing build output.

2. **Build failures** — `pnpm build` fails due to missing dependencies, broken imports, or TypeScript errors introduced by the migration. The operator is left with a broken project and no guidance.

The operator must manually run `pnpm build`, discover errors, and fix them without Forge assistance. This contradicts the barrier-free onboarding promise (RFC-0547) and leaves the operator in a frustrating state after onboarding.

## Decision

The forge-bootstrap skill runs `pnpm install` and `pnpm build` after transplant migration and before the welcoming report. When build errors are detected, the skill asks the operator if Forge should fix them. If the operator accepts, the skill fixes errors in-session (missing dependencies, broken imports, type errors). If the operator declines, the skill reports the errors in human language and continues to the welcoming report.

## Architectural fit

- **DNA-54 (Forge bindings contract)** — the build verification step resolves the build command via `ref(forge.yaml bindings.commands.scopedBuild)` rather than hardcoding `pnpm build`. This extends DNA-54's de-hardcoding principle to the new build verification step: the skill body references the binding by key, not a project-specific literal. The install command is derived from `forge.yaml project.packageManager` (already the convention in the existing skill).
- **RFC-0545** (forge-bootstrap redesign) — amends the transplant flow by adding a verification phase after post-setup.
- **RFC-0546** (migration-adapter registry) — amends the post-setup phase of the transplant adapter flow.
- **RFC-0547** (barrier-free onboarding) — aligns with the promise that the operator receives a working project after onboarding.
- **RFC-0542** (output contract) — build errors are reported in the operator's `aiLanguage` with zero CLI commands in user-facing text.

## Design

### Process changes in forge-bootstrap SKILL.md

The transplant flow in `forge-bootstrap` SKILL.md (step 6, transplant interview) gains a new sub-step after post-setup (sub-step 6) and before Fill forge.yaml (currently sub-step 7, renumbered to sub-step 8):

**Sub-step 6.7: Build verification and error repair**

1. The existing post-setup install (sub-step 6) is enhanced to capture bin-link ENOENT warnings from stdout/stderr. No second install run — the warnings are captured from the install that already runs.
2. If the install itself fails (exit code != 0), report the dependency resolution error in human language, skip build verification, and continue to the welcoming report. The operator can fix and re-run onboarding.
3. Resolve the build command via `ref(forge.yaml bindings.commands.scopedBuild)`. If the binding is null (the migration adapter could not derive a build command from the source project), skip build verification with a note in the welcoming report and continue.
4. Run the resolved build command and capture stdout/stderr. Set a timeout of 300 seconds (configurable); if the build does not complete in time, report the timeout and continue.
5. Parse build output for:
   - Missing modules (TS2307: Cannot find module 'X')
   - Type errors (TS2xxx)
   - Build command failures (ELIFECYCLE, exit code != 0)
   - Bin-link ENOENT warnings (reported as noise, not blocking)
6. If errors are detected (excluding bin-link warnings, which are cosmetic):
   - Present errors to the operator in human language (in `aiLanguage`) as a structured list with error code, file path, and message.
   - Ask: "Your project has some build errors. Would you like me to fix them?"
   - If yes: fix errors in-session — install missing dependencies, fix broken import paths, resolve type errors. Do not make business logic changes.
   - If no: report errors and continue.
7. If no errors: confirm the project builds successfully.
8. Re-run the build command after fixes to verify. If new errors appear, continue fixing iteratively up to 3 rounds, then report remaining errors.

**Sub-step 6.8 (renumbered from 6.7): Fill forge.yaml** — write derived bindings into `forge.yaml` (`typecheck`, `test`, `scopedBuild` from the adapter's analysis). Write `project.stack` from the detected stack. This step is unchanged from the current flow; only its numbering shifts.

### Skill file changes

| Path | Role |
| --- | --- |
| `packages/forge/skills/meta/forge-bootstrap/SKILL.md` | Add step 6.7 (build verification) to transplant process |

### Error categories and repair strategies

| Error pattern | Repair strategy |
| --- | --- |
| TS2307: Cannot find module 'X' | Check if X is in package.json deps; if not, `pnpm add X`; if peer dep, add to devDeps |
| TS2xxx type errors | Analyze the type mismatch and fix the source or type declaration |
| ELIFECYCLE build failed | Parse the underlying error and apply the appropriate repair |
| Bin-link ENOENT warnings | Cosmetic — report as noise in the welcoming report. Do not re-run install; the warnings resolve after the first build creates `dist/`. |

### Failure modes

- **Build fails with errors the skill cannot fix** — report the errors in human language, suggest the operator seek help, and continue to the welcoming report. The operator is not left without information.
- **`pnpm install` itself fails** — report the dependency resolution error and ask the operator for guidance.
- **Build takes too long** — set a timeout (300s, configurable) and report if the build does not complete in time. Medium-sized turborepo projects can take 60–180s for a clean build; 300s provides headroom.
- **Fix introduces new errors** — re-run build after each fix; if new errors appear, continue fixing iteratively up to 3 rounds, then report remaining errors.
- **Operator declines fix** — errors are reported in the welcoming report under "What needs attention" section.
- **`scopedBuild` binding is null** — the migration adapter could not derive a build command from the source project. Skip build verification with a note in the welcoming report. The operator can configure the binding manually and re-run onboarding.

## Rollout

- **Default behavior**: build verification runs automatically as part of every forge-bootstrap transplant onboarding. No opt-in flag.
- **Existing projects**: not affected — this only changes the forge-bootstrap skill, not existing project configurations.
- **New projects**: all new transplant onboardings include build verification from day one.
- **Integration**: runs inside the forge-bootstrap skill session, not as a CLI command or build pipeline step.

## Alternatives considered

1. **Separate `forge.build.check` CLI command** — rejected because the operator should not need to run commands. Build verification is part of the onboarding experience, not a standalone tool.

2. **Silent auto-fix without asking** — rejected because some build errors may be intentional (e.g. the operator knows about a missing dependency and plans to handle it differently). The operator should decide whether Forge touches their code.

3. **Block onboarding on build errors** — rejected because the operator may have pre-existing errors in their source project that are not caused by the migration. Blocking would trap them in onboarding. Instead, report and offer to fix.

## Risks

- **False positive error detection** — the skill may misinterpret build output and report errors where none exist. Mitigation: parse TypeScript error codes precisely (TS2xxx), not free-text matching.
- **Fix introduces regressions** — automated fixes may break working code. Mitigation: re-run build after each fix, up to 3 rounds.
- **Build timeout** — large projects may take >300s to build. Mitigation: configurable timeout, report if exceeded.
- **Agent misinterpretation** — agents may attempt to fix errors without asking the operator first. Mitigation: the SKILL.md must explicitly state that asking is mandatory before fixing.
- **Operator confusion** — the operator may not understand what "build errors" means. Mitigation: errors are presented in human language with concrete descriptions, not raw compiler output.

## Acceptance criteria

- [x] forge-bootstrap SKILL.md includes a build verification sub-step (6.7) in the transplant process, with the current Fill forge.yaml sub-step renumbered to 6.8 (evidence: packages/forge/skills/meta/forge-bootstrap/SKILL.md:129-145, sub-step 6.7 added and 6.8 renumbered)
- [x] The step enhances the existing post-setup install to capture bin-link warnings (no second install run) and runs the build command resolved via `ref(forge.yaml bindings.commands.scopedBuild)` after migration (evidence: packages/forge/skills/meta/forge-bootstrap/SKILL.md:127, post-setup captures bin-link warnings; SKILL.md:131, uses ref(forge.yaml bindings.commands.scopedBuild))
- [x] If `scopedBuild` binding is null, the skill skips build verification with a note in the welcoming report (evidence: packages/forge/skills/meta/forge-bootstrap/SKILL.md:131, "If the binding is null...skip build verification with a note in the welcoming report")
- [x] Build errors are parsed into a structured list with error code, file path, and message, categorized as: missing modules (TS2307), type errors (TS2xxx), or build command failures (ELIFECYCLE, exit code != 0) (evidence: packages/forge/skills/meta/forge-bootstrap/SKILL.md:133-137, parse categories listed; SKILL.md:139, structured list with error code, file path, message)
- [x] The skill asks the operator if Forge should fix detected errors (excluding bin-link warnings, which are cosmetic and reported as noise) (evidence: packages/forge/skills/meta/forge-bootstrap/SKILL.md:138-140, asks operator; SKILL.md:137, bin-link warnings marked cosmetic)
- [x] If the operator accepts, the skill fixes errors in-session (install missing dependencies, fix broken import paths, resolve type errors — not business logic changes) and re-runs the build command to verify, up to 3 rounds (evidence: packages/forge/skills/meta/forge-bootstrap/SKILL.md:141, fix scope and 3-round iterative loop)
- [x] If the operator declines, errors are reported in the welcoming report under a "What needs attention" section (evidence: packages/forge/skills/meta/forge-bootstrap/SKILL.md:142, "report errors and continue" — welcoming report is the next step after transplant)
- [x] No CLI commands appear in operator-facing text (per RFC-0542) (evidence: packages/forge/skills/meta/forge-bootstrap/SKILL.md:129-143, all operator-facing text uses aiLanguage with zero CLI commands; forge.skill.validate passed with 0 SKILL-11 violations)
- [x] `packages/forge/AGENTS.md` does not require updates (the Output contract section already covers skill reports using `aiLanguage` with zero CLI commands) (evidence: packages/forge/AGENTS.md Output contract section, no changes needed — verified via git diff)
- [x] `rfc.validate` passes on this file before merging (evidence: rfc.validate RFC-0550 --json, exitCode: 0, 0 errors)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT fix build errors without asking the operator first — the ask is mandatory.
- Agents MUST NOT suppress or hide build errors from the operator — all detected errors are reported.
- Agents MUST NOT block onboarding on build errors — the operator must be able to complete onboarding with a broken project.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
