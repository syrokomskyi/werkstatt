---
id: RFC-0862
title: "Establish the provider-neutral isolation contract"
status: draft
kind: contract
scope: workspace
owners: [architecture]
reviewers: []
createdAt: 2026-08-15
updatedAt: 2026-08-15
enhancedAt: 2026-08-15
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related: [RFC-0855, werkstatt-release-certification/AMD-007]
dependsOn: [RFC-0858, RFC-0861]
batch: agent-runtime-certification-program
satisfies: [DNA-51, DNA-64]
versionBump: minor
commands:
  proposed: []
  added: []
  changed: []
  removed: []
appsImpacted: []
packagesImpacted: ["@warpgogol/werkstatt"]
successSignals:
  - "Untrusted component execution can use only a provider-neutral deny-by-default capability bridge"
  - "Admission proves isolation properties independently of component declarations"
  - "node:vm, worker_threads, and ordinary subprocess adapters are rejected as untrusted security tiers"
nonGoals:
  - "Do not choose or implement the first real sandbox provider"
  - "Do not activate agent-written or third-party code in production"
  - "Do not expose filesystem, network, process, environment, or credential ambient authority"
---

# RFC-0862: Establish the provider-neutral isolation contract

## Context

RFC-0855 requires agent-written and third-party components to run outside the trusted process through a real, deny-by-default security boundary. RFC-0858 can declare `sandboxed`, and RFC-0861 can test trusted fixtures, but neither proves isolation or defines the only allowed host↔workload bridge. Packet 090 establishes that contract before certification components or a sandbox provider rely on it.

## Problem

Calling `node:vm`, `worker_threads`, or an ordinary subprocess “sandboxed” creates isolation theatre: host filesystem, environment, network, signals, inherited descriptors, credentials, timing, and process capabilities can remain reachable. Provider-specific APIs would also leak one vendor into component contracts and make admission inconsistent.

## Decision

Werkstatt gains a provider-neutral isolation adapter contract with independently admitted isolation properties and a versioned, deny-by-default, message-bounded capability bridge. Only an adapter satisfying the adversarial conformance contract may host untrusted components; declarations alone never establish an isolation tier.

## Architectural fit

- **DNA-51:** workload creation, grant binding, calls, teardown, and recovery are idempotent/transactional.
- **DNA-64:** the engine owns the neutral contract; a provider is a replaceable capability, not stack authority.
- **RFC-0855:** Law Kernel admits adapters/grants and remains outside the replaceable workload.
- **RFC-0858:** requested grants and isolation requirements are upper bounds consumed by admission.

## Design

### CLI surface

No command. Packet 090 defines contracts and an adversarial conformance suite only. Packet 190 selects and implements the first real provider.

### TypeScript contracts

```ts
interface IsolationAdapterV1 {
  schema: "werkstatt/isolation-adapter@1";
  adapterId: string;
  properties: IsolationPropertyEvidenceV1;
  create(input: SandboxedWorkloadCreateV1): Promise<SandboxedWorkloadV1>;
}

interface SandboxedWorkloadCreateV1 {
  workloadId: string;
  artifactHash: string;
  grantSet: AttenuatedGrantSetV1;
  limits: WorkloadLimitsV1;
  bridgeSchemaHash: string;
  idempotencyKey: string;
}

interface SandboxedWorkloadV1 {
  invoke(request: CapabilityBridgeRequestV1): Promise<CapabilityBridgeResponseV1>;
  terminate(reason: string): Promise<TerminationReportV1>;
}
```

The bridge uses strict versioned request/response schemas, canonical request IDs, byte/time/concurrency bounds, explicit capability names, attenuated grants, and structured diagnostics. Workloads receive no ambient filesystem, network, process, environment, clock, randomness, credential, IPC, or host-object access. Needed services are explicit brokered capabilities with policy and audit identity.

Adapter admission evidence must cover containment, clean-room startup, artifact immutability, grant enforcement, egress controls, resource limits, secret non-inheritance, teardown, crash recovery, concurrent workload separation, bridge confusion/replay, and host compromise assumptions. Unsupported property is `incomplete`, never “best effort.”

`node:vm`, `worker_threads`, and ordinary inherited subprocesses fail the security-tier contract by definition. They may remain ordinary trusted implementation tools outside untrusted isolation but cannot satisfy `sandboxed`.

### File system responsibilities

| Path                                              | Role                                      |
| ------------------------------------------------- | ----------------------------------------- |
| `packages/werkstatt/src/isolation/contracts.ts`   | neutral adapter/workload/bridge contracts |
| `packages/werkstatt/src/isolation/schemas.ts`     | strict messages, grants, limits, evidence |
| `packages/werkstatt/src/isolation/conformance.ts` | provider-neutral adversarial suite        |
| `packages/werkstatt/src/isolation/tests/**`       | fake adapters and negative vectors        |
| `packages/werkstatt/package.json`                 | neutral isolation contract export         |

No concrete provider dependency, credential, artifact store, network endpoint, or production loader is added.

### Output format

Conformance returns adapter/evidence/policy/fixture identities, each adversarial case, observed containment/termination result, violations, and final `pass | fail | incomplete`. Only exact `pass` is admissible; the result itself still requires Law Kernel admission.

### Failure modes

| Condition                                     | Result                        |
| --------------------------------------------- | ----------------------------- |
| Ambient authority or undeclared bridge call   | fail and terminate            |
| Schema/size/time/concurrency/replay violation | fail and terminate/quarantine |
| Limit or egress enforcement unavailable       | incomplete; not admissible    |
| Secret/environment/descriptor inherited       | fail                          |
| Teardown cannot prove termination             | fail; quarantine/incident     |
| Provider claim lacks independent evidence     | incomplete                    |

## Rollout

1. Implement neutral schemas and fake adapter harness.
2. Add adversarial cases and explicit rejection fixtures for vm/worker/subprocess theatre.
3. Use the contract to constrain evaluator data workloads without executable artifact activation.
4. Packet 190 implements and certifies one real provider.
5. Packet 200 uses only admitted adapters for capability candidates.

## Alternatives considered

### Standardize on `node:vm` or worker threads

Rejected because neither is a hostile-code security boundary.

### Standardize one provider in the base contract

Rejected because component/runtime contracts should express properties and bridge behavior, while provider choice and evidence belong to packet 190.

### Give workloads filtered environment/filesystem access

Rejected because deny lists leak ambient authority; all access must be explicit brokered capability RPC.

## Risks

- **Provider-neutral lowest common denominator:** contract specifies required security properties, not provider API shape.
- **Sandbox theatre:** explicit rejected adapters and adversarial evidence prevent naming from substituting for proof.
- **Bridge confused deputy:** caller/workload/grant/request identity and attenuation checked on every call.
- **Resource exhaustion:** hard byte/time/concurrency/resource limits and termination tests.
- **False positives:** security failures have zero suppression; unavailable proof is incomplete.
- **Privacy:** no credentials/private workspace data cross unless an explicit redacted capability contract permits it.

## Acceptance criteria

- [ ] Strict adapter/workload/bridge schemas reject unknown fields, ambient authority, invalid grants, replay, confused identity, and all bound violations.
- [ ] Adversarial conformance covers filesystem/network/process/env/credential/descriptor escape, resource exhaustion, workload separation, teardown, crash, and bridge confusion.
- [ ] `node:vm`, `worker_threads`, and ordinary subprocess fixtures cannot pass the untrusted isolation tier.
- [ ] Adapter claims without independent property evidence or enforceable limits return `incomplete`, never pass.
- [ ] No concrete provider, production activation command, credential, network endpoint, or untrusted executable fixture is added.
- [ ] Scoped tests/build, RFC/Compass validation, secret scan, and clean-tree verification pass.

## Implementation notes for agents

- Implement only after acceptance and sealed packet 090.
- Do not choose a provider or run untrusted code; packet 190 owns both.
- Never infer isolation from process separation or a manifest flag.
- Never pass ambient environment, filesystem, network, process handles, credentials, or host objects.
- Any missing security property is `incomplete`; no waiver/suppression exists.
- Escalate new isolation tiers or bridge authority through an accepted RFC.
