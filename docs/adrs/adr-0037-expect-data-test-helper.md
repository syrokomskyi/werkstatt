---
id: ADR-0037
title: "expectData test helper for KernelCommandResult type narrowing"
status: accepted
scope: package
decider: architecture
createdAt: 2026-08-08
updatedAt: 2026-08-08
implementedAt:
closedAt:
supersedes: []
supersededBy:
related:
  - RFC-0752
reviewers:
  - human:andrii-syrokomskyi
---

# ADR-0037: expectData test helper for KernelCommandResult type narrowing

## Context

`KernelCommandResult<T>` has `data?: T` (optional). TypeScript strict mode requires non-null assertions (`result.data!.state`) or null checks in every test that accesses the result data. During RFC-0752 implementation, 11 `result.data` references in `subdomain-register.test.ts` produced lint errors, all fixed with `!` assertions. This is noisy, repetitive, and provides no runtime safety — if `data` is actually `undefined`, the test throws a cryptic `TypeError` instead of a clear assertion failure.

## Decision

Add a shared test helper `expectData<T>(result: KernelCommandResult<T>): T` in `src/tests/helpers/kernel-result-helpers.ts` that asserts `data` is defined and returns it with the correct type. Tests use `const data = expectData(result)` instead of `result.data!.field`.

## Justification

TypeScript non-null assertions (`!`) silence the compiler without adding runtime safety — if `data` is `undefined`, the test fails with a cryptic `TypeError` instead of a descriptive assertion. A dedicated helper provides both compile-time type narrowing and a runtime guard with a clear error message. The alternative — wrapping each access in `if (!result.data) throw ...` — is more verbose and equally repetitive. The helper is a pure test utility with no production code impact.

## Consequences

- **Positive**: eliminates `!` assertions throughout test files.
- **Positive**: provides a clear assertion failure ("expected result.data to be defined") instead of `TypeError: Cannot read properties of undefined`.
- **Positive**: the helper is reusable across all kernel command tests in `site-kernel-handoff` and other packages that return `KernelCommandResult`.
- **Negative**: adds one import line per test file.
- **Technical debt**: none — this is a pure test utility with no production impact.

## Evolution

If `KernelCommandResult` is ever changed to make `data` non-optional for success paths (a potential future RFC), the helper becomes a no-op pass-through and can be removed. Until then, it is the standard pattern for all kernel command tests.
