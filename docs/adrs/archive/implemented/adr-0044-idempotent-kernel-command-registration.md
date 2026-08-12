---
id: ADR-0044
title: "Idempotent kernel command registration for same-handler duplicates"
status: accepted
scope: package
decider: architecture
createdAt: 2026-08-12
updatedAt: 2026-08-12
implementedAt: 2026-08-12
supersedes: []
supersededBy:
related:
  - RFC-0816
reviewers: []
---

# ADR-0044: Idempotent kernel command registration for same-handler duplicates

## Context

`KernelRegistry.registerCommand` threw unconditionally on any duplicate command name. This caused `build.prepare.dev` pipeline crashes when two modules accidentally registered the same command (e.g. `open-source.generate` in both `check` and `service` modules). See RFC-0816 for the full incident.

## Decision

`registerCommand` is idempotent when the same `execute` function is registered twice. It only throws when two **different** `execute` functions claim the same name.

## Justification

- Crashing the entire pipeline on a benign duplicate is disproportionate — the command works correctly regardless of which module registered it first.
- The `===` reference comparison on `execute` is a reliable signal that both registrations point to the same handler (same import, same function object).
- Different `execute` functions with the same name remain a genuine conflict that must fail loudly.

## Consequences

- **Positive**: Pipeline resilience against accidental duplicates from module refactoring.
- **Positive**: Clearer error message distinguishes benign duplicates from genuine conflicts.
- **Negative**: Silent no-op could hide redundant registrations. Mitigated by the regression test and the fact that genuine conflicts still throw.

## Evolution

If reference equality on `execute` proves too strict (e.g. same function re-wrapped in a closure), consider comparing by function name + source length. No current need — the `===` check covers the common case of the same imported function registered by two modules.
