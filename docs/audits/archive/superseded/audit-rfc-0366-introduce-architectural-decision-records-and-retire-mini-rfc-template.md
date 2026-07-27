---
rfcId: RFC-0366
auditId: AUDIT-RFC-0366-01
date: 2026-07-10
auditor:
  skill: wg-rfc-audit
  model: claude-sonnet-4-20250514
verdict: approved
---

# Audit: RFC-0366

## Verdict: Approved

RFC-0366 cleanly separates lightweight local decision records (ADRs) from full RFC governance, retires the unused mini-template, and extends the existing Site OS command model without adding backward-compatibility shims. Findings are minor operational clarifications, not blockers.

## Mechanical validation (rfc.validate)

Pass. No violations targeting RFC-0366.

## Axis A — Structural completeness

No issues. All required sections are present and populated. Decision is stated in present tense. CLI surface, TypeScript contracts, file system responsibilities, output formats, failure modes, rollout, alternatives, risks, acceptance criteria, and agent notes are concrete.

## Axis B — DNA alignment

No issues. `satisfies: [DNA-1, DNA-35]` are real invariants. The body explains how ADR scoping supports DNA-1 and how `adr.validate` integrates into the `app.contract.full` readiness signal (DNA-35). The RFC does not establish a new DNA invariant, so no `docs/architecture-dna.md` update is required.

## Axis C — Ecosystem fit

Minor clarification: when `adr.create`, `adr.validate`, and `adr.list` are registered, the implementation must also regenerate `docs/command-manifest.generated.json` and `docs/COMMANDS.md` via `command.manifest.generate` and `docs.commands.generate` (RFC-0266 / AGENTS.md command discovery). The RFC mentions pipeline integration but not the manifest regeneration step; add it during implementation.

## Axis D — Forward-only compliance

No issues. The mini-template is deleted, the `--mini` flag is removed, and existing command/policy RFCs are expected to already use the full template. No dual-path or grace-period mechanism is proposed.

## Axis E — Agent-facing policy

No issues. Status gates are respected: agents may create ADR drafts but cannot move them out of `proposed`. The RFC correctly references RFC-0224, RFC-0329, RFC-0334, and RFC-0335. The reviewer default rule (`human:andrii-syrokomskyi`) is aligned with `docs/rfcs/rfc-0000-template.md`.

## Axis F — Pragmatism

No issues. Three new commands earn their place: `adr.create` (scaffold), `adr.validate` (fail-hard gate), `adr.list` (discoverability). The decision to keep ADRs separate from the `rfc.*` domain is justified by the different lifecycle and validation rules.

## Axis G — Blind spots

Two minor operational items:

1. **Empty-state behavior.** `adr.validate` on a workspace with zero ADRs should pass with count 0, not fail. The implementation should mirror `rfc.validate` empty-directory handling.
2. **Manifest regeneration.** As noted in Axis C, command manifest and generated commands docs must be refreshed when new commands land; this is easy to forget during a governance-only RFC.

## Questions for the author

1. Should the `adr.create` default `decider` be `architecture` (as drafted) or should it allow `human:<handle>` defaults similar to the RFC reviewer default? Not blocking, but worth making explicit in the skill instructions.
2. Do we need a lightweight `adr.check` command later to verify that files referenced in ADRs still exist, analogous to `rfc.check`? Out of scope for Phase 1, but consider mentioning as future work.
3. Should `adr.list` include a `--related-rfc` filter so agents can find all ADRs linked to a specific RFC? Useful but not required for v1.
