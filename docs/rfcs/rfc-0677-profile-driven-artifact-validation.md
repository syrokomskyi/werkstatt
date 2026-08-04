---
id: RFC-0677
title: "Profile-driven artifact validation"
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
createdAt: 2026-08-04
updatedAt: 2026-08-04
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
  proposed:
    - forge.validate.artifacts
  added: []
  changed: []
  removed: []
appsImpacted: []
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - packages/forge
successSignals:
  - "`forge validate artifacts --dry-run` prints the resolved validate commands from the active profile"
  - "`forge validate artifacts --json` reports per-artifact validation results"
  - "`forge validate artifacts` on the editframe-html profile runs `editframe check` on all compositions"
nonGoals:
  - "Hardcoding domain-specific validation logic in Forge source"
  - "Invariant enforcement (RFC-0675)"
  - "Determinism verification (RFC-0678)"
  - "Asset management (RFC-0679)"
  - "Release lifecycle (RFC-0680)"
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

Forge gains `forge.validate.artifacts` — a dedicated artifact validation command that provides structured per-artifact validation results, filtering by artifact id, and `--dry-run` output.

This command is distinct from `forge.validate` (RFC-0674): `forge.validate` is the generic lifecycle command; `forge.validate.artifacts` is the structured validation reporter. They share the same profile resolution logic but differ in output format.

## Architectural fit

- **DNA-54 (Forge bindings contract):** Validation commands are declared in profile YAML, not hardcoded.
- **RFC-0638 (profile schema):** `artifacts[].validate.command` already exists in the schema.
- **RFC-0674 (lifecycle commands):** `forge.validate` provides the basic lifecycle command. This RFC adds the structured validation reporter.
- **RFC-0641 (editframe profile):** The `editframe-html` profile's `composition` artifact has `validate.command: "editframe check"`.
- **ADR-0021:** Profile-driven lifecycle — artifact validation is part of the build/validate lifecycle.

## Design

### CLI surface

```sh
# Validate all artifacts declared in the active profile
forge validate artifacts

# Validate a specific artifact
forge validate artifacts --artifact composition

# Dry-run: print the resolved validate commands without executing
forge validate artifacts --dry-run

# Structured JSON output
forge validate artifacts --json
```

### TypeScript contracts

```ts
interface ArtifactValidationResult {
  artifactId: string;
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

interface ForgeValidateArtifactsResult {
  command: "forge.validate.artifacts";
  profileId: string;
  artifacts: ArtifactValidationResult[];
  allPassed: boolean;
}
```

### Violation parsing

The command parses validate command stderr/stdout to extract structured violations. Parsing is **profile-driven** — the profile declares how to parse the validate command output:

```ts
export const profileArtifactValidateSchema = z.object({
  command: z.string().min(1),
  outputFormat: z.enum(["plain", "json"]).optional(),
  violationPattern: z.string().optional(),
});
```

- `outputFormat: "json"` — the validate command outputs JSON; Forge parses it directly.
- `outputFormat: "plain"` — the validate command outputs plain text; Forge uses `violationPattern` (regex with named capture groups: `file`, `line`, `column`, `severity`, `message`) to extract violations.
- If neither is declared, Forge reports only exit code and raw stdout/stderr (same as `forge.validate`).

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/forge/src/profiles/profile-schema.ts` | Extended with `outputFormat`, `violationPattern` on validate |
| `packages/forge/os/core/core.module.ts` | Registers `forge.validate.artifacts` |
| `packages/forge/os/core/handlers/validate-artifacts.ts` | New — structured validation handler |
| `packages/forge/profiles/editframe-html.yaml` | Updated with `outputFormat`/`violationPattern` if needed |

### Output format

`forge validate artifacts --json`:

```json
{
  "command": "forge.validate.artifacts",
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
- **Artifact has no `validate` command**: skipped with a warning.
- `--artifact <id>` not found in profile: exit 1 with message "Artifact <id> not declared in profile <profileId>".
- **Validate command fails**: exit code propagated, violations parsed from output.
- **Violation parsing fails** (malformed `violationPattern`): warning logged, raw stdout/stderr included in result, violations array empty.

## Rollout

- **New command**: `forge.validate.artifacts` — no existing commands affected.
- **Profile schema extension**: `outputFormat` and `violationPattern` are optional — existing profiles continue to validate.
- **`editframe-html` profile**: may add `outputFormat`/`violationPattern` if `editframe check` output needs parsing. If `editframe check` already outputs JSON, set `outputFormat: "json"`.
- **No migration**: existing Forge consumers are unaffected.
- **Integration**: standalone command — not automatically added to any pipeline.

## Alternatives considered

- **Extend `forge.validate` (RFC-0674) with structured output**: Rejected — `forge.validate` is the generic lifecycle command with a simple output shape. Adding violation parsing would complicate the generic command. `forge.validate.artifacts` is a dedicated reporter that can afford more complexity.
- **Domain-specific validators**: Rejected — same reasoning as RFC-0675. Couples Forge to specific domains.
- **External parsing scripts**: Rejected — same reasoning as RFC-0675. Security and portability risk.

## Risks

- **Violation parsing fragility**: regex-based `violationPattern` may break when the validate command changes its output format. Mitigation: `outputFormat: "json"` is preferred when the validate command supports it. `violationPattern` is a fallback for commands that only output plain text.
- **Command execution time**: validating all artifacts sequentially may be slow. Mitigation: `--artifact <id>` flag to validate a single artifact. Parallel validation is a future extension.
- **False negatives**: if the validate command exits 0 but produces warnings, `forge.validate.artifacts` reports `passed: true` with warnings in the violations array. The operator must check the violations array, not just `passed`.

## Acceptance criteria

- [ ] `forge.validate.artifacts` command registered in `packages/forge/os/core/core.module.ts` with `--dry-run`, `--json`, `--profile`, `--artifact` flags
- [ ] `ArtifactValidationResult` and `ForgeValidateArtifactsResult` interfaces defined in the handler
- [ ] `profileArtifactValidateSchema` extended with `outputFormat` and `violationPattern` fields
- [ ] `forge validate artifacts --dry-run` prints the resolved validate commands from the active profile
- [ ] `forge validate artifacts --json` reports per-artifact validation results with violations array
- [ ] `forge validate artifacts --artifact composition` validates only the specified artifact
- [ ] Unit test verifies `--dry-run` does not execute any child process
- [ ] Unit test verifies `--json` output includes violations array when validate command fails
- [ ] Unit test verifies `--artifact` flag filters to a single artifact
- [ ] Unit test verifies violation parsing with `outputFormat: "json"` extracts structured violations
- [ ] Unit test verifies violation parsing with `violationPattern` regex extracts structured violations from plain text
- [ ] `packages/forge/AGENTS.md` updated with `forge.validate.artifacts` documentation
- [ ] `command.manifest.generate` run to update `docs/command-manifest.generated.yaml`
- [ ] `rfc.validate` passes on this file before merging

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
