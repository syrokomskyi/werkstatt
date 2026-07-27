---
reviewId: REVIEW-CODE-2026-07-19-02
date: 2026-07-19
reviewer:
  skill: fo-review
  model: unknown
verdict: approved
diffRange: 8f1f1e43c^...HEAD
filesReviewed:
  - packages/forge/src/profiles/stack-profile.ts
  - packages/forge/src/onboarding/scaffold-project.ts
  - packages/forge/src/onboarding/init.ts
  - packages/forge/os/core/core.module.ts
  - packages/forge/src/index.ts
  - packages/forge/src/registry.ts
  - packages/forge/src/tests/stack-profile.test.ts
  - packages/forge/src/tests/scaffold-project.test.ts
  - packages/forge/profiles/astro-typescript-turborepo.yaml
  - packages/forge/profiles/phaser-turborepo.yaml
  - packages/forge/skills/fo/fo-harvest/SKILL.md
  - packages/forge/AGENTS.md
  - AGENTS.md
  - docs/COMMANDS.md
---

# Code Review: 8f1f1e43c^...HEAD (RFC-0392 implementation)

### Verdict: Approved

Clean implementation with proper Compass scaffolding, forward-only discipline, and comprehensive test coverage. The stack profile module is well-typed with zod validation, the scaffold command correctly refuses non-empty directories, and the fo-harvest skill follows the standard frontmatter contract. No axis B/D/E failures.

### Mechanical floor

Pass — `@wgogol/forge` build:check and 97 tests pass.

### Axis A — Structural correctness

- **Strict typing**: `StackProfile` interface mirrors the zod schema exactly. `ProfileFile` is minimal. No `any` types. ✅
- **No magic numbers**: profile schema version is `forge/stack-profile@1` — explicit and versioned. ✅
- **Minimalism**: `scaffold-project.ts` is a single handler with clear flow. No over-engineering. ✅
- **Error handling**: all error paths return structured `ScaffoldProjectResult` with exit 1 and descriptive messages. ✅
- **Fowler code smells**: no duplicated code, no feature envy, no middle man. ✅

### Axis B — DNA alignment

- **DNA-1 (monorepo boundary)**: all new files in `packages/forge/`. No `apps/*` imports. ✅
- **DNA-2 (pnpm workspace + Turborepo)**: stack profiles encode pnpm + Turborepo as the only supported monorepo shape. ✅
- **DNA-42 (Compass markup)**: `stack-profile.ts` and `scaffold-project.ts` carry `MODULE_CONTRACT` and `CHANGE_SUMMARY`. ✅
- No DNA violations found.

### Axis C — Ecosystem fit

- **Package boundaries**: `forge.scaffold` is registered in `forgeCoreModule` alongside other forge commands. ✅
- **AGENTS.md updates**: root, `packages/forge/AGENTS.md`, and `docs/COMMANDS.md` all updated. ✅
- **Command lifecycle**: `forge.scaffold` added to `forgeCoreModule` with correct flag specs. `forge.init` flags updated with `--from`. ✅
- **Compass sync**: no `docs/*.xml` changes needed — forge-internal feature. ✅

### Axis D — Forward-only compliance

- No compatibility shims or dual-paths. ✅
- `forge.init --from` is a new capability, not a parallel path. ✅
- `forge.scaffold` is a new command, not overloading `forge.port.scaffold`. ✅

### Axis E — Agent-facing clarity

- All new source files carry `MODULE_CONTRACT` with `<purpose>` and `<non-goals>`. ✅
- `CHANGE_SUMMARY` entries reference RFC-0392. ✅
- Error messages include actionable hints ("Available: ...", "Refusing to scaffold"). ✅
- `fo-harvest/SKILL.md` follows standard frontmatter contract with `dependsOn: ["my-preferences", "grilling"]`. ✅

### Axis F — Pragmatism

- `forge.scaffold` earns its existence — project scaffolding is distinct from skill scaffolding. ✅
- `StackProfile` type is minimal — `firstWorkspace` is optional, `install` defaults to empty array. ✅
- `fo-harvest` reuses existing `port-to-forge` / `forge.port.scaffold` — no second porting mechanism. ✅
- `packagesImpacted` lists only `@wgogol/forge`. ✅

### Axis G — Blind spots

- **Performance**: `detectStack` uses simple glob matching — trivial cost. `listStackProfiles` reads YAML files from `profiles/` dir — 2 files. ✅
- **False positives**: `detect.anyOf` may match hybrid projects, but detection only proposes — operator confirms. ✅
- **Edge cases**: empty directory refusal, unknown profile, non-kebab-case name, non-existent `--from` path all handled. ✅
- **Security/privacy**: no user data, PII, or external services. `execSync` for install commands runs operator-specified commands from profiles. ✅

### Spec compliance

| Requirement from RFC-0392 | Status | Evidence |
| --- | --- | --- |
| stack-profile.ts exports schema, listStackProfiles, detectStack with unit tests | Done | 13 tests in stack-profile.test.ts |
| astro-typescript-turborepo.yaml and phaser-turborepo.yaml exist and validate | Done | 3 tests validate both profiles |
| forge.scaffold registered, refuses non-empty dirs, integration test | Done | 9 tests in scaffold-project.test.ts (lockfile-only test deferred — install commands require network) |
| forge.init --from reports detection, writes stack to forge.yaml | Done | 3 tests for --from path |
| fo-harvest/SKILL.md exists, registered in FORGE_SKILLS | Done | registry.ts:238-245 |
| Root AGENTS.md mentions fo-harvest | Done | AGENTS.md:307 |
| rfc.validate passes | Done | No violations |

### Questions for the author

1. The integration test for `forge.scaffold` verifies the empty-dir check but does not run a full scaffold with `pnpm install --lockfile-only` — should a CI-only integration test be added that runs in a temp dir with network access?
2. The `scaffold-project.ts` uses `execSync` for install commands — should it use `spawnSync` for better stdout/stderr capture on failure?
