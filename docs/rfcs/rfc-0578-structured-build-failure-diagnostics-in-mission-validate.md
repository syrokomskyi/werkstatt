---
id: RFC-0578
title: "Structured build failure diagnostics in mission.validate"
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
createdAt: 2026-07-28
updatedAt: 2026-07-28
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0203
  - RFC-0356
  - RFC-0480
  - RFC-0576
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-35
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
    - mission.validate
  removed: []
appsImpacted: []
packagesImpacted:
  - "@warpgogol/site-kernel-handoff"
  - "@warpgogol/site-kernel-checks"
successSignals:
  - "Astro build failures produce structured BUILD-01 diagnostics with pattern-matched fixHints"
  - "Agents can resolve common build errors without reading build logs"
nonGoals:
  - "Does not change the set of static checks in build.check"
  - "Does not replace the Astro build with a custom validator"
  - "Does not register BUILD-01 in the DIAGNOSTIC_RULES registry (it is a mission-level diagnostic, not a content check)"
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

# RFC-0578: Structured build failure diagnostics in mission.validate

## Context

`mission.validate` (RFC-0356) runs `build.prepare` → `build.check` → `astro build` in sequence. When the Astro build fails, the error is captured as a raw string in `buildError` (`mission-materialization-commands.ts:192`) and stored in `report.build.error`. The result summary says `[mission.validate] <id> validation FAILED (astro build failed)` — no structured diagnostic is emitted.

RFC-0480 added the Astro build step to catch runtime errors that static validators cannot detect (content references, missing collections, import failures). However, the build error output is a raw string — often hundreds of lines of Astro/Vite stack trace. An agent must read through the stack trace to identify the root cause.

In mission warpgogol-com-m000016, the build failed with an `ENOENT` error because `loadSystemManifestSync` was called during prerender and `system.md` was not found at the resolved path. The agent spent significant time tracing the error through middleware template code before identifying that the fix was guarding the call with `import.meta.env.DEV`.

## Problem

DNA-35 (`app.contract.full` as the canonical readiness signal) requires `mission.validate` to pass before `mission.close`. When the Astro build fails, the validation result contains a raw error string but no structured `Diagnostic` — agents parsing `ForgeCommandResult.data.diagnostics` find nothing about the build failure.

Common build failure patterns are recurrent across missions:

1. **ENOENT on system.md during prerender** — `loadSystemManifestSync` resolves `__dirname` differently in build vs dev mode. Fix: guard with `import.meta.env.DEV`.
2. **Module not found** — missing import in `astro.config.mjs` or a package not installed. Fix: check import path or run `pnpm install`.
3. **Content collection schema error** — frontmatter does not match the Zod schema. Fix: check the frontmatter against the collection schema.
4. **TypeScript error in .astro component** — type mismatch in component props. Fix: check the component schema.

Each of these patterns has a distinct error signature in the build output (stack trace text). An agent that can pattern-match the error signature can produce an actionable fixHint without reading the full stack trace.

## Decision

`mission.validate` wraps Astro build failures in a structured `BUILD-01` diagnostic with pattern matching for common failure causes. The diagnostic includes the matched pattern name, the relevant error excerpt, and an actionable `fixHint` specific to the failure cause.

## Architectural fit

- **DNA-35 (`app.contract.full`):** `mission.validate` is the gate for `mission.close`. Structured build diagnostics make the gate output agent-friendly.
- **RFC-0356 (mission lifecycle):** `mission.validate` is defined by RFC-0356. This RFC enriches its output without changing its gating behavior.
- **RFC-0480 (Astro build in mission.validate):** RFC-0480 added the Astro build step. This RFC structures its failure output.
- **RFC-0203 (canonical Diagnostic model):** The build diagnostic uses the canonical `Diagnostic` shape — `ruleId: "BUILD-01"`, `severity: "error"`, `message`, `fixHint`, `data`.
- **Site OS operator model:** No new command. `mission.validate` gains a `diagnostics` array in its result data when the build fails.

## Design

### CLI surface

No CLI surface changes. `mission.validate` is invoked identically.

### TypeScript contracts

#### Build failure pattern matcher

In `packages/os/site-kernel-handoff/src/mission/mission-materialization-commands.ts`:

```ts
interface BuildFailurePattern {
  id: string;
  test: (errorOutput: string) => boolean;
  fixHint: string;
  excerpt: (errorOutput: string) => string;
}

const BUILD_FAILURE_PATTERNS: BuildFailurePattern[] = [
  {
    id: "enoent-system-manifest",
    test: (out) => /ENOENT.*system\.md|loadSystemManifestSync.*not found/i.test(out),
    fixHint: "Guard loadSystemManifestSync with import.meta.env.DEV — it resolves __dirname differently during prerender. See middleware.template.ts.",
    excerpt: (out) => extractErrorLine(out, /ENOENT|loadSystemManifestSync/i),
  },
  {
    id: "module-not-found",
    test: (out) => /Cannot find module|Module not found|ERR_MODULE_NOT_FOUND/i.test(out),
    fixHint: "Check the import path in the file shown above. If it's a workspace package, run pnpm install. If it's a relative path, verify the file exists.",
    excerpt: (out) => extractErrorLine(out, /Cannot find module|Module not found/i),
  },
  {
    id: "content-schema-error",
    test: (out) => /schema|frontmatter|collection.*error|ZodError/i.test(out),
    fixHint: "Check the frontmatter of the file shown above against its content collection schema. Look for missing required fields or type mismatches.",
    excerpt: (out) => extractErrorLine(out, /schema|frontmatter|ZodError/i),
  },
  {
    id: "typescript-error",
    test: (out) => /error TS\d+:|Type .* is not assignable/i.test(out),
    fixHint: "Fix the TypeScript type mismatch in the file shown above. Check the component props schema or the type declaration.",
    excerpt: (out) => extractErrorLine(out, /error TS\d+/i),
  },
];

function matchBuildFailure(errorOutput: string): BuildFailurePattern | undefined {
  return BUILD_FAILURE_PATTERNS.find((p) => p.test(errorOutput));
}
```

#### Diagnostic emission

When the build fails, instead of just storing `buildError` as a raw string:

```ts
if (buildError) {
  const pattern = matchBuildFailure(buildError);
  diagnostics.push({
    ruleId: "BUILD-01",
    severity: "error",
    message: pattern
      ? `Astro build failed (${pattern.id}): ${pattern.excerpt(buildError)}`
      : `Astro build failed: ${truncate(buildError, 200)}`,
    fixHint: pattern?.fixHint ?? "Read the full build output above for the error details.",
    data: {
      patternId: pattern?.id ?? "unknown",
      buildErrorLength: buildError.length,
    },
  });
}
```

The `diagnostics` array is included in the `ForgeCommandResult.data` alongside the existing `build.error` field (preserved for backward compatibility).

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/os/site-kernel-handoff/src/mission/mission-materialization-commands.ts` | Add pattern matcher, emit BUILD-01 diagnostic on build failure |

### Output format

Before:

```json
{
  "command": "mission.validate",
  "status": "fail",
  "data": {
    "build": {
      "succeeded": false,
      "error": "Error: Command failed: pnpm exec astro build\n  at checkExecSyncError..."
    }
  },
  "summary": "[mission.validate] warpgogol-com-m000016 validation FAILED (astro build failed)"
}
```

After:

```json
{
  "command": "mission.validate",
  "status": "fail",
  "data": {
    "build": {
      "succeeded": false,
      "error": "Error: Command failed: pnpm exec astro build..."
    },
    "diagnostics": [
      {
        "ruleId": "BUILD-01",
        "severity": "error",
        "message": "Astro build failed (enoent-system-manifest): ENOENT: no such file or directory, open '/path/to/content/system.md'",
        "fixHint": "Guard loadSystemManifestSync with import.meta.env.DEV — it resolves __dirname differently during prerender. See middleware.template.ts.",
        "data": {
          "patternId": "enoent-system-manifest",
          "buildErrorLength": 1543
        }
      }
    ]
  },
  "summary": "[mission.validate] warpgogol-com-m000016 validation FAILED (astro build failed)"
}
```

### Failure modes

- If no pattern matches, a generic BUILD-01 diagnostic is emitted with `patternId: "unknown"` and a fixHint pointing to the full build output.
- The raw `buildError` string is preserved in `data.build.error` for backward compatibility and for cases where the pattern matcher doesn't cover the failure.
- The pattern matcher is purely string-based — it does not execute code or parse the stack trace structurally. False positives are unlikely because the patterns are specific (regex with named error types).
- Patterns are extensible — new patterns can be added to `BUILD_FAILURE_PATTERNS` without changing the diagnostic emission logic.

## Rollout

- **No flag day.** `mission.validate` already runs the Astro build. The diagnostic is added to the existing failure path — no behavior change for passing builds.
- **Backward compatibility.** The raw `build.error` string is preserved in the result data. Consumers that parse it are unaffected.
- **Pattern catalog growth.** New patterns are added to `BUILD_FAILURE_PATTERNS` as they are encountered in missions. The `fix-patterns.md` catalog in `wg-mission-complete` can reference BUILD-01 with `patternId` for auto-resolution.
- **No app changes needed.** Apps do not consume mission.validate output — agents and the mission lifecycle do.

## Alternatives considered

1. **Parse the Astro build output with a structured parser (AST).** Rejected: Astro's build output is Vite/Rollup output — not a stable API. Pattern matching on error signatures is more robust and maintainable.

2. **Register BUILD-01 in `DIAGNOSTIC_RULES` and use `diagnosticsResult`.** Rejected: BUILD-01 is a mission-level diagnostic, not a content check. It does not belong in the content-surface rule registry. The `Diagnostic` shape is used (RFC-0203), but the rule registry is not extended.

3. **Emit the full build output as the diagnostic message.** Rejected: the full output can be thousands of lines. The pattern-matched excerpt + fixHint is actionable; the full output is already available in the console log.

4. **Add build failure patterns to `fix-patterns.md` instead of the codebase.** Rejected: `fix-patterns.md` is a reactive catalog (applied after error occurs). Pattern matching in the codebase is proactive — the diagnostic is structured at emission time, before any agent reads it.

## Risks

- **Pattern matcher false negatives.** Some build failures may not match any pattern. The fallback diagnostic (`patternId: "unknown"`) still provides the truncated error output — the agent is not worse off than today.
- **Pattern rot.** If Astro or Vite changes error message formats, patterns may stop matching. The patterns are regex-based and can be updated independently. The `fix-patterns.md` catalog has the same risk.
- **Agent over-reliance on fixHints.** An agent might apply the fixHint without verifying it matches the actual error. The fixHint is guidance, not a command — the agent should still read the error excerpt in the diagnostic message.
- **Performance.** The pattern matcher runs 4 regex tests on the build error string — negligible overhead (microseconds).
- **Maintenance burden.** New patterns are added as encountered. Each pattern is ~10 lines. Low ongoing maintenance.

## Acceptance criteria

- [ ] `mission.validate` emits a `BUILD-01` diagnostic when the Astro build fails
- [ ] The diagnostic includes a `patternId` in `data` identifying the matched pattern (or `"unknown"`)
- [ ] The diagnostic includes an actionable `fixHint` specific to the matched pattern
- [ ] At least 4 patterns are defined: `enoent-system-manifest`, `module-not-found`, `content-schema-error`, `typescript-error`
- [ ] The raw `build.error` string is preserved in `data.build.error` for backward compatibility
- [ ] `rfc.validate` passes on this file

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- The pattern matcher MUST be pure (no side effects, no I/O) — it takes a string and returns a pattern or undefined.
- New patterns MAY be added during implementation as they are encountered in real missions. Each pattern MUST include an `id`, `test` regex, `fixHint`, and `excerpt` function.
- The `fixHint` for each pattern SHOULD be specific enough that an agent can execute it without reading the full build output — but it MUST NOT be a command (build errors require investigation, not copy-paste commands).
- The `BUILD-01` ruleId is NOT registered in `DIAGNOSTIC_RULES` — it is a mission-level diagnostic, not a content check. `diagnostic.shape.lint` does not enforce it.
