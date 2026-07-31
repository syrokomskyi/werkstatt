---
id: RFC-0628
title: "Amend dev deployment channel: workpiece-based dev deploy with pre-release Axiom verification"
status: accepted
# kind options: architecture | contract | command | policy | deprecation
kind: architecture
# scope options: app | workspace
scope: workspace
owners:
  - architecture
# Set by the deciding human together with the status change (RFC-0335).
# Draft scaffolds must keep this empty; do not prefill a default identity.
# Format: human:<handle> (agent:<id> reserved — see RFC-0335).
# Default reviewer when none is specified by the operator: human:andrii-syrokomskyi
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-07-31
updatedAt: 2026-07-31
enhancedAt: 2026-07-31
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends:
  - RFC-0627
amendedBy: []
related:
  - DNA-48
  - DNA-49
  - RFC-0627
  - RFC-0608
  - RFC-0358
  - RFC-0379
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-48
  - DNA-49
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
    - leitstand.dev-deploy
  added:
    - leitstand.dev-deploy
  changed:
    - leitstand.propagate
    - leitstand.rollback
  removed:
    - leitstand.deploy
appsImpacted:
  - warpgogol-com
packagesImpacted:
  - "@warpgogol/site-kernel-handoff"
  - "@warpgogol/ontology"
successSignals:
  - "Operator can deploy to dev and get Axiom results in under 3 minutes"
  - "Single deployment cycle from workpiece to production with no duplicate validation"
nonGoals:
  - "Does not change leitstand.promote (alt → main)"
  - "Does not change the cloudflare-workers adapter"
  - "Does not change mission.check or Axiom evidence format"
  - "Does not add registry tracking or bordbuch entries for dev deploys"
# RFC-0268: OPTIONAL machine-checkable acceptance probes, executed on-demand
# via `pnpm exec site-kernel run rfc.acceptance.run --id <this-rfc-id>` (never
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

# RFC-0628: Amend dev deployment channel: workpiece-based dev deploy with pre-release Axiom verification

## Context

RFC-0627 introduced a `dev` deployment channel with an Axiom verification gate. The design requires a full release (`published` state) before `leitstand.deploy` can deploy to the dev channel. This means the operator must run the complete mission pipeline (`mission.validate` → `mission.reconcile` → `mission.close` → `release.prepare` → `release.publish`) before every dev iteration — a 7–8 minute cycle that includes 30+ validators and a full build.

In practice, the dev channel exists specifically to run Axiom checks against a live URL. The operator iterates on content, deploys to dev, reviews Axiom findings, fixes issues, and re-deploys. This cycle should be fast (~2–3 minutes: build + deploy + Axiom). The full release pipeline (artifact store, state machine, validation) is only needed when promoting to `alt` and `main`.

## Problem

RFC-0627's `leitstand.deploy` requires a `published` or `dev-deployed` release to exist before deploying to the dev channel. This forces the operator to run the entire mission validation + release pipeline before every dev iteration. The `mission.validate` step alone takes 3–4 minutes (30+ validators, full `build.prepare` pipeline). For a dev channel whose sole purpose is running Axiom against a live URL, this is disproportionate friction.

Additionally, RFC-0627's `leitstand.propagate` freshness check (`recordedAt >= publishedAt`) assumes Axiom runs after release creation. In the new flow, Axiom runs before release creation — this check would always fail.

The `dev-deployed` release state adds complexity to the state machine without value: no release exists at the time of dev deployment, so the state cannot be set on any release manifest.

## Decision

The dev deployment channel is restructured to deploy the active mission workpiece directly (without a release) and run Axiom verification before release creation. A new `leitstand.dev-deploy --system <id>` command builds the workpiece, deploys to the dev channel via `wrangler deploy`, runs `mission.check --external-preview --base-url <dev-url>` against the live dev URL, and writes Axiom evidence with the workpiece commit SHA. The release state machine returns to `published → alt-deployed → promoted` (removing `dev-deployed`). `leitstand.deploy` is removed. `leitstand.propagate` now accepts `published` releases and validates evidence by `missionId` match + `commitSha` match + `errors === 0` (replacing the `dev-deployed` state check and `recordedAt >= publishedAt` freshness check).

## Architectural fit

- **DNA-48 (Release discipline):** Amends the release state machine from `published → dev-deployed → alt-deployed → promoted` back to `published → alt-deployed → promoted`. The `dev-deployed` state is removed from `releaseStateSchema`. Releases remain immutable artifacts produced from validated missions — the change is that dev deployment no longer touches the release state machine.
- **DNA-49 (Fleet propagation):** Amends the Leitstand command family. `leitstand.deploy` is replaced by `leitstand.dev-deploy` (workpiece-based, no release required). `leitstand.propagate` gate changes from `dev-deployed` state + `recordedAt` freshness to `published` state + `missionId` + `commitSha` + `errors === 0` evidence validation. `leitstand.promote` (alt → main) and `leitstand.rollback` auto-step logic are updated to reflect the three-state chain.
- **RFC-0627:** This RFC amends RFC-0627. The `dev` channel concept and Axiom verification gate remain; the interface and state machine change.
- **RFC-0608:** The promotion chain (alt → main with build-identity verification) is unchanged.
- **Site OS operator model:** `leitstand.dev-deploy` is a workspace-scope command in the leitstand module (`packages/os/site-kernel-handoff`). It reads the active mission workpiece from the registry's `currentMission` field.

## Design

### CLI surface

```sh
# Dev iteration: build → deploy → Axiom (repeat as needed)
pnpm exec site-kernel run leitstand.dev-deploy --system warpgogol-com

# Full pipeline: validate → close → release → propagate → promote
pnpm exec site-kernel run mission.validate --mission <mid>
pnpm exec site-kernel run mission.close --mission <mid>
pnpm exec site-kernel run release.prepare --mission <mid>
pnpm exec site-kernel run release.publish --release <rid>
pnpm exec site-kernel run leitstand.propagate --release <rid>
pnpm exec site-kernel run leitstand.promote --release <rid>
```

**`leitstand.dev-deploy` flags:**

| Flag | Kind | Required | Description |
| --- | --- | --- | --- |
| `system` | string | yes | System id (e.g. `warpgogol-com`). Resolves active mission workpiece from registry `currentMission`. |

**`leitstand.propagate` (changed):**

- No longer requires `dev-deployed` state. Accepts `published` releases.
- Evidence gate: checks `missions/{missionId}/evidence/axiom/findings.yaml` for `summary.errors === 0`, `evidence-capsule.yaml` `missionId` matches release `missionId`, and `evidence-capsule.yaml` `commitSha` matches release `commitSha`.

**`leitstand.rollback` (changed):**

- Auto-step chain: `promoted` → `alt-deployed` → `published` (removes `dev-deployed` step).

### TypeScript contracts

```ts
// New: leitstand.dev-deploy result
interface DevDeployResult {
  systemId: string;
  missionId: string;
  state: "succeeded" | "failed";
  deploymentUrl: string;
  startedAt: string;
  completedAt: string | null;
  build: { succeeded: boolean; durationMs: number };
  deploy: { succeeded: boolean; workerName: string };
  axiom: {
    status: "pass" | "fail" | "not-run";
    errors: number;
    warnings: number;
    exitCode: number;
  };
  commitSha: string; // workpiece HEAD at time of deploy
}

// Changed: evidence-capsule.yaml gains commitSha field
interface AxiomEvidenceCapsule {
  // ... existing fields ...
  missionId: string;
  commitSha: string; // NEW: workpiece HEAD SHA at time of Axiom run
}

// Changed: releaseStateSchema removes dev-deployed
const releaseStateSchema = z.enum([
  "prepared",
  "published",
  "alt-deployed",
  "promoted",
  "rolled-back",
]);
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `missions/{mission}/workpiece/dist/` | Built by `leitstand.dev-deploy` via `pnpm build` in workpiece directory before deploy |
| `systems/registry.yaml` `dev.secretsFile` | Secrets reference for dev channel (resolved via `resolveSecretsFilePath`, same as current `leitstand.deploy`) |
| `missions/{mission}/evidence/axiom/findings.yaml` | Written by Axiom run during `leitstand.dev-deploy` |
| `missions/{mission}/evidence/axiom/evidence-capsule.yaml` | Updated with `commitSha` field |
| `systems/registry.yaml` | Read for `currentMission`, `channels.dev` config |
| `releases/{release}/release.yaml` | Read by `leitstand.propagate` for `missionId`, `commitSha` |

`leitstand.dev-deploy` does **not** write to `systems/registry.yaml` or bordbuch — dev deploys are ephemeral and untracked in the registry.

### Output format

```json
{
  "commandName": "leitstand.dev-deploy",
  "exitCode": 0,
  "ok": true,
  "data": {
    "systemId": "warpgogol-com",
    "missionId": "warpgogol-com-m000024",
    "state": "succeeded",
    "deploymentUrl": "https://dev.warpgogol.com",
    "commitSha": "abc123def456",
    "build": { "succeeded": true, "durationMs": 75000 },
    "deploy": { "succeeded": true, "workerName": "dev-warpgol-com" },
    "axiom": {
      "status": "fail",
      "errors": 1284,
      "warnings": 3466,
      "exitCode": 1
    }
  },
  "summary": "[leitstand.dev-deploy] deployed to dev (succeeded), Axiom: fail (1284 errors)"
}
```

### Build and deploy sequence

`leitstand.dev-deploy` executes these steps in order:

1. **Resolve workpiece** — read `currentMission` from `systems/registry.yaml`, resolve to `missions/{mission}/workpiece/`.
2. **Build** — run `pnpm build` in the workpiece directory to produce `dist/`. If build fails, exit 1 with "build failed — no dist/ directory".
3. **Capture commitSha** — read workpiece HEAD via `git rev-parse HEAD` in the workpiece directory. This SHA is used for evidence binding. If the workpiece has uncommitted changes, the HEAD SHA is still captured — but the operator must commit and re-deploy before creating a release, because `leitstand.propagate` checks `evidence.commitSha === release.commitSha` and the release is created from a clean workpiece (after `mission.close`).
4. **Deploy** — call `adapter.propagate()` with the workpiece `dist/` path, `dev` channel config from registry.
5. **Purge CDN cache** — same as existing leitstand commands (RFC-0624).
6. **Run Axiom** — invoke `mission.check --external-preview --base-url <dev-url> --mission <missionId>`. `mission.check` writes `findings.yaml` and `evidence-capsule.yaml` to `missions/{mission}/evidence/axiom/`.
7. **Post-process evidence capsule** — read `evidence-capsule.yaml`, add `commitSha` field with the workpiece HEAD SHA captured in step 3, write back. This keeps the change in `@warpgogol/site-kernel-handoff` — `mission.check` is NOT modified.
8. **Return result** — include `commitSha`, build/deploy/axiom status in `DevDeployResult`.

`leitstand.dev-deploy` does **not** write to `systems/registry.yaml` (`lastPropagated.dev` is not updated) and does **not** append to bordbuch — dev deploys are ephemeral and untracked in the registry.

### Failure modes

| Scenario | Behavior |
| --- | --- |
| No active mission for system | Error: "system '<id>' has no active mission" (exit 1) |
| Workpiece `dist/` missing after build | Error: "build failed — no dist/ directory" (exit 1) |
| `wrangler deploy` fails | Error: deploy state `failed`, Axiom not run (exit 1) |
| `wrangler deploy` succeeds, Axiom finds errors | Deploy state `succeeded`, Axiom `fail`, exit code 1. Evidence is still written. Operator reviews findings and iterates. |
| `wrangler deploy` succeeds, Axiom passes (0 errors) | Deploy state `succeeded`, Axiom `pass`, exit code 0. Ready for release pipeline. |
| `mission.check` fails with exit code 4 (Playwright missing) | Axiom `not-run`, warning logged. Operator runs `pnpm exec playwright install chromium` and retries. |
| `.env.dev` missing | Error: "secrets file not found at <path>" (exit 1). Operator creates it from `.env.alt`. |
| `leitstand.propagate` evidence mismatch (commitSha) | Error: "evidence commitSha '<x>' does not match release commitSha '<y>' — re-run leitstand.dev-deploy after workpiece changes" (exit 1) |
| `leitstand.propagate` evidence mismatch (missionId) | Error: "evidence missionId does not match release missionId" (exit 1) |
| `leitstand.propagate` evidence missing | Error: "no Axiom evidence found for mission '<mid>' — run leitstand.dev-deploy first" (exit 1) |

## Rollout

1. **Remove `leitstand.deploy`** from `leitstand.module.ts` and its handler `runLeitstandDeploy` from `leitstand-commands.ts`. This removes the registry `lastPropagated.dev` write and bordbuch append for dev deploys.
2. **Add `leitstand.dev-deploy`** to `leitstand.module.ts` with `--system` flag, workspace scope. The handler `runLeitstandDevDeploy` must NOT write to `systems/registry.yaml` or bordbuch.
3. **Update `releaseStateSchema`** in `packages/ontology/src/operations/release.ts`: remove `dev-deployed`.
4. **Update `leitstand.propagate`** gate logic: accept `published` state, validate evidence by `missionId` match (from `evidence-capsule.yaml`) + `commitSha` match (from `evidence-capsule.yaml` vs release manifest) + `summary.errors === 0` (from `findings.yaml`). Remove the `recordedAt >= publishedAt` freshness check.
5. **Update `leitstand.rollback`** auto-step chain: `promoted → alt-deployed → published`. Remove `dev-deployed` from `detectChannelFromState` and `autoStepReleaseState`.
6. **Post-process evidence capsule** in `leitstand.dev-deploy`: after `mission.check` writes `evidence-capsule.yaml`, read it, add `commitSha` field with workpiece HEAD SHA, write back. `mission.check` itself is NOT modified.
7. **Update `leitstand-0627-dev-channel.test.ts`**: replace `leitstand.deploy` tests with `leitstand.dev-deploy` tests; update `leitstand.propagate` tests for new gate logic (published state + commitSha match + errors === 0).
8. **Update DNA-48 and DNA-49** prose in `docs/architecture-dna.md` to reflect three-state machine (remove `dev-deployed`) and workpiece-based dev deploy.
9. **Update `leitstand.module.ts` description** for `leitstand.propagate` to reflect `published` state requirement.
10. **Update `packages/os/site-kernel-handoff/AGENTS.md`** Leitstand section: replace `leitstand.deploy` with `leitstand.dev-deploy` (workpiece-based, `--system` flag, no registry/bordbuch writes); update state machine description (remove `dev-deployed`); update `leitstand.propagate` gate description (published + commitSha + errors === 0); update `leitstand.rollback` auto-step (remove `dev-deployed` step).
11. **Check Compass XML sync**: verify whether `docs/verification-plan.xml` or `docs/development-plan.xml` reference the deployment chain or `dev-deployed` state. Update if needed.
12. **Run `command.manifest.generate`** to refresh `docs/command-manifest.generated.yaml`.

No migration path needed — no release has ever entered `dev-deployed` state in production. The `dev` channel in `systems/registry.yaml` remains unchanged.

## Alternatives considered

1. **Two-cycle model (fast dev-deploy + full release deploy):** Rejected by operator. Maintaining two separate deployment cycles adds complexity and confusion. One cycle must be both fast and reliable.

2. **`leitstand.deploy --skip-validation` flag:** Rejected. Breaks the RFC-0627 contract (`--release` required, state machine). Adding bypass flags to existing commands creates ambiguity about which path is "real".

3. **Separate Axiom command (`leitstand.axiom.verify`):** Rejected. Splits the dev cycle into two commands (deploy + verify), adding friction. The operator wants one command that does everything.

4. **Keep `leitstand.deploy` with `--workpiece` flag:** Rejected. Overloads the command's semantics — `leitstand.deploy` was designed for release-based deployment. A new command with clear semantics is cleaner.

5. **Keep `dev-deployed` state for tracking:** Rejected. No release exists at dev-deploy time, so the state cannot be set on any release manifest. Registry tracking for dev is unnecessary (operator decision: dev is ephemeral).

## Risks

- **Evidence staleness:** If the operator runs `leitstand.dev-deploy`, then modifies the workpiece, then creates a release without re-running dev-deploy, the evidence `commitSha` will not match the release `commitSha`. `leitstand.propagate` will reject with an actionable error message. This is the intended behavior — it forces a re-verify cycle.

- **Workpiece build non-determinism:** If `pnpm build` produces different output for the same workpiece commit (e.g., due to environment differences), the dist deployed to dev may differ from the dist in the release artifact. This risk exists in RFC-0627 as well and is mitigated by the behavior snapshot hash comparison in `leitstand.promote`.

- **Agent confusion:** Agents may try to run `leitstand.deploy` (removed) or expect `dev-deployed` state. The `AGENTS.md` leitstand section must be updated to reflect the new command and state machine.

- **No registry tracking for dev:** Since dev deploys are ephemeral, `leitstand.status` will show `dev: none` even when a dev Worker is live. This is acceptable — the operator knows they deployed. The Axiom evidence in the mission directory is the durable record.

## Acceptance criteria

- [ ] `leitstand.dev-deploy` command registered in `leitstand.module.ts` with `--system` flag (workspace scope)
- [ ] `leitstand.dev-deploy` builds workpiece, deploys to dev channel, runs Axiom, writes evidence with `commitSha`
- [ ] `leitstand.deploy` command removed from `leitstand.module.ts` and its handler deleted
- [ ] `releaseStateSchema` in `packages/ontology/src/operations/release.ts` no longer includes `dev-deployed`
- [ ] `leitstand.propagate` accepts `published` state (rejects non-published with actionable error)
- [ ] `leitstand.propagate` validates evidence by `missionId` match + `commitSha` match + `summary.errors === 0`
- [ ] `leitstand.propagate` rejects with actionable message when evidence `commitSha` does not match release `commitSha`
- [ ] `leitstand.rollback` auto-step chain: `promoted → alt-deployed → published` (no `dev-deployed` step)
- [ ] `evidence-capsule.yaml` includes `commitSha` field
- [ ] DNA-48 and DNA-49 prose in `docs/architecture-dna.md` updated to reflect three-state machine
- [ ] Unit tests in `leitstand-0627-dev-channel.test.ts` updated for new command and gate logic
- [ ] `command.manifest.generate` run to refresh `docs/command-manifest.generated.yaml`
- [ ] `packages/os/site-kernel-handoff/AGENTS.md` Leitstand section updated for `leitstand.dev-deploy` and three-state machine
- [ ] `rfc.validate` passes on this file

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT bypass the Axiom gate by editing `findings.yaml` directly, running `leitstand.propagate` with modified evidence, or adding a `--skip-axiom` flag.
- Agents MUST NOT run `leitstand.propagate` on a release whose evidence `commitSha` does not match — the operator must re-run `leitstand.dev-deploy` after workpiece changes.
- Agents MUST NOT manually set `commitSha` in `evidence-capsule.yaml` — it is written by `leitstand.dev-deploy` during the Axiom run.
- Agents MUST NOT add registry tracking or bordbuch entries for dev deploys — dev is ephemeral by design. The `runLeitstandDevDeploy` handler must NOT call `writeRegistry`, `appendBordbuchEntry`, or update `lastPropagated.dev`.
- Agents MUST NOT modify `mission.check` to add `commitSha` to the evidence capsule. The `commitSha` field is added by `leitstand.dev-deploy` as a post-processing step after `mission.check` writes the capsule.
- If the workpiece has uncommitted changes, `leitstand.dev-deploy` still captures the HEAD SHA and deploys. However, the operator MUST commit and re-deploy before creating a release — `leitstand.propagate` will reject evidence whose `commitSha` does not match the release's `commitSha` (which is derived from a clean workpiece after `mission.close`).
- If `mission.check` fails with exit code 4 (Playwright missing), agents MAY run `pnpm exec playwright install chromium` and retry `leitstand.dev-deploy`.
- If Axiom finds errors, agents MUST report the errors to the operator and MUST NOT attempt to suppress or filter findings.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N" instead of working around it (RFC-0334).
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
