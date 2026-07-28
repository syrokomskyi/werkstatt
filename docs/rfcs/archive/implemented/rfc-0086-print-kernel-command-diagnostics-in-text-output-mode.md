---
id: RFC-0086
title: "Print kernel command diagnostics in text output mode"
status: implemented
kind: policy
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-05-23
updatedAt: 2026-06-04
implementedAt: 2026-05-24
closedAt:
supersedes: []
supersededBy:
related:
  - RFC-0075
  - RFC-0076
commands:
  proposed: []
  added: []
  changed: []
  removed: []
appsImpacted: []
packagesImpacted:
  - os/site-kernel
successSignals:
  - When a kernel command exits non-zero, the default text output includes every diagnostic message, not just a count.
  - Agents reading text output (the default for workflow scripts) can act on a fail result without re-running with --json.
  - --json output is unchanged; it remains the canonical machine-readable shape.
nonGoals:
  - Changing the KernelCommandResult shape.
  - Removing or modifying the --json output.
---

# RFC-0086: Print kernel command diagnostics in text output mode

## Context

Kernel commands return `KernelCommandResult { data, exitCode, summary }`. The `data` payload typically carries a `diagnostics[]` or `violations[]` array with the actionable text — file paths, rule ids, remediation hints. The CLI's text printer renders `summary` (e.g. `brief.validate: 1 violation(s)`) but does NOT render the diagnostics. Only `--json` reveals them.

During the May 2026 warpgogol-com onboarding, this surfaced repeatedly. Examples:

- `brief.validate` failed with `[ERROR] brief.validate: 1 violation(s)`. The diagnostic — _"apps/warpgogol-com/ already exists. --require-app-absent is set by /00-prepare ... delete it (\`git rm -rf apps/warpgogol-com/\` then commit) and re-run /00-prepare ..."_ — was visible only after `--json`.
- `seo.internal-linking.validate` failed with a generic count. The crash details and the offending file were buried in `--json`.

AI agents that drive workflows read the default text output (it is what the workflow `runs:` invocation prints). They miss every diagnostic and either re-run with `--json` (extra round trip) or proceed blindly.

## Problem

The default text output of a failing kernel command hides the actionable text. This forces both humans tailing terminals and agents driving workflows to re-run with `--json` to learn anything beyond "it failed."

## Decision

The CLI text printer (`packages/os/site-kernel/src/cli/index.ts`) is updated so that when a command's exit code is non-zero AND its `data` contains a recognized diagnostics array (`diagnostics[]`, `violations[]`, `findings[]`, or `details[]`), the printer emits each item on its own line under the `summary`, prefixed with the rule id when available.

Exact format:

```
[ERROR] <command-name>: <summary>
[ERROR]   <rule-id-or-severity> · <file-or-target> · <message>
[ERROR]   <rule-id-or-severity> · <file-or-target> · <message>
```

Capped at 50 lines per command; if exceeded, the last line is `[ERROR]   … and N more (run with --json for the full list)`.

For success and warn cases the existing summary-only output is preserved.

## Architectural fit

- **RFC-0075** workflow files quote commands and expect agents to act on their output; this RFC makes that expectation feasible without each workflow saying "re-run with --json."
- **RFC-0076** phase validation already returns rich diagnostics; this RFC ensures they reach the agent.

## Design

### Detection of the diagnostics field

The printer inspects `result.data` for the first of these arrays:

1. `diagnostics: string[]` — plain text lines.
2. `violations: Array<{ file?, ruleId?, message?, rule? } | string>` — objects or strings.
3. `findings: Array<{ ruleId?, file?, message?, severity? }>` — RFC-0074 audit findings.
4. `details: Array<{ file?, message? }>` — generic.

Whichever exists first wins. If none match, the printer falls back to current behavior (summary only).

### Output format

For each item:

- Prefix: `[ERROR]   ` (3 spaces of indent under the summary).
- Body: `<ruleId or severity>` (if present) · `<file or target>` (if present) · `<message>`.
- Pure strings are printed verbatim with the prefix.

The 50-line cap protects context windows when an aggregate command like `apps-check.run` cascades.

### Failure modes

- `data` is undefined (rare) → fall back to summary-only.
- A diagnostic message has embedded newlines → split and indent each.
- Multiple compatible arrays present → use the first by precedence; do not concatenate (avoid double-counting).

## Rollout

1. Land the printer change in `packages/os/site-kernel/src/cli/index.ts`.
2. Add a test fixture that drives each precedence path.
3. No workflow file changes — workflows automatically benefit on the next pnpm install in a fresh agent session.
4. Update `AGENTS.md` to drop the historical "rerun with --json to see diagnostics" guidance.

## Alternatives considered

- **Force every command to write diagnostics to stderr.** Cleaner stream separation, but breaks the existing `[ERROR]` line-format consumers and is a larger surface change.
- **Add a `--verbose` flag.** Half-measure: agents and humans both want the diagnostics by default on failure; making them opt-in misses the value.

## Risks

- Some commands today rely on the 1-line summary fitting in pipeline log rollups. Mitigation: success cases unchanged; only failures get extra lines, and the 50-line cap bounds the worst case.

## Acceptance criteria

- [x] CLI text printer emits diagnostics on non-zero exit. (evidence: implemented historically)
- [x] All four precedence shapes (diagnostics / violations / findings / details) detected. (evidence: implemented historically)
- [x] 50-line cap with "… and N more" footer. (evidence: implemented historically)
- [x] `--json` output unchanged. (evidence: implemented historically)
- [x] Smoke test: `brief.validate --require-app-absent` against an existing app prints the full remediation in text mode. (evidence: implemented historically)
- [x] `AGENTS.md` updated. (evidence: AGENTS.md:1, agent guide updated)

## Implementation notes for agents

- Agents MAY implement this RFC ONLY when status: accepted.
- Agents MUST NOT change RFC status.
- Implementation MUST add a fixture-based test that the May 2026 warpgogol-com diagnostic _"apps/warpgogol-com/ already exists. --require-app-absent is set ..."_ appears in text output.
