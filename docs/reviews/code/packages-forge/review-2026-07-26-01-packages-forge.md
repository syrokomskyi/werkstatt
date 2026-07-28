---
reviewId: REVIEW-CODE-2026-07-26-01
date: 2026-07-26
reviewer:
  skill: fo-review
  model: unknown
verdict: approved
diffRange: 1efe27cc4...HEAD
filesReviewed:
  - packages/forge/AGENTS.md
  - packages/forge/profiles/astro-typescript-turborepo.yaml
  - packages/forge/profiles/forge-shell.yaml
  - packages/forge/profiles/phaser-turborepo.yaml
  - packages/forge/skills/meta/forge-bootstrap/SKILL.md
  - packages/forge/skills/meta/forge-bootstrap/forge-about.md
  - packages/forge/skills/meta/forge-bootstrap/milestone-gallery/.gitkeep
  - packages/forge/skills/meta/forge-bootstrap/operator-profile-template.md
  - packages/forge/skills/meta/forge-bootstrap/project-narrative-template.md
  - packages/forge/src/migration-adapters/node-typescript-pnpm/index.ts
  - packages/forge/src/migration-adapters/phaser-pnpm/index.ts
  - packages/forge/src/migration-adapters/types.ts
  - packages/forge/src/tests/migration-adapters.test.ts
  - packages/forge/src/tests/stack-profile.test.ts
  - docs/rfcs/rfc-0547-barrier-free-onboarding-welcoming-report-auto-doctor-auto-adr-and-forge-as-devdependency.md
---

# Code Review: 1efe27cc4...HEAD (RFC-0547 implementation)

### Verdict: Approved

The implementation correctly delivers the barrier-free onboarding redesign: redesigned SKILL.md with register selection, name/gender, auto-doctor, silent auto-ADR, project analysis, first creation moment, and welcoming report with zero CLI commands. Scaffold profiles now include `@warpgogol/forge` and `operator-profile.md` in `.gitignore`. Git history transfer is implemented via `format-patch` + `git am`. Three minor findings on axes A and G — duplicated code, swallowed errors, and command injection risk — do not block approval but should be fixed.

### Mechanical floor

Pass — `pnpm --filter @warpgogol/forge run build:check` (typecheck), `pnpm --filter @warpgogol/forge run test` (260 tests), `forge.skill.validate` (0 violations), `rfc.validate RFC-0547` (passed).

### Axis A — Structural correctness

1. **Duplicated Code** — the `postSetup` implementation is identical in both `node-typescript-pnpm/index.ts:123-149` and `phaser-pnpm/index.ts:123-150` (25+ lines of identical git init / format-patch + git am logic). Extract to a shared helper in `types.ts` or a new `git-utils.ts` module. Both adapters would call the shared function.

2. **Swallowed errors** — `postSetup` in both adapters has a bare `catch` block (`} catch {`) with no error context logged or propagated. An agent debugging a failed git history transfer cannot determine what went wrong. Add a `console.warn` or structured log with the error message inside the catch block.

### Axis B — DNA alignment

No issues. DNA-42 (Compass markup) — new content files (`.md` templates) do not require `MODULE_CONTRACT`/`CHANGE_SUMMARY`; modified adapter files have updated `CHANGE_SUMMARY`. DNA-54 (forge bindings) — SKILL.md contains no hardcoded project-specific literals.

### Axis C — Ecosystem fit

No issues. Package boundaries respected — no cross-package imports added. `packages/forge/AGENTS.md` updated with output contract clarification. The `MigrationAdapter.postSetup` signature change (adding `sourceDir`) is forward-only — no external consumers exist outside the forge package.

### Axis D — Forward-only compliance

No issues. Old `postSetup(targetDir, analysis)` signature replaced, not kept alongside new one. Old SKILL.md process replaced, not maintained behind a flag. `.git` removed from `DEFAULT_EXCLUDE_PATTERNS` without conditional logic.

### Axis E — Agent-facing clarity

No issues. New knowledge files are clear and well-structured. SKILL.md is detailed and unambiguous — each step has explicit instructions, guardrails, and failure modes. The `postSetup` implementation is readable but the bare `catch` blocks reduce clarity (see Axis A finding 2).

### Axis F — Pragmatism

No issues. The `postSetup` duplication is a pragmatic trade-off (adapters are intentionally separate), but the shared logic should be extracted (see Axis A finding 1). The temporary `.forge-migration-patches` directory inside the target is a reasonable approach and is cleaned up after use.

### Axis G — Blind spots

1. **Security — command injection risk** — `postSetup` uses `execSync` with string interpolation: `` execSync(`git -C "${sourceDir}" format-patch --all -o "${patchDir}"`) ``. If `sourceDir` or `targetDir` contains shell metacharacters (e.g. `$(...)` or backticks), this is a command injection vector. Use `execFileSync` with array arguments instead: `execFileSync("git", ["-C", sourceDir, "format-patch", "--all", "-o", patchDir])`. This eliminates the shell entirely.

2. **Privacy** — `operator-profile.md` is in `.gitignore` in all scaffold profiles. Gender is optional. The SKILL.md informs the operator that `operator-profile.md` is local and private. Properly handled.

3. **Edge cases** — `postSetup` handles empty repos (no commits → fallback to git init), no `.git` (direct git init), and transfer failures (fallback to git init). The SKILL.md documents concurrent execution limitations. Properly handled.

### Spec compliance

| Requirement from RFC-0547 | Status | Evidence |
| --- | --- | --- |
| Register selection step | Done | SKILL.md:57-68 |
| Name/gender step | Done | SKILL.md:70-82 |
| Auto-doctor step | Done | SKILL.md:130-138 |
| Silent auto-ADR step | Done | SKILL.md:140-151 |
| Project analysis + recommendations | Done | SKILL.md:153-165 |
| First creation moment | Done | SKILL.md:167-177 |
| Welcoming report with zero CLI commands | Done | SKILL.md:179-215, forge.skill.validate: 0 violations |
| `@warpgogol/forge` in all scaffold profiles | Done | forge-shell.yaml:18, astro-typescript-turborepo.yaml:57, phaser-turborepo.yaml:57 |
| `operator-profile.md` in `.gitignore` | Done | All three profiles |
| `.git` removed from DEFAULT_EXCLUDE_PATTERNS | Done | types.ts:59-65 |
| `postSetup` implemented in both adapters | Done | node-typescript-pnpm/index.ts:123-149, phaser-pnpm/index.ts:123-150 |
| Knowledge files created and declared | Done | forge-about.md, operator-profile-template.md, project-narrative-template.md, milestone-gallery/.gitkeep; SKILL.md:12-16 |
| `packages/forge/AGENTS.md` output contract updated | Done | AGENTS.md:100 |
| `forge.skill.validate` passes | Done | 0 violations |
| `rfc.validate` passes | Done | All 1 RFC(s) passed |

### Questions for the author

1. The `postSetup` logic is duplicated across both adapters — should it be extracted to a shared `git-utils.ts` module, or is the duplication intentional to keep adapters self-contained?
2. The `execSync` calls with string interpolation are a command injection risk — should `execFileSync` with array arguments be used instead?
3. The bare `catch` blocks in `postSetup` swallow errors silently — should a `console.warn` or structured log be added for debugging?
