---
reviewId: REVIEW-CODE-2026-08-07-01
date: 2026-08-07
reviewer:
  skill: fo-review
  model: unknown
verdict: needs-revision
diffRange: 10330705...HEAD
filesReviewed:
  - packages/share/src/entitlement.ts
  - packages/os/site-kernel-checks/src/rate-snapshot-resolve.ts
  - packages/os/site-kernel-checks/src/currency-pricing-compile.ts
  - packages/os/site-kernel-checks/src/derived-prices-materialize.ts
  - packages/os/site-kernel-checks/src/command-tables/04-content-quality.ts
  - packages/os/site-kernel-checks/src/pipelines/build-prepare.ts
  - packages/os/site-kernel-checks/src/tests/rfc-0741-multi-currency-pipeline.test.ts
  - packages/os/site-kernel-checks/AGENTS.md
  - docs/rfcs/rfc-0741-multi-currency-entitled-feature-and-build-pipeline.md
---

# Code Review: RFC-0741 multi-currency entitled feature and build pipeline

### Verdict: Needs revision

The implementation is structurally sound and passes the mechanical floor (tsc, vitest, rfc.validate). However, there are findings on axes A, E, F, and G that need addressing before merge.

### Mechanical floor

Pass — `tsc --noEmit` clean for both `@warpgogol/site-kernel-checks` and `@warpgogol/share`. All 11 new tests pass. `rfc.validate --id RFC-0741` passes.

### Axis A — Structural correctness

1. **Duplicated code** — `flagString`, `findCurrencyPricingPolicy`, and `resolveRef` are duplicated across `rate-snapshot-resolve.ts`, `currency-pricing-compile.ts`, and `derived-prices-materialize.ts`. These three helper functions are identical copies. Extract to a shared helper module (e.g. `./lib/pbp-helpers.ts`).

2. **`as unknown as` casts** — `entity as unknown as PbpRatePolicy` and similar casts in `findRatePolicies`, `findRateSchedules`, `findCurrencyPricingPolicy` bypass the type system. The `PbpEntity` type should carry enough type information to narrow without unsafe casts, or a type guard function should be used.

3. **`let compilerResult`** without explicit type — `let compilerResult;` in all three handlers relies on implicit inference from the `try` block assignment. Assign the return type explicitly: `let compilerResult: Awaited<ReturnType<typeof compilePbpProfile>>;`

### Axis B — DNA alignment

No issues. DNA-1 (monorepo boundary) respected — imports flow from `site-kernel-checks` to `@warpgogol/pbp` and `@warpgogol/share`. DNA-4 (canonical content in `src/content/`) respected — rate snapshots written to `src/content/business-profile/rate-snapshots/`. DNA-20 superseded by RFC-0471 — PBP is the canonical business layer, used correctly.

### Axis C — Ecosystem fit

1. **Generated file writes** — `rate-snapshot-resolve.ts` uses raw `writeFile` from `node:fs/promises` at line 274. Per `packages/AGENTS.md` "Generated file writes" rule, all generated file writes MUST use `writeFileIfChanged` from `@warpgogol/site-kernel` to avoid git churn. The `derived-prices-materialize.ts` handler already follows this rule correctly.

2. **Command registration** — Commands are registered in `04-content-quality.ts` with proper `gate.conditional.entitlement` metadata. Pipeline placement after `entitlements.resolve` and before `surface.generate` is correct. AGENTS.md updated with new module entries.

### Axis D — Forward-only compliance

No issues. No compatibility shims, no legacy paths, no dual-paths. The entitlement check uses fail-open semantics (`entitledFeatures !== null && !entitledFeatures.includes(...)`) consistent with existing patterns in `feed.ts`.

### Axis E — Agent-facing clarity

1. **`MODULE_CONTRACT` and `CHANGE_SUMMARY`** — Present on both new files. Good.

2. **Dynamic import of `node:crypto`** — `rate-snapshot-resolve.ts:100` uses `await import("node:crypto")` inside `computeDigest`. This should be a top-level import — it's a Node.js built-in, not a conditional dependency. Dynamic import adds unnecessary overhead and is inconsistent with the rest of the file which uses top-level `import { mkdir, writeFile } from "node:fs/promises"`.

3. **Hardcoded domain `https://warpgogol.com`** — `rate-snapshot-resolve.ts:92` hardcodes `https://warpgogol.com/id/rate-snapshot/` in the snapshot ID generator. This should use the site's canonical URL or a configurable base. Other commands in the codebase use `readAstroSiteUrl` from `./lib/astro-site-url.ts`.

### Axis F — Pragmatism

1. **`writeFile` vs `writeFileIfChanged`** — Same as C1. Using raw `writeFile` for generated content creates git churn on every regeneration. This is a documented repo standard, not a style preference.

2. **`snapshotsReused: 0`** — The `rate-snapshot.resolve` handler always returns `snapshotsReused: 0` and never actually checks for existing snapshots to reuse. The field is present in the result but the logic is not implemented. Either implement reuse logic (check if a snapshot with the same digest already exists) or remove the field from the result to avoid misleading output.

### Axis G — Blind spots

1. **No idempotency check** — `rate-snapshot.resolve` writes a new snapshot file on every build run, even if the rate value hasn't changed. Since `observedAt = buildTime` (which changes every run), the filename includes a timestamp, creating a new file each time. This will accumulate snapshot files in the content directory. Consider: (a) checking if a snapshot with the same digest already exists and skipping, or (b) using a deterministic filename based on the pair + digest, not the timestamp.

2. **External mode error handling** — When `policy.mode === "external"` and `isDev` is false, the handler pushes an error but continues. If all policies are external, `snapshotsCreated.length === 0` and `errors.length > 0`, which returns `exitCode: 1`. This is correct for block-publication, but the error message says "not yet deployed" which is a temporary state — consider making this a warning (non-fatal) to avoid blocking builds when external mode is configured but the service isn't ready.

3. **Empty state** — The handler correctly handles the case where `ratePolicies.length === 0` (returns ok with 0 snapshots). Good.

### Spec compliance

| Requirement from RFC-0741 | Status | Evidence |
| --- | --- | --- |
| Add "multi-currency" to `ENTITLED_FEATURES` | Done | `packages/share/src/entitlement.ts:38-39` |
| Add `feature_multi_currency` to `STRIPE_FEATURE_LOOKUP_MAP` | Done | `packages/share/src/entitlement.ts:63-64` |
| Create `rate-snapshot.resolve` command handler | Done | `packages/os/site-kernel-checks/src/rate-snapshot-resolve.ts` |
| Create `currency-pricing.compile` command handler | Done | `packages/os/site-kernel-checks/src/currency-pricing-compile.ts` |
| Add `gate.conditional.entitlement` to `derived-prices.materialize` | Done | `04-content-quality.ts:752-760` |
| Register new commands in command table with gate | Done | `04-content-quality.ts:762-824` |
| Wire 3 pipeline steps into `build-prepare` | Done | `build-prepare.ts:51-55` (main), `177-180` (dev) |
| Pipeline steps gated by `multi-currency` entitlement | Done | Runtime checks in all 3 handlers + declarative gate metadata |
| Tests | Done | `rfc-0741-multi-currency-pipeline.test.ts` — 11 tests |
| AGENTS.md update | Done | `packages/os/site-kernel-checks/AGENTS.md:32-34` |

### Questions for the author

1. Why does `rate-snapshot.resolve` use raw `writeFile` instead of `writeFileIfChanged`? This violates the documented repo standard for generated file writes.
2. Why is `node:crypto` dynamically imported instead of a top-level import? It's a Node.js built-in with no conditional loading concern.
3. How will snapshot files accumulate over multiple builds? The filename includes `observedAt` (build time), so every build creates a new file. What cleans up old snapshots?
4. Why is `snapshotsReused: 0` returned when no reuse logic exists? Should the field be removed or the logic implemented?
