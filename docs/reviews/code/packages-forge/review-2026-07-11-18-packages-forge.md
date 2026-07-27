---
reviewId: REVIEW-CODE-2026-07-11-01
date: 2026-07-11
reviewer:
  skill: wg-review
  model: unknown
verdict: needs-revision
diffRange: 7d124895f...HEAD
filesReviewed:
  - packages/forge/os/compass/compass.module.ts
  - packages/forge/os/compass/index.ts
  - packages/forge/os/core/core.module.ts
  - packages/forge/os/core/index.ts
  - packages/forge/os/naming/naming-convention.ts
  - packages/forge/os/naming/naming.module.ts
  - packages/forge/os/naming/index.ts
  - packages/forge/os/rfc/rfc.module.ts
  - packages/forge/os/werkstatt/werkstatt.module.ts
  - packages/forge/os/werkstatt/index.ts
  - packages/forge/os/workflow/handlers.ts
  - packages/forge/os/workflow/workflow.module.ts
  - packages/forge/os/workflow/index.ts
  - packages/forge/os/workflow/types.ts
  - packages/forge/src/forge-module.ts
  - packages/forge/src/index.ts
  - packages/forge/package.json
  - packages/forge/AGENTS.md
  - packages/os/site-kernel-handoff/src/werkstatt/index.ts
  - packages/os/site-kernel-handoff/src/index.ts
  - packages/os/site-kernel-checks/src/index.ts
  - packages/os/site-kernel-checks/src/command-tables/04-content-quality.ts
  - packages/os/site-kernel-checks/src/command-tables/07-structure-naming.ts
  - packages/os/site-kernel-checks/src/pipelines/packages-check.ts
  - packages/os/site-kernel/src/templates/wire/tools/kernel.config.template.ts
  - packages/os/site-kernel/src/templates/wire/tools/modules/check.module.template.ts
  - apps/warpgogol-com/tools/kernel.config.ts
  - apps/nicaragua-projekt/tools/kernel.config.ts
  - apps/check-warpgogol-com/tools/kernel.config.ts
  - tools/kernel.config.ts
  - package.json
  - docs/technology.xml
  - packages/AGENTS.md
---

# Code Review: 7d124895f...HEAD (RFC-0374 steps 6–14)

### Verdict: Needs revision

The migration is architecturally sound and mechanically clean — all four affected packages pass `build:check`, commands register and execute correctly at runtime, and the `src/` vs `os/` separation is well executed. However, two DNA-42 violations (stale MODULE_CONTRACT prose in copied files) and one forward-only issue (old modules still exported from `@warpgogol/site-kernel`) require revision before merge. Additionally, `forge.skill.validate` was added to the packages-check pipeline but currently fails with 18 violations, which will break the pipeline.

### Mechanical floor

Pass — `@warpgogol/forge`, `@warpgogol/site-kernel`, `@warpgogol/site-kernel-checks`, `@warpgogol/site-kernel-handoff` all pass `build:check` (tsc --noEmit).

### Axis A — Structural correctness

- **FAIL — Stale MODULE_CONTRACT in copied workflow files.** `packages/forge/os/workflow/handlers.ts:3` and `packages/forge/os/workflow/workflow.module.ts:3` both have `<purpose>Maintains packages/os/site-kernel/src/workflow/handlers.ts as an authored site-kernel authored module...</purpose>`. These are verbatim copies from `packages/os/site-kernel/src/workflow/` with the old path still in the MODULE_CONTRACT. The purpose must describe the forge location, not the old site-kernel path.
- **PASS — Typing.** `ForgeCommandResult` is structurally compatible with `KernelCommandResult` (subset of optional fields). The `ForgeCommandDefinition.execute` return type `Promise<ForgeCommandResult | void> | ForgeCommandResult | void` is compatible with `KernelCommandDefinition.execute` return type `Promise<void | KernelCommandResult<unknown>> | void | KernelCommandResult<unknown>`.
- **PASS — Wrapper functions in core.module.ts.** The four wrappers in `packages/forge/os/core/core.module.ts:20-74` correctly adapt the simplified `src/` handler signatures to `KernelCommandInput`/`KernelRuntimeContext`/`KernelCommandResult`. The `unknown` cast in `runInit` (line 29: `const ctx = context as { workspaceRoot?: string }`) is acceptable — the handler's own type contract is narrower than the kernel's.
- **PASS — No dead code.** All exported modules are consumed by kernel.config.ts files.

### Axis B — DNA alignment

- **FAIL — DNA-42 (Compass markup) in workflow files.** The MODULE_CONTRACT `<purpose>` in `packages/forge/os/workflow/handlers.ts:3` and `packages/forge/os/workflow/workflow.module.ts:3` is semantically false — it claims to maintain files at `packages/os/site-kernel/src/workflow/` while the actual file is at `packages/forge/os/workflow/`. DNA-42 requires MODULE_CONTRACT prose to be true. The CHANGE_SUMMARY also lacks an RFC-0374 entry.
- **PASS — DNA-1 (monorepo boundary).** No `apps/* → apps/*` imports. Forge `os/` imports from `@warpgogol/site-kernel`, `@warpgogol/site-kernel-checks`, `@warpgogol/site-kernel-codegen`, `@warpgogol/site-kernel-handoff` — all packages, all correct direction.
- **PASS — DNA-6 (kebab-case).** All new filenames use kebab-case (`core.module.ts`, `compass.module.ts`, `werkstatt.module.ts`, `naming-convention.ts`).
- **PASS — DNA-51 (Werkstatt primitives).** `forgeWerkstattModule` delegates to the same handlers (`runWerkstattLockStatus`, `runWerkstattLockRecover`, `runWerkstattOperationValidate`) that enforce lock/idempotency/atomic-write helpers. No reimplementation.
- **N/A — DNA-5/17, DNA-7, DNA-8, DNA-10, DNA-23, DNA-24, DNA-25.** No new UI components, sections, pages, or manifests introduced.

### Axis C — Ecosystem fit

- **PASS — Package boundaries.** `src/` has no kernel imports; `os/` imports from kernel packages. The `src/index.ts` re-exports all OS modules, which is the correct public API surface for `@warpgogol/forge`.
- **PASS — Pipeline placement.** `forge.skill.validate` added to `PACKAGES_CHECK_PIPELINE` after `workflow.lint` — correct position for a governance validator in the workspace-level check pipeline.
- **PASS — Compass sync.** `docs/technology.xml` updated with `pkg-forge` workspace entry. `packages/AGENTS.md` updated with forge ownership row. `packages/forge/AGENTS.md` created with architecture and import rules.
- **PASS — Command lifecycle.** All 12 compass commands, 3 werkstatt commands, 3 workflow commands, 1 naming command, and 15 RFC commands registered in forge modules. Old registrations removed from `site-kernel-checks` command tables and `site-kernel-handoff` werkstatt index. Comment pointers left at old locations (`// compass.* migrated to @warpgogol/forge`).
- **PASS — Kernel config updates.** All 4 kernel.config.ts files (workspace + 3 apps) and the codegen template updated to import forge modules. `@warpgogol/forge` added to root `devDependencies` and all 3 app `dependencies`.

### Axis D — Forward-only compliance

- **FAIL — Old `rfcModule` and `workflowModule` still exported from `@warpgogol/site-kernel`.** `packages/os/site-kernel/src/index.ts:31` (`export * from "./rfc/index.ts"`) and line 69 (`export * from "./workflow/index.ts"`) still re-export the old `rfcModule` and `workflowModule`. No consumer imports them anymore (verified via grep), but their continued export creates a dual-path: a developer could accidentally `import { rfcModule } from "@warpgogol/site-kernel"` instead of `import { forgeRfcModule } from "@warpgogol/forge"`. The old `rfc.module.ts` and `workflow.module.ts` files in `packages/os/site-kernel/src/` should either be deleted or their module exports removed from the barrel.
- **PASS — No compatibility shims.** The forge modules are direct registrations, not wrappers around old modules. The `ForgeModule` interface is a clean port, not a bridge.
- **PASS — Old command registrations removed.** `createWerkstattModule` removed from `site-kernel-handoff`. `werkstatt.operation.validate` removed from `site-kernel-checks` command table. Compass commands removed from `04-content-quality.ts`. `naming.convention.lint` removed from `07-structure-naming.ts`.

### Axis E — Agent-facing clarity

- **FAIL — Stale MODULE_CONTRACT (same as Axis A/B).** An agent reading `packages/forge/os/workflow/handlers.ts` will be misled by the MODULE_CONTRACT pointing to `packages/os/site-kernel/src/workflow/handlers.ts`. This is both a DNA-42 violation and an agent-facing clarity issue.
- **PASS — Compass scaffolding on new files.** All new forge files carry MODULE_CONTRACT and CHANGE_SUMMARY blocks with correct structure.
- **PASS — No ungrounded assertions.** Code comments reference real functions, types, and RFCs.
- **PASS — Readable naming.** `forgeCoreModule`, `forgeRfcModule`, `forgeWorkflowModule`, etc. — names clearly describe what each module registers.

### Axis F — Pragmatism

- **PASS — Minimal command surface.** 4 forge commands (init, scaffold, skill.validate, port.validate) each serve distinct purposes. No command that could be a flag on another.
- **PASS — Lean contracts.** `ForgeModule` and `ForgeCommandDefinition` are minimal — only the fields needed for structural compatibility with `KernelModule`. No speculative generality.
- **PASS — Existing patterns.** The forge modules follow the exact same `register(registry) { registry.registerCommand(...) }` pattern as existing kernel modules.
- **PASS — Scope discipline.** The diff touches only what's needed for the migration — no scope creep.

### Axis G — Blind spots

- **FAIL — `forge.skill.validate` added to pipeline but currently fails.** The command reports 14 SKILL-01 violations (descriptions >200 chars), 3 SKILL-09 violations (missing PREFERENCES.md instruction), and 1 SKILL-10 violation. Adding it to `PACKAGES_CHECK_PIPELINE` will break `build:check` for the workspace. Either fix the skill content first, or add the command in warning/advisory mode, or gate it behind a flag until skills are compliant.
- **PASS — Edge cases.** `forge.init` correctly skips existing files (PREFERENCES.md, kernel.config.ts) with warnings rather than overwriting.
- **PASS — Migration path.** Existing apps' kernel.config.ts files are updated; the codegen template is updated for future apps.

### Spec compliance

| Requirement from RFC-0374 | Status | Evidence |
| --- | --- | --- |
| 17 skills relocated to packages/forge/skills/ | Done | `forge.init` synced 20 skills (17 migrated + 3 meta) |
| forge.skill.validate passes on all forge skills | Missing | 18 violations reported — SKILL-01, SKILL-09, SKILL-10 |
| Governance commands register from @warpgogol/forge | Done | All kernel.config.ts files import forge modules |
| Project-specific commands remain in packages/os/* | Done | section._, cosmic._, content.surface.* untouched |
| forge.init deploys into a fresh project | Done | Creates PREFERENCES.md, copies skills, creates docs dirs |
| skill-create and port-to-forge skills produce compliant output | Partial | Skills exist but `forge.skill.validate` fails on current content |
| Existing pipelines continue to pass after migration | Partial | `build:check` passes for tsc, but `forge.skill.validate` in pipeline will fail |
| `src/` portable (no kernel imports) | Done | Verified — `src/` imports only from `../../src/` and external deps |
| `os/` kernel-dependent | Done | `os/` imports from `@warpgogol/site-kernel` and kernel packages |
| Old modules removed/deprecated | Partial | Old registrations removed, but `rfcModule`/`workflowModule` still exported from site-kernel barrel |

### Questions for the author

1. **`forge.skill.validate` will break `build:check` — what's the plan?** The command was added to `PACKAGES_CHECK_PIPELINE` but reports 18 violations. Will you fix the skill content (trim descriptions, add PREFERENCES.md references) before merging, or add the command in warning mode first?
2. **Why are `rfcModule` and `workflowModule` still exported from `@warpgogol/site-kernel`?** The old module files and barrel re-exports remain. Should they be deleted, or is there a reason to keep them?
3. **Why do `packages/forge/os/workflow/handlers.ts` and `workflow.module.ts` have stale MODULE_CONTRACT paths?** Was the copy done without updating the Compass scaffolding, or was this an oversight?
