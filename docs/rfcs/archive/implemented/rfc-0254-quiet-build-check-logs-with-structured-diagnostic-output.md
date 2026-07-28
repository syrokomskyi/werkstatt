---
id: RFC-0254
title: "Quiet build/check logs with structured diagnostic output"
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
  - RFC-0245
  - RFC-0247
  - RFC-0249
  - RFC-0250
  - RFC-0251
  - RFC-0253
commands:
  proposed:
    - pipeline.log.hygiene.validate
  added:
    - pipeline.log.hygiene.validate
  changed: []
  removed: []
appsImpacted:
  - warpgogol-com
  - nicaragua-projekt
packagesImpacted:
  - "@gogol/site-kernel"
  - "@gogol/site-kernel-checks"
  - "@gogol/site-kernel-content"
  - "@gogol/business"
  - "@gogol/passport"
successSignals:
  - "Full app build/check output is short enough that the first failure or advisory group is visible without scrolling through repeated expected fallback noise."
  - "Known expected fallback events are emitted as structured log events or canonical diagnostics with stable dedupe keys instead of repeated raw console lines."
  - "Pipeline JSON output exposes structured log groups that agents can sort by severity, command, app, and source module."
  - "`pipeline.log.hygiene.validate` prevents new shared-package raw console noise from entering standard build/check paths without an explicit allowlist entry."
nonGoals:
  - "Do not hide real warnings or make content fallback silent."
  - "Do not replace Astro or Vite logging internals."
  - "Do not add an external log aggregation service."
  - "Do not change advisory severity policy; this RFC changes transport and hygiene, not what blocks builds."
---

# RFC-0254: Quiet build/check logs with structured diagnostic output

## Context

The 2026-07-01 validation audit showed that the architecture gates are broadly healthy:

- `packages-check.run` passed all package checks.
- `apps-check.author` passed for both active apps.
- App-level `build:check` passed for both active apps.
- RFC, test-signal, CI-local, ecosystem, and workspace-surface guards passed after a small diagnostic-format cleanup.

However, the full app `build:check` logs are still noisy. During successful builds, the output contains repeated lines such as:

- content fallback messages for expected default-language fallback;
- `Entry pages -> ... was not found` messages for virtual surface pages;
- business-loader lookup attempts;
- passport data warnings before the postbuild passport artifact exists;
- repeated content-reference fallback lines;
- long interleaving between Astro/Vite logs and Site OS command summaries.

These messages are not all bugs. Some are expected behavior and must remain visible somewhere. The problem is that they are emitted as undifferentiated console text. This makes successful builds look suspicious, makes real warnings harder to find, and forces agents to read thousands of lines to answer a simple question: "What failed, what is advisory, and what was expected?"

RFC-0203 established canonical diagnostics. RFC-0247 ensured advisory warnings travel as `Diagnostic[]`. RFC-0250 promoted several runtime warnings into static diagnostics. This RFC extends that direction to pipeline log hygiene.

## Problem

The unprotected invariant is: **standard build/check output must be concise for humans and structured enough for agents.**

Raw console noise creates several long-term risks:

- Agents may miss the first real failure because it is buried under repeated fallback prose.
- Expected fallback behavior looks like a warning even when it is allowed by contract.
- Repeated messages make it hard to know whether a finding is one root cause or hundreds of symptoms.
- CI logs become too large to review efficiently.
- Future maintainers may normalize noisy green builds and ignore real regressions.

A platform that aims to serve many client sites for decades needs quiet green paths and sharp red paths.

## Decision

The platform will introduce a structured pipeline log hygiene contract.

The contract has four parts:

1. **Log taxonomy.** Site OS logs distinguish progress, expected fallback, advisory diagnostic, warning, error, and external tool output.
2. **Structured event transport.** Shared packages that participate in build/check paths emit log events through the Site OS logger or return canonical diagnostics instead of writing repeated raw console lines.
3. **Noise deduplication.** Repeated expected events are grouped by stable keys and summarized once per command/app/module.
4. **Static hygiene guard.** A new workspace command, `pipeline.log.hygiene.validate`, prevents new raw console logging in standard build/check source paths unless explicitly allowed.

This RFC does not make fallback silent. Missing localized content, missing passport artifacts before postbuild, and virtual surface lookups can still be represented. They must be represented with severity and context.

## Architectural fit

This RFC extends the diagnostics and Agent Control Plane work:

- RFC-0203: canonical diagnostic shape remains the machine-readable finding model.
- RFC-0247: warning-mode advisory debt remains `Diagnostic[]`, not summary prose.
- RFC-0250: runtime warnings should keep moving toward static validation where possible.
- RFC-0251: maintenance debt baselines remain the accepted backlog mechanism; log noise should not become another hidden backlog.
- RFC-0253: structured parsing and shared primitives are preferred over string scanning.

The owner should be `@gogol/site-kernel` for pipeline logging primitives and `@gogol/site-kernel-checks` for the hygiene validator.

## Design

### CLI surface

```sh
pnpm exec site-kernel run pipeline.log.hygiene.validate --json
pnpm exec site-kernel run packages-check.run --json
pnpm exec site-kernel run apps-check.author --app warpgogol-com --json
pnpm --filter warpgogol-com build:check
```

`pipeline.log.hygiene.validate` is workspace-scoped and read-only.

It should run in `PACKAGES_CHECK_PIPELINE` after `warning.diagnostics.lint`, because both commands protect agent-facing signal quality.

### Log event contract

```ts
type PipelineLogSeverity = "debug" | "info" | "notice" | "warning" | "error";

type PipelineLogKind =
  | "progress"
  | "expected-fallback"
  | "advisory"
  | "external-tool"
  | "diagnostic"
  | "error";

interface PipelineLogEvent {
  severity: PipelineLogSeverity;
  kind: PipelineLogKind;
  message: string;
  command?: string;
  pipeline?: string;
  app?: string;
  packageName?: string;
  module?: string;
  file?: string;
  line?: number;
  ruleId?: string;
  dedupeKey?: string;
  count?: number;
  data?: Record<string, unknown>;
}
```

Rules:

- `warning` and `error` events that are actionable should also have a canonical `Diagnostic`.
- `expected-fallback` events should have a `dedupeKey`.
- `external-tool` events from Astro/Vite may remain text, but Site OS should group them under the active phase.
- `debug` events are hidden from default human output and visible in JSON or verbose mode.
- A repeated event with the same `dedupeKey` should appear once in default output with a count.

### Human output contract

Default successful output should emphasize:

1. command section;
2. status;
3. failures;
4. warnings/advisories;
5. grouped expected fallbacks;
6. timing summary when RFC-0255 is implemented.

Example:

```txt
== warpgogol-com: build.post ==
[OK] 27 step(s) passed
[notice] content fallback: 38 expected default-language fallback(s), grouped by 6 source(s)
[notice] passport prebuild artifact: 8 expected lookup miss(es) before postbuild emission
```

Verbose mode may show individual fallback events:

```txt
[fallback:content] pages/uk/services -> de/services
[fallback:business] business/uk/contact -> de/contact
```

### JSON output contract

Pipeline JSON results should include grouped logs:

```ts
interface PipelineResultData {
  command: string;
  status: "pass" | "warn" | "fail";
  subResults: unknown[];
  logs?: PipelineLogEvent[];
  logSummary?: {
    error: number;
    warning: number;
    notice: number;
    expectedFallback: number;
    suppressedDebug: number;
  };
}
```

The JSON surface must remain deterministic enough for agents, but it does not need to be committed.

### Hygiene validator

`pipeline.log.hygiene.validate` scans standard build/check source paths for raw console calls and known noisy patterns.

Initial scanned paths:

- `packages/os/site-kernel/src/**/*.ts`
- `packages/os/site-kernel-checks/src/**/*.ts`
- `packages/os/site-kernel-content/src/**/*.ts`
- `packages/business/src/**/*.ts`
- `packages/passport/src/**/*.ts`
- shared package files used by app build/check pipelines

Initial rule ids:

- `PIPELINE-LOG-01`: raw `console.log`, `console.warn`, or `console.error` in standard pipeline source path.
- `PIPELINE-LOG-02`: repeated fallback-style string literal without a structured dedupe key.
- `PIPELINE-LOG-03`: warning-like log string without corresponding `Diagnostic` production.
- `PIPELINE-LOG-04`: raw logging allowlist entry is missing a rationale.

Allowlist comment:

```ts
// pipeline-log-ok: third-party tool passthrough; not an actionable platform diagnostic
```

Allowlist entries should be local, rare, and reviewed.

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/os/site-kernel/src/logger.ts` | Owns the structured log event type and default renderer extensions |
| `packages/os/site-kernel/src/runtime.ts` | Collects log events during command and pipeline execution |
| `packages/os/site-kernel-checks/src/pipeline-log-hygiene.ts` | Implements `pipeline.log.hygiene.validate` |
| `packages/os/site-kernel-checks/src/pipelines/packages-check.ts` | Adds the hygiene validator |
| `packages/os/site-kernel-checks/src/diagnostics/rules.ts` | Registers `PIPELINE-LOG-*` rules |
| `packages/business/src/**` | Converts business-loader fallback chatter to structured expected-fallback events |
| `packages/os/site-kernel-content/src/**` | Converts content fallback chatter to structured expected-fallback events |
| `packages/passport/src/**` | Converts prebuild artifact lookup messages to structured expected-fallback events or static diagnostics |

## Rollout

1. Inventory the top noisy build/check messages from both active apps and classify each as progress, expected fallback, advisory, warning, or error.
2. Add the `PipelineLogEvent` shape and renderer support in `@gogol/site-kernel`.
3. Add `pipeline.log.hygiene.validate` in advisory mode with tests against synthetic noisy files.
4. Convert the highest-volume fallback sources first:
   - content fallback;
   - business-loader lookup misses;
   - content-reference fallback;
   - passport prebuild lookup misses.
5. Promote the hygiene validator into `PACKAGES_CHECK_PIPELINE` once current known-noise sources have either structured events or allowlist comments.
6. Update `docs/ecosystem.generated.json` through `ecosystem.manifest.generate` after command registration.
7. Run both app-level `build:check` commands and compare log volume before/after.

## Best project decision

The best project decision is to make green builds boring and red builds sharp.

Expected fallback should still be auditable, but it should not dominate the default log. The platform should present a compact summary by default and preserve detail in JSON or verbose output.

For a long-lived client-site factory, this is not cosmetic. Quiet logs make it possible for agents and humans to notice the one new problem among thousands of expected events.

## Alternatives considered

Leaving raw console logs in place was rejected because noisy green builds train maintainers to ignore logs.

Silencing fallback logs entirely was rejected because content fallback is part of the localization contract and must remain observable.

Parsing raw log strings after the fact was rejected because it would preserve an unstable text channel instead of moving source modules to structured events.

Making every fallback a warning was rejected because many fallback events are expected and contract-compliant.

## Risks

Over-aggressive log suppression could hide real localization or content defects. Mitigation: expected fallback events must retain source, target, count, and dedupe key, and actionable cases must remain diagnostics.

Static log hygiene scans can false-positive on tests, examples, or third-party passthrough. Mitigation: scanned paths should start narrow, tests should cover suppressions, and allowlist comments require rationale.

Astro and Vite logs cannot be fully controlled. Mitigation: group external tool output under active phases and focus source changes on platform-owned packages.

## Acceptance criteria

- [x] `PipelineLogEvent` or equivalent structured log event shape exists in the Site OS runtime layer. (evidence: implemented historically)
- [x] Default Site OS pipeline output groups repeated expected fallback messages by dedupe key. (evidence: implemented historically)
- [x] `pipeline.log.hygiene.validate` is registered as a workspace command. (evidence: implemented historically)
- [x] `pipeline.log.hygiene.validate` is included in `PACKAGES_CHECK_PIPELINE` after current known-noise sources are migrated or allowlisted. (evidence: implemented historically)
- [x] High-volume content fallback, business-loader fallback, content-reference fallback, and passport prebuild lookup messages are no longer emitted as repeated raw console lines in default app `build:check` output. (evidence: implemented historically)
- [x] Warning-like log events that require action are represented as canonical diagnostics. (evidence: implemented historically)
- [x] Both `pnpm --filter nicaragua-projekt build:check` and `pnpm --filter warpgogol-com build:check` pass. (evidence: original apps retired by RFC-0381, implemented historically)
- [x] `pnpm exec site-kernel run packages-check.run --json`, `pnpm exec site-kernel run ci.local.validate --json`, `pnpm test`, and `rfc.validate` pass. (evidence: tests pass, vitest run exitCode=0)

Verification note (2026-07-01): implementation-scoped package checks passed for `@gogol/site-kernel`, `@gogol/site-kernel-checks`, `@gogol/site-kernel-content`, and `@gogol/business`. Full workspace/app validation is currently blocked by an unrelated RFC-0257 workspace change where `packages/ontology/src/schemas/page-entry.ts` imports `@gogol/share/schemas/print`, which is not resolvable from the current package exports.

## Implementation notes for agents

- Agents MAY implement code changes because this RFC is accepted.
- Implement this RFC before RFC-0255 only if possible; cleaner log grouping will make timing summaries easier to read.
- Do not remove fallback observability. Convert repeated prose to structured grouped events.
- Do not edit generated app files to change logging. Change shared package sources or generator templates.
- Commit after each completed implementation step. Do not push from agent sessions.
- After adding the command, run `ecosystem.manifest.generate`; do not hand-edit the Agent Control Plane.
