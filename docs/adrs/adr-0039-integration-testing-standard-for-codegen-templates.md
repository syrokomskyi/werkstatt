---
id: ADR-0039
title: "Integration testing standard for codegen templates: post-generation typecheck"
status: proposed
scope: package
decider: architecture
createdAt: 2026-08-10
updatedAt: 2026-08-10
implementedAt:
closedAt:
supersedes: []
supersededBy:
related:
  - RFC-0785
reviewers: []
---

# ADR-0039: Integration testing standard for codegen templates: post-generation typecheck

## Context

Codegen templates in `packages/werkstatt-site/src/codegen/templates/` generate
source files (`.ts`, `.astro`) into mission workpieces. Each template is tested
individually — the generator tests verify that the output file has the expected
content, correct imports, and proper structure.

However, there is no integration test that verifies the generated files compile
and typecheck together within the workpiece context. During the RFC-0789
deployment session, the `markdown-negotiation.ts.template` generated a
middleware file with only a named export (`export const onRequest`), but
`middleware.ts` imported it as a default import (`import markdownNegotiation
from "./markdown-negotiation"`). This caused an Astro build `MISSING_EXPORT`
error that was only caught at deploy time, not at test time.

The gap: template tests check file content in isolation, but not file
interactions within the generated workpiece.

## Decision

Every codegen template that generates importable modules (`.ts`, `.astro`)
must have an integration test that:

1. Generates all related files into a temporary workpiece directory.
2. Runs `tsc --noEmit` (or `astro check` for Astro-specific files) on the
   generated files.
3. Fails if any type or import error is found.

The integration test lives alongside the existing unit tests in the same
`*.test.ts` file or in a dedicated `*.integration.test.ts` file.

## Justification

- **Alternatives considered**: Running a full `astro build` in tests. Rejected
  because `astro build` requires a complete site with content collections,
  dependencies, and configuration — too heavy for a template test. `tsc
  --noEmit` on generated files is sufficient to catch import/export
  mismatches.
- **Constraints**: The test must generate files into a temp directory (not
  the real workpiece) and clean up after. The test must use the same import
  patterns that the real `middleware.ts` (or equivalent consumer file) uses.
- **Alignment**: This aligns with the existing testing discipline (vitest,
  temp directories, `createDefaultIO`) and the codegen test patterns already
  established in `packages/werkstatt-site/src/codegen/tests/`.

## Consequences

- **Positive**: Import/export mismatches, missing default exports, and
  type errors in generated code are caught at test time, not at deploy time.
- **Positive**: Template authors get immediate feedback when a template
  change breaks the generated workpiece's type contract.
- **Negative**: Integration tests are slower than pure content assertions
  (tsc invocation adds ~2-5 seconds per test). Mitigation: run integration
  tests in a separate `*.integration.test.ts` file that can be filtered
  with vitest's `--testNamePattern` or excluded in watch mode.
- **Technical debt**: The integration test only covers `tsc --noEmit`, not
  `astro check`. Astro-specific type errors (e.g., `astro:middleware`
  module resolution) may not be caught. This is acceptable — `tsc` catches
  the import/export class of errors, which is the most common failure mode.

## Evolution

- If `astro check` becomes fast enough for test-time usage, upgrade the
  integration test from `tsc --noEmit` to `astro check`.
- If a template generates files that interact with content collections,
  the integration test may need a minimal content fixture. This should be
  evaluated per-template when the integration test is written.
- If the number of integration tests grows and slows CI, consider a
  dedicated `test:integration` script that runs separately from `test:unit`.
