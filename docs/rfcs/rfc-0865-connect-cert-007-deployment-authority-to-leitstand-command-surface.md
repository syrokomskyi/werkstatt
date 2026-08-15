---
id: RFC-0865
title: "Connect CERT-007 deployment authority to Leitstand command surface"
status: accepted
# kind options: architecture | contract | command | policy | deprecation
kind: architecture
# scope options: app | workspace
scope: workspace
owners:
  - architecture
# Set by the deciding human together with the status change (RFC-0335).
# Draft scaffolds must keep this empty; do not prefill a default identity.
# Format: human:<handle> (agent:<id> reserved — see RFC-0335)
# Default reviewer when none is specified by the operator: human:andrii-syrokomskyi
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-08-15
updatedAt: 2026-08-15
enhancedAt: 2026-08-15
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0851
  - RFC-0855
  - RFC-0857
  - RFC-0608
  - RFC-0627
  - RFC-0628
  - RFC-0700
  - RFC-0842
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-49
  - DNA-73
  - DNA-64
# RFC-0396: Traceability to a vendored spec node: "<spec-id>/<node-id>", e.g. "pbp/RFC-PBP-020".
# Set by spec.materialize; leave commented for non-spec RFCs.
# specRef:
# RFC-0478: Platform versioning enforcement. Declares the SemVer delta this RFC
# produces when implemented. Required for post-cutoff implemented RFCs (V-29).
# Values: minor (Breaks-B, requires migrator), patch (safe), none (prose-only),
# major (architectural, manually reserved). Default: patch.
versionBump: minor
commands:
  proposed: []
  added: []
  changed:
    - leitstand.dev-deploy
    - leitstand.propagate
    - leitstand.promote
    - leitstand.status
    - leitstand.rollback
    - leitstand.health
    - leitstand.pipeline.check
    - release.rollback
  removed: []
appsImpacted: []
packagesImpacted:
  - werkstatt
  - werkstatt-site
successSignals:
  - "leitstand.dev-deploy calls authorizeDeployment(gate: dev-deploy) and deploys only when authorized: true"
  - "leitstand.propagate calls authorizeDeployment(gate: propagate-alt) with durableSyncVerified: true via R2 adapter"
  - "leitstand.promote calls authorizeDeployment(gate: promote-main) with requiresMainVerification: true"
  - "Minimal Astro certification profile registered and validated via validateCertificationProfileV1"
  - "CERT-TRANSITION-01 block removed from all 8 commands; buildCertificationTransitionBlock no longer imported in leitstand-commands.ts or release-commands.ts"
nonGoals:
  - "Do not restore legacy release state labels (published, dev-deployed, alt-deployed, promoted, main-deployed, rolled-back)"
  - "Do not bypass authorizeDeployment() or skip certification gates"
  - "Do not copy old 2123-line Leitstand code as-is; rewrite through certification authority"
  - "Do not implement full certification profiles for game or video stacks in this RFC"
  - "Do not remove the werkstatt/plugin@1 contract; that requires a separate superseding RFC"
# RFC-0268: OPTIONAL machine-checkable acceptance probes, executed on-demand
# via `pnpm exec werkstatt run rfc.acceptance.run --id <this-rfc-id>` (never
# automatically inside build pipelines). Closed probe vocabulary — see
# docs/rfcs/rfc-0268-make-rfc-acceptance-criteria-machine-checkable.md.
# acceptance:
#   - probe: run
#     command: "site-kernel run some.command.validate --app warpgogol-com"
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

# RFC-0865: Connect CERT-007 deployment authority to Leitstand command surface

## Context

RFC-0851 (packet 120) replaced legacy release states (`published`, `dev-deployed`, `alt-deployed`, `promoted`, `main-deployed`, `rolled-back`) with artifact-only states (`prepared`, `ready`). To enforce the forward-only cutover, all 8 deployment commands (`leitstand.dev-deploy`, `leitstand.propagate`, `leitstand.promote`, `leitstand.status`, `leitstand.rollback`, `leitstand.health`, `leitstand.pipeline.check`, `release.rollback`) were gutted — 2123 lines of deploy logic replaced with 70 lines of `buildCertificationTransitionBlock()` calls that return `CERT-TRANSITION-01` with `requiredNode: "CERT-007"`.

Simultaneously, RFC-0855's certification program implemented the replacement authority path: `authorizeDeployment()` in `packages/werkstatt/src/certification/deployment/authority.ts` (CERT-007, packet 210), `evaluateCertificationDecision()` (CERT-006), `DeploymentOperationState` event chain, certification profile schemas (CERT-002), durable storage interface (CERT-003), producer/evaluator frameworks (CERT-005/006), and the clean cutover marker (CERT-009). All 25 packets (000–240) are completed.

The gap: `authorizeDeployment()` exists but is never called. Leitstand commands return `CERT-TRANSITION-01` without reaching the certification authority. The deployment pipeline is architecturally complete but electrically disconnected.

## Problem

DNA-49 (Fleet propagation) and DNA-73 (Sequential deployment pipeline) are unprotected: the Leitstand commands that enforce Dev → Alt → Main ordering, per-site targeting, `--all` rejection, build-identity verification, cache purge, health checks, and smoke tests are all blocked. Operators cannot deploy sites through the kernel command surface.

The certification authority (`authorizeDeployment()`, `verifyMainPromotion()`, `evaluateRollback()`) is implemented but unreachable. The `CERT-TRANSITION-01` block in `packages/werkstatt/src/certification/transition-block.ts` is imported by `leitstand-commands.ts` (line 98) and `release-commands.ts` (line 53) and called unconditionally in all 8 command handlers, short-circuiting before any deploy logic can run.

Additionally, no certification profile is registered for the Astro stack, so even if Leitstand were reconnected, `authorizeDeployment()` would fail at `CERT-DEPLOY-07` (gate decision is not `"pass"`) because no gate decision can be produced without a profile, producers, and evaluators. No R2 durable storage adapter exists, so `requiresDurableSync: true` for Alt/Main gates cannot be satisfied.

## Decision

The 8 blocked deployment commands are rewritten to call `authorizeDeployment()` from `packages/werkstatt/src/certification/deployment/authority.ts` as a mandatory gate before executing deploy logic. A minimal Astro certification profile is registered with producers and evaluators sufficient for the dev-deploy gate. An R2 durable storage adapter is implemented for the dossier repository to satisfy `requiresDurableSync: true` for Alt/Main gates. The `CERT-TRANSITION-01` block and `buildCertificationTransitionBlock` are removed from all deployment command handlers.

## Architectural fit

- **DNA-49 (Fleet propagation / Leitstand):** This RFC restores the Leitstand as the fleet operation component that deploys releases to Sternsystem deployment targets. Per-site targeting, `--all` rejection, Dev → Alt → Main ordering, and channel/URL logging remain mandatory. The adapters, locks, build-identity verification, freshness checks, Bordbuch events, and health mechanisms are reconnected through `authorizeDeployment()`.
- **DNA-73 (Sequential deployment pipeline enforcement):** Restores `leitstand.dev-deploy`, `leitstand.propagate`, `leitstand.promote` with `--all` rejection, channel/URL logging, and strictly sequential Dev → Alt → Main ordering. Deployment progress is recorded as append-only `DeploymentOperationState` events, not release manifest mutations.
- **DNA-64 (Engine/profile/component-graph boundary):** The engine owns `authorizeDeployment()`, `evaluateCertificationDecision()`, and the `DeploymentOperationState` state machine. Stack packages (`werkstatt-site`) contribute producers (Axiom checks, smoke tests, E2E) and deploy adapters as capabilities. No stack plugin is imported into the engine.
- **RFC-0851 compatibility:** Release manifests remain artifact-only (`prepared`/`ready`). `LegacyReleaseError` is not weakened. `release.list` continues to report `legacyInvalid` entries separately.
- **RFC-0855 compatibility:** All 25 certification packets remain completed. This RFC does not amend or supersede any packet. It connects the existing CERT-007 authority to the existing Leitstand command surface.

## Design

### Rollout steps

Implementation is divided into 5 independently testable steps:

**Step 1: `leitstand.dev-deploy`** — Restore deploy logic (build/wrangler/cache-purge/health/smoke), route through `authorizeDeployment(gate: "dev-deploy")`. This is the simplest gate: `requiresDurableSync: false`, `requiresMainVerification: false`.

**Step 2: `leitstand.propagate`** — Restore Alt deploy, add `requiresDurableSync: true` verification through R2 adapter.

**Step 3: `leitstand.promote`** — Restore Main deploy, add `requiresMainVerification: true` through `verifyMainPromotion()`.

**Step 4: `leitstand.status`, `leitstand.health`, `leitstand.pipeline.check`** — Restore read-only commands. Read from `DeploymentOperationState` event chain, not legacy release state.

**Step 5: `leitstand.rollback` and `release.rollback`** — Restore rollback through `evaluateRollback()` from `authority.ts`.

### CLI surface

```sh
pnpm exec werkstatt run leitstand.dev-deploy --site <system-id>
pnpm exec werkstatt run leitstand.dev-deploy --site <system-id> --release <release-id>
pnpm exec werkstatt run leitstand.propagate --release <release-id>
pnpm exec werkstatt run leitstand.promote --release <release-id>
pnpm exec werkstatt run leitstand.status --site <system-id>
pnpm exec werkstatt run leitstand.health --site <system-id>
pnpm exec werkstatt run leitstand.pipeline.check --release <release-id>
pnpm exec werkstatt run leitstand.rollback --site <system-id> [--to-release <release-id>]
pnpm exec werkstatt run release.rollback --release <release-id>
```

### TypeScript contracts

```ts
// Already implemented in authority.ts — called from Leitstand handlers
import { authorizeDeployment, type DeploymentAuthorizationInputV1 } from "../certification/deployment/authority.ts";

const input: DeploymentAuthorizationInputV1 = {
  candidateId: releaseId,
  gate: "dev-deploy",          // or "propagate-alt", "promote-main"
  gateDecision: gateDecision,  // from evaluateCertificationDecision()
  durableSyncVerified: false,  // true for alt/main via R2 adapter
  artifactReadinessVerified: true,
  artifactHash: artifactHash,
  forceRequested: false,
  skipRequested: false,
  waiverRequested: false,
  graceRequested: false,
};

const result = authorizeDeployment(input);
if (!result.ok) {
  // CERT-DEPLOY-01..09 — deployment denied
  return { exitCode: 1, diagnostics: [{ ruleId: result.ruleId, ... }] };
}
// result.authorized === true — proceed with deploy
```

```ts
// R2 durable storage adapter — implements existing CertificationStorageAdapterV1
// from packages/werkstatt/src/certification/storage/adapter.ts:21-27
// Content-addressed (digest-keyed), not string-keyed.
import type {
  CertificationStorageAdapterV1,
  StoragePutInputV1,
  StoragePutResultV1,
  StorageHeadResultV1,
} from "../certification/storage/adapter.ts";

export function createR2StorageAdapter(config: {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
}): CertificationStorageAdapterV1 {
  // putObject(input: StoragePutInputV1): digest-keyed, not string-keyed
  // headObject(digest: Sha256Digest): check existence by content hash
  // getObject(digest: Sha256Digest): retrieve by content hash
  // appendAuditRecord(record: Uint8Array): append to audit log
  // ...
}
```

```ts
// Minimal Astro certification profile — matches CertificationProfileV1 schema
// from packages/werkstatt/src/certification/profile/schemas.ts:223-240
const astroProfile: CertificationProfileV1 = {
  schema: "werkstatt/certification-profile@1",
  id: "astro-site-profile",
  version: "1.0.0",
  plugin: {
    id: "werkstatt-site",
    profileId: "astro-typescript-turborepo",
  },
  dimensions: [
    "candidate-integrity",
    "business-truth-compliance",
    "editorial-localization",
    "information-architecture-discoverability",
    "ux-conversion",
    "visual-accessibility",
    "performance-runtime",
    "security-operational-readiness",
    "independent-qualitative-evaluation",
  ],
  producers: {
    "axiom-checks": { /* kernel-command producer */ },
    "site-smoke": { /* kernel-command producer */ },
    "site-e2e": { /* kernel-command producer */ },
  },
  requirements: [/* dev-deploy gate requirements with mandatory: true */],
  evaluatorPolicy: { ordinaryEvaluators: 1, criticalEvaluators: 1, borderlineEvaluators: 1, confidenceMargin: 50 },
  retentionPolicy: { minRetentionDays: 30, maxRetentionDays: 365, tombstoneAfterDays: 365 },
};
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/werkstatt/src/leitstand/leitstand-commands.ts` | Rewrite all 7 Leitstand handlers through `authorizeDeployment()` |
| `packages/werkstatt/src/release/release-commands.ts` | Rewrite `release.rollback` through `evaluateRollback()` |
| `packages/werkstatt/src/certification/transition-block.ts` | Remove `buildCertificationTransitionBlock` imports from Leitstand/release; file may remain for type exports |
| `packages/werkstatt/src/certification/storage/r2-adapter.ts` | New R2 durable storage adapter |
| `packages/werkstatt/src/certification/profile/astro-profile.ts` | New minimal Astro certification profile |
| `packages/werkstatt-site/src/deploy/` | Deploy adapter — `client-export.ts` and `infrastructure-generate.ts` exist; wrangler deploy, cache purge, and health check logic MUST be written from scratch (old code was deleted in commit `30bc3c6f`) |
| `packages/werkstatt-site/src/testing/smoke/` | Smoke test producer (existing, registered in profile) |
| `packages/werkstatt-site/src/testing/e2e/` | E2E test producer (existing, registered in profile) |

### Output format

```json
{
  "command": "leitstand.dev-deploy",
  "status": "ok",
  "data": {
    "systemId": "warpgogol-com",
    "channel": "dev",
    "releaseId": "r000001",
    "deploymentUrl": "https://dev.warpgogol.com",
    "state": "succeeded",
    "authorization": {
      "gate": "dev-deploy",
      "authorized": true,
      "decisionId": "dec-001"
    }
  },
  "exitCode": 0
}
```

When authorization fails:

```json
{
  "command": "leitstand.dev-deploy",
  "status": "fail",
  "data": {
    "systemId": "warpgogol-com",
    "state": "failed"
  },
  "diagnostics": [
    {
      "ruleId": "CERT-DEPLOY-07",
      "severity": "error",
      "message": "gate \"dev-deploy\" decision is \"incomplete\", not \"pass\" — deployment denied"
    }
  ],
  "exitCode": 1
}
```

### Gate decision production flow

Each deployment command produces a `GateDecisionV1` before calling `authorizeDeployment()`:

1. **Command invocation** — e.g. `leitstand.dev-deploy --site <id> --release <id>`
2. **Orchestrator** — `planProducers()` builds topological execution plan from the Astro certification profile's producers
3. **Producer execution** — `executeProducers()` runs each producer (Axiom checks, smoke tests, E2E), collecting `EvidenceEnvelopeV1[]`
4. **Evaluation** — `evaluateCertificationDecision()` in `packages/werkstatt/src/certification/aggregation.ts` takes `CertificationEvaluationInputV1` (policyBundle, evidence, evaluationCutSequence, authorityTime, gate) and returns `CertificationEvaluationResultV1` with `status: "pass" | "fail" | "stale" | "incomplete"`
5. **Gate decision construction** — build `GateDecisionV1` (schema in `packages/werkstatt/src/certification/contracts/decisions.ts:33-48`) from the evaluation result: `decisionId`, `candidateId`, `policyBundleRoot`, `gate`, `evaluationCut`, `selectedEvidence`, `status`, `coverage`, `reasons`, `actionPackRef`, `decidedAt`
6. **Authorization** — `authorizeDeployment()` in `packages/werkstatt/src/certification/deployment/authority.ts` takes the `GateDecisionV1` and returns `DeploymentAuthorizationOutcomeV1`
7. **Deploy** — if `result.ok && result.authorized`, execute deploy logic

### Deploy logic source

The old 2123-line Leitstand code was deleted in commit `30bc3c6f`. `packages/werkstatt-site/src/deploy/` currently contains only `client-export.ts` (file export) and `infrastructure-generate.ts` (infrastructure resolution). Wrangler deploy, cache purge, and health check logic MUST be written from scratch — not copied from git history. The rewrite goes through `authorizeDeployment()` as a mandatory gate.

### Legacy state cleanup

The following legacy state references in `leitstand-commands.ts` MUST be deleted in Step 4/5:

- `PIPELINE_STATE_ORDER` array (line 951-958) — contains legacy states `dev-deployed`, `alt-deployed`, `main-deployed`, `promoted`
- `detectChannelFromState()` function (line 870-876) — uses legacy state labels
- `autoStepReleaseState()` function (line 878-882) — uses legacy state labels
- `determineNextStep()` function (line 965-983) — uses legacy state labels
- `releaseStateIndex()` function (line 960-963) — indexes into `PIPELINE_STATE_ORDER`

`leitstand.pipeline.check` reads from `DeploymentOperationState` event chain instead of legacy release state.

### R2 credential documentation

R2 credentials (`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`) are injected from `systems/registry.yaml` channel config — same pattern as existing deploy adapters. These env vars MUST be documented in `.env.example` files for services that invoke deployment commands. Unit tests use the in-memory storage adapter (`createInMemoryStorageAdapter`) — no real R2 credentials needed for tests.

### Failure modes

| Rule ID | Condition | Behavior |
| --- | --- | --- |
| `CERT-DEPLOY-01` | Unknown deployment gate | exit 1, error diagnostic |
| `CERT-DEPLOY-02..05` | Force/skip/waiver/grace flag not permitted for gate | exit 1, error diagnostic |
| `CERT-DEPLOY-06` | Gate decision candidate mismatch | exit 1, error diagnostic |
| `CERT-DEPLOY-07` | Gate decision is not `"pass"` | exit 1, error diagnostic |
| `CERT-DEPLOY-08` | Artifact readiness not verified | exit 1, error diagnostic |
| `CERT-DEPLOY-09` | Durable sync not verified (Alt/Main only) | exit 1, error diagnostic |
| `LEGACY-RELEASE-01` | Release manifest has legacy state label | exit 1, `LegacyReleaseError` |

## Rollout

- **Step 1 (dev-deploy)** is the default first step. After implementation, `leitstand.dev-deploy --site <id>` calls `authorizeDeployment(gate: "dev-deploy")`. If the Astro certification profile is registered and the gate decision is `"pass"`, deploy proceeds. If the profile is not yet registered, the command fails with `CERT-DEPLOY-07` — this is expected and not a regression.
- **Steps 2–3 (propagate, promote)** require the R2 durable storage adapter. After implementation, `leitstand.propagate` and `leitstand.promote` verify `durableSyncVerified: true` through the R2 adapter before proceeding.
- **Step 4 (status, health, pipeline.check)** are read-only and can be restored independently. They read from `DeploymentOperationState` event chain.
- **Step 5 (rollback)** requires `evaluateRollback()` from `authority.ts`.
- No grace period or opt-in flag. The `CERT-TRANSITION-01` block is removed from all 8 commands in the same commit as Step 1. There is no intermediate state where some commands are unblocked and others are not.
- Existing sites with `prepared` or `ready` releases can be deployed immediately after rollout. Sites with legacy release state labels remain blocked by `LegacyReleaseError`.
- Integration into `build.check`: not applicable — deployment commands are operator-invoked, not pipeline-integrated.

## Alternatives considered

**Alternative A: Restore old Leitstand code as-is, without certification authority.** Rejected: RFC-0851 explicitly forbids restoring legacy deployment commands. The old code mutated release states (now prohibited by `LegacyReleaseError`), did not call `authorizeDeployment()`, and did not use `DeploymentOperationState` event chain. Restoring it would violate the forward-only cutover and bypass the certification authority.

**Alternative B: Leave `CERT-TRANSITION-01` block and deploy manually through wrangler.** Rejected: Manual deploy bypasses certification authority, gate decisions, artifact readiness, durable sync, Bordbuch events, health checks, and smoke tests. It creates untracked deployments without pipeline enforcement (DNA-49, DNA-73). The goal of the Werkstatt platform is to eliminate manual operator work, not enshrine it.

## Risks

- **Restoring 2123 lines of deploy logic:** The old Leitstand code was deleted in commit `30bc3c6f`. Rewriting it through `authorizeDeployment()` is not a copy-paste — it is a re-implementation. Risk of regression in wrangler deploy, cache purge, health check, or smoke test logic. **Mitigation:** 5-step rollout (dev → alt → main → read-only → rollback), each step with unit and integration tests.
- **R2 adapter as new I/O surface:** The durable storage adapter makes HTTP requests to Cloudflare R2. Risk of credential leakage, network failures, partial writes. **Mitigation:** adapter uses existing credential injection from `systems/registry.yaml` channel config (same pattern as deploy adapters), retry with backoff, idempotent operations.
- **Certification profile as new contract:** The Astro profile defines producers and evaluators. Risk of false-positive (gate pass when it should not) or false-negative (gate fail blocks legitimate deploy). **Mitigation:** minimal profile for dev-deploy gate, extended for alt/main as needed. Profile validated via `validateCertificationProfileV1`.
- **Agent misinterpretation:** Agents may assume `CERT-TRANSITION-01` is fully removed and deploy without certification. **Mitigation:** explicit MAY/MUST NOT rules in implementation notes. `authorizeDeployment()` returns `CERT-DEPLOY-01..09` on refusal — agents see structured diagnostics, not silent failures.
- **`leitstand.status` and `leitstand.health` stale data:** Read-only commands unblocked without deploy logic may expose stale data. **Mitigation:** read from `DeploymentOperationState` event chain, not legacy release state.

## Acceptance criteria

- [ ] `leitstand.dev-deploy` calls `authorizeDeployment(gate: "dev-deploy")` and executes deploy only when `authorized: true` (evidence: unit test in `packages/werkstatt/src/leitstand/tests/leitstand-dev-deploy.test.ts`)
- [ ] `leitstand.propagate` calls `authorizeDeployment(gate: "propagate-alt")` with `durableSyncVerified: true` via R2 adapter (evidence: unit test + R2 adapter test in `packages/werkstatt/src/certification/storage/tests/r2-adapter.test.ts`)
- [ ] `leitstand.promote` calls `authorizeDeployment(gate: "promote-main")` with `requiresMainVerification: true` via `verifyMainPromotion()` (evidence: unit test in `packages/werkstatt/src/leitstand/tests/leitstand-promote.test.ts`)
- [ ] Minimal Astro certification profile registered and validated via `validateCertificationProfileV1` (evidence: `packages/werkstatt/src/certification/profile/astro-profile.ts` + validation test in `packages/werkstatt/src/certification/profile/tests/astro-profile.test.ts`)
- [ ] `CERT-TRANSITION-01` block removed from all 8 commands; `buildCertificationTransitionBlock` no longer imported in `leitstand-commands.ts` and `release-commands.ts` (evidence: `grep -r "buildCertificationTransitionBlock" packages/werkstatt/src/leitstand/ packages/werkstatt/src/release/` returns zero matches + test)
- [ ] `PIPELINE_STATE_ORDER`, `detectChannelFromState`, `autoStepReleaseState`, `determineNextStep`, `releaseStateIndex` deleted from `leitstand-commands.ts` (evidence: `grep -r "PIPELINE_STATE_ORDER\|detectChannelFromState\|autoStepReleaseState\|determineNextStep" packages/werkstatt/src/leitstand/leitstand-commands.ts` returns zero matches)
- [ ] `AGENTS.md` (root) updated to reflect unblocked deployment commands — remove "currently blocked with CERT-TRANSITION-01" from CERT-007 section
- [ ] `packages/werkstatt/AGENTS.md` updated — remove "No R2 adapter" from CERT-003 section
- [ ] `docs/architecture-dna.md` DNA-49 text updated — remove "currently blocked with CERT-TRANSITION-01 until CERT-007 reconnects them"
- [ ] `docs/architecture-dna.md` DNA-73 text updated — remove "All site deployment commands are currently blocked with CERT-TRANSITION-01 until CERT-007"
- [ ] `docs/verification-plan.xml` and `docs/development-plan.xml` synchronized with deployment command unblocking
- [ ] `rfc.validate` passes on this file before merging

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT restore legacy release state labels (`published`, `dev-deployed`, `alt-deployed`, `promoted`, `main-deployed`, `rolled-back`). `LegacyReleaseError` remains enforced.
- Agents MUST NOT bypass `authorizeDeployment()`. Every deployment command must call it as a gate before executing deploy logic. No `--force`, `--skip`, `--waiver`, or `--grace` flags are permitted for any gate (all `allows*` fields are `false` in `DEPLOYMENT_GATE_REQUIREMENTS`).
- Agents MUST NOT copy old Leitstand code from git history. The old code mutated release states and did not use `authorizeDeployment()`. Rewrite through the certification authority.
- Agents MUST NOT remove `buildCertificationTransitionBlock` from `transition-block.ts` itself — only remove its imports from `leitstand-commands.ts` and `release-commands.ts`. The type `isCertificationTransitionBlock` may still be used by tests.
- Agents MUST register the Astro certification profile before or in the same commit as Step 1. Without a profile, `authorizeDeployment()` fails at `CERT-DEPLOY-07`.
- Agents MUST implement the R2 durable storage adapter before or in the same commit as Step 2. Without it, `leitstand.propagate` fails at `CERT-DEPLOY-09`.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `rfc.supersede.propose --id RFC-0865 --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
