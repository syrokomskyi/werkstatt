---
rfcId: RFC-0374
auditId: AUDIT-RFC-0374-01
date: 2026-07-11
auditor:
  skill: wg-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0374

## Verdict: Needs revision

The RFC lays out a coherent vision for a portable feature implementation ecosystem, but contains a fundamental portability contradiction (forge depends on `@gogol/site-kernel` for the `KernelModule` type), incorrect migration source paths for 3 of 5 command families, and an unexplained partial selection of compass and naming commands. These findings are on axes C and G and must be resolved before implementation.

## Mechanical validation (rfc.validate)

Pass — `rfc.validate RFC-0374 --json` exits 0 with zero violations.

## Axis A — Structural completeness

- **FAIL — `forge.init` interactivity**: The RFC states `forge.init` "asks operator for `aiLanguage` and `documentationLanguage`" (line 221). OS commands in the kernel are non-interactive — they accept flags and produce output, they do not read from stdin or prompt the user. The RFC does not explain how `forge.init` will be interactive. Either `forge.init` must accept `--aiLanguage` and `--documentationLanguage` flags (and the interactive guidance is delegated to the `forge-bootstrap` skill), or the RFC must define a new interactivity mechanism. As written, the operational detail is missing.
- **PASS**: Decision is present tense ("The repository gains…"). CLI surface shows exact invocations. TypeScript contracts are minimal. File system responsibilities table names concrete paths. Output format documents `--json` shape. Failure modes specify exit behavior. Rollout describes migration sequence. Alternatives are honest (6 real alternatives with reasons). Risks include agent misinterpretation and migration breakage. Acceptance criteria are checkable. Implementation notes are explicit.

## Axis B — DNA alignment

- **FAIL — DNA-1 missing from `satisfies`**: The RFC establishes a new package boundary that enforces the separation between portable governance (forge) and project-specific code (site-kernel-checks, site-kernel-handoff). This directly protects DNA-1 (monorepo boundary: "Shared reusable logic lives in `packages/*`"). The RFC body explains this separation (Two-level OS section, nonGoals) but only lists DNA-2 in `satisfies`. DNA-1 should be added.
- **PASS**: DNA-2 is correctly referenced — forge is a new workspace package under `packages/*` following the existing monorepo structure.
- **PASS**: `related[]` references (RFC-0047, RFC-0078, RFC-0221, RFC-0362, RFC-0364) are relevant and not decorative.
- **PASS**: No new DNA invariant is established by this RFC.
- **PASS**: No silent conflict with existing DNA invariants.

## Axis C — Ecosystem fit

- **FAIL — Incorrect migration source paths**: The RFC states commands migrate from `packages/os/site-kernel/src/{rfc,naming,compass,werkstatt,workflow}/` (line 374). Actual locations:
  - `rfc.*` — `packages/os/site-kernel/src/rfc/rfc.module.ts` ✓
  - `workflow.*` — `packages/os/site-kernel/src/workflow/workflow.module.ts` ✓
  - `naming.*` — `packages/os/site-kernel-checks/src/command-tables/07-structure-naming.ts` ✗ (different package)
  - `compass.*` — split between `packages/os/site-kernel-checks/src/command-tables/04-content-quality.ts` and `packages/os/site-kernel/src/templates/wire/tools/modules/check.module.template.ts` ✗ (multiple locations, not a single `compass/` directory)
  - `werkstatt.*` — `packages/os/site-kernel-handoff/src/werkstatt/index.ts` ✗ (different package entirely)

  The migration plan (step 3) says "Move handler implementations" from `site-kernel/src/{rfc,naming,compass,werkstatt,workflow}/` — but 3 of 5 command families live in different packages. The migration source paths must be corrected.

- **FAIL — Incomplete command selection**: The `commands.changed` list includes only 4 of 12 compass commands (`compass.annotate`, `compass.clear`, `compass.markup.migrate`, `compass.invariant.add`) and 2 of 8 naming commands (`naming.convention.lint`, `naming.pages.lint`). The excluded commands include `compass.inventory`, `compass.validate`, `compass.changesummary.validate`, `compass.changesummary.tidy`, `compass.audit.plan`, `compass.audit.record`, `compass.audit.baseline`, `compass.audit.validate`, `naming.suffixes.lint`, `naming.layouts.lint`, `naming.components.lint`, `naming.styles.lint`, `naming.content.lint`, `naming.policy.validate`. The RFC does not explain the selection criteria. Are the excluded commands project-specific? Some appear generic (e.g., `compass.validate` validates authored source files against Compass scaffolding — this is generic governance). The RFC must either list all migrating commands with a clear criterion (generic vs. project-specific) or explain why each excluded command stays.

- **FAIL — `packagesImpacted` missing `@gogol/site-kernel-handoff`**: Werkstatt commands (`werkstatt.lock.status`, `werkstatt.lock.recover`, `werkstatt.operation.validate`) are registered in `packages/os/site-kernel-handoff/src/werkstatt/index.ts` (confirmed by grep). Migrating these commands to forge impacts `@gogol/site-kernel-handoff` — it must be listed in `packagesImpacted`.

- **FAIL — Compass sync not specific**: The RFC says "Update `docs/*.xml` Compass files for the new package topology" (line 385) but does not specify which XML files. For a workspace-scoped architectural RFC, this should list at minimum `docs/technology.xml` (new package declaration), `docs/development-plan.xml` (new workflow), and `docs/source-markup.xml` (new package source files requiring Compass scaffolding).

- **PASS — Package boundaries**: Forge is correctly placed in `packages/*`. No `apps/* → apps/*` imports proposed.
- **PASS — Pipeline placement**: `forge.skill.validate` is added to `PACKAGES_CHECK_PIPELINE` (line 448). This is the correct pipeline for workspace-scoped package checks.
- **PASS — AGENTS.md updates**: The RFC identifies root and `packages/` AGENTS.md as needing updates (line 384).
- **PASS — Command lifecycle**: `commands.proposed` lists 4 new commands; `commands.changed` lists existing registered commands that will change registering module. Internally consistent.

## Axis D — Forward-only compliance

- **PASS**: No compatibility shims, no dual paths, no legacy preservation. Commands move from their current packages to forge in one step. No backward compatibility layer.
- **PASS**: No amended RFC gets a parallel interpretation — the amendments change where skills live, not what they mean.
- **PASS**: Legacy code paths (rfc module in site-kernel) are deleted, not maintained behind a flag.

## Axis E — Agent-facing policy

- **PASS — Status gate**: RFC is `draft`. No self-authorizing language. Implementation notes correctly state "Agents MAY implement code changes ONLY when this RFC has status: accepted."
- **PASS — Governance references**: Implementation notes reference RFC-0224 (accepted→implemented), RFC-0330 (verification evidence), RFC-0334 (supersede escalation).
- **PASS — Anti-fabrication**: Acceptance criteria distinguish between code changes (agent can do) and documentation updates (agent can do). No content authoring claims.
- **PASS — Storage policy**: No cookies, no client-side persistence introduced.

## Axis F — Pragmatism

- **FAIL — `forge.port.scaffold` vs `skill-create` overlap**: The `skill-create` meta skill (line 204) "scaffolds the SKILL.md body" and the `forge.port.scaffold` command (line 236) also scaffolds skills with `--type skill`. The RFC does not explain the boundary: does `skill-create` call `forge.port.scaffold`? Is `forge.port.scaffold` only for commands (`--type command`)? If both can scaffold skills, this is command duplication. The RFC should clarify: `skill-create` is the interactive agent-facing workflow; `forge.port.scaffold` is the machine-facing OS command. `skill-create` calls `forge.port.scaffold` under the hood.

- **PASS — Minimal command surface**: `forge.init`, `forge.skill.validate`, `forge.port.validate`, `forge.port.scaffold` each earn their existence. None duplicates an existing command's scope.
- **PASS — Lean contracts**: TypeScript types are minimal — `skillFrontmatterSchema` and `ForgeSkillEntry` are the minimum needed.
- **PASS — Existing patterns**: The RFC follows the existing `KernelModule` pattern rather than inventing a new module system.
- **PASS — Scope discipline**: `appsImpacted` is empty (correct — no apps are directly impacted). `nonGoals` are explicit and meaningful (6 items, each a real exclusion).

## Axis G — Blind spots

- **FAIL — `KernelModule` type dependency contradicts portability**: The RFC's TypeScript contract (line 314) shows `import type { KernelModule } from "@gogol/site-kernel"`. This creates a hard dependency from forge to site-kernel. The RFC explicitly states forge should be "installable in any npm/TypeScript project, regardless of the project's implementation language" (line 117) and "installable in other projects via `pnpm add @gogol/forge`" (line 392). If forge imports from `@gogol/site-kernel`, it cannot be installed in a project that does not have site-kernel. The RFC acknowledges the ontology dependency (Risk #4) but does not address the site-kernel type dependency. This is the most significant architectural gap in the RFC. Resolution options: (a) extract `KernelModule` and related types into a separate `@gogol/kernel-types` package that both forge and site-kernel import; (b) define a forge-native `ForgeModule` interface that is structurally compatible with `KernelModule` (duck-typed); (c) vendor the type definition into forge with a note that it must stay compatible.

- **FAIL — No performance estimate for `forge.skill.validate`**: The RFC does not estimate the cost of `forge.skill.validate` (how many files it scans, how fast). With 20 skills, this is likely trivial, but the RFC should state it.

- **PARTIAL — Migration path for custom kernel.config.ts**: The RFC says "Update `kernel.config.ts` in all apps" (line 381) but does not address what happens if an app's `kernel.config.ts` has custom modules that import directly from `@gogol/site-kernel` for rfc/naming/compass handlers. The RFC should state whether any such direct imports exist and whether they need updating.

- **PASS — Edge cases**: `forge.init` idempotency is addressed (line 362). Empty states (new project with no skills) are implicitly handled by the registry matching files on disk.
- **PASS — Security/privacy**: No user data, PII, or external services involved.

## Questions for the author

1. How does `@gogol/forge` import `KernelModule` without depending on `@gogol/site-kernel`? The portability goal requires forge to be installable in projects without site-kernel, but the TypeScript contract shows a direct import. What is the resolution — a shared types package, a forge-native interface, or vendoring?

2. Why are only 4 of 12 `compass.*` commands and 2 of 8 `naming.*` commands listed in `commands.changed`? What is the criterion that distinguishes migrating commands (e.g., `compass.annotate`) from staying commands (e.g., `compass.validate`)? Are the staying commands project-specific, and if so, why?

3. The migration source paths list `packages/os/site-kernel/src/{rfc,naming,compass,werkstatt,workflow}/` as a single root, but naming commands are in `site-kernel-checks`, compass commands are split across two packages, and werkstatt commands are in `site-kernel-handoff`. What are the correct source paths for each command family?
