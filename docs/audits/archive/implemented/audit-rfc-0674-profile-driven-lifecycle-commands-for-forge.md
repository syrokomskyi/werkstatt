---
rfcId: RFC-0674
auditId: AUDIT-RFC-0674-01
date: 2026-08-04
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0674

## Verdict: Needs revision

Two factual errors in nonGoals cross-references and a file name conflict with RFC-0677 need fixing before implementation. The core design is sound — profile-driven lifecycle commands are a natural extension of the existing profile system.

## Mechanical validation (rfc.validate)

Pass — 0 violations.

## Axis A — Structural completeness

**Finding A-1: nonGoals have incorrect RFC cross-references.** The nonGoals section at line 65-67 states:

- "Determinism verification (deferred to RFC-0677)" — should be **RFC-0678** (RFC-0677 is artifact validation, not determinism).
- "Asset management (deferred to RFC-0678)" — should be **RFC-0679** (RFC-0678 is determinism, not asset management).
- "Release lifecycle (deferred to RFC-0679)" — should be **RFC-0680** (RFC-0679 is asset management, not release lifecycle).

The RFC numbers are shifted by one throughout the nonGoals list.

## Axis B — DNA alignment

No issues. `satisfies: [DNA-54]` is correct — DNA-54 (Forge bindings contract) exists in `docs/architecture-dna.md:231` and the RFC body at line 115 explains how profile-driven commands extend the bindings principle. No conflict with existing DNA invariants.

## Axis C — Ecosystem fit

**Finding C-1: File name conflict with RFC-0677.** RFC-0674's file system responsibilities table (line 235) proposes `packages/forge/os/core/handlers/validate-artifacts.ts` for the `forge.validate` handler. RFC-0677's file system responsibilities table (line 181) proposes the **same file** `packages/forge/os/core/handlers/validate-artifacts.ts` for the `forge.validate.artifacts` handler. Both RFCs create the same file for different commands. RFC-0674 should rename its handler file to `validate.ts` or `lifecycle-validate.ts`, leaving `validate-artifacts.ts` for RFC-0677's structured reporter.

## Axis D — Forward-only compliance

No issues. No compatibility shims, no dual-paths, no legacy code maintained behind a flag.

## Axis E — Agent-facing policy

No issues. Status gate is correct — implementation notes say "Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented)." No self-authorizing language.

## Axis F — Pragmatism

No issues. Three commands (dev, build, validate) each earn their existence — dev is long-running, build produces output, validate checks output. TypeScript contracts are minimal. The RFC extends the existing profile system rather than creating a new one.

## Axis G — Blind spots

**Finding G-1: `ForgeDevResult` exit code on Ctrl+C unspecified.** The `ForgeDevResult` interface (line 187) has `exitCode: number`, but the RFC says `forge dev` is long-running and "Ctrl+C terminates the child process" (line 276). The exit code on Ctrl+C termination is not specified. Should it be 0 (graceful shutdown) or 130 (SIGINT convention)?

**Finding G-2: Testability of command execution not addressed.** Acceptance criteria require unit tests verifying `forge build` executes the produce command (line 313), but the RFC doesn't address how `child_process.exec` will be mocked in unit tests. The implementation should use a injectable exec wrapper or test-friendly abstraction.

## Questions for the author

1. Should the `forge.validate` handler file be renamed to `validate.ts` to avoid collision with RFC-0677's `validate-artifacts.ts`?
2. What exit code should `forge dev` return when terminated via Ctrl+C (SIGINT)?
3. How will `child_process.exec` be mocked in unit tests for `forge build` and `forge validate`?
