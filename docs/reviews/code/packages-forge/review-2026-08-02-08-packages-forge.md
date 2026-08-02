---
reviewId: REVIEW-CODE-2026-08-02-01
date: 2026-08-02
reviewer:
  skill: fo-review
  model: unknown
verdict: needs-revision
diffRange: 1c8dbe5...HEAD
filesReviewed:
  - packages/forge/src/config/forge-config.ts
  - packages/forge/src/onboarding/agents-generate.ts
  - packages/forge/src/onboarding/create.ts
  - packages/forge/src/onboarding/init.ts
  - packages/forge/src/onboarding/nested-agents-generate.ts
  - packages/forge/src/onboarding/nested-agents-templates.ts
  - packages/forge/src/onboarding/templates/root-agents-business.md
  - packages/forge/src/onboarding/templates/root-agents-creative.md
  - packages/forge/src/tests/agents-generate-domain.test.ts
  - packages/forge/src/tests/fixtures/agents-generate-business-before.txt
  - packages/forge/AGENTS.md
  - docs/rfcs/rfc-0643-per-domain-agents-md-template-generation.md
---

# Code Review: 1c8dbe5...HEAD (RFC-0643 per-domain AGENTS.md template generation)

### Verdict: Needs revision

The implementation is functionally correct — all 438 tests pass, typecheck is clean, and the golden fixture regression test confirms no change for software-domain projects. However, there are two findings: a duplicated terminology resolution pattern and a missing MODULE_CONTRACT on the new template files.

### Mechanical floor

Pass — `pnpm --filter @warpgogol/forge run build:check` and `pnpm --filter @warpgogol/forge run test` (438 tests) both pass.

### Axis A — Structural correctness

- **Duplicated Code (terminology resolution)**: `resolveAllTerminology()` in `agents-generate.ts:73-88` and the inline terminology resolution block in `nested-agents-generate.ts:60-70` are near-identical copies of the same logic — both iterate the same 7 universal keys, both merge profile-specific keys. Extract a shared `resolveAllTerminology(config, profile)` function into a shared location (e.g. `profile-schema.ts` or a new `terminology-utils.ts`) and import from both call sites.

### Axis B — DNA alignment

No issues. DNA-54 (forge bindings contract) is not violated — the `profile` field is a config field, not a binding. DNA-58 (generated-file content determinism) is satisfied — the golden fixture test confirms byte-identical output for the no-profile case.

### Axis C — Ecosystem fit

No issues. Package boundaries are respected (no `@warpgogol/*` imports added to forge `src/`). `packages/forge/AGENTS.md` is updated with the new RFC-0643 section. The `details` field is additive and backward-compatible.

### Axis D — Forward-only compliance

No issues. No compatibility shims or legacy paths. The template extraction replaces the inline prose directly — the old `lines.push()` calls are deleted, not maintained behind a flag.

### Axis E — Agent-facing clarity

- **Missing MODULE_CONTRACT on template files**: `root-agents-business.md` and `root-agents-creative.md` are new non-trivial source files but lack `MODULE_CONTRACT` headers. While they are Markdown templates (not TypeScript), they are consumed by `selectRootTemplate()` and should carry at least a brief purpose comment at the top for agent discoverability.

### Axis F — Pragmatism

No issues. The `details` field is minimal and well-typed. The `profile` field in forge.yaml is a single string id — no speculative generality. The path traversal guard in `selectNestedTemplate()` is proportionate.

### Axis G — Blind spots

No issues. The path traversal guard addresses the security edge case. The fallback-to-hardcoded behavior handles the empty-state edge case (no profile loaded). The `loadForgeConfig` profile loading is wrapped in try/catch for the case where forge root is not resolvable.

### Spec compliance

| Requirement from RFC-0643 | Status | Evidence |
| --- | --- | --- |
| substituteTemplate() function | Done | `agents-generate.ts:41-49` |
| Root template extraction (business + creative) | Done | `templates/root-agents-business.md`, `templates/root-agents-creative.md` |
| Dynamic sections remain inline | Done | `agents-generate.ts:441-508` |
| Nested template selection with agentsMdTemplate | Done | `nested-agents-templates.ts:131-165` |
| Fallback to hardcoded templates | Done | `nested-agents-templates.ts:137-139` |
| details field in --json output | Done | `agents-generate.ts:375,525-530,593` |
| Path traversal rejection | Done | `nested-agents-templates.ts:143-156` |
| Unit tests | Done | `agents-generate-domain.test.ts` (18 tests) |
| No regression for software-domain | Done | Golden fixture test passes |
| packages/forge/AGENTS.md updated | Done | `packages/forge/AGENTS.md:127-136` |
| profile field in ForgeConfig | Done | `forge-config.ts:168-169,198-199` |
| loadForgeConfig loads profile | Done | `forge-config.ts:337-357` |
| forge.create writes profile to forge.yaml | Done | `init.ts:134-137`, `create.ts:61` |

### Questions for the author

1. Should `resolveAllTerminology()` be extracted to a shared utility to avoid the duplication between `agents-generate.ts` and `nested-agents-generate.ts`?
2. Should the root template files carry a brief purpose comment or MODULE_CONTRACT header for agent discoverability?
