---
id: RFC-0829
title: "Add test evidence gates to deployment pipeline"
status: draft
kind: architecture
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-08-13
updatedAt: 2026-08-13
enhancedAt: 2026-08-13
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - DNA-66
  - RFC-0608
  - RFC-0628
  - RFC-0806
  - RFC-0823
  - RFC-0824
  - RFC-0825
  - RFC-0826
  - RFC-0827
  - RFC-0828
satisfies:
  - DNA-66
versionBump: patch
commands:
  proposed:
    - test.evidence.verify
    - test.evidence.list
  added:
    - test.evidence.verify
    - test.evidence.list
  changed:
    - leitstand.propagate
    - leitstand.promote
    - leitstand.service.promote
  removed: []
appsImpacted: []
packagesImpacted:
  - "@warpgogol/werkstatt"
  - "@warpgogol/werkstatt-site"
successSignals:
  - "test.evidence.verify command registered"
  - "leitstand.propagate verifies L4+L5 evidence before deploying to alt"
  - "leitstand.promote verifies L4+L5 evidence before deploying to main"
  - "leitstand.service.promote verifies L2+L5 evidence before promoting to prod"
  - "Test evidence stored in deployment state and queryable"
nonGoals:
  - "Does not define test levels — those are defined by RFC-0823 and downstream RFCs"
  - "Does not implement test runners — those are implemented by RFC-0824–0828"
  - "Does not block dev-deploy on test failures — dev-deploy is the test environment"
batch: testing-architecture
dependsOn:
  - RFC-0823
  - RFC-0824
  - RFC-0825
  - RFC-0826
  - RFC-0827
  - RFC-0828
---

# RFC-0829: Add test evidence gates to deployment pipeline

## Context

The deployment pipeline has three stages for sites (dev-deploy → propagate → promote) and two stages for services (dev-deploy → promote). Currently:

- **`leitstand.dev-deploy`** (sites): Runs Axiom checks. RFC-0825 adds smoke tests. RFC-0828 adds E2E tests. These run as post-deploy verification but their results are not persisted as structured evidence.
- **`leitstand.propagate`** (sites): Verifies Axiom evidence from dev-deploy (commitSha + missionId match). Does NOT verify smoke or E2E evidence.
- **`leitstand.promote`** (sites): Verifies alt-deployed state. Does NOT verify any test evidence.
- **`leitstand.service.dev-deploy`** (services): Runs health check. RFC-0825 adds smoke tests. RFC-0826 adds integration tests. Results not persisted as structured evidence.
- **`leitstand.service.promote`** (services): Runs health check. Does NOT verify integration or smoke evidence from dev-deploy.

The gap: a service or site can be promoted to production without any evidence that tests passed on the dev channel. The operator is the only gate.

## Problem

DNA-66 requires that deployment pipeline commands verify test evidence from prior pipeline stages and block promotion when evidence is missing or failed. Currently, only Axiom evidence is verified (for `leitstand.propagate`). Smoke, integration, E2E, and contract test results are not verified at any stage.

This means:

- A site with failing E2E tests can be propagated to alt and promoted to main.
- A service with failing integration tests can be promoted to production.
- Test evidence from dev-deploy is ephemeral (logged but not persisted).

## Decision

The workshop adds:

1. **New command `test.evidence.verify`** — verifies that test evidence exists for a given target (site or service) and level, and that all tests passed.
2. **New command `test.evidence.list`** — lists all test evidence for a target.
3. **Test evidence storage** — test results are persisted as JSON files in the deployment state directory.
4. **Pipeline gates** — `leitstand.propagate`, `leitstand.promote`, and `leitstand.service.promote` call `test.evidence.verify` before deploying and block on failure.

## Architectural fit

- **DNA-66 (testing pyramid):** This RFC implements the pipeline gate that connects all test levels to the deployment pipeline.
- **RFC-0608 (leitstand.promote):** Already verifies build-identity. This RFC adds test evidence verification as an additional gate.
- **RFC-0628 (leitstand.propagate):** Already verifies Axiom evidence (commitSha + missionId). This RFC extends the gate to include L4+L5 evidence.
- **RFC-0806 (service dev channel):** `leitstand.service.promote` already verifies health. This RFC adds L2+L5 evidence verification.
- **RFC-0825 (smoke testing):** Smoke test results are stored as evidence and verified by this RFC.
- **RFC-0826 (integration testing):** Integration test results are stored as evidence and verified by this RFC.
- **RFC-0828 (E2E testing):** E2E test results are stored as evidence and verified by this RFC.

## Design

### CLI surface

```sh
pnpm exec werkstatt run test.evidence.verify --target warpgogol-com --levels L4,L5 --commit-sha <sha>
pnpm exec werkstatt run test.evidence.verify --service lagebild-sync --levels L1,L2,L5 --commit-sha <sha>
pnpm exec werkstatt run test.evidence.list --target warpgogol-com --json
pnpm exec werkstatt run test.evidence.list --service lagebild-sync --json
```

### Test evidence storage

Test evidence is stored as JSON files in the deployment state directory:

```
# Sites
releases/<release-id>/.test-evidence/
  L4.json
  L5.json

# Services
services/<service-id>/.test-evidence/
  L1.json
  L2.json
  L5.json
```

Evidence file names use the level identifier only (`L4.json`, `L5.json`) — matching the `recordTestEvidence` code pattern (`${evidence.level}.json`).

Each evidence file has the structure defined in RFC-0823:

```json
{
  "testRunId": "run-2026-08-13T10:30:00Z",
  "level": "L4",
  "targetId": "warpgogol-com",
  "commitSha": "abc123",
  "passed": true,
  "durationMs": 120000,
  "timestamp": "2026-08-13T10:32:00Z",
  "failures": []
}
```

### TypeScript contracts

```ts
interface TestEvidenceVerifyInput {
  target?: string;       — site id
  service?: string;      — service id
  levels: string[];      — e.g. ["L4", "L5"]
  commitSha: string;     — evidence must match this commit
}

interface TestEvidenceVerifyResult {
  command: "test.evidence.verify";
  status: "pass" | "fail";
  target: string;
  levels: {
    level: string;
    found: boolean;
    passed: boolean;
    commitShaMatch: boolean;
    timestamp: string | null;
    failures?: TestFailure[];
  }[];
  summary: string;
}

interface TestEvidenceListInput {
  target?: string;
  service?: string;
}

interface TestEvidenceListResult {
  command: "test.evidence.list";
  target: string;
  evidence: {
    level: string;
    passed: boolean;
    commitSha: string;
    timestamp: string;
    testRunId: string;
  }[];
}
```

### Pipeline gate integration

#### `leitstand.propagate` (sites)

Before deploying to alt channel, verify:

```ts
const evidenceResult = await executeKernelCommand({
  workspaceRoot,
  commandName: "test.evidence.verify",
  argv: ["--target", siteId, "--levels", "L4,L5", "--commit-sha", commitSha],
});

if (evidenceResult.exitCode !== 0) {
  return failed({
    error: "TEST-EVIDENCE-GATE-01",
    message: `Cannot propagate: test evidence missing or failed for commit ${commitSha}. Run leitstand.dev-deploy first.`,
  });
}
```

Gate: L4 (E2E) + L5 (smoke) evidence must exist and pass for the same commitSha.

#### `leitstand.promote` (sites)

Before deploying to main channel, verify:

```ts
const evidenceResult = await executeKernelCommand({
  workspaceRoot,
  commandName: "test.evidence.verify",
  argv: ["--target", siteId, "--levels", "L4,L5", "--commit-sha", commitSha],
});
```

Gate: L4 + L5 evidence from the alt-deployed release's commitSha.

#### `leitstand.service.promote` (services)

Before promoting to production, verify:

```ts
const evidenceResult = await executeKernelCommand({
  workspaceRoot,
  commandName: "test.evidence.verify",
  argv: ["--service", serviceId, "--levels", "L1,L2,L5", "--commit-sha", commitSha],
});
```

Gate: L1 (unit) + L2 (integration) + L5 (smoke) evidence must exist and pass for the same commitSha.

**commitSha resolution for services:** Services do not have release manifests. The commitSha is obtained via `git rev-parse HEAD` in the workspace root at deploy time. `leitstand.service.promote` captures this commitSha and passes it to `test.evidence.verify`. Evidence must be for the same commit.

**L1 evidence flow from CI:** L1 unit tests run in CI via `turbo run test` → `service.test.run` (RFC-0824). After running, `service.test.run` records evidence to `services/<service-id>/.test-evidence/L1.json`. The evidence file persists in the workspace. When `leitstand.service.promote` runs later on the same workspace, it verifies the evidence against the current commitSha.

### L3 (contract) evidence exclusion

L3 contract tests (RFC-0827) run in `PACKAGES_CHECK_PIPELINE` (CI), not in the deployment pipeline. They validate API schemas at build time, not at deploy time. Therefore L3 evidence is not verified by deployment gates — it is a CI gate, not a deployment gate. This is an intentional design decision, not an omission.

### Evidence recording

Test commands (added by RFC-0824–0828) record evidence after running. Evidence files are written atomically (write to temp file, then rename) to prevent corruption from concurrent writes or crashes mid-write:

```ts
// In service.smoke.run, service.integration.run, site.e2e.run, etc.
async function recordTestEvidence(
  workspaceRoot: string,
  target: string,
  evidence: TestEvidence,
): Promise<void> {
  const evidenceDir = resolveEvidenceDir(workspaceRoot, target);
  const evidenceFile = join(evidenceDir, `${evidence.level}.json`);
  await atomicWriteFile(evidenceFile, JSON.stringify(evidence, null, 2) + "\n");
}
```

### Gate failure modes

| Code | Description |
| --- | --- |
| TEST-EVIDENCE-GATE-01 | Evidence file not found for the requested level |
| TEST-EVIDENCE-GATE-02 | Evidence exists but tests failed (`passed: false`) |
| TEST-EVIDENCE-GATE-03 | Evidence exists but commitSha doesn't match |
| TEST-EVIDENCE-GATE-04 | Evidence exists but is stale (timestamp > 24h old). Stale evidence is a warning, not a fatal error — the commitSha match (GATE-03) is the primary freshness guarantee. Staleness warns that the evidence may not reflect the current state of the dev channel. |

### File system responsibilities

| Path | Role |
| --- | --- |
| `releases/<release-id>/.test-evidence/*.json` | Site test evidence files |
| `services/<service-id>/.test-evidence/*.json` | Service test evidence files |
| `packages/werkstatt-site/src/testing/test-evidence.ts` | Evidence verification and recording logic (plugin, not engine — DNA-64) |
| `packages/werkstatt/src/leitstand/leitstand-commands.ts` | `leitstand.propagate` gate |
| `packages/werkstatt/src/leitstand/leitstand-commands.ts` | `leitstand.promote` gate |
| `packages/werkstatt/src/leitstand/service-promote.ts` | `leitstand.service.promote` gate |
| `services/registry.yaml` | Unchanged — evidence timestamps live in evidence files, not the registry |

### Output format

```json
{
  "command": "test.evidence.verify",
  "status": "pass",
  "target": "warpgogol-com",
  "levels": [
    {
      "level": "L4",
      "found": true,
      "passed": true,
      "commitShaMatch": true,
      "timestamp": "2026-08-13T10:32:00Z"
    },
    {
      "level": "L5",
      "found": true,
      "passed": true,
      "commitShaMatch": true,
      "timestamp": "2026-08-13T10:30:00Z"
    }
  ],
  "summary": "All required test evidence verified for commit abc123"
}
```

### Failure output

```json
{
  "command": "test.evidence.verify",
  "status": "fail",
  "target": "warpgogol-com",
  "levels": [
    {
      "level": "L4",
      "found": false,
      "passed": false,
      "commitShaMatch": false,
      "timestamp": null
    },
    {
      "level": "L5",
      "found": true,
      "passed": true,
      "commitShaMatch": true,
      "timestamp": "2026-08-13T10:30:00Z"
    }
  ],
  "summary": "Missing L4 evidence for commit abc123. Run leitstand.dev-deploy first."
}
```

## Rollout

- **Default behavior:** Test evidence gates are active immediately after all downstream RFCs are implemented.
- **Grace period:** For 2 weeks after implementation, evidence gates emit warnings (not errors) to allow existing deployment workflows to adapt. After the grace period, gates are fatal. The grace period is implemented via a date constant in `test-evidence.ts` (e.g. `GRACE_PERIOD_END = '2026-09-10'`). Before this date, `test.evidence.verify` returns exit code 0 with warning messages. After this date, it returns exit code 1 on failures. The grace period end date is recorded in `AGENTS.md` and `services/AGENTS.md` when this RFC is implemented.
- **Existing releases:** Releases deployed before this RFC do not have test evidence. They are grandfathered — the gate treats missing evidence directories as a warning (not an error) during the grace period. After the grace period, missing evidence is fatal for new deployments. A release is considered "existing" if its `.test-evidence/` directory does not exist.
- **New services/sites:** A new service or site that has never been tested will have no `.test-evidence/` directory. During the grace period, this is a warning. After the grace period, `leitstand.service.promote` and `leitstand.propagate` will block until at least one round of tests has been run on the dev channel.

## Alternatives considered

- **Store evidence in a database:** Rejected. JSON files in the deployment state directory are simpler, git-trackable (for releases), and don't require infrastructure.
- **Store evidence in the bordbuch:** Rejected. Bordbuch is for mission history, not test results. Test evidence is deployment-specific, not mission-specific.
- **Only verify evidence for promote (not propagate):** Rejected. Propagate is the last gate before the operator manually verifies on alt. If evidence is missing at propagate, the operator wastes time on a broken release.
- **Make all gates fatal from day one:** Rejected. The grace period allows existing workflows to adapt without breaking ongoing deployments.

## Risks

- **Evidence staleness:** Evidence from a dev-deploy may be stale if the code changed after dev-deploy but before propagate. Mitigated by commitSha matching — evidence must be for the same commit being propagated.
- **Evidence directory bloat:** Evidence files accumulate over time. Mitigated by `.test-evidence/` being in the release directory (archived with the release) and by a cleanup command (future RFC).
- **False negatives:** A passing test that is not recorded as evidence blocks deployment. Mitigated by the grace period and by ensuring all test commands reliably record evidence.
- **Circular dependency:** `test.evidence.verify` depends on test commands having run, and pipeline gates depend on `test.evidence.verify`. This is intentional — the pipeline is: dev-deploy (run tests, record evidence) → propagate (verify evidence) → promote (verify evidence).

## Acceptance criteria

- [ ] `test.evidence.verify` command registered and functional
- [ ] `test.evidence.list` command registered and functional
- [ ] Test evidence recording integrated into `service.smoke.run`, `service.integration.run`, `site.smoke.run`, `site.e2e.run`
- [ ] `leitstand.propagate` verifies L4+L5 evidence before deploying to alt
- [ ] `leitstand.promote` verifies L4+L5 evidence before deploying to main
- [ ] `leitstand.service.promote` verifies L1+L2+L5 evidence before promoting to prod
- [ ] Gate failures produce clear error messages with remediation instructions
- [ ] `services/registry.yaml` unchanged (evidence timestamps live in evidence files)
- [ ] Grace period documented in `AGENTS.md` and `services/AGENTS.md`
- [ ] `rfc.validate` passes on this file

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- This RFC depends on ALL other testing RFCs (0823–0828). It must be implemented last.
- Implementation should start with the evidence storage format, then the `test.evidence.verify` and `test.evidence.list` commands, then integrate evidence recording into existing test commands, then add gates to leitstand commands.
- The grace period start date should be recorded in `AGENTS.md` when this RFC is implemented.
- Evidence files are NOT committed to git for services (they are in `services/<id>/.test-evidence/` which is gitignored). For sites, evidence is in the release directory which IS committed (it's part of the release artifact).
