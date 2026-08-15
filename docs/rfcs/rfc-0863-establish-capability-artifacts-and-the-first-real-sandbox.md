---
id: RFC-0863
title: "Establish capability artifacts and the first real sandbox"
status: draft
kind: architecture
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
dependsOn: [RFC-0848, RFC-0862]
batch: agent-runtime-certification-program
satisfies: [DNA-51, DNA-52, DNA-64]
versionBump: minor
commands:
  proposed: []
  added: []
  changed: []
  removed: []
appsImpacted: []
packagesImpacted: ["@warpgogol/werkstatt"]
successSignals:
  - "Capability artifacts are immutable, content-addressed, admitted objects rather than mutable source folders"
  - "One real sandbox provider passes the provider-neutral RFC-0862 adversarial contract"
  - "Only explicitly granted bridge capabilities cross the host-workload boundary"
nonGoals:
  - "Do not implement governed capability evolution, canary promotion, or autonomous rollback"
  - "Do not grant the sandbox ambient filesystem, network, process, environment, or credentials"
  - "Do not make provider choice part of component or capability manifests"
---

# RFC-0863: Establish capability artifacts and the first real sandbox

## Context

RFC-0848 integrates the foundation, while RFC-0862 defines the provider-neutral isolation contract. The program still needs an immutable artifact boundary and one concrete sandbox implementation before untrusted capability candidates can exist. Packet 190 owns that narrow transition.

## Problem

A source directory, package installation, process boundary, or provider marketing claim is not a capability artifact or security proof. Without content-addressed artifacts, independently admitted provider evidence, and an attenuated bridge, agents could mutate executable inputs after review or inherit ambient host authority.

## Decision

Werkstatt gains an immutable capability artifact store, one selected real sandbox adapter, provider admission evidence, and a deny-by-default host capability broker. A workload starts only from an admitted artifact hash, an admitted adapter version, an explicit grant set, and a bounded invocation envelope.

## Architectural fit

- **DNA-51:** artifact publication, workload creation, invocation, teardown, and recovery are idempotent and evidence-bearing.
- **DNA-52:** executable capability bytes are explicit, immutable, content-addressed artifacts.
- **DNA-64:** the engine owns admission and neutral contracts; the concrete sandbox is a replaceable capability.
- **RFC-0862:** provider selection must pass the unchanged neutral conformance contract.
- **RFC-0848:** the integrated runtime supplies canonical identity, lifecycle, diagnostics, and Law Kernel admission.

## Design

### CLI surface

No new public command is committed by this RFC. Existing internal orchestration may publish, admit, instantiate, invoke, and retire artifacts through typed package APIs. Any later operator command requires its own accepted command decision and manifest update.

### TypeScript contracts

```ts
interface CapabilityArtifactV1 {
  schema: "werkstatt/capability-artifact@1";
  artifactHash: string;
  manifestHash: string;
  payloadHash: string;
  mediaType: string;
  sizeBytes: number;
  provenance: ArtifactProvenanceV1;
}

interface SandboxProviderAdmissionV1 {
  adapterId: string;
  adapterVersion: string;
  conformanceHash: string;
  policyHash: string;
  decision: "pass" | "fail" | "incomplete";
}

interface CapabilityInvocationV1 {
  artifactHash: string;
  grantSetHash: string;
  inputHash: string;
  limits: WorkloadLimitsV1;
  idempotencyKey: string;
}
```

The store rejects mutable aliases as authority. Publication verifies canonical bytes, hashes, manifest/payload agreement, provenance, size/media policy, and immutability. Admission binds the exact artifact, adapter, conformance report, policy, bridge schema, and grants.

Provider selection is evidence-led: hostile-code containment, fresh workload boundaries, no inherited descriptors/environment/credentials, egress denial, resource enforcement, deterministic termination, concurrent separation, and reproducible deployment on supported Linux hosts. Provider credentials, if required, use declared environment bindings with a committed `.env.example`; they never enter artifacts or reports.

The broker exposes only named, versioned, attenuated capabilities. Every request binds caller, workload, artifact, grant, request, policy, and trace identity; enforces input/output/time/concurrency quotas; and emits redacted audit evidence. Direct host objects and ambient APIs are impossible by construction.

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/werkstatt/src/capability-artifacts/**` | immutable artifact contracts, store, admission, provenance |
| `packages/werkstatt/src/isolation/providers/**` | first concrete adapter and deployment wiring |
| `packages/werkstatt/src/isolation/broker/**` | deny-by-default capability bridge |
| `packages/werkstatt/src/isolation/tests/**` | neutral and provider-specific adversarial tests |
| `.env.example` or package-local equivalent | names only for required provider configuration |

Runtime artifacts, provider credentials, and test secrets remain untracked. The implementation must not modify mission workpieces or Sternsystem mirrors.

### Output format

Programmatic operations return canonical artifact/admission/invocation/termination records with hashes, adapter and policy identities, granted capabilities, resource observations, redacted diagnostics, and `pass | fail | incomplete`. Secret values and private payload bytes never appear.

### Failure modes

| Condition                                             | Result                                   |
| ----------------------------------------------------- | ---------------------------------------- |
| Artifact bytes or manifest differ from admitted hash  | reject and quarantine                    |
| Provider evidence is absent, stale, or incomplete     | do not start workload                    |
| Requested capability exceeds admitted grants          | reject request; record violation         |
| Sandbox escape, ambient access, or secret inheritance | terminate, quarantine, incident evidence |
| Hard resource or timeout limit exceeded               | deterministic termination and failure    |
| Teardown cannot prove workload death                  | quarantine adapter/workload; block reuse |

## Rollout

1. Freeze provider criteria and hostile fixtures from RFC-0862.
2. Implement the immutable artifact store and fake-provider integration tests.
3. Select one provider against recorded, reproducible evidence; document credentials/configuration without values.
4. Implement the adapter and broker; run every neutral and provider-specific adversarial case.
5. Admit only test capability artifacts until packet 200 adds governed evolution.

## Alternatives considered

### Load npm packages or source folders directly

Rejected because mutable resolution and installation state cannot be the reviewed executable identity.

### Let the provider define grants and messages

Rejected because provider APIs would become policy authority and violate the neutral contract.

### Build the evolution controller in the same packet

Rejected because secure artifact execution must be proven independently before autonomous candidate transitions exist.

## Risks

- **Provider lock-in:** all platform-facing behavior stays behind RFC-0862 contracts and conformance.
- **Sandbox theatre:** independent adversarial evidence, not adapter self-description, controls admission.
- **Supply-chain substitution:** content addressing, provenance, immutable storage, and read-before-run verification.
- **Credential leakage:** explicit binding names, redaction, secret scanning, and no inheritance.
- **Resource abuse:** hard limits, bounded bridge traffic, deterministic teardown, and quarantine.
- **Operational fragility:** failure is closed; unavailable provider/evidence means no untrusted execution.

## Acceptance criteria

- [ ] Capability artifact schemas and storage enforce canonical content identity, immutability, provenance, media/size policy, and hash verification before every run.
- [ ] The selected provider passes all RFC-0862 neutral adversarial cases plus provider-specific escape, teardown, crash, concurrency, and resource tests on supported hosts.
- [ ] The broker grants only explicit versioned capabilities and rejects ambient filesystem, network, process, environment, credential, descriptor, IPC, and host-object access.
- [ ] Admission binds exact artifact, adapter, conformance, policy, bridge, and grant identities; missing or stale evidence cannot start a workload.
- [ ] Configuration names and local setup are documented without secret values; scans prove artifacts, reports, logs, and fixtures contain no credentials.
- [ ] No evolution controller, canary promotion, production agent capability, or provider-specific manifest field is introduced.
- [ ] Scoped tests/build, RFC/Compass validation, secret scan, and clean-tree verification pass.

## Implementation notes for agents

- Implement only after acceptance and a sealed packet 190.
- Evaluate and record provider evidence before adding its dependency or adapter.
- Never treat a package, process, container label, or provider claim as isolation proof.
- Never pass ambient authority or credentials into a workload.
- Missing evidence, unsupported enforcement, or uncertain teardown is `incomplete` and blocks execution.
- Keep evolution, canary, promotion, rollback policy, and production activation in later accepted decisions.
