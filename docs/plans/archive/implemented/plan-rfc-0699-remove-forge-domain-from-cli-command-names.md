---
rfcId: RFC-0699
planId: PLAN-RFC-0699-01
date: 2026-08-05
author: fo-idea-plan
---

# Plan: RFC-0699 — Remove forge. domain from CLI command names

## Goal

Make the `forge` CLI accept unqualified command names (`create`, `doctor`, `build`, etc.) while keeping the old `forge.*` forms as deprecated one-minor aliases that emit a warning. Update all documentation and skill references to the unqualified forms in the same change.

## Files to modify

- `packages/forge/bin/cli.ts` — command-name resolution and deprecation warning.
- `packages/forge/README.md` — examples and command snippets.
- `packages/forge/README.uk.md` — Ukrainian examples.
- `packages/forge/skills/*/SKILL.md` — command references in forge skill instructions.

## Steps

1. Add `resolveCommandName(commandName, registry)` to `packages/forge/bin/cli.ts`.
   - Return `commandName` if it is already a known key.
   - If `commandName` has no dot and a `forge.${commandName}` key exists, emit `logger.warn` and return the qualified key.
   - Otherwise return `undefined`.
2. Wire `resolveCommandName` into the `main()` dispatch path so that `forge create` resolves to `forge.create`.
3. Run `pnpm --filter @warpgogol/forge exec tsc --noEmit` to verify typecheck.
4. Build the package and verify `forge --help` lists unqualified names and `forge create --name test --profile forge-shell` runs.
5. Update `README.md` and `README.uk.md` examples to unqualified names.
6. Search `packages/forge/skills/` for `forge.` command references and replace with unqualified names where the context is the `forge` binary.
7. Run `rfc.validate --id RFC-0699` and fix any violations.
8. Mark every acceptance criterion with `[x]` and inline `(evidence: <file:line>)` annotations.
9. Run `rfc.implement.stamp --id RFC-0699 --implementation-commit <sha>` and commit the stamped RFC.

## Verification

- `rfc.validate --id RFC-0699` passes.
- `packages/forge/build:check` passes.
- `forge --help` shows unqualified names.
- `forge create --name test --profile forge-shell` exits 0.
