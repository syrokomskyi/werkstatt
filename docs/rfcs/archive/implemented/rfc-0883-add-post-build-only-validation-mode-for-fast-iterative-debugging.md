---
id: RFC-0883
title: "Add post-build-only validation mode for fast iterative debugging"
status: implemented
kind: command
scope: workspace
owners:
  - architecture
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-08-19
updatedAt: 2026-08-19
enhancedAt: 2026-08-19
implementedAt: 2026-08-19
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0830
  - RFC-0832
  - RFC-0836
  - RFC-0880
  - RFC-0881
satisfies: []
versionBump: patch
commands:
  proposed: []
  added:
    - validate.postbuild
  changed: []
  removed: []
appsImpacted: []
packagesImpacted:
  - packages/werkstatt
successSignals:
  - "Post-build validators can be re-run on existing dist/ in seconds, without a full Astro rebuild"
  - "Iterative debugging of IMG-DELIVERY-04, A11Y-LIN-01, and other post-build rules takes seconds instead of ~4 minutes"
nonGoals:
  - "Do not skip build.check or build.prepare — those run separately and are not targeted by this RFC"
  - "Do not cache or skip individual post-build validators — each runs fresh on the existing dist"
  - "Do not replace mission.validate — this is a debugging tool, not a deployment gate"
---

# RFC-0883: Add post-build-only validation mode for fast iterative debugging

## Context

The kernel already provides `sites-check.postbuild` (app-scoped, `--site`), which runs `SITES_CHECK_POSTBUILD_PIPELINE` on an existing dist/ with a dist/ existence guard (RFC-0085). However, during mission work the operator has a `--mission` id, not a `--site` id, and `sites-check.postbuild` does not accept `--mission`. Additionally, there is no way to skip slow Playwright-based steps (`mobile.layout.check` at 53s) when debugging fast validators.

During mission `warpgogol-com-m000077`, iterative debugging of post-build validation failures (`IMG-DELIVERY-04`, `A11Y-LIN-01`) required running the full `mission.validate` pipeline each time. Each cycle took ~4 minutes:

- build.prepare: ~30 seconds (75 steps)
- build.check: ~60 seconds (205 steps, many cached)
- Astro build: ~30 seconds
- build.post: ~2 minutes (46 steps, including `mobile.layout.check` at 53s and `print.pdf.generate` at 1m34s)

The post-build validators themselves (`image.delivery.validate`, `a11y.label-in-name.validate`, `csp.origins.validate`, etc.) run in <2 seconds combined. The remaining ~3m58s is spent on steps that don't change between iterations when only a component source file or config file is modified.

## Problem

**Unprotected invariant**: There is no way to re-run only the post-build validators on an existing `dist/` directory. The `mission.validate` command always runs the full pipeline (build.prepare → build.check → Astro build → build.post).

**What relies on manual discipline**: Developers and agents must run the full pipeline to check if a post-build validation fix works, even when the fix only affects a post-build validator's input (e.g. editing `image-delivery.config.yaml` or fixing an `aria-label` in a component that is already built).

**Known failure mode**: Mission `warpgogol-com-m000077` required 5 full validate cycles (~20 minutes total) to resolve all post-build validation issues. Each cycle re-ran `print.pdf.generate` (1m34s) and `mobile.layout.check` (53s) even though the fixes didn't affect PDFs or mobile layout.

## Decision

The kernel gains a `validate.postbuild` command that runs only the `SITES_CHECK_POSTBUILD_PIPELINE` steps on an existing `dist/` directory, skipping build.prepare, build.check, and Astro build.

## Architectural fit

- **Site OS operator model**: `validate.postbuild` is a site-scoped command that requires `--site` or `--mission`. It resolves the workpiece path, locates the existing `dist/client/` directory, and runs the post-build pipeline steps directly.
- **Pipeline placement**: Does not integrate into any standard pipeline. It is a standalone debugging command, invoked manually by developers or agents.
- **Scaling Playbook**: Applies uniformly across all sites — every site has a `SITES_CHECK_POSTBUILD_PIPELINE` that can be re-run on existing dist.

## Design

### CLI surface

```sh
pnpm exec werkstatt run validate.postbuild --mission warpgogol-com-m000077
pnpm exec werkstatt run validate.postbuild --site warpgogol-com
```

Scope: workspace. Requires either `--mission` or `--site` to resolve the workpiece. If `dist/client/` does not exist, the command fails with exit code 1 and a clear error message: "No dist/ found — run mission.validate first to build the site."

### TypeScript contracts

```ts
interface ValidatePostbuildOptions {
  mission?: string;
  site?: string;
}

interface ValidatePostbuildResult {
  command: "validate.postbuild";
  status: "pass" | "fail";
  steps: Array<{
    name: string;
    status: "ok" | "fail" | "skip" | "warn";
    durationMs: number;
  }>;
  totalDurationMs: number;
  distPath: string;
}
```

### Execution model

1. Resolve workpiece path from `--mission` or `--site`.
2. Check that `dist/client/` exists. If not, fail with exit code 1.
3. Resolve the site's kernel registry and retrieve the `SITES_CHECK_POSTBUILD_PIPELINE` steps (same pipeline used by `sites-check.postbuild` and embedded in `build.post`).
4. If `--skip-slow` is set, filter out the slow steps (see below).
5. Run the remaining steps in order via `executeKernelPipeline`, passing `siteWorkspace` to bypass discovery when `--mission` is used.

`SITES_CHECK_POSTBUILD_PIPELINE` already contains only validators — generation and mutation steps (`dist.generated-marker.strip`, `text.normalize.apply`, `behavior.snapshot.generate`, `print.pdf.generate`, etc.) are in `SITES_BUILD_POST_PIPELINE`, not in this pipeline. No skip list is needed.

### `--skip-slow` flag

```sh
pnpm exec werkstatt run validate.postbuild --mission warpgogol-com-m000077 --skip-slow
```

Skips the following slow steps, defined as a static list in the command implementation:

| Step                      | Typical duration | Reason                                |
| ------------------------- | ---------------- | ------------------------------------- |
| `mobile.layout.check`     | ~53s             | Playwright-based geometric assertions |
| `lighthouse.budget.check` | ~10-30s          | Lighthouse audit runner               |
| `qa.independent.run`      | ~5-15s           | Playwright-based page probes          |

Useful when debugging specific validators like `image.delivery.validate` or `a11y.label-in-name.validate` that run in <2 seconds.

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/werkstatt/src/mission/validate-postbuild.ts` | New command implementation |
| `packages/werkstatt/src/mission/mission.module.ts` | Command registration |
| `{workpiece}/dist/client/` | Read by validators — must exist from a prior build |

### Output format

```json
{
  "command": "validate.postbuild",
  "status": "pass",
  "distPath": "/path/to/workpiece/dist/client",
  "steps": [
    { "name": "dist.html-structure.validate", "status": "ok", "durationMs": 120 },
    { "name": "image.delivery.validate", "status": "ok", "durationMs": 850 },
    { "name": "a11y.label-in-name.validate", "status": "ok", "durationMs": 95 }
  ],
  "totalDurationMs": 4200
}
```

### Failure modes

- **No dist/ found**: Exit code 1. Error message: "No dist/ found — run mission.validate first to build the site." Does not attempt to build.
- **Stale dist/**: The command always prints a warning: "dist/ may be stale — run mission.validate for a full check." Staleness is not detected programmatically (no timestamp comparison); the warning is unconditional because the command cannot know whether source files changed since the last build.
- **Step failure**: Exit code 1. The command stops at the first failing step and reports the error, same as `build.post`.
- **Concurrent execution**: Running `validate.postbuild` twice on the same dist/ simultaneously is safe — all validators are read-only. No file locking needed.

## Rollout

- **Default behavior**: The command is available immediately. No flags or config needed.
- **Existing apps**: No migration — the command reads existing dist/.
- **Pipeline integration**: None. This is a standalone debugging command, not part of any pipeline. `mission.validate` remains the authoritative validation command.
- **Agent guidance**: Agents debugging post-build validation failures should use `validate.postbuild` for rapid iteration, then run `mission.validate` as the final confirmation before proceeding to reconcile/close.

## Alternatives considered

- **Extend `sites-check.postbuild` with `--mission` and `--skip-slow` flags**: `sites-check.postbuild` already runs `SITES_CHECK_POSTBUILD_PIPELINE` on existing dist/ (RFC-0085). Rejected because `sites-check.postbuild` is `scope: "app"` (requires `--site`, uses site discovery), while `--mission` is a workspace-level concept that follows the `mission.validate` pattern. Adding `--mission` to an app-scoped command would violate the scope contract. A separate workspace-scoped command keeps the resolution path clean.
- **`--skip-build` flag on `mission.validate`**: Rejected — `mission.validate` is the authoritative validation command and should always run the full pipeline. Mixing modes creates confusion about what was actually validated.
- **Cache dist/ and diff**: Rejected — too complex for the problem. Re-running validators on existing dist is simpler and sufficient.
- **Run individual validators by name**: Rejected — developers would need to know which validators to run. The post-build pipeline is a curated set; running all of them (minus slow ones) is more robust.

## Risks

- **False confidence**: Developers might skip `mission.validate` and rely only on `validate.postbuild`. Mitigated by the warning message and by the fact that `validate.postbuild` does not run build.check or build.prepare.
- **Stale dist/**: If source files change but dist/ is not rebuilt, validators may pass or fail incorrectly. The warning message addresses this.
- **Maintenance burden**: Low — the command reuses the existing pipeline runner and step definitions. The only new logic is the `--skip-slow` static list and dist/ existence check.

## Acceptance criteria

- [x] `validate.postbuild` command registered with `--mission` and `--site` flags (evidence: packages/werkstatt/src/mission/mission.module.ts:433-450)
- [x] Command fails with clear error if `dist/` does not exist (evidence: packages/werkstatt/src/mission/validate-postbuild.ts:82-94)
- [x] Command runs all validators from `SITES_CHECK_POSTBUILD_PIPELINE` (which already contains only validators — no skip list needed) (evidence: packages/werkstatt/src/mission/validate-postbuild.ts:103-121)
- [x] `--skip-slow` flag skips `mobile.layout.check`, `lighthouse.budget.check`, and `qa.independent.run` (evidence: packages/werkstatt/src/mission/validate-postbuild.ts:38-42)
- [x] `--json` output format documented and stable (evidence: packages/werkstatt/src/mission/validate-postbuild.ts:33-41 — ValidatePostbuildData interface)
- [x] Warning printed when dist/ may be stale (evidence: packages/werkstatt/src/mission/validate-postbuild.ts:97)
- [x] Unit tests cover: dist/ exists → run validators, dist/ missing → error, --skip-slow → slow steps skipped (evidence: packages/werkstatt/src/mission/validate-postbuild.test.ts:1-297)
- [x] `rfc.validate` passes on this file (evidence: rfc.validate --id RFC-0883 → OK)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents debugging post-build validation failures SHOULD use `validate.postbuild --skip-slow` for rapid iteration, then run `mission.validate` as final confirmation.
- Agents MUST NOT use `validate.postbuild` as a substitute for `mission.validate` before deployment. The full pipeline is the authoritative validation.
