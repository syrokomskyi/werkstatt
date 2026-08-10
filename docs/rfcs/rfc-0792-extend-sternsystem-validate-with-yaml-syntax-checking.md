---
id: RFC-0792
title: "Extend sternsystem.validate with YAML syntax checking for system config files"
status: draft
kind: command
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-08-10
updatedAt: 2026-08-10
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0790
satisfies: []
versionBump: patch
commands:
  proposed: []
  added: []
  changed:
    - sternsystem.validate
  removed: []
appsImpacted: []
packagesImpacted:
  - "@warpgogol/werkstatt"
successSignals:
  - "Broken YAML in systems/<id>/ is caught by sternsystem.validate before mission.validate"
  - "No manual YAML linting step needed — validation is automatic"
nonGoals:
  - "Do not validate YAML semantics or schema — only syntax (parseability)"
  - "Do not check files outside systems/<id>/"
  - "Do not add a new standalone command — extend sternsystem.validate"
---

# RFC-0792: Extend sternsystem.validate with YAML syntax checking for system config files

## Context

RFC-0790 replaced `systems/registry.yaml` with convention-based system
discovery. Each Sternsystem now has config files in `systems-cache/{id}/`
and `systems/{id}/`, including `system-config.yaml`, `system-state.yaml`,
`dns-records.yaml`, and other YAML files.

During the RFC-0789 deployment session, `systems/warpgogol-com/dns-records.yaml`
had a YAML syntax error (broken indentation and block ordering). This was
not caught until `mission.validate` ran — and the error message from
`mission.validate` did not clearly point to the YAML file as the root cause.

`sternsystem.validate` already checks mirror topology rules (RFC-0790):
`mirrors[0]` must be non-bare, mirror paths must exist, no embedded
credentials. But it does not verify that the YAML files themselves are
syntactically valid.

## Problem

The invariant "all YAML files in `systems/<id>/` are parseable" is not
enforced by any validation command. A broken YAML file can cause:

1. `mission.validate` to fail with a cryptic error (YAML parse exception
   deep in the pipeline, not clearly attributed to the source file).
2. `sternsystem.sync` to fail mid-operation.
3. Deploy commands to fail at an unexpected stage.

The root cause is that `sternsystem.validate` reads and parses
`system-config.yaml` for topology checks, but does not report parse errors
as validation diagnostics — it either crashes or silently skips the file.

## Decision

The `sternsystem.validate` command parses every `.yaml` and `.yml` file in
`systems/<id>/` and reports syntax errors as validation diagnostics with
rule ID `SYS-YAML-01`. Files that parse successfully are not flagged.

## Architectural fit

- **Architecture DNA**: Strengthens the Sternsystem contract (RFC-0790)
  by ensuring config files are structurally valid before any pipeline
  operation reads them.
- **Site OS operator model**: Extends an existing `sternsystem.validate`
  command. No new command, no new pipeline stage — the check runs as
  part of the existing validation.
- **Scaling Playbook**: Applies uniformly across all Sternsystems — every
  system has YAML config files that must be parseable.

## Design

### CLI surface

No new command. The existing command is unchanged from the operator's
perspective:

```sh
pnpm exec werkstatt run sternsystem.validate --id warpgogol-com
```

### TypeScript contracts

```ts
// New diagnostic rule in sternsystem.validate:
const SYS_YAML_01 = "SYS-YAML-01";

// New helper:
async function validateYamlFiles(
  systemDir: string,
  io: WorkspaceIO,
): Promise<Diagnostic[]> {
  // 1. Glob for *.yaml and *.yml in systemDir (non-recursive top-level only)
  // 2. For each file, attempt to parse with yaml.parse()
  // 3. On parse error, push a Diagnostic:
  //    {
  //      ruleId: "SYS-YAML-01",
  //      severity: "error",
  //      file: relativePath,
  //      message: `YAML syntax error: ${error.message}`,
  //      fixHint: `Fix the YAML syntax in ${relativePath}.`,
  //    }
  // 4. Return diagnostics array
}
```

### File system responsibilities

| Path | Role |
|---|---|
| `systems/<id>/*.yaml` | Scanned and parsed for syntax validation |
| `systems/<id>/*.yml` | Scanned and parsed for syntax validation |
| `packages/werkstatt/src/sternsystem/` | Validation logic updated |

### Output format

```json
{
  "command": "sternsystem.validate",
  "status": "fail",
  "diagnostics": [
    {
      "ruleId": "SYS-YAML-01",
      "severity": "error",
      "file": "systems/warpgogol-com/dns-records.yaml",
      "message": "YAML syntax error: bad indentation of a mapping entry at line 12",
      "fixHint": "Fix the YAML syntax in systems/warpgogol-com/dns-records.yaml."
    }
  ]
}
```

### Failure modes

- **YAML parse error**: Reports `SYS-YAML-01` with the parser's error
  message and line number. Exits non-zero.
- **No YAML files in `systems/<id>/`**: No diagnostics. Not an error —
  a system may not have YAML config files yet.
- **YAML file is empty**: Parses as `null` — not a syntax error. No
  diagnostic.
- **File does not exist**: `sternsystem.validate` already checks for
  required files (`system-config.yaml`). Optional files that don't exist
  are skipped.

## Rollout

- **Default behavior**: YAML syntax checking is enabled immediately in
  `sternsystem.validate`. No opt-in flag.
- **Existing systems**: All existing systems with valid YAML pass without
  changes. Systems with broken YAML fail — this is the desired behavior.
- **New systems**: Automatically covered — any new Sternsystem is
  validated from creation.
- **Pipeline integration**: `sternsystem.validate` is already called by
  `mission.validate` and `mission.close`. No pipeline change needed.
- **Deprecation path**: None — this is a purely additive check.

## Alternatives considered

- **Pre-commit hook**: A git pre-commit hook that lints YAML files.
  Rejected as primary solution because pre-commit hooks are local-only
  and can be bypassed. `sternsystem.validate` runs in CI and in the
  pipeline, providing a stronger guarantee.

- **Standalone `system-config.lint` command**: A new command dedicated
  to YAML linting. Rejected because it fragments validation — operators
  would need to remember to run it separately. Extending
  `sternsystem.validate` keeps all system-level checks in one command.

- **Schema validation (not just syntax)**: Validating that YAML files
  conform to a schema (e.g., `dns-records.yaml` has the expected fields).
  Rejected for this RFC — schema validation is a larger effort and
  should be a separate RFC if needed. Syntax validation is the minimal
  fix that prevents the failure mode observed in the RFC-0789 session.

## Risks

- **False positives**: The YAML parser may report errors for files that
  use non-standard but accepted YAML constructs. Mitigation: use the
  same `yaml` library already used throughout the codebase (`yaml` npm
  package) to ensure consistency.
- **Performance**: Parsing a handful of YAML files is negligible.
- **Error message clarity**: The YAML parser's error messages include
  line numbers but may not be immediately clear to operators. The
  `fixHint` directs them to the file.

## Acceptance criteria

- [ ] `validateYamlFiles` helper implemented in `packages/werkstatt/src/sternsystem/`
- [ ] `sternsystem.validate` calls `validateYamlFiles` and reports `SYS-YAML-01` diagnostics
- [ ] Unit test: valid YAML files → no diagnostics
- [ ] Unit test: broken YAML file → `SYS-YAML-01` error with file path and line number
- [ ] Unit test: system directory with no YAML files → no error, no diagnostics
- [ ] `rfc.validate` passes on this file before merging

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `rfc.supersede.propose` instead of working around it.
