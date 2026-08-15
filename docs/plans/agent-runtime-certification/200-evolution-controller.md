---
schema: forge/program-packet@1
program: RFC-0855
packetId: 200-evolution-controller
state: draft
governingDecision: RFC-0864
decisionKind: rfc
resolvedRfc: RFC-0864
dependsOnPacket: 190-capability-artifact-and-sandbox
baseCommit: null
branch: program/agent-runtime-certification-cutover
steward: human:andrii-syrokomskyi
normativeSources:
  - path: "docs/rfcs/rfc-0864-establish-the-governed-capability-evolution-controller.md"
    sha256: db49feab6da2a73d0c2f289dfcd2c6570980110bbbd6c539490485fb04f9937d
allowedFiles:
  - "packages/werkstatt/src/evolution/**"
  - "packages/werkstatt/src/tests/evolution*.test.ts"
  - "packages/werkstatt/package.json"
  - "docs/**"
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
  - command: "pnpm exec werkstatt run rfc.validate --id RFC-0864"
    expectedStatus: pass
    expectedDiagnostics: []
---

# Packet 200: Evolution controller

## 1. Objective and explicit non-goals

Inspect/define/test/shadow/canary/observe/promote/rollback/quarantine/kill-switch.

Non-goals: do not combine this packet with its predecessor or successor; do not widen beyond the governing decision. Completion boundary: no promotion without four-layer evidence.

## 2. Prerequisite and program-state checks

This draft authorizes no mutation. The independent Steward seals through RFC-0856, sets `baseCommit` to the completion commit of `190-capability-artifact-and-sandbox`, verifies the fixed branch, reachable ancestry, decision status, source hashes, clean repository/managed trees, and a distinct Executor. The governing RFC and every direct implementation dependency must have the status required by RFC-0856. The Executor acquires the execution lease and rechecks HEAD, packet digest, source digest, and boundaries before writing.

## 3. Mandatory reads and normative anchors

Read the closest `AGENTS.md`, `/home/syrokomskyi/.codex/RTK.md`, and every committed source below in full:

- `docs/rfcs/rfc-0864-establish-the-governed-capability-evolution-controller.md`
- `docs/plans/agent-runtime-certification/program.yaml`
- `docs/plans/agent-runtime-certification/README.md`
- `docs/plans/agent-runtime-certification/190-capability-artifact-and-sandbox.md`

The governing anchor is `RFC-0864`. Sealing recomputes the normative digest and blocks on drift. Read every direct decision dependency and predecessor completion resolved by RFC-0856; never infer status from prose.

## 4. Verified current code facts

At charter preparation the program and packet are draft, `baseCommit` is null, the branch is fixed, and `docs/rfcs/rfc-0864-establish-the-governed-capability-evolution-controller.md` exists at SHA-256 `db49feab6da2a73d0c2f289dfcd2c6570980110bbbd6c539490485fb04f9937d`. The bounded responsibility is inspect/define/test/shadow/canary/observe/promote/rollback/quarantine/kill-switch. Just-in-time preparation re-reads allowed owners and records actual paths/symbols; stale facts return to the Steward.

## 5. Allowed and forbidden file boundaries

Only these paths may change:

- `packages/werkstatt/src/evolution/**`
- `packages/werkstatt/src/tests/evolution*.test.ts`
- `packages/werkstatt/package.json`
- `docs/**`

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
- `pnpm exec werkstatt run rfc.validate --id RFC-0864`

Also run `git diff --check`, governing acceptance/evidence commands, and `bash scripts/check-clean-trees.sh`. Changed commands require `command.manifest.generate` then validation; topology changes require `ecosystem.manifest.generate` then validation.

## 8. Permitted transition diagnostics

None. No non-pass result is permitted at completion. Infrastructure-unavailable, stale, incomplete, warning-only, suppressed, waived, or unknown outcomes are not success. Later packets may replace unavailable product behavior only after this packet passes.

## 9. Rollback and recovery

Before an implementation commit, Steward recovery returns to the sealed base without mutation. Afterwards preserve history and use a canonical compensating/revert commit or governing transaction; never reset, rebase, force-push, delete evidence, or silently take over. Crash/stale lease recovery requires an independent committed record binding lease digest, observed HEAD, completed stages, resolved decision, continuation target, actor, and reason. If recovery is unprovable, quarantine and stop.

## 10. Commit, completion, and handoff protocol

1. **Seal:** the Steward commits packet/program state; the Executor verifies that commit and acquires the sole lease.
2. **Implementation:** use `ecosystem.commit` for platform/docs and `mission.git.commit` only for an explicitly allowed workpiece. Reference `RFC-0864`; raw `git commit` is forbidden.
3. **Completion:** a different Steward verifies ancestry, paths, identities, validations, diagnostics, recovery, and clean trees; writes a completion report; commits it with program state.

Handoff requires a reachable completion commit on the fixed branch, closed lease, empty unexpected diagnostics, and clean trees. The next Steward binds `210-deployment-effect-authority` to that commit. The Executor never seals, completes, or recovers its own packet.
