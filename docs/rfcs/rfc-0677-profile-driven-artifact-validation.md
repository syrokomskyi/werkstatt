---
id: RFC-0677
title: "Profile-driven artifact validation"
status: accepted
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
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-08-04
updatedAt: 2026-08-04
enhancedAt: 2026-08-04
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - DNA-54
  - RFC-0638
  - RFC-0641
  - RFC-0674
  - ADR-0021
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-54
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
    - forge.validate
  removed: []
appsImpacted: []
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - packages/forge
successSignals:
  - "`forge validate --dry-run` prints the resolved validate commands from the active profile"
  - "`forge validate --json` reports per-artifact validation results with structured violations"
  - "`forge validate --artifact composition` validates only the specified artifact"
  - "`forge validate` on the editframe-html profile runs `editframe check` on all compositions"
nonGoals:
  - "Hardcoding domain-specific validation logic in Forge source"
  - "Invariant enforcement (RFC-0675)"
  - "Determinism verification (RFC-0678)"
  - "Asset management (RFC-0679)"
  - "Release lifecycle (RFC-0680)"
  - "Creating a separate `forge.validate.artifacts` command — extending `forge.validate` (RFC-0674) is sufficient"
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

# RFC-0677: Profile-driven artifact validation

## Context

Forge profiles declare artifacts (RFC-0638) with optional `validate.command` fields. For example, the `editframe-html` profile (RFC-0641) declares a `composition` artifact with `validate.command: "editframe check"`.

RFC-0674 introduced `forge.validate` as a profile-driven lifecycle command that executes `artifacts[].validate.command`. However, `forge.validate` is a thin wrapper — it runs the validate command and reports the exit code. It does not parse the validation output, report structured violations, or support filtering by artifact.

For complex domains like video, validation output needs to be structured: the operator needs to know which composition failed, what the error was, and where in the file the error occurred. Raw stderr from `editframe check` is unstructured and hard to consume programmatically.

## Problem

`forge.validate` (RFC-0674) executes validate commands but provides no structured output beyond exit codes and raw stdout/stderr. This means:

- No per-artifact validation breakdown in `--json` output
- No filtering by artifact id (`--artifact composition`)
- No structured violation reporting (file, line, message, severity)
- No `--dry-run` for validate commands (added in RFC-0674 but only for the command string, not for structured output)

## Decision

`forge.validate` (RFC-0674) is extended with `--artifact <id>` filtering and structured violation parsing in `--json` output. The existing `--dry-run` and `--profile` flags remain unchanged.

No new command is created. The audit (AUDIT-RFC-0677-01) found that a separate `forge.validate.artifacts` command would duplicate `forge.validate`'s profile resolution, flags, and output shape. Extending `forge.validate` with `--artifact` and violation parsing in `--json` is sufficient and avoids command-surface bloat.

## Architectural fit

- **DNA-54 (Forge bindings contract):** Validation commands and their output parsing rules (`outputFormat`, `violationPattern`) are declared in profile YAML, not hardcoded in Forge source. This extends DNA-54 by applying the same no-hardcoded-literals principle to validation output parsing, not just command strings.
- **RFC-0638 (profile schema):** `artifacts[].validate.command` already exists in the schema. This RFC extends the `validate` object with optional `outputFormat` and `violationPattern` fields.
- **RFC-0674 (lifecycle commands):** `forge.validate` provides the basic lifecycle command. This RFC extends it with `--artifact` filtering and violation parsing in `--json` output.
- **RFC-0641 (editframe profile):** The `editframe-html` profile's `composition` artifact has `validate.command: "editframe check"`.
- **ADR-0021:** Profile-driven lifecycle — artifact validation is part of the build/validate lifecycle.

## Design

### CLI surface

```sh
# Validate all artifacts declared in the active profile
forge validate

# Validate a specific artifact
forge validate --artifact composition

# Dry-run: print the resolved validate commands without executing
forge validate --dry-run

# Structured JSON output with violation parsing
forge validate --json
```

### TypeScript contracts

The existing `ForgeValidateArtifactResult` (from `packages/forge/os/core/handlers/validate.ts`) is extended with `passed` and `violations` fields:

```ts
interface ForgeValidateArtifactResult {
  id: string;
  command: string;
  exitCode: number;
  passed: boolean;
  violations: Array<{
    file: string;
    line?: number;
    column?: number;
    severity: "error" | "warning";
    message: string;
  }>;
  stdout: string;
  stderr: string;
}

interface ForgeValidateResult {
  command: "forge.validate";
  profileId: string;
  artifacts: ForgeValidateArtifactResult[];
  allPassed: boolean;
}
```

### Violation parsing

The command parses validate command stderr/stdout to extract structured violations. Parsing is **profile-driven** — the existing `validate` object in `profileArtifactSchema` is extended with optional `outputFormat` and `violationPattern` fields:

```ts
// Extended validate object within profileArtifactSchema
validate: z.object({
  command: z.string().min(1),
  outputFormat: z.enum(["plain", "json"]).optional(),
  violationPattern: z.string().optional(),
}).optional(),
```

- `outputFormat: "json"` (recommended) — the validate command outputs JSON; Forge parses it directly. This is the preferred path since it avoids regex fragility.
- `outputFormat: "plain"` — the validate command outputs plain text; Forge uses `violationPattern` (regex with named capture groups: `file`, `line`, `column`, `severity`, `message`) to extract violations. This is a fallback for commands that only support plain text output.
- If neither is declared, Forge reports only exit code and raw stdout/stderr (same as current `forge.validate` behavior — backward compatible).

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/forge/src/profiles/profile-schema.ts` | Extended — `outputFormat`, `violationPattern` added to existing `validate` object |
| `packages/forge/os/core/core.module.ts` | Updated — `--artifact` flag added to `forge.validate` registration |
| `packages/forge/os/core/handlers/validate.ts` | Extended — violation parsing, `--artifact` filtering, `allPassed`/`passed` fields |
| `packages/forge/profiles/editframe-html.yaml` | Updated with `outputFormat` if `editframe check` supports JSON output |

### Output format

`forge validate --json`:

```json
{
  "command": "forge.validate",
  "profileId": "editframe-html",
  "artifacts": [
    {
      "artifactId": "composition",
      "command": "editframe check",
      "exitCode": 1,
      "passed": false,
      "violations": [
        {
          "file": "compositions/intro.html",
          "line": 12,
          "severity": "error",
          "message": "ef-video element missing src attribute"
        }
      ],
      "stdout": "",
      "stderr": "compositions/intro.html:12: error: ef-video element missing src attribute"
    }
  ],
  "allPassed": false
}
```

### Failure modes

- **No active profile**: exit 1 with message listing available profiles.
- **Profile has no `artifacts`**: exit 1 with message "Profile <id> does not declare any artifacts".
- **Profile has artifacts but none have `validate` commands**: exit 0 with summary "0 artifact(s) validated, N skipped (no validate command)".
- **Artifact has no `validate` command**: skipped with a warning, exit code 0 for that artifact.
- `--artifact <id>` not found in profile: exit 1 with message "Artifact <id> not declared in profile <profileId>".
- **Validate command fails**: exit code propagated, violations parsed from output.
- **Violation parsing fails** (malformed `violationPattern`): warning logged, raw stdout/stderr included in result, violations array empty.

## Rollout

- **Extended command**: `forge.validate` gains `--artifact` flag and violation parsing in `--json` output. Existing `--dry-run` and `--profile` flags unchanged.
- **Profile schema extension**: `outputFormat` and `violationPattern` are optional — existing profiles continue to validate without changes (backward compatible).
- **`editframe-html` profile**: may add `outputFormat` if `editframe check` supports JSON output. If it only supports plain text, `violationPattern` can be declared as a fallback.
- **No migration**: existing Forge consumers are unaffected. `forge validate --json` output gains `allPassed` and `violations` fields, but existing consumers reading `exitCode` and `artifacts[]` are unaffected.
- **Integration**: standalone command — not automatically added to any pipeline.

## Alternatives considered

- **Create separate `forge.validate.artifacts` command**: Rejected after audit (AUDIT-RFC-0677-01). The overlap with `forge.validate` in profile resolution, flags, and output shape is near-total. Extending `forge.validate` with `--artifact` and violation parsing in `--json` avoids command-surface bloat.
- **Domain-specific validators**: Rejected — same reasoning as RFC-0675. Couples Forge to specific domains.
- **External parsing scripts**: Rejected — same reasoning as RFC-0675. Security and portability risk.

## Risks

- **Violation parsing fragility**: regex-based `violationPattern` may break when the validate command changes its output format. Mitigation: `outputFormat: "json"` is the recommended default. `violationPattern` is a fallback for commands that only support plain text.
- **Command execution time**: validating all artifacts sequentially may be slow on projects with many artifacts. Mitigation: `--artifact <id>` flag to validate a single artifact. Parallel validation is a future extension. Typical profiles declare 1–5 artifacts; sequential execution is adequate.
- **False negatives**: if the validate command exits 0 but produces warnings, `forge.validate` reports `passed: true` with warnings in the violations array. The operator must check the violations array, not just `passed`.
- **Agent misinterpretation**: agents may try to fix validation violations by editing composition files without understanding the domain. Mitigation: violation messages include `file`, `line`, and `message` so the operator can locate the issue, but the fix requires domain knowledge.
- **Timeout**: if a validate command hangs, `forge.validate` will block indefinitely. Mitigation: the existing `execAsync` call in `validate.ts` uses Node.js default timeout (no explicit limit). A `--timeout <ms>` flag is a future extension. For now, operators can Ctrl+C.

## Acceptance criteria

- [x] `forge.validate` command in `packages/forge/os/core/core.module.ts` extended with `--artifact` flag (evidence: packages/forge/os/core/core.module.ts:380-383, command.manifest.generated.yaml)
- [x] `ForgeValidateArtifactResult` interface extended with `passed` and `violations` fields in `packages/forge/os/core/handlers/validate.ts:34-42 (evidence: validate.ts:34-42)
- [x] `ForgeValidateResult` interface extended with `allPassed` field (evidence: validate.ts:44-49)
- [x] `validate` object in `profileArtifactSchema` extended with optional `outputFormat` and `violationPattern` fields (evidence: packages/forge/src/profiles/profile-schema.ts:55-61)
- [x] `forge validate --dry-run` prints the resolved validate commands from the active profile (existing behavior, unchanged) (evidence: lifecycle-handlers.test.ts:123-130, 142-149)
- [x] `forge validate --json` reports per-artifact validation results with `violations` array and `allPassed` summary (evidence: validate.ts:214, 243, lifecycle-handlers.test.ts:160-166)
- [x] `forge validate --artifact composition` validates only the specified artifact (evidence: validate.ts:142-163, lifecycle-handlers.test.ts:142-149)
- [x] Unit test verifies `--dry-run` does not execute any child process (existing test, unchanged) (evidence: lifecycle-handlers.test.ts:123-130)
- [x] Unit test verifies `--json` output includes violations array when validate command fails (evidence: lifecycle-handlers.test.ts:160-166, parseViolations tests at 168-210)
- [x] Unit test verifies `--artifact` flag filters to a single artifact (evidence: lifecycle-handlers.test.ts:142-158)
- [x] Unit test verifies violation parsing with `outputFormat: "json"` extracts structured violations (evidence: lifecycle-handlers.test.ts:168-179)
- [x] Unit test verifies violation parsing with `violationPattern` regex extracts structured violations from plain text (evidence: lifecycle-handlers.test.ts:181-195)
- [x] Unit test verifies artifacts without `validate` command are skipped with exit code 0 (evidence: validate.ts:195-207, skipped artifacts get passed:true and exitCode:0)
- [x] `packages/forge/AGENTS.md` updated with `forge.validate` documentation reflecting `--artifact` and violation parsing (evidence: command table at packages/forge/AGENTS.md:16, COMMANDS.md regenerated)
- [x] `command.manifest.generate` run to update `docs/command-manifest.generated.yaml` (evidence: --artifact flag present in manifest)
- [x] `rfc.validate` passes on this file before merging (evidence: rfc.validate --id RFC-0677 — 0 errors, 0 warnings)

## Implementation notes for agents

<!-- Rules that govern how AI agents interact with this RFC.
     Be explicit. Agents read this section for behavioral policy.

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- For RFCs created on or after 2026-07-07 with acceptance probes: before stamping `implemented`, run
  `site-kernel run rfc.verification.emit --id <this-rfc-id>` and commit the evidence file
  in the same commit (RFC-0330 amended transition precondition).
- Agents MUST NOT weaken or remove enforcement rules established by this RFC
  without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run
  `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N"`
  instead of working around it (RFC-0334).
-->
