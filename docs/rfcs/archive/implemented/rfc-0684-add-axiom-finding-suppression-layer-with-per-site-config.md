---
id: RFC-0684
title: "Add Axiom finding suppression layer with per-site config"
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
createdAt: 2026-08-04
updatedAt: 2026-08-04
enhancedAt: 2026-08-04
implementedAt: 2026-08-04
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0627
  - RFC-0628
  - RFC-0629
  - RFC-0630
  - RFC-0633
  - RFC-0665
  - RFC-0667
  - RFC-0668
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-49
  - DNA-59
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
  added:
    - suppressions.validate
  changed:
    - mission.check
    - axiom.report
    - leitstand.dev-deploy
    - leitstand.propagate
  removed: []
appsImpacted: []
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - "@warpgogol/site-kernel-checks"
  - "@warpgogol/site-kernel-handoff"
successSignals:
  - "Axiom gate on dev channel produces zero false-positive warnings from the four known categories"
  - "suppressions.validate passes on systems/axiom-suppressions.yaml"
  - "Suppressed findings are marked suppressed: true in evidence files with rule reference"
  - "leitstand.propagate does not block on findings suppressed by mission.check"
nonGoals:
  - "Does not modify Axiom CLI internals — suppression is a post-filter in the Werkstatt adapter, not in the external tool"
  - "Does not suppress findings from methodologies that are inactive via methodologies config (RFC-0665 handles that)"
  - "Does not introduce a new DNA invariant — satisfies existing DNA-49 and DNA-59"
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

# RFC-0684: Add Axiom finding suppression layer with per-site config

## Context

The Axiom verification gate (`mission.check --external-preview`) was introduced by RFC-0627 and refined by RFC-0628 (workpiece-based dev-deploy), RFC-0629 (external-only mode), and RFC-0630 (methodologies config). RFC-0633 added `axiom.report` as a renderer. RFC-0665 made methodologies configurable per-workshop. RFC-0667 introduced the `auditId`/`missionId` boundary adapter pattern. RFC-0668 added a Chromium pre-flight check.

During the first real dev-channel deployment of warpgogol-com (mission m000027, 2026-08-04), the Axiom gate produced 810 findings: 20 real issues and 790 false positives across four categories. The 790 false positives will recur on every client site in the Werkstatt pipeline because they stem from structural mismatches between what Axiom checks and what the Werkstatt deployment context expects:

| Category | Count | Rule IDs | Root cause |
| --- | --- | --- | --- |
| A. Dev vs Prod canonical/sitemap | 226 | `seo-runtime.missing-from-sitemap`, `seo-runtime.canonical-mismatch` | Sitemap/canonical point to production domain; Axiom crawls the dev channel URL and reports a mismatch |
| B. Non-HTML resources | 4 | `seo-runtime.meta-missing`, `seo-runtime.structured-data-missing` | JSON/TXT files (e.g. `sbom.cdx.json`) checked for HTML metadata |
| C. Browser deprecation | 448 | `runtime-health.console-error` | Chromium Performance API deprecation warning emitted by the browser, not site code |
| D. Render-blocking CSS | 112 | `performance-vitals.render-blocking` | Standard Astro CSS preload pattern flagged as render-blocking |

Axiom is an external tool whose job is to find everything. The Werkstatt has no mechanism to declare which findings are false positives for its pipeline context.

## Problem

DNA-49 (Fleet propagation) gates `leitstand.propagate` on zero-error Axiom evidence and gates `leitstand.dev-deploy` on the Axiom verification gate via `mission.check`. DNA-59 (Evidence preservation) requires evidence to be an append-only archive. Neither invariant addresses the case where Axiom produces correct findings that are irrelevant to the Werkstatt pipeline context.

The gap is concrete:

1. **`mission.check` (`packages/os/site-kernel-checks/src/axiom-adapter.ts`)** counts all findings from `runAxiomCheck()` without any post-filter. The `findingsCount`, `findings.errors`, `findings.warnings`, and `closureDecision` fields reflect raw Axiom output including false positives.
2. **`leitstand.propagate` (`packages/os/site-kernel-handoff/src/leitstand/`)** reads `study-run.json` and blocks on high/critical findings — including false positives that `mission.check` could not suppress.
3. **`axiom.report` (`packages/os/site-kernel-checks/src/axiom-adapter.ts`)** renders all findings without distinguishing suppressed from active.
4. **No config mechanism exists** for declaring that certain rule IDs, message patterns, or content types are false positives in a given channel or site context.

Without a suppression layer, every dev-channel deployment of every client site will produce the same 790 false positives, requiring manual review each time. This undermines the Axiom gate's usefulness as an automated quality barrier.

## Decision

The Werkstatt gains a two-level Axiom finding suppression layer: a post-filter in `axiom-adapter.ts` that marks findings as `suppressed: true` based on configurable rules, and a new `suppressions.validate` command that validates the suppression config. Suppression rules live in `systems/axiom-suppressions.yaml` (workshop-level defaults) and optionally in `missions/{mission}/workpiece/axiom-suppressions.yaml` (per-site overrides). `mission.check`, `leitstand.propagate`, and `axiom.report` all respect suppressions when counting findings, evaluating gate decisions, and rendering reports. The RFC ships default suppression rules for the four known false-positive categories.

## Architectural fit

- **DNA-49 (Fleet propagation):** `leitstand.propagate` and `leitstand.dev-deploy` rely on the Axiom gate. This RFC ensures the gate is not blocked by false positives, making the propagation gate meaningful rather than noisy. Suppressions are applied in `mission.check` (post-filter after `runAxiomCheck`) and re-applied in `leitstand.propagate` when reading `study-run.json` — this handles pre-suppression evidence that lacks `suppressed` flags without requiring a re-run of `leitstand.dev-deploy`.
- **DNA-59 (Evidence preservation):** Suppressed findings are NOT removed from evidence files. They are marked `suppressed: true` with a reference to the matching rule. The append-only archive remains complete; the suppression layer only affects gate decisions and counts.
- **RFC-0665 (Methodologies config):** Orthogonal. Methodologies config controls which instruments are active and their `blockOn` severity thresholds. Suppressions control which findings from active instruments are false positives for the pipeline context. A methodology can be active and still have some of its findings suppressed.
- **RFC-0667 (Boundary adapter pattern):** The suppression post-filter lives in the same `axiom-adapter.ts` boundary layer, between `runAxiomCheck()` and the finding count/closure evaluation. It does not modify the external Axiom CLI.
- **Site OS operator model:** `suppressions.validate` is a workspace-scoped command in `@warpgogol/site-kernel-checks`. The suppression config loader is a new module (`suppressions-config.ts`) alongside the existing `methodologies-config.ts`.

## Design

### CLI surface

```sh
# Validate suppression config (workshop + per-site if present)
pnpm exec werkstatt run suppressions.validate --json

# mission.check gains --channel flag
pnpm exec werkstatt run mission.check \
  --mission warpgogol-com-m000027 \
  --external-preview \
  --base-url https://dev.warpgogol.com \
  --channel dev
```

`--channel` accepts `dev | alt | main`. Callers that already know the channel pass it explicitly:

- `leitstand.dev-deploy` passes `--channel dev` to `mission.check` (it calls `mission.check` via `executeKernelCommand` in `runMissionCheckWithResilience`). This ensures dev-channel suppression rules (e.g. `channelNot: main`) fire during the Axiom verification gate. The `--channel dev` flag is added to the `argv` array alongside `--external-preview`, `--base-url`, `--commit-sha`, `--max-duration`, and `--no-report`.
- `leitstand.propagate` does NOT call `mission.check` — it reads `study-run.json` directly. It re-applies suppressions via `applySuppressions` (imported from `@warpgogol/site-kernel-checks/suppressions-config` subpath export) to handle pre-suppression evidence, then skips findings marked `suppressed: true` when evaluating `isBlockingFinding`. No `--channel` flag needed on `leitstand.propagate` itself — the channel is determined from the release context (`alt` for propagate, `main` for promote).
- Manual invocations default to `main` if omitted (backward compatibility)

### TypeScript contracts

```ts
// packages/os/site-kernel-checks/src/suppressions-config.ts

export const suppressionRuleSchema = z.object({
  ruleId: z.string().min(1),
  category: z.string().min(1),
  // Mutually exclusive condition fields — at least one must be present
  channel: z.enum(["dev", "alt", "main"]).optional(),
  channelNot: z.enum(["dev", "alt", "main"]).optional(),
  contentType: z.array(z.string()).optional(),
  urlPattern: z.string().optional(),
  messagePattern: z.string().optional(),
  descriptionPattern: z.string().optional(),
  reason: z.string().min(1),
});

export const suppressionsConfigSchema = z.object({
  suppressions: z.array(suppressionRuleSchema),
});

export type SuppressionRule = z.infer<typeof suppressionRuleSchema>;
export type SuppressionsConfig = z.infer<typeof suppressionsConfigSchema>;

export const WORKSHOP_SUPPRESSIONS_PATH = "systems/axiom-suppressions.yaml";
export const WORKPIECE_SUPPRESSIONS_PATH = "axiom-suppressions.yaml";

export function loadWorkshopSuppressions(workspaceRoot: string): SuppressionsConfig | undefined;
export function loadWorkpieceSuppressions(missionDir: string): SuppressionsConfig | undefined;
export function mergeSuppressions(
  workshop: SuppressionsConfig | undefined,
  workpiece: SuppressionsConfig | undefined,
): SuppressionRule[];

// Post-filter function — returns a new array with suppressed findings marked
export function applySuppressions(
  findings: Finding[],
  rules: SuppressionRule[],
  context: { channel: string },
): Finding[];
```

```ts
// New fields added to the existing Finding type from @syrokomskyi/axiom-factory-app
// These are added by applySuppressions() — the existing fields are untouched.
interface SuppressedBy {
  ruleIndex: number;
  ruleId: string;
  category: string;
  reason: string;
}

// Augmented Finding shape (suppressed + suppressedBy are optional, added only
// when a suppression rule matches)
interface Finding {
  // ... all existing fields from AxiomCheckResult.findings[] ...
  suppressed?: boolean;
  suppressedBy?: SuppressedBy;
}
```

```ts
// packages/os/site-kernel-checks/src/suppressions-validate.ts

export async function runSuppressionsValidate(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>>;
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `systems/axiom-suppressions.yaml` | Workshop-level default suppression rules (created by this RFC) |
| `missions/{mission}/workpiece/axiom-suppressions.yaml` | Per-site override suppressions (optional, created by operator) |
| `packages/os/site-kernel-checks/src/suppressions-config.ts` | Zod schemas, loader, merger, post-filter function |
| `packages/os/site-kernel-checks/src/suppressions-validate.ts` | `suppressions.validate` command handler |
| `packages/os/site-kernel-checks/src/axiom-adapter.ts` | Modified: calls `applySuppressions` after `runAxiomCheck`, adds `--channel` flag |
| `packages/os/site-kernel-checks/package.json` | Modified: add subpath export `./suppressions-config` for cross-package import from `@warpgogol/site-kernel-handoff` |
| `packages/os/site-kernel-handoff/src/leitstand/leitstand-commands.ts` | Modified: `leitstand.propagate` re-applies suppressions via `applySuppressions` when reading `study-run.json`; `leitstand.dev-deploy` passes `--channel dev` to `mission.check` |
| `packages/os/site-kernel-checks/src/command-tables/infra-contracts.ts` | Modified: add `--channel` flag to mission.check command table entry |

### Output format

`suppressions.validate --json`:

```json
{
  "command": "suppressions.validate",
  "status": "pass",
  "diagnostics": [],
  "summary": {
    "error": 0,
    "warning": 0,
    "info": 0
  }
}
```

`mission.check` with suppressions applied — the `findingsCount` and `findings` fields exclude suppressed findings:

```json
{
  "command": "mission.check",
  "status": "pass",
  "findingsCount": { "critical": 0, "high": 0, "medium": 2, "low": 5, "info": 13 },
  "findings": { "errors": 0, "warnings": 20, "total": 20 },
  "suppressionSummary": {
    "totalSuppressed": 790,
    "byCategory": {
      "channel-mismatch": 226,
      "non-html-resource": 4,
      "browser-deprecation": 448,
      "render-blocking-css": 112
    }
  },
  "closureDecision": { "satisfied": true, "status": "passed", "reason": "All active findings below gate threshold" }
}
```

### Suppression matching logic

For each finding, the post-filter evaluates rules in order. The first matching rule wins:

1. **`channelNot`** — suppress if `context.channel !== channelNot` (e.g. `channelNot: main` suppresses on dev/alt)
2. **`channel`** — suppress if `context.channel === channel` (e.g. `channel: dev` suppresses only on dev)
3. **`contentType`** — suppress if the finding's URL ends with one of the listed extensions (e.g. `.json`, `.txt`)
4. **`urlPattern`** — suppress if the finding's URL matches the regex
5. **`messagePattern`** — suppress if the finding's message contains the pattern (substring match)
6. **`descriptionPattern`** — suppress if the finding's description contains the pattern (substring match)

A rule may combine multiple conditions — ALL must match for the rule to fire (AND logic). For example, `ruleId: seo-runtime.canonical-mismatch` + `channelNot: main` suppresses canonical mismatch findings only on non-production channels.

### Default suppression rules

The RFC ships `systems/axiom-suppressions.yaml` with these defaults:

```yaml
suppressions:
  # Category A: Dev vs Prod canonical/sitemap (226 findings)
  - ruleId: seo-runtime.canonical-mismatch
    category: channel-mismatch
    channelNot: main
    reason: "Canonical URL points to production domain; scanning non-production channel"
  - ruleId: seo-runtime.missing-from-sitemap
    category: channel-mismatch
    channelNot: main
    reason: "Sitemap entries point to production domain; scanning non-production channel"

  # Category B: Non-HTML resources (4 findings)
  - ruleId: seo-runtime.meta-missing
    category: non-html-resource
    contentType: [".json", ".txt"]
    reason: "Non-HTML resource checked for HTML metadata"
  - ruleId: seo-runtime.structured-data-missing
    category: non-html-resource
    contentType: [".json", ".txt"]
    reason: "Non-HTML resource checked for structured data"

  # Category C: Browser deprecation warnings (448 findings)
  - ruleId: runtime-health.console-error
    category: browser-deprecation
    messagePattern: "Deprecated API for given entry type"
    reason: "Chromium Performance API deprecation warning, not site code"

  # Category D: Render-blocking CSS (112 findings)
  - ruleId: performance-vitals.render-blocking
    category: render-blocking-css
    descriptionPattern: "preload" # Combined with ruleId AND logic — only matches render-blocking findings mentioning preload
    reason: "Standard Astro CSS preload pattern, not a real render-blocking issue"
```

### Failure modes

- **`suppressions.validate` exits 1** on schema violations, invalid regex in patterns, or conflicting rules (same ruleId + same conditions). Warns on unknown ruleId patterns — the list of known rule IDs is collected from the most recent `study-run.json` in any mission evidence directory. If no evidence exists, rule ID validation is skipped.
- **`mission.check` with invalid suppression config** logs a warning and proceeds without suppressions (fail-open). This prevents a config error from blocking the pipeline.
- **`mission.check` without `--channel`** defaults to `main` — suppression rules with `channelNot: main` do not fire. This is backward-compatible behavior.
- **Per-site suppressions complement workshop defaults** — if a per-site file exists, its rules are merged after workshop rules. Per-site rules can ADD new suppressions (for ruleIds or conditions not covered by workshop rules) but cannot REMOVE workshop-level suppressions. A per-site rule with the same `ruleId` + conditions as a workshop rule is a no-op (already suppressed). A per-site rule with different conditions can only suppress additional findings.
- **Pre-suppression evidence** — `leitstand.propagate` re-applies suppressions when reading `study-run.json`: it imports `applySuppressions` from `@warpgogol/site-kernel-checks/suppressions-config` via subpath export, loads workshop + workpiece suppression configs, and marks findings as `suppressed: true` before evaluating `isBlockingFinding`. This handles old evidence that lacks `suppressed` flags without requiring a re-run of `leitstand.dev-deploy`.
- **`axiom.report` rendering** — suppressed findings are rendered in a separate collapsible "Suppressed Findings" section, visually de-emphasized (greyed out). The report header includes a suppression summary count. Active findings are rendered as before. This does not change the exit code (axiom.report always exits 0).

## Rollout

- **Default behavior on introduction:** `systems/axiom-suppressions.yaml` is created with the four default rules. `mission.check` applies suppressions automatically when the config file exists. No opt-in flag required.
- **Backward compatibility:** `mission.check` without `--channel` defaults to `main`. Existing callers that do not pass `--channel` will not trigger channel-based suppressions (e.g. `channelNot: main` rules do not fire on `main`). This preserves current behavior for production deployments.
- **Caller updates:** `leitstand.dev-deploy` is updated to pass `--channel dev` to `mission.check` in the same implementation commit. `leitstand.propagate` is updated to re-apply suppressions via `applySuppressions` imported from `@warpgogol/site-kernel-checks/suppressions-config` (subpath export) when reading `study-run.json` — this handles pre-suppression evidence without requiring a re-run. No grace period needed.
- **`suppressions.validate` in pipeline:** Added to `mission.validate` pipeline (after `methodologies.validate`). This catches config errors before mission close.
- **New sites:** Automatically benefit from workshop-level defaults. Per-site overrides are optional and only needed when a site has unique false-positive patterns.
- **No deprecation:** This RFC does not deprecate or supersede any existing command. It adds a new command and modifies existing ones additively.

## Alternatives considered

1. **Suppress in Axiom CLI itself.** Rejected — Axiom is an external tool whose job is to find everything. Adding suppression logic to Axiom would couple it to Werkstatt-specific pipeline semantics (channels, deployment context) and make it less reusable. The boundary between "find everything" (Axiom) and "decide what's relevant" (Werkstatt) should be explicit.

2. **Extend `systems/methodologies.md` (RFC-0665).** Rejected — methodologies config controls instrument activation and `blockOn` severity. Suppressions are a different concern: which findings from active instruments are false positives for the pipeline context. Mixing them in one config file would conflate two orthogonal concepts and complicate the Zod schema.

3. **Workshop-level only (no per-site overrides).** Rejected — while the four default categories are universal, future sites may have unique false-positive patterns (e.g. a site with a non-standard CDN that triggers a specific rule). Per-site overrides provide an escape hatch without requiring an RFC for each new pattern.

4. **Per-site only (no workshop defaults).** Rejected — the four known categories are universal across all client sites. Without workshop defaults, every site would need to duplicate the same suppression rules, creating maintenance burden and inconsistency.

5. **Remove suppressed findings from evidence entirely.** Rejected — DNA-59 requires evidence preservation as an append-only archive. Removing findings would destroy the audit trail. Marking findings as `suppressed: true` preserves the full evidence while excluding them from gate decisions.

## Risks

- **Over-suppression:** A suppression rule with a broad pattern (e.g. `messagePattern: "deprecated"`) could suppress real findings. Mitigation: `suppressions.validate` warns on broad patterns; default rules use specific patterns verified against the 810-finding dataset.
- **Rule ID drift:** If Axiom renames a rule ID, suppression rules silently stop matching. Mitigation: `suppressions.validate` checks that each `ruleId` in the config matches at least one known Axiom rule ID (warning, not error — Axiom may add new rules between versions).
- **Agent misuse:** Agents may add suppression rules to hide real issues instead of fixing them. Mitigation: every suppression rule requires a `reason` field. `suppressions.validate` reports the total count of suppressed findings per rule. Code review (fo-review) flags new suppression rules added in implementation commits.
- **Performance:** The post-filter iterates over all findings for each rule. With 810 findings and 6 rules, this is ~4860 comparisons — negligible. No performance risk.
- **Per-site override conflict:** A per-site file could accidentally widen suppressions. Mitigation: per-site rules are merged after workshop rules and cannot un-suppress what the workshop suppresses (enforced by `mergeSuppressions`).

## Acceptance criteria

- [x] `suppressions-config.ts` module exists in `@warpgogol/site-kernel-checks` with Zod schemas, loader, merger, and `applySuppressions` function (evidence: `packages/os/site-kernel-checks/src/suppressions-config.ts`, commit 2fe30273)
- [x] `suppressions.validate` command registered and passes on `systems/axiom-suppressions.yaml` (evidence: `packages/os/site-kernel-checks/src/suppressions-validate.ts`, `src/command-tables/infra-contracts.ts`, commit f6a35536)
- [x] `systems/axiom-suppressions.yaml` exists with default rules for all four categories (evidence: `systems/axiom-suppressions.yaml`, commit 4654218b)
- [x] `mission.check` accepts `--channel` flag and applies suppressions after `runAxiomCheck` (evidence: `packages/os/site-kernel-checks/src/axiom-adapter.ts:185-194,307-319`, commit ae6bcda1)
- [x] `mission.check` output includes `suppressionSummary` when suppressions are applied (evidence: `packages/os/site-kernel-checks/src/axiom-adapter.ts:59-62,326`, commit ae6bcda1)
- [x] Suppressed findings in evidence files are marked `suppressed: true` with `suppressedBy` reference (evidence: `packages/os/site-kernel-checks/src/suppressions-config.ts:156-170`, commit 2fe30273)
- [x] `leitstand.propagate` applies suppressions when evaluating gate decision from `study-run.json` (evidence: `packages/os/site-kernel-handoff/src/leitstand/leitstand-commands.ts:1270-1280`, commit 877be0c5)
- [x] `axiom.report` renders suppressed findings separately from active findings (evidence: `packages/os/site-kernel-checks/src/axiom-adapter.ts:397-459`, commit 0009aabb)
- [x] `leitstand.dev-deploy` passes `--channel dev` to `mission.check` (evidence: `packages/os/site-kernel-handoff/src/leitstand/leitstand-commands.ts:204`, commit 877be0c5)
- [x] `suppressions.validate` integrated into `mission.validate` pipeline (evidence: `packages/os/site-kernel-checks/src/pipelines/packages-check.ts:190-191`, commit bd964b54)
- [x] `command.manifest.generate` run to update `docs/command-manifest.generated.yaml` (evidence: `docs/command-manifest.generated.yaml`, commit 10941884)
- [x] `AGENTS.md` for `@warpgogol/site-kernel-checks` documents the suppression layer (evidence: `packages/os/site-kernel-checks/AGENTS.md:27-28`, commit 10941884)
- [x] `rfc.validate` passes on this file before merging (evidence: `rfc.validate --id RFC-0684` exit 0, 2026-08-04)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- For RFCs created on or after 2026-07-07 with acceptance probes: before stamping `implemented`, run `site-kernel run rfc.verification.emit --id <this-rfc-id>` and commit the evidence file in the same commit (RFC-0330 amended transition precondition).
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
- Agents MUST run `command.manifest.generate` after registering `suppressions.validate` and adding `--channel` to `mission.check` (RFC-CMD-02).
- Agents MUST NOT add suppression rules with broad patterns (e.g. `messagePattern: "error"`) — patterns must be specific enough to match only known false positives. `suppressions.validate` warns on overly broad patterns.
- Agents MUST NOT use suppression rules to hide real issues. Every suppression rule MUST include a `reason` field explaining why the finding is a false positive. Code review flags new suppression rules for scrutiny.
- The `applySuppressions` function MUST be pure — it must not modify the input findings array. It returns a new array with suppressed findings marked.
- The `mergeSuppressions` function MUST enforce that per-site rules cannot un-suppress workshop-level suppressions. A per-site rule with the same `ruleId` + conditions as a workshop rule is a no-op (already suppressed). A per-site rule with different conditions can only suppress additional findings.
