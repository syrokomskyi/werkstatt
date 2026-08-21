---
id: RFC-0916
title: "Utility provenance validator for canonical shared utilities"
status: accepted
# kind options: architecture | contract | command | policy | deprecation
kind: command
# scope options: app | workspace
scope: workspace
owners:
  - architecture
# Set by the deciding human together with the status change (RFC-0335).
# Draft scaffolds must keep this empty; do not prefill a default identity.
# Format: human:<handle> (agent:<id> reserved — see RFC-0335)
# Default reviewer when none is specified by the operator: human:andrii-syrokomskyi
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-08-21
updatedAt: 2026-08-21
enhancedAt: 2026-08-21
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - DNA-53
  - DNA-74
  - RFC-0915
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-53
  - DNA-74
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
    - utility.provenance.validate
  added: []
  changed: []
  removed: []
appsImpacted: []
packagesImpacted:
  - "@warpgogol/werkstatt-shared"
  - "@warpgogol/werkstatt-site"
successSignals:
  - utility.provenance.validate detects import-based violations (forbidden external packages outside canonical location)
  - utility.provenance.validate detects name-based violations (slugify/toSlug/makeSlug functions outside canonical location)
  - utility.provenance.validate detects pattern-based violations (NFKD + replace heuristic for reimplemented slug logic)
  - utility.provenance.validate runs in PACKAGES_CHECK_PIPELINE with zero violations after RFC-0915 implementation
nonGoals:
  - Detecting all possible utility reimplementations (only registered canonical utilities are checked)
  - Replacing fingerprint.usage.lint (different domain — hashing vs slug/utility)
  - Enforcing import paths for non-registered utilities
  - Detecting semantic equivalence of reimplemented logic (only pattern-based heuristics)
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

# RFC-0916: Utility provenance validator for canonical shared utilities

## Context

RFC-0915 establishes canonical ownership for slug generation in `@warpgogol/werkstatt-shared/src/share/slug/` and a new DNA-88 invariant forbidding ad hoc reimplementations. However, without automated enforcement, agents will continue to create duplicate `slugify()` functions — the existing duplicate in `person-create.ts` is direct evidence of this pattern.

The codebase already has an analogous validator: `fingerprint.usage.lint` (RFC-0364, DNA-53) scans for direct hash usage outside `@warpgogol/fingerprint` using regex patterns and an allowlist. This RFC extends the same enforcement pattern to all canonical shared utilities, starting with slug generation.

## Problem

DNA-53 (fingerprint) is enforced by `fingerprint.usage.lint`. DNA-74 (Diagnostic schema) is enforced by `diagnostic.shape.lint`. But DNA-88 (slug generation, established by RFC-0915) has no automated enforcement. An agent can create a new `slugify()` function in any package without triggering a validation error — the violation is only caught by manual code review.

The gap is broader than slugs: the platform will accumulate more canonical utilities over time (e.g., date formatting, URL parsing, content hashing variants). Each needs the same import-check + name-check + pattern-check enforcement. Without a registry-driven validator, each new canonical utility requires a bespoke lint command.

## Decision

The kernel gains a `utility.provenance.validate` command that scans all `packages/**/*.ts` files for reimplemented canonical utilities, using a registry-driven approach with three violation detection strategies: import-based, name-based, and pattern-based. The command is registered in `PACKAGES_CHECK_PIPELINE` in warning mode during migration, transitioning to fail-hard after RFC-0915 implementation is complete.

## Architectural fit

- **DNA-53** (Semantic fingerprint governance) — `fingerprint.usage.lint` is the existing enforcement mechanism. This RFC generalizes the same pattern (scan + allowlist + mode flag) to all canonical utilities.
- **DNA-74** (Canonical Diagnostic schema ownership) — `diagnostic.shape.lint` enforces schema ownership. This RFC extends the same sole-ownership enforcement to utility functions.
- **DNA-88** (Canonical slug generation, established by RFC-0915) — this RFC provides the automated enforcement for DNA-88 that `fingerprint.usage.lint` provides for DNA-53.
- **RFC-0915** — companion RFC that consolidates slug logic and establishes DNA-88. This RFC depends on RFC-0915 for the canonical module path and initial registry entries.
- **Site OS operator model** — workspace-scope check command, registered in `PACKAGES_CHECK_PIPELINE`, follows the same pattern as `fingerprint.usage.lint` (mode flag, allowlist, Diagnostic[] output).

## Design

### CLI surface

```sh
pnpm exec werkstatt run utility.provenance.validate
pnpm exec werkstatt run utility.provenance.validate --mode warning
pnpm exec werkstatt run utility.provenance.validate --mode fail --json
```

Flags:

- `--mode` (string, default `warning`): `warning` emits violations as warnings, `fail` emits as errors with non-zero exit code.
- `--json`: standard JSON output envelope.

Scope: workspace. No `--app` flag — scans all packages.

### Utility registry

A YAML registry file at `packages/werkstatt-shared/src/share/utility-registry.yaml`:

```yaml
utilities:
  - id: slug
    canonicalPath: packages/werkstatt-shared/src/share/slug/
    forbiddenImports:
      - "@sindresorhus/slugify"
      - "cyrillic-to-translit-js"
      - "github-slugger"
    functionNames:
      - slugify
      - toSlug
      - makeSlug
      - createSlug
      - slugUrl
      - slugId
    patterns:
      - regex: 'normalize\(["'']NFKD["'']\).*replace\(/\\\[\\u0300-\\u036f\\\]/g.*replace\(/\\[\^a-z0-9\\\]+/g'
        description: "NFKD normalize + diacritic strip + non-alphanumeric replace (reimplemented slugify)"
    allowlist:
      - file: "packages/werkstatt-shared/src/share/slug/**"
        reason: "Canonical slug module"
      - file: "packages/werkstatt-shared/src/share/semantic/extract.ts"
        reason: "Legacy re-export during migration — removed after RFC-0915 implementation"
```

### TypeScript contracts

```ts
interface UtilityRegistryEntry {
  id: string;
  canonicalPath: string;
  forbiddenImports: string[];
  functionNames: string[];
  patterns: { regex: string; description: string }[];
  allowlist: { file: string; reason: string }[];
}

interface UtilityProvenanceViolation {
  ruleId: string;       // "UTIL-PROV-01" | "UTIL-PROV-02" | "UTIL-PROV-03"
  severity: "error" | "warning";
  file: string;
  line?: number;
  message: string;
  fixHint: string;
  data: { utilityId: string; violationType: "import" | "name" | "pattern" };
}
```

### Violation codes

| Code | Type | Trigger |
| --- | --- | --- |
| `UTIL-PROV-01` | import | A file outside `canonicalPath` imports a `forbiddenImports` package |
| `UTIL-PROV-02` | name | A file outside `canonicalPath` declares a function matching `functionNames` |
| `UTIL-PROV-03` | pattern | A file outside `canonicalPath` matches a `patterns[].regex` heuristic |

### Detection strategies

1. **Import-based (UTIL-PROV-01)**: Scan `import ... from "forbiddenPackage"` and `require("forbiddenPackage")` statements. If the importing file is not inside `canonicalPath` and not in `allowlist`, emit violation.

2. **Name-based (UTIL-PROV-02)**: Scan for function declarations, arrow function assignments, and exported consts matching `functionNames` (e.g., `function slugify(`, `const slugify =`, `export function toSlug(`). If the file is not inside `canonicalPath` and not in `allowlist`, emit violation.

3. **Pattern-based (UTIL-PROV-03)**: Scan for regex patterns from `patterns[].regex`. These are heuristics for reimplemented logic (e.g., NFKD normalize + diacritic strip + replace). If the file is not inside `canonicalPath` and not in `allowlist`, emit violation.

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/werkstatt-shared/src/share/utility-registry.yaml` | Created — utility registry |
| `packages/werkstatt-shared/AGENTS.md` | Modified — document registry location and utility addition process |
| `packages/werkstatt-site/src/checks/utility-provenance.ts` | Created — validator implementation |
| `packages/werkstatt-site/src/checks/command-tables/infra-contracts.ts` | Modified — register `utility.provenance.validate` command |
| `packages/werkstatt-site/src/checks/pipelines/packages-check.ts` | Modified — add `utility.provenance.validate` to `PACKAGES_CHECK_PIPELINE` |
| `packages/**/*.ts` | Scanned for violations |

### Output format

```json
{
  "command": "utility.provenance.validate",
  "status": "fail",
  "violations": [
    {
      "ruleId": "UTIL-PROV-02",
      "severity": "error",
      "file": "packages/werkstatt-site/src/checks/person-create.ts",
      "line": 37,
      "message": "Function 'slugify' is a canonical slug utility reimplemented outside packages/werkstatt-shared/src/share/slug/ (DNA-88). Import from @warpgogol/werkstatt-shared/share/slug instead.",
      "fixHint": "Replace local slugify() with: import { slugUrl } from '@warpgogol/werkstatt-shared/share/slug';",
      "data": { "utilityId": "slug", "violationType": "name" }
    }
  ]
}
```

### Failure modes

- **Warning mode** (default during migration): violations are emitted as `severity: "warning"`, exit code 0. This allows existing codebases to adopt the validator without breaking CI.
- **Fail mode**: violations are emitted as `severity: "error"`, exit code 1. Used after migration is complete.
- **Registry parse error**: if `utility-registry.yaml` is missing or invalid YAML, the command fails with a `UTIL-REG-01` error and exit code 1.
- **Invalid regex pattern**: if a `patterns[].regex` string in the registry is an invalid regex (e.g., unbalanced parentheses), the command catches the regex compilation error and emits a `UTIL-REG-02` diagnostic with exit code 1, instead of crashing.
- **False positives**: pattern-based heuristics may match unrelated code. Mitigated by the allowlist mechanism — each allowlist entry requires a `reason` field.

## Rollout

1. **Create `utility-registry.yaml`** with the slug utility entry (canonical path, forbidden imports, function names, patterns, allowlist).
2. **Implement `utility-provenance.ts`** — the validator, following the `fingerprint.usage.lint` pattern (collect files, scan, check allowlist, emit diagnostics).
3. **Register command** in `command-tables/infra-contracts.ts` with `--mode warning` default.
4. **Add to `PACKAGES_CHECK_PIPELINE`** after `fingerprint.usage.lint` with `--mode warning`.
5. **Unit tests** — red (violation detected), green (allowlisted file passes), green (canonical module passes), green (clean file passes).
6. **After RFC-0915 implementation**: switch pipeline entry from `--mode warning` to `--mode fail` (separate commit, referenced to RFC-0915 implementation).

No flag day — warning mode allows existing violations to be detected without breaking CI. The transition to fail mode is a deliberate step after RFC-0915 removes all existing violations.

## Alternatives considered

1. **Extend `fingerprint.usage.lint` to cover slugs** — rejected. `fingerprint.usage.lint` is domain-specific (hash patterns) with a hardcoded pattern list. Slugs need different detection strategies (function names, import checks). Mixing domains in one command makes the allowlist and pattern list unmanageable.

2. **Create a separate `slug.provenance.lint` command** — rejected. The platform will accumulate more canonical utilities over time. A registry-driven `utility.provenance.validate` handles all current and future utilities without creating a new command per utility. Adding a new utility only requires a registry entry, not a new command, command-table entry, and pipeline step.

3. **Rely on ESLint no-restricted-imports rule** — rejected. ESLint rules are project-level config, not integrated into the Site OS pipeline. They cannot emit Diagnostic[] output, cannot be run via `pnpm exec werkstatt run`, and do not support the registry-driven pattern. The Site OS check pipeline is the canonical enforcement mechanism for DNA invariants.

## Risks

- **False positives from pattern-based detection** — the NFKD + replace heuristic may match unrelated string processing code. Mitigated by the allowlist mechanism with required `reason` fields, and by starting in warning mode.
- **Registry maintenance burden** — each new canonical utility requires a registry entry. Acceptable because the registry is the single source of truth and is simpler than creating a new lint command per utility.
- **Agent workarounds** — agents may rename functions (e.g., `mySlugify` instead of `slugify`) to evade name-based detection. The pattern-based detection catches the underlying logic, and the import-based detection catches direct package imports. No detection strategy is perfect — the goal is to raise the cost of reimplementing above the cost of importing the canonical utility.
- **Performance** — scanning all `packages/**/*.ts` files on every pipeline run. Acceptable because `fingerprint.usage.lint` already does the same and runs in under 1 second.
- **Agent misinterpretation** — agents may add allowlist entries without a reason. Mitigated by requiring `reason` in the registry schema and validating it in the command.

## Acceptance criteria

- [x] `utility.provenance.validate` command is registered in `command-tables/infra-contracts.ts` with `--mode` flag (evidence: `packages/werkstatt-site/src/checks/command-tables/infra-contracts.ts:240`)
- [x] `utility-registry.yaml` exists at `packages/werkstatt-shared/src/share/utility-registry.yaml` with slug utility entry (evidence: `packages/werkstatt-shared/src/share/utility-registry.yaml:1`)
- [x] `utility.provenance.validate` is registered in `PACKAGES_CHECK_PIPELINE` with `--mode warning` (evidence: `packages/werkstatt-site/src/checks/pipelines/packages-check.ts:189`)
- [x] Command detects import-based violations (UTIL-PROV-01) — unit test with forbidden import outside canonical path (evidence: `packages/werkstatt-site/src/checks/tests/utility-provenance.test.ts:109`)
- [x] Command detects name-based violations (UTIL-PROV-02) — unit test with `function slugify()` outside canonical path (evidence: `packages/werkstatt-site/src/checks/tests/utility-provenance.test.ts:122`)
- [x] Command detects pattern-based violations (UTIL-PROV-03) — unit test with NFKD + replace pattern outside canonical path (evidence: `packages/werkstatt-site/src/checks/tests/utility-provenance.test.ts:135`)
- [x] Allowlisted files do not produce violations — unit test with allowlisted file (evidence: `packages/werkstatt-site/src/checks/tests/utility-provenance.test.ts:151`)
- [x] `--json` output format matches the documented shape with `ruleId`, `severity`, `file`, `message`, `fixHint`, `data` fields (evidence: `packages/werkstatt-site/src/checks/tests/utility-provenance.test.ts:204`)
- [x] `build:check` passes with the new command in the pipeline (evidence: `pnpm run build:check` exit code 0)
- [x] `rfc.validate` passes on this file (evidence: `rfc.validate --id RFC-0916` exit code 0)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST follow the `fingerprint.usage.lint` implementation pattern: `collectFiles` → scan → `isAllowlisted` check → `diagnosticsResult` output.
- Agents MUST NOT add allowlist entries without a `reason` field — the validator should reject entries missing `reason`.
- Agents MUST NOT switch the pipeline entry from `--mode warning` to `--mode fail` until RFC-0915 is `implemented` and all existing violations are resolved.
- Agents adding new canonical utilities to the registry MUST include all three detection strategies: `forbiddenImports`, `functionNames`, and at least one `pattern`.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `rfc.supersede.propose --id RFC-0916 --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
