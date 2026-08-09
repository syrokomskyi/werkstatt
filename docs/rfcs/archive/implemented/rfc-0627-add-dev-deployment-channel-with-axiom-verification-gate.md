---
id: RFC-0627
title: "Add dev deployment channel with Axiom verification gate"
status: implemented
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
implementedAt: 2026-07-31
closedAt:
supersedes: []
supersededBy:
amends:
  - RFC-0608
amendedBy:
  - RFC-0628
  - RFC-0666
related:
  - DNA-48
  - DNA-49
  - RFC-0608
  - RFC-0358
  - RFC-0379
  - RFC-0624
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
breaksC: true
commands:
  proposed:
    - leitstand.deploy
  added:
    - leitstand.deploy
  changed:
    - leitstand.propagate
    - leitstand.rollback
  removed: []
appsImpacted: []
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - "@warpgogol/ontology"
  - "@warpgogol/site-kernel-handoff"
successSignals:
  - "leitstand.deploy deploys to dev channel and runs mission.check automatically"
  - "leitstand.propagate rejects releases not in dev-deployed state"
  - "leitstand.rollback auto-detects channel from release state"
nonGoals:
  - "Does not add Axiom methodologies beyond web-accessibility (pilot scope)"
  - "Does not implement --skip-axiom bypass (gate is absolute)"
  - "Does not migrate existing releases to the new state machine (clean slate)"
  - "Does not add --mode dev to mission.check (external-preview mode is used instead)"
  - "Does not introduce per-page Axiom checks (sitemap-driven full-site check only)"
  - "Does not change leitstand.promote (alt→main promotion with build-identity verification is unchanged from RFC-0608)"
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

# RFC-0627: Add dev deployment channel with Axiom verification gate

## Context

The current deployment chain (RFC-0608) is `published → alt-deployed → promoted`. A release is deployed to the `alt` staging channel, health-checked, then promoted to `main`. The `mission.check` command (RFC-0012) runs Axiom accessibility checks, but only against a local static server or an explicitly-provided `--base-url`. There is no automated gate between "build passed" and "deploy to alt" — Axiom verification is a manual, opt-in step that an operator can forget or skip.

The `alt` channel (`alt-warpgogol-com.syrokomskyi.workers.dev`) is a Cloudflare Workers staging URL, not a real domain. Health checks verify content hashes and redirect routes, but do not run accessibility, SEO, or runtime instruments. A release with WCAG violations, broken semantic structure, or runtime errors can pass alt health checks and be promoted to production.

## Problem

DNA-48 (release discipline) and DNA-49 (fleet propagation) define a two-channel deployment model (`alt` → `main`) with no automated quality gate between build and staging. Specifically:

1. **No Axiom gate in the deployment chain.** `mission.check` exists but is not invoked by any leitstand command. An operator must run it manually and remember to check the results before deploying.

2. **Local server is not representative.** `mission.check` in preview mode builds the workpiece and serves it from a local static server on `127.0.0.1:<port>`. This does not test real DNS, TLS, CDN caching, or Cloudflare Workers runtime behavior. Accessibility violations that only manifest under real HTTP conditions (e.g., CSP-blocked scripts, missing headers, CDN-transformed HTML) are invisible.

3. **`leitstand.propagate` accepts `published` releases directly.** There is no state between `published` and `alt-deployed` that proves the release was verified on a real internet-facing URL before reaching staging.

4. **Rollback requires explicit `--channel` knowledge.** The operator must know which channel to roll back, adding cognitive load during incidents (RFC-0608 rollback interface).

## Decision

The deployment chain gains a mandatory `dev` channel before `alt`. The new release state machine is `published → dev-deployed → alt-deployed → promoted`. A new `leitstand.deploy` command deploys a published release to the `dev` channel, then automatically runs `mission.check --external-preview --base-url <dev-url>` to verify accessibility on the live dev site. `leitstand.propagate` now requires `dev-deployed` state (not `published`) and verifies that Axiom evidence exists with zero errors before deploying to `alt`. `leitstand.rollback` is simplified to auto-detect the channel from the release state, removing the `--channel` flag.

## Architectural fit

- **DNA-48 (release discipline):** Extends the release state machine from `prepared → published → alt-deployed → promoted → rolled-back` to `prepared → published → dev-deployed → alt-deployed → promoted → rolled-back`. The `dev-deployed` state proves Axiom verification passed on a live URL before the release reaches staging.

- **DNA-49 (fleet propagation):** Extends the channel model from `alt` + `main` to `dev` + `alt` + `main`. All three channels are required in `deployment.channels`. `leitstand.propagate` is gated on `dev-deployed` state plus Axiom evidence with zero errors.

- **RFC-0608 (alt-to-main promotion chain):** Amended. The `published → alt-deployed` transition is replaced by `published → dev-deployed → alt-deployed`. Build-identity verification from alt URL is unchanged. The `alt-deployed → promoted` promotion via `leitstand.promote` is unchanged.

- **RFC-0012 (mission.check):** Used in `--external-preview --base-url` mode. No changes to `mission.check` itself — it already supports external preview.

- **RFC-0624 (CDN cache purge):** `leitstand.deploy` purges CDN cache after dev deploy, before running Axiom checks, same as `leitstand.propagate` and `leitstand.promote`.

- **Site OS operator model:** `leitstand.deploy` is a workspace-scoped command in the leitstand command table. It mutates registry state and release state. It is cacheable: false, mutatesState: true.

## Design

### CLI surface

```sh
# Deploy to dev channel + automatic Axiom check
pnpm exec werkstatt run leitstand.deploy --release warpgogol-com-r000006 [--json]

# Propagate dev → alt (requires dev-deployed + Axiom evidence)
pnpm exec werkstatt run leitstand.propagate --release warpgogol-com-r000006 [--json]

# Promote alt → main (unchanged from RFC-0608)
pnpm exec werkstatt run leitstand.promote --release warpgogol-com-r000006 [--json]

# Rollback — auto-detects channel from release state
pnpm exec werkstatt run leitstand.rollback --system warpgogol-com [--to-release warpgogol-com-r000004] [--json]
```

**`leitstand.deploy` flags:**

| Flag        | Kind    | Required | Description           |
| ----------- | ------- | -------- | --------------------- |
| `--release` | string  | yes      | Release id to deploy. |
| `--json`    | boolean | no       | Output JSON result.   |

**`leitstand.rollback` flags (changed):**

| Flag | Kind | Required | Description |
| --- | --- | --- | --- |
| `--system` | string | yes | System id. |
| `--to-release` | string | no | Specific release to roll back to. Auto-discovered if omitted. |
| `--json` | boolean | no | Output JSON result. |

The `--channel` flag is removed from `leitstand.rollback`. The channel is auto-detected from the release state: `promoted` → main, `alt-deployed` → alt, `dev-deployed` → dev. The `rolled-back` state is kept in `releaseStateSchema` for compatibility with existing releases rolled back under RFC-0608, but is not reachable for new releases under the auto-step model — rollback always transitions one step back in the deployment chain.

### `leitstand.deploy` accepted states

`leitstand.deploy` accepts releases in `published` or `dev-deployed` state. A `published` release is a first deploy. A `dev-deployed` release is a re-deploy (e.g., after fixing Axiom errors from a previous run). Releases in any other state are rejected with an actionable error message.

### Axiom evidence freshness check

`leitstand.propagate` verifies Axiom evidence freshness by comparing `findings.yaml`'s `recordedAt` timestamp to the release's `publishedAt` timestamp. If `recordedAt` is before `publishedAt`, the evidence is stale (from a previous release of the same mission) and `leitstand.propagate` rejects with: "Axiom evidence is stale (recorded: <date>, published: <date>). Re-run leitstand.deploy for this release."

### Rollback behavior change from RFC-0608

RFC-0608 transitions main rollback → `rolled-back` and alt rollback → `published`. This RFC changes both:

- Main rollback: `promoted` → `alt-deployed` (one step back, not `rolled-back`)
- Alt rollback: `alt-deployed` → `dev-deployed` (one step back, not `published`)

This means a rolled-back release can be re-promoted or re-propagated without re-deploying from scratch. The `rolled-back` state remains in the enum for existing releases only.

### TypeScript contracts

```ts
// packages/ontology/src/operations/leitstand.ts

export const deploymentChannelSchema = z.object({
  workerName: z.string(),
  url: z.string().url(),
  secretsFile: secretRefSchema.optional(),
});

export const deploymentConfigSchema = z.object({
  adapter: deploymentAdapterNameSchema,
  channels: z.object({
    dev: deploymentChannelSchema,   // required (was absent)
    alt: deploymentChannelSchema,   // required (was optional)
    main: deploymentChannelSchema,  // required (unchanged)
  }),
  lastPropagated: z.object({
    dev: lastPropagatedChannelSchema.optional(),
    alt: lastPropagatedChannelSchema.optional(),
    main: lastPropagatedChannelSchema.optional(),
  }).default({}),
});

// packages/ontology/src/operations/release.ts

export const releaseStateSchema = z.enum([
  "prepared",
  "published",
  "dev-deployed",   // NEW: deployed to dev + Axiom verified
  "alt-deployed",
  "promoted",
  "rolled-back",
]);

// packages/os/site-kernel-handoff/src/leitstand/leitstand-commands.ts

export interface LeitstandDeployData {
  command: "leitstand.deploy";
  systemId: string;
  releaseId: string;
  channel: "dev";
  state: "succeeded" | "failed";
  deploymentUrl: string;
  axiomResult: {
    status: "pass" | "fail";
    errors: number;
    warnings: number;
    evidenceDir: string;
  };
  releaseState: "dev-deployed";
}

export type Channel = "dev" | "alt" | "main";

// leitstand.propagate gate check (pseudo-code):
// if (releaseManifest.state !== "dev-deployed") throw;
// const findings = readFindingsYaml(missionId);
// if (findings.summary.errors > 0) throw;
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `systems/registry.yaml` | Updated: `channels.dev` added, `channels.alt` becomes required |
| `releases/<id>/release.yaml` | Updated: state transitions include `dev-deployed` |
| `missions/<id>/evidence/axiom/findings.yaml` | Read by `leitstand.propagate` to verify zero errors |
| `missions/<id>/evidence/axiom/evidence-capsule.yaml` | Read to verify evidence freshness |
| `packages/ontology/src/operations/leitstand.ts` | Schema: `channels.dev` added, `channels.alt` required |
| `packages/ontology/src/operations/release.ts` | Schema: `dev-deployed` state added |
| `packages/os/site-kernel-handoff/src/leitstand/leitstand-commands.ts` | New `runLeitstandDeploy`, modified `runLeitstandPropagate`, modified `runLeitstandRollback` |
| `packages/os/site-kernel-handoff/src/leitstand/leitstand.module.ts` | `leitstand.deploy` command registered alongside existing leitstand commands |
| `packages/os/site-kernel-handoff/src/leitstand/leitstand-commands.ts` | `leitstand.status` updated to show `dev` channel; `leitstand.health` updated to accept `--channel dev` |

### Output format

```json
{
  "command": "leitstand.deploy",
  "data": {
    "systemId": "warpgogol-com",
    "releaseId": "warpgogol-com-r000006",
    "channel": "dev",
    "state": "succeeded",
    "deploymentUrl": "https://dev.warpgogol.com",
    "axiomResult": {
      "status": "pass",
      "errors": 0,
      "warnings": 42,
      "evidenceDir": "missions/warpgogol-com-m000024/evidence/axiom"
    },
    "releaseState": "dev-deployed",
    "preflight": { "passed": true, "checks": [] },
    "purgeResult": { "success": true, "purgedUrls": 84 }
  },
  "exitCode": 0,
  "summary": "leitstand.deploy: warpgogol-com-r000006 deployed to dev (succeeded, axiom: pass)"
}
```

When Axiom finds errors:

```json
{
  "command": "leitstand.deploy",
  "data": {
    "state": "succeeded",
    "axiomResult": { "status": "fail", "errors": 12, "warnings": 30, ... },
    "releaseState": "dev-deployed"
  },
  "exitCode": 1,
  "summary": "leitstand.deploy: warpgogol-com-r000006 deployed to dev (succeeded, axiom: FAIL — 12 errors)"
}
```

The deploy itself succeeds (the site is live on dev), but the command exits 1 to signal Axiom failures. The release enters `dev-deployed` state, but `leitstand.propagate` will reject it because `findings.summary.errors > 0`.

### Failure modes

| Scenario | Exit code | Release state | Behavior |
| --- | --- | --- | --- |
| Dev deploy succeeds, Axiom passes (0 errors) | 0 | `dev-deployed` | Normal flow. `leitstand.propagate` is unblocked. |
| Dev deploy succeeds, Axiom fails (>0 errors) | 1 | `dev-deployed` | Release is live on dev but stuck. `leitstand.propagate` rejects it. Operator must fix errors and re-run `leitstand.deploy` (accepts `dev-deployed` state for re-deploy). |
| Dev deploy fails (wrangler error) | 2 | `published` (unchanged) | Deploy did not succeed. Release stays published. |
| Dev health check timeout | 3 | `published` | Dev URL not responding. |
| Playwright not installed (passed through from `mission.check`) | 4 | `published` | `mission.check` cannot run. Operator runs `pnpm exec playwright install chromium`. |
| `axiom-study` package missing (passed through from `mission.check`) | 5 | `published` | Dependency resolution failure. |
| Build failure (not used — deploy uses pre-built dist) | 6 | N/A | Not applicable — `leitstand.deploy` uses the release artifact dist, not a fresh build. |
| Sitemap missing on dev (passed through from `mission.check`) | 7 | `published` | Dev site has no sitemap.xml. Check build output. |
| Axiom evidence stale (`recordedAt` < release `publishedAt`) | — | blocked | `leitstand.propagate` rejects: "Axiom evidence is stale (recorded: <date>, published: <date>). Re-run leitstand.deploy for this release." |
| Axiom evidence missing | — | blocked | `leitstand.propagate` rejects: "No Axiom evidence found for mission <id>. Run leitstand.deploy first." |
| Axiom evidence has errors | — | blocked | `leitstand.propagate` rejects: "Axiom verification failed: <N> errors. Fix and re-deploy to dev." |

Exit codes 4–7 are passed through from `mission.check`. Exit codes 2–3 are `leitstand.deploy`'s own (deploy phase and dev health check phase). Exit code 1 indicates the deploy succeeded but Axiom found violations.

## Rollout

**Clean slate.** No migration of existing releases. The new state machine applies to all releases created after this RFC is implemented. Existing releases in `promoted` or `alt-deployed` state remain as-is and are not affected. Existing `alt-deployed` releases can be promoted or rolled back, but cannot be re-propagated through the new chain (they would need to be re-released via a new mission to enter the `dev-deployed` state).

**Implementation order:**

1. **Schema changes** (`packages/ontology`): Add `dev-deployed` to `releaseStateSchema`. Add `channels.dev` (required) and make `channels.alt` required in `deploymentConfigSchema`. Update `lastPropagatedChannelSchema` to include `dev`.

2. **Registry update** (`systems/registry.yaml`): Add `dev` channel for warpgogol-com with `workerName: dev-warpgogol-com`, `url: https://dev.warpgogol.com`, `secretsFile: env:WERKSTATT_SECRETS_DEV`.

3. **`leitstand.deploy` command** (`packages/os/site-kernel-handoff`): New command. Deploys to dev channel via cloudflare-workers adapter, purges CDN cache, runs health check, then invokes `mission.check --external-preview --base-url <dev-url> --mission <missionId> --json`. Writes Axiom evidence to `missions/<missionId>/evidence/axiom/`. Transitions release to `dev-deployed` on deploy success (regardless of Axiom result — the release IS deployed, but propagate is gated).

4. **`leitstand.propagate` modification**: Change state check from `published` to `dev-deployed`. Add Axiom evidence gate: read `missions/<missionId>/evidence/axiom/findings.yaml`, verify `summary.errors === 0`. If evidence missing or errors > 0, reject with actionable message.

5. **`leitstand.rollback` modification**: Remove `--channel` flag. Auto-detect channel from release state. Implement auto-step logic: `promoted` → rollback main → `alt-deployed`; `alt-deployed` → rollback alt → `dev-deployed`; `dev-deployed` → rollback dev → `published`. Keep `--to-release` optional.

6. **DNA updates**: Update DNA-48 and DNA-49 prose in `docs/architecture-dna.md` to reflect the three-channel model and `dev-deployed` state.

7. **AGENTS.md updates**: Update `packages/os/site-kernel-handoff/AGENTS.md` Leitstand section with the new `dev` channel, `leitstand.deploy` command, three-stage deployment chain, and auto-step rollback model. Update root `AGENTS.md` if deployment chain is documented there.

8. **Compass XML sync**: Update `docs/verification-plan.xml` if it references the deployment chain or release state machine. Update `docs/development-plan.xml` if it tracks deployment-related milestones.

9. **`leitstand.status` and `leitstand.health`**: Update both commands to support the `dev` channel. `leitstand.status` shows all three channels (`dev`, `alt`, `main`). `leitstand.health` accepts `--channel dev|alt|main`.

10. **Env file**: Create `.env.dev` for warpgogol-com workpiece with the same secrets as `.env.alt`. Set `WERKSTATT_SECRETS_DEV` environment variable to point to `.env.dev`.

11. **DNS**: Configure `dev.warpgogol.com` DNS record and Cloudflare Worker route for `dev-warpgogol-com` worker.

12. **Command registration**: Register `leitstand.deploy` in `packages/os/site-kernel-handoff/src/leitstand/leitstand.module.ts` alongside existing leitstand commands.

13. **Tests**: Unit tests for `leitstand.deploy` (deploy + axiom gate), `leitstand.propagate` (dev-deployed state check + axiom evidence gate + freshness check), `leitstand.rollback` (auto-step from each state).

## Alternatives considered

1. **Keep local server for Axiom checks.** Run `mission.check` in preview mode (local static server) before `leitstand.propagate`, without a dev channel. Rejected: a local server on `127.0.0.1` does not test real DNS, TLS, CDN caching, or Cloudflare Workers runtime. Accessibility violations that only manifest under real HTTP conditions are invisible. The operator explicitly wants real internet verification.

2. **Run Axiom on alt channel, not a separate dev channel.** Deploy to alt, run Axiom on alt URL, then promote to main. Rejected: alt is already the staging channel — adding Axiom checks to alt would mix verification with staging. If Axiom fails, alt is polluted with a broken release. The dev channel provides isolation: broken releases stay on dev and never reach alt.

3. **Manual Axiom check with `--skip-axiom` bypass for emergencies.** Rejected by operator decision: the Axiom gate is absolute. No bypass flag. If the release has accessibility errors, it stays stuck in `dev-deployed` until fixed. This maximizes reliability.

4. **Keep `--channel` on `leitstand.rollback`.** Rejected: the operator confirmed the auto-step model. Removing `--channel` reduces cognitive load during incidents — the system knows the current state and rolls back one step automatically.

## Risks

- **Dev secrets write-only problem.** Cloudflare Worker secrets deployed via `wrangler deploy --secrets-file` are write-only. If `.env.dev` is lost, secrets cannot be extracted from the Worker. Mitigation: `.env.dev` is gitignored but stored on disk alongside `.env.alt` and `.env.main`. Backup discipline applies equally to all three files.

- **Axiom false positives block deployment.** axe-core may report violations that are false positives or acceptable in context (e.g., color-contrast on decorative elements). Mitigation: the pilot runs only `web-accessibility` methodology. Findings are written to `findings.yaml` with full details (ruleId, target, help URL) for manual review. If a finding is a true false positive, the operator fixes the underlying issue or files an RFC to refine the instrument scope.

- **Dev deploy + Axiom duration.** `leitstand.deploy` takes ~2-3 minutes (wrangler deploy + CDN purge + 6s wait + health check + Playwright on all sitemap pages). This is longer than `leitstand.propagate` alone. Mitigation: this is the cost of automated verification. The alternative (manual checks) is slower and less reliable.

- **Playwright version mismatch.** `mission.check` requires a Playwright Chromium version matching the `axiom-capture` dependency. If versions drift, `mission.check` fails with exit code 4. Mitigation: documented in the command output (`pnpm exec playwright install chromium`).

- **Agent misinterpretation.** Agents may attempt to run `leitstand.propagate` on a `published` release (old behavior). The error message must clearly state: "Release must be in state 'dev-deployed'. Run leitstand.deploy first." Agents MUST NOT bypass the Axiom gate by editing `findings.yaml` directly.

- **Schema breaking change.** Making `channels.dev` and `channels.alt` required breaks any registry entry that lacks them. Mitigation: clean slate — only one system exists, and it will be updated as part of the rollout.

## Acceptance criteria

- [x] `releaseStateSchema` in `packages/ontology/src/operations/release.ts` includes `dev-deployed` (evidence: packages/ontology/src/operations/release.ts:11)
- [x] `deploymentConfigSchema` in `packages/ontology/src/operations/leitstand.ts` requires `channels.dev`, `channels.alt`, and `channels.main` (evidence: packages/ontology/src/operations/leitstand.ts:50-55)
- [x] `leitstand.deploy` command registered in `packages/os/site-kernel-handoff/src/leitstand/leitstand.module.ts` (evidence: packages/os/site-kernel-handoff/src/leitstand/leitstand.module.ts:31-49)
- [x] `leitstand.deploy` deploys to dev channel and automatically runs `mission.check --external-preview --base-url <dev-url>` (evidence: packages/os/site-kernel-handoff/src/leitstand/leitstand-commands.ts:535-545)
- [x] `leitstand.deploy` writes Axiom evidence to `missions/<missionId>/evidence/axiom/findings.yaml` (evidence: packages/os/site-kernel-checks/src/mission-check.ts:540-554)
- [x] `leitstand.deploy` transitions release state to `dev-deployed` on deploy success (evidence: packages/os/site-kernel-handoff/src/leitstand/leitstand-commands.ts:523-525)
- [x] `leitstand.propagate` rejects releases not in `dev-deployed` state with actionable error message (evidence: packages/os/site-kernel-handoff/src/leitstand/leitstand-commands.ts:649-653)
- [x] `leitstand.propagate` reads `findings.yaml` and rejects when `summary.errors > 0` (evidence: packages/os/site-kernel-handoff/src/leitstand/leitstand-commands.ts:687-691)
- [x] `leitstand.rollback` auto-detects channel from release state without `--channel` flag (evidence: packages/os/site-kernel-handoff/src/leitstand/leitstand-commands.ts:977-978)
- [x] `leitstand.rollback` auto-step: `promoted` → main rollback → `alt-deployed`; `alt-deployed` → alt rollback → `dev-deployed`; `dev-deployed` → dev rollback → `published` (evidence: packages/os/site-kernel-handoff/src/leitstand/leitstand-commands.ts:921-925)
- [x] `systems/registry.yaml` updated with `dev` channel for warpgogol-com (evidence: systems/registry.yaml:20-23)
- [x] DNA-48 and DNA-49 prose in `docs/architecture-dna.md` updated to reflect three-channel model (evidence: docs/architecture-dna.md:209,213)
- [x] Unit tests for `leitstand.deploy`, modified `leitstand.propagate`, and modified `leitstand.rollback` pass (evidence: packages/os/site-kernel-handoff/src/tests/leitstand-0627-dev-channel.test.ts:1-460)
- [x] `rfc.validate` passes on this file before merging (evidence: rfc.validate output: 0 errors)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT bypass the Axiom gate by editing `findings.yaml` directly, running `leitstand.propagate` with modified evidence, or adding a `--skip-axiom` flag.
- Agents MUST NOT run `leitstand.propagate` on a release in `published` state — it must be `dev-deployed` first.
- Agents MUST NOT manually set release state to `dev-deployed` without running `leitstand.deploy` — the state transition is owned by the command.
- Agents MUST NOT add a `--channel` flag to `leitstand.rollback` — the auto-step model is the only interface.
- If `mission.check` fails with exit code 4 (Playwright missing), agents MAY run `pnpm exec playwright install chromium` and retry `leitstand.deploy`.
- If Axiom finds errors, agents MUST report the errors to the operator and MUST NOT attempt to suppress or filter findings.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N" instead of working around it (RFC-0334).
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
