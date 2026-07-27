---
planId: PLAN-RFC-0392-01
rfcId: RFC-0392
date: 2026-07-19
author:
  skill: fo-idea-plan
  model: unknown
status: completed
---

# Implementation Plan: RFC-0392

## Steps

### Step 1: Create stack profile schema + loader + detector

- Create `packages/forge/src/profiles/stack-profile.ts`
- Export `StackProfile`, `ProfileFile`, `stackProfileSchema` (zod), `listStackProfiles`, `detectStack`
- Unit tests in `packages/forge/src/tests/stack-profile.test.ts`
- Validate: `pnpm --filter @wgogol/forge run build:check && pnpm --filter @wgogol/forge run test`

### Step 2: Author two stack profiles

- Create `packages/forge/profiles/astro-typescript-turborepo.yaml`
- Create `packages/forge/profiles/phaser-turborepo.yaml`
- Validate both against the zod schema in a unit test
- Validate: `pnpm --filter @wgogol/forge run build:check && pnpm --filter @wgogol/forge run test`

### Step 3: Implement `forge.scaffold` command

- Create `packages/forge/src/onboarding/scaffold-project.ts` with `runScaffoldProject`
- Register in `forgeCoreModule` with `--profile` and `--name` flags
- Refuses non-empty directories (exit 1)
- Creates workspace dirs, files, runs install commands, calls `forge.init` internally
- Export from `packages/forge/src/index.ts`
- Integration test in `packages/forge/src/tests/scaffold-project.test.ts` (temp dir, verify files created, `pnpm install --lockfile-only`)
- Validate: `pnpm --filter @wgogol/forge run build:check && pnpm --filter @wgogol/forge run test`

### Step 4: Add `--from` flag to `forge.init`

- Update `forgeCoreModule` flag spec for `forge.init` to include `from: { kind: "string", description: "..." }`
- Update `runInit` in `init.ts` to accept `from` flag
- When `--from` is provided: detect stack using `detectStack`, write detected stack into `forge.yaml` `project.stack`, report detection results
- Unit test for the `--from` path
- Validate: `pnpm --filter @wgogol/forge run build:check && pnpm --filter @wgogol/forge run test`

### Step 5: Create `fo-harvest` skill

- Create `packages/forge/skills/fo/fo-harvest/SKILL.md` with standard frontmatter
- Register in `FORGE_SKILLS` in `packages/forge/src/registry.ts`
- Run `forge.skill.validate` to verify
- Validate: `pnpm --filter @wgogol/forge run build:check`

### Step 6: Update documentation

- Update root `AGENTS.md` to mention `fo-harvest` in the skill surface
- Update `packages/forge/AGENTS.md` with stack profiles section and `forge.scaffold` command
- Update `docs/COMMANDS.md` with `forge.scaffold` command
- Commit

### Step 7: Stamp implemented + commit

- Transition RFC-0392 to `status: implemented`
- Set `implementedAt: 2026-07-19`
- Final validation: `pnpm --filter @wgogol/forge run build:check && pnpm --filter @wgogol/forge run test`
- Commit
