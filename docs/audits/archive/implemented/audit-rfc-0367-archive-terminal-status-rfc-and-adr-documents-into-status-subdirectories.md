---
rfcId: RFC-0367
auditId: AUDIT-RFC-0367-01
date: 2026-07-09
auditor:
  skill: wg-rfc-audit
  model: cascade
verdict: needs-revision
---

# Audit: RFC-0367

## Verdict: Needs revision

The RFC is structurally sound and addresses a real gap, but the "supersedes RFC-0366 in its entirety" claim creates a contract gap: RFC-0366 defined the full ADR contract (template shape, `adr.create`/`adr.validate`/`adr.list` command details, mini-RFC retirement), and RFC-0367 only restates the lifecycle/status changes. Without clarifying that unchanged portions of RFC-0366's contract remain in effect, the supersede orphans those contracts. Additionally, `packagesImpacted` omits `@gogol/site-kernel-checks` which houses ADR validation rules that must handle the new statuses.

## Mechanical validation (rfc.validate)

Pass with 1 expected V-12 warning: `RFC-0367.supersedes includes RFC-0366, but RFC-0366.supersededBy is "(empty)"`. This is expected for a draft — the `supersededBy` link on RFC-0366 is set during implementation.

## Axis A — Structural completeness

No issues. All sections contain real content. Decision is present tense ("The kernel gains…"). CLI surface shows exact invocations with flags. TypeScript contracts are minimal type signatures. File system responsibilities table names concrete paths. Output format documents `--json` shape. Failure modes specify exit codes and skip-vs-fail behavior. Rollout describes ordered adoption path. Alternatives considered has 5 real alternatives with rejection reasons. Risks include agent misinterpretation risk. Acceptance criteria are 13 checkable items. Implementation notes are explicit behavioral rules.

## Axis B — DNA alignment

No issues. `satisfies: [DNA-35]` is a real invariant (`app.contract.full` as canonical readiness signal, `docs/architecture-dna.md:149`). The RFC body explains that recursive file discovery preserves the integrity of `rfc.validate` and `adr.validate` after files are moved, which protects the readiness signal. The connection is indirect (the RFC doesn't change readiness gates) but valid — it ensures validators don't break when files are archived. The RFC does not conflict with any existing DNA invariant.

## Axis C — Ecosystem fit

**Finding 1: `packagesImpacted` omits `@gogol/site-kernel-checks`.** RFC-0366 listed both `@gogol/site-kernel` and `@gogol/site-kernel-checks` in its `packagesImpacted` because ADR validation rules live in `site-kernel-checks`. RFC-0367 extends `AdrStatus` with two new values (`implemented`, `reviewing`) and adds three new frontmatter keys. The validation rules in `site-kernel-checks` that validate ADR statuses and frontmatter keys will need updating to accept the new values. `packagesImpacted` should include `@gogol/site-kernel-checks`.

**Finding 2: Compass sync not addressed.** The root `AGENTS.md` states: "Update the affected `docs/*.xml` files in the same change whenever a task changes repository-wide requirements, shared package contracts, app-package relationships, or verification policy." This RFC changes the ADR contract (shared package contract) and the repository-wide file structure (archive subdirectories). The RFC should identify which `docs/*.xml` files need synchronization — likely `docs/requirements.xml` (ADR lifecycle) and `docs/development-plan.xml` (file structure).

## Axis D — Forward-only compliance

**Finding: Full supersede of RFC-0366 without clarifying contract continuity.** The Decision states "this RFC supersedes RFC-0366 in its entirety." RFC-0366 defined the complete ADR contract: document shape, template, `adr.create`/`adr.validate`/`adr.list` command details, mini-RFC retirement, skill creation, and `build.check` wiring. RFC-0367 only restates the lifecycle/status/frontmatter changes and the new archive commands. It does not restate the unchanged portions of RFC-0366's contract. In a forward-only ecosystem, superseding an RFC "in its entirety" without restating or referencing the unchanged contract portions creates a gap where those contracts are technically orphaned. The RFC should clarify that unchanged portions of RFC-0366's contract (ADR template shape, command details, mini-RFC retirement, skill creation, `build.check` wiring) remain in effect as described in RFC-0366, and only the lifecycle/status/frontmatter portions and archive commands are new to RFC-0367.

## Axis E — Agent-facing policy

No issues. The RFC is `draft` and does not contain self-authorizing language. Implementation notes reference RFC-0224 (accepted→implemented transition), RFC-0330 (verification evidence), RFC-0334 (supersede escalation). No content authoring claims. No persistence changes.

## Axis F — Pragmatism

No issues (except the `packagesImpacted` gap noted in Axis C). Two new commands each earn their existence — RFC and ADR are separate domains with separate directories and separate module registrations. TypeScript types are minimal. The RFC extends existing `listRfcFiles`/`listAdrFiles` rather than creating a new discovery mechanism. `nonGoals` are explicit and meaningful (4 items, all substantive).

## Axis G — Blind spots

**Finding: Concurrent execution not addressed.** The RFC does not consider what happens if two agents run `rfc.archive` simultaneously. Both would scan the same files and attempt `fs.rename` on the same targets. While `fs.rename` is atomic on most systems, the skip-on-destination-exists behavior could race: agent A moves `rfc-0001.md` to `archive/implemented/`, agent B's scan (started before A's move) also sees `rfc-0001.md` in root and tries to move it, but it's already gone. The `fs.rename` would fail with ENOENT, which should be handled gracefully. The RFC should specify that `fs.rename` ENOENT errors are treated as "already moved by another process" and skipped, not failed.

## Questions for the author

1. Does "supersedes RFC-0366 in its entirety" mean the full ADR contract from RFC-0366 is replaced, or only the lifecycle/status/frontmatter portions? If the former, RFC-0367 must restate the full ADR contract. If the latter, clarify that unchanged portions remain in effect.
2. Should `packagesImpacted` include `@gogol/site-kernel-checks`? ADR validation rules in that package must handle the new `implemented` and `reviewing` statuses and the new frontmatter keys.
3. What happens if two agents run `rfc.archive` concurrently? Should `fs.rename` ENOENT errors be treated as "already moved" and skipped?
