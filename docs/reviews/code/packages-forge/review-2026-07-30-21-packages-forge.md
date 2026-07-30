---
reviewId: REVIEW-CODE-2026-07-30-01
date: 2026-07-30
reviewer:
  skill: fo-review
  model: unknown
verdict: needs-revision
diffRange: d955135...HEAD
filesReviewed:
  - packages/forge/src/onboarding/workspace-discovery.ts
  - packages/forge/src/onboarding/nested-agents-templates.ts
  - packages/forge/src/onboarding/nested-agents-generate.ts
  - packages/forge/src/onboarding/agents-generate.ts
  - packages/forge/src/onboarding/upgrade.ts
  - packages/forge/src/onboarding/doctor.ts
  - packages/forge/src/tests/workspace-discovery.test.ts
  - packages/forge/src/tests/agents-generate.test.ts
  - packages/forge/skills/meta/forge-bootstrap/SKILL.md
  - packages/forge/AGENTS.md
  - docs/rfcs/rfc-0611-generate-nested-agents-md-files-for-workspace-directories-during-forge-onboarding.md
---

# Code Review: d955135...HEAD (RFC-0611 nested AGENTS.md generation)

### Verdict: Needs revision

Implementation is solid overall — clean separation of concerns, proper edit guard, dryRun pattern, comprehensive tests. Two findings need attention: a potential DNA-58 violation (non-atomic writes in nested generation) and a missing `fs.writeFileSync` → `writeFileIfChanged` replacement in the root AGENTS.md write path.

### Mechanical floor

Pass — typecheck clean, 38/38 tests pass.

### Axis A — Structural correctness

1. **`agents-generate.ts:474` — root AGENTS.md uses `fs.writeFileSync` instead of `writeFileIfChanged`.** The root write path was already using `fs.writeFileSync` before this RFC, but the nested generation correctly uses `writeFileIfChanged`. The root path should also use `writeFileIfChanged` for consistency and to avoid unnecessary git churn. This is pre-existing but now more visible since the nested path does it correctly.

2. **`workspace-discovery.ts:83` — `isGenerated` check uses `content.includes("GENERATED")` instead of `hasGeneratedMarker`.** The `hasGeneratedMarker` function from `utils/generated-marker.ts` is the canonical marker detection utility. Using a raw string match is fragile — if the marker format changes, this check breaks. Should use `hasGeneratedMarker(content)` instead.

### Axis B — DNA alignment

1. **DNA-58 (Generated-file content determinism) — `nested-agents-generate.ts:45` uses `writeFileIfChanged` which is correct.** However, `agents-generate.ts:474` still uses `fs.writeFileSync` for the root AGENTS.md write. This is pre-existing and not introduced by this RFC, but it's now inconsistent with the nested path. Not a violation per se since the root path was already this way, but worth noting.

2. **DNA-42 (Compass markup) — all three new source files carry `MODULE_CONTRACT` and `CHANGE_SUMMARY`.** Pass.

3. **DNA-54 (Forge bindings contract) — no hardcoded project literals in skill files.** The forge-bootstrap SKILL.md addition uses generic terms. Pass.

### Axis C — Ecosystem fit

No issues. Package boundaries respected (no `@warpgogol/*` imports in `src/`). `forge.agents.generate`, `forge.upgrade`, and `forge.doctor` are extended in-place — no new commands. AGENTS.md updated with new section.

### Axis D — Forward-only compliance

No issues. No compatibility shims or dual-paths. The `skipped` array and `renderedFiles` are additive to the result type — existing consumers reading `generated` and `errors` are unaffected.

### Axis E — Agent-facing clarity

1. **`workspace-discovery.ts:83` — `isGenerated` uses raw string match.** As noted in Axis A, this should use `hasGeneratedMarker` for consistency with the rest of the codebase. An agent reading this file would wonder why the canonical utility isn't used.

2. **`nested-agents-generate.ts` re-exports from `workspace-discovery.ts` and `nested-agents-templates.ts`.** The re-exports at lines 49-50 are convenient but create a middle-man barrel. Not a blocking issue — it consolidates the public API of the nested generation module.

### Axis F — Pragmatism

No issues. No new commands — existing commands extended. Minimal stub templates are appropriately lean. The `dryRun` pattern reuses the existing `ForgeRuntimeContext.dryRun` field.

### Axis G — Blind spots

1. **Performance — `discoverWorkspaces` scans recursively up to depth 5.** For very large monorepos (100+ packages), this could be slow. The skip set covers `node_modules`, `.git`, `dist`, `.turbo`, `.cache`, `.agents`. Acceptable for forge-consumer projects (typically <20 workspaces). Documented in the RFC's risk section.

2. **Edge case — `discoverWorkspaces` uses `fs.readdirSync` which is synchronous.** For a CLI command this is fine. For programmatic use in a pipeline, it could block. Not a blocking issue since forge commands are operator-invoked, not pipeline-parallel.

3. **Concurrent execution — `writeFileIfChanged` is not atomic.** The RFC's risk section mentions "write to temp file, then rename" but `writeFileIfChanged` from `utils/fs-idempotent.ts` does not use atomic rename — it compares content then writes directly. This is a pre-existing limitation of the utility, not introduced by this RFC.

### Spec compliance

| Requirement from RFC-0611 | Status | Evidence |
| --- | --- | --- |
| Workspace discovery via package.json | Done | workspace-discovery.ts:35-52 |
| Type auto-detection (app/service/package) | Done | workspace-discovery.ts:35-52 |
| Minimal stub template with generated marker | Done | nested-agents-templates.ts:28-49 |
| Edit guard for hand-written files | Done | nested-agents-generate.ts:41-43 |
| dryRun mode for staleness detection | Done | agents-generate.ts:471-472, nested-agents-generate.ts:38-40 |
| forge.upgrade generates nested agents | Done | upgrade.ts:333-342 |
| forge.doctor checks missing/stale/hand-written | Done | doctor.ts:344-426 |
| forge-bootstrap proposes improvements | Done | forge-bootstrap/SKILL.md:228-238 |
| Unit tests for all new functionality | Done | 38 tests pass |
| Documentation update | Done | packages/forge/AGENTS.md:123-136 |

### Questions for the author

1. Should `workspace-discovery.ts:83` use `hasGeneratedMarker(content)` instead of `content.includes("GENERATED")` for consistency with the canonical marker detection utility?
2. Should the root AGENTS.md write path in `agents-generate.ts:474` switch from `fs.writeFileSync` to `writeFileIfChanged` to match the nested path's pattern and reduce git churn?
