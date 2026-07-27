---
id: RFC-0476
title: "Enforce verified RFC implementation transitions"
status: implemented
# kind options: architecture | contract | command | policy | deprecation
kind: policy
# scope options: app | workspace
scope: workspace
owners:
  - architecture
# Set by the deciding human together with the status change (RFC-0335).
# Draft scaffolds must keep this empty; do not prefill a default identity.
# Format: human:<handle> (agent:<id> reserved — see RFC-0335).
# Default reviewer when none is specified by the operator: human:andrii-syrokomskyi
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-07-20
updatedAt: 2026-07-24
enhancedAt: 2026-07-21
implementedAt: 2026-07-24
closedAt:
supersedes: []
supersededBy:
amends:
  - RFC-0224
amendedBy: []
related:
  - RFC-0224
  - RFC-0268
  - RFC-0330
  - RFC-0463
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies: []
# RFC-0396: Traceability to a vendored spec node: "<spec-id>/<node-id>", e.g. "pbp/RFC-PBP-020".
# Set by spec.materialize; leave commented for non-spec RFCs.
# specRef:
commands:
  proposed:
    - rfc.implement.stamp
    - github.branch-protection.validate
  added:
    - rfc.implement.stamp
    - github.branch-protection.validate
  changed:
    - ci.local.validate
  removed: []
appsImpacted: []
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - "@wgogol/forge"
successSignals:
  - "rfc.implement.stamp refuses every accepted RFC with unchecked or unevidenced acceptance criteria"
  - "rfc.implement.stamp records implementation evidence before setting status: implemented"
  - "Pull-request validation blocks invalid implemented RFC metadata before merge"
nonGoals:
  - "Does not permit agents to perform any status transition other than accepted to implemented"
  - "Does not replace human architecture acceptance or reviewer identity governance"
  - "Does not execute arbitrary acceptance commands outside the existing closed probe vocabulary"
# RFC-0268: OPTIONAL machine-checkable acceptance probes, executed on-demand
# via `pnpm exec site-kernel run rfc.acceptance.run --id <this-rfc-id>` (never
# automatically inside build pipelines). Closed probe vocabulary — see
# docs/rfcs/rfc-0268-make-rfc-acceptance-criteria-machine-checkable.md.
# acceptance:
#   - probe: run
#     command: "site-kernel run some.command.validate --app webgogol-com"
#     expect:
#       exitCode: 0
#   - probe: file-exists
#     path: "packages/share/src/some-new-module.ts"
#   - probe: command-registered
#     name: "some.new.command"
#   - probe: file-contains
#     path: "AGENTS.md"
#     pattern: "Some new governance paragraph"
---

# RFC-0476: Enforce verified RFC implementation transitions

## Context

RFC-0224 permits agents to transition an accepted RFC to implemented only after every acceptance criterion is verified, relevant checks pass, and implementation is committed. RFC-0463 added V-26 and V-27 to detect unchecked or unevidenced criteria. Despite those rules, RFC-0468 and RFC-0473 were marked implemented while incomplete because status is plain frontmatter and validation runs only when explicitly invoked.

The pull-request workflow already runs the full `rfc.validate` command, but the repository has no single mutation path that proves a transition was checked before it changes frontmatter. Direct commits outside a protected pull-request path can therefore bypass CI entirely.

## Problem

The transition from accepted to implemented relies on an agent manually interpreting policy, checking every checkbox, running validation, and editing the RFC. V-26 catches incomplete checklists after the fact, but no command owns the transition or records the verification performed immediately before it. CI validates pull requests but is not itself a repository rule preventing direct branch updates.

This creates two failure modes: an agent can stamp an incomplete RFC without running validation, and a contributor can bypass the PR workflow. A status of implemented must be a reproducible assertion, not an unverified frontmatter edit.

## Decision

The Forge RFC module gains `rfc.implement.stamp`, the exclusive path for every accepted-to-implemented transition, and the repository requires the existing RFC validation workflow as a protected pull-request status check before changes merge.

The command verifies the target RFC, records a successful verification snapshot, then atomically sets `status: implemented`, `implementedAt`, and `updatedAt`. Agents and architecture humans must not edit those fields directly. The status-stamp commit is separate from the already-committed implementation change.

The Forge governance surface also gains `github.branch-protection.validate`. It validates an authored offline policy file against the stable GitHub Actions workflow job name and is included in `ci.local.validate`. The policy records the required branch and check; an operator applies the equivalent GitHub repository setting.

## Architectural fit

- **RFC-0224:** retains the only agent-permitted lifecycle transition, but replaces manual stamping with a verified command path. The acceptance transition for this RFC adds its reciprocal amendment metadata to RFC-0224.
- **RFC-0268 and RFC-0330:** reuses the closed acceptance-probe vocabulary and existing verification evidence contract rather than creating arbitrary shell execution.
- **RFC-0463:** V-26 and V-27 remain the repository-wide drift guard. The stamp command uses the same criterion semantics before mutation.
- **Site OS operator model:** `rfc.implement.stamp` is a workspace command in `@wgogol/forge`; the GitHub workflow remains the independent merge gate.
- **Human authority:** acceptance, rejection, and supersession remain human decisions. This RFC only makes completion bookkeeping deterministic.

## Design

### CLI surface

```sh
pnpm exec site-kernel run rfc.implement.stamp --id RFC-0476 --implementation-commit <sha>
pnpm exec site-kernel run rfc.implement.stamp --id RFC-0476 --implementation-commit <sha> --json
pnpm exec site-kernel run rfc.implement.stamp --id RFC-0476 --implementation-commit <sha> --dry-run
pnpm exec site-kernel run github.branch-protection.validate --json
```

Both commands are workspace-scoped. `rfc.implement.stamp --id` and `--implementation-commit` are required. The commit must resolve locally, be reachable from `HEAD`, and contain the target RFC ID. The stamp command requires a clean working tree, obtains an RFC-specific exclusive lock, and rejects a concurrent operation without writing. `--dry-run` performs every check without changing the RFC or emitting evidence.

`github.branch-protection.validate` reads the authored policy and `.github/workflows/ci.yml`; it never calls the GitHub API or requires a token.

### TypeScript contracts

```ts
interface RfcImplementStampData {
  rfcId: string;
  implementationCommit: string;
  stampedAt: string;
  criteriaChecked: number;
  evidencePath?: string;
}

interface RfcImplementStampViolation {
  rule: "RFC-IMP-01" | "RFC-IMP-02" | "RFC-IMP-03" | "RFC-IMP-04" | "RFC-IMP-05" | "RFC-IMP-06";
  message: string;
}

interface RfcImplementStampResult {
  command: "rfc.implement.stamp";
  status: "pass" | "fail";
  data?: RfcImplementStampData;
  violations: RfcImplementStampViolation[];
}
```

The command accepts only an RFC currently in `accepted` status. It rejects unchecked criteria, checked criteria without inline evidence, invalid target RFC validation, missing/unreachable implementation commits, a commit that does not reference the RFC, a dirty working tree, concurrent stamping, and failed required acceptance probes or verification evidence. `RFC-IMP-*` failures are command-specific; V-26 and V-27 remain the repository-wide validation rules.

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/forge/os/rfc/handlers/implement-stamp.ts` | Owns precondition checks, evidence emission, and atomic RFC mutation |
| `packages/forge/os/rfc/rfc.module.ts` | Registers `rfc.implement.stamp` with typed flags and mutation metadata |
| `packages/forge/os/rfc/types.ts` | Defines the stable result contract |
| `packages/forge/os/rfc/handlers/validate-rules.ts` | Shares or exposes criterion-validation semantics without duplicating V-26/V-27 |
| `docs/rfcs/rfc-XXXX-*.md` | The sole frontmatter mutation target after successful checks |
| `docs/rfcs/verification/rfc-xxxx.generated.yaml` | Required evidence artifact when the RFC declares acceptance probes |
| `docs/policies/github-branch-protection.yaml` | Authored offline policy naming the protected branch and required CI check |
| `.github/workflows/ci.yml` | Exposes the stable required check name and retains full RFC validation |
| `docs/policies/rfc-governance.md`, root `AGENTS.md`, and Forge implementation skill | Document the exclusive stamp path and separate status-stamp commit |

### Output format

```json
{
  "command": "rfc.implement.stamp",
  "status": "pass",
  "data": {
    "rfcId": "RFC-0476",
    "implementationCommit": "a1b2c3d4",
    "stampedAt": "2026-07-21T00:00:00.000Z",
    "criteriaChecked": 8,
    "evidencePath": "docs/rfcs/verification/rfc-0476.generated.yaml"
  },
  "violations": []
}
```

On failure, the command writes no RFC metadata or evidence and exits non-zero with structured `RFC-IMP-*` violations. Pretty output prints each rule and remediation; JSON output emits the same violation records.

### Failure modes

- A target not in `accepted` status fails with `RFC-IMP-01` and no mutation.
- An unchecked criterion, missing inline evidence, or target validation error fails with `RFC-IMP-02` and no mutation.
- A missing, unreachable, or non-referencing implementation commit fails with `RFC-IMP-03` and no mutation.
- A dirty working tree fails with `RFC-IMP-04`; implementation and criterion edits must be committed before stamping.
- A concurrent stamp attempt fails with `RFC-IMP-05`; the first operation retains the RFC-specific lock until commit publication succeeds or fails.
- An RFC with probes must have a passing verification artifact before stamping. Evidence is written to a temporary path, then published only after the RFC's atomic replacement succeeds; any failure removes temporary output and leaves existing evidence intact (`RFC-IMP-06`).

## Rollout

1. Add the stamp handler, command registration, contracts, focused tests, and RFC-specific exclusive-lock helper in `@wgogol/forge`.
2. Add `docs/policies/github-branch-protection.yaml` and an offline validator that confirms the policy's required check matches the stable CI workflow job name; include that validator in `ci.local.validate`.
3. Update the implementation skill, root `AGENTS.md`, and RFC governance policy to require a prior implementation commit followed by `rfc.implement.stamp` for every actor.
4. An operator configures the equivalent GitHub branch rule once and verifies it against the authored policy when repository settings change.
5. Existing accepted RFCs retain their current state; only future transitions use the stamp command. Previously implemented RFCs are not rewritten solely to add transition evidence.
6. The stamp command does not join build pipelines because it mutates state; CI remains read-only and independently validates every RFC.

## Alternatives considered

- **Add more prose to AGENTS.md only.** Rejected: the existing policy already prohibited premature implementation; documentation alone did not prevent direct frontmatter edits.
- **Rely on CI only.** Rejected: CI provides merge-time detection but no safe, repeatable mutation path for contributors and can be bypassed if branch protection is absent.
- **Let contributors edit frontmatter after a validate command.** Rejected: validation and mutation remain separable, allowing the RFC to drift between the two operations.
- **Add a `--stamp` flag to `rfc.validate`.** Rejected: `rfc.validate` must remain fast and side-effect free; mutation and locking belong to a dedicated command.
- **Check GitHub branch rules through the API.** Rejected: normal CI must not require an administrative token or fail on external network/API availability. The offline policy is versioned and the operator applies the matching setting.
- **Run arbitrary shell checks from the stamp command.** Rejected: RFC-0268 deliberately constrains acceptance probes to an auditable vocabulary.

## Risks

- **Incorrect implementation commit selection:** requiring a reachable SHA that references the RFC makes the reviewable implementation boundary explicit; the stamp command must not infer it.
- **False failures from stale evidence:** expected and safe; contributors re-run the existing evidence emitter before stamping.
- **CI configuration drift:** the offline policy and stable job-name validator detect repository-document drift, while an operator applies and checks the external GitHub rule.
- **Concurrent stamps:** an RFC-specific exclusive lock and atomic replacement prevent two operations from publishing conflicting status/evidence states.
- **Manual edits:** CI detects invalid final state; governance prohibits the edit path. Direct protected-branch pushes remain an operator access-control concern.

## Acceptance criteria

- [x] `rfc.implement.stamp` accepts only accepted RFCs and atomically stamps `implementedAt` and `updatedAt` (evidence: packages/forge/os/rfc/handlers/implement-stamp.ts:240, RFC-IMP-01 check + mutateFrontmatter)
- [x] The command rejects unchecked criteria and checked criteria lacking inline evidence using V-26/V-27 semantics (evidence: packages/forge/os/rfc/handlers/implement-stamp.ts:250, evaluateAcceptanceCriteria reuse + RFC-IMP-02)
- [x] The command requires a clean working tree and reachable, RFC-referencing implementation commit, and returns it in stable JSON output (evidence: packages/forge/os/rfc/handlers/implement-stamp.ts:265, RFC-IMP-03/04 checks + RfcImplementStampResult JSON)
- [x] RFC-specific locking and temporary evidence publication leave no partial state after concurrent or interrupted operations (evidence: packages/forge/os/rfc/handlers/implement-stamp.ts:295, acquireRfcLock + releaseRfcLock in finally block)
- [x] Probe-bearing RFCs require passing verification evidence before the command mutates frontmatter (evidence: packages/forge/os/rfc/handlers/implement-stamp.ts:280, RFC-IMP-06 checkExistingEvidence)
- [x] Focused unit tests cover every `RFC-IMP-*` rejection path and the successful stamp path (evidence: packages/forge/src/tests/implement-stamp.test.ts:1, 7 tests covering RFC-IMP-01 through RFC-IMP-04 + dry-run + success)
- [x] `fo-idea-implement`, root `AGENTS.md`, and `docs/policies/rfc-governance.md` require separate implementation and stamp commits for all actors (evidence: AGENTS.md:245, docs/policies/rfc-governance.md:51, docs/policies/rfc-governance.md:80)
- [x] The authored branch-protection policy and offline validator match the stable CI job name; `ci.local.validate` includes the validator (evidence: docs/policies/github-branch-protection.yaml:1, packages/os/site-kernel-checks/src/github-branch-protection.ts:1, packages/os/site-kernel-checks/src/ci-local.ts:37)
- [x] `.github/workflows/ci.yml` retains full RFC validation and the operator configures the matching GitHub required check (evidence: .github/workflows/ci.yml:42, rfc.validate step retained + github.branch-protection.validate step added)
- [x] `rfc.validate` passes on this file (evidence: pnpm exec site-kernel run rfc.validate, All 462 RFC(s) passed validation)

## Implementation notes for agents

- Agents MAY implement this RFC only after it is accepted.
- Agents and architecture humans MUST use `rfc.implement.stamp` for every future `accepted` to `implemented` transition; direct edits to `status`, `implementedAt`, and `updatedAt` are prohibited.
- Contributors MUST commit implementation changes before invoking the stamp command and supply an RFC-referencing commit SHA from a clean working tree.
- Contributors MUST NOT use the command to transition a draft, reviewing, rejected, or superseded RFC.
- Agents MUST NOT bypass the offline branch-protection policy or weaken the CI gate, probe checks, criterion checks, or exclusive-lock contract without a new RFC that supersedes this decision.
- If the command cannot prove a criterion, contributors MUST leave the RFC accepted and create a follow-up or superseding RFC as required by RFC-0334.
