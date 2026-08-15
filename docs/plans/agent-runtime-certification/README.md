# Agent runtime certification program

This directory is the machine-governed, strictly sequential execution plan for RFC-0855. The authoritative order and draft state live in `program.yaml`; each packet is self-contained for a fresh executor with no conversation history.

## Operating law

- Execute exactly one packet at a time on `program/agent-runtime-certification-cutover`.
- A draft authorizes no mutation. RFC-0856 preparation and sealing resolve the decision, predecessor completion commit, source hashes, branch, and independent Steward/Executor identities.
- The Executor changes only `allowedFiles`, leaves only enumerated transition diagnostics, and cannot seal, complete, or recover its own packet.
- Missing or stale facts fail closed. There is no force, bypass, warning-only, compatibility, auto-takeover, or parallel path.
- Packet 000 is the sole bootstrap. Packets 010–240 bind `baseCommit` to the predecessor completion commit.
- CERT-002 through CERT-010 stay qualified spec decisions until just-in-time preparation materializes and obtains explicit human acceptance of their RFCs. RFC-0857 is the controlling amendment for this JIT materialization protocol: it distinguishes non-spec child RFC creation (packets 010–130) from JIT CERT materialization (packets 140–240), requires phase-aware Steward preparation leases, reciprocal `specRef`/`materializedAs` mapping verification at seal boundary, and preparation reports.
- AMD-007 stays qualified; packet 040 owns explicit acceptance and never edits immutable snapshot files.

## Three committed boundaries

The Steward commits the seal. The Executor makes canonical implementation commits. A different Steward verifies and commits completion evidence plus program state. Runtime lease tokens remain untracked under `.forge/program-leases/` and never enter reports.

## Fixture validation

Until packet 000 installs `program.packet.validate`, run this structural validator from the repository root:

```sh
pnpm exec tsx -e 'import fs from "node:fs"; import path from "node:path"; import YAML from "yaml"; const d="docs/plans/agent-runtime-certification"; const p=YAML.parse(fs.readFileSync(path.join(d,"program.yaml"),"utf8")); if(p.schema!=="forge/program@1"||p.parallelism!==1||p.packets.length!==25) throw new Error("program"); for(const x of p.packets){const t=fs.readFileSync(path.join(d,x.file),"utf8"); const m=t.match(/^---\\n([\\s\\S]*?)\\n---/); if(!m) throw new Error(x.file); const y=YAML.parse(m[1]); if(y.schema!=="forge/program-packet@1"||y.state!=="draft"||y.baseCommit!==null||y.packetId!==x.packetId) throw new Error(x.file); const hs=[...t.matchAll(/^## (.+)$/gm)]; if(hs.length!==10) throw new Error(x.file+":sections"); }'
```

The validator must exit zero before RFC-0855 is stamped. Packet 000 replaces it with strict schemas, git boundaries, leases, completion, and recovery.

## Packet index

| Order | Packet | Governing decision | Draft responsibility |
| --: | --- | --- | --- |
| 000 | [000-program-control-plane](./000-program-control-plane.md) | `RFC-0856` | Implement schema, validation, Steward sealing, exclusive lease, completion, recovery, and genesis import |
| 010 | [010-node-24](./010-node-24.md) | `RFC-0854` | Closed Node 24 ecosystem cutover and required site republish |
| 020 | [020-canonical-identity-bytes](./020-canonical-identity-bytes.md) | `RFC-0849` | Bounded canonical JSON snapshot/bytes/hash |
| 030 | [030-canonical-diagnostic](./030-canonical-diagnostic.md) | `RFC-0852` | Engine-owned strict Diagnostic cutover |
| 040 | [040-specification-reconciliation](./040-specification-reconciliation.md) | `werkstatt-release-certification/AMD-007` | Component-set identity, capability execution, linear roadmap, combined cutover |
| 050 | [050-component-and-capability-contracts](./050-component-and-capability-contracts.md) | `RFC-0858` | Strict component manifest, versioned provide/require, grants, effect declarations, scopes, resolved-set identity |
| 060 | [060-fiber-and-effect-runtime](./060-fiber-and-effect-runtime.md) | `RFC-0859` | Lifecycle state machine, effect ownership, drain/cancel/quiescence, activation transaction |
| 070 | [070-resolution-and-reconciliation](./070-resolution-and-reconciliation.md) | `RFC-0860` | Deterministic dependency resolution, desired-state diff, immutable resolved sets, rollback to prior set |
| 080 | [080-reflection-and-conformance-harness](./080-reflection-and-conformance-harness.md) | `RFC-0861` | Live filtered capability catalog and test-only temporary trusted fixture execution |
| 090 | [090-isolation-contract](./090-isolation-contract.md) | `RFC-0862` | Provider-neutral sandbox adapter contract, deny-by-default RPC, grant attenuation, adversarial conformance |
| 100 | [100-certification-contracts-and-identities](./100-certification-contracts-and-identities.md) | `RFC-0853` | Revise strict contracts for resolved component sets and distinct release/capability candidates |
| 110 | [110-deterministic-evaluation](./110-deterministic-evaluation.md) | `RFC-0850` | Shared bounded selection, evaluation, action packs, dossier hashing |
| 120 | [120-forward-only-state-reset](./120-forward-only-state-reset.md) | `RFC-0851` | Artifact/operation separation and truthful transition block |
| 130 | [130-foundation-integration](./130-foundation-integration.md) | `RFC-0848` | Public-API integration across runtime identity, certification identity, evaluation, and state |
| 140 | [140-resolved-certification-profile](./140-resolved-certification-profile.md) | `werkstatt-release-certification/CERT-002` | Law-Kernel-owned immutable policy resolves exact component capabilities |
| 150 | [150-authority-and-durable-storage](./150-authority-and-durable-storage.md) | `werkstatt-release-certification/CERT-003` | Signed Certification Authority, authoritative append, storage, issuer and retention boundaries |
| 160 | [160-certification-orchestration](./160-certification-orchestration.md) | `werkstatt-release-certification/CERT-004` | Orchestrator executes through lifecycle capabilities with locks/resume/cuts |
| 170 | [170-deterministic-site-producers](./170-deterministic-site-producers.md) | `werkstatt-release-certification/CERT-005` | First trusted production component graph and false-pass removal |
| 180 | [180-independent-evaluators](./180-independent-evaluators.md) | `werkstatt-release-certification/CERT-006` | Trusted first-party adapter invokes isolated evaluator workloads; outputs are untrusted data; risk routing, consensus, held-out inputs |
| 190 | [190-capability-artifact-and-sandbox](./190-capability-artifact-and-sandbox.md) | `RFC-0863` | Immutable package store plus first real sandbox provider and capability bridge |
| 200 | [200-evolution-controller](./200-evolution-controller.md) | `RFC-0864` | Inspect/define/test/shadow/canary/observe/promote/rollback/quarantine/kill-switch |
| 210 | [210-deployment-effect-authority](./210-deployment-effect-authority.md) | `werkstatt-release-certification/CERT-007` | Signed external-effect authorization, Main verification, compensation/rollback |
| 220 | [220-continuous-health-and-demotion](./220-continuous-health-and-demotion.md) | `werkstatt-release-certification/CERT-008` | Monitoring windows, health, capability demotion and incident response |
| 230 | [230-combined-cutover](./230-combined-cutover.md) | `werkstatt-release-certification/CERT-009` | Re-author static modules as components, certify exact set, republish sole site, remove old registry/plugin path |
| 240 | [240-cleanup](./240-cleanup.md) | `werkstatt-release-certification/CERT-010` | Delete only proven-obsolete runtime, release, mission, and compatibility artifacts |

All rows are drafts. The table is a human projection; `program.yaml` remains authoritative.

## Artifact map

- `packet-template.md`: mandatory ten-section order.
- `NNN-*.md`: draft execution packets.
- `preparations/`, `completions/`, and `recoveries/`: record field-order templates and later evidence.
