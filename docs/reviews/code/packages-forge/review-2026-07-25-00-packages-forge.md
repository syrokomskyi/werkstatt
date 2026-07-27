---
reviewId: REVIEW-CODE-2026-07-25-01
date: 2026-07-25
reviewer:
  skill: fo-review
  model: claude-sonnet-4-20250514
verdict: approved
diffRange: e8663a8c0...HEAD
filesReviewed:
  - packages/forge/src/registry.ts
  - packages/forge/src/skill-schema.ts
  - packages/forge/src/validators/skill-validate.ts
  - packages/forge/src/onboarding/init.ts
  - packages/forge/src/onboarding/doctor.ts
  - packages/forge/os/core/core.module.ts
  - packages/forge/skills/fo/fo-site-scan/SKILL.md
  - packages/forge/skills/shared/grilling/SKILL.md
  - packages/forge/skills/shared/grilling/qa-log.md
  - packages/forge/skills/shared/grilling/learned-principles.md
  - packages/forge/skills/shared/writing-great-skills/SKILL.md
  - packages/forge/skills/meta/skill-create/SKILL.md
  - packages/forge/src/tests/skill-schema.test.ts
  - packages/forge/src/tests/skill-validate.test.ts
  - AGENTS.md
  - docs/verification-plan.xml
---

# Code Review: e8663a8c0...HEAD (RFC-0524 implementation)

### Verdict: Approved

The implementation adds an optional `knowledge?: string[]` field to the forge skill contract, a SKILL-13 validation rule, init sync, doctor stale detection, and adopts the pattern in `fo-site-scan` and `grilling`. Changes are minimal, well-typed, and consistent with existing patterns. No DNA violations, no forward-only issues, no backward compatibility shims.

### Mechanical floor

Pass — `pnpm --filter @wgogol/forge run build:check` (tsc --noEmit), `pnpm --filter @wgogol/forge run test` (164 tests, 18 files), `pnpm exec site-kernel run forge.skill.validate` (0 violations), `pnpm exec site-kernel run rfc.validate RFC-0524` (pass).

### Axis A — Structural correctness

No issues.

- `knowledge?: string[]` is properly typed as optional in `ForgeSkillEntry`.
- Zod schema uses `z.array(z.string()).optional()` — correct and consistent with existing `bindings` pattern.
- SKILL-13 validation uses `fs.existsSync` — synchronous, consistent with the rest of `skill-validate.ts` which uses sync `fs` throughout.
- `init.ts` knowledge sync parses frontmatter with `parseYaml` in a try/catch — recoverable, documented with comment.
- `doctor.ts` stale check uses async `readFile` and `pathExists` — consistent with the rest of `doctor.ts`.
- No `any` types, no magic numbers, no dead code.
- **Minor note**: `skill-validate.test.ts` creates temp files in `createTempWorkspace` but doesn't use them — the tests verify the real workspace skills instead. This is acceptable given the difficulty of mocking `FORGE_SKILLS` (imported as a const array), but the temp dir creation code is dead. Not a blocking issue.

### Axis B — DNA alignment

No issues.

- DNA-42 (Compass markup): `MODULE_CONTRACT` and `CHANGE_SUMMARY` updated in all modified source files (`registry.ts`, `skill-schema.ts`, `skill-validate.ts`, `init.ts`, `doctor.ts`).
- No DNA invariant conflicts. RFC-0524 justifies DNA-54 satisfaction by extending `forge.skill.validate` validation surface.

### Axis C — Ecosystem fit

No issues.

- Package boundaries: `src/` does not import from `@gogol/site-kernel` or any kernel package. Autonomy guard preserved.
- `AGENTS.md` (root) updated with SKILL-13 mention.
- `packages/forge/AGENTS.md` updated with knowledge field documentation.
- `docs/verification-plan.xml` updated with vm-09 entry and vm-08 updated to SKILL-13.
- `docs/COMMANDS.md` and `docs/ecosystem.generated.yaml` regenerated via `command.manifest.generate` and `ecosystem.manifest.generate`.
- Command description in `core.module.ts` updated to SKILL-01..SKILL-13.

### Axis D — Forward-only compliance

No issues.

- No compatibility shims, no dual paths.
- The `knowledge` field is optional by design (opt-in convention, not backward compatibility). This is explicitly justified in the RFC's "Alternatives considered" section.
- No legacy code paths maintained behind flags.

### Axis E — Agent-facing clarity

No issues.

- All modified source files carry updated `CHANGE_SUMMARY` entries referencing RFC-0524.
- No ungrounded assertions — all referenced functions, types, and files exist.
- Variable names are clear: `knowledgeFile`, `knowledgePath`, `kfSrcPath`, `kfDestPath`.
- `writing-great-skills.md` "Cumulative knowledge pattern" section provides clear agent-facing documentation with table, code examples, and mutation contract.

### Axis F — Pragmatism

No issues.

- `knowledge?: string[]` is the minimal contract — no speculative generality.
- SKILL-13 is a simple `fs.existsSync` check — not over-engineered.
- Doctor stale check is a straightforward content comparison.
- The `skill-create` prompt is conditional (`concerns: content-mutation | code-mutation AND invocation: user`) — doesn't prompt for skills that don't benefit.
- No new commands introduced — extends existing `forge.init`, `forge.doctor`, `forge.skill.validate`.

### Axis G — Blind spots

No issues.

- **Performance**: SKILL-13 does `fs.existsSync` per declared knowledge file — minimal I/O, only for skills that declare knowledge (2 of 30). Negligible cost.
- **Concurrent execution**: Documented in RFC-0524 §Risks — "knowledge file writes are not atomic... convention assumes single-agent execution per skill."
- **Edge cases**: Empty knowledge array (no iteration), missing source file (SKILL-13 catches), missing dest file (doctor skips — expected on first install), frontmatter parse error (init.ts catches silently — SKILL-01 catches in validation).
- **npm portability**: Documented in RFC-0524 §Risks — knowledge files ship as empty templates, project-specific content stays local.

### Spec compliance

| Requirement from RFC-0524 | Status | Evidence |
| --- | --- | --- |
| `ForgeSkillEntry.knowledge?: string[]` | Done | `packages/forge/src/registry.ts:28` |
| Zod schema `knowledge` field | Done | `packages/forge/src/skill-schema.ts:32` |
| SKILL-13 validation | Done | `packages/forge/src/validators/skill-validate.ts:167-179` |
| `forge.init` sync | Done | `packages/forge/src/onboarding/init.ts:142-166` |
| `forge.doctor` stale check | Done | `packages/forge/src/onboarding/doctor.ts:164-211` |
| `fo-site-scan` adoption | Done | `packages/forge/skills/fo/fo-site-scan/SKILL.md:9-12` |
| `grilling` adoption | Done | `packages/forge/skills/shared/grilling/SKILL.md:9-11` |
| `grilling` knowledge files | Done | `qa-log.md`, `learned-principles.md` created |
| `writing-great-skills` section | Done | `packages/forge/skills/shared/writing-great-skills/SKILL.md:91-132` |
| `skill-create` prompt | Done | `packages/forge/skills/meta/skill-create/SKILL.md:30-32` |
| Tests | Done | `skill-schema.test.ts` (3 tests), `skill-validate.test.ts` (2 tests) |
| AGENTS.md updates | Done | Root + `packages/forge/AGENTS.md` |
| verification-plan.xml | Done | vm-08 updated, vm-09 added |
| Acceptance criteria | Done | All 11 checked off with evidence |

### Questions for the author

1. The `skill-validate.test.ts` creates temp directories via `createTempWorkspace` but doesn't use them — the tests verify the real workspace skills instead. Should the dead temp-dir code be removed, or should the tests be refactored to use an isolated temp workspace with a mocked registry?
2. The `forge.doctor` stale knowledge check compares file contents but does not detect extra (undeclared) knowledge files in `.agents/skills/` that are no longer in the source. Should orphan detection be added?
