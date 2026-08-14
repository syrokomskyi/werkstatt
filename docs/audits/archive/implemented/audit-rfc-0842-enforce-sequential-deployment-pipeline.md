---
rfcId: RFC-0842
auditId: AUDIT-RFC-0842-01
date: 2026-08-14
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0842

## Verdict: Needs revision

The RFC addresses a real safety gap in the deployment pipeline, but the `--all` guard placement is underspecified relative to the actual `executeKernelCommand` control flow, and the `supportsAllSites: undefined` case is an unaddressed blind spot. Two acceptance criteria (deploy.md update, DNA-73 entry) are already satisfied in the repository, which is harmless but should be noted.

## Mechanical validation (rfc.validate)

Pass — `rfc.validate --id RFC-0842 --json` returns zero violations.

## Axis A — Structural completeness

- **deploy.md already updated.** `.devin/workflows/deploy.md` already references `leitstand.pipeline.check` (line 121) and RFC-0842 (lines 59, 134, 152, 171, 186). The acceptance criteria "deploy.md updated with exact command syntax" and "deploy.md forbids `--all` on deployment commands" are already satisfied. This is not a problem, but the implementer should verify no further changes are needed and mark these criteria as pre-met during implementation.
- **DNA-73 already in `docs/architecture-dna.md`.** Line 299–301 contains the full DNA-73 entry. The acceptance criterion "DNA-73 entry appended" is already satisfied. The implementer should verify `dna.registry.validate` passes and mark this criterion as pre-met.

## Axis B — DNA alignment

- **DNA-73 content matches RFC decision.** The DNA-73 entry at `docs/architecture-dna.md:299-301` accurately summarizes the RFC's three decisions: `--all` rejection, target logging, sequential pipeline. `satisfies: [DNA-73]` is correct.
- **`related: [DNA-62, RFC-0628, RFC-0608]`** — DNA-62 (Foundation File Integrity) exists at line 263. RFC-0628 and RFC-0608 are the canonical deployment pipeline RFCs. All references are relevant and non-decorative.

## Axis C — Ecosystem fit

- **`--all` guard placement is underspecified.** The RFC proposes adding the guard in `executeKernelCommand`, but the actual control flow has two paths:
  1. **Workspace-scoped commands** (line 380–419 in `execute-command.ts`): `wsCommand` is resolved and executed *before* `ensureTargetSites` is called. The `allSites` flag is never passed to `ensureTargetSites` for workspace commands — it's silently ignored.
  2. **App-scoped commands** (line 424+): `ensureTargetSites` is called with `allSites`, which returns all sites when `true`.

  All three leitstand deployment commands are `scope: "workspace"` (confirmed in `leitstand.module.ts:36, 73, 101`). This means the guard must be placed *after* `wsCommand` resolution but *before* the workspace command execution at line 419 — not at the top of the function where `command` is not yet resolved. The RFC's pseudocode (`if (options.allSites && command.supportsAllSites === false)`) references a `command` variable that doesn't exist at the top of the function. The implementer needs to know the exact insertion point.

- **Package boundaries are correct.** Changes are in `packages/werkstatt/src/kernel/runtime/execute-command.ts` (runner) and `packages/werkstatt/src/leitstand/leitstand-commands.ts` (handlers) — both in `@warpgogol/werkstatt`, which is listed in `packagesImpacted`.

## Axis D — Forward-only compliance

No issues. The `--all` rejection is a hard break with no compatibility shim. No dual-path. No deprecation grace period.

## Axis E — Agent-facing policy

- **Status gate is correct.** RFC is `accepted`; implementation notes say "Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented)." No self-authorizing language.
- **No `NEEDS CLARIFICATION` markers.**
- **Storage policy is clean** — no cookies, no client-side persistence.

## Axis F — Pragmatism

- **Generic guard scope vs. acceptance criteria mismatch.** The RFC explicitly says the guard applies to ALL commands with `supportsAllSites: false` ("safer and more consistent"), not just the 3 deployment commands. There are 8 commands with `supportsAllSites: false` in `leitstand.module.ts` (dev-deploy, propagate, promote, status, rollback, health, service.dev-deploy, service.promote, service.rollback). But the acceptance criteria only mention the 3 deployment commands. The criteria should either:
  - Mention the generic guard, or
  - List all affected commands, or
  - Clarify that the 3 deployment commands are the primary concern and other commands are incidentally covered.

- **`leitstand.pipeline.check` earns its existence.** Read-only state inspection is a distinct concern. The alternatives section justifies command-over-pipeline correctly.

## Axis G — Blind spots

- **`supportsAllSites: undefined` behavior.** `supportsAllSites` is optional (`?: boolean` in `KernelCommandMetadata`). The guard `command.supportsAllSites === false` uses strict equality, so `undefined` would NOT trigger the guard. Commands without explicit `supportsAllSites: false` would still silently accept `--all`. The RFC should clarify whether `undefined` should be treated as `false` (reject `--all`) or `true` (allow `--all`). The safer default is `undefined → false` (reject), but this is a design decision the RFC doesn't make.

- **`leitstand.pipeline.check` state coverage.** The RFC shows output for `ready` state only. The command needs to handle all release states: `ready`, `dev-deployed`, `alt-deployed`, `main-deployed`, and potentially error states. The `steps` array and `nextStep` logic for each state is not specified.

- **Concurrent execution.** The RFC doesn't consider what happens if two operators run deployment commands simultaneously for the same release. The lock mechanism (`acquireLock`) exists in the current code, but `leitstand.pipeline.check` is read-only — should it acquire a lock? Probably not, but this should be stated.

## Questions for the author

1. Where exactly in `executeKernelCommand` should the `--all` guard be placed? The workspace command path (line 380–419) returns before `ensureTargetSites` — the guard must be placed after `wsCommand` resolution but before execution. Can you specify the insertion point?
2. Should `supportsAllSites: undefined` be treated as `false` (reject `--all`) or `true` (allow `--all`)? The strict equality check `=== false` would let `undefined` through.
3. The acceptance criteria mention only the 3 deployment commands for `--all` rejection, but the generic guard affects all 8 commands with `supportsAllSites: false`. Should the criteria be updated to reflect the broader scope, or should the guard be limited to the 3 deployment commands?
