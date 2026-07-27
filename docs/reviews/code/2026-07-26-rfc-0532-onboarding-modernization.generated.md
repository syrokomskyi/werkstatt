# Code Review: RFC-0532 Onboarding Modernization

- **Date:** 2026-07-26
- **Reviewer:** fo-review (automated)
- **Diff range:** `38363ee9a~1...516b63206` (8 commits)
- **RFC:** RFC-0532 — Modernize onboarding for Sternsystem architecture
- **Packages touched:** `@warpgogol/site-kernel-onboarding`, `@warpgogol/site-kernel-handoff`, `@warpgogol/forge`

## Mechanical floor

| Check | Result |
| --- | --- |
| `@warpgogol/site-kernel-onboarding` build:check | PASS |
| `@warpgogol/site-kernel-handoff` build:check | PASS |
| `@warpgogol/forge` build:check | PASS |
| `@warpgogol/site-kernel-onboarding` tests | 17/17 PASS |
| `@warpgogol/site-kernel-handoff` tests | 191/193 PASS (2 pre-existing `rfc-0483.snapshot.test.ts` failures, unrelated) |
| `rfc.validate rfc-0532` | PASS |
| `forge.skill.validate` | PASS (0 violations) |

## Axis A — Structural correctness

### A1. Dead code: `runBriefValidate` and old global path fallback

**FAIL** — `packages/os/site-kernel-onboarding/src/brief.ts:115-210`

The `runBriefValidate` function is the old `brief.validate` command handler. It is no longer registered in `module.ts` (correctly removed), but:
- It is still exported from `index.ts` (line 17 exports `BriefFrontmatter` etc. but `runBriefValidate` is not explicitly exported — however, the function remains in the file).
- No code in the monorepo imports `runBriefValidate` (grep confirms only the definition site matches).
- It still contains a fallback to the old global `onboarding/.input/00-brief.md` path at line 124:

```typescript
const briefPath = systemFlag
  ? join(context.workspaceRoot, "onboarding", systemFlag, ".input", "00-brief.md")
  : join(context.workspaceRoot, "onboarding", ".input", "00-brief.md");
```

This is dead code that violates RFC-0532 acceptance criterion: "No code in `packages/os/site-kernel-onboarding/` references ... the global `onboarding/.input/` path." The fallback branch at line 124 should be removed, and `runBriefValidate` should either be deleted or refactored to require `--system`.

**Evidence:** `packages/os/site-kernel-onboarding/src/brief.ts:115-210`, grep for `runBriefValidate` returns only the definition file.

### A2. Flag metadata mismatch in `sternsystem.module.ts`

**FAIL** — `packages/os/site-kernel-handoff/src/sternsystem/sternsystem.module.ts:37-51`

The module registers `cosmicStar` and `repo` as `required: true`, but the command handler (`sternsystem-register.ts:152-203`) only requires them in non-amend mode. When `--amend` is set, neither `cosmicStar` nor `repo` is needed. The flag metadata should reflect conditional requirement or the handler should validate accordingly.

Additionally, `amend-id` is declared as `kind: "string"` at line 48, but the handler parses it as a number via `flagNumber` at line 146. While `flagNumber` handles string-to-number coercion, the flag kind should be `number` for consistency.

**Evidence:** `sternsystem.module.ts:39-40` (`required: true` for `cosmicStar`/`repo`), `sternsystem-register.ts:152-203` (amend path doesn't use these flags), `sternsystem.module.ts:48` (`kind: "string"` for `amend-id`), `sternsystem-register.ts:146` (`flagNumber`).

### A3. Hardcoded status in return data

**PASS (minor)** — `sternsystem-register.ts:305`

The `registryEntry.status` is hardcoded to `"active"` in the return data, rather than read from the actual registry state after `runSternsystemPin`. Since `runSternsystemPin` updates the registry status to "active" (confirmed by test at line 225), this is functionally correct but fragile — if pin behavior changes, the return value could diverge from reality.

### A4. Error handling in rollback

**PASS** — `sternsystem-register.ts:314-354`

The atomic rollback correctly handles partial state: mission abort → content removal → pin removal → registry removal → system dir cleanup. Abort errors during rollback are caught and recorded as diagnostics rather than swallowed. The ordering is correct (reverse of creation order).

### A5. Minimalism and structure

**PASS** — `synthesize.ts` is well-structured with clear single responsibilities: `classifyInputFile`, `hashString`, `buildSystemInputManifest`, `runOnboardingSynthesize`. The `sternsystem-register.ts` extension follows the existing code style and delegates to existing commands rather than reimplementing logic.

## Axis B — DNA alignment

### B1. DNA-53: Semantic fingerprint governance — `createHash` in `synthesize.ts`

**FAIL** — `packages/os/site-kernel-onboarding/src/synthesize.ts:15,60,92`

DNA-53 states: "All project hashes for platform, content, release artifacts, snapshots, and generated manifests use the shared `@warpgogol/fingerprint` package. New ad hoc direct hashing helpers are forbidden outside the package."

`synthesize.ts` uses `import { createHash } from "node:crypto"` and calls `createHash("sha256")` directly at lines 60 and 92. This is a new ad hoc hashing helper introduced by this RFC.

**Mitigating factor:** Pre-existing files `amend.ts:16,153` and `amend-gates.ts:17,99` already use `createHash` directly in the same package, so this is a pre-existing pattern rather than a regression. However, the new code perpetuates the violation.

**Recommendation:** Use `byteHash` from `@warpgogol/fingerprint` instead. This requires adding `@warpgogol/fingerprint` as a dependency to `@warpgogol/site-kernel-onboarding`.

**Evidence:** `synthesize.ts:15` (`import { createHash }`), `synthesize.ts:60` (`hashString`), `synthesize.ts:92` (per-file hash).

### B2. DNA-45: Fleet registry

**PASS** — `sternsystem-register.ts:233-244` creates a complete registry entry with all DNA-45 required fields: `id`, `cosmicStar`, `repo`, `pinnedPlatform`, `currentMission`, `lastRelease`, `status`, `registeredAt`, `mirror`, `notes`. The entry is validated against existing entries for duplicate id and star collision.

### B3. DNA-46: Mission lifecycle

**PASS** — `sternsystem-register.ts:267-275` correctly delegates to `runMissionOpen` and `runMissionMaterialize` rather than reimplementing mission logic. The rollback correctly aborts the mission if materialize fails.

### B4. DNA-51: Werkstatt consistency primitives

**PASS (note)** — The RFC mentions "Werkstatt consistency primitives (DNA-51) for atomic registry mutation" but the implementation uses simple read-modify-write without explicit locking. This is acceptable for the current single-process CLI usage but may need Werkstatt locks for concurrent access. The RFC risk section acknowledges this.

## Axis C — RFC contract compliance

### C1. Acceptance criteria evidence annotations

**PASS** — All 19 acceptance criteria are marked `[x]` with inline `(evidence: ...)` annotations. `rfc.implement.stamp` passed with 0 violations after evidence was added.

### C2. Old commands removed

**PASS** — `brief.validate`, `onboarding.input.validate`, `onboarding.phase.validate`, `onboarding.scaffold`, `onboarding.checklist` are removed from `module.ts` command registrations. `phase-contract.ts`, `scaffold.ts`, `checklist.ts` are deleted.

### C3. Old workflows deleted

**PASS** — `.agents/workflows/00-prepare.md` through `06-handoff.md` and `.agents/workflows-amend/` are deleted. `onboarding/.input/` and `onboarding/.output/` are deleted.

## Axis D — Test coverage

### D1. No tests for new `sternsystem.register` functionality

**FAIL** — `packages/os/site-kernel-handoff/src/tests/sternsystem.test.ts`

The test file was not extended with tests for the new RFC-0532 functionality:
- No test for pin creation within `sternsystem.register`
- No test for content stub creation (`createContentStub`)
- No test for `mission.open` + `mission.materialize` delegation
- No test for `--amend` flag behavior
- No test for atomic rollback (failure mid-register → cleanup)
- No test for `--amend-id` flag

The existing tests only cover pre-RFC-0532 behavior (duplicate id, invalid cosmicStar, apps collision).

**Evidence:** `sternsystem.test.ts` — 8 tests, all pre-RFC-0532. No test imports `runMissionOpen` or `runMissionMaterialize`.

### D2. No tests for `onboarding.synthesize`

**FAIL** — No test file exists for `synthesize.ts`. The 17 passing tests in `@warpgogol/site-kernel-onboarding` are all in `brief.test.ts` (pre-existing). The new `onboarding.synthesize` command has no unit tests covering:
- Brief validation via `parseBriefFrontmatter`
- File hashing and manifest generation
- `classifyInputFile` classification logic
- Noop case (no `.input/` directory)
- Fail case (missing brief)

**Evidence:** `pnpm --filter @warpgogol/site-kernel-onboarding test` shows `Test Files 1 passed (1)` — only `brief.test.ts`.

## Axis E — Ecosystem fit

### E1. Package boundary

**PASS** — `sternsystem-register.ts` imports from `@warpgogol/site-kernel-onboarding` for `parseBriefFrontmatter`, which is a legitimate cross-package dependency (handoff depends on onboarding). The import is from the public API surface (`index.ts`), not internal modules.

### E2. `fo-onboard` skill registration

**PASS** — The skill is registered in `packages/forge/src/registry.ts` with correct metadata, knowledge files, and bindings. `forge.skill.validate` passes with 0 violations. Knowledge files (`learned-principles.md`, `qa-log.md`) exist and are synced to `.agents/skills/fo-onboard/`.

### E3. Documentation sync

**PASS** — `packages/os/site-kernel-onboarding/AGENTS.md` updated with new commands and paths. `packages/os/site-kernel-handoff/AGENTS.md` updated with `sternsystem.register` section. `docs/COMMANDS.md` and `docs/ecosystem.generated.yaml` regenerated.

## Axis F — Forward-only discipline

### F1. No backward compatibility shims

**PASS** — Old commands are fully removed, not deprecated. Old workflow files are deleted. Old onboarding data directories are deleted. No fallback shims or compatibility layers.

### F2. No legacy path references in new code

**FAIL** — `brief.ts:124` still contains the old global `onboarding/.input/00-brief.md` path fallback. While this is dead code (the `runBriefValidate` function is no longer registered), it violates the forward-only principle and the RFC acceptance criterion.

## Axis G — Agent-facing clarity

### G1. AGENTS.md clarity

**PASS** — Both `site-kernel-onboarding/AGENTS.md` and `site-kernel-handoff/AGENTS.md` are updated with clear, structured documentation of the new command surface, paths, and behaviors.

### G2. Skill SKILL.md clarity

**PASS** — `fo-onboard/SKILL.md` is well-structured with clear process steps, completion criteria, and constraints. The skill correctly delegates deterministic work to commands and focuses on orchestration + AI synthesis.

## Summary

| Axis | Findings |
| --- | --- |
| A — Structural | 2 FAIL (dead code + flag mismatch), 3 PASS |
| B — DNA | 1 FAIL (DNA-53 createHash), 3 PASS |
| C — RFC contract | 3 PASS |
| D — Tests | 2 FAIL (no tests for new functionality) |
| E — Ecosystem | 3 PASS |
| F — Forward-only | 1 FAIL (legacy path in dead code), 1 PASS |
| G — Agent clarity | 2 PASS |

**Total: 6 FAIL, 12 PASS**

## Recommended fixes (via `/fo-fix`)

1. **Delete `runBriefValidate`** from `brief.ts` and remove the old global path fallback at line 124. This is dead code that violates the RFC acceptance criterion.
2. **Fix flag metadata** in `sternsystem.module.ts`: make `cosmicStar` and `repo` conditionally required (not required when `--amend` is set), and change `amend-id` kind to `number`.
3. **Replace `createHash` with `@warpgogol/fingerprint` `byteHash`** in `synthesize.ts` to comply with DNA-53.
4. **Add tests** for `onboarding.synthesize` (new test file `synthesize.test.ts`).
5. **Add tests** for extended `sternsystem.register` (pin, mission, materialize, amend, rollback).
