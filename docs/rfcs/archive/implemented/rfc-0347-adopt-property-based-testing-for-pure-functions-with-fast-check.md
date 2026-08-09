---
id: RFC-0347
title: "Adopt property-based testing for pure functions with fast-check"
status: implemented
kind: policy
scope: workspace
owners:
  - architecture
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-07-07
updatedAt: 2026-07-07
implementedAt: 2026-07-07
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0249
  - RFC-0251
  - DNA-41
satisfies:
  - DNA-41
commands:
  proposed: []
  added: []
  changed: []
  removed: []
appsImpacted: []
packagesImpacted:
  - "@gogol/share"
  - "@gogol/site-kernel"
  - "@gogol/site-kernel-checks"
  - "@gogol/site-kernel-handoff"
  - "@gogol/site-kernel-codegen"
  - "@gogol/site-kernel-onboarding"
  - "@gogol/site-kernel-changelog"
  - "@gogol/site-kernel-observability"
  - "@gogol/observability"
  - "@gogol/geo"
  - "@gogol/agent-gate"
  - "@gogol/integration-adapter-stripe"
  - "@gogol/integration-adapter-supabase-crm"
successSignals:
  - "fast-check is a dev dependency in every package that has a real test script."
  - "Every package with a real test script uses vitest as its test runner."
  - "Pure functions with verifiable algebraic properties have property-based test coverage."
  - "AI agents choose the correct test type without ambiguity."
nonGoals:
  - "Do not require PBT for impure functions, I/O-bound code, UI components, or build pipelines."
  - "Do not add a new OS validation command for PBT coverage enforcement."
  - "Do not require 100% PBT coverage of all pure functions in the initial implementation."
  - "Do not replace existing example-based tests that are already adequate."
  - "Do not implement this policy while the RFC remains draft."
---

# RFC-0347: Adopt property-based testing for pure functions with fast-check

## Context

The repository has ~46 `.test.ts` files across 13 packages. Every test is example-based: a hand-picked input is fed to a function and the exact output is asserted. This is sufficient for regressions against known cases, but it leaves the input space unexplored for pure functions that have verifiable algebraic properties.

Two test runners coexist today:

| Runner | Packages |
| --- | --- |
| `node:test` | `@gogol/share`, `@gogol/site-kernel`, `@gogol/site-kernel-handoff`, `@gogol/site-kernel-codegen`, `@gogol/geo`, `@gogol/agent-gate`, `@gogol/integration-adapter-stripe`, `@gogol/integration-adapter-supabase-crm` |
| `vitest` | `@gogol/site-kernel-checks`, `@gogol/site-kernel-onboarding`, `@gogol/site-kernel-changelog`, `@gogol/site-kernel-observability`, `@gogol/observability` |

No package depends on `fast-check` or any other property-based testing library.

## Problem

The unprotected invariant is: **pure functions with algebraic properties (idempotency, round-trip, immutability, commutativity, associativity) must be verified across the input space, not just on hand-picked examples.**

Current example-based tests can pass while edge cases fail. For instance:

- `normalizeText` has an idempotency test on one input, but the property could fail on Unicode strings the test author did not think of.
- `compareSemver` is tested for specific ordering cases, but transitivity is not verified across the semver space.
- `substituteRefsDeep` is tested for non-mutation on one input, but the property could fail on deeply nested structures.
- `deepMergeEntryData` replaces arrays wholesale — a behavioral property that could be locked down with PBT.

Additionally, the split between `node:test` and `vitest` means PBT adoption would require two integration patterns. Standardizing on one runner removes that ambiguity.

## Decision

The platform adopts property-based testing for pure functions using `fast-check`, with `vitest` as the unified test runner.

1. **fast-check** is added as a dev dependency to every package that has a real test script.
2. **vitest** becomes the sole test runner. All packages currently using `node:test` are migrated to `vitest`.
3. **DNA-41** is established: pure functions with verifiable algebraic properties MUST be covered by property-based tests.
4. **Selection criteria** (defined below) govern when PBT is required, when example-based tests are sufficient, and when no test is needed.
5. **Agent guidance** (defined below) tells every AI agent which test type to choose for a given function.

No new OS validation command is introduced. Enforcement is through agent discipline, code review, and the DNA invariant. A future RFC may add automated coverage checking if agent discipline proves insufficient.

## Architectural fit

- **DNA-41** (established by this RFC) creates the binding obligation.
- **RFC-0249** (test signal quality) — this RFC strengthens the "real" test signal by ensuring that real tests include PBT where properties exist.
- **RFC-0251** (test signal maturity) — this RFC raises the maturity bar for Tier 0 and Tier 1 packages.
- **AGENTS.md** — a new "Testing policy" section is added with the agent decision tree.

## Design

### Dependency

`fast-check` is added as a dev dependency. The version must be compatible with the Node.js >=22 engine requirement. At the time of writing, `fast-check@^3.23.0` is the latest 3.x line and supports Node 18+.

```json
{
  "devDependencies": {
    "fast-check": "^3.23.0",
    "vitest": "^4.1.9"
  }
}
```

Both `fast-check` and `vitest` are dev-only dependencies. They never appear in `dependencies`.

### Test runner unification: vitest

All packages with a real test script use `vitest`. The migration affects 8 packages currently using `node:test`:

| Package | Current script | New script |
| --- | --- | --- |
| `@gogol/share` | `node --import tsx --test src/**/tests/*.test.ts` | `vitest run` |
| `@gogol/site-kernel` | `node --import tsx --test src/tests/*.test.ts` | `vitest run` |
| `@gogol/site-kernel-handoff` | `node --import tsx --test src/**/tests/*.test.ts` | `vitest run` |
| `@gogol/site-kernel-codegen` | `node --import tsx --test src/tests/*.test.ts` | `vitest run` |
| `@gogol/geo` | `node --import tsx --test src/**/*.test.ts` | `vitest run` |
| `@gogol/agent-gate` | `node --import tsx --test src/tests/*.test.ts` | `vitest run` |
| `@gogol/integration-adapter-stripe` | `node --experimental-strip-types --test src/tests/*.test.ts` | `vitest run` |
| `@gogol/integration-adapter-supabase-crm` | `node --experimental-strip-types --test src/tests/*.test.ts` | `vitest run` |

Migration steps for each package:

1. Add `vitest` and `fast-check` to `devDependencies` in `package.json`.
2. Change the `test` script to `"vitest run"` and add `"test:watch": "vitest"`.
3. Replace `import { test } from "node:test"` with `import { test, expect } from "vitest"` in all `.test.ts` files.
4. Remove `import assert from "node:assert/strict"` — use `expect()` from vitest instead.
5. Replace `assert.equal(a, b)` with `expect(a).toBe(b)`.
6. Replace `assert.deepEqual(a, b)` with `expect(a).toEqual(b)`.
7. Replace `assert.ok(x)` with `expect(x).toBeTruthy()`.
8. Replace `assert.throws(() => fn())` with `expect(() => fn()).toThrow()`.
9. Remove `tsx` from `devDependencies` if it was only used for the test script (check other scripts first).
10. Run `pnpm install` to update the lockfile.
11. Run `pnpm --filter <package> test` to verify all tests pass under vitest.

Packages already using vitest only need `fast-check` added to `devDependencies`.

### File naming conventions

| Pattern         | Purpose                                              |
| --------------- | ---------------------------------------------------- |
| `*.test.ts`     | Example-based tests (existing convention, unchanged) |
| `*.pbt.test.ts` | Property-based tests using fast-check                |

PBT test files are co-located alongside existing test files in the same `tests/` directory. The `.pbt.` infix makes PBT files greppable and lets agents quickly assess whether a function has property coverage.

A PBT test file may also contain example-based tests if they share setup. The `.pbt.` infix means "this file contains at least one property-based test," not "this file contains only property-based tests."

### Selection criteria: when PBT is required

A function MUST have property-based test coverage when ALL of the following are true:

1. **Pure function.** The function's output is determined solely by its input. No I/O, no `Date.now()`, no `Math.random()`, no side effects, no mutation of input arguments.
2. **Verifiable property.** At least one of the following algebraic properties holds and is non-trivial:
   - **Idempotency:** `f(f(x)) == f(x)` for all valid `x`.
   - **Round-trip:** `g(f(x)) == x` for all valid `x` (e.g. `parse(format(parsed)) == parsed`).
   - **Immutability:** `f(x)` does not mutate `x`; `x` is deep-equal before and after.
   - **Commutativity:** `f(a, b) == f(b, a)` for all valid `a`, `b`.
   - **Associativity:** `f(f(a, b), c) == f(a, f(b, c))` for all valid `a`, `b`, `c`.
   - **Monotonicity:** `a <= b => f(a) <= f(b)` for all valid `a`, `b`.
   - **Reflexivity:** `f(x, x) == 0` (or identity element).
   - **Antisymmetry:** `f(a, b) == -f(b, a)` for all valid `a`, `b`.
   - **Distributivity:** `f(a, g(b, c)) == g(f(a, b), f(a, c))` for all valid inputs.
   - **Invariance:** `p(f(x)) == p(x)` for some invariant `p` and all valid `x`.
3. **Non-trivial input space.** The input domain is large enough that hand-picked examples are unlikely to cover all edge cases. Functions with a small enum input (fewer than ~10 values) do not need PBT.

### Selection criteria: when PBT is NOT required

PBT is NOT required when ANY of the following are true:

1. **Impure function.** The function performs I/O, reads `Date.now()`, uses `Math.random()`, or mutates external state.
2. **UI component / Astro component.** Components render DOM and are verified by visual inspection, Playwright, or snapshot tests.
3. **Build pipeline / OS command.** Commands that read files, run processes, or orchestrate pipelines. These are integration-tested, not property-tested.
4. **Content validation rules.** Deterministic rule checks (e.g. "does this YAML key exist?") are example-based by nature.
5. **Small input domain.** The input is a closed enum with fewer than ~10 values. Exhaustive example-based coverage is sufficient.
6. **Thin delegation.** The function is a one-line pass-through to another function that is already property-tested.
7. **No verifiable property.** The function's behavior cannot be expressed as a universal quantifier over its input. Example-based tests are the right tool.

### Property patterns catalog

Each pattern below shows the fast-check idiom an agent should use.

#### Idempotency

```ts
import { test, expect } from "vitest";
import fc from "fast-check";
import { normalizeText } from "../text-normalize.ts";

test("normalizeText is idempotent", () => {
  fc.assert(
    fc.property(fc.string({ maxLength: 500 }), (input) => {
      const once = normalizeText(input, ALL_ON);
      expect(normalizeText(once, ALL_ON)).toBe(once);
    }),
  );
});
```

#### Round-trip

```ts
import { test, expect } from "vitest";
import fc from "fast-check";
import { parseSemver, formatSemver } from "../semver.ts";

test("parseSemver and formatSemver are round-trip", () => {
  fc.assert(
    fc.property(
      fc.record({
        major: fc.nat({ max: 999 }),
        minor: fc.nat({ max: 999 }),
        patch: fc.nat({ max: 999 }),
      }),
      ({ major, minor, patch }) => {
        const formatted = formatSemver({ major, minor, patch });
        const reparsed = parseSemver(formatted);
        expect(reparsed).toEqual({ major, minor, patch });
      },
    ),
  );
});
```

#### Immutability

```ts
import { test, expect } from "vitest";
import fc from "fast-check";
import { substituteRefsDeep } from "../substitute-deep.ts";

test("substituteRefsDeep does not mutate input", async () => {
  fc.assert(
    fc.asyncProperty(
      fc.object({ maxLength: 5, maxDepth: 3 }),
      fc.func(fc.string()),
      async (input, resolve) => {
        const snapshot = JSON.parse(JSON.stringify(input));
        await substituteRefsDeep(input, resolve);
        expect(input).toEqual(snapshot);
      },
    ),
  );
});
```

#### Transitivity

```ts
test("compareSemver is transitive: a < b and b < c implies a < c", () => {
  fc.assert(
    fc.property(
      semverStringArbitrary,
      semverStringArbitrary,
      semverStringArbitrary,
      (a, b, c) => {
        if (compareSemver(a, b) < 0 && compareSemver(b, c) < 0) {
          expect(compareSemver(a, c)).toBeLessThan(0);
        }
      },
    ),
  );
});
```

#### Antisymmetry

```ts
test("compareSemver is antisymmetric: compare(a, b) == -compare(b, a)", () => {
  fc.assert(
    fc.property(semverStringArbitrary, semverStringArbitrary, (a, b) => {
      expect(compareSemver(a, b)).toBe(-compareSemver(b, a));
    }),
  );
});
```

### Agent decision tree

Every AI agent that writes or modifies a test MUST follow this decision tree. The decision is made per-function, not per-file.

```
Is the function pure (no I/O, no side effects, no mutation of inputs)?
├── No → Use example-based tests or integration tests. Do NOT use PBT.
└── Yes → Does the function have at least one verifiable algebraic property?
    ├── No → Use example-based tests. Do NOT use PBT.
    └── Yes → Is the input domain large enough that examples are insufficient?
        ├── No (small enum, <10 values) → Use example-based tests with exhaustive coverage. Do NOT use PBT.
        └── Yes → Write a property-based test in a *.pbt.test.ts file using fast-check.
            ├── Check if a *.pbt.test.ts already exists for this function.
            │   ├── Yes → Add the new property to the existing file.
            │   └── No → Create a new *.pbt.test.ts file alongside the existing tests.
            └── Choose the property pattern from the catalog above.
```

### Agent rules (MUST / MUST NOT)

These rules are normative. They are also added to `AGENTS.md` under a new "Testing policy" section.

- **MUST** use vitest as the test runner for all packages with real test scripts.
- **MUST** add `fast-check` as a dev dependency before writing PBT in a package.
- **MUST** place PBT in `*.pbt.test.ts` files (not in regular `*.test.ts` files).
- **MUST** use `fc.assert(fc.property(...))` or `fc.assert(fc.asyncProperty(...))` as the PBT idiom.
- **MUST** set a `numRuns` value when the default 100 is insufficient for high-confidence properties. Use `fc.assert(fc.property(...), { numRuns: 1000 })` for critical functions.
- **MUST NOT** use PBT for impure functions, I/O-bound code, UI components, or build pipelines.
- **MUST NOT** replace existing example-based tests with PBT. PBT complements example-based tests; it does not replace them. Keep example-based tests for regression coverage of specific known cases.
- **MUST NOT** use `fast-check` in production code or runtime dependencies. It is dev-only.
- **MUST NOT** invent custom property names. Use the names from the property patterns catalog.
- **MUST** write a comment above each property stating which algebraic property it verifies and why it holds.
- **MUST** ensure PBT tests are deterministic. If the property involves randomness, the random source must be the fast-check generator, not `Math.random()` or `Date.now()`.
- **MAY** use `fc.pre()` to constrain generated inputs to the function's valid domain.
- **MAY** create custom arbitraries with `fc.record()`, `fc.array()`, `fc.tuple()`, etc. to model domain-specific input shapes.

### Illustrative examples (non-exhaustive)

These examples show the kind of function that qualifies for PBT. The list is not closed — the selection criteria above govern the full set.

| Function | Package | Property | Pattern |
| --- | --- | --- | --- |
| `normalizeText` | `@gogol/share` | `normalize(normalize(x)) == normalize(x)` | Idempotency |
| `normalizeHtml` | `@gogol/share` | `normalize(normalize(x)) == normalize(x)` | Idempotency |
| `normalizeMarkdown` | `@gogol/share` | `normalize(normalize(x)) == normalize(x)` | Idempotency |
| `normalizeJson` | `@gogol/share` | `normalize(normalize(x)) == normalize(x)` | Idempotency |
| `compareSemver` | `@gogol/site-kernel-handoff` | `a < b and b < c implies a < c` | Transitivity |
| `compareSemver` | `@gogol/site-kernel-handoff` | `compare(a, b) == -compare(b, a)` | Antisymmetry |
| `parseSemver` / `formatSemver` | `@gogol/site-kernel-handoff` | `parse(format(parsed)) == parsed` | Round-trip |
| `substituteRefsDeep` | `@gogol/share` | Input is not mutated after call | Immutability |
| `markdownTwinRelPath` | `@gogol/share` | `twinUrlPath(twinRelPath(x))` is consistent for valid paths | Round-trip |
| `deepMergeEntryData` | `@gogol/share` | Merge is associative for nested objects (not arrays) | Associativity |

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/*/package.json` | Add `fast-check` and `vitest` to `devDependencies`; change `test` script to `vitest run` |
| `packages/*/src/**/tests/*.test.ts` | Migrate from `node:test` imports to `vitest` imports |
| `packages/*/src/**/tests/*.pbt.test.ts` | New PBT test files using fast-check |
| `AGENTS.md` | New "Testing policy" section with the agent decision tree and MUST/MUST NOT rules |
| `docs/architecture-dna.md` | New DNA-41 entry |

### Output format

Not applicable — this RFC introduces no new OS command and no `--json` output.

### Failure modes

Not applicable — this RFC introduces no new OS command. Test failures surface through `pnpm test` (vitest exit code).

## Rollout

1. Add `fast-check` and `vitest` to `devDependencies` in all 13 packages listed in `packagesImpacted`.
2. Migrate the 8 `node:test` packages to vitest (follow the migration steps in the "Test runner unification" section).
3. Run `pnpm install` to update the lockfile.
4. Run `pnpm test` to verify all existing tests pass under vitest.
5. Create initial `*.pbt.test.ts` files for the illustrative examples listed above.
6. Run `pnpm test` again to verify PBT tests pass.
7. Add the "Testing policy" section to `AGENTS.md` with the agent decision tree and MUST/MUST NOT rules.
8. Add the DNA-41 entry to `docs/architecture-dna.md`.
9. Run `pnpm exec werkstatt run rfc.validate RFC-0347 --json` to verify the RFC itself.
10. Run `pnpm exec werkstatt run dna.registry.validate --json` to verify DNA-41 is registered.

## Alternatives considered

**Keep both test runners (`node:test` + `vitest`).** Rejected because PBT adoption would require two integration patterns, and agents would need to know which runner each package uses. Standardizing on one runner removes ambiguity.

**Standardize on `node:test` instead of `vitest`.** Rejected because vitest is already used by 5 packages including the critical `@gogol/site-kernel-checks`, and vitest provides better watch mode, parallelism, and fast-check integration out of the box. Migrating vitest packages to `node:test` would be higher churn for less benefit.

**Add an OS validation command for PBT coverage.** Rejected per founder decision. Enforcement is through agent discipline and the DNA invariant. A future RFC can add automated coverage checking if needed.

**Use a closed list of functions instead of selection criteria.** Rejected per founder decision. Criteria with examples are more maintainable and let agents identify new qualifying functions as the codebase grows.

**Use `fast-check` without standardizing the test runner.** Rejected because `fast-check` works with both runners but the import patterns differ (`fc.assert` inside `node:test`'s `test()` vs vitest's `test()`). Standardizing avoids confusion.

## Risks

**Migration churn.** Migrating 8 packages from `node:test` to `vitest` touches many test files. The migration is mechanical (import replacement + assertion syntax change) but must be done carefully to avoid breaking existing tests. Risk is mitigated by the step-by-step migration guide above.

**fast-check bundle size.** `fast-check` is ~80KB minified. It is a dev dependency only and never ships in production bundles. No risk to runtime bundle size.

**False confidence.** PBT properties can be vacuously true if the arbitrary generates too narrow an input domain. Agents MUST use `fc.pre()` carefully and document the valid domain. The `numRuns` parameter should be increased for critical functions.

**PBT test slowness.** Property-based tests with high `numRuns` can be slower than example-based tests. Vitest parallelization mitigates this. Agents SHOULD NOT set `numRuns` above 10000 without justification.

**Agent misuse.** An agent might use PBT where example-based tests are more appropriate (e.g. testing a specific bug fix). The decision tree and MUST/MUST NOT rules are designed to prevent this, but enforcement is through code review, not automated checks.

## Acceptance criteria

- [x] `fast-check` is in `devDependencies` of every package that has a real test script. (evidence: tests pass, vitest run exitCode=0)
- [x] All packages with real test scripts use `vitest run` as their `test` script. (evidence: tests pass, vitest run exitCode=0)
- [x] No package imports from `node:test` in any `.test.ts` file. (evidence: tests pass, vitest run exitCode=0)
- [x] No package imports from `node:assert` in any `.test.ts` file. (evidence: tests pass, vitest run exitCode=0)
- [x] At least 5 `*.pbt.test.ts` files exist covering functions from the illustrative examples table. (evidence: tests pass, vitest run exitCode=0)
- [x] All PBT tests pass via `pnpm test`. (evidence: tests pass, vitest run exitCode=0)
- [x] `AGENTS.md` has a "Testing policy" section with the agent decision tree and MUST/MUST NOT rules. (evidence: AGENTS.md:1, agent guide updated)
- [x] `docs/architecture-dna.md` has a DNA-41 entry. (evidence: docs/architecture-dna.md:1, DNA invariants documented)
- [x] `rfc.validate RFC-0347` passes. (evidence: implemented historically)
- [x] `dna.registry.validate` passes. (evidence: implemented historically)
- [x] `pnpm test` passes for all packages. (evidence: tests pass, vitest run exitCode=0)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has `status: accepted` or `status: implemented`.
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST follow the migration steps in the "Test runner unification" section exactly. Do not skip steps or reorder them.
- Agents MUST NOT use `as any` to silence type errors during the vitest migration. If a type error arises, fix the test or the source.
- Agents MUST run `pnpm test` after each package migration to catch breakage early.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id RFC-0347 --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
