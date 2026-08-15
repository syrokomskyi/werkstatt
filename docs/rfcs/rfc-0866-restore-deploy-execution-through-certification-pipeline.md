---
id: RFC-0866
title: "Restore deploy execution through certification pipeline"
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
  - DNA-49
  - DNA-73
  - DNA-59
  - RFC-0865
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-49
  - DNA-73
  - DNA-59
# RFC-0396: Traceability to a vendored spec node: "<spec-id>/<node-id>", e.g. "pbp/RFC-PBP-020".
# Set by spec.materialize; leave commented for non-spec RFCs.
# specRef:
# RFC-0478: Platform versioning enforcement. Declares the SemVer delta this RFC
# produces when implemented. Required for post-cutoff implemented RFCs (V-29).
# Values: minor (Breaks-B, requires migrator), patch (safe), none (prose-only),
# major (architectural, manually reserved). Default: patch.
versionBump: patch
commands:
  proposed:
    - leitstand.certify
  added: []
  changed:
    - leitstand.dev-deploy
    - leitstand.propagate
    - leitstand.promote
    - leitstand.rollback
    - leitstand.status
    - leitstand.health
    - leitstand.pipeline.check
  removed: []
appsImpacted: []
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - "@warpgogol/werkstatt"
successSignals:
  - "leitstand.dev-deploy builds, deploys via wrangler, verifies freshness, and writes bordbuch events"
  - "leitstand.propagate deploys to alt with durable sync verification and Axiom evidence gate"
  - "leitstand.promote deploys to main with main verification and alt health check"
  - "leitstand.certify produces GateDecisionV1 JSON from producer execution and evaluation"
  - "leitstand.status reads real deployment state from system-state.yaml and effect records"
  - "leitstand.health probes the live deployment via adapter.health()"
nonGoals:
  - "Do not add new deployment adapters — only cloudflare-workers is supported"
  - "Do not change the certification authority (CERT-007) or its rule set"
  - "Do not change the GateDecisionV1 or MainVerificationDecisionV1 schemas"
  - "Do not introduce new certification profiles beyond the existing Astro profile"
  - "Do not restore the old pre-certification command surface — all deploys go through authorizeDeployment()"
  - "Do not cover service deploy commands (leitstand.service.*) — those are a separate pipeline (RFC-0806)"
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

# RFC-0866: Restore deploy execution through certification pipeline

## Context

RFC-0865 connected the CERT-007 deployment authority to the Leitstand command surface. All 8 command handlers (`dev-deploy`, `propagate`, `promote`, `status`, `health`, `pipeline.check`, `rollback`) now call `authorizeDeployment()` and write `DeploymentEffectRecordV1` entries. However, RFC-0865's implementation only covers the **authorization skeleton** — the code that runs _after_ authorization returns `ok: true` is missing. No build, no wrangler deploy, no cache purge, no freshness verification, no health check, no bordbuch event, no system-state update.

Additionally, the certification orchestration primitives (`planProducers`, `executeProducers`, `evaluateCertificationDecision`) exist in `packages/werkstatt/src/certification/` but are not wired into any command. The leitstand commands require `--gate-decision <path>` as an external JSON file, but no command produces these files. An operator must manually craft `GateDecisionV1` JSON, which defeats the purpose of the certification pipeline.

The old pre-certification Leitstand code (2123 lines, deleted in commit `30bc3c6f`) contained extensive operational features accumulated across ~15 RFCs (RFC-0608 through RFC-0656): build-skip cache, build-identity.json, freshness verification, CDN cache purge, mission.check resilience, Axiom evidence gates, evidence sync to R2, bordbuch events, system-state updates, smoke/E2E tests. These features must be restored — not copied, but reimplemented within the certification-gated flow.

## Problem

Three critical gaps prevent real site publication:

1. **No gate decision production.** `runLeitstandDevDeploy` at `packages/werkstatt/src/leitstand/leitstand-commands.ts:729` throws if `--gate-decision` is not provided. No command or function produces `GateDecisionV1` JSON from producer execution and evaluation. The orchestration primitives (`planProducers`, `executeProducers`, `evaluateCertificationDecision`) exist but are unconnected.

2. **No deploy execution after authorization.** `runLeitstandDevDeploy` at `packages/werkstatt/src/leitstand/leitstand-commands.ts:793-806` returns `deploymentUrl: ""` with `state: "succeeded"` immediately after `authorizeAndDeploy()` returns `ok: true`. Same for `runLeitstandPropagate` (line 908-927) and `runLeitstandPromote` (line 1033-1048). No build, no wrangler deploy, no cache purge, no freshness, no health, no bordbuch, no system-state update.

3. **Pipeline state hardcoded.** `runLeitstandPipelineCheck` at `packages/werkstatt/src/leitstand/leitstand-commands.ts:1290-1328` hardcodes `releaseState: "ready"` and all deploy steps as `"pending"` with `detail: "awaiting gate decision"`. It does not read `DeploymentEffectRecordV1` entries from `systems-cache/{id}/deployment-operations/` to determine real pipeline state. Additionally, `leitstand.propagate` and `leitstand.promote` module registrations in `leitstand.module.ts` (lines 71-125) do not declare `--gate-decision` and `--main-verification-decision` as flags, even though the handlers require them (throwing if absent).

DNA-49 (Fleet propagation) requires working Leitstand commands. DNA-73 (Sequential deployment pipeline) requires dev → alt → main sequencing with real deploys. DNA-59 (Evidence preservation) requires evidence sync to R2.

## Decision

The Werkstatt gains a `leitstand.certify` command that produces `GateDecisionV1` JSON from certification orchestration, and the existing 7 Leitstand command handlers are restored to full deploy execution — build, wrangler deploy, cache purge, freshness, health, bordbuch, system-state — gated by `authorizeDeployment()` as connected by RFC-0865.

## Architectural fit

- **DNA-49 (Fleet propagation):** Restores the Leitstand deployment pipeline that DNA-49 mandates. `leitstand.dev-deploy`, `leitstand.propagate`, and `leitstand.promote` execute real wrangler deploys through the `DeploymentAdapter` interface.
- **DNA-73 (Sequential deployment pipeline):** Enforces dev → alt → main sequencing. `leitstand.propagate` requires a successful dev deploy (effect record with `state: "deployed"`). `leitstand.promote` requires a successful alt deploy plus `MainVerificationDecisionV1`.
- **DNA-59 (Evidence preservation):** Restores evidence sync to R2 after `mission.check` runs, preserving Axiom evidence as durable history.
- **RFC-0865 compatibility:** All commands still call `authorizeDeployment()` before executing deploy logic. This RFC adds the _post-authorization_ execution path and the _pre-authorization_ gate decision production path — it does not change the authorization interface.
- **Certification orchestration:** Uses existing `planProducers`, `executeProducers`, `evaluateCertificationDecision` from `packages/werkstatt/src/certification/orchestration/` — no new orchestration primitives.

## Design

### CLI surface

**New command — gate decision production (conventional path):**

```sh
pnpm exec werkstatt run leitstand.certify \
  --site warpgogol-com \
  --gate dev \
  --candidate-id warpgogol-com \
  --artifact-hash sha256:abc123... \
  --release warpgogol-com-r000008
```

Produces a `GateDecisionV1` JSON file at the conventional path `systems-cache/{systemId}/gate-decisions/{releaseId}-{gate}.json` by:

1. Loading the `astroCertificationProfile`
2. Registering the `astro-mission-check` producer handler (wraps `mission.check`) — skipped when no open mission exists (status: `incomplete`)
3. Planning producer execution via `planProducers`
4. Executing producers via `executeProducers`
5. Evaluating evidence via `evaluateCertificationDecision`
6. Writing `GateDecisionV1` to `systems-cache/{systemId}/gate-decisions/{releaseId}-{gate}.json` (overwrites on retry — idempotent). This path is outside the release artifact store (DNA-52 immutability preserved).

Deploy commands (`leitstand.dev-deploy`, `leitstand.propagate`, `leitstand.promote`) look up the gate decision at the conventional path by default. `--gate-decision` remains as an override flag for non-standard paths.

**Restored commands — deploy execution after authorization:**

```sh
# Dev: build + wrangler deploy + freshness + mission.check + evidence sync
pnpm exec werkstatt run leitstand.dev-deploy \
  --site warpgogol-com \
  --release warpgogol-com-r000008

# Alt: durable sync + wrangler deploy + cache purge + Axiom evidence gate
pnpm exec werkstatt run leitstand.propagate \
  --site warpgogol-com \
  --release warpgogol-com-r000008

# Main: main verification + durable sync + wrangler deploy + cache purge + alt health
pnpm exec werkstatt run leitstand.promote \
  --site warpgogol-com \
  --release warpgogol-com-r000008 \
  --main-verification-decision /tmp/main-verification.json
```

Deploy commands resolve the gate decision at `systems-cache/{systemId}/gate-decisions/{releaseId}-{gate}.json` by default. `--gate-decision <path>` overrides the conventional path for non-standard workflows.

### TypeScript contracts

**Gate decision production:**

```ts
interface CertifyInput {
  systemId: string;
  gate: "dev" | "alt" | "main";
  candidateId: string;
  artifactHash: Sha256Digest;
  releaseId: string;
}

interface CertifyResult {
  command: "leitstand.certify";
  systemId: string;
  gate: string;
  decisionId: string;
  status: "pass" | "fail" | "stale" | "incomplete";
  outputPath: string; // systems-cache/{systemId}/gate-decisions/{releaseId}-{gate}.json
  producerCount: number;
  evidenceCount: number;
}
```

**Deploy execution phases (shared across all 3 channels):**

```ts
interface DeployExecutionContext {
  systemId: string;
  releaseId: string | undefined;
  candidateId: string;
  artifactHash: Sha256Digest;
  authResult: AuthorizeOutcome;
  workspaceRoot: string;
  systemConfig: DeploymentStaticConfig;
  adapter: DeploymentAdapter;
  operationId: string;
}

interface DeployExecutionResult {
  deploymentUrl: string;
  buildSkipped: boolean;
  buildIdentity: { releaseId: string; written: boolean; path: string };
  freshness: FreshnessResult;
  purgeResult?: PurgeResult;
  healthState: "healthy" | "unhealthy" | "unknown";
  effectRecord: DeploymentEffectRecordV1;
  bordbuchCommitted: boolean;
  systemStateUpdated: boolean;
}
```

**Phase pipeline (runs after `authorizeAndDeploy()` returns `ok: true`):**

```ts
async function executeDeployPhases(
  ctx: DeployExecutionContext,
  channel: "dev" | "alt" | "main",
): Promise<DeployExecutionResult>;
```

Phases (in order, parameterized by `channel: "dev" | "alt" | "main"`):

1. **Build** — `pnpm build` with build-skip cache (RFC-0653). Writes preliminary `build-identity.json` to `public/.well-known/` before build (RFC-0634).
2. **Wrangler deploy** — `adapter.propagate()` via `createCloudflareWorkersAdapter()`. Extracts deployment URL from wrangler stdout.
3. **Build-identity finalization** — Computes `distTreeHash` via `fingerprintTree`, writes final `build-identity.json` to `dist/client/.well-known/` (RFC-0634).
4. **CDN cache purge** — `runPurgeStep()` using `CLOUDFLARE_ZONE_ID` + `CLOUDFLARE_API_TOKEN` from env (RFC-0624). Fatal for cloudflare-workers adapter if purge fails (RFC-0649). Skipped for dev channel when deployment URL is `*.workers.dev` (no CDN in front of dev).
5. **Freshness verification** — `verifyFreshness()` fetches `build-identity.json` from CDN URL, compares `distTreeHash` (RFC-0649). Retries 5× with exponential backoff. Failure stops pipeline.
6. **Health check** — `adapter.health()` probes live deployment routes (RFC-0379). Retries 3× with backoff (RFC-0747).
7. **mission.check** (channel === "dev" only) — `runMissionCheckWithResilience()` with timeout + retry (RFC-0668). Passes `--commit-sha` and `--base-url`. Skipped when no open mission exists (release-only deploy, RFC-0700).
8. **Axiom evidence gate** (channel === "alt" only) — Reads `evidence-metadata.json` + `study-run.json`, verifies `commitSha` + `missionId` match (RFC-0628/0629).
9. **Main verification** (channel === "main" only) — `verifyMainPromotion()` via `--main-verification-decision` path (RFC-0865).
10. **Evidence sync** — Best-effort `evidence.sync` to R2 (RFC-0652). `--skip-evidence-sync` flag bypasses.
11. **Bordbuch event** — `appendAndCommitBordbuch()` records deploy event in `systems-cache/{id}/bordbuch/events.ndjson`.
12. **System-state update** — `writeSystemStateSmart()` updates `lastPropagated` for the channel.
13. **Effect record update** — Updates the `DeploymentEffectRecordV1` from `authorized` to `deployed` with final `deploymentUrl`, `freshness`, `healthState`.

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/werkstatt/src/leitstand/leitstand-commands.ts` | Restore deploy execution in all 7 handlers |
| `packages/werkstatt/src/leitstand/certify.ts` | **New file** — `leitstand.certify` command handler |
| `packages/werkstatt/src/leitstand/deploy-execution.ts` | **New file** — shared `executeDeployPhases()` function |
| `packages/werkstatt/src/leitstand/deploy-helpers.ts` | No changes — authorization helpers stay as-is |
| `packages/werkstatt/src/leitstand/cache-purge.ts` | No changes — existing purge helpers reused |
| `packages/werkstatt/src/leitstand/adapters/cloudflare-workers.ts` | No changes — existing adapter reused |
| `packages/werkstatt/src/certification/orchestration/orchestrator.ts` | No changes — existing primitives reused |
| `packages/werkstatt/src/certification/profile/astro-profile.ts` | No changes — existing profile reused |
| `packages/werkstatt/src/leitstand/leitstand.module.ts` | Register `leitstand.certify` command; add `--gate-decision` flag declarations to `leitstand.propagate` and `leitstand.promote` registrations |

### Output format

**`leitstand.certify --json`:**

```json
{
  "command": "leitstand.certify",
  "systemId": "warpgogol-com",
  "gate": "dev",
  "decisionId": "dec-2026-08-15-...",
  "status": "pass",
  "outputPath": "systems-cache/warpgogol-com/gate-decisions/warpgogol-com-r000008-dev.json",
  "producerCount": 1,
  "evidenceCount": 1
}
```

**`leitstand.dev-deploy --json` (restored):**

```json
{
  "command": "leitstand.dev-deploy",
  "systemId": "warpgogol-com",
  "missionId": "warpgogol-com-m000042",
  "commitSha": "abc1234",
  "buildState": "succeeded",
  "buildSkipped": false,
  "deployState": "succeeded",
  "deploymentUrl": "https://warpgogol-com-dev.workers.dev",
  "buildIdentity": {
    "releaseId": "warpgogol-com-r000008",
    "written": true,
    "path": "dist/client/.well-known/build-identity.json"
  },
  "axiom": {
    "status": "pass",
    "errors": 0,
    "warnings": 2,
    "exitCode": 0,
    "freshness": {
      "verified": true,
      "cdnDistTreeHash": "sha256:...",
      "localDistTreeHash": "sha256:...",
      "attempts": 1
    }
  },
  "evidenceSynced": true,
  "evidenceSyncError": null
}
```

### Channel-specific phase differences

| Phase | Dev | Alt | Main |
| --- | --- | --- | --- |
| 4. CDN cache purge | Skipped (`*.workers.dev` has no CDN) | Fatal if purge fails | Fatal if purge fails |
| 5. Freshness | Skipped (no CDN) | Required (5 retries) | Required (5 retries) |
| 7. mission.check | Required (with resilience) | — | — |
| 8. Axiom evidence gate | — | Required | — |
| 9. Main verification | — | — | Required |
| 10. Evidence sync | Best-effort | Best-effort | Best-effort |

### Partial failure recovery

When a phase fails after wrangler deploy (phase 2) has succeeded, the deployment is live but the pipeline is incomplete. The effect record is updated to `failed` with the failing phase and `deploymentUrl` populated. The operator is responsible for manual recovery:

- **Health check failure (phase 6):** Deployment is live but unhealthy. Operator investigates the deployment URL, fixes the issue, and re-runs the deploy command (build-skip cache may skip rebuild). Auto-rollback is NOT attempted — health failures may be transient (CDN propagation delay) and auto-rollback would discard a potentially valid deployment.
- **mission.check failure (phase 7, dev only):** Deployment is live but content violations detected. Operator fixes content, commits, and re-runs dev-deploy. The mission.check producer in the next `leitstand.certify` run will re-evaluate.
- **Axiom evidence gate failure (phase 8, alt only):** Deployment is live but evidence mismatch. Operator verifies `commitSha` and `missionId` in evidence files, fixes if needed, and re-runs propagate.
- **Freshness failure (phase 5):** Deployment is live but CDN serves stale content. Operator waits for CDN propagation and re-runs freshness check (or re-runs the deploy command).

The effect record `state` field tracks: `authorized` → `deploying` → `deployed` | `failed` | `failed-stale`. The `failingPhase` field in the effect record metadata records which phase failed for debugging.

### Failure modes

- **Authorization denied:** `authorizeDeployment()` returns `ok: false` → command returns `exitCode: 1` with diagnostic. No deploy phases run.
- **Build failure:** `pnpm build` exits non-zero → `buildState: "failed"`, `deployState: "failed"`, `exitCode: 1`. Effect record updated to `failed`.
- **Wrangler deploy failure:** `adapter.propagate()` returns non-zero exit → `deployState: "failed"`, `exitCode: 1`. Transient errors retried via `runWranglerDeployWithRetry()` (RFC-0623).
- **Freshness failure:** `verifyFreshness()` exhausts 5 retries → `deployState: "failed-stale"`, `exitCode: 1`. Pipeline stops before Axiom gate (RFC-0649).
- **Cache purge failure:** Fatal for cloudflare-workers adapter (RFC-0649). `purgeResult.success === false` → `deployState: "failed"`, `exitCode: 1`.
- **mission.check failure:** Exit 1 (content violations) → `axiom.status: "fail"`, `exitCode: 1`. Exit 2+ (infrastructure) retried once (RFC-0668).
- **Axiom evidence gate failure** (propagate): `commitSha` or `missionId` mismatch → `state: "failed"`, `exitCode: 1`.
- **Main verification failure** (promote): `verifyMainPromotion()` returns `ok: false` → `state: "failed"`, `exitCode: 1`.
- **Evidence sync failure:** Non-fatal. `evidenceSynced: false`, `evidenceSyncError: "..."`. Command continues (RFC-0652).
- **Bordbuch commit failure:** Non-fatal. Logged as warning. Deploy still succeeds.
- **`leitstand.certify` producer failure:** `executeProducers` returns `ok: false` with `CERT-ORCHESTRATOR-04` → `status: "incomplete"`, `exitCode: 1`. No `GateDecisionV1` written.

## Rollout

### Step 1: `leitstand.certify` command

Add the `leitstand.certify` command to `leitstand.module.ts`. This command produces `GateDecisionV1` JSON and is a prerequisite for all deploy commands. It uses the existing `astroCertificationProfile` and `astro-mission-check` producer.

### Step 2: Restore `leitstand.dev-deploy`

After `authorizeAndDeploy()` returns `ok: true`, execute the 13-phase deploy pipeline (build, wrangler, build-identity, purge, freshness, health, mission.check, evidence sync, bordbuch, system-state, effect record). This restores the full dev deploy capability.

### Step 3: Restore `leitstand.propagate`

After `authorizeAndDeploy()` returns `ok: true` for `gate: "propagate-alt"`, execute the deploy pipeline with alt-specific phases: durable sync verification via `verifyDurableSync()`, Axiom evidence gate (commitSha + missionId match), adapter.propagate() to alt worker.

### Step 4: Restore `leitstand.promote`

After `authorizeMainPromotion()` returns `authorization.ok: true`, execute the deploy pipeline with main-specific phases: alt health check (verify alt is healthy before promoting), adapter.propagate() to main worker, main verification via `verifyMainPromotion()`.

### Step 5: Restore `leitstand.rollback`

After `evaluateRollbackRequest()` returns `rollbackAuthorized: true`, execute `adapter.rollback()` with the target release's dist. Update system-state, write bordbuch event, update effect record.

### Step 6: Restore read-only commands

- `leitstand.status`: Read `lastPropagated` from `system-state.yaml` for each channel. Fall back to effect records if system-state is empty.
- `leitstand.health`: Call `adapter.health()` with the channel's deployment URL.
- `leitstand.pipeline.check`: Read the latest effect record per channel to determine real pipeline state. Remove legacy `PIPELINE_STATE_ORDER` entries (`dev-deployed`, `alt-deployed`, `main-deployed`, `promoted`). Replace with `prepared` → `ready` → `dev-deployed` (effect record `deployed`) → `alt-deployed` (effect record `deployed`) → `main-deployed` (effect record `deployed`).

### Adoption

- All sites adopt automatically — no flag day. The `leitstand.certify` command is the new entry point for the pipeline.
- The `--gate-decision` flag on deploy commands remains required. Operators run `leitstand.certify` first, then pass the output path to the deploy command.
- No deprecation path needed — RFC-0865 already removed the old command surface. This RFC restores execution within the new surface.

## Alternatives considered

- **Fold into RFC-0865:** Rejected. RFC-0865 is already marked `implemented` and its scope is authorization connection. Deploy execution is a distinct concern with its own rollout steps.
- **Copy old 2123-line code:** Rejected. RFC-0865 explicitly states old code must be rewritten from scratch. The old code bypassed certification; the new code must gate on `authorizeDeployment()`.
- **Auto-produce gate decisions inside deploy commands:** Rejected. Separating `leitstand.certify` from deploy commands allows operators to inspect the gate decision before authorizing a deploy, and allows reusing the same gate decision for multiple deploys.
- **Add new deployment adapters:** Out of scope. Only `cloudflare-workers` is needed for current sites.

## Risks

- **Complexity:** 13-phase deploy pipeline is complex. Mitigated by extracting shared logic into `deploy-execution.ts` with clear phase boundaries.
- **R2 credentials:** Alt/main gates require `verifyDurableSync()` which needs R2 env vars. Without them, `durableSyncVerified = false` and `authorizeDeployment()` fails. Operators must configure R2 credentials before alt/main deploys work.
- **mission.check timeout:** Dev deploy runs `mission.check` which can take 5+ minutes. Mitigated by `runMissionCheckWithResilience()` with timeout + retry (RFC-0668).
- **Agent confusion:** Agents may try to run deploy commands without first running `leitstand.certify`. The `--gate-decision` required flag and error message guide them.

## Acceptance criteria

- [ ] `leitstand.certify` command registered in `leitstand.module.ts` and produces `GateDecisionV1` JSON
- [ ] `leitstand.certify` loads `astroCertificationProfile`, registers `astro-mission-check` producer, executes via `executeProducers`, evaluates via `evaluateCertificationDecision`
- [ ] `leitstand.dev-deploy` executes `pnpm build` with build-skip cache after authorization
- [ ] `leitstand.dev-deploy` writes preliminary + final `build-identity.json` (RFC-0634)
- [ ] `leitstand.dev-deploy` calls `adapter.propagate()` and extracts deployment URL
- [ ] `leitstand.dev-deploy` runs `runPurgeStep()` for CDN cache purge (RFC-0624)
- [ ] `leitstand.dev-deploy` runs `verifyFreshness()` with 5 retries (RFC-0649)
- [ ] `leitstand.dev-deploy` runs `runMissionCheckWithResilience()` (RFC-0668)
- [ ] `leitstand.dev-deploy` runs best-effort evidence sync to R2 (RFC-0652)
- [ ] `leitstand.dev-deploy` writes bordbuch event via `appendAndCommitBordbuch()`
- [ ] `leitstand.dev-deploy` updates `system-state.yaml` via `writeSystemStateSmart()`
- [ ] `leitstand.dev-deploy` updates effect record from `authorized` to `deployed`
- [ ] `leitstand.propagate` verifies durable sync via `verifyDurableSync()` before deploy
- [ ] `leitstand.propagate` runs Axiom evidence gate (commitSha + missionId match, RFC-0628)
- [ ] `leitstand.propagate` executes adapter deploy to alt channel
- [ ] `leitstand.promote` verifies alt health before promoting
- [ ] `leitstand.promote` calls `authorizeMainPromotion()` with `--main-verification-decision`
- [ ] `leitstand.promote` executes adapter deploy to main channel
- [ ] `leitstand.rollback` executes `adapter.rollback()` after `evaluateRollbackRequest()`
- [ ] `leitstand.status` reads `lastPropagated` from `system-state.yaml`
- [ ] `leitstand.health` calls `adapter.health()` with live deployment URL
- [ ] `leitstand.pipeline.check` reads real deployment state from `DeploymentEffectRecordV1` entries instead of hardcoding `releaseState: "ready"` and all steps as `"pending"`
- [ ] `leitstand.propagate` module registration declares `--gate-decision` as a flag
- [ ] `leitstand.promote` module registration declares `--gate-decision` and `--main-verification-decision` as flags
- [ ] `leitstand.certify` writes `GateDecisionV1` to conventional path `systems-cache/{systemId}/gate-decisions/{releaseId}-{gate}.json` (outside release artifact store, DNA-52 preserved)
- [ ] Deploy commands (`dev-deploy`, `propagate`, `promote`) resolve gate decision at `systems-cache/{systemId}/gate-decisions/{releaseId}-{gate}.json` by default, `--gate-decision` overrides
- [ ] `leitstand.certify` works without open mission (skips mission-check producer, status: `incomplete`)
- [ ] `leitstand.certify` reads dev deployment URL from effect records for `--base-url` (not user-supplied) to prevent spoofing
- [ ] Effect record includes `failingPhase` metadata when deploy pipeline fails mid-execution
- [ ] Dev channel skips CDN cache purge and freshness verification (no CDN in front of `*.workers.dev`)
- [ ] `docs/verification-plan.xml` and `docs/development-plan.xml` synchronized with restored deploy execution steps
- [ ] `deploy-execution.ts` extracted as shared phase pipeline
- [ ] `certify.ts` implemented as new command handler
- [ ] `AGENTS.md` updated with `leitstand.certify` command and deploy pipeline description
- [ ] `rfc.validate` passes on this file before merging

### URL verification in certify

`leitstand.certify` passes `--base-url` to `mission.check` via the `astro-mission-check` producer. The base URL MUST be the actual dev deployment URL from the latest dev effect record (not a user-supplied URL). This prevents spoofing: if an attacker poisons DNS or provides a wrong URL, the gate decision attests to the wrong deployment. The certify command reads the dev deployment URL from `systems-cache/{systemId}/deployment-operations/` effect records. If no dev effect record exists (first deploy), certify requires `--base-url` flag and logs a warning.

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
- The deploy execution phases MUST run only after `authorizeAndDeploy()` or `authorizeMainPromotion()` returns `ok: true`. Never bypass certification.
- The `leitstand.certify` command MUST use the existing `astroCertificationProfile` — do not create a new profile.
- The `leitstand.certify` command MUST use the existing `planProducers`, `executeProducers`, and `evaluateCertificationDecision` functions — do not reimplement orchestration.
- Reuse existing helper functions (`verifyFreshness`, `runPurgeStep`, `runMissionCheckWithResilience`, `earlyCloudflareTokenCheck`, `buildLastPropagatedEntry`) — do not reimplement them.
- The `DeploymentAdapter` interface and `createCloudflareWorkersAdapter()` MUST NOT be modified — they are reused as-is.
