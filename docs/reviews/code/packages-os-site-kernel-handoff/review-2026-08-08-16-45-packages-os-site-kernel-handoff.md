---
reviewId: REVIEW-CODE-2026-08-08-01
date: 2026-08-08
reviewer:
  skill: fo-review
  model: claude-sonnet-4-20250514
verdict: needs-revision
diffRange: 26d984d8...HEAD
filesReviewed:
  - packages/os/site-kernel-handoff/src/tests/helpers/registry-builder.ts
  - packages/os/site-kernel-handoff/src/tests/subdomain-register.test.ts
  - packages/os/site-kernel-handoff/src/tests/subdomain-validate.test.ts
  - packages/os/site-kernel-handoff/src/tests/subdomain-list.test.ts
  - docs/adrs/adr-0036-registry-builder-helper.md
---

# Code Review: 26d984d8...HEAD (ADR-0036 implementation)

### Verdict: Needs revision

The implementation correctly replaces string interpolation with `yaml.stringify` and all tests pass, but the helper's option types are wider than the canonical Zod schemas they mirror — `kind` and `hostedBy` are `string` instead of the closed enums from `@warpgogol/ontology/operations`, and `adapter`/`storageType` are likewise untyped. This is a Primitive Obsession smell that could allow invalid registry fixtures to be constructed silently.

### Mechanical floor

Pass — `pnpm --filter @warpgogol/site-kernel-handoff build:check` and `pnpm --filter @warpgogol/site-kernel-handoff run test` (786 tests, 0 failures).

### Axis A — Structural correctness

- **Finding A1 (Primitive Obsession)**: `RegistryServiceOptions.kind` is typed as `string` (`registry-builder.ts:42`) but the canonical schema in `@warpgogol/ontology/operations` (`sternsystem.ts:100`) defines `kind: z.enum(["proxy-worker", "scheduled-worker"])`. Same for `hostedBy` (`string` vs `z.enum(["studio"])`). `RegistryDeploymentOptions.adapter` is `string` vs `z.enum(["cloudflare-workers", "netlify", "null"])`. `mirrors[].storageType` is `string` vs `z.enum(["non-bare", "bare", "bundle"])`. These should use the canonical types from `@warpgogol/ontology/operations` to catch typos at compile time — the ADR's own Justification states "the typed options interface catches field-name typos at compile time", but the types are too loose to catch value typos.
- **Finding A2 (Duplicated Code)**: The `createRegistry` function in `subdomain-register.test.ts` and `subdomain-validate.test.ts` share ~90% identical structure (same system, same service, same channels). Only `subdomain-register.test.ts` has conditional `opts` parameters. These could be consolidated into a single shared fixture factory in the helper file, but this is minor — the current duplication is acceptable for test readability.

### Axis B — DNA alignment

No issues. The change is test-only and does not touch any DNA invariant scope.

### Axis C — Ecosystem fit

No issues. The helper correctly uses `yaml` (already a dependency), lives in `src/tests/helpers/` alongside `cloudflare-api-mock.ts`, and follows the same pattern as ADR-0035's helper.

### Axis D — Forward-only compliance

No issues. String interpolation fixtures are fully replaced, not maintained behind a flag.

### Axis E — Agent-facing clarity

No issues. `MODULE_CONTRACT` and `CHANGE_SUMMARY` are present on the new helper file. All three test files reference ADR-0036 in their `CHANGE_SUMMARY`.

### Axis F — Pragmatism

- **Finding F1 (Minimality)**: The helper uses `Record<string, unknown>` internally and manually assigns conditional fields with `if (x !== undefined)` checks. A simpler approach would be to build the object with spread + filter-undefined, but the current approach is readable and correct. Not a blocking finding.

### Axis G — Blind spots

No issues. The helper is a test utility with no production runtime impact.

### Spec compliance

| Requirement from ADR-0036 | Status | Evidence |
| --- | --- | --- |
| Build registry fixtures using `yaml.stringify()` | Done | `registry-builder.ts:114` |
| Shared helper `buildRegistry(opts)` in `src/tests/helpers/registry-builder.ts` | Done | `registry-builder.ts:70` |
| Typed options object | Partial | Types are present but use `string` instead of canonical enum types |
| Returns a valid YAML string | Done | `registry-builder.ts:114` |
| Reusable across tests | Done | Used in 3 subdomain test files |

### Questions for the author

1. Should `RegistryServiceOptions.kind`, `hostedBy`, `RegistryDeploymentOptions.adapter`, and `mirrors[].storageType` use the canonical enum types from `@warpgogol/ontology/operations` instead of `string`?
2. Are there other test files (leitstand, mission, sternsystem) that still hand-write YAML registry fixtures and should be migrated as part of this ADR?
