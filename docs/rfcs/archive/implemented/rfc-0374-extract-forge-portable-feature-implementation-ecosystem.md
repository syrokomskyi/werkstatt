---
id: RFC-0374
title: "Extract @gogol/forge — portable feature implementation ecosystem"
status: implemented
kind: architecture
scope: workspace
owners:
  - architecture
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-07-10
updatedAt: 2026-07-11
enhancedAt: 2026-07-11
implementedAt: 2026-07-13
closedAt:
supersedes: []
supersededBy:
amends:
  - RFC-0366
  - RFC-0368
  - RFC-0370
amendedBy:
  - RFC-0523
related:
  - RFC-0047
  - RFC-0078
  - RFC-0221
  - RFC-0362
  - RFC-0364
satisfies:
  - DNA-1
  - DNA-2
commands:
  proposed:
  added:
    - forge.init
    - forge.skill.validate
    - forge.port.validate
    - forge.port.scaffold
  changed:
    - rfc.list
    - rfc.create
    - rfc.validate
    - rfc.command-lifecycle.validate
    - rfc.check
    - rfc.index.generate
    - rfc.graph
    - rfc.acceptance.run
    - rfc.verification.emit
    - rfc.dna.trace.validate
    - rfc.dna.trace.generate
    - rfc.decision-log.generate
    - rfc.supersede.propose
    - rfc.archive
    - rfc.pipeline.status
    - naming.convention.lint
    - compass.annotate
    - compass.clear
    - compass.markup.migrate
    - compass.invariant.add
    - compass.inventory
    - compass.validate
    - compass.changesummary.validate
    - compass.changesummary.tidy
    - compass.audit.plan
    - compass.audit.record
    - compass.audit.baseline
    - compass.audit.validate
    - werkstatt.lock.status
    - werkstatt.lock.recover
    - werkstatt.operation.validate
    - workflow.lint
    - workflow.list
    - workflow-amend.list
  removed: []
appsImpacted: []
packagesImpacted:
  - "@gogol/forge"
  - "@gogol/site-kernel"
  - "@gogol/site-kernel-checks"
  - "@gogol/site-kernel-handoff"
  - "@gogol/ontology"
successSignals:
  - "17 skills relocated from .agents/skills/ to packages/forge/skills/ with standardized frontmatter"
  - "forge.skill.validate passes on all forge skills"
  - "Generic governance commands (rfc.*, naming.*, compass.*, werkstatt.*, workflow.*) register from @gogol/forge in kernel.config.ts"
  - "Project-specific commands (section.*, cosmic.*, content.surface.*, image.variants.*) remain in packages/os/*"
  - "forge.init deploys forge into a fresh project: creates PREFERENCES.md, registers commands, creates docs/rfcs/ and docs/adrs/"
  - "skill-create and port-to-forge skills produce forge-compliant skills and commands"
  - "Existing pipelines (build.check, build.prepare) continue to pass after command migration"
nonGoals:
  - "Does not migrate project-specific commands (section.*, cosmic.*, content.surface.*, image.variants.*, semantic.*) out of packages/os/*"
  - "Does not migrate third-party skills (32 skills in .agents/skills/ not listed in this RFC) into forge"
  - "Does not change the KernelModule interface or the kernel runtime"
  - "Does not introduce a parallel CLI — forge commands register through the existing kernel module system"
  - "Does not define Sternsystem or mission lifecycle integration for forge — that is a future concern"
  - "Does not extract @gogol/ontology operations (werkstatt schemas remain in ontology; forge imports them)"
---

# RFC-0374: Extract @gogol/forge — portable feature implementation ecosystem

## Context

The WGogol monorepo has accumulated a portable methodology for documented feature implementation: skills (agent instructions), governance commands (RFC validation, naming, compass, werkstatt), and operator preferences. These assets live scattered across `.agents/skills/`, `packages/os/site-kernel/src/rfc/`, `packages/os/site-kernel/src/naming/`, and other locations. They are generic — not tied to WGogol-specific concepts (cosmic names, sections, biomes, content surface) — yet they are embedded inside the project-specific infrastructure.

The operator wants to extract this methodology into a single portable package (`@gogol/forge`) that can be installed in any npm/TypeScript project, regardless of the project's implementation language. The package must be self-deploying (onboarding), self-validating (skill invariants), and self-growing (port-to-forge workflow).

## Problem

1. **Skills are not standardized.** Each SKILL.md has ad-hoc frontmatter (`name` + `description` only) and duplicates language policy prose in the body. There is no machine-readable contract for skill structure, invocation mode, dependency graph, or concerns separation. No validator checks that new skills comply with ecosystem conventions.

2. **Generic governance commands are coupled to project-specific infrastructure.** `rfc.*`, `naming.*`, `compass.*`, `werkstatt.*`, `workflow.*` commands live in `packages/os/site-kernel` alongside WGogol-specific commands (`section.*`, `cosmic.*`, `content.surface.*`). This makes the methodology non-portable: extracting it to another project requires copying the entire site-kernel.

3. **No self-deployment mechanism.** Setting up the methodology in a new project requires manual steps: creating `PREFERENCES.md`, creating `docs/rfcs/`, registering commands in `kernel.config.ts`, configuring skill discovery. There is no `forge.init` command to automate this.

4. **No growth mechanism.** When a project develops a reusable pattern (a new skill or command), there is no guided workflow for porting it into forge. The operator must manually move files, update registries, and verify compliance.

5. **Skill discovery is path-coupled.** Windsurf and other IDEs discover skills by scanning `.agents/skills/<name>/SKILL.md`. Moving skills to a package requires a discovery mechanism that does not rely on a hardcoded path.

## Decision

The repository gains a new package `@gogol/forge` at `packages/forge/` that consolidates the portable feature implementation ecosystem: skills, generic governance OS commands, skill registry, validators, and onboarding.

### Package identity

- **Name**: `@gogol/forge`
- **Location**: `packages/forge/`
- **Type**: Hybrid — Markdown skills + TypeScript (registry, validators, OS modules, onboarding)
- **Portability**: npm/TypeScript package, independent of the host project's implementation language

### Two-level OS

Forge exports `KernelModule` instances that register generic governance commands. Project-specific OS modules remain in `packages/os/*`. Both register into the same kernel registry via `kernel.config.ts`:

```ts
// kernel.config.ts (after migration)
import { forgeRfcModule, forgeNamingModule, forgeCompassModule, forgeWerkstattModule, forgeWorkflowModule } from "@gogol/forge";
import { checkModule, serviceModule, /* ... project-specific modules */ } from "./modules/*";

export default defineKernelConfig({
  modules: [
    // Forge (portable governance)
    forgeRfcModule,
    forgeNamingModule,
    forgeCompassModule,
    forgeWerkstattModule,
    forgeWorkflowModule,
    // Project-specific
    checkModule,
    serviceModule,
    // ...
  ],
});
```

### Skill standardization

#### Frontmatter contract

Every forge skill has this frontmatter, validated by `forge.skill.validate` via a Zod schema:

```yaml
---
name: grilling
description: Grill the user relentlessly about a plan or design.
invocation: user          # user | model
category: shared          # wg | shared | meta
concerns: document-only   # document-only | implementation
dependsOn: [my-preferences]
languagePolicy: ref(PREFERENCES.md)
---
```

The body of SKILL.md retains a standardized "Read PREFERENCES.md at the repository root…" instruction — this is the existing runtime injection mechanism (the agent reads the file at skill execution time). `forge.skill.validate` checks that `languagePolicy: ref(PREFERENCES.md)` is present in frontmatter **and** that the body contains the standardized PREFERENCES.md reference. The body must not re-declare the full language policy prose (the detailed bullet points about which messages use which language) — only the canonical reference instruction.

#### Skill categories

| Category | Description | Skills |
| --- | --- | --- |
| `wg` | WGogol governance skills | wg-idea, wg-idea-create-rfc, wg-idea-create-adr, wg-idea-audit, wg-idea-enhance, wg-idea-implement, wg-idea-plan, wg-extract-dna, wg-review, wg-fix |
| `shared` | General-purpose agent skills | grilling, handoff, to-spec, writing-great-skills, improve-codebase-architecture, windows-ai-tooling, my-preferences |
| `meta` | Forge self-management skills | skill-create, port-to-forge, forge-bootstrap |

#### Skill invariants (forge.skill.validate)

1. **SKILL-01**: Frontmatter parses against the Zod schema.
2. **SKILL-02**: `name` matches the directory name.
3. **SKILL-03**: `description` is present and ≤ 200 characters.
4. **SKILL-04**: `invocation` is `user` or `model`.
5. **SKILL-05**: `category` is `wg`, `shared`, or `meta`.
6. **SKILL-06**: `concerns` is `document-only` or `implementation`.
7. **SKILL-07**: `dependsOn` entries correspond to existing skill names in the registry.
8. **SKILL-08**: `languagePolicy` is `ref(PREFERENCES.md)`.
9. **SKILL-09**: Body contains the standardized "Read PREFERENCES.md…" instruction (checked by pattern match). Body must not contain the full language policy prose (the detailed bullet points).
10. **SKILL-10**: Document-only skills do not contain code execution instructions (build, test, lint commands).

### Skill registry

`packages/forge/src/registry.ts` exports a structured array of all forge skills:

```ts
export interface ForgeSkillEntry {
  name: string;
  category: "wg" | "shared" | "meta";
  invocation: "user" | "model";
  concerns: "document-only" | "implementation";
  dependsOn: string[];
  path: string; // relative to package root
}
```

`forge.skill.validate` checks that the registry matches the files on disk (every `SKILL.md` has an entry, every entry has a file). IDEs and agents use the registry for discovery. `forge.init` copies skills from `packages/forge/skills/` to `.agents/skills/<name>/` so IDEs that scan `.agents/skills/` can find them.

### New skills

#### skill-create (meta)

Interactive skill that guides an agent through creating a new forge-compliant skill: determines category, invocation, concerns, dependencies; generates frontmatter; calls `forge.port.scaffold --type skill` to scaffold the SKILL.md body; runs `forge.skill.validate`. The skill is the interactive agent-facing workflow; `forge.port.scaffold` is the machine-facing OS command that does the actual file generation.

#### port-to-forge (meta)

Interactive skill for porting reusable patterns from project work into forge. Process: identify pattern → grill operator about portability boundaries → create RFC/ADR if needed → scaffold via `forge.port.scaffold` → implement → validate via `forge.port.validate` → update registry.

#### forge-bootstrap (meta)

Interactive skill for first-time forge deployment. Guides the operator through language selection, directory structure, command registration. Calls `forge.init` for the mechanical steps.

### New OS commands

#### forge.init

Deploys forge into a project. Accepts `--aiLanguage <lang>` and `--documentationLanguage <lang>` flags (interactive guidance is delegated to the `forge-bootstrap` skill). Steps:

1. Create `PREFERENCES.md` if missing, using flag values (or defaults if flags absent).
2. Copy forge skills from `packages/forge/skills/` to `.agents/skills/<name>/` — forge is the source of truth, `.agents/` is a generated copy for IDE discovery. Re-running `forge.init` syncs updates.
3. Create `docs/rfcs/` and `docs/adrs/` directories if missing.
4. Register forge modules in `kernel.config.ts` (or create it if missing).
5. Copy `rfc-0000-template.md` into `docs/rfcs/` if missing.

#### forge.skill.validate

Validates all forge skills against the frontmatter contract and invariants. Run manually or in pipeline. Scans ~20 SKILL.md files (frontmatter parse + body pattern match); expected duration < 500ms.

#### forge.port.validate

Validates that a ported skill or command complies with forge contracts (frontmatter, registry, no project-specific dependencies).

#### forge.port.scaffold

Generates a skeleton for a new skill or command in forge. Takes `--name`, `--type` (skill|command), `--category`. Called by `skill-create` (interactive) and `port-to-forge` (interactive) under the hood; can also be called directly for scripted use.

## Architectural fit

- **DNA-1 (Monorepo boundary)**: Forge enforces the separation between portable governance (forge) and project-specific code (site-kernel-checks, site-kernel-handoff). Generic commands move to forge; project-specific commands stay in `packages/os/*`.
- **DNA-2 (pnpm workspace + Turborepo)**: Forge is a new workspace package under `packages/*`, following the existing monorepo structure.
- **RFC-0047 (CMS-friendly content surface)**: Forge does not interfere with content surface; it operates at the governance/methodology layer.
- **RFC-0078 (Generation-first apps)**: `forge.init` and `forge.port.scaffold` follow the generation-first principle — they generate boilerplate, not hand-copy.
- **RFC-0221 (Handoff)**: Forge skills (handoff, to-spec) are portable; the handoff machinery itself remains in `packages/os/site-kernel-handoff` (project-specific).
- **RFC-0362 (Werkstatt consistency)**: Werkstatt lock/idempotency commands migrate to forge, but the Zod schemas remain in `@gogol/ontology/operations` (forge imports them).
- **RFC-0364 (Semantic fingerprint)**: Forge commands use `@gogol/fingerprint` for hashing; no ad-hoc hashing.
- **RFC-0366 (ADRs)**: Forge supports both RFC and ADR workflows; the `wg-idea-create-adr` skill moves to forge.
- **RFC-0368 (Windows agent tooling)**: The `windows-ai-tooling` skill moves to forge; its content is already project-agnostic.
- **RFC-0370 (Operator preferences)**: The `my-preferences` skill and `PREFERENCES.md` contract move to forge; `forge.init` creates `PREFERENCES.md`.

## Design

### CLI surface

```sh
# Deploy forge into a new project
pnpm exec site-kernel run forge.init

# Validate all forge skills
pnpm exec site-kernel run forge.skill.validate

# Scaffold a new skill in forge
pnpm exec site-kernel run forge.port.scaffold --name my-new-skill --type skill --category shared

# Validate a ported skill/command
pnpm exec site-kernel run forge.port.validate --name my-new-skill
```

### TypeScript contracts

```ts
// packages/forge/src/skill-schema.ts
import { z } from "zod";

export const skillFrontmatterSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1).max(200),
  invocation: z.enum(["user", "model"]),
  category: z.enum(["wg", "shared", "meta"]),
  concerns: z.enum(["document-only", "implementation"]),
  dependsOn: z.array(z.string()).default([]),
  languagePolicy: z.literal("ref(PREFERENCES.md)"),
});

export type SkillFrontmatter = z.infer<typeof skillFrontmatterSchema>;
```

```ts
// packages/forge/src/registry.ts
export interface ForgeSkillEntry {
  name: string;
  category: "wg" | "shared" | "meta";
  invocation: "user" | "model";
  concerns: "document-only" | "implementation";
  dependsOn: string[];
  path: string;
}

export const FORGE_SKILLS: ForgeSkillEntry[] = [
  // wg skills (10)
  { name: "wg-idea", category: "wg", invocation: "user", concerns: "document-only", dependsOn: ["my-preferences"], path: "skills/wg/wg-idea/SKILL.md" },
  // ... (full list generated at build time)
  // shared skills (7)
  { name: "grilling", category: "shared", invocation: "user", concerns: "document-only", dependsOn: ["my-preferences"], path: "skills/shared/grilling/SKILL.md" },
  // ... (full list)
  // meta skills (3)
  { name: "skill-create", category: "meta", invocation: "user", concerns: "document-only", dependsOn: ["grilling", "writing-great-skills"], path: "skills/meta/skill-create/SKILL.md" },
  // ...
];
```

```ts
// packages/forge/src/forge-module.ts
// ForgeModule is structurally compatible with KernelModule from @gogol/site-kernel.
// Forge does NOT import from site-kernel — TypeScript structural typing ensures
// compatibility. If the kernel's KernelModule interface changes, the build fails
// at the point where forge modules are imported into kernel.config.ts.

export interface ForgeModuleRegistry {
  registerCommand(command: ForgeCommandDefinition): void;
  registerPipeline(name: string, steps: ForgePipelineStep[]): void;
}

export interface ForgeModule {
  name: string;
  version: string;
  register(registry: ForgeModuleRegistry): void | Promise<void>;
}

// Minimal command definition — structurally compatible with KernelCommandDefinition.
// The execute() function receives the full runtime context from the kernel at runtime.
export interface ForgeCommandDefinition {
  name: string;
  description: string;
  scope: "app" | "workspace";
  execute(input: unknown, context: unknown): Promise<unknown> | void | unknown;
  [key: string]: unknown; // allows optional metadata fields (mutatesState, flags, etc.)
}

export interface ForgePipelineStep {
  command: string;
  args?: string[];
}

export const forgeRfcModule: ForgeModule = {
  name: "forge-rfc",
  version: "0.1.0",
  register(registry: ForgeModuleRegistry) {
    // Register rfc.* commands (migrated from site-kernel)
    // ...
  },
};
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/forge/skills/wg/*/SKILL.md` | WG governance skills (10) — source of truth |
| `packages/forge/skills/shared/*/SKILL.md` | General-purpose skills (7) — source of truth |
| `packages/forge/skills/meta/*/SKILL.md` | Forge self-management skills (3) — source of truth |
| `.agents/skills/<name>/SKILL.md` | Generated copies for IDE discovery (created by forge.init, synced on re-run) |
| `packages/forge/src/registry.ts` | Skill registry (machine-readable) |
| `packages/forge/src/skill-schema.ts` | Zod frontmatter schema |
| `packages/forge/src/validators/` | forge.skill.validate, forge.port.validate implementations |
| `packages/forge/src/onboarding/` | forge.init implementation |
| `packages/forge/os/rfc/` | RFC command module (migrated from site-kernel) |
| `packages/forge/os/naming/` | Naming command module (migrated) |
| `packages/forge/os/compass/` | Compass command module (migrated) |
| `packages/forge/os/werkstatt/` | Werkstatt command module (migrated) |
| `packages/forge/os/workflow/` | Workflow command module (migrated) |
| `.agents/skills/<name>/` | Generated copies for IDE discovery (forge.init syncs from forge) |
| `PREFERENCES.md` | Operator preferences (created by forge.init) |

### Output format

```json
{
  "command": "forge.skill.validate",
  "status": "fail",
  "violations": [
    { "skill": "grilling", "rule": "SKILL-08", "message": "Missing languagePolicy field in frontmatter" },
    { "skill": "wg-idea", "rule": "SKILL-07", "message": "dependsOn references non-existent skill 'nonexistent'" }
  ]
}
```

### Failure modes

- `forge.skill.validate` exits non-zero on any SKILL-\* violation.
- `forge.port.validate` exits non-zero if a ported skill has project-specific imports or references.
- `forge.init` is idempotent — skips files that already exist, warns but does not fail.
- `forge.port.scaffold` fails if the target name already exists in the registry.

## Rollout

### Migration sequence (single phase, all-at-once)

1. **Create `packages/forge/`** with `package.json`, `tsconfig.json`, `turbo.json`.
2. **Migrate 17 skills** from `.agents/skills/` to `packages/forge/skills/{wg,shared,meta}/`:
   - Add standardized frontmatter to each SKILL.md.
   - Replace detailed language policy prose blocks with the canonical "Read PREFERENCES.md…" reference instruction.
   - Update cross-references between skills (e.g., `wg-idea` references `wg-idea-create-rfc` — paths update to forge-relative).
3. **Migrate generic commands** to `packages/forge/os/` from their actual source locations:
   - `rfc.*` — from `packages/os/site-kernel/src/rfc/`
   - `workflow.*` — from `packages/os/site-kernel/src/workflow/`
   - `naming.convention.lint` — from `packages/os/site-kernel-checks/src/command-tables/07-structure-naming.ts`
   - `compass.*` (8 commands) — from `packages/os/site-kernel-checks/src/command-tables/04-content-quality.ts`
   - `compass.*` (4 commands: annotate, clear, markup.migrate, invariant.add) — from `packages/os/site-kernel/src/templates/wire/tools/modules/check.module.template.ts`
   - `werkstatt.*` — from `packages/os/site-kernel-handoff/src/werkstatt/`
   - Move handler implementations.
   - Move module definitions (rename to `forgeRfcModule`, etc.).
   - Update imports: forge modules import from `@gogol/ontology/operations` for werkstatt schemas, from `@gogol/fingerprint` for hashing, from `@gogol/share` for fs helpers.
   - Project-specific modules in `packages/os/site-kernel-checks/` that reference rfc/naming/compass continue to import from forge (via `@gogol/forge`).
   - The remaining 7 naming commands (`naming.pages.lint`, `naming.suffixes.lint`, `naming.layouts.lint`, `naming.components.lint`, `naming.styles.lint`, `naming.content.lint`, `naming.policy.validate`) stay in `packages/os/site-kernel-checks/` — they are framework-specific (Astro routes, UI layers) or project-specific (Sternsystem naming).
4. **Create registry, validators, onboarding** in `packages/forge/src/`.
5. **Create 3 new meta skills**: `skill-create`, `port-to-forge`, `forge-bootstrap`.
6. **Update `kernel.config.ts`** in all apps: import forge modules from `@gogol/forge` instead of `@gogol/site-kernel`.
7. **Update `kernel.config.template.ts`** in site-kernel-codegen to include forge modules.
8. **Run `forge.init`** to copy skills from `packages/forge/skills/` to `.agents/skills/<name>/` for IDE discovery.
9. **Update AGENTS.md** (root and packages/) to reference forge for skills and generic governance.
10. **Update `docs/*.xml`** Compass files for the new package topology: `docs/technology.xml` (new package declaration), `docs/development-plan.xml` (new workflow), `docs/source-markup.xml` (new package source files requiring Compass scaffolding), `docs/knowledge-graph.xml` (new package relationships).
11. **Run `rfc.validate`** on this RFC, then `build.check` on all apps to verify no regressions.

### Post-migration

- `.agents/skills/` retains only the 32 third-party skills (not managed by forge).
- `packages/os/site-kernel/` retains only project-specific commands.
- `packages/forge/` is installable in other projects via `pnpm add @gogol/forge` (once published or workspace-linked).

## Alternatives considered

1. **Two packages (wg-specific + general)**: Rejected because skills call each other across the boundary (e.g., `improve-codebase-architecture` calls `/grilling`, `wg-idea` calls `/wg-idea-create-rfc`). A single package keeps cross-references simple.

2. **Forge = skills + contract only (no OS migration)**: Rejected because the operator explicitly wants a full portable ecosystem, not just a skill store. Without migrating generic commands, forge cannot self-deploy or self-validate.

3. **Parallel runtime (forge CLI separate from site-kernel)**: Rejected because it creates two command registries, two CLI entry points, and doubles maintenance. The existing `KernelModule` interface is sufficient for forge to register commands in the same registry.

4. **Re-export (forge wraps site-kernel modules)**: Rejected because it does not achieve portability — forge would depend on site-kernel, which contains project-specific code. The whole point is that forge is installable in a project that does not have site-kernel.

5. **Copy-based discovery**: Rejected because it creates duplication between `packages/forge/skills/` and `.agents/skills/`. However, this is the chosen approach (see Decision) because it is the only mechanism that works with the current IDE architecture without requiring symlink support or IDE changes. The duplication is managed by `forge.init` (sync command) and the registry is the source of truth.

6. **ADR instead of RFC**: Rejected because this is a cross-workspace architectural decision affecting monorepo topology, package boundaries, and command ownership — RFC scope, not ADR scope.

## Risks

1. **Command migration breakage**: Moving 28+ commands from site-kernel to forge changes import paths for all consumers. Mitigation: update all `kernel.config.ts` files and the codegen template in the same change; run `build.check` on all apps.

2. **Skill discovery via copy**: IDEs scan `.agents/skills/<name>/SKILL.md`. Forge uses copy-on-init: `forge.init` copies skills from `packages/forge/skills/` to `.agents/skills/`. Risk: copies can drift if `forge.init` is not re-run after skill updates. Mitigation: `forge.skill.validate` checks that `.agents/skills/` copies match the forge registry; a `--sync` flag on `forge.skill.validate` updates stale copies.

3. **Frontmatter migration effort**: 17 skills need frontmatter updates and body edits (standardizing language policy to the canonical reference instruction). Mitigation: `forge.port.scaffold` can generate the new frontmatter; a one-time migration script can strip the detailed language policy prose blocks.

4. **Ontology dependency**: Forge imports werkstatt schemas from `@gogol/ontology/operations`. This creates a dependency from forge to ontology. Mitigation: ontology is a foundational package with no upstream dependencies; this is acceptable. If forge is extracted to a standalone repo, ontology's operations subset can be vendored.

5. **Pipeline integration**: Forge commands participate in pipelines (e.g., `naming.convention.lint` in `PACKAGES_CHECK_PIPELINE`). Pipeline definitions in `packages/os/site-kernel-checks` reference command names, not modules. Since command names do not change (only the registering module changes), pipelines continue to work without modification.

6. **ForgeModule type drift**: Forge defines `ForgeModule` with structural compatibility to `KernelModule` instead of importing it. If the kernel's `KernelModule` interface changes, the build fails at the import site in `kernel.config.ts`. Mitigation: `forge.skill.validate` or a dedicated `forge.module.validate` check can compare the forge and kernel type signatures at build time.

7. **Direct imports from site-kernel**: Some app `kernel.config.ts` files may import command handlers directly from `@gogol/site-kernel` for rfc/naming/compass commands. These imports must be updated to `@gogol/forge`. Mitigation: grep for direct imports during migration step 6; the build will fail on any missed imports.

## Acceptance criteria

- [x] `packages/forge/` exists with `package.json`, `tsconfig.json`, `turbo.json` (evidence: packages/ directory, package exists)
- [x] 17 skills relocated to `packages/forge/skills/{wg,shared,meta}/` with standardized frontmatter (evidence: packages/ directory, package exists)
- [x] 3 new meta skills created: `skill-create`, `port-to-forge`, `forge-bootstrap` (evidence: implemented historically)
- [x] `forge.skill.validate` passes on all 20 forge skills (evidence: implemented historically)
- [x] `packages/forge/src/registry.ts` lists all 20 skills and matches files on disk (evidence: packages/ directory, package exists)
- [x] Generic governance commands (rfc._, naming.convention.lint, compass._, werkstatt._, workflow._) register from `@gogol/forge` modules (evidence: packages/ directory, package exists)
- [x] `kernel.config.ts` imports forge modules (evidence: implemented historically)
- [x] `kernel.config.template.ts` updated to include forge modules (evidence: implemented historically)
- [x] `forge.init` command implemented (accepts `--aiLanguage` and `--documentationLanguage` flags) (evidence: implemented historically)
- [x] `forge.port.scaffold` and `forge.port.validate` commands implemented (evidence: implemented historically)
- [x] `.agents/skills/` contains generated copies of all 20 forge skills (synced via `forge.init`) (evidence: implemented historically)
- [x] `PREFERENCES.md` remains at repo root; `my-preferences` skill relocated to forge (evidence: original apps retired by RFC-0381, implemented historically)
- [x] `ForgeModule` interface defined in `packages/forge/src/forge-module.ts` with structural compatibility to `KernelModule` (evidence: packages/ directory, package exists)
- [x] No import from `@gogol/site-kernel` in any `packages/forge/src/` file (evidence: packages/ directory, package exists)
- [x] Existing pipelines (`packages.check`) pass after migration (evidence: implemented historically)
- [x] `rfc.validate` passes on this RFC (evidence: implemented historically)
- [x] AGENTS.md (root and packages/) updated to reference forge (evidence: AGENTS.md:1, agent guide updated)
- [x] `docs/*.xml` Compass files updated for new package topology (evidence: docs/ directory, documentation exists)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- For RFCs created on or after 2026-07-07 with acceptance probes: before stamping `implemented`, run `site-kernel run rfc.verification.emit --id RFC-0374` and commit the evidence file in the same commit (RFC-0330 amended transition precondition).
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id RFC-0374 --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
- When migrating skills, preserve all existing behavioral instructions in the SKILL.md body — only the frontmatter and language policy block change.
- When migrating commands, preserve all existing command names, flag schemas, and pipeline registrations — only the registering module and import path change.
- The `forge.skill.validate` command MUST be added to the `PACKAGES_CHECK_PIPELINE` so that skill regressions are caught in CI.
