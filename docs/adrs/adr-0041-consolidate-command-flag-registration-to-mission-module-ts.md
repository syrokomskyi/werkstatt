---
id: ADR-0041
title: "Consolidate command flag registration to mission.module.ts"
status: implemented
scope: package
decider: architecture
createdAt: 2026-08-11
updatedAt: 2026-08-11
implementedAt: 2026-08-11
closedAt:
supersedes: []
supersededBy:
related:
  - RFC-0801
  - RFC-0796
reviewers:
  - human:andrii-syrokomskyi
---

# ADR-0041: Consolidate command flag registration to mission.module.ts

## Context

The `mission.close` command is registered in two places:

1. `packages/werkstatt/src/mission/mission.module.ts` — the active registration used by the CLI runtime. This is the schema that validates flags on input.
2. `packages/werkstatt/src/mission/index.ts` — a secondary registration that appears to be legacy or unused by the CLI.

The two registrations diverged: `mission.module.ts` listed only `skip-evidence-sync` as a boolean flag, while `index.ts` listed `skip-evidence-sync`, `skip-auto-archive`, `skip-auto-sync`, `skip-content-regression`, and `skip-template-sync`. The code in `mission-close.ts` reads all five flags via `flagBoolean()`, but the CLI rejected `--skip-auto-archive` because `mission.module.ts` did not declare it.

This caused a 15-minute debugging delay during the m000047 deployment session: the operator tried `--skip-auto-archive` (which the code supports), the CLI rejected it (because the schema didn't list it), and the root cause was in a different file than expected.

## Decision

`mission.module.ts` is the single source of truth for command flag registration in the mission module. `index.ts` must not register commands with flags — it may re-export types or functions, but command registration (including flag schemas) lives exclusively in `*.module.ts` files.

When adding or changing a flag on any mission command:

1. Update `mission.module.ts` only.
2. Do NOT update `index.ts` — it must not contain flag schemas.
3. Verify with `pnpm exec werkstatt run <command> --help` that the flag appears.

## Justification

- The CLI runtime loads `*.module.ts` files for command registration. `index.ts` registrations are either dead code or override targets that create confusion.
- Divergent registrations are a silent bug: the code works (flags are read), but the CLI rejects them (schema validation fails). This is hard to debug because the root cause is in a different file than the error.
- Consolidating to one file eliminates the class of "flag exists in code but not in schema" bugs.

## Consequences

- `index.ts` may need cleanup to remove duplicate command registrations.
- Other modules (release, leitstand, etc.) should audit for the same pattern and consolidate if found.
- Adding a flag requires updating only one file, reducing the chance of divergence.

## Evolution

- If other modules (release, leitstand, bordbuch, etc.) are found with the same duplicate registration pattern, consolidate them to their respective `*.module.ts` files following the same principle.
- If a future RFC introduces a new module type that requires a different registration mechanism, this decision may be superseded by a new ADR.
