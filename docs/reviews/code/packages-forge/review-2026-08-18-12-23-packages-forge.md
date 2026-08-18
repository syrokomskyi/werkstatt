---
reviewId: REVIEW-CODE-2026-08-18-01
date: 2026-08-18
reviewer:
  skill: fo-review
  model: claude-sonnet-4-20250514
verdict: needs-revision
diffRange: 4300885a~1...HEAD
filesReviewed:
  - packages/forge/src/onboarding/create.ts
  - packages/forge/src/onboarding/scaffold-project.ts
  - packages/forge/os/core/core.module.ts
  - packages/forge/src/tests/create.test.ts
  - packages/forge/src/tests/scaffold-project.test.ts
  - packages/forge/README.md
  - packages/forge/README.uk.md
  - packages/forge/package.json
  - packages/werkstatt/package.json
  - packages/werkstatt/AGENTS.md
  - AGENTS.md
  - docs/authoring/site-composition.md
  - tools/kernel.config.ts
---

# Code Review: RFC-0877 — In-place agent-driven Forge installation flow

### Verdict: Needs revision

Two minor findings: stale MODULE_CONTRACT non-goal in scaffold-project.ts and out-of-sequence step numbering in create.ts. Both are cosmetic but should be fixed for agent-facing clarity.

### Mechanical floor

Pass — `pnpm --filter @warpgogol/forge run build:check` and `pnpm --filter @warpgogol/werkstatt run build:check` both pass. All 860 forge tests and 2252 werkstatt tests pass.

### Axis A — Structural correctness

- **scaffold-project.ts:5** — Stale non-goal: `<item>Do not scaffold into non-empty directories — refuse with exit 1.</item>`. RFC-0877 removed the empty-directory check (line 64: `// RFC-0877: Allow non-empty directories for in-place scaffolding.`), but the MODULE_CONTRACT still declares it as a non-goal. The contract should be updated to reflect the new behavior.

- **create.ts:258-400** — Step numbering is out of sequence. Steps 1–8 are correctly numbered, but then steps 9–14 are labelled as 6, 7, 7.5, 8, 9, 10, 11 (leftover from the pre-RFC-0877 numbering). This is confusing for an agent reading the code.

### Axis B — DNA alignment

No issues. The diff does not touch any DNA invariants.

### Axis C — Ecosystem fit

No issues. Command registration updated correctly in core.module.ts with `--in-place` and `--profile` as required flags. workshop.scaffold removed from kernel.config.ts, package.json exports, and AGENTS.md entry points. Generated files regenerated.

### Axis D — Forward-only compliance

No issues. No compatibility shims or dual-paths. The old `workshop.scaffold` command and related files are fully deleted, not maintained behind a flag.

### Axis E — Agent-facing clarity

- **scaffold-project.ts:3** — MODULE_CONTRACT purpose still says "in an empty directory" but the handler now allows non-empty directories.

### Axis F — Pragmatism

No issues. The `--in-place` flag is the minimal change — no new commands, no over-engineering. Name derivation from folder basename is a single `toKebabCase` call. Conflict check uses a simple allowlist array.

### Axis G — Blind spots

No issues. Edge case of empty folder name producing empty kebab-case is handled (line 183: `if (!name)`). Conflict check covers all forge-specific paths.

### Spec compliance

| Requirement from RFC-0877 | Status | Evidence |
| --- | --- | --- |
| --in-place flag required | Done | create.ts:144-156, core.module.ts:288-292 |
| --profile flag required | Done | create.ts:158-171, core.module.ts:293-298 |
| --name optional, derived from folder | Done | create.ts:176-196, toKebabCase at line 100 |
| Allowlist-based conflict check | Done | create.ts:213-234, FORGE_CONFLICT_PATHS at line 113 |
| No subdirectory creation | Done | create.ts:174: `targetDir = path.resolve(context.workspaceRoot)` |
| workshop.scaffold deleted | Done | packages/werkstatt/src/workshop/ deleted, exports removed |
| README rewritten | Done | README.md and README.uk.md updated |
| AGENTS.md updated | Done | Root AGENTS.md:12, packages/werkstatt/AGENTS.md, site-composition.md |
| Version bump | Done | forge 2.0.0, werkstatt 1.0.0 |
| Generated files regenerated | Done | COMMANDS.md, command-manifest, ecosystem, decision-log |

### Questions for the author

1. Should scaffold-project.ts MODULE_CONTRACT purpose be updated to remove "in an empty directory" since it now allows non-empty directories?
2. Should the step numbering in create.ts be renumbered 1–14 for consistency?
