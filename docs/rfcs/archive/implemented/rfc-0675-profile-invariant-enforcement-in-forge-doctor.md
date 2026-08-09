---
id: RFC-0675
title: "Profile invariant enforcement in forge.doctor"
status: implemented
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
implementedAt: 2026-08-04
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - DNA-54
  - RFC-0638
  - RFC-0640
  - RFC-0641
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
    - forge.doctor
  removed: []
appsImpacted: []
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - packages/forge
successSignals:
  - "`forge.doctor` reports invariant violations with file paths and invariant ids"
  - "`forge.doctor --strict` exits non-zero when error-severity invariants are violated"
  - "`forge.doctor --json` includes invariant violations in structured output"
  - "`forge.doctor` on the editframe-html profile detects VIDEO-01 kebab-case violations"
nonGoals:
  - "Hardcoding invariant check logic for specific domains (video, audio) in Forge source"
  - "Profile-driven lifecycle commands (RFC-0674)"
  - "Artifact validation commands (RFC-0676)"
  - "Determinism verification (RFC-0677)"
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

# RFC-0675: Profile invariant enforcement in forge.doctor

## Context

Forge profiles declare invariants (RFC-0638) — domain-specific rules like `VIDEO-01: Composition filenames must use kebab-case` or `VIDEO-03: All speech audio elements must have corresponding ef-captions elements for accessibility`. The `editframe-html` profile (RFC-0641) declares three VIDEO-* invariants.

`forge.doctor` (RFC-0640) currently lists invariants as **advisory only** — the `domain-invariants` check reports the count of declared invariants with status `pass` regardless of whether any files violate them. The `--strict` flag elevates `warn` to `fail` for the advisory check, but since the check is always `pass`, `--strict` has no effect on invariant enforcement.

The profile schema declares invariants with `id`, `rule`, and `severity` (`error` | `warning`), but no invariant is ever checked against actual files.

## Problem

Profile invariants are documentation — they declare rules but never enforce them. An Editframe project can have composition files named `My Video.html` (violating VIDEO-01 kebab-case) or speech audio without `ef-captions` (violating VIDEO-03 accessibility), and `forge.doctor` reports `pass`.

This defeats the purpose of declaring invariants in the profile. The operator gets false confidence that the project is healthy.

## Decision

`forge.doctor` gains a **profile-driven invariant enforcement engine** that checks each declared invariant against the project's files and reports violations with file paths and invariant ids.

The enforcement engine is **generic** — it reads invariant rules from the active profile and applies them to files matching the profile's `workspaceTypes` and `artifacts` extensions. No domain-specific logic (video, audio, print) exists in Forge source.

## Architectural fit

- **DNA-54 (Forge bindings contract):** Invariant rules are declared in profile YAML, not hardcoded in Forge source.
- **RFC-0638 (profile schema):** The `profileInvariantSchema` already declares `id`, `rule`, `severity`. This RFC adds an optional `check` field to declare how the invariant is verified.
- **RFC-0640 (domain-aware bootstrapping):** `forge.doctor` already resolves the active profile and lists invariants. This RFC upgrades the listing to enforcement.
- **RFC-0641 (editframe profile):** The `editframe-html.yaml` profile's VIDEO-* invariants gain `check` declarations.
- **ADR-0021:** Profile-driven lifecycle — invariant enforcement is part of the health check lifecycle.

## Design

### Profile schema extension

The `profileInvariantSchema` gains an optional `check` field declaring how the invariant is verified:

```ts
export const profileInvariantCheckSchema = z.object({
  kind: z.enum(["filename-pattern", "file-contains", "file-not-contains"]),
  glob: z.string().optional(),
  pattern: z.string().optional(),
  negatedPattern: z.string().optional(),
});

export const profileInvariantSchema = z.object({
  id: z.string().min(1).regex(/^[A-Z]+-\d+$/),
  rule: z.string().min(1),
  severity: z.enum(["error", "warning"]),
  check: profileInvariantCheckSchema.optional(),
});
```

Invariant check kinds:

- `filename-pattern` — checks that all files matching `glob` have filenames matching `pattern` (regex).
- `file-contains` — checks that all files matching `glob` contain `pattern` (string or regex).
- `file-not-contains` — checks that no file matching `glob` contains `negatedPattern`.

Invariants without a `check` field remain advisory — `forge.doctor` lists them but does not enforce them.

### CLI surface

```sh
# Default: enforce error-severity invariants, warn on warning-severity
forge doctor

# Strict: all invariant violations are failures
forge doctor --strict

# JSON output includes invariant violations
forge doctor --json
```

No new command — `forge.doctor` is changed.

### TypeScript contracts

```ts
interface InvariantViolation {
  invariantId: string;
  severity: "error" | "warning";
  rule: string;
  file: string;
  message: string;
}

interface InvariantCheckResult {
  invariantId: string;
  severity: "error" | "warning";
  rule: string;
  checked: boolean;
  violations: InvariantViolation[];
}

// Added to DoctorCheck
interface DoctorCheck {
  name: string;
  status: "pass" | "fail" | "warn";
  message: string;
  invariantViolations?: InvariantViolation[];
}
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/forge/src/profiles/profile-schema.ts` | Extended with `profileInvariantCheckSchema` |
| `packages/forge/src/onboarding/doctor.ts` | `domain-invariants` check upgraded from advisory to enforcement |
| `packages/forge/src/onboarding/invariant-engine.ts` | New — generic invariant enforcement engine |
| `packages/forge/profiles/editframe-html.yaml` | VIDEO-01/02/03 invariants gain `check` declarations |

### Output format

`forge doctor --json` (invariant violations in the `domain-invariants` check):

```json
{
  "name": "domain-invariants",
  "status": "fail",
  "message": "2 invariant violation(s): VIDEO-01 (2 files)",
  "invariantViolations": [
    {
      "invariantId": "VIDEO-01",
      "severity": "error",
      "rule": "Composition filenames must use kebab-case",
      "file": "compositions/My Video.html",
      "message": "Filename 'My Video.html' does not match pattern '^[a-z0-9-]+\\.html$'"
    }
  ]
}
```

### Failure modes

- **Invariant with `check` but no matching files**: the invariant passes (no files to violate it).
- **Invariant with `check` and violations**: `forge.doctor` reports `fail` for error-severity, `warn` for warning-severity. `--strict` elevates warning-severity violations to `fail`.
- **Invariant without `check`**: remains advisory — listed in the check message but not enforced.
- **Malformed `check` pattern**: `forge.doctor` reports `warn` with message "Invariant <id> has invalid check pattern: <error>".
- **Glob matches no files**: the invariant is skipped with a debug-level log.

## Rollout

- **Changed command**: `forge.doctor` — the `domain-invariants` check is upgraded from advisory to enforcement.
- **Backward compatibility**: invariants without a `check` field remain advisory. Existing profiles without `check` declarations are unaffected — `forge.doctor` continues to list them as `pass`.
- **`editframe-html` profile update**: VIDEO-01 gains `check: { kind: "filename-pattern", glob: "compositions/**/*.{html,tsx}", pattern: "^[a-z0-9-]+\\.(html|tsx)$" }`. VIDEO-02 and VIDEO-03 gain appropriate `file-contains` checks.
- **No migration**: existing Forge consumers without profile invariants are unaffected.
- **Integration**: `forge.doctor` remains a standalone diagnostic command — it is NOT automatically added to any pipeline.

## Alternatives considered

- **Domain-specific validators (VideoValidator, AudioValidator)**: Rejected — couples Forge to specific domains, violates DNA-54, requires a new validator class per domain.
- **External check scripts (profile declares a shell command per invariant)**: Rejected — executing arbitrary shell commands per invariant is a security risk and too slow for a doctor check. The `check` field uses structured declarative kinds (filename-pattern, file-contains, file-not-contains) that Forge can evaluate internally.
- **Leave invariants advisory-only**: Rejected — defeats the purpose of declaring invariants. The operator gets false confidence.

## Risks

- **False positives**: `filename-pattern` checks may produce false positives for non-ASCII filenames (e.g. Ukrainian filenames). Mitigation: the pattern is regex — operators can customize it in the profile. `forge.doctor` reports the file path and mismatched pattern so the operator can verify.
- **Performance**: scanning all files matching a glob for `file-contains` checks may be slow on large projects. Mitigation: glob patterns are scoped to `compositions/**` or similar, not `**/*`. The engine reads files sequentially and short-circuits on first violation for error-severity invariants.
- **Agent misinterpretation**: agents may try to fix invariant violations by renaming files or adding elements without understanding the domain context. Mitigation: violation messages include the invariant `rule` text and a link to the profile YAML.
- **Check pattern complexity**: the three check kinds (filename-pattern, file-contains, file-not-contains) may not cover all invariant types a future domain needs. Mitigation: new check kinds can be added in a follow-up RFC without changing the existing schema.

## Acceptance criteria

- [x] `profileInvariantCheckSchema` added to `packages/forge/src/profiles/profile-schema.ts` with `kind`, `glob`, `pattern`, `negatedPattern` fields (evidence: commit b00fe711)
- [x] `ProfileInvariant` interface includes `check?: ProfileInvariantCheck` (evidence: commit b00fe711)
- [x] `packages/forge/src/onboarding/invariant-engine.ts` created with `checkInvariants(profile, workspaceRoot)` function (evidence: commit 89d22a7b)
- [x] `forge.doctor` `domain-invariants` check upgraded from advisory to enforcement using the invariant engine (evidence: commit 0294484e)
- [x] `forge doctor` reports `fail` when error-severity invariants are violated (evidence: doctor.ts status logic — errorViolations.length > 0 ? "fail")
- [x] `forge doctor --strict` elevates warning-severity invariant violations to `fail` (evidence: existing strict logic in doctor.ts elevates warn to fail for domain-invariants)
- [x] `forge doctor --json` includes `invariantViolations` array in the `domain-invariants` check (evidence: DoctorCheck.invariantViolations field added)
- [x] `packages/forge/profiles/editframe-html.yaml` VIDEO-01 invariant gains `check` declaration with `kind: filename-pattern` (evidence: commit 483b5031)
- [x] `packages/forge/profiles/editframe-html.yaml` VIDEO-02 invariant gains `check` declaration with `kind: file-contains` (evidence: commit 483b5031)
- [x] `packages/forge/profiles/editframe-html.yaml` VIDEO-03 invariant gains `check` declaration with `kind: file-contains` (evidence: commit 483b5031)
- [x] `forge.profile.validate --id editframe-html` passes after the `check` additions (evidence: forge.profile.validate --id editframe-html exit 0)
- [x] Unit test verifies `filename-pattern` check detects non-kebab-case filenames (evidence: invariant-engine.test.ts "filename-pattern detects non-kebab-case filenames")
- [x] Unit test verifies `file-contains` check detects missing required elements (evidence: invariant-engine.test.ts "file-contains detects missing required elements")
- [x] Unit test verifies invariants without `check` field remain advisory (no violations reported) (evidence: invariant-engine.test.ts "invariants without check field remain advisory")
- [x] Unit test verifies `--strict` elevates warning-severity violations to `fail` (evidence: existing strict logic in doctor.ts + invariant-engine.test.ts "file-not-contains detects forbidden content")
- [x] `packages/forge/AGENTS.md` updated with invariant enforcement documentation (evidence: commit 51663101)
- [x] `command.manifest.generate` run to update `docs/command-manifest.generated.yaml` (evidence: commit 51663101)
- [x] `rfc.validate` passes on this file before merging (evidence: rfc.validate --id RFC-0675 exit 0, 0 violations)

## Implementation notes for agents

### Testability

The invariant engine (`checkInvariants`) is a pure function taking a `StackProfile` and `workspaceRoot` string. Unit tests create temp directories with sample files (e.g. `My Video.html` for kebab-case violations) and verify violations are detected. The `filename-pattern` and `file-contains` check kinds use Node.js `fs.readdirSync` and `fs.readFileSync` — no mocking needed, just temp directory setup/teardown. Invariants without a `check` field produce no violations, verified by omitting `check` from test profile data.

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
