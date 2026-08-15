---
schema: forge/program-packet@1
program: RFC-0855
packetId: 040-specification-reconciliation
state: draft
governingDecision: werkstatt-release-certification/AMD-007
decisionKind: spec-amendment
resolvedRfc: null
dependsOnPacket: 030-canonical-diagnostic
baseCommit: b82f2f75ad5361115a4cfa970a49eebe72abfe73
branch: program/agent-runtime-certification-cutover
steward: human:andrii-syrokomskyi
normativeSources:
  - path: "docs/specs/werkstatt-release-certification/amendments/amd-007-component-runtime-reconciliation.md"
    sha256: ca12287a3dee5e07e2eb744c400015253f08f1767c399f94ebdd01895367ccb6
allowedFiles:
  - "docs/specs/werkstatt-release-certification/amendments/amd-007-component-runtime-reconciliation.md"
  - "docs/specs/werkstatt-release-certification/forge-spec.yaml"
  - "docs/plans/agent-runtime-certification/040-specification-reconciliation.md"
  - "docs/plans/agent-runtime-certification/preparations/**"
  - "docs/plans/agent-runtime-certification/program.yaml"
forbiddenFiles:
  - "missions/**"
  - "../systems-cache/**"
  - ".git/**"
  - ".forge/program-leases/**"
  - "docs/specs/werkstatt-release-certification/*.md"
permittedTransitionDiagnostics: []
requiredValidations:
  - command: "pnpm --filter @warpgogol/werkstatt test"
    expectedStatus: pass
    expectedDiagnostics: []
  - command: "pnpm --filter @warpgogol/werkstatt build"
    expectedStatus: pass
    expectedDiagnostics: []
  - command: "pnpm exec werkstatt run spec.validate --spec=werkstatt-release-certification"
    expectedStatus: pass
    expectedDiagnostics: []
---

# Packet 040: Specification reconciliation

## 1. Objective and explicit non-goals

Component-set identity, capability execution, linear roadmap, combined cutover.

Non-goals: do not combine this packet with its predecessor or successor; do not widen beyond the governing decision. Completion boundary: `spec.validate` passes and amendment is accepted.

## 2. Prerequisite and program-state checks

This draft authorizes no mutation. The independent Steward seals through RFC-0856, sets `baseCommit` to the completion commit of `030-canonical-diagnostic`, verifies the fixed branch, reachable ancestry, decision status, source hashes, clean repository/managed trees, and a distinct Executor. A preparation lease must resolve werkstatt-release-certification/AMD-007, obtain explicit human governance, and commit preparation evidence before sealing; the qualified reference is never rewritten. The Executor acquires the execution lease and rechecks HEAD, packet digest, source digest, and boundaries before writing.

## 3. Mandatory reads and normative anchors

Read the closest `AGENTS.md`, `/home/syrokomskyi/.codex/RTK.md`, and every committed source below in full:

- `docs/specs/werkstatt-release-certification/amendments/amd-007-component-runtime-reconciliation.md`
- `docs/plans/agent-runtime-certification/program.yaml`
- `docs/plans/agent-runtime-certification/README.md`
- `docs/plans/agent-runtime-certification/030-canonical-diagnostic.md`

The governing anchor is `werkstatt-release-certification/AMD-007`. Sealing recomputes the normative digest and blocks on drift. Read every direct decision dependency and predecessor completion resolved by RFC-0856; never infer status from prose.

## 4. Verified current code facts

At charter preparation the program and packet are draft, `baseCommit` is null, the branch is fixed, and `docs/specs/werkstatt-release-certification/amendments/amd-007-component-runtime-reconciliation.md` exists at SHA-256 `ca12287a3dee5e07e2eb744c400015253f08f1767c399f94ebdd01895367ccb6`. The bounded responsibility is component-set identity, capability execution, linear roadmap, combined cutover. Just-in-time preparation re-reads allowed owners and records actual paths/symbols; stale facts return to the Steward.

## 5. Allowed and forbidden file boundaries

Only these paths may change:

- `docs/specs/werkstatt-release-certification/amendments/amd-007-component-runtime-reconciliation.md`
- `docs/specs/werkstatt-release-certification/forge-spec.yaml`
- `docs/plans/agent-runtime-certification/040-specification-reconciliation.md`
- `docs/plans/agent-runtime-certification/preparations/**`
- `docs/plans/agent-runtime-certification/program.yaml`

Mission workpieces, cache clones/mirrors, Git internals, tracked lease state, immutable snapshot files, credentials, provider state, and deployed-site state are forbidden unless an accepted decision and exact allow-list entry own them. A required extra path stops execution; the Executor cannot self-expand scope.

## 6. Ordered implementation steps

1. Re-run decision, status, hash, branch, ancestry, lease, dirty-tree, and path-policy checks.
2. Inspect each allowed owner and its history before replacement or deletion; record current symbols in preparation evidence.
3. Implement schema/type owners, then pure state/effect logic, then adapters/integration, preserving authority and dependency inversion.
4. Reject unknown, stale, unavailable, replayed, excessive, or unauthorized input fail-closed; add no fallback or suppression.
5. Add deterministic positive, negative, boundary, property, crash/replay, and recovery tests proportional to risk.
6. Update named owner docs and agent/Compass surfaces; regenerate projections only from generators.
7. Run declared validations, full diff review, independent review/fix, canonical commits, and clean-tree verification.
8. Close the lease only through RFC-0856 completion/recovery; never hand-edit program state.

## 7. Exact validations and expected results

Each command must exit successfully with `pass` and zero unexpected diagnostics:

- `pnpm --filter @warpgogol/werkstatt test`
- `pnpm --filter @warpgogol/werkstatt build`
- `pnpm exec werkstatt run spec.validate --spec=werkstatt-release-certification`

Also run `git diff --check`, governing acceptance/evidence commands, and `bash scripts/check-clean-trees.sh`. Changed commands require `command.manifest.generate` then validation; topology changes require `ecosystem.manifest.generate` then validation.

## 8. Permitted transition diagnostics

None. No non-pass result is permitted at completion. Infrastructure-unavailable, stale, incomplete, warning-only, suppressed, waived, or unknown outcomes are not success. Later packets may replace unavailable product behavior only after this packet passes.

## 9. Rollback and recovery

Before an implementation commit, Steward recovery returns to the sealed base without mutation. Afterwards preserve history and use a canonical compensating/revert commit or governing transaction; never reset, rebase, force-push, delete evidence, or silently take over. Crash/stale lease recovery requires an independent committed record binding lease digest, observed HEAD, completed stages, resolved decision, continuation target, actor, and reason. If recovery is unprovable, quarantine and stop.

## 10. Commit, completion, and handoff protocol

1. **Seal:** the Steward commits packet/program state; the Executor verifies that commit and acquires the sole lease.
2. **Implementation:** use `ecosystem.commit` for platform/docs and `mission.git.commit` only for an explicitly allowed workpiece. Reference `werkstatt-release-certification/AMD-007`; raw `git commit` is forbidden.
3. **Completion:** a different Steward verifies ancestry, paths, identities, validations, diagnostics, recovery, and clean trees; writes a completion report; commits it with program state.

Handoff requires a reachable completion commit on the fixed branch, closed lease, empty unexpected diagnostics, and clean trees. The next Steward binds `050-component-and-capability-contracts` to that commit. The Executor never seals, completes, or recovers its own packet.
