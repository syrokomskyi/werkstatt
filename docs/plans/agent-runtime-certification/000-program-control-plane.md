---
schema: forge/program-packet@1
program: RFC-0855
packetId: 000-program-control-plane
state: draft
governingDecision: RFC-0856
decisionKind: rfc
resolvedRfc: RFC-0856
dependsOnPacket: null
baseCommit: null
branch: program/agent-runtime-certification-cutover
steward: human:andrii-syrokomskyi
normativeSources:
  - path: "docs/rfcs/rfc-0856-establish-the-governed-program-packet-control-plane.md"
    sha256: 2761392d831a9f73bbdde12bed1e7755ac13fed98620580fbed63a3d491088d0
allowedFiles:
  - "packages/forge/os/program/**"
  - "packages/forge/src/tests/program-*.test.ts"
  - "packages/forge/package.json"
  - "packages/forge/src/index.ts"
  - "packages/werkstatt/src/workshop/templates.ts"
  - "packages/werkstatt/test-fixtures/fixture-workshop/tools/kernel.config.ts"
  - "tools/kernel.config.ts"
  - ".gitignore"
  - "docs/plans/agent-runtime-certification/**"
  - "docs/command-manifest.generated.yaml"
  - "docs/ecosystem.generated.yaml"
forbiddenFiles:
  - "missions/**"
  - "../systems-cache/**"
  - ".git/**"
  - ".forge/program-leases/**"
  - "docs/specs/werkstatt-release-certification/*.md"
permittedTransitionDiagnostics: []
requiredValidations:
  - command: "pnpm --filter @warpgogol/forge test"
    expectedStatus: pass
    expectedDiagnostics: []
  - command: "pnpm --filter @warpgogol/forge build"
    expectedStatus: pass
    expectedDiagnostics: []
  - command: "pnpm exec werkstatt run command.manifest.validate"
    expectedStatus: pass
    expectedDiagnostics: []
  - command: "pnpm exec werkstatt run ecosystem.manifest.validate"
    expectedStatus: pass
    expectedDiagnostics: []
---

# Packet 000: Program packet control plane

## 1. Objective and explicit non-goals

Implement schema, validation, Steward sealing, exclusive lease, completion, recovery, and genesis import.

Non-goals: do not combine this packet with its predecessor or successor; do not widen beyond the governing decision. Completion boundary: RFC-0856 suite passes; bootstrap completion committed; no second bootstrap possible.

## 2. Prerequisite and program-state checks

This draft authorizes no mutation. The independent Steward seals through RFC-0856, sets `baseCommit` to the accepted RFC-0856 plan bootstrap boundary, verifies the fixed branch, reachable ancestry, decision status, source hashes, clean repository/managed trees, and a distinct Executor. Use the accepted RFC-0856 implementation plan as the sole bootstrap seal boundary; successful genesis import permanently disables bootstrap mode. The Executor acquires the execution lease and rechecks HEAD, packet digest, source digest, and boundaries before writing.

## 3. Mandatory reads and normative anchors

Read the closest `AGENTS.md`, `/home/syrokomskyi/.codex/RTK.md`, and every committed source below in full:

- `docs/rfcs/rfc-0856-establish-the-governed-program-packet-control-plane.md`
- `docs/plans/agent-runtime-certification/program.yaml`
- `docs/plans/agent-runtime-certification/README.md`

The governing anchor is `RFC-0856`. Sealing recomputes the normative digest and blocks on drift. Read every direct decision dependency and predecessor completion resolved by RFC-0856; never infer status from prose.

## 4. Verified current code facts

At charter preparation the program and packet are draft, `baseCommit` is null, the branch is fixed, and `docs/rfcs/rfc-0856-establish-the-governed-program-packet-control-plane.md` exists at SHA-256 `2761392d831a9f73bbdde12bed1e7755ac13fed98620580fbed63a3d491088d0`. The bounded responsibility is implement schema, validation, Steward sealing, exclusive lease, completion, recovery, and genesis import. Just-in-time preparation re-reads allowed owners and records actual paths/symbols; stale facts return to the Steward.

## 5. Allowed and forbidden file boundaries

Only these paths may change:

- `packages/forge/os/program/**`
- `packages/forge/src/tests/program-*.test.ts`
- `packages/forge/package.json`
- `packages/forge/src/index.ts`
- `packages/werkstatt/src/workshop/templates.ts`
- `packages/werkstatt/test-fixtures/fixture-workshop/tools/kernel.config.ts`
- `tools/kernel.config.ts`
- `.gitignore`
- `docs/plans/agent-runtime-certification/**`
- `docs/command-manifest.generated.yaml`
- `docs/ecosystem.generated.yaml`

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

- `pnpm --filter @warpgogol/forge test`
- `pnpm --filter @warpgogol/forge build`
- `pnpm exec werkstatt run command.manifest.validate`
- `pnpm exec werkstatt run ecosystem.manifest.validate`

Also run `git diff --check`, governing acceptance/evidence commands, and `bash scripts/check-clean-trees.sh`. Changed commands require `command.manifest.generate` then validation; topology changes require `ecosystem.manifest.generate` then validation.

## 8. Permitted transition diagnostics

None. No non-pass result is permitted at completion. Infrastructure-unavailable, stale, incomplete, warning-only, suppressed, waived, or unknown outcomes are not success. Later packets may replace unavailable product behavior only after this packet passes.

## 9. Rollback and recovery

Before an implementation commit, Steward recovery returns to the sealed base without mutation. Afterwards preserve history and use a canonical compensating/revert commit or governing transaction; never reset, rebase, force-push, delete evidence, or silently take over. Crash/stale lease recovery requires an independent committed record binding lease digest, observed HEAD, completed stages, resolved decision, continuation target, actor, and reason. If recovery is unprovable, quarantine and stop.

## 10. Commit, completion, and handoff protocol

1. **Seal:** the Steward commits packet/program state; the Executor verifies that commit and acquires the sole lease.
2. **Implementation:** use `ecosystem.commit` for platform/docs and `mission.git.commit` only for an explicitly allowed workpiece. Reference `RFC-0856`; raw `git commit` is forbidden.
3. **Completion:** a different Steward verifies ancestry, paths, identities, validations, diagnostics, recovery, and clean trees; writes a completion report; commits it with program state.

Handoff requires a reachable completion commit on the fixed branch, closed lease, empty unexpected diagnostics, and clean trees. The next Steward binds `010-node-24` to that commit. The Executor never seals, completes, or recovers its own packet.
