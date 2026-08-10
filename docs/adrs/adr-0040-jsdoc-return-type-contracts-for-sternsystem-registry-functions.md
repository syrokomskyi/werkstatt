---
id: ADR-0040
title: "JSDoc return-type contracts for sternsystem registry functions"
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
  - RFC-0790
reviewers: []
---

# ADR-0040: JSDoc return-type contracts for sternsystem registry functions

## Context

RFC-0790 changed `resolveCacheClonePath` in `packages/werkstatt/src/sternsystem/registry-io.ts`
from returning `string | null` to returning `string` (always). The function
computes the expected cache clone path from convention — it does not check
whether the directory exists. The old `string | null` return type implied
that `null` meant "not found", but the function never actually returned
`null` — it always returned a computed path.

Callers that used `if (cachePath)` to guard against missing cache clones
silently broke: the condition was always true, so the guard became a dead
branch. This caused false-positive `GEN-FILES-01` errors in
`generated-files-validate.ts` during the RFC-0789 deployment session.

The TypeScript type system did not catch this because `if (string)` is
valid TypeScript — truthiness checks on strings are allowed and do not
produce type errors.

## Decision

Every public function in `packages/werkstatt/src/sternsystem/` that returns
a path string must carry a JSDoc comment documenting:

1. Whether the returned path is guaranteed to exist on disk.
2. Whether the caller must use `existsSync` (or equivalent) to verify
   directory/file presence before use.
3. The semantic meaning of the return value (computed vs. discovered).

The JSDoc pattern:

```ts
/**
 * Resolves the expected cache clone path for a system by convention.
 *
 * @returns The computed cache clone path. Always returns a string — the
 *          directory may not exist on disk. Callers MUST check with
 *          `existsSync` before relying on the path.
 */
export function resolveCacheClonePath(workspaceRoot: string, systemId: string): string {
```

## Justification

- **Alternatives considered**: Changing the return type to a branded type
  (e.g., `PathString` vs `ExistingPathString`). Rejected as over-engineering
  for this codebase — it would require a type wrapper that adds complexity
  without preventing the truthiness-check failure mode.
- **Alternatives considered**: Adding an ESLint rule that forbids `if (x)`
  on string-typed variables. Rejected because truthiness checks on strings
  are legitimate for empty-string checks, and the rule would produce too
  many false positives.
- **Constraints**: The JSDoc approach is lightweight, does not change
  runtime behavior, and provides clear guidance to the next developer
  reading the function signature.
- **Alignment**: This aligns with the existing JSDoc culture in
  `packages/werkstatt/` where public API functions carry `@param` and
  `@returns` documentation.

## Consequences

- **Positive**: Developers reading the function signature immediately know
  that the path may not exist and must be checked. This prevents the class
  of bugs where a return type change from `T | null` to `T` silently
  breaks truthiness guards.
- **Positive**: AI agents reading the codebase see the JSDoc and are
  prompted to add `existsSync` checks when using the function.
- **Negative**: JSDoc is not enforced by the type system — a developer
  can still write `if (cachePath)` without checking `existsSync`. The
  JSDoc is a documentation guard, not a type guard.
- **Technical debt**: The protection is advisory, not mechanical. A
  future RFC could introduce a branded type or lint rule for stronger
  enforcement if the advisory approach proves insufficient.

## Evolution

- If the advisory JSDoc approach fails to prevent recurrence (another
  false-positive bug traced to a missing `existsSync` check), escalate
  to a branded type or custom ESLint rule.
- If `resolveCacheClonePath` gains a variant that checks existence (e.g.,
  `resolveCacheClonePathIfExists` returning `string | undefined`), the
  JSDoc on the original function should cross-reference the variant.
- Audit other path-returning functions in `packages/werkstatt/src/sternsystem/`
  (e.g., `resolveBareRepoPath`, `resolveMirrorPath`) and apply the same
  JSDoc pattern if they share the "computed, not verified" characteristic.
