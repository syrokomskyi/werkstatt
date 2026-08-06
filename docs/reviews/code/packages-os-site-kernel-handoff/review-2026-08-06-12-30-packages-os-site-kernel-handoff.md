---
reviewId: REVIEW-CODE-2026-08-06-01
date: 2026-08-06
reviewer:
  skill: fo-review
  model: claude-sonnet-4-20250514
verdict: needs-revision
diffRange: 795b2b52...HEAD
filesReviewed:
  - packages/os/site-kernel-handoff/src/evidence/r2-client.ts
  - packages/os/site-kernel-handoff/src/nachweis/nachweis-io.ts
  - packages/os/site-kernel-handoff/src/tests/r2-client-env-prefix.test.ts
  - packages/os/site-kernel-handoff/AGENTS.md
  - packages/os/site-kernel-checks/src/env/env-example.ts
  - .env.example
---

# Code Review: RFC-0713 implementation (795b2b52...HEAD)

### Verdict: Needs revision

The implementation is clean, minimal, and well-tested. One minor finding: the variable name `p` in `resolveR2ConfigFromEnv` is a mysterious name that doesn't reveal what it holds.

### Mechanical floor

Pass — `pnpm --filter @warpgogol/site-kernel-handoff build:check` and `pnpm --filter @warpgogol/site-kernel-checks build:check` both pass with exit code 0. All 4 unit tests pass.

### Axis A — Structural correctness

1. **Mysterious Name** — `r2-client.ts:71`: the local variable `p` holds the env var prefix string but its name doesn't reveal what it holds. A reader encountering `process.env[`${p}ACCOUNT_ID`]` must trace back to understand `p` is the prefix. Rename to `prefix` for clarity.

### Axis B — DNA alignment

No issues. RFC-0713 is `kind: command` with no `satisfies[]`. No DNA invariants are touched.

### Axis C — Ecosystem fit

No issues. Package boundaries are correct — `nachweis-io.ts` imports from `evidence/r2-client.ts` within the same package. `AGENTS.md` is updated with the per-bucket R2 token scoping rule. The `HOW_TO_OBTAIN` map in `env-example.ts` is updated for generated `.env.example` files. Root `.env.example` follows the existing `# How to obtain:` pattern.

### Axis D — Forward-only compliance

No issues. The `envPrefix` parameter is an extension, not a dual-path. The existing `evidence.sync` call path continues to work without changes (default prefix `R2_` when `envPrefix` is omitted). No legacy code paths maintained behind flags.

### Axis E — Agent-facing clarity

No issues (excluding Axis A finding 1). `MODULE_CONTRACT` and `CHANGE_SUMMARY` are updated in both `r2-client.ts` and `nachweis-io.ts`. New test file has clear, descriptive test names. All code references real functions, types, and files.

### Axis F — Pragmatism

No issues. The change is minimal — one new optional parameter, one call site updated. No new commands, no new packages. The approach extends an existing function rather than creating a new one.

### Axis G — Blind spots

No issues. Security is improved (least-privilege isolation). Edge case where both `R2_*` and `R2_NACHWEIS_*` are set is handled correctly — the function reads only the prefixed vars when `envPrefix` is provided. Migration is low-risk since nachweis is not in production.

### Spec compliance

| Requirement from RFC-0713 | Status | Evidence |
| --- | --- | --- |
| `resolveR2ConfigFromEnv` accepts `envPrefix` | Done | `r2-client.ts:67-70` |
| `nachweis-io.ts` passes `"R2_NACHWEIS"` prefix | Done | `nachweis-io.ts:138` |
| `evidence.sync` unchanged with `R2_*` vars | Done | `r2-client.ts:71`, default `R2_` prefix |
| `.env.example` includes `R2_NACHWEIS_*` | Done | `.env.example:43-53` |
| `MissingEnvError` reports prefixed var name | Done | `r2-client-env-prefix.test.ts:48-56` |
| `AGENTS.md` documents per-bucket scoping | Done | `AGENTS.md:34` |
| `rfc.validate` passes | Done | exit code 0 |

### Questions for the author

1. Why is the variable named `p` instead of `prefix`? This is a local variable in a 15-line function — the shorter name doesn't save meaningful space but costs readability.
