---
id: RFC-0792
title: "Extend sternsystem.validate with YAML syntax checking for system config files"
status: accepted
kind: command
scope: workspace
owners:
  - architecture
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-08-10
updatedAt: 2026-08-10
enhancedAt: 2026-08-10
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
  - "Broken YAML in systems-cache/<id>/ is caught by sternsystem.validate before mission.validate"
  - "No manual YAML linting step needed — validation is automatic"
nonGoals:
  - "Do not validate YAML semantics or schema — only syntax (parseability)"
  - "Do not check files outside systems-cache/<id>/ (top-level only, non-recursive)"
  - "Do not add a new standalone command — extend sternsystem.validate"
  - "Do not duplicate dns.records.schema.validate — that command validates dns-records.yaml against its schema; this RFC adds only syntax checking for all YAML files as a first-line defense"
---

# RFC-0792: Extend sternsystem.validate with YAML syntax checking for system config files

## Context

RFC-0790 replaced `systems/registry.yaml` with convention-based system discovery. Each Sternsystem now has config files in `systems-cache/{id}/` (outside the monorepo), including `system-config.yaml`, `system-state.yaml`, `dns-records.yaml`, and other YAML files.

During the RFC-0789 deployment session, `systems-cache/warpgogol-com/dns-records.yaml` had a YAML syntax error (broken indentation and block ordering). This was not caught until `mission.validate` ran — and the error message from `mission.validate` did not clearly point to the YAML file as the root cause.

`sternsystem.validate` already checks mirror topology rules (RFC-0790): `mirrors[0]` must be non-bare, mirror paths must exist, no embedded credentials. It also catches `system-config.yaml` parse errors via the `discovery-error` rule (`discoverSystems` in `registry-io.ts` wraps `readSystemConfig` in try/catch and reports failures as `discovery-error` violations). However, other YAML files (`dns-records.yaml`, `system-state.yaml`, etc.) are not parsed during validation — a syntax error in those files surfaces only when a downstream command reads them.

## Problem

The invariant "all YAML files in `systems-cache/<id>/` are parseable" is not fully enforced by any validation command. `system-config.yaml` is covered by the existing `discovery-error` rule, but other YAML files (`dns-records.yaml`, `system-state.yaml`, and any future YAML files) are not parsed during `sternsystem.validate`. A broken YAML file can cause:

1. `mission.validate` to fail with a cryptic error (YAML parse exception deep in the pipeline, not clearly attributed to the source file).
2. `sternsystem.sync` to fail mid-operation.
3. Deploy commands to fail at an unexpected stage.

The root cause is that `sternsystem.validate` only parses `system-config.yaml` (via `discoverSystems`) for topology checks. Other YAML files are read on-demand by individual commands (`dns.records.schema.validate`, `sternsystem.sync`, etc.) — none of which are called during `sternsystem.validate`.

## Decision

The `sternsystem.validate` command parses every `.yaml` and `.yml` file in `systems-cache/<id>/` (top-level only, non-recursive) and reports syntax errors as violations with rule `yaml-syntax-error`, using the existing `violations` array shape (`{ systemId, rule, message }`). Files that parse successfully are not flagged.

This supplements the existing `discovery-error` rule (which covers `system-config.yaml` parse failures during discovery) by extending syntax checking to all other YAML files in the cache clone directory. The overlap with `dns.records.schema.validate` is intentional: `sternsystem.validate` provides a single-command first-line defense (syntax-only), while `dns.records.schema.validate` provides deeper schema validation for `dns-records.yaml` specifically.

## Architectural fit

- **Architecture DNA**: Strengthens the Sternsystem contract (RFC-0790) by ensuring config files are structurally valid before any pipeline operation reads them.
- **Site OS operator model**: Extends an existing `sternsystem.validate` command. No new command, no new pipeline stage — the check runs as part of the existing validation.
- **Scaling Playbook**: Applies uniformly across all Sternsystems — every system has YAML config files that must be parseable.

## Design

### CLI surface

No new command. The existing command is unchanged from the operator's perspective:

```sh
pnpm exec werkstatt run sternsystem.validate --id warpgogol-com
```

### TypeScript contracts

```ts
// New helper using node:fs/promises (matching existing handler patterns):
async function validateYamlFiles(
  cacheDir: string,
  systemId: string,
): Promise<Array<{ systemId: string; rule: string; message: string }>> {
  // 1. Read top-level directory entries (non-recursive)
  // 2. Filter for *.yaml and *.yml files
  // 3. For each file, attempt to parse with yaml.parse()
  // 4. On parse error, push a violation:
  //    {
  //      systemId,
  //      rule: "yaml-syntax-error",
  //      message: `${relativePath}: YAML syntax error: ${error.message}`,
  //    }
  // 5. Return violations array (empty if all files parse successfully)
}

// Integration in runSternsystemValidate (inside the per-system loop,
// after existing checks):
const yamlViolations = await validateYamlFiles(cacheDir, entry.id);
violations.push(...yamlViolations);
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `systems-cache/<id>/*.yaml` | Scanned and parsed for syntax validation (top-level only) |
| `systems-cache/<id>/*.yml` | Scanned and parsed for syntax validation (top-level only) |
| `packages/werkstatt/src/sternsystem/` | Validation logic updated |

Expected YAML files in `systems-cache/<id>/`:

- `system-config.yaml` — already covered by `discovery-error`, also checked here for consistency
- `system-state.yaml` — mutable state file
- `dns-records.yaml` — DNS record declarations (also validated by `dns.records.schema.validate`)
- Any future top-level YAML files — automatically covered

### Output format

Uses the existing `violations` array shape — no new `diagnostics` array:

```json
{
  "command": "sternsystem.validate",
  "data": {
    "validated": 1,
    "violations": [
      {
        "systemId": "warpgogol-com",
        "rule": "yaml-syntax-error",
        "message": "dns-records.yaml: YAML syntax error: bad indentation of a mapping entry at line 12"
      }
    ],
    "warnings": [],
    "withOwner": 1,
    "withoutOwner": 0
  },
  "exitCode": 1
}
```

### Failure modes

- **YAML parse error**: Reports `yaml-syntax-error` with the parser's error message and line number in the `message` field. Exits non-zero.
- **No YAML files in `systems-cache/<id>/`**: No violations. Not an error — a system may not have YAML config files yet.
- **YAML file is empty**: Parses as `null` — not a syntax error. No violation.
- **File does not exist**: `sternsystem.validate` already checks for required files (`system-config.yaml`). Optional files that don't exist are skipped.
- **Subdirectories**: Only top-level YAML files are scanned. YAML files in subdirectories (e.g. `bordbuch/`) are not checked — they are managed by dedicated commands (`bordbuch.validate`).

## Rollout

- **Default behavior**: YAML syntax checking is enabled immediately in `sternsystem.validate`. No opt-in flag.
- **Existing systems**: All existing systems with valid YAML pass without changes. Systems with broken YAML fail — this is the desired behavior.
- **New systems**: Automatically covered — any new Sternsystem is validated from creation.
- **Pipeline integration**: `sternsystem.validate` is already called by `mission.validate` and `mission.close`. No pipeline change needed.
- **Deprecation path**: None — this is a purely additive check.

## Alternatives considered

- **Pre-commit hook**: A git pre-commit hook that lints YAML files. Rejected as primary solution because pre-commit hooks are local-only and can be bypassed. `sternsystem.validate` runs in CI and in the pipeline, providing a stronger guarantee.

- **Standalone `system-config.lint` command**: A new command dedicated to YAML linting. Rejected because it fragments validation — operators would need to remember to run it separately. Extending `sternsystem.validate` keeps all system-level checks in one command.

- **Schema validation (not just syntax)**: Validating that YAML files conform to a schema (e.g., `dns-records.yaml` has the expected fields). Rejected for this RFC — schema validation is a larger effort and should be a separate RFC if needed. Syntax validation is the minimal fix that prevents the failure mode observed in the RFC-0789 session. `dns.records.schema.validate` already provides schema validation for `dns-records.yaml`; this RFC adds syntax-only checking for all YAML files as a first-line defense within `sternsystem.validate`.

## Risks

- **False positives**: The YAML parser may report errors for files that use non-standard but accepted YAML constructs. Mitigation: use the same `yaml` library already used throughout the codebase (`yaml` npm package) to ensure consistency.
- **Performance**: Parsing a handful of YAML files is negligible.
- **Error message clarity**: The YAML parser's error messages include line numbers but may not be immediately clear to operators. The `message` field includes the file name and parser error text to direct them to the source.

## Acceptance criteria

- [ ] `validateYamlFiles` helper implemented in `packages/werkstatt/src/sternsystem/`
- [ ] `sternsystem.validate` calls `validateYamlFiles` and reports `yaml-syntax-error` violations
- [ ] Unit test: valid YAML files → no violations
- [ ] Unit test: broken YAML file → `yaml-syntax-error` violation with file path and line number in message
- [ ] Unit test: system directory with no YAML files → no error, no violations
- [ ] Unit test: YAML file in subdirectory → not scanned (top-level only)
- [ ] `rfc.validate` passes on this file before merging

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `rfc.supersede.propose` instead of working around it.
