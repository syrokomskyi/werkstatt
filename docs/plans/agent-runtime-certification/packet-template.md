---
schema: forge/program-packet@1
program: RFC-0855
packetId: 000-kebab-name
state: draft
governingDecision: RFC-0000
decisionKind: rfc
resolvedRfc: RFC-0000
dependsOnPacket: null
baseCommit: null
branch: program/agent-runtime-certification-cutover
steward: human:andrii-syrokomskyi
normativeSources: [{ path: docs/rfcs/rfc-0000-example.md, sha256: 0000000000000000000000000000000000000000000000000000000000000000 }]
allowedFiles: [docs/example.md]
forbiddenFiles: [missions/**, ../systems-cache/**, .git/**, .forge/program-leases/**]
permittedTransitionDiagnostics: []
requiredValidations: [{ command: pnpm exec werkstatt run rfc.validate --id RFC-0000, expectedStatus: pass, expectedDiagnostics: [] }]
---

# Packet template

## 1. Objective and explicit non-goals

State one bounded objective and explicit exclusions.

## 2. Prerequisite and program-state checks

Require sealed state, exact branch/head/base, dependencies, predecessor completion, clean trees, and exclusive lease.

## 3. Mandatory reads and normative anchors

List exact paths, decisions, sections, hashes, and predecessor evidence.

## 4. Verified current code facts

Name current paths and symbols verified at preparation; stale facts block sealing.

## 5. Allowed and forbidden file boundaries

Repeat machine boundaries; the Executor cannot expand them.

## 6. Ordered implementation steps

Give one linear owner-first implementation sequence.

## 7. Exact validations and expected results

List commands and exact pass/diagnostic expectations.

## 8. Permitted transition diagnostics

Name every permitted diagnostic and its removal packet; empty means none.

## 9. Rollback and recovery

Recover from the canonical commit without reset, rebase, force, or takeover.

## 10. Commit, completion, and handoff protocol

Require seal, canonical implementation, independent completion, clean trees, and next-base binding.
