---
reviewId: REVIEW-CODE-2026-08-03-01
date: 2026-08-03
reviewer:
  skill: fo-review
  model: claude-sonnet-4-20250514
verdict: approved
diffRange: 71f2d49b...HEAD
filesReviewed:
  - packages/forge/src/onboarding/memory-scaffold.ts
  - packages/forge/src/config/forge-config.ts
  - packages/forge/src/onboarding/create.ts
  - packages/forge/src/onboarding/upgrade.ts
  - packages/forge/src/onboarding/doctor.ts
  - packages/forge/src/onboarding/agents-generate.ts
  - packages/forge/src/tests/memory-scaffold.test.ts
  - packages/forge/src/tests/fixtures/agents-generate-business-before.txt
  - packages/forge/skills/fo/fo-session-retro/SKILL.md
  - packages/forge/skills/fo/fo-handoff/SKILL.md
  - packages/forge/skills/fo/fo-memory-sync/SKILL.md
  - AGENTS.md
  - .agents/memory/MEMORY.md
  - .gitignore
---

# Code Review: RFC-0664 implementation (71f2d49b...HEAD)

### Verdict: Approved

The diff implements RFC-0664 cleanly across 18 files with no structural, DNA, or ecosystem-fit issues. The new `memory-scaffold.ts` module is well-scoped, idempotent, and properly tested. All skill updates are consistent between source and synced copies. The root `AGENTS.md` amendment correctly narrows the `.agents/**` rule.

### Mechanical floor

Pass — `tsc --noEmit` clean, 550/550 vitest tests pass, `rfc.validate --id RFC-0664` passes, `forge.doctor` reports `✓ memory-layer: MEMORY.md 369/4096 chars; 0 daily file(s); gitignore covers`.

### Axis A — Structural correctness

No issues. `memory-scaffold.ts` uses synchronous `fs` APIs consistently (matching the `init.ts` convention), exports typed interfaces, and has no `any` or magic numbers. Constants are named and exported. The `insertGitignoreBlock` helper correctly handles empty and non-newline-terminated content.

### Axis B — DNA alignment

No issues. The diff does not touch any DNA invariants. The `.agents/**` rule amendment in `AGENTS.md` narrows an existing rule rather than weakening it — it adds explicit exceptions for `.agents/memory/`, `.agents/skills/`, and `.agents/operator-profile.md`, all of which are already active directories.

### Axis C — Ecosystem fit

No issues. Package boundaries are respected — `memory-scaffold.ts` is in `packages/forge/src/onboarding/` alongside other onboarding modules. No `apps/*` or `services/*` imports. The `bindings.memory.budget` addition to `forgeBindingsSchema` follows the same pattern as the existing `knowledge.budgets` binding. Skill updates are synced to `.agents/skills/` in the same commits.

### Axis D — Forward-only compliance

No issues. No compatibility shims or dual-paths. The Memory DB is demoted to "optional mirror" in skill text — this is a documentation change, not a code-level dual-path.

### Axis E — Agent-facing clarity

No issues. `memory-scaffold.ts` has `MODULE_CONTRACT` and `CHANGE_SUMMARY`. All `CHANGE_SUMMARY` blocks in touched files are updated with RFC-0664 entries. No ungrounded assertions.

### Axis F — Pragmatism

No issues. The memory layer is minimal — one scaffold function, one health check function, one config binding. No speculative generality. The `checkMemoryLayer` doctor check reuses `checkMemoryLayerHealth` rather than duplicating logic.

### Axis G — Blind spots

No issues. The `checkMemoryLayer` health check correctly handles the "memory layer not initialized" case (returns pass, not warn). The gitignore block uses marker delimiters for idempotent insertion. Daily files are excluded from git by design.

### Spec compliance

| Requirement from RFC-0664 | Status | Evidence |
| --- | --- | --- |
| `scaffoldMemoryLayer` idempotent, creates MEMORY.md + daily/.gitkeep + .gitignore block | Done | `memory-scaffold.ts:88-135`, tests pass |
| Wired into `forge.create` and `forge.upgrade` | Done | `create.ts:216`, `upgrade.ts:359` |
| `forge.doctor` reports memory-layer health | Done | `doctor.ts:890-933`, doctor output confirms |
| `fo-session-retro` routes Context to daily/MEMORY.md | Done | `fo-session-retro/SKILL.md:46,210-218` |
| `fo-handoff` references memory layer | Done | `fo-handoff/SKILL.md:37` |
| `fo-memory-sync` treats it as import source | Done | `fo-memory-sync/SKILL.md:147,152` |
| Generated AGENTS.md gains read rule | Done | `agents-generate.ts:493-499` |
| Root AGENTS.md amended | Done | `AGENTS.md:99` |
| Unit tests cover idempotency, gitignore, doctor warnings | Done | `memory-scaffold.test.ts` — 10 tests |
| `rfc.validate` passes | Done | Verified |

### Questions for the author

1. The `resolveMemoryBudget` function catches all errors from `loadForgeConfig` silently — is there a case where a malformed `forge.yaml` should produce a doctor warning rather than falling back to the default budget?
