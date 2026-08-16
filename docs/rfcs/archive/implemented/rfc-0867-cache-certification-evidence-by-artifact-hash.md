---
id: RFC-0867
title: "Cache certification evidence by artifact hash to skip redundant mission.check across gates"
status: implemented
kind: architecture
scope: workspace
owners:
  - architecture
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-08-16
updatedAt: 2026-08-16
enhancedAt: 2026-08-16
implementedAt: 2026-08-16
closedAt:
supersedes: []
supersededBy:
amends:
  - RFC-0866
amendedBy: []
related:
  - RFC-0866
  - RFC-0865
satisfies:
  - DNA-59
  - DNA-49
versionBump: patch
commands:
  proposed: []
  added: []
  changed:
    - leitstand.certify
  removed: []
appsImpacted: []
packagesImpacted:
  - "@warpgogol/werkstatt"
successSignals:
  - "leitstand.certify for alt/main gate completes in <5s when artifact hash matches a prior gate decision for the same release"
  - "mission.check is invoked at most once per release across dev/alt/main certification"
nonGoals:
  - "Does not change the certification authority, dossier, or gate decision schema (GateDecisionV1 fields are unchanged)"
  - "Does not skip certification for different artifact hashes"
  - "Does not remove the per-gate gate-decision JSON file output"
  - "Does not change the EvidenceEnvelopeV1 schema"
---

# RFC-0867: Cache certification evidence by artifact hash to skip redundant mission.check across gates

## Context

During the m000060 pipeline test (2026-08-16), `leitstand.certify` was called three times for the same release `warpgogol-com-r000031` with the same `artifact-hash`:

1. **dev gate**: `mission.check` ran 124 Playwright/Axiom pages — ~105s
2. **alt gate**: `mission.check` ran the same 124 pages — ~105s
3. **main gate**: `mission.check` ran again — ~46s (HTTP cache hit)

Total: ~256s of redundant checking for identical content. The certification profile (`astroCertificationProfile`) has a single producer (`astro-mission-check`) that invokes `mission.check` with `--external-preview --base-url=<dev-url>`. Since the artifact hash is identical across all three gates for the same release, the evidence produced is semantically identical.

RFC-0866 established the certification pipeline and gate decision flow. This RFC amends RFC-0866 to add evidence reuse by artifact hash.

## Problem

`leitstand.certify` (in `packages/werkstatt/src/leitstand/certify.ts`) unconditionally executes the `astro-mission-check` producer for every gate invocation, even when:

- The `artifactHash` is identical to a prior certification for the same release
- The `baseUrl` points to the same dev deployment
- The content has not changed between gates

This wastes ~2-4 minutes of agent time per release on redundant Playwright/Axiom runs. For AI agents operating the pipeline, this is a significant friction point — the agent waits idle while identical checks re-execute.

## Decision

`leitstand.certify` reuses evidence from a prior gate decision for the same release when the `artifactHash` matches, skipping producer execution and writing a new `GateDecisionV1` with the reused evidence.

- The reuse is keyed by `(releaseId, artifactHash)` — not by gate. If the artifact hash changes between gates, the cache is invalidated.
- The first gate certification for a release always executes producers (no prior evidence to reuse).
- Subsequent gates for the same release with the same artifact hash skip producer execution and copy the evidence envelope from the prior gate decision.
- A `--force` flag bypasses the cache and re-executes producers.
- The gate-decision JSON file is still written per gate (dev/alt/main) with its own `decisionId` and `gate` field — only producer execution is skipped.

## Architectural fit

- **RFC-0866**: This amends the certification pipeline by adding a cache layer in `runLeitstandCertify` before producer execution. The gate decision schema, dossier, and authority are unchanged.
- **RFC-0865**: Deployment authority is unchanged — `authorizeAndDeploy` still loads the per-gate gate-decision JSON.
- **Certification freshness**: The reused evidence retains its original `freshness.expiresAt` (30 min from production). If the evidence is stale, the cache is invalidated and producers re-execute.

## Design

### CLI surface

```sh
# First gate — always executes producers
pnpm exec werkstatt run leitstand.certify --site=warpgogol-com --gate=dev --release=warpgogol-com-r000031

# Subsequent gates — reuses evidence if artifact hash matches
pnpm exec werkstatt run leitstand.certify --site=warpgogol-com --gate=alt --release=warpgogol-com-r000031
pnpm exec werkstatt run leitstand.certify --site=warpgogol-com --gate=main --release=warpgogol-com-r000031

# Force re-execution (bypass cache)
pnpm exec werkstatt run leitstand.certify --site=warpgogol-com --gate=alt --release=warpgogol-com-r000031 --force
```

### TypeScript contracts

```ts
interface EvidenceCacheEntry {
  artifactHash: Sha256Digest;
  evidence: EvidenceEnvelopeV1[];
  producedAt: string;
  freshnessExpiresAt: string;
  sourceGate: GateChannel;
}

// In certify.ts — before executeProducers:
// 1. Scan gate-decisions/{releaseId}-*.json for matching policyBundleRoot
//    (policyBundleRoot is set to artifactHash in the certify handler)
// 2. Read the evidence sidecar gate-decisions/{releaseId}-evidence.json
// 3. Check freshness.expiresAt on each evidence envelope
// 4. Return the first non-stale entry with its source gate
async function tryReuseEvidence(
  cacheCloneDir: string,
  releaseId: string,
  artifactHash: Sha256Digest,
  forceRequested: boolean,
): Promise<EvidenceCacheEntry | null> {
  if (forceRequested) return null;
  // Scan gate-decisions/{releaseId}-*.json for matching policyBundleRoot
  // Read gate-decisions/{releaseId}-evidence.json for the evidence envelopes
  // Return the first non-stale entry
}
```

### Evidence persistence

`GateDecisionV1` stores only `selectedEvidence` references (evidenceId, evidenceHash, selectedAt) — not full `EvidenceEnvelopeV1[]`. To enable evidence reuse, `leitstand.certify` writes a **sidecar file** `gate-decisions/{releaseId}-evidence.json` containing the full `EvidenceEnvelopeV1[]` array alongside the gate-decision JSON. This file is written after `executeProducers` returns and before the gate-decision JSON is written.

The sidecar file is an optimization artifact — it is not consumed by the deployment authority (`authorizeDeployment`), the dossier, or any other command. It exists solely for `tryReuseEvidence` to read on subsequent gate certifications for the same release.

The sidecar file schema:

```json
{
  "schema": "werkstatt/evidence-cache@1",
  "releaseId": "warpgogol-com-r000031",
  "artifactHash": "sha256:...",
  "evidence": [/* EvidenceEnvelopeV1[] */],
  "producedAt": "2026-08-16T...",
  "producedByGate": "dev"
}
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `systems-cache/{system}/gate-decisions/{release}-*.json` | Read for prior gate decision (match `policyBundleRoot` to artifact hash) |
| `systems-cache/{system}/gate-decisions/{release}-evidence.json` | Read for reusable evidence envelopes (sidecar) |
| `systems-cache/{system}/gate-decisions/{release}-{gate}.json` | Written per gate (unchanged) |
| `systems-cache/{system}/gate-decisions/{release}-evidence.json` | Written after producer execution (new sidecar) |

### Command registration update

The `reads` field in the `leitstand.certify` command registration (`leitstand.module.ts`) must be updated to include `systems-cache/{system}/gate-decisions/**`:

```ts
reads: [
  "systems-cache/{system}/system-config.yaml",
  "systems-cache/{system}/system-state.yaml",
  "systems-cache/{system}/gate-decisions/**",
],
```

The `--force` flag must be added to the command registration:

```ts
force: {
  kind: "boolean",
  description: "Bypass evidence cache and re-execute producers.",
},
```

### Failure modes

- **Stale evidence**: If the prior gate's evidence `freshness.expiresAt` has passed, the cache is invalidated and producers re-execute.
- **Missing prior gate**: If no gate-decision JSON exists for the release, producers execute normally.
- **Missing evidence sidecar**: If a gate-decision JSON exists but the evidence sidecar file is missing or malformed, producers execute normally (cache miss — no error).
- **`--force` flag**: Bypasses the cache entirely, always executing producers.
- **Concurrent certification**: The gate lock manager (`CERT-ORCHESTRATOR-03` per-release+gate mutual exclusion) protects the reuse path. Two concurrent certifications for the same release+gate are rejected by the lock. Two concurrent certifications for different gates of the same release are safe — both read the same prior gate-decision, but the write path is per-gate.

## Rollout

- **Default behavior**: Evidence reuse is enabled by default. No flag day required.
- **Existing releases**: Releases certified before this RFC will not have reusable evidence (different artifact hash format or missing fields) — producers will execute normally.
- **New releases**: The first gate (typically dev) executes producers; alt and main reuse.
- **`--force` flag**: Available for cases where re-verification is desired (e.g., after infrastructure changes).

## Alternatives considered

1. **Cache at the producer level (inside `mission.check`)**: Rejected — `mission.check` is a general-purpose command that should not be aware of certification gate semantics. The cache belongs in the certification layer.

2. **Cache at the dossier level**: Rejected — the dossier is an immutable append-only event chain. Reusing evidence is a pre-execution optimization, not a storage concern.

3. **Single certification for all gates**: Rejected — each gate needs its own `GateDecisionV1` with its own `decisionId` and `gate` field for the deployment authority to consume. The optimization is about skipping producer execution, not collapsing gate decisions.

## Risks

- **Stale evidence risk**: If the dev deployment changes between dev and alt certification (e.g., a new deploy overwrites the dev URL), the evidence may not reflect the current state. Mitigation: the `--base-url` is resolved from the latest dev effect record, and if it changes, the evidence should be re-checked. This risk is low because the pipeline is sequential — dev → alt → main — and the dev deployment is not typically re-deployed between gates.
- **Agent confusion**: Agents may not understand why the second gate is faster. Mitigation: log a clear `[leitstand.certify] reusing evidence from {prior-gate} gate (artifact hash match)` message.

## Acceptance criteria

- [x] `tryReuseEvidence` function implemented in `certify.ts` — scans `gate-decisions/{release}-*.json` for matching `policyBundleRoot`, reads evidence sidecar `{release}-evidence.json` (evidence: packages/werkstatt/src/leitstand/certify.ts:82-168, test: leitstand-0867-evidence-reuse.test.ts "same artifact hash → evidence reused")
- [x] `--force` flag added to `leitstand.certify` command registration in `leitstand.module.ts` (evidence: packages/werkstatt/src/leitstand/leitstand.module.ts:325-328, test: leitstand-0867-evidence-reuse.test.ts "--force → producers execute")
- [x] Evidence sidecar `gate-decisions/{release}-evidence.json` written after producer execution (evidence: packages/werkstatt/src/leitstand/certify.ts:170-194, test: leitstand-0867-evidence-reuse.test.ts "same artifact hash → evidence reused" verifies sidecar is read)
- [x] Gate-decision JSON is still written per gate with unique `decisionId` (evidence: packages/werkstatt/src/leitstand/certify.ts:568-580, gate-decision written in both reuse and execute paths)
- [x] Stale evidence (past `freshness.expiresAt`) is not reused (evidence: packages/werkstatt/src/leitstand/certify.ts:147-152, test: leitstand-0867-evidence-reuse.test.ts "stale evidence → producers execute")
- [x] Missing evidence sidecar falls through to producer execution (no error) (evidence: packages/werkstatt/src/leitstand/certify.ts:126, test: leitstand-0867-evidence-reuse.test.ts "missing evidence sidecar → producers execute")
- [x] `reads` field in command registration includes `gate-decisions/**` (evidence: packages/werkstatt/src/leitstand/leitstand.module.ts:331-335)
- [x] Concurrent certification for same release+gate is rejected by gate lock manager (evidence: CERT-ORCHESTRATOR-03 in packages/werkstatt/src/certification/orchestration/orchestrator.ts, per-release+gate mutual exclusion is pre-existing)
- [x] Log message indicates evidence reuse source gate (evidence: packages/werkstatt/src/leitstand/certify.ts:467-469, test: leitstand-0867-evidence-reuse.test.ts "same artifact hash" verifies console.info)
- [x] Unit test: same artifact hash → evidence reused (evidence: leitstand-0867-evidence-reuse.test.ts:177)
- [x] Unit test: different artifact hash → producers execute (evidence: leitstand-0867-evidence-reuse.test.ts:205)
- [x] Unit test: `--force` → producers execute even with matching hash (evidence: leitstand-0867-evidence-reuse.test.ts:226)
- [x] Unit test: stale evidence → producers execute (evidence: leitstand-0867-evidence-reuse.test.ts:248)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0867 --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
