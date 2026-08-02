---
id: RFC-0647
title: "Add Playwright Chromium pre-flight check to build.post pipeline"
status: draft
# kind options: architecture | contract | command | policy | deprecation
kind: command
# scope options: app | workspace
scope: workspace
owners:
  - architecture
# Set by the deciding human together with the status change (RFC-0335).
# Draft scaffolds must keep this empty; do not prefill a default identity.
# Format: human:<handle> (agent:<id> reserved — see RFC-0335).
# Default reviewer when none is specified by the operator: human:andrii-syrokomskyi
reviewers: []
createdAt: 2026-08-02
updatedAt: 2026-08-02
enhancedAt: 2026-08-02
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0630
  - RFC-0646
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Not required for command/policy kind RFCs.
satisfies: []
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
    - playwright.chromium.ensure
  added:
    - playwright.chromium.ensure
  changed: []
  removed: []
appsImpacted: []
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - "@warpgogol/site-kernel-checks"
  - "@warpgogol/site-kernel-handoff"
successSignals:
  - "build.post pipeline includes playwright.chromium.ensure step before print.pdf.generate."
  - "playwright.chromium.ensure auto-installs Chromium when missing and skips when already present."
  - "mission.validate completes without print.pdf.generate failing on missing Chromium."
  - "ensurePlaywrightChromium logic is shared between mission.materialize, mission.check, and build.post via the new command."
nonGoals:
  - "Do not change print.pdf.generate error handling — it still fails if Chromium cannot be launched after ensure."
  - "Do not remove the pre-flight check from mission.check (RFC-0630) — it remains for direct mission.check invocations."
  - "Do not auto-install Chromium in CI environments where PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD is set — the ensure command respects this env var."
  - "Do not add the ensure step to build.prepare — it is only needed before Playwright-dependent steps in build.post."
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

# RFC-0647: Add Playwright Chromium pre-flight check to build.post pipeline

## Context

Mission `warpgogol-com-m000024` (closed 2026-08-02) encountered a `print.pdf.generate` failure during `mission.validate` → `build.post`. The error: `Executable doesn't exist at ~/.cache/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-linux64/chrome-headless-shell`. Playwright npm package was installed, but the Chromium browser binary (~115 MB) was not — it requires a separate `pnpm exec playwright install chromium` command.

RFC-0630 added a pre-flight Chromium check with auto-install to `mission.check` (`packages/os/site-kernel-checks/src/mission-check.ts:108-147`). `mission.materialize` has `ensurePlaywrightChromium` (`packages/os/site-kernel-handoff/src/mission/mission-materialize.ts:563-597`). However, `build.post` pipeline — which runs `print.pdf.generate` and `independent-qa` (both Playwright-dependent) — has no pre-flight check. When `mission.validate` runs `build.post` without a prior `mission.materialize` or `mission.check` invocation, Chromium may be missing.

## Problem

`print.pdf.generate` (`packages/os/site-kernel-checks/src/print-pdf.ts:218-219`) launches Playwright Chromium directly via `playwright.chromium.launch({ headless: true })`. If the browser binary is not installed, the launch fails with `Executable doesn't exist at ...`. The catch block (`print-pdf.ts:268-279`) returns an error with a hint message but does not attempt auto-install.

`independent-qa` (`packages/os/site-kernel-checks/src/independent-qa.ts`) also uses Playwright and has the same dependency.

The gap: `mission.check` and `mission.materialize` have pre-flight Chromium checks, but `build.post` does not. When `mission.validate` is run directly (without a preceding `mission.materialize`), `build.post` fails on missing Chromium. This is not a transient failure — it is a missing dependency that can be auto-installed.

## Decision

The kernel gains a `playwright.chromium.ensure` command that checks for Playwright Chromium and auto-installs it if missing. The `build.post` pipeline gains a `playwright.chromium.ensure` step before `print.pdf.generate`. The `ensurePlaywrightChromium` logic from `mission-materialize.ts` is extracted into the new command handler and reused by both `mission.materialize` and `build.post`.

## Architectural fit

- **No DNA invariant extended** — This RFC is an operational resilience fix, not a state-mutation primitive. DNA-51 (Werkstatt consistency primitives) covers lock/idempotency/atomic staging for registry/mission/release/bordbuch state mutations; Chromium dependency management is outside that scope.
- **RFC-0630 (mission.check pre-flight)** — The `runPreflightCheck` pattern in `mission-check.ts` is the model for the new `playwright.chromium.ensure` command. The new command generalizes it for pipeline use.
- **RFC-0646 (bordbuch.commit retry)** — Companion RFC addressing a different pipeline resilience gap. Both RFCs improve mission workflow reliability.
- **Site OS operator model** — `playwright.chromium.ensure` is an internal pipeline step, not intended for direct operator use. It is registered as a kernel command for composability and visibility in `command.manifest.generate`.

## Design

### CLI surface

The new command is an internal pipeline step, but can be invoked directly:

```sh
pnpm exec site-kernel run playwright.chromium.ensure
```

No site-specific flags. Scope: `workspace`. The command operates on the global Playwright cache (`~/.cache/ms-playwright/`), not on any specific site. No `--json` output beyond the standard kernel result envelope.

### TypeScript contracts

```ts
// packages/os/site-kernel-checks/src/playwright-chromium-ensure.ts

export interface PlaywrightChromiumEnsureResult {
  installed: boolean;
  chromiumRevision: string | null;
  skipped: boolean;
}

export async function runPlaywrightChromiumEnsure(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<PlaywrightChromiumEnsureResult>>;
```

The `ensurePlaywrightChromium` function from `mission-materialize.ts` is extracted into this module and reused. `mission.materialize` calls `runPlaywrightChromiumEnsure` wrapped in a try/catch to preserve its existing non-fatal behavior (logs the error and continues). `build.post` calls it as a pipeline step — failure is fatal (exit 1).

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/os/site-kernel-checks/src/playwright-chromium-ensure.ts` | New command handler |
| `packages/os/site-kernel-checks/src/pipelines/build-post.ts` | `playwright.chromium.ensure` step added before `print.pdf.generate` |
| `packages/os/site-kernel-handoff/src/mission/mission-materialize.ts` | `ensurePlaywrightChromium` replaced with call to `runPlaywrightChromiumEnsure` (wrapped in try/catch to preserve non-fatal behavior) |
| `packages/os/site-kernel-checks/src/mission-check.ts` | `runPreflightCheck` may delegate to shared logic (optional refactor) |

### Output format

```json
{
  "command": "playwright.chromium.ensure",
  "data": {
    "installed": true,
    "chromiumRevision": "151.0.7922.34",
    "skipped": false
  },
  "summary": "[playwright.chromium.ensure] Chromium installed (151.0.7922.34)"
}
```

When Chromium is already present: `{ "installed": false, "chromiumRevision": "...", "skipped": true }`.

### Failure modes

| Failure | Behavior |
| --- | --- |
| Chromium not installed | Auto-install via `pnpm exec playwright install chromium`, then verify launch. If install succeeds, step passes. |
| Chromium already installed | Skip install, verify launch, step passes. |
| Auto-install fails (network, permissions) | Step fails with exit code 1 and message: `Playwright Chromium install failed: <error>. Run 'pnpm exec playwright install chromium' manually.` |
| Launch fails after install | Step fails with exit code 1 and message: `Chromium launch failed after install: <error>` |
| `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD` env var set | Step skips auto-install and fails if Chromium is missing (respects CI environment opt-out). |

**Note on behavioral upgrade:** The existing `ensurePlaywrightChromium` in `mission-materialize.ts` checks only for the presence of a `chromium*` directory in `~/.cache/ms-playwright/` — it does not launch the browser. The new command upgrades this to a launch verification (matching the `mission.check` pre-flight pattern), catching corrupt or partial installations that pass the directory check but fail on launch.

**Note on non-fatal vs fatal semantics:** When called from `mission.materialize`, the command is wrapped in a try/catch that logs the error and continues (preserving existing non-fatal behavior). When called from the `build.post` pipeline step, failure is fatal (exit 1) — the pipeline stops because downstream steps (`print.pdf.generate`, `qa.independent.run`) require Chromium.

## Rollout

- **Default behavior**: `build.post` pipeline includes `playwright.chromium.ensure` as the first step, before any Playwright-dependent step. No opt-in flag.
- **Existing apps**: No migration needed — the ensure step is transparent. Apps that previously failed on missing Chromium will now auto-install.
- **New apps**: Automatically benefit from the pre-flight check.
- **CI environments**: The ensure command respects `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD` — if set, it skips auto-install and fails only if Chromium is actually missing (not just because the env var is set).
- **Pipeline integration**: `playwright.chromium.ensure` is added as step 0 in `SITES_BUILD_POST_PIPELINE` before `passport.emit`. It runs unconditionally — even if `print.pdf.generate` is disabled for a site, the ensure step is cheap (skip when Chromium is present).
- **appsImpacted**: Left empty because the `build.post` pipeline runs for all sites. The ensure step is transparent — sites without Playwright-dependent features pay only the skip cost.
- **Unit tests**: Add tests for `runPlaywrightChromiumEnsure` (skip when present, install when missing, fail on install error, respect env var).

## Alternatives considered

- **Inline auto-install in `print.pdf.generate`**: Catch the launch error and auto-install inside the print.pdf.generate handler. Rejected because `independent-qa` has the same dependency — duplicating auto-install logic in each Playwright-dependent command is not maintainable. A shared ensure command is cleaner.
- **Pre-flight in `build.prepare`**: Add the ensure step at the end of `build.prepare` instead of `build.post`. Rejected because `build.prepare` runs codegen steps that do not need Playwright. Adding it to `build.post` keeps it close to the Playwright-dependent steps.
- **Keep `mission.materialize` inline `ensurePlaywrightChromium`**: Do not extract to a command, just call the function from the pipeline. Rejected because a registered command is visible in `command.manifest.generate`, composable in pipelines, and testable in isolation. The inline function in `mission-materialize.ts` is not reusable by `build.post` without importing across package boundaries.

## Risks

- **Network dependency**: Auto-install downloads ~115 MB from Playwright's CDN. In offline or restricted-network environments, this fails. The error message includes the manual install command.
- **Pipeline latency**: First run with missing Chromium adds ~30-60s for download. Subsequent runs skip (Chromium already present). Acceptable because the alternative is a hard pipeline failure.
- **CI environment conflict**: Some CI setups pre-install Chromium via their own mechanism. The `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD` env var respects this — the ensure command skips auto-install and only verifies launch.
- **Agent misinterpretation**: Agents might add `playwright.chromium.ensure` to other pipelines. The RFC scopes it to `build.post` only; other pipelines (e.g. `build.prepare`) do not need it.
- **Concurrent builds**: Two simultaneous `build.post` runs may both trigger `pnpm exec playwright install chromium`. `playwright install` is idempotent — concurrent installs do not corrupt the cache. Minor wasted I/O in the rare concurrent case; not worth a lock file.

## Acceptance criteria

- [ ] `playwright.chromium.ensure` command registered in `@warpgogol/site-kernel-checks` module
- [ ] `ensurePlaywrightChromium` logic extracted from `mission-materialize.ts` into the new `playwright-chromium-ensure.ts` module
- [ ] `mission.materialize` delegates to `runPlaywrightChromiumEnsure` instead of inline function
- [ ] `build.post` pipeline includes `playwright.chromium.ensure` as first step
- [ ] Command skips when Chromium is already present (idempotent)
- [ ] Command auto-installs when Chromium is missing and `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD` is not set
- [ ] Command respects `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD` env var (skips auto-install, fails if missing)
- [ ] Unit tests cover: skip when present, install when missing, fail on install error, env var respect
- [ ] `mission.validate` completes without `print.pdf.generate` failing on missing Chromium
- [ ] `command.manifest.generate` updated with new command
- [ ] `rfc.validate` passes on this file before merging

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST extract `ensurePlaywrightChromium` from `mission-materialize.ts` into the new `playwright-chromium-ensure.ts` module — do not duplicate the logic.
- Agents MUST NOT add `playwright.chromium.ensure` to pipelines other than `build.post` without explicit justification.
- Agents MUST run `command.manifest.generate` after registering the new command.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N" instead of working around it (RFC-0334).
