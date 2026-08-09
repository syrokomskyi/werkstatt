---
rfcId: RFC-0542
auditId: AUDIT-RFC-0542-01
date: 2026-07-26
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0542

## Verdict: Needs revision

The RFC introduces a well-scoped, additive output contract (`nextSteps`, IDE recommendation, registry-driven help) that fits forge's autonomous CLI surface. However, `commands.changed` and acceptance criteria reference two commands (`forge.create`, `forge.upgrade`) that do not exist in the codebase — they are proposed by draft RFC-0544 and RFC-0543 respectively. Listing phantom commands as "changed" violates the command-lifecycle bucket semantics. The DNA-54 satisfaction claim is also tangential: DNA-54 governs skill body literals, not command output shape.

## Mechanical validation (rfc.validate)

Pass — no violations targeting RFC-0542.

## Axis A — Structural completeness

- **Decision** is a single present-tense decision ✓
- **CLI surface** shows exact `--json` and pretty-mode examples ✓
- **TypeScript contracts** are minimal type signatures, not implementations ✓
- **File system responsibilities** table names concrete paths (`bin/cli.ts`, `src/types.ts`, `os/**`) ✓
- **Output format** documents both `--json` and pretty shapes ✓
- **Failure modes** specifies exit codes and warn-vs-fail behavior ✓
- **Rollout** describes default behavior and incremental adoption ✓
- **Alternatives considered** is honest — three real alternatives with rejection reasons ✓
- **Risks** includes agent misinterpretation risk ✓
- **Acceptance criteria** are mostly checkable, but see Axis C for phantom-command criteria ✓/✗
- **Implementation notes** are explicit behavioral rules ✓
- Minor: The `printHelp` section says "the hand-maintained command list in `bin/cli.ts` is removed" but the current `printHelp` (`bin/cli.ts:172-220`) already has a partially generated section — "Registered commands" at the bottom from `registry.listCommandNames()`. The RFC should acknowledge the current hybrid state and specify that the _entire_ help body becomes registry-driven, not just "the command list".

## Axis B — DNA alignment

- **FAIL (minor)**: `satisfies: [DNA-54]` — DNA-54 states: "Canonical forge skill bodies (`packages/forge/skills/**/*.md`) must not contain hardcoded project-specific literals in instruction lines." The RFC's `nextSteps` field is described as "the machine-readable analogue of bindings" (Architectural fit section), but DNA-54 is specifically about skill body _literals_, not command output shape. The `nextSteps` field doesn't enforce, protect, or extend the DNA-54 invariant — it's a separate concept operating on a different surface (command results vs. skill instruction lines). The RFC should either:
  - Remove DNA-54 from `satisfies[]` and reference it in `related[]` instead (it's related, not satisfied), or
  - Add a new DNA invariant for command output contracts and reference that, or
  - Substantially strengthen the "how" explanation to argue that `nextSteps` extends the de-hardcoding principle of DNA-54 from skill bodies to command output — but this is a stretch.

## Axis C — Ecosystem fit

- **FAIL**: `commands.changed` lists `forge.create` and `forge.upgrade` — these commands do not exist in the codebase. `forge.create` is proposed by RFC-0544 (status: draft) and `forge.upgrade` is proposed by RFC-0543 (status: draft). `commands.changed` must list _existing registered commands_ that this RFC modifies. Non-existent commands cannot be "changed" — they would be "added" by their own introducing RFCs. These entries should be removed from `commands.changed`. The RFC body may note that when RFC-0543/0544 are implemented, their commands must conform to the `nextSteps` contract from day one.
- **FAIL**: Acceptance criteria items 2 and 3 reference `forge.create` and `forge.upgrade` which don't exist. These criteria are not checkable until those RFCs are implemented. They should be removed or conditioned on the existence of those commands.
- Package boundaries: `packagesImpacted: [forge]` is correct — all changes are in `packages/forge/` ✓
- Pipeline placement: N/A (no new pipeline checks) ✓
- Compass sync: No `docs/*.xml` synchronization needed — this is a forge-internal CLI contract ✓
- AGENTS.md updates: `packages/forge/AGENTS.md` is mentioned in acceptance criteria ✓

## Axis D — Forward-only compliance

- No compatibility shims or dual-paths ✓
- `nextSteps?` is optional on `ForgeCommandResult.data` for incremental migration, but specific commands (`forge.init`, `forge.create`, `forge.scaffold`, `forge.doctor`, `forge.upgrade`) MUST set it from day one — this is additive, not a dual-path ✓
- `printHelp` hand-maintained list is removed, not maintained alongside the generator ✓

## Axis E — Agent-facing policy

- No self-authorizing language — "Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented)" ✓
- Implementation notes reference correct governance rules ✓
- Anti-fabrication: N/A (no content authoring) ✓
- Storage policy: N/A ✓

## Axis F — Pragmatism

- `ForgeNextStep` type is minimal (two fields) ✓
- `renderNextSteps`, `renderIdeRecommendation`, `generateHelp` are focused single-responsibility functions ✓
- `--help <command>` flag is a reasonable extension of existing `--help` ✓
- The optional `nextSteps?` with mandatory population for lifecycle commands is a pragmatic migration approach ✓
- No speculative generality in the TypeScript contracts ✓

## Axis G — Blind spots

- **Missing**: The RFC doesn't consider what happens when a `nextSteps` entry references a command that isn't registered in autonomous mode. The forge CLI (`bin/cli.ts:140-164`) gracefully skips compass and werkstatt modules when `@gogol/*` imports fail — those commands are absent from the registry. A handler's hardcoded `nextSteps` might say "run compass.validate" but that command may not be available. The RFC should specify whether: (a) handlers must produce environment-aware `nextSteps`, (b) the CLI filters `nextSteps` to only reference registered commands, or (c) this is acceptable (the step is guidance, not a guarantee).
- Performance: `generateHelp` iterates the registry — trivial cost ✓
- Edge cases: Empty `nextSteps` for pass-state validators is considered ✓
- Migration path: existing handlers without `nextSteps` continue to work ✓

## Questions for the author

1. `forge.create` and `forge.upgrade` are listed in `commands.changed` and acceptance criteria, but these commands don't exist yet (proposed by RFC-0543 and RFC-0544, both draft). Should the RFC remove them from `commands.changed` and limit acceptance criteria to currently-existing commands (`forge.init`, `forge.scaffold`, `forge.doctor`), or declare an explicit dependency on those RFCs?
2. DNA-54 is about skill body literals (`packages/forge/skills/**/*.md`), not command output shape. The `nextSteps` field operates on `ForgeCommandResult.data`, a different surface. Should DNA-54 remain in `satisfies[]` with a stronger justification, or move to `related[]`?
3. When a `nextSteps` entry references a command that isn't registered in autonomous mode (e.g., `compass.validate`, `werkstatt.*` which gracefully skip), should the CLI filter `nextSteps` to only reference registered commands, or should handlers be responsible for environment-aware steps?
