---
id: ADR-0019
title: "Require property-based tests for HTML and CSS mutator functions"
# Lifecycle (RFC-0367 parity with RFCs):
#   proposed → reviewing → accepted → implemented
#   any → superseded (requires supersededBy)
#   any → rejected
status: proposed
scope: package
decider: architecture
createdAt: 2026-08-02
updatedAt: 2026-08-02
implementedAt:
closedAt:
supersedes: []
supersededBy:
related:
  - DNA-41
  - RFC-0185
  - RFC-0235
reviewers:
  - human:andrii-syrokomskyi
---

# ADR-0019: Require property-based tests for HTML and CSS mutator functions

## Context

DNA-41 establishes property-based testing (PBT) for pure functions with verifiable algebraic properties. The existing `stripGeneratedMarker` function in `packages/os/site-kernel/src/generated-marker.ts` and `normalizeHtml` in `packages/share/src/text-normalize.ts` are pure functions that mutate HTML/CSS strings via regex. They have unit tests with fixed inputs, but no property-based tests that verify structural invariance across arbitrary inputs.

A real bug demonstrated the gap: `stripGeneratedMarker`'s regex swallowed content between separate HTML comments, removing `<main>` from the `/open-source/` page. Fixed-input tests did not catch this because the test cases did not include HTML with multiple comments where only one contained the GENERATED marker.

## Decision

Any pure function that mutates HTML or CSS strings via regex or string operations MUST have property-based tests verifying structural invariance:

- **Tag balance preservation**: for arbitrary HTML input with balanced structural tags, the output MUST also have balanced structural tags.
- **Comment isolation**: for arbitrary HTML with N comments where only one contains the target pattern, the output MUST preserve all other comments and all non-comment content.
- **Idempotency**: applying the mutator twice produces the same output as applying it once.
- **No content creation**: the output MUST NOT contain HTML tags that were not present in the input.

PBT tests use `fast-check` (already a dev dependency, DNA-41) and live in `*.pbt.test.ts` files alongside existing unit tests.

- Applies to: `stripGeneratedMarker`, `normalizeHtml`, and any future HTML/CSS mutator functions.
- Does not apply to: functions that only read/parse HTML without mutating it.

## Justification

- **DNA-41 alignment**: DNA-41 already mandates PBT for pure functions with verifiable properties. HTML/CSS mutators have clear algebraic properties (tag balance, comment isolation, idempotency) that are verifiable with fast-check.
- **Bug prevention**: the `stripGeneratedMarker` bug would have been caught by a property test generating HTML with multiple comments and verifying that non-marker content is preserved.
- **Fixed-input tests are insufficient**: regex edge cases depend on the interaction between input structure and regex semantics. Property-based testing explores the input space systematically, finding edge cases that hand-written tests miss.
- **Low overhead**: fast-check is already a dev dependency. PBT tests are pure and fast (no I/O, no kernel types).

## Consequences

- **Positive**: systematic exploration of input space catches regex edge cases that fixed-input tests miss.
- **Positive**: structural invariance properties are machine-checkable and run on every CI build.
- **Negative**: PBT tests are slower than fixed-input tests (fast-check runs 100+ iterations by default). Mitigated by keeping the property set small (4 properties) and using fast-check's default iteration count.
- **Negative**: writing fast-check arbitraries for HTML requires care (generating valid-ish HTML with comments, tags, attributes). The arbitraries are reusable across mutator tests.
- **Technical debt**: existing mutators (`stripGeneratedMarker`, `normalizeHtml`) get PBT tests retroactively. New mutators must include PBT tests from the start.

## Evolution

- **Revisit if**: fast-check introduces breaking changes that require significant test rewrites.
- **Revisit if**: the HTML arbitrary generators become too complex to maintain — consider switching to a fixture-based approach with a curated set of edge cases.
- **Revisit if**: a new class of mutator (e.g., JSON mutators) needs different properties — extend the property set rather than replacing it.
