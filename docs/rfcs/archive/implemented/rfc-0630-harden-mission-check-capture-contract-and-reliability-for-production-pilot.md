---
id: RFC-0630
title: "Harden mission.check capture contract and reliability for production pilot"
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
createdAt: 2026-08-01
updatedAt: 2026-08-01
enhancedAt: 2026-08-01
implementedAt: 2026-08-01
closedAt:
supersedes: []
supersededBy:
amends:
  - RFC-0629
amendedBy: []
related:
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
  - "mission.check toolProfile carries real playwrightVersion, chromiumRevision, and crawleeVersion, not 'unknown'"
  - "mission.check resolves browser locale per-page from URL path segment using i18n config from mission workpiece"
  - "mission.check accepts --max-duration flag for large sites"
  - "mission.check pre-flight checks browser availability and exits with actionable error if chromium is not installed"
nonGoals:
  - "Does not change the axiom capsule format or evidence file names"
  - "Does not change the gate logic (closure + severity high/critical = fail)"
  - "Does not add new axiom methodologies beyond automated-web-accessibility"
  - "Does not change leitstand.dev-deploy or leitstand.propagate integration — i18n is read from --mission workpiece, no --system flag needed"
  - "Does not modify axiom-capture, axiom-study, or axiom-methodology packages"
  - "Does not clean up orphaned Crawlee storage datasets (contract digest includes recordedAt, so storage name is unique per run)"
  - "Does not clean up raw evidence artifacts after capsule staging (operational concern, not a code change)"
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

RFC-0629 migrated `mission.check` to native axiom capsules with `PlaywrightEvidenceDriver`, `CrawleeDiscoveryExecutor`, and the `automated-web-accessibility` methodology. The implementation is functionally complete — tests pass, typecheck passes, evidence format is native. However, a pre-pilot review identified five hardening gaps that would cause failures or produce low-quality evidence during a live `leitstand.dev-deploy --system warpgogol-com` run against `https://dev-warpgogol-com.syrokomskyi.workers.dev`.

## Problem

Five issues in `packages/os/site-kernel-checks/src/mission-check.ts` would cause failures or degraded evidence quality during a live production pilot:

1. **`toolProfile` stubs**: `playwrightVersion: "unknown"`, `chromiumRevision: "unknown"`, and `crawleeVersion: "local-dev"` are hardcoded in `buildCaptureContract()`. The `StagedCapsule`'s `runtimeAttestation` carries these values into long-term evidence storage, losing provenance information that axiom capsules are designed to preserve. The real values are available at runtime: `playwrightVersion` from `playwright/package.json`, `chromiumRevision` from `browser.version()`, `crawleeVersion` from `crawlee/package.json`.

2. **`maxDurationMs: 30_000`**: The Crawlee discovery deadline is 30 seconds. `warpgogol-com` has 94+ pages. `CheerioCrawler` is fast (no JS rendering), but 30s is insufficient for sites with many pages, slow DNS, or rate-limited crawl delays (`crawlDelayMs: 1000` per host). The discovery will be cut short, producing incomplete evidence.

3. **`locales: ["en-US"]` hardcoded, no page-language matching**: The capture contract is hardcoded to `en-US`. `warpgogol-com` is a multi-language site (`de` default, `uk` supported, hreflang `de-DE` and `uk-UA`). The browser sends `Accept-Language: en-US` for all pages, which is incorrect for German and Ukrainian pages. While axe-core uses the page's `lang` attribute (not the browser locale) for its checks, the browser locale affects `navigator.language` and `Accept-Language` header. Each page should be captured with the browser locale matching the page's language, determined from the URL path segment (e.g., `/de/...` → `de-DE`).

4. **No capture contract configurability**: All contract parameters (`maxUrls`, `maxDurationMs`, `maxDepth`, `locales`) are hardcoded in `buildCaptureContract()`. Different sites have different sizes, languages, and crawl characteristics. There is no way to override these without code changes.

5. **No Playwright pre-flight check**: `PlaywrightEvidenceDriver` calls `chromium.launch()` internally. If the browser binary is not installed (fresh machine, CI without `npx playwright install`), the error is `Error: Browser not found` with no actionable guidance. The old `mission-check.ts` had auto-install logic; the new implementation does not.

## Decision

`mission.check` is hardened with five targeted fixes, all within `packages/os/site-kernel-checks/src/mission-check.ts`:

1. **`toolProfile` populated at runtime**: `playwrightVersion` is read from `playwright/package.json` via `createRequire(import.meta.url)` (ESM-compatible); `chromiumRevision` is read from `browser.version()` after the first `PlaywrightEvidenceDriver.capture()` call; `crawleeVersion` is read from `crawlee/package.json` via the same `createRequire` pattern. All reads are wrapped in try/catch with fallback to `"unknown"` — provenance improvement, not correctness requirement. The `runtimeAttestation` in the staged capsule carries real values.

2. **`maxDurationMs` default raised to 120_000**: The default discovery deadline is increased from 30s to 120s. This accommodates 100+ page sites with 1s crawl delay. The value is overridable via `--max-duration` flag.

3. **Page-language matching for browser locale**: `mission.check` reads the mission workpiece's `system.md` `i18n.supported` map (from `missions/<missionId>/workpiece/src/content/system.md`) to build a language-to-locale mapping (e.g., `de` → `de-DE`, `uk` → `uk-UA`). For each discovered URL, the language is detected from the first path segment (e.g., `/de/...` → `de`). The browser locale for that page's capture is set to the matching hreflang value. Pages without a recognizable language segment fall back to the default locale from `i18n.default`. Fallback: `"en-US"` if the workpiece has no `i18n` section. The `--locales` flag overrides auto-detection with an explicit comma-separated list.

4. **`--max-duration`, `--max-urls`, `--max-depth`, `--locales` flags**: `mission.check` accepts optional flags to override capture contract defaults. Defaults remain hardcoded as sensible fallbacks.

5. **Playwright pre-flight check**: Before discovery, `mission.check` attempts `chromium.launch()` + `browser.close()`. If it fails, it exits with exit code 2 and a message: `mission.check: Playwright chromium not installed. Run 'npx playwright install chromium' and retry.`

## Architectural fit

- **DNA-48 (Release discipline)**: The Axiom verification gate must produce reliable evidence before promotion. Hardened `toolProfile` ensures provenance traceability; pre-flight check prevents false-negative gates from browser launch failures; page-language matching ensures browser locale matches page content.
- **DNA-49 (Fleet propagation)**: `leitstand.dev-deploy` calls `mission.check --external-preview`. The gate must pass for propagation to proceed. Incomplete discovery (30s deadline) or inaccurate locale checks would allow sites with accessibility issues to pass the gate.
- **RFC-0629**: This RFC amends RFC-0629 by fixing implementation gaps without changing the architectural decision. The axiom capsule format, gate logic, and component selection remain unchanged.
- **Site OS operator model**: `mission.check` remains in `site-kernel-checks`. No new kernel module, no new command, no `leitstand.dev-deploy` wiring change. i18n config is read from the `--mission` workpiece, which `mission.check` already resolves via `resolveMissionDir`.
- **Scaling Playbook**: Configurable contract parameters allow sites of different sizes (10 pages vs 200 pages) and languages (1 vs 5) to use the same command without code changes.

## Design

### CLI surface

```sh
# Default (with i18n auto-detection from mission workpiece)
pnpm exec site-kernel run mission.check \
  --mission <missionId> \
  --external-preview \
  --base-url https://dev-warpgogol-com.syrokomskyi.workers.dev \
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

# leitstand.dev-deploy (unchanged — mission.check reads i18n from --mission workpiece)
pnpm exec site-kernel run leitstand.dev-deploy --system warpgogol-com
# internally calls:
#   mission.check --mission=<id> --external-preview --base-url=<dev-url> --commit-sha=<sha>
```

New optional flags:

| Flag | Type | Default | Description |
| --- | --- | --- | --- |
| `--max-duration` | number | 120000 | Override `limits.maxDurationMs` in capture contract (ms) |
| `--max-urls` | number | 100 | Override `limits.maxUrls` in capture contract |
| `--max-depth` | number | 3 | Override `urlPolicy.maxDepth` in capture contract |
| `--locales` | string | auto | Comma-separated locale list (e.g., `de-DE,uk-UA`). Overrides i18n auto-detection. |

### TypeScript contracts

```ts
// New optional flags parsed from input.flags
interface MissionCheckOverrides {
  maxDuration?: number;    // --max-duration 180000
  maxUrls?: number;        // --max-urls 200
  maxDepth?: number;       // --max-depth 5
}

// i18n locale resolution from mission workpiece system.md
interface LocaleMapping {
  segmentToLocale: Map<string, string>; // e.g., "de" → "de-DE", "uk" → "uk-UA"
  defaultLocale: string;                // fallback locale from i18n.default hreflang
}

// toolProfile populated at runtime via createRequire(import.meta.url)
interface RuntimeToolProfile {
  crawleeVersion: string;     // from crawlee/package.json
  playwrightVersion: string;  // from playwright/package.json
  chromiumRevision: string;   // from browser.version()
}

// Pre-flight check result
interface PreflightResult {
  ok: boolean;
  error?: string;           // actionable message if browser not installed
  chromiumRevision?: string; // browser.version() — passed to resolveToolProfile
}
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/os/site-kernel-checks/src/mission-check.ts` | Modified: add flag parsing, i18n resolution from workpiece, pre-flight check, runtime toolProfile, page-language matching |
| `packages/os/site-kernel-checks/src/tests/mission-check.test.ts` | Modified: update tests for new flags, pre-flight check mock, page-language matching |
| `packages/os/site-kernel-checks/AGENTS.md` | Modified: document new flags |
| `missions/<missionId>/workpiece/src/content/system.md` | Read: i18n locale resolution (not modified) |
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
| `system.md` has no `i18n` section | 0 (warn) | Falls back to `["en-US"]` locale. Logs warning. |
| `--locales` provided with invalid format | 2 | Exits with error: `Invalid --locales format. Expected comma-separated BCP 47 tags, e.g., 'de-DE,uk-UA'.` |
| `browser.version()` fails after launch | 0 (warn) | Falls back to `"unknown"` for `chromiumRevision`. Logs warning. |
| `createRequire(import.meta.url)("playwright/package.json")` fails | 0 (warn) | Falls back to `"unknown"` for `playwrightVersion`. Logs warning. |
| `createRequire(import.meta.url)("crawlee/package.json")` fails | 0 (warn) | Falls back to `"unknown"` for `crawleeVersion`. Logs warning. |
| Discovery timeout (maxDurationMs) | 1 | Same as RFC-0629: partial discovery, closure may be blocked. |

## Rollout

- **Default behavior**: All five fixes are applied in-place to the existing `mission.check` implementation. No feature flag, no grace period. The current implementation has never run live — there is no production behavior to preserve.
- **No `leitstand.dev-deploy` wiring change**: `leitstand.dev-deploy` already passes `--mission=<id>` to `mission.check`. i18n is read from the mission workpiece, not from a `--system` flag. No changes to `leitstand-commands.ts`.
- **Backward compatibility**: All new flags are optional. Running `mission.check` without `--max-duration`, `--max-urls`, `--max-depth`, or `--locales` uses the new defaults (120s timeout, 100 URLs, depth 3, `en-US` locale). The only behavioral change from RFC-0629 is the increased default timeout (30s → 120s).
- **No pipeline integration**: `mission.check` is called only by `leitstand.dev-deploy` and manually. It is not part of `build.check` or any standard pipeline.
- **Test updates**: Existing tests in `mission-check.test.ts` are updated for new flags and pre-flight check mock. New tests cover: i18n locale resolution from workpiece, page-language matching, pre-flight failure.
- **Command manifest**: After changing `mission.check` flags, run `command.manifest.generate` then `docs.commands.generate` to keep the manifest and COMMANDS.md in sync (per AGENTS.md).

## Alternatives considered

1. **Fix only toolProfile and timeout, defer locales and configurability**. Rejected — running the pilot with `en-US` locale on a `de`/`uk` site would produce inaccurate browser locale settings, giving false confidence in the gate. The pilot must produce trustworthy evidence.

2. **Add i18n auto-detection inside axiom-capture**. Rejected — axiom-capture is a general-purpose package that should not depend on warpgogol's `system.md` format. Locale resolution is a `mission.check` concern (it knows about missions); axiom-capture receives locales via the capture contract.

3. **Auto-install chromium in pre-flight check**. Rejected — auto-installing browser binaries is a side-effect that belongs in setup scripts, not in a check command. The pre-flight check should fail fast with an actionable message; the operator installs chromium separately.

4. **Multi-locale capture profiles (page × locale matrix)**. Rejected — for URL-based multilingual sites like warpgogol-com (`/de/...`, `/uk/...`), each page has a single language determined by the URL path segment. Capturing each page with each locale profile (94×2=188 captures) would not produce different axe-core results — axe-core uses the page's `lang` attribute, not the browser locale. Page-language matching (one capture per page with the correct locale) is sufficient and halves capture time.

5. **Store capture contract overrides in `system.md`**. Rejected — adding axiom-specific fields to `system.md` couples site authoring to the verification tool. Flags are sufficient; `leitstand.dev-deploy` can pass system-specific values if needed in the future.

6. **Crawlee Dataset purge before each run**. Rejected — `contractDigest` hashes the entire contract including `recordedAt = new Date().toISOString()`, which changes on every run. The storage name `axiom-${digest.slice(0,24)}` is unique per run, so stale data does not exist. `purgeRequestQueue: false` in `crawlee-discovery-executor.ts` preserves the request queue for the current run's deduplication, which is correct behavior.

## Risks

- **i18n resolution depends on `system.md` format**: If `system.md` changes its i18n schema, locale resolution breaks. Mitigation: fallback to `["en-US"]` with a warning. The resolution function is small and easy to update.

- **`createRequire(import.meta.url)` may fail in bundled contexts**: If `mission.check` is ever bundled (e.g., esbuild), `createRequire` may not resolve `playwright/package.json` or `crawlee/package.json`. Mitigation: wrap in try/catch, fall back to `"unknown"`. This is a provenance improvement, not a correctness requirement.

- **Page-language matching assumes URL path segments**: Sites that use content negotiation (same URL, different content by `Accept-Language`) would not benefit from page-language matching. Mitigation: `--locales` flag allows explicit override for such sites. warpgogol-com uses URL-based multilingualism (`/de/...`, `/uk/...`), so path-segment detection is correct for the pilot.

## Acceptance criteria

- [x] `mission-check.ts` `toolProfile` carries real `playwrightVersion` (from `playwright/package.json`), `chromiumRevision` (from `browser.version()`), and `crawleeVersion` (from `crawlee/package.json`) instead of `"unknown"`/`"local-dev"` (evidence: `mission-check.ts:90-103` `resolveToolProfile`, vitest run `src/tests/mission-check.test.ts`)
- [x] `mission-check.ts` default `maxDurationMs` is 120000 (evidence: `mission-check.ts:279` `overrides?.maxDuration ?? 120_000`, vitest run)
- [x] `mission-check.ts` accepts `--max-duration`, `--max-urls`, `--max-depth`, `--locales` flags that override capture contract defaults (evidence: `mission-check.ts:487-519` flag parsing, vitest run)
- [x] `mission-check.ts` resolves browser locale per-page from URL path segment using i18n config from mission workpiece `system.md` (evidence: `mission-check.ts:129-171` `resolveLocaleMapping` + `resolveLocaleForUrl`, vitest run `resolves locale from URL path segment`)
- [x] `mission-check.ts` accepts `--locales de-DE,uk-UA` as explicit override (evidence: `mission-check.ts:505-519` flag parsing, vitest run `accepts valid --locales flag`)
- [x] `mission-check.ts` pre-flight check launches chromium and exits with code 2 + actionable message if browser is not installed (evidence: `mission-check.ts:106-119` `runPreflightCheck`, vitest run `returns exit code 2 when chromium pre-flight check fails`)
- [x] `mission-check.ts` uses `createRequire(import.meta.url)` for ESM-compatible `require` of `playwright/package.json` and `crawlee/package.json` (evidence: `mission-check.ts:19,69,94,99`, vitest run)
- [x] `pnpm --filter @warpgogol/site-kernel-checks run build:check` passes (evidence: exit code 0, 0 type errors)
- [x] Existing tests updated for new flags, pre-flight mock, and page-language matching (evidence: vitest run 15/15 tests pass)
- [x] `packages/os/site-kernel-checks/AGENTS.md` documents new flags (evidence: `grep -E '--max-duration|--locales' packages/os/site-kernel-checks/AGENTS.md`)
- [x] `command.manifest.generate` and `docs.commands.generate` regenerated after flag changes (evidence: `docs/command-manifest.generated.yaml` contains new flags under `mission.check`)
- [x] `rfc.validate` passes on this file before merging (evidence: 0 violations, 0 warnings)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- For RFCs created on or after 2026-07-07 with acceptance probes: before stamping `implemented`, run `site-kernel run rfc.verification.emit --id <this-rfc-id>` and commit the evidence file in the same commit (RFC-0330 amended transition precondition).
- Agents MUST NOT change the axiom capsule format, evidence file names, or gate logic — this RFC only hardens the capture contract and reliability.
- Agents MUST NOT modify `@syrokomskyi/axiom-capture`, `@syrokomskyi/axiom-study`, or `@syrokomskyi/axiom-methodology` packages — all changes are in `werkstatt/packages/os/site-kernel-checks/src/mission-check.ts`.
- Agents MUST use `createRequire(import.meta.url)` for ESM-compatible `require` of `playwright/package.json` and `crawlee/package.json` — `mission-check.ts` uses ESM imports, so bare `require()` will not work.
- Agents MUST wrap `createRequire(import.meta.url)("playwright/package.json")`, `createRequire(import.meta.url)("crawlee/package.json")`, and `browser.version()` in try/catch — these are provenance improvements, not correctness requirements. Falling back to `"unknown"` is acceptable.
- Agents MUST NOT auto-install chromium in the pre-flight check — fail fast with an actionable message instead.
- Agents MUST NOT add a `--system` flag to `mission.check` or modify `leitstand.dev-deploy` — i18n is read from the `--mission` workpiece, which `mission.check` already resolves via `resolveMissionDir`.
- Agents MUST NOT purge Crawlee Dataset or RequestQueue — `contractDigest` includes `recordedAt`, so storage name is unique per run and stale data does not exist.
- Agents MUST update existing tests to mock the pre-flight check (chromium launch) and new flags.
- Agents MUST run `command.manifest.generate` then `docs.commands.generate` after changing `mission.check` flags (per AGENTS.md).
- Agents MUST add `amends: [RFC-0629]` to this RFC's frontmatter before committing (the `rfc.create` command does not support `--amends`).
