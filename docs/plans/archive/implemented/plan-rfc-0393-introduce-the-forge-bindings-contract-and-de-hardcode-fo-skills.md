---
planId: PLAN-RFC-0393-01
rfcId: RFC-0393
date: 2026-07-19
author:
  skill: fo-idea-plan
  model: unknown
status: completed
---

# Implementation Plan: RFC-0393

## Steps

### Step 1: Extend config schema with ForgeBindings + resolveBinding

- Add `ForgeBindings` interface and `forgeBindingsSchema` (zod) to `packages/forge/src/config/forge-config.ts`
- Implement `resolveBinding(config, key)` with placeholder substitution (`{id}`, `{workspace}`, `{file}`)
- Update `forgeConfigSchema` to use `forgeBindingsSchema` instead of `z.record(z.unknown())`
- Export `ForgeBindings`, `forgeBindingsSchema`, `resolveBinding` from `index.ts`
- Unit tests: resolved / absent / invalid / placeholder substitution
- Validate: `pnpm --filter @wgogol/forge run build:check && pnpm --filter @wgogol/forge run test`

### Step 2: Write WGogol bindings in forge.yaml

- Add `bindings:` section to root `forge.yaml` with:
  - commands: validateRfc, validateAdr, typecheck, test, scopedBuild, specValidate
  - paths: invariantsFile (docs/architecture-dna.md), compassDocs (docs/\*.xml), reviewsDir, handoffsDir
  - terminology: { invariants: "DNA" }
- Validate: `pnpm --filter @wgogol/forge run build:check`

### Step 3: Add binding resolution docs to fo-pipeline-conventions.md

- Add "Binding resolution and degradation" section to `packages/forge/skills/_shared/fo-pipeline-conventions.md`
- Document: how to resolve `ref(forge.yaml bindings.*)`, degradation contract, `Degraded:` report line format
- Commit

### Step 4: Rewrite fo-\* skills (batched by pipeline stage)

- Group A (idea): fo-idea, fo-idea-create-rfc, fo-idea-create-adr, fo-idea-audit, fo-idea-enhance, fo-idea-plan
- Group B (implement): fo-idea-implement, fo-review, fo-fix
- Group C (support): fo-doc-audit, fo-architecture, fo-handoff, fo-triage, fo-qa, fo-harvest
- Group D (meta/orchestrator): fo-idea-status, fo-idea-i-just-want-to-see-the-plan, fo-idea-i-just-want-to-see-the-result, fo-add-tests
- For each group: replace hardcoded `pnpm exec werkstatt run ...`, `docs/architecture-dna.md`, `@gogol/` with binding refs
- Add `bindings:` frontmatter to each skill
- One commit per group
- Validate after each group: `pnpm --filter @wgogol/forge run build:check`

### Step 5: Add SKILL-11 to forge.skill.validate

- Add SKILL-11 rule: scan canonical skill bodies for `pnpm exec site-kernel`, `docs/architecture-dna.md`, `@gogol/` in instruction lines (code blocks and "run:" directives)
- Support `<!-- skill-lint-disable SKILL-11 -->` escape hatch
- Update `skillFrontmatterSchema` to accept optional `bindings` field
- Validate: `pnpm --filter @wgogol/forge run build:check && pnpm --filter @wgogol/forge run test`

### Step 6: Extend forge.doctor with bindings validation

- Add bindings validation to `runDoctor`: resolve all binding keys, check path existence for non-null paths
- Report `resolved` / `absent` / `invalid` in output
- Unit tests for bindings validation
- Validate: `pnpm --filter @wgogol/forge run build:check && pnpm --filter @wgogol/forge run test`

### Step 7: Extend forge.agents.generate with Capabilities section

- Update `runAgentsGenerate` to render a "Capabilities" section from resolved bindings
- Validate: `pnpm --filter @wgogol/forge run build:check`

### Step 8: Add DNA invariant + update docs

- Add new DNA invariant to `docs/architecture-dna.md`: "Forge bindings contract"
- Extend RFC-0393 `satisfies[]` with the new DNA id
- Update root `AGENTS.md` with bindings contract documentation
- Update `packages/forge/AGENTS.md` with bindings section
- Redeploy skills to `.agents/skills/`
- Commit

### Step 9: Stamp implemented + final validation

- Transition RFC-0393 to `status: implemented`
- Set `implementedAt: 2026-07-19`
- Final validation: `pnpm --filter @wgogol/forge run build:check && pnpm --filter @wgogol/forge run test`
- Commit
