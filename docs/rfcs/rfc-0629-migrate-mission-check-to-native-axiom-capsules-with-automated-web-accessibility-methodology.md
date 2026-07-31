---
id: RFC-0629
title: "Migrate mission.check to native axiom capsules with automated-web-accessibility methodology"
status: draft
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
reviewers: []
createdAt: 2026-07-31
updatedAt: 2026-07-31
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - DNA-48
  - DNA-49
  - RFC-0012
  - RFC-0627
  - RFC-0628
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
  proposed: []
  added: []
  changed:
    - mission.check
  removed: []
appsImpacted:
  - warpgogol-com
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - "@warpgogol/site-kernel-checks"
  - "@syrokomskyi/axiom-capture"
  - "@syrokomskyi/axiom-study"
  - "@syrokomskyi/axiom-methodology"
successSignals:
  - "mission.check --external-preview captures all pages via PlaywrightEvidenceDriver without CSP errors"
  - "Evidence capsule is a native StagedCapsule with CapabilityManifest and ClosureDecision"
  - "Axiom gate passes when closureDecision.satisfied === true and zero error-severity findings"
  - "No manual Playwright or CDN axe-core injection in mission-check.ts"
nonGoals:
  - "Does not add new methodologies beyond automated-web-accessibility"
  - "Does not change leitstand.dev-deploy command structure"
  - "Does not change the cloudflare-workers deployment adapter"
  - "Does not add axiom-runtime as a kernel module (mission.check stays in site-kernel-checks)"
  - "Does not preserve the local build+static-server mode (removed in favor of external-preview only)"
  - "Does not change the evidence post-processing in leitstand.dev-deploy (commitSha injection)"
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

# RFC-0629: Migrate mission.check to native axiom capsules with automated-web-accessibility methodology

## Context

RFC-0012 introduced `mission.check` as a one-shot Axiom accessibility check. The implementation in `packages/os/site-kernel-checks/src/mission-check.ts` manually manages Playwright browser lifecycle, injects axe-core from a CDN (`https://unpkg.com/axe-core@4.12.1/axe.min.js`), discovers pages via hand-rolled sitemap.xml parsing, and writes evidence in an ad-hoc `evidence-capsule.yaml` + `findings.yaml` format.

The Axiom platform (`pipelines/packages/axiom/`) has since matured into a full evidence-capture system with native capsules (`StagedCapsule`, `CapabilityManifest`, `ClosureDecision`), a `PlaywrightEvidenceDriver` that uses `bypassCSP: true` and `@axe-core/playwright` (local bundle, no CDN), a Crawlee-based discovery executor, and a formal methodology registry including `automated-web-accessibility`.

RFC-0627 and RFC-0628 established the dev deployment channel with an Axiom verification gate. `leitstand.dev-deploy` calls `mission.check --external-preview --base-url <dev-url>` after deploying to the dev channel. During the first dev-deploy cycle, three issues surfaced in `mission-check.ts`:

1. **CSP blocking**: Deployed Cloudflare Workers enforce strict Content-Security-Policy headers that block axe-core injection from CDN. A workaround using `page.route()` to strip CSP headers caused `TargetClosedError` crashes when intercepting non-document resources.
2. **Double browser launch**: `PlaywrightCaptureAdapter` launches one browser for page capture, then `runAxeInBrowser` launches a second browser for axe-core evaluation — wasteful and fragile.
3. **Playwright version mismatch**: `@syrokomskyi/axiom-capture` (linked from `pipelines/`) depends on `playwright@^1.62.1` (chromium 1234), while the werkstatt monorepo uses `playwright@1.61.1` (chromium 1228). The `mission-check.ts` code imports `playwright` from the monorepo version, but `PlaywrightCaptureAdapter` imports from the axiom-capture version, causing browser binary not-found errors.

## Problem

`mission-check.ts` reimplements functionality that axiom-capture now provides natively and correctly:

- **CSP handling**: `PlaywrightEvidenceDriver` uses `bypassCSP: true` in `browser.newContext()` (line 76 of `playwright-evidence-driver.ts`), which cleanly bypasses CSP without route interception. The manual `page.route()` workaround in `mission-check.ts` is fragile and crashes on non-document resources.
- **axe-core delivery**: `PlaywrightEvidenceDriver` imports `@axe-core/playwright` (line 132), which bundles axe-core locally — no CDN dependency, no network requirement, no CSP conflict. The current `mission-check.ts` injects axe-core from `unpkg.com` CDN, which fails on any site with a CSP.
- **Browser lifecycle**: `PlaywrightEvidenceDriver` manages a single browser instance reused across captures. The current `mission-check.ts` launches a new browser per page (double launch: capture adapter + axe runner).
- **Page discovery**: axiom-capture provides `CrawleeDiscoveryExecutor` for robust page discovery. The current `mission-check.ts` hand-rolls sitemap.xml fetching and parsing.
- **Evidence format**: axiom provides `StagedCapsule` with `CapabilityManifest`, `ClosureDecision`, `ObservationBundle`, and `StudyRun` — structured, digest-backed, and designed for long-term storage. The current `mission-check.ts` writes ad-hoc `evidence-capsule.yaml` and `findings.yaml` that are not compatible with axiom's capsule format.
- **Methodology governance**: axiom-methodology provides `createAutomatedWebAccessibilityMethodology()` with formal epistemic contracts, non-claims, and validation protocols. The current `mission-check.ts` has no methodology binding.

DNA-49 requires that `leitstand.dev-deploy` runs the Axiom verification gate via `mission.check --external-preview`. The gate cannot pass reliably when the underlying implementation is broken by CSP, browser version mismatches, and ad-hoc evidence formats.

## Decision

`mission.check` is rewritten to use native axiom components — `PlaywrightEvidenceDriver` for browser capture (with `bypassCSP` and `@axe-core/playwright`), `CrawleeDiscoveryExecutor` for page discovery, `StagedCapsule`/`ObservationBundle`/`StudyRun` for evidence format, and `createAutomatedWebAccessibilityMethodology()` for methodology binding. The local build+static-server mode is removed; `mission.check` requires `--external-preview --base-url <url>`. The gate passes when `closureDecision.satisfied === true` and zero findings have severity `high` or `critical` (mapped from axe-core violations). Evidence is written as native axiom capsule files under `missions/<missionId>/evidence/axiom/`.

## Architectural fit

- **DNA-48 (Release discipline)**: The Axiom verification gate is part of the release discipline. A reliable `mission.check` ensures the gate enforces accessibility standards before promotion.
- **DNA-49 (Fleet propagation)**: `leitstand.dev-deploy` calls `mission.check --external-preview` to verify the dev deployment. The gate must pass for propagation to proceed.
- **RFC-0012**: Defined the original `mission.check` command. This RFC replaces its implementation while keeping the command name and purpose.
- **RFC-0627/RFC-0628**: Established the dev deployment channel and the Axiom gate. RFC-0628's nonGoal "Does not change mission.check or Axiom evidence format" is superseded by this RFC.
- **Site OS operator model**: `mission.check` remains registered in `site-kernel-checks` module. No new kernel module registration. The command handler delegates to axiom-capture/study/methodology via imports.
- **Scaling Playbook**: Native axiom capsules are designed to scale from single-site dev checks to multi-site longitudinal studies. This migration aligns werkstatt with the axiom platform's scaling trajectory.

## Design

### CLI surface

```sh
# External-preview mode (required — no local mode)
pnpm exec site-kernel run mission.check --mission <missionId> --external-preview --base-url https://dev-warpgogol-com.syrokomskyi.workers.dev

# JSON output for programmatic consumption
pnpm exec site-kernel run mission.check --mission <missionId> --external-preview --base-url <url> --json
```

Flags:

- `--mission <id>` (required) — mission identifier
- `--external-preview` (required) — must be set; local mode removed
- `--base-url <url>` (required) — deployed URL to check
- `--json` — output JSON instead of pretty text

Removed flags:

- `--mode` — no longer needed (only external-preview)
- Implicit local mode (build + static server) — removed

### TypeScript contracts

```ts
import type { PlaywrightEvidenceDriver } from "@syrokomskyi/axiom-capture";
import type { StagedCapsule, LocalCaptureContract } from "@syrokomskyi/axiom-capture";
import type { ObservationBundle, StudyRun } from "@syrokomskyi/axiom-study";
import type { MethodologyPackage } from "@syrokomskyi/axiom-methodology";

interface MissionCheckInput {
  missionId: string;
  externalPreview: true;      // required: must be true
  baseUrl: string;            // required: deployed URL
  flags: { json?: boolean };
}

interface MissionCheckResult {
  command: "mission.check";
  status: "pass" | "fail";
  exitCode: 0 | 1;
  capsule: StagedCapsule;
  studyRun: StudyRun;
  findingsCount: { critical: number; high: number; medium: number; low: number; info: number };
  closureDecision: { satisfied: boolean; status: string; reason: string };
  evidenceDir: string;
  summary: string;
  nextSteps: string[];
}
```

The handler constructs a `LocalCaptureContract` with `origins: [baseUrl]`, uses `CrawleeDiscoveryExecutor` to discover pages within the origin, captures each page via `PlaywrightEvidenceDriver`, runs `runAccessibilityInstrument` from `axiom-study` to produce an `ObservationBundle`, projects findings via `findingsForObservation` from `axiom-methodology`, evaluates closure via `evaluateClosure`, and writes the `StagedCapsule` + `StudyRun` to `missions/<missionId>/evidence/axiom/`.

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/os/site-kernel-checks/src/mission-check.ts` | Rewritten handler — delegates to axiom components |
| `packages/os/site-kernel-checks/src/mission-check-converter.ts` | Removed — findings projection now via `findingsForObservation` |
| `missions/<missionId>/evidence/axiom/` | Output directory for native capsule files |
| `missions/<missionId>/evidence/axiom/staged-capsule.json` | StagedCapsule with contract, manifest, closure decision |
| `missions/<missionId>/evidence/axiom/observation-bundle.json` | ObservationBundle with axe-core observations |
| `missions/<missionId>/evidence/axiom/study-run.json` | StudyRun with findings and assessments |
| `missions/<missionId>/evidence/axiom/raw/` | Raw evidence artifacts (HTML, screenshots, axe results) |
| `packages/check-runner-node/src/playwright-adapter.ts` | Removed — replaced by `PlaywrightEvidenceDriver` |
| `packages/check-runner-node/src/browser-capture-port.ts` | Removed — replaced by axiom-capture ports |

### Output format

```json
{
  "command": "mission.check",
  "status": "pass",
  "exitCode": 0,
  "capsule": {
    "schema": "staged-website-evidence-capsule@1",
    "classification": "local-dev",
    "closureDecision": {
      "status": "seal_allowed",
      "satisfied": true,
      "reason": "All required evidence capabilities completed."
    }
  },
  "studyRun": {
    "studyRunId": "study-run_...",
    "findings": []
  },
  "findingsCount": { "critical": 0, "high": 0, "medium": 0, "low": 0, "info": 0 },
  "closureDecision": { "satisfied": true, "status": "seal_allowed", "reason": "..." },
  "evidenceDir": "missions/warpgogol-com-m000024/evidence/axiom",
  "summary": "Axiom gate: PASS. 0 findings. Closure: seal_allowed.",
  "nextSteps": ["Proceed with leitstand.propagate"]
}
```

On failure:

```json
{
  "command": "mission.check",
  "status": "fail",
  "exitCode": 1,
  "findingsCount": { "critical": 0, "high": 3, "medium": 5, "low": 2, "info": 0 },
  "closureDecision": { "satisfied": true, "status": "seal_allowed", "reason": "..." },
  "summary": "Axiom gate: FAIL. 3 high-severity findings. Closure: seal_allowed.",
  "nextSteps": ["Fix accessibility violations and re-run leitstand.dev-deploy"]
}
```

### Failure modes

- **Closure blocked**: If `closureDecision.satisfied === false`, the gate fails with exit code 1. This means required capabilities (browser, accessibility, replay) were not completed.
- **High/critical findings**: If any finding has severity `high` or `critical` (mapped from axe-core violations with impact `serious` or `critical`), the gate fails with exit code 1 regardless of closure status.
- **No pages discovered**: If Crawlee discovery finds zero pages, the gate fails with exit code 1 and a diagnostic message.
- **Browser launch failure**: If Playwright chromium is not installed, the handler exits with code 4 (same as current) and prints installation instructions.
- **Network timeout**: If the dev URL is unreachable, the handler exits with code 2 and a diagnostic message.
- **Partial closure allowed**: If `closureThresholds.allowPartial === true` in the contract and some capabilities are partial, the gate may still pass if no high/critical findings exist. This is by design for local-dev capsules.

## Rollout

- **Default behavior**: The rewritten `mission.check` replaces the current implementation in-place. No feature flag, no grace period — the current implementation is broken (CSP crashes, CDN dependency) and must be replaced.
- **`leitstand.dev-deploy` integration**: No change to `leitstand.dev-deploy` command structure. It continues to call `mission.check --external-preview --base-url <dev-url>`. The evidence post-processing (commitSha injection) in `leitstand.dev-deploy` must be updated to read the new capsule format (`staged-capsule.json` instead of `evidence-capsule.yaml`).
- **Playwright version alignment**: The werkstatt monorepo must align its `playwright` version with `@syrokomskyi/axiom-capture`'s `playwright@^1.62.1` to avoid browser binary mismatches. This is a `package.json` dependency bump, not a separate RFC.
- **Evidence directory cleanup**: Old `evidence-capsule.yaml` and `findings.yaml` files in existing mission evidence directories are not migrated — they are stale artifacts from a broken implementation. New evidence is written to `evidence/axiom/`.
- **`mission-check-converter.ts` removal**: The converter that mapped axiom observations to the old `findings.yaml` format is removed. Findings projection is now handled by `findingsForObservation` in `axiom-methodology`.
- **`check-runner-node` package**: The `playwright-adapter.ts` and `browser-capture-port.ts` files in `packages/check-runner-node/` are removed — their functionality is fully replaced by `PlaywrightEvidenceDriver` in `axiom-capture`.
- **AGENTS.md update**: `packages/os/site-kernel-checks/AGENTS.md` must be updated to reflect the new implementation and evidence format.

## Alternatives considered

1. **Minimal fix: only fix CSP stripping in current implementation**. Rejected — the current implementation has three compounding issues (CSP, double browser launch, Playwright version mismatch). Fixing only CSP leaves the other two and the ad-hoc evidence format. The next dev-deploy would still be fragile.

2. **Hybrid: use PlaywrightEvidenceDriver for capture, keep current evidence format**. Rejected — the ad-hoc `evidence-capsule.yaml` and `findings.yaml` formats lack digest-backed integrity, capability manifests, and closure decisions. They cannot scale to multi-site longitudinal studies. Keeping them would require a converter layer that adds complexity without value.

3. **Full axiom-runtime kernel module**. Rejected — registering axiom-runtime as a kernel module is a larger architectural change (module interface, command table, kernel config). It is not needed for this migration; `mission.check` can import from axiom packages without being a kernel module. This can be a separate RFC if needed later.

4. **Keep local mode alongside external-preview**. Rejected — the local mode (build + static server) is never used in the dev-deploy pipeline. `leitstand.dev-deploy` always uses `--external-preview`. Keeping local mode would mean maintaining two code paths, one of which is untested and broken.

## Risks

- **Playwright version alignment**: The werkstatt monorepo must bump `playwright` to `^1.62.1` to match axiom-capture. This may affect other Playwright consumers in the monorepo (e.g. `independent-qa.ts`). Mitigation: run `pnpm test` across all packages after the bump.
- **Crawlee dependency**: `CrawleeDiscoveryExecutor` depends on `crawlee` which is a heavyweight dependency. Mitigation: axiom-capture already depends on crawlee; no new dependency in werkstatt.
- **Evidence format migration**: `leitstand.dev-deploy` post-processing reads evidence files to inject `commitSha`. The reader must be updated for the new capsule format. Mitigation: update the reader in the same implementation commit.
- **Agent misinterpretation**: Agents may try to run `mission.check` without `--external-preview` (local mode). Mitigation: the handler must exit with a clear error message if `--external-preview` is not set.
- **False positives**: axe-core automated rules are not a complete WCAG audit (per methodology non-claims). The gate may pass with accessibility issues that automated rules cannot detect. This is an accepted limitation — the methodology's epistemic contract explicitly states this.
- **Performance**: Crawlee discovery + full-page capture + axe analysis per page may be slower than the current sitemap-based approach for large sites (94+ pages). Mitigation: `maxPages` limit in the capture contract (default 100).

## Acceptance criteria

- [ ] `mission-check.ts` uses `PlaywrightEvidenceDriver` from `@syrokomskyi/axiom-capture` for browser capture (no manual Playwright imports)
- [ ] `mission-check.ts` uses `CrawleeDiscoveryExecutor` from `@syrokomskyi/axiom-capture` for page discovery (no manual sitemap.xml parsing)
- [ ] `mission-check.ts` uses `createAutomatedWebAccessibilityMethodology()` from `@syrokomskyi/axiom-methodology` for methodology binding
- [ ] `mission-check.ts` uses `runAccessibilityInstrument` from `@syrokomskyi/axiom-study` for observation generation
- [ ] `mission-check.ts` uses `findingsForObservation` from `@syrokomskyi/axiom-methodology` for finding projection
- [ ] `mission-check.ts` uses `evaluateClosure` from `@syrokomskyi/axiom-capture` for closure decision
- [ ] Evidence is written as `staged-capsule.json`, `observation-bundle.json`, `study-run.json` under `missions/<missionId>/evidence/axiom/`
- [ ] Gate passes when `closureDecision.satisfied === true` and zero findings with severity `high` or `critical`
- [ ] `mission.check` requires `--external-preview --base-url <url>`; exits with error if not provided
- [ ] `mission-check-converter.ts` is removed
- [ ] `packages/check-runner-node/src/playwright-adapter.ts` and `browser-capture-port.ts` are removed
- [ ] `leitstand.dev-deploy` evidence post-processing reads `staged-capsule.json` instead of `evidence-capsule.yaml`
- [ ] `pnpm --filter @warpgogol/site-kernel-checks run build:check` passes
- [ ] `leitstand.dev-deploy --system warpgogol-com` completes with passing Axiom gate
- [ ] `packages/os/site-kernel-checks/AGENTS.md` updated to reflect new evidence format
- [ ] `rfc.validate` passes on this file before merging

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- For RFCs created on or after 2026-07-07 with acceptance probes: before stamping `implemented`, run `site-kernel run rfc.verification.emit --id <this-rfc-id>` and commit the evidence file in the same commit (RFC-0330 amended transition precondition).
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
- Agents MUST NOT inject axe-core from CDN in the new implementation — use `@axe-core/playwright` local bundle via `PlaywrightEvidenceDriver`.
- Agents MUST NOT use `page.route()` to strip CSP headers — `PlaywrightEvidenceDriver` uses `bypassCSP: true` in `browser.newContext()` which handles this natively.
- Agents MUST bump `playwright` to `^1.62.1` in the werkstatt monorepo `package.json` to align with `@syrokomskyi/axiom-capture`.
- Agents MUST update `leitstand.dev-deploy` evidence post-processing to read `staged-capsule.json` instead of `evidence-capsule.yaml`.
- Agents MUST remove `mission-check-converter.ts`, `playwright-adapter.ts`, and `browser-capture-port.ts` — they are fully replaced by axiom components.
