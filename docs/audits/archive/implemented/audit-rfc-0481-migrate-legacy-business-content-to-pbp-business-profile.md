---
rfcId: RFC-0481
auditId: AUDIT-RFC-0481-01
date: 2026-07-21
auditor:
  skill: fo-idea-audit
  model: unknown
verdict: needs-revision
---

# Audit: RFC-0481

## Verdict: Needs revision

The RFC addresses a real problem (PBP compiler cannot find the Business singleton), but proposes a dual-collection strategy that violates forward-only (Axis D), amends an already-implemented RFC instead of creating a follow-up, and has missing required sections (V-13).

## Mechanical validation (rfc.validate)

Pass with warnings:

- V-13: Missing sections: Rollout, Alternatives considered, Acceptance criteria, Implementation notes for agents
- V-19: RFC-0471.amendedBy and RFC-0479.amendedBy do not include RFC-0481 (bidirectional link missing)

## Axis A — Structural completeness

- **Fail:** Missing required sections: `## Rollout`, `## Alternatives considered`, `## Acceptance criteria`, `## Implementation notes for agents`. The RFC has `## Risks` but not the full set required by V-13.
- **Fail:** No CLI surface section — the RFC proposes `migrator.business-to-pbp` command but does not show exact invocations.
- **Fail:** No file system responsibilities table — the RFC mentions paths inline but does not provide a structured table.
- **Fail:** No failure modes section with exit codes.
- **Pass:** Decision is present tense and concrete.
- **Pass:** TypeScript contracts section shows minimal type signatures.

## Axis B — DNA alignment

- **Pass:** `satisfies: [DNA-20]` — DNA-20 exists in `docs/architecture-dna.md` and is marked superseded. The RFC explains how it completes the cutover.
- **Note:** DNA-20 is already superseded (by RFC-0471). The RFC should `satisfies` a different invariant or explain that it is _completing_ the supersession, not establishing a new one. The `satisfies` field should reference an active invariant, not a superseded one.

## Axis C — Ecosystem fit

- **Pass:** Package boundaries correct — migrator lives in `packages/os/site-kernel-handoff/src/migrators/`, consistent with RFC-0479.
- **Pass:** `packagesImpacted` lists real packages that exist.
- **Fail:** `commands.proposed` lists `migrator.business-to-pbp` — but RFC-0479 defines `mission.migrate` as the command that runs migrators. Individual migrators are not commands. This should not be in `commands.proposed`.
- **Note:** No Compass sync mentioned — the RFC changes content structure but does not identify which `docs/*.xml` files need synchronization.

## Axis D — Forward-only compliance

- **Fail (critical):** The RFC explicitly proposes a **dual-collection strategy** — keeping the legacy `business/` collection alongside `business-profile/`. This is a compatibility shim / dual-path. RFC-0471 already deleted `@gogol/business` and migrated content references. The RFC says "329 content references still resolve from the business collection" — but RFC-0471 acceptance criteria item 1 says all 329 `{business.*}` references were migrated to `{business-profile.*}` or inline values (checked, 2026-07-20). If references were already migrated, the `business` collection should not be needed. If it IS still needed, that means RFC-0471's acceptance criteria were falsely checked, and this RFC should address that discrepancy, not propose coexistence.
- **Fail:** The RFC says it `amends` RFC-0471, but RFC-0471 is `status: implemented`. Forward-only means you don't amend implemented RFCs — you create a follow-up RFC that supersedes or builds on it. The `amends` field is for RFCs that are still in draft/accepted state.

## Axis E — Agent-facing policy

- **Pass:** No self-authorizing language — RFC is `status: draft` and does not claim implementation permission.
- **Pass:** Implementation notes reference governance rules implicitly (RFC-0479 migrator registry).
- **Fail:** The RFC's `nonGoals` say "Does not delete the legacy business/ collection" — but this contradicts RFC-0471 which already deleted `systems/webgogol-com/src/content/business/`. The RFC needs to clarify: does `business/` still exist or not? (It does exist in the workpiece, but RFC-0471 claims it was deleted from the system cache clone.)

## Axis F — Pragmatism

- **Fail:** `commands.proposed: [migrator.business-to-pbp]` — migrators are not commands. They are registry entries invoked by `mission.migrate`. Remove from `commands.proposed`.
- **Pass:** The migrator scope is minimal — only creates `business.md`, doesn't try to migrate all entities.
- **Note:** The RFC could be simpler: instead of a dual-collection strategy, just create the missing `business.md` singleton in `business-profile/` and let the existing PBP compiler work. The `business` collection registration (fix #1, already committed) is a separate concern.

## Axis G — Blind spots

- **Fail:** The RFC does not address the discrepancy between RFC-0471's acceptance criteria (which claim `business/` was deleted and all references migrated) and the reality (the workpiece still has `business/` with 329 references). This is the real root cause — RFC-0471 was marked implemented but the content migration was incomplete.
- **Note:** No performance concern — the migrator is a single file creation, trivially fast.
- **Note:** Edge case: what if `company.md` doesn't exist for a locale? The migrator says `continue` (skip), but then the build will still fail. Should it throw `MigrationError` instead?

## Questions for the author

1. RFC-0471 acceptance criteria item 1 says all 329 `{business.*}` references were migrated to `{business-profile.*}` or inline values (2026-07-20). But the workpiece still has 329 `{business.*}` references and a `business/` directory. Was RFC-0471's acceptance criteria falsely checked, or is the workpiece a different state from the system cache clone?

2. If the `business` collection is still needed for content references, why does RFC-0471 claim it was deleted? Should this RFC instead supersede RFC-0471's premature acceptance criteria rather than amend it?

3. Why is `migrator.business-to-pbp` in `commands.proposed`? Migrators are registry entries, not commands. The command is `mission.migrate` (already exists from RFC-0479).
