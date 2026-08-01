---
id: RFC-0630
title: "Harden mission.check capture contract and reliability for production pilot"
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
createdAt: 2026-08-01
updatedAt: 2026-08-01
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends:
  - RFC-0629
amendedBy: []
related:
  - DNA-48
  - DNA-49
  - RFC-0629
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
successSignals:
  - "mission.check toolProfile carries real playwrightVersion and chromiumRevision, not 'unknown'"
  - "mission.check accepts --locales flag for multi-language sites"
  - "mission.check accepts --max-duration flag for large sites"
  - "Crawlee Dataset is purged before each discovery run — no stale records"
  - "mission.check pre-flight checks browser availability and exits with actionable error if chromium is not installed"
nonGoals:
  - "Does not change the axiom capsule format or evidence file names"
  - "Does not change the gate logic (closure + severity high/critical = fail)"
  - "Does not add new axiom methodologies beyond automated-web-accessibility"
  - "Does not change leitstand.dev-deploy or leitstand.propagate integration"
  - "Does not modify axiom-capture, axiom-study, or axiom-methodology packages"
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

# RFC-0630: Harden mission.check capture contract and reliability for production pilot

## Context

RFC-0629 migrated `mission.check` to native axiom capsules with `PlaywrightEvidenceDriver`, `CrawleeDiscoveryExecutor`, and the `automated-web-accessibility` methodology. The implementation is functionally complete — tests pass, typecheck passes, evidence format is native. However, a pre-pilot review identified seven hardening gaps that would cause failures or produce low-quality evidence during a live `leitstand.dev-deploy --system warpgogol-com` run against `https://dev-warpgogol-com.syrokomskyi.workers.dev`.

## Problem

Seven issues in `packages/os/site-kernel-checks/src/mission-check.ts` would cause failures or degraded evidence quality during a live production pilot:

1. **`toolProfile` stubs** (line 179-182): `playwrightVersion: "unknown"` and `chromiumRevision: "unknown"` are hardcoded. The `StagedCapsule`'s `runtimeAttestation` carries these values into long-term evidence storage, losing provenance information that axiom capsules are designed to preserve. The real values are available at runtime via `require("playwright/package.json").version` and `browser.version()`.

2. **`maxDurationMs: 30_000`** (line 167): The Crawlee discovery deadline is 30 seconds. `warpgogol-com` has 94+ pages. `CheerioCrawler` is fast (no JS rendering), but 30s is insufficient for sites with many pages, slow DNS, or rate-limited crawl delays (`crawlDelayMs: 1000` per host). The discovery will be cut short, producing incomplete evidence.

3. **`locales: ["en-US"]`** (line 141): The capture contract is hardcoded to `en-US`. `warpgogol-com` is a multi-language site (`de` default, `uk` supported, hreflang `de-DE` and `uk-UA`). axe-core runs with the contract locale, so accessibility checks on German and Ukrainian pages may produce inaccurate results (e.g., lang attribute mismatches, incorrect label checks).

4. **No capture contract configurability**: All contract parameters (`maxUrls`, `maxDurationMs`, `maxDepth`, `locales`, `profiles`) are hardcoded in `buildCaptureContract()`. Different sites have different sizes, languages, and crawl characteristics. There is no way to override these without code changes.

5. **Crawlee Dataset stale data**: `CrawleeDiscoveryExecutor` opens a Dataset named `axiom-<contractDigest>` and reads persisted records from it (line 44). On repeated runs with the same contract digest (same base URL), stale records from previous crawls are returned. `purgeRequestQueue: false` (line 178) preserves the request queue too. This means re-running `mission.check` after a site update may return old page lists.

6. **No Playwright pre-flight check**: `PlaywrightEvidenceDriver` calls `chromium.launch()` internally. If the browser binary is not installed (fresh machine, CI without `npx playwright install`), the error is `Error: Browser not found` with no actionable guidance. The old `mission-check.ts` had auto-install logic; the new implementation does not.

7. **Single locale profile**: The contract defines one profile (`desktop`, 1440x900). Multi-language sites should capture pages in each language locale to ensure axe-core checks the correct language behavior.

## Decision

`mission.check` is hardened with seven targeted fixes, all within `packages/os/site-kernel-checks/src/mission-check.ts`:

1. **`toolProfile` populated at runtime**: `playwrightVersion` is read from `require("playwright/package.json").version`; `chromiumRevision` is read from `browser.version()` after the first `PlaywrightEvidenceDriver.capture()` call. The `runtimeAttestation` in the staged capsule carries real values.

2. **`maxDurationMs` default raised to 120_000**: The default discovery deadline is increased from 30s to 120s. This accommodates 100+ page sites with 1s crawl delay. The value is overridable via `--max-duration` flag.

3. **`locales` derived from site i18n config**: When `--system <systemId>` is provided, `mission.check` reads the site's `system.md` `i18n.supported` map and builds locale entries from hreflang values. Fallback: `["en-US"]` if no system is provided or i18n config is absent.

4. **`--max-duration`, `--max-urls`, `--max-depth`, `--locales` flags**: `mission.check` accepts optional flags to override capture contract defaults. Defaults remain hardcoded as sensible fallbacks.

5. **Crawlee Dataset purged before each run**: `mission.check` calls `Dataset.drop(storageName)` and `RequestQueue.drop(storageName)` before creating a new `CrawleeDiscoveryExecutor`. This ensures a clean discovery on every run. The purge is done in `mission-check.ts` before calling `discoveryExecutor.discover()`, not inside `CrawleeDiscoveryExecutor` — the executor remains a general-purpose component.

6. **Playwright pre-flight check**: Before discovery, `mission.check` attempts `chromium.launch()` + `browser.close()`. If it fails, it exits with exit code 2 and a message: `mission.check: Playwright chromium not installed. Run 'npx playwright install chromium' and retry.`

7. **Multi-locale capture profiles**: The capture contract includes one profile per locale (e.g., `desktop-de-DE`, `desktop-uk-UA`). Each page is captured once per locale profile. axe-core runs with the correct locale context.

## Architectural fit

- **DNA-48 (Release discipline)**: The Axiom verification gate must produce reliable evidence before promotion. Hardened `toolProfile` ensures provenance traceability; pre-flight check prevents false-negative gates from browser launch failures; Dataset purge ensures evidence reflects the current site state, not a stale crawl.
- **DNA-49 (Fleet propagation)**: `leitstand.dev-deploy` calls `mission.check --external-preview`. The gate must pass for propagation to proceed. Incomplete discovery (30s deadline) or inaccurate locale checks would allow sites with accessibility issues to pass the gate.
- **RFC-0629**: This RFC amends RFC-0629 by fixing implementation gaps without changing the architectural decision. The axiom capsule format, gate logic, and component selection remain unchanged.
- **Site OS operator model**: `mission.check` remains in `site-kernel-checks`. No new kernel module, no new command. The `--system` flag is optional — `leitstand.dev-deploy` already passes `--mission` but not `--system`; adding `--system` to the `leitstand.dev-deploy` call is a wiring change in `leitstand-commands.ts`, not a new command.
- **Scaling Playbook**: Configurable contract parameters allow sites of different sizes (10 pages vs 200 pages) and languages (1 vs 5) to use the same command without code changes.

## Design

### CLI surface

```sh
# Default (with i18n auto-detection from system.md)
pnpm exec site-kernel run mission.check \
  --mission <missionId> \
  --external-preview \
  --base-url https://dev-warpgogol-com.syrokomskyi.workers.dev \
  --system warpgogol-com \
  --commit-sha <sha>

# Override discovery timeout for large sites
pnpm exec site-kernel run mission.check \
  --mission <missionId> \
  --external-preview \
  --base-url https://dev-warpgogol-com.syrokomskyi.workers.dev \
  --max-duration 180000

# Override locales explicitly
pnpm exec site-kernel run mission.check \
  --mission <missionId> \
  --external-preview \
  --base-url https://dev-warpgogol-com.syrokomskyi.workers.dev \
  --locales de-DE,uk-UA

# leitstand.dev-deploy wiring (adds --system)
pnpm exec site-kernel run leitstand.dev-deploy --system warpgogol-com
# internally calls:
#   mission.check --mission=<id> --external-preview --base-url=<dev-url> --commit-sha=<sha> --system=<systemId>
```

New optional flags:

| Flag | Type | Default | Description |
| --- | --- | --- | --- |
| `--system` | string | none | System ID for i18n locale auto-detection from `system.md` |
| `--max-duration` | number | 120000 | Override `limits.maxDurationMs` in capture contract (ms) |
| `--max-urls` | number | 100 | Override `limits.maxUrls` in capture contract |
| `--max-depth` | number | 3 | Override `urlPolicy.maxDepth` in capture contract |
| `--locales` | string | auto | Comma-separated locale list (e.g., `de-DE,uk-UA`). Overrides i18n auto-detection. |

### TypeScript contracts

```ts
// New optional flags parsed from input.flags
interface MissionCheckOverrides {
  system?: string;         // --system warpgogol-com
  maxDuration?: number;    // --max-duration 180000
  maxUrls?: number;        // --max-urls 200
  maxDepth?: number;       // --max-depth 5
  locales?: string[];      // --locales de-DE,uk-UA → ["de-DE", "uk-UA"]
}

// i18n locale resolution from system.md
interface ResolvedLocale {
  locale: string;          // e.g., "de-DE"
  profileId: string;       // e.g., "desktop-de-DE"
}

// toolProfile populated at runtime
interface RuntimeToolProfile {
  crawleeVersion: string;     // from crawlee/package.json
  playwrightVersion: string;  // from playwright/package.json
  chromiumRevision: string;   // from browser.version()
}

// Pre-flight check result
interface PreflightResult {
  ok: boolean;
  error?: string;  // actionable message if browser not installed
}

// Crawlee storage cleanup
async function purgeCrawleeStorage(storageName: string): Promise<void>;
// Calls Dataset.drop(`${storageName}-ledger`) and RequestQueue.drop(storageName)
// Best-effort: ignores "not found" errors
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/os/site-kernel-checks/src/mission-check.ts` | Modified: add flag parsing, i18n resolution, pre-flight check, Crawlee purge, runtime toolProfile, multi-locale profiles |
| `packages/os/site-kernel-handoff/src/leitstand/leitstand-commands.ts` | Modified: add `--system=<systemId>` to `mission.check` call in `leitstand.dev-deploy` |
| `packages/os/site-kernel-checks/src/tests/mission-check.test.ts` | Modified: update tests for new flags, pre-flight check mock, multi-locale profiles |
| `packages/os/site-kernel-handoff/src/tests/leitstand-0628-dev-deploy.test.ts` | Modified: verify `--system` is passed to `mission.check` |
| `packages/os/site-kernel-checks/AGENTS.md` | Modified: document new flags |
| `../systems-cache/<id>/src/content/system.md` | Read: i18n locale resolution (not modified) |
| `missions/<missionId>/evidence/axiom/` | Written: same files as RFC-0629, with improved `toolProfile` in `staged-capsule.json` |

### Output format

The `MissionCheckResult` interface is unchanged from RFC-0629. The only difference is that `capsule.runtimeAttestation.toolDigests` contains real values instead of `"unknown"`:

```json
{
  "command": "mission.check",
  "status": "pass",
  "exitCode": 0,
  "capsule": {
    "runtimeAttestation": {
      "toolDigests": {
        "playwright": "1.62.1",
        "chromium": "151.0.7922.34",
        "crawlee": "0.15.0"
      }
    }
  },
  "findingsCount": { "critical": 0, "high": 0, "medium": 2, "low": 5, "info": 1 },
  "findings": { "errors": 0, "warnings": 8, "total": 8 },
  "closureDecision": { "satisfied": true, "status": "seal_allowed", "reason": "..." }
}
```

Pre-flight failure output (exit code 2):

```json
{
  "command": "mission.check",
  "status": "fail",
  "exitCode": 2,
  "summary": "mission.check: Playwright chromium not installed. Run 'npx playwright install chromium' and retry."
}
```

### Failure modes

| Scenario | Exit code | Behavior |
| --- | --- | --- |
| Chromium not installed | 2 | Pre-flight check fails before discovery. Actionable error message with install command. |
| `--system` not found in registry | 0 (warn) | Falls back to `["en-US"]` locale. Logs warning: `System '<id>' not found, falling back to en-US locale.` |
| `system.md` has no `i18n` section | 0 (warn) | Falls back to `["en-US"]` locale. Logs warning. |
| `--locales` provided with invalid format | 2 | Exits with error: `Invalid --locales format. Expected comma-separated BCP 47 tags, e.g., 'de-DE,uk-UA'.` |
| Crawlee Dataset.drop fails | 0 (warn) | Best-effort purge. Logs warning and continues with fresh discovery. |
| `browser.version()` fails after launch | 0 (warn) | Falls back to `"unknown"` for `chromiumRevision`. Logs warning. |
| `require("playwright/package.json")` fails | 0 (warn) | Falls back to `"unknown"` for `playwrightVersion`. Logs warning. |
| Discovery timeout (maxDurationMs) | 1 | Same as RFC-0629: partial discovery, closure may be blocked. |

## Rollout

- **Default behavior**: All seven fixes are applied in-place to the existing `mission.check` implementation. No feature flag, no grace period. The current implementation has never run live — there is no production behavior to preserve.
- **`leitstand.dev-deploy` wiring**: The `leitstand.dev-deploy` command in `leitstand-commands.ts` is updated to pass `--system=<systemId>` to `mission.check`. This is a one-line addition to the `argv` array. No other changes to `leitstand.dev-deploy`.
- **Backward compatibility**: All new flags are optional. Running `mission.check` without `--system`, `--max-duration`, `--max-urls`, `--max-depth`, or `--locales` uses the new defaults (120s timeout, 100 URLs, depth 3, `en-US` locale). The only behavioral change from RFC-0629 is the increased default timeout (30s → 120s) and the Crawlee Dataset purge (which fixes a bug, not a feature).
- **No pipeline integration**: `mission.check` is called only by `leitstand.dev-deploy` and manually. It is not part of `build.check` or any standard pipeline.
- **Test updates**: Existing tests in `mission-check.test.ts` and `leitstand-0628-dev-deploy.test.ts` are updated for new flags and pre-flight check mock. New tests cover: i18n locale resolution, Crawlee purge, pre-flight failure, multi-locale profiles.

## Alternatives considered

1. **Fix only toolProfile and timeout, defer locales and configurability**. Rejected — running the pilot with `en-US` locale on a `de`/`uk` site would produce inaccurate axe-core results, giving false confidence in the gate. The pilot must produce trustworthy evidence.

2. **Add i18n auto-detection inside axiom-capture**. Rejected — axiom-capture is a general-purpose package that should not depend on warpgogol's `system.md` format. Locale resolution is a `mission.check` concern (it knows about systems and missions); axiom-capture receives locales via the capture contract.

3. **Auto-install chromium in pre-flight check**. Rejected — auto-installing browser binaries is a side-effect that belongs in setup scripts, not in a check command. The pre-flight check should fail fast with an actionable message; the operator installs chromium separately.

4. **Make Crawlee purge a `CrawleeDiscoveryExecutor` constructor option**. Rejected — the executor is a general-purpose component in axiom-capture. Purge-on-construct would be a behavioral change to a shared package. The purge belongs in `mission-check.ts` as orchestration logic.

5. **Store capture contract overrides in `system.md`**. Rejected — adding axiom-specific fields to `system.md` couples site authoring to the verification tool. Flags are sufficient; `leitstand.dev-deploy` can pass system-specific values if needed in the future.

## Risks

- **Multi-locale capture doubles evidence size**: Each page is captured once per locale profile. For a 94-page site with 2 locales, that's 188 captures. Mitigation: axe-core is the bottleneck (not Crawlee), and 188 captures at ~2s each is ~6 minutes — acceptable for a pre-deploy gate. The `maxUrls` limit applies to discovery, not to capture count.

- **i18n resolution depends on `system.md` format**: If `system.md` changes its i18n schema, locale resolution breaks. Mitigation: fallback to `["en-US"]` with a warning. The resolution function is small and easy to update.

- **Crawlee `Dataset.drop` is best-effort**: If the storage directory is locked or has permission issues, the purge silently fails and stale data may be returned. Mitigation: log a warning. The contract digest changes when the base URL changes, so stale data only affects re-runs against the same URL.

- **`require("playwright/package.json")` may fail in bundled contexts**: If `mission.check` is ever bundled (e.g., esbuild), `require` may not resolve the package.json. Mitigation: wrap in try/catch, fall back to `"unknown"`. This is a provenance improvement, not a correctness requirement.

- **`--system` flag introduces a registry dependency**: `mission.check` now needs to resolve system IDs to cache clone paths. This is already done by `leitstand.dev-deploy` — the `--system` flag is passed through, and `mission.check` uses the same `resolveMissionDir` + registry lookup pattern. No new coupling.

## Acceptance criteria

- [ ] `mission-check.ts` `toolProfile` carries real `playwrightVersion` (from `playwright/package.json`) and `chromiumRevision` (from `browser.version()`) instead of `"unknown"` (evidence: `staged-capsule.json` `runtimeAttestation.toolDigests`, vitest run `src/tests/mission-check.test.ts`)
- [ ] `mission-check.ts` default `maxDurationMs` is 120000 (evidence: `buildCaptureContract` default, vitest run)
- [ ] `mission-check.ts` accepts `--max-duration`, `--max-urls`, `--max-depth`, `--locales` flags that override capture contract defaults (evidence: `input.flags` parsing, vitest run)
- [ ] `mission-check.ts` accepts `--system <systemId>` and resolves locales from `system.md` `i18n.supported` hreflang values (evidence: i18n resolution function, vitest run)
- [ ] `mission-check.ts` accepts `--locales de-DE,uk-UA` as explicit override (evidence: flag parsing, vitest run)
- [ ] `mission-check.ts` purges Crawlee Dataset and RequestQueue before each discovery run (evidence: `Dataset.drop` / `RequestQueue.drop` calls, vitest run)
- [ ] `mission-check.ts` pre-flight check launches chromium and exits with code 2 + actionable message if browser is not installed (evidence: pre-flight function, vitest run)
- [ ] `mission-check.ts` builds one capture profile per locale (evidence: `contract.profiles` array length matches `contract.locales` length, vitest run)
- [ ] `leitstand.dev-deploy` passes `--system=<systemId>` to `mission.check` (evidence: `leitstand-commands.ts` argv, vitest run `src/tests/leitstand-0628-dev-deploy.test.ts`)
- [ ] `pnpm --filter @warpgogol/site-kernel-checks run build:check` passes
- [ ] `pnpm --filter @warpgogol/site-kernel-handoff run build:check` passes
- [ ] Existing tests updated for new flags, pre-flight mock, and multi-locale profiles (evidence: vitest run)
- [ ] `packages/os/site-kernel-checks/AGENTS.md` documents new flags (evidence: grep `--system\|--max-duration\|--locales` in AGENTS.md)
- [ ] `rfc.validate` passes on this file before merging

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- For RFCs created on or after 2026-07-07 with acceptance probes: before stamping `implemented`, run `site-kernel run rfc.verification.emit --id <this-rfc-id>` and commit the evidence file in the same commit (RFC-0330 amended transition precondition).
- Agents MUST NOT change the axiom capsule format, evidence file names, or gate logic — this RFC only hardens the capture contract and reliability.
- Agents MUST NOT modify `@syrokomskyi/axiom-capture`, `@syrokomskyi/axiom-study`, or `@syrokomskyi/axiom-methodology` packages — all changes are in `werkstatt/packages/os/site-kernel-checks/src/mission-check.ts` and `werkstatt/packages/os/site-kernel-handoff/src/leitstand/leitstand-commands.ts`.
- Agents MUST wrap `require("playwright/package.json")` and `browser.version()` in try/catch — these are provenance improvements, not correctness requirements. Falling back to `"unknown"` is acceptable.
- Agents MUST wrap `Dataset.drop` and `RequestQueue.drop` in try/catch — best-effort purge. Stale data is a bug, but a failed purge should not block the check.
- Agents MUST NOT auto-install chromium in the pre-flight check — fail fast with an actionable message instead.
- Agents MUST update `leitstand.dev-deploy` to pass `--system=<systemId>` to `mission.check` — this enables i18n locale auto-detection.
- Agents MUST update existing tests to mock the pre-flight check (chromium launch) and new flags.
- Agents MUST add `amends: [RFC-0629]` to this RFC's frontmatter before committing (the `rfc.create` command does not support `--amends`).
