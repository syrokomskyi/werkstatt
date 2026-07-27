---
id: RFC-0251
title: "Establish test signal maturity and maintenance debt baselines"
status: implemented
# kind options: architecture | contract | command | policy | deprecation
kind: architecture
# scope options: app | workspace
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-07-01
updatedAt: 2026-07-01
implementedAt: 2026-07-01
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0203
  - RFC-0211
  - RFC-0220
  - RFC-0244
  - RFC-0245
  - RFC-0247
  - RFC-0249
commands:
  proposed:
    - maintenance.debt.baseline.validate
    - maintenance.debt.baseline.write
    - maintenance.debt.triage.report
    - test.signal.policy.validate
  added:
    - maintenance.debt.baseline.validate
    - maintenance.debt.baseline.write
    - maintenance.debt.triage.report
    - test.signal.policy.validate
  changed:
    - ci.local.validate
    - ecosystem.manifest.generate
    - ecosystem.manifest.validate
    - maintenance.debt.report
    - test.signal.validate
  removed: []
appsImpacted:
  - webgogol-com
  - nicaragua-projekt
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - "@gogol/site-kernel-checks"
  - "@gogol/site-kernel"
successSignals:
  - "Every workspace package has a test posture that is either `real` or explicitly `skipped` with a package-level rationale."
  - "`test.signal.validate --json` no longer reports ambiguous `absent` or `noop` package test signals without ownership metadata."
  - "`maintenance.debt.report --json` can be compared against a committed baseline and separates new debt from accepted backlog."
  - "Agent return-for-rework starts from `maintenance.debt.triage.report --json` instead of re-reading all app content."
nonGoals:
  - "Do not require every package to gain comprehensive unit test coverage in one change."
  - "Do not make all existing maintenance debt fail-hard immediately."
  - "Do not implement this maturity layer while the RFC remains draft."
---

# RFC-0251: Establish test signal maturity and maintenance debt baselines

## Context

RFC-0249 introduced `test.signal.validate`, which made the repository's test posture explicit. The first audit after implementation found:

- 10 workspace packages with real test scripts.
- 17 workspace packages with absent test scripts.
- 6 workspace packages with no-op scripts such as `node -e "process.exit(0)"` or `echo 'No tests yet'`.

RFC-0247 and RFC-0245 made maintenance debt visible. The first `maintenance.debt.report --json` after the warning-diagnostics migration reported 217 advisory items:

- `text.normalize.report`: 123 info findings.
- `demands.hierarchy.validate`: 36 warning findings.
- `material.credits.validate`: 36 warning findings.
- `surface.validate`: 20 warning findings.
- `material.metadata.validate`: 2 info findings.

This is healthy as visibility, but the agent workflow still lacks maturity policy:

- A green `pnpm test` can coexist with many absent/no-op package test scripts.
- Agents see warning debt but cannot distinguish "new regression" from "accepted backlog".
- There is no committed owner/rationale surface for intentionally skipped tests.
- There is no baseline file that lets CI or local agents fail only on new debt while preserving warn-first rollout semantics.

## Problem

The unprotected invariant is: **warning-mode debt and weak test posture must be explicit, owned, and diffable.**

Visibility alone is not enough. Without baselines and ownership:

- Agents may repeatedly rediscover the same 217 maintenance items.
- No-op tests remain socially invisible because `pnpm test` exits green.
- It is unclear which packages should get real tests first.
- CI cannot prevent newly introduced warning debt without making all historical debt fail-hard.
- Return-for-rework planning is noisy rather than prioritized.

## Decision

The platform will introduce two maturity contracts:

1. **Test signal policy.** Every workspace package must either have a real test script or an explicit skipped-test declaration with rationale, owner, and review date. No-op scripts are transitional debt and must be replaced by real tests or explicit skips.
2. **Maintenance debt baseline.** Advisory diagnostics can be baselined in a committed generated file so CI and agents can distinguish existing accepted backlog from newly introduced warning/info debt.

The first implementation should not demand complete coverage. It should make package test intent and advisory debt state explicit enough for incremental improvement.

## Architectural fit

This RFC extends RFC-0249 rather than replacing it. `test.signal.validate` remains the classifier. New policy validation interprets classifications against package-level metadata.

It also extends RFC-0245/RFC-0247. `maintenance.debt.report` remains the raw current ledger. Baseline and triage commands add diffing, ownership, and prioritization.

The generated Agent Control Plane should include enough summary data for agents to know:

- how many packages are real/noop/absent/skipped;
- whether the committed test-signal policy is current;
- whether maintenance debt has increased since the baseline.

## Design

### CLI surface

```sh
pnpm exec site-kernel run test.signal.validate --json
pnpm exec site-kernel run test.signal.policy.validate --json
pnpm exec site-kernel run maintenance.debt.report --json
pnpm exec site-kernel run maintenance.debt.baseline.write --json
pnpm exec site-kernel run maintenance.debt.baseline.validate --json
pnpm exec site-kernel run maintenance.debt.triage.report --json
```

`test.signal.policy.validate` is workspace-scoped and read-only.

`maintenance.debt.baseline.write` is workspace-scoped and mutating. It writes a generated baseline file only when the operator intentionally accepts the current advisory backlog.

`maintenance.debt.baseline.validate` is workspace-scoped and read-only. It fails only for new unbaselined debt or stale/malformed baselines.

`maintenance.debt.triage.report` is workspace-scoped and read-only. It emits prioritized work groups for agents.

### Package metadata contract

Package-level explicit skip metadata lives in `package.json` under `gogol.testSignal`.

```json
{
  "gogol": {
    "testSignal": {
      "signal": "skipped",
      "owner": "architecture",
      "rationale": "Pure type/catalog package; covered by package-level consumers until RFC-XXXX adds direct tests.",
      "reviewAfter": "2026-09-01"
    }
  }
}
```

Rules:

- `signal: "skipped"` requires `owner`, `rationale`, and `reviewAfter`.
- `reviewAfter` must be an ISO date.
- Expired skips are warnings at first; packages marked critical may promote expired skips to errors.
- A package with a no-op `test` script cannot also be `skipped`; remove the no-op script or replace it with a real test command.

### Test maturity tiers

`test.signal.policy.validate` classifies packages by criticality:

| Tier | Package class | First target |
| --- | --- | --- |
| Tier 0 | `@gogol/site-kernel`, `@gogol/site-kernel-checks`, `@gogol/share`, integration adapters | Must keep real tests |
| Tier 1 | Runtime adapters and build-impacting OS packages | Real tests preferred; explicit skip allowed only with short review window |
| Tier 2 | UI/content/catalog packages | Real smoke tests or explicit skip with rationale |
| Tier 3 | Apps | App author/build checks may satisfy first rollout; explicit skip must say why app-level unit tests are deferred |

The first implementation should encode this tiering in a data table, not as scattered conditionals.

### Maintenance debt baseline format

The baseline lives at:

```txt
docs/maintenance-debt.baseline.generated.json
```

It carries the generated marker and deterministic metadata.

```ts
interface MaintenanceDebtBaseline {
  generatedMarker: string;
  meta: {
    schemaVersion: 1;
    deterministic: true;
    generatedAt: null;
    contentHash: string;
    sourceReportHash: string;
  };
  items: MaintenanceDebtBaselineItem[];
}

interface MaintenanceDebtBaselineItem {
  key: string;
  sourceCommand: string;
  severity: "warning" | "info" | "skipped";
  app?: string;
  ruleId?: string;
  file?: string;
  line?: number;
  messageHash: string;
  acceptedAt: string;
  owner: string;
  rationale: string;
  reviewAfter?: string;
}
```

`key` is deterministic from `(sourceCommand, app, ruleId, file, line, normalized message)`.

The baseline intentionally does not store full prose messages as the matching source of truth. It stores enough to compare and triage without becoming a second content dump.

### Maintenance triage policy

`maintenance.debt.triage.report` groups current debt into:

1. New unbaselined warnings.
2. Expired baseline items.
3. High-volume repeated warnings by rule.
4. App-specific content debt.
5. Package/platform debt.
6. Info-only cleanup.

The report should include suggested next actions:

- "Fix now" for new warning debt.
- "Refresh or close baseline" for expired accepted items.
- "Batch cleanup candidate" for high-volume text-normalization findings.
- "Content authoring work" for material credits and demand hierarchy.
- "Platform rule refinement" when many findings share one false-positive pattern.

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/*/package.json`, `packages/os/*/package.json`, `apps/*/package.json`, `integrations/*/package.json` | Own package-level `gogol.testSignal` metadata |
| `docs/maintenance-debt.baseline.generated.json` | Generated accepted advisory debt baseline |
| `packages/os/site-kernel-checks/src/test-signal.ts` | Existing classifier; extended to expose owner/rationale/review metadata |
| `packages/os/site-kernel-checks/src/test-signal-policy.ts` | New policy validator |
| `packages/os/site-kernel-checks/src/maintenance-debt-baseline.ts` | New baseline write/validate/triage command handlers |
| `packages/os/site-kernel-checks/src/ecosystem.ts` | Projects test/debt summary into ACP |
| `packages/os/site-kernel-checks/src/diagnostics/rules.ts` | Registers policy/baseline rule ids |
| `packages/os/site-kernel-checks/src/pipelines/packages-check.ts` | Adds policy and baseline validation |
| `.github/workflows/ci.yml` | Runs policy/baseline validation once accepted |

## Rollout

1. Add `gogol.testSignal` schema parsing to `test.signal.validate` without changing severity.
2. Add `test.signal.policy.validate` in warning mode and register it in `PACKAGES_CHECK_PIPELINE`.
3. Replace current no-op scripts with either real smoke tests or explicit skip metadata.
4. Add `maintenance.debt.baseline.write`, `maintenance.debt.baseline.validate`, and `maintenance.debt.triage.report`.
5. Generate an initial baseline only after human review of current advisory debt categories.
6. Add baseline validation to `ci.local.validate` and `.github/workflows/ci.yml`.
7. Update `docs/ecosystem.generated.json` through `ecosystem.manifest.generate` after adding test/debt summary fields.

## Best project decision

The best first step is not to force 23 packages to gain tests immediately. The repository needs honest test intent first:

- Critical runtime packages keep or gain real tests.
- Pure catalog/UI/app packages may use explicit skipped metadata temporarily, but no package should hide behind a no-op script.
- Maintenance debt should be accepted explicitly through a generated baseline, then new debt should be blocked or highlighted.

This preserves momentum while making the quality signal trustworthy.

## Alternatives considered

Making all absent/noop test signals fail immediately was rejected because it would block unrelated architecture work and force low-value placeholder tests.

Ignoring no-op/absent tests after RFC-0249 was rejected because it would turn `test.signal.validate` into passive reporting instead of an improvement path.

Failing on every current maintenance warning was rejected because many warnings are known rollout debt and content cleanup tasks.

Keeping a manual markdown debt list was rejected because diagnostics are already structured; the baseline should be generated from the canonical ledger.

## Risks

Baselines can become a hiding place for debt. The baseline therefore needs owner, rationale, and optional review dates, plus triage reports that surface expired items.

Package owners may overuse `skipped`. Tiering and review windows should keep skips temporary and explicit.

Generated baseline churn can become noisy if diagnostic keys are unstable. The implementation must normalize messages carefully and preserve stable rule/file locators.

## Acceptance criteria

- [x] `test.signal.policy.validate` is registered and included in `PACKAGES_CHECK_PIPELINE`. (evidence: implemented historically)
- [x] Every no-op test script is replaced by a real test script or removed in favor of explicit `gogol.testSignal.skipped` metadata. (evidence: implemented historically)
- [x] Explicit skipped test metadata requires owner, rationale, and review date. (evidence: implemented historically)
- [x] `test.signal.validate --json` reports owner/rationale/review metadata when present. (evidence: implemented historically)
- [x] `maintenance.debt.baseline.write` writes `docs/maintenance-debt.baseline.generated.json` with deterministic metadata and generated marker. (evidence: original apps retired by RFC-0381, implemented historically)
- [x] `maintenance.debt.baseline.validate` detects new unbaselined advisory debt. (evidence: original apps retired by RFC-0381, implemented historically)
- [x] `maintenance.debt.triage.report --json` groups current debt by priority and source command. (evidence: original apps retired by RFC-0381, implemented historically)
- [x] The Agent Control Plane projects test signal and debt baseline summaries. (evidence: implemented historically)
- [x] `ci.local.validate` and the general CI workflow include the accepted policy/baseline commands. (evidence: implemented historically)
- [x] `pnpm exec site-kernel run packages-check.run --json`, `pnpm exec site-kernel run ci.local.validate --json`, `pnpm test`, `pnpm build`, and `rfc.validate` pass. (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement code changes only when this RFC has `status: accepted` or `status: implemented`.
- Do not add fake tests to satisfy the classifier. A useful smoke test is acceptable; a renamed no-op is not.
- Prefer starting with Tier 0 and Tier 1 packages before UI/app packages.
- Do not generate or commit a maintenance baseline without operator review of the current debt report.
- When creating the baseline file, use the generated-file marker and register generator ownership if the existing governance map requires it.
- Keep warning-mode semantics during first rollout unless a package is explicitly marked critical.
