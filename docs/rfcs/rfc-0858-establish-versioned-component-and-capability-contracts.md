---
id: RFC-0858
title: "Establish versioned component and capability contracts"
status: draft
kind: contract
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-08-15
updatedAt: 2026-08-15
enhancedAt:
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0855
  - RFC-0856
  - RFC-0857
  - werkstatt-release-certification/AMD-007
dependsOn:
  - RFC-0855
  - RFC-0852
batch: agent-runtime-certification-program
satisfies:
  - DNA-53
  - DNA-64
versionBump: minor
commands:
  proposed: []
  added: []
  changed: []
  removed: []
appsImpacted: []
packagesImpacted:
  - "@warpgogol/werkstatt"
successSignals:
  - "Every runtime contribution has immutable identity, versioned provides/requires, grants, effects, isolation, and bounded resource declarations"
  - "One canonical ResolvedComponentSet identity changes for every semantic graph, grant, effect, or isolation change"
  - "Unknown capability, effect, grant, isolation tier, or manifest field fails validation"
nonGoals:
  - "Do not implement lifecycle execution, dependency resolution, sandboxing, certification, or promotion"
  - "Do not preserve werkstatt/plugin@1 or introduce a plugin-to-component adapter"
  - "Do not allow component manifests to grant authority or prove sandbox isolation"
---

# RFC-0858: Establish versioned component and capability contracts

## Context

RFC-0855 replaces the RFC-0770 monolithic plugin authority with one stack profile resolving an immutable graph of independently lifecycle-managed components. The current kernel registries accept process-lifetime commands, pipelines, adapters, and listeners without one shared identity, dependency, permission, effect, or ownership contract. AMD-007 additionally requires release certification to bind the exact component set that produced and evaluated a release.

This RFC owns packet 050. It defines the strict data boundary consumed by later lifecycle, resolution, isolation, certification, sandbox, and evolution RFCs. Those later RFCs must not invent competing component identities.

## Problem

Without one contract, later agents can produce incompatible local types: bare string service keys, semver-only identity, optional effect descriptions, unbounded resource claims, profile hashes that omit evaluator versions, or component manifests treated as proof of permission. Such contracts cannot support deterministic resolution, exact certification identity, safe unload, or fail-closed admission.

## Decision

Werkstatt gains strict versioned contracts for immutable component artifacts, namespaced capability provides/requires, attenuated grants, closed effect declarations, isolation requirements, lifecycle-owned registrations/resources, and canonical resolved-component-set identity.

The manifest is a declaration presented for validation. It is not authority: the Law Kernel independently admits the artifact, grants, effect policy, isolation adapter, and resolved graph.

## Architectural fit

- **DNA-53:** all identities use the existing semantic fingerprint authority and canonical bytes; this RFC creates no second hashing implementation.
- **DNA-64:** one stack profile selects inputs to one engine-resolved component graph. Stack packages contribute components but never own a parallel registry.
- **RFC-0855:** preserves release/capability candidate separation, the Law Kernel boundary, four effect classes, and no compatibility path.
- **AMD-007:** `ResolvedComponentSet` supplies the runtime identity bound into certification artifacts.

## Design

### CLI surface

No command is introduced. Packet 050 implements contracts and tests only. Validation is invoked through package tests and the later resolution/conformance surfaces.

### TypeScript contracts

```ts
type ComponentId = `${string}/${string}`;
type CapabilityId = `${string}/${string}`;
type EffectClass =
  | "revertible"
  | "transactional"
  | "compensatable"
  | "irreversible-emission";
type IsolationTier = "trusted-in-process" | "sandboxed";

interface ComponentManifestV1 {
  schema: "werkstatt/component-manifest@1";
  componentId: ComponentId;
  version: string;
  artifactHash: string;
  provides: CapabilityProvideV1[];
  requires: CapabilityRequireV1[];
  requestedGrants: GrantRequestV1[];
  effects: EffectDeclarationV1[];
  isolation: IsolationRequirementV1;
  resources: ResourceBoundV1[];
}

interface CapabilityProvideV1 {
  capability: CapabilityId;
  version: string;
  schemaHash: string;
}

interface CapabilityRequireV1 {
  capability: CapabilityId;
  compatibility: string;
  schemaHash: string | null;
  optional: boolean;
}

interface ResolvedComponentSetV1 {
  schema: "werkstatt/resolved-component-set@1";
  profileId: string;
  components: ResolvedComponentIdentityV1[];
  dependencyGraphHash: string;
  grantSetHash: string;
  effectPolicyHash: string;
  isolationPolicyHash: string;
  setHash: string;
}
```

Runtime schemas close identifier grammar, version vocabulary, array/cardinality/byte bounds, duplicate rules, capability compatibility syntax, grants, resources, isolation tiers, and effect classes. Unknown fields fail.

Canonical ordering is explicit: components by `componentId` then version/artifact hash; capabilities by namespace/name/version/schema hash; grants/effects/resources by their canonical identity. Input order never changes `setHash`, but any semantic field change does.

### Contract boundaries

- A `provide` states an implementation contract, not authority to activate.
- A `require` is version/schema compatibility, not an ambient service lookup.
- Requested grants are upper bounds; admitted grants may only attenuate them.
- Every external interaction has exactly one closed effect class and required recovery/commit metadata.
- `trusted-in-process` is restricted to pinned first-party artifacts admitted by policy. `sandboxed` is a requirement, not proof that an adapter is secure.
- Every runtime registration/resource is attributed to a component identity and lifecycle scope.

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/werkstatt/src/component/contracts.ts` | exported strict TypeScript contracts |
| `packages/werkstatt/src/component/schemas.ts` | runtime schemas and bounds |
| `packages/werkstatt/src/component/identity.ts` | canonical identities using existing fingerprint authority |
| `packages/werkstatt/src/component/index.ts` | narrow public exports |
| `packages/werkstatt/src/component/tests/**` | vectors, negative fixtures, identity sensitivity |
| `packages/werkstatt/package.json` | component-contract subpath export |

No registry, plugin adapter, loader, sandbox, provider state, credential, or deployed site is touched.

### Output format

The contract layer returns typed parse results and stable violations:

```json
{
  "status": "fail",
  "violations": [
    {
      "rule": "COMPONENT-CONTRACT-03",
      "path": "provides[1].capability",
      "message": "duplicate capability provide identity"
    }
  ]
}
```

Rules cover malformed schema, invalid identity/version, duplicates/conflicts, unknown grant/effect/isolation/resource types, bound overflow, non-canonical identity, and set-hash mismatch. No warning/suppression mode exists.

### Failure modes

| Condition                                             | Result |
| ----------------------------------------------------- | ------ |
| Unknown schema/field/effect/grant/tier                | fail   |
| Duplicate component or provide                        | fail   |
| Requirement has invalid compatibility/schema identity | fail   |
| Requested resource or manifest exceeds bounds         | fail   |
| Recomputed hash differs                               | fail   |
| Manifest requests authority reserved to Law Kernel    | fail   |

## Rollout

1. Add contracts, schemas, canonical vectors, and negative fixtures without activating components.
2. Export the narrow component-contract API.
3. Later packets implement lifecycle and resolution exclusively against these types.
4. Certification contract packet 100 binds the exact `setHash` without redefining it.
5. The old plugin contract remains active only because program cutover has not occurred; no adapter or dual-write is added. Packet 230 removes it in the combined cutover.

## Alternatives considered

### Extend `WerkstattPlugin`

Rejected because a monolithic plugin cannot independently version, replace, drain, grant, isolate, or hash producers/evaluators/adapters.

### Use bare string service keys

Rejected because they omit namespace, compatibility, and schema identity and make resolution nondeterministic.

### Let components declare arbitrary effect names

Rejected because admission cannot prove recovery semantics for an open vocabulary.

## Risks

- **Speculative generality:** mitigated by the minimum fields required by RFC-0855 and AMD-007; later runtime policy is excluded.
- **Canonicalization drift:** frozen vectors and use of the existing fingerprint authority provide one identity implementation.
- **Manifest-as-authority confusion:** explicit declaration/admission separation and negative authority-reservation fixtures.
- **False positives:** strict contract violations have zero intended false positives and no suppression; a valid new effect/grant/tier requires an accepted architectural change.
- **Agent scope expansion:** exact file ownership and non-goals prevent lifecycle/sandbox implementation in packet 050.

## Acceptance criteria

- [ ] Strict `component-manifest@1` and `resolved-component-set@1` schemas reject unknown fields, invalid identities, duplicate provides, incompatible requirements, unknown effects/grants/tiers, and bound overflow.
- [ ] Canonical identity vectors prove input-order invariance and sensitivity to every component, graph, grant, effect-policy, isolation-policy, version, schema, and artifact change.
- [ ] Grants attenuate requested authority, component manifests cannot claim Law Kernel powers, and `sandboxed` declarations are not treated as isolation evidence.
- [ ] Every registration/resource and every effect declaration has one component lifecycle owner and one closed effect class.
- [ ] The package exports one narrow contract/identity API with no plugin adapter, registry, loader, sandbox, or activation behavior.
- [ ] Scoped tests, `@warpgogol/werkstatt` build check, RFC validation, Compass validation, and clean-tree verification pass.

## Implementation notes for agents

- Implement only after this RFC is explicitly accepted and packet 050 is sealed.
- Do not implement lifecycle, resolver, conformance, sandbox, certification, or promotion behavior here.
- Do not import stack packages into Werkstatt or add a compatibility adapter for `werkstatt/plugin@1`.
- Reuse the existing canonical fingerprint authority; never hash `JSON.stringify` output ad hoc.
- Treat every unknown value and exceeded bound as fail. Do not add suppressions.
- If a required effect/grant/isolation class is absent, stop and create an accepted RFC; do not extend the vocabulary locally.
- Use `ecosystem.commit`, inspect full diffs, and keep all trees clean.
