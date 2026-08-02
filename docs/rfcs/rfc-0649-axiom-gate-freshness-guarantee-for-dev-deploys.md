---
id: RFC-0649
title: "Axiom gate freshness guarantee for dev deploys"
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
createdAt: 2026-08-02
updatedAt: 2026-08-02
enhancedAt: 2026-08-02
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends:
  - RFC-0628
amendedBy: []
related:
  - DNA-49
  - RFC-0628
  - RFC-0634
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
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
  proposed: []
  added: []
  changed:
    - leitstand.dev-deploy
  removed: []
appsImpacted: []
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - site-kernel-handoff
# @warpgogol/ontology is NOT impacted — the `fatal` behavior is a caller-side
# decision in leitstand-commands.ts, not a purgeResultSchema field addition.
successSignals: []
nonGoals:
  - Does not change leitstand.propagate or leitstand.promote — they already verify build-identity.json (RFC-0634).
  - Does not add a Worker URL fallback for Axiom gate — the gate always uses the CDN URL.
  - Does not add retry logic for CDN edge propagation delay — a single fetch after sleep is sufficient for dev channel.
  - Does not add a --force bypass for freshness check — the check is mandatory.
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

# RFC-0649: Axiom gate freshness guarantee for dev deploys

## Context

`leitstand.dev-deploy` (RFC-0628) deploys the active mission's workpiece to the dev channel via `wrangler deploy`, purges the CDN cache, and runs the Axiom verification gate (`mission.check --external-preview`) against the channel's CDN URL. The CDN cache purge step is non-fatal: if `CLOUDFLARE_ZONE_ID` is missing or the Cloudflare API returns an error, the pipeline logs a warning and continues to the Axiom gate.

In practice, this means the Axiom gate can verify stale CDN content that does not reflect the freshly deployed Worker. During a dev deploy session on 2026-08-02, this produced 964 false-positive accessibility errors because the CDN continued serving a CSS file from a previous deploy while the Worker had already been updated with accessibility fixes. The Axiom gate passed (0 errors) when run directly against the Worker URL, confirming the Worker was fresh but the CDN was stale.

`leitstand.propagate` and `leitstand.promote` already verify `build-identity.json` from the deployment URL (RFC-0634), comparing `distTreeHash` against the release manifest. `leitstand.dev-deploy` has no equivalent freshness check — it trusts the CDN purge API response without verifying that the CDN actually serves the new content.

## Problem

DNA-49 states that `leitstand.dev-deploy` runs the Axiom verification gate via `mission.check --external-preview`. The invariant assumes the gate verifies the freshly deployed content, but nothing enforces that the CDN URL serves the new build at the time the gate runs.

Three gaps exist in the current implementation (`packages/os/site-kernel-handoff/src/leitstand/leitstand-commands.ts`):

1. **Silent purge skip**: `runPurgeStep` logs `logger.warn` and returns when `CLOUDFLARE_ZONE_ID` is not set. The pipeline continues to the Axiom gate without any CDN cache invalidation.
2. **Purge API failure non-fatal**: If the Cloudflare purge API returns a non-200 response, `runPurgeStep` logs a warning and returns. The pipeline continues.
3. **No freshness verification**: After purge + sleep, the pipeline does not verify that the CDN URL actually serves the new `build-identity.json`. The Axiom gate runs against a URL that may still return stale content.

The combination of these gaps means the Axiom gate can produce false positives (verifying stale content) or false negatives (missing real violations in the new build). The operator cannot trust the gate result without manually verifying CDN freshness.

## Decision

`leitstand.dev-deploy` treats CDN cache purge as a mandatory step: missing `CLOUDFLARE_ZONE_ID`, purge API failure, and post-purge freshness mismatch are all fatal errors that stop the pipeline before the Axiom gate runs. After purge + sleep, the pipeline fetches `/.well-known/build-identity.json` from the CDN URL and compares `distTreeHash` against the local build-identity. If the hash does not match, the pipeline fails with a freshness error and the Axiom gate is not invoked.

## Architectural fit

- **DNA-49 (Fleet propagation / Leitstand)**: This RFC extends DNA-49 by adding a freshness guarantee to the dev deploy flow. `leitstand.propagate` and `leitstand.promote` already verify `build-identity.json` (RFC-0634); this RFC closes the gap for `leitstand.dev-deploy`.
- **RFC-0628 (dev deploy with Axiom gate)**: This RFC amends RFC-0628 by making CDN purge mandatory and adding a post-purge freshness check. The Axiom gate target remains the CDN URL — no Worker URL fallback.
- **RFC-0634 (build-identity verification)**: This RFC reuses the same `build-identity.json` → `distTreeHash` comparison pattern already established for propagate/promote, applying it to the dev channel.
- **Site OS operator model**: The change is localized to `leitstand.dev-deploy` in `packages/os/site-kernel-handoff`. No new commands, no new packages, no pipeline changes outside the dev deploy flow.

## Design

### CLI surface

No CLI surface changes. `leitstand.dev-deploy` is invoked the same way:

```sh
pnpm exec site-kernel run leitstand.dev-deploy --system warpgogol-com
pnpm exec site-kernel run leitstand.dev-deploy --system warpgogol-com --json
```

The `--json` output gains a `freshness` field in `data.axiom`:

```json
{
  "data": {
    "axiom": {
      "status": "pass|fail|not-run",
      "errors": 0,
      "warnings": 46,
      "exitCode": 0,
      "freshness": {
        "verified": true,
        "cdnDistTreeHash": "abc123...",
        "localDistTreeHash": "abc123..."
      }
    }
  }
}
```

When freshness check fails, `axiom.status` is `"not-run"` and `axiom.freshness.verified` is `false`.

### TypeScript contracts

The existing `PurgeResult` type from `@warpgogol/ontology/operations` is unchanged:

```ts
// Existing — NOT modified by this RFC
export const purgeResultSchema = z.object({
  success: z.boolean(),
  purgedUrls: z.number(),
  error: z.string().optional(),
});
```

The `fatal` behavior is a caller-side decision in `runLeitstandDevDeploy`, not a schema field. The caller checks `purgeResult.success === false` and treats it as fatal for `leitstand.dev-deploy` only. `leitstand.propagate` and `leitstand.promote` continue to treat purge failures as non-blocking warnings — their behavior is unchanged.

New types added to `DevDeployResult`:

```ts
interface FreshnessResult {
  verified: boolean;
  cdnDistTreeHash: string | null;
  localDistTreeHash: string;
  error?: string;
}

// DevDeployResult.axiom gains freshness field:
interface DevDeployResult {
  // ... existing fields preserved ...
  axiom: {
    status: "pass" | "fail" | "not-run";
    errors: number;
    warnings: number;
    exitCode: number;
    freshness: FreshnessResult;  // NEW
  };
}
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/os/site-kernel-handoff/src/leitstand/leitstand-commands.ts` | `runLeitstandDevDeploy` — adapter check before purge, purge fatal, freshness check; `runPurgeStep` unchanged |
| `packages/os/site-kernel-handoff/AGENTS.md` | Leitstand section updated: `leitstand.dev-deploy` purge is fatal, freshness check added |
| `docs/architecture-dna.md` | DNA-49 prose updated: `leitstand.dev-deploy` verifies CDN freshness before Axiom gate |
| `missions/{mission}/evidence/axiom/**` | Axiom evidence — only written when freshness verified |

### Output format

When purge fails (fatal):

```json
{
  "data": {
    "deployState": "succeeded",
    "axiom": {
      "status": "not-run",
      "errors": 0,
      "warnings": 0,
      "exitCode": 0,
      "freshness": {
        "verified": false,
        "cdnDistTreeHash": null,
        "localDistTreeHash": "abc123...",
        "error": "CDN purge failed: CLOUDFLARE_ZONE_ID not set"
      }
    }
  },
  "exitCode": 1,
  "summary": "[leitstand.dev-deploy] warpgogol-com: CDN purge failed — Axiom gate not run"
}
```

When freshness check fails (hash mismatch):

```json
{
  "data": {
    "deployState": "succeeded",
    "axiom": {
      "status": "not-run",
      "errors": 0,
      "warnings": 0,
      "exitCode": 0,
      "freshness": {
        "verified": false,
        "cdnDistTreeHash": "def456...",
        "localDistTreeHash": "abc123...",
        "error": "CDN serving stale content: distTreeHash mismatch"
      }
    }
  },
  "exitCode": 1,
  "summary": "[leitstand.dev-deploy] warpgogol-com: freshness check failed — Axiom gate not run"
}
```

### Failure modes

| Failure | Behavior |
| --- | --- |
| Null adapter (`adapter: "null"`) | Purge and freshness check skipped — no CDN to invalidate. Normal flow: Axiom gate runs. |
| `CLOUDFLARE_ZONE_ID` not set (cloudflare-workers adapter) | Fatal: `exitCode: 1`, Axiom not run, `freshness.error` explains missing env var |
| Purge API non-200 (cloudflare-workers adapter) | Fatal: `exitCode: 1`, Axiom not run, `freshness.error` includes API response |
| Freshness fetch returns non-200 | Fatal: `exitCode: 1`, Axiom not run, `freshness.error` includes HTTP status |
| Freshness hash mismatch | Fatal: `exitCode: 1`, Axiom not run, `freshness.error` explains stale CDN |
| Freshness fetch network error | Fatal: `exitCode: 1`, Axiom not run, `freshness.error` includes fetch error |
| Purge success + freshness verified | Normal flow: Axiom gate runs, result depends on gate outcome |

All fatal modes produce `axiom.status: "not-run"` and `exitCode: 1`. The `--json` output includes `freshness` details for programmatic diagnosis. Pretty output logs the error message via `logger.error`.

## Rollout

- **Default behavior**: Fail-hard from first introduction. No grace period, no opt-in flag. The first `leitstand.dev-deploy` after implementation either succeeds with freshness verified or fails with a clear error.
- **Null adapter**: `runLeitstandDevDeploy` checks `dep.adapter` before calling `runPurgeStep`. When the adapter is `null`, purge and freshness check are skipped entirely — there is no CDN to invalidate. The Axiom gate runs normally. This avoids breaking null-adapter dev deploys (used in tests and systems without a real deployment target).
- **Existing apps**: No migration needed — `leitstand.dev-deploy` already requires `CLOUDFLARE_ZONE_ID` in the env file for `cloudflare-workers` adapter.
- **AGENTS.md update**: `packages/os/site-kernel-handoff/AGENTS.md` Leitstand section must be updated: the current text states "Purge failures are non-blocking warnings" — this RFC makes purge failures fatal for `leitstand.dev-deploy` only. `leitstand.propagate` and `leitstand.promote` purge behavior remains non-blocking.
- **DNA-49 prose update**: `docs/architecture-dna.md` DNA-49 prose must be updated to reflect that `leitstand.dev-deploy` verifies CDN freshness (purge + `build-identity.json` `distTreeHash` comparison) before running the Axiom gate.
- **RFC-0628 amendedBy**: The implementation must add `RFC-0649` to RFC-0628's `amendedBy` frontmatter field (V-19 warning resolution).
- **New apps**: Automatically compliant — the freshness check runs as part of `leitstand.dev-deploy` with no additional configuration.
- **Deprecation**: None — this RFC amends RFC-0628 behavior, no command is removed.
- **Pipeline integration**: No pipeline changes. The freshness check runs inside `leitstand.dev-deploy` between purge and Axiom gate, not as a separate pipeline step.

## Alternatives considered

1. **Worker URL fallback for Axiom gate**: Run Axiom against the direct Worker URL (`*.workers.dev`) when CDN purge fails, so the gate always verifies fresh content. Rejected because it hides CDN configuration problems — the operator would see passing Axiom results while the CDN serves stale content to real visitors. Fatal failure makes CDN misconfiguration visible.

2. **Retry freshness check**: Fetch `build-identity.json` with retry (3 attempts, 5s interval) to cover CDN edge propagation delay. Rejected for dev channel — the existing 6s sleep after purge is sufficient for dev iterations. Retry adds ~15s to every deploy for a rare edge case.

3. **`--force` bypass for freshness check**: Allow operators to skip freshness check with `--force` for debugging. Rejected because it creates a path to run Axiom on stale content, which is the exact problem this RFC solves. If CDN purge is broken, the correct response is to fix the CDN configuration, not to bypass the safety check.

## Risks

- **CDN propagation delay**: Cloudflare edge cache propagation can take longer than the 6s sleep in rare cases. The single freshness fetch may fail even though the purge succeeded. Risk: false-negative on freshness check, pipeline fails. Mitigation: operator re-runs `leitstand.dev-deploy` after a brief wait.
- **Cloudflare API downtime**: Purge API may be temporarily unavailable. Risk: all dev deploys fail during Cloudflare outage. Mitigation: operator waits for Cloudflare recovery — this is correct behavior because deploying without verification is worse than not deploying.
- **Agent misinterpretation**: Agents may attempt to bypass freshness check by setting `CLOUDFLARE_ZONE_ID` to a dummy value. Risk: purge API call fails with auth error, which is still fatal — the dummy value does not bypass the check.
- **Performance impact**: One additional HTTP fetch (`build-identity.json` from CDN) adds ~200ms to the dev deploy pipeline. Negligible compared to the ~8min build + ~8min Axiom gate.

## Acceptance criteria

- [ ] `runLeitstandDevDeploy` checks `purgeResult.success === false` and stops pipeline with `exitCode: 1` and `axiom.status: "not-run"` when purge fails for `cloudflare-workers` adapter (evidence: `leitstand-commands.ts:runLeitstandDevDeploy` early return)
- [ ] `runLeitstandDevDeploy` skips purge and freshness check for `null` adapter — Axiom gate runs normally (evidence: `leitstand-commands.ts:runLeitstandDevDeploy` adapter check)
- [ ] After purge + sleep, pipeline fetches `/.well-known/build-identity.json` from CDN URL and compares `distTreeHash` against local build-identity (evidence: `leitstand-commands.ts:verifyFreshness` function)
- [ ] Freshness hash mismatch produces `exitCode: 1`, `axiom.status: "not-run"`, and `freshness.verified: false` in `--json` output (evidence: unit test `leitstand-0649-freshness-mismatch.test.ts`)
- [ ] Missing `CLOUDFLARE_ZONE_ID` produces `exitCode: 1`, `axiom.status: "not-run"`, and descriptive `freshness.error` (evidence: unit test `leitstand-0649-missing-zone-id.test.ts`)
- [ ] `--json` output includes `freshness` object with `verified`, `cdnDistTreeHash`, `localDistTreeHash`, and optional `error` fields (evidence: `DevDeployResult` type definition)
- [ ] `rfc.validate` passes on this file before merging

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- Agents MUST NOT add a `--force` bypass for the freshness check — the check is mandatory by design.
- Agents MUST NOT add a Worker URL fallback for the Axiom gate — the gate always uses the CDN URL.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N" instead of working around it (RFC-0334).
- The `verifyFreshness` function MUST use a single HTTP fetch without retry — retry is explicitly rejected by this RFC.
- The `runPurgeStep` function is NOT modified — the `fatal` behavior is a caller-side decision in `runLeitstandDevDeploy` that checks `purgeResult.success === false`. `PurgeResult` in `@warpgogol/ontology/operations` is unchanged.
- `runLeitstandDevDeploy` MUST check `dep.adapter` before calling `runPurgeStep` — skip purge and freshness check for `null` adapter.
