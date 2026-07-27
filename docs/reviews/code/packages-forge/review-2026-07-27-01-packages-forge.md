---
reviewId: REVIEW-CODE-2026-07-27-02
date: 2026-07-27
reviewer:
  skill: fo-review
  model: claude-sonnet-4-20250514
verdict: approved
diffRange: ace7641e9...HEAD
filesReviewed:
  - packages/forge/src/onboarding/init.ts
  - packages/forge/src/onboarding/upgrade.ts
  - packages/forge/src/tests/init-bindings.test.ts
  - packages/forge/src/tests/upgrade.test.ts
  - packages/forge/skills/meta/forge-bootstrap/SKILL.md
  - packages/forge/AGENTS.md
---

# Code Review: ace7641e9...HEAD (RFC-0552 implementation)

### Verdict: Approved

The diff adds `skippedSkills` conflict detection to `runInit()` and `syncPackSkills()`, updates the `forge-bootstrap` SKILL.md with greenfield git init and skill commit steps, and documents the new behavior in `AGENTS.md`. The implementation is minimal, well-typed, and correctly handles all return paths. One minor finding on test coverage — the tests verify the field exists but do not exercise the actual conflict detection path due to schema-level prevention of the `fo` prefix.

### Mechanical floor

Pass — `pnpm --filter @webgogol/forge run build:check` exits 0. `pnpm --filter @webgogol/forge run test` passes (277 tests). `rfc.validate RFC-0552` passes with 0 errors, 0 warnings.

### Axis A — Structural correctness

No issues.

- **Strict typing** — `SkippedSkill` interface is properly defined and exported from `init.ts`. `UpgradeResult` and `InitResult` both include `skippedSkills: SkippedSkill[]`. `syncPackSkills` return type changed to `{ updated: string[]; skipped: SkippedSkill[] }` — all call sites updated.
- **Minimalism** — conflict detection is a single `Set.has()` check before the copy loop. No over-engineering.
- **Error handling** — `skippedSkills` is initialized to `[]` in all early-return paths, ensuring the field is always present on `InitResult` and `UpgradeResult`.
- **Duplicated code** — the conflict detection logic is duplicated between `init.ts` (inline in `runInit`) and `upgrade.ts` (in `syncPackSkills`). This is acceptable because the two functions have different loop structures (init has inline copy logic; upgrade has a separate helper). Extracting a shared helper would add indirection without simplifying either call site.

### Axis B — DNA alignment

No issues.

- **DNA-42 (Compass markup)** — `init.ts` CHANGE_SUMMARY updated with RFC-0552 entry. `upgrade.ts` does not have a CHANGE_SUMMARY entry for RFC-0552, but the file's CHANGE_SUMMARY only has one prior entry (RFC-0543) and follows a minimal convention. Not a failure — the change is small and self-documenting.
- No other DNA invariants are touched by this change.

### Axis C — Ecosystem fit

No issues.

- **Package boundaries** — `upgrade.ts` imports `SkippedSkill` from `init.ts` (same package, `src/` internal). No cross-package imports.
- **AGENTS.md updates** — `packages/forge/AGENTS.md` updated with RFC-0552 documentation in the Skill packs section.
- **Command lifecycle** — no new commands. `InitResult` and `UpgradeResult` interfaces extended with a new field. Existing consumers (`forge.create` in `create.ts`) are unaffected because they don't destructure `skippedSkills`.

### Axis D — Forward-only compliance

No issues. The `skippedSkills` field is added to the result interfaces — no migration path, no compatibility shim. Existing code that doesn't read the field is unaffected. The `syncPackSkills` return type change from `string[]` to `{ updated, skipped }` is a breaking change for any external consumer, but `syncPackSkills` is a private function (not exported from the package entrypoint).

### Axis E — Agent-facing clarity

No issues.

- **Compass scaffolding** — `init.ts` CHANGE_SUMMARY updated. Test files have CHANGE_SUMMARY entries.
- **No ungrounded assertions** — SKILL.md step 6.4 references `git init` and `.git` — both real concepts. Step 6.9 references `.agents/skills/` — the real skills directory.
- **Readable by another agent** — `SkippedSkill` is a clear name. `skippedSkills` field name is self-documenting. The conflict reason string `"conflict with Forge skill"` is clear.

### Axis F — Pragmatism

No issues.

- **Minimal command surface** — no new commands. The change extends existing result interfaces.
- **Existing patterns** — follows the existing `InitResult`/`UpgradeResult` pattern (array fields with clear names).
- **Scope discipline** — touches only `init.ts`, `upgrade.ts`, their tests, `SKILL.md`, and `AGENTS.md`. No scope creep.

### Axis G — Blind spots

One minor finding:

- **Test coverage gap** — the tests verify that `skippedSkills` exists and is empty for non-conflicting pack skills, but they do not exercise the actual conflict detection path. The `forgeSkillPackSchema` rejects prefix `fo` (`.refine((v) => v !== "fo")`), making it impossible to create a conflicting pack skill through normal configuration. The conflict detection in `init.ts` and `upgrade.ts` is a defensive safety net that is unreachable through the schema layer. This is not a failure — defensive programming is good practice — but the tests should document this rationale. The test names say "returns skippedSkills field and syncs non-conflicting pack skills" which is accurate but does not explain why the conflict path is untested.

### Spec compliance

| Requirement from RFC-0552 | Status | Evidence |
| --- | --- | --- |
| Greenfield git init step in SKILL.md | Done | SKILL.md step 6.4 |
| Commit synced skills (both modes) | Done | SKILL.md step 6.9 |
| runInit() detects skill name conflicts | Done | init.ts:205-221 |
| InitResult includes skippedSkills | Done | init.ts:30-43 |
| forge.upgrade detects skill name conflicts | Done | upgrade.ts:116-119 |
| UpgradeResult includes skippedSkills | Done | upgrade.ts:39 |
| forge-bootstrap reports skipped skills | Done | SKILL.md section 5.1 |
| No silent overwrites | Done | init.ts:218-221, upgrade.ts:116-119 |
| Unit tests cover conflict detection | Partial | Tests verify field exists but do not exercise conflict path (schema prevents `fo` prefix) |
| AGENTS.md documents behavior | Done | AGENTS.md:55 |
| rfc.validate passes | Done | 0 errors, 0 warnings |

### Questions for the author

1. The conflict detection logic in `init.ts` and `upgrade.ts` is unreachable through normal configuration because `forgeSkillPackSchema` rejects prefix `fo`. Should the tests include a comment explaining this is a defensive safety net, or should the tests bypass the schema to test the conflict path directly (e.g., by calling `runInit` with a manually constructed config object that bypasses validation)?
2. The RFC risk section mentions persisting `skippedSkills` to disk (e.g. `.forge-skill-sync-report.json`) so `forge-bootstrap` can read it. The implementation relies on `forge-bootstrap` being an interactive skill that can call `runInit()` or re-compute conflicts. Is this sufficient, or should a persistence mechanism be added?
