---
id: RFC-0733
title: "Forge pinned-files protection system"
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
createdAt: 2026-08-07
updatedAt: 2026-08-07
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - DNA-1
  - DNA-42
  - DNA-54
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-62
# RFC-0396: Traceability to a vendored spec node: "<spec-id>/<node-id>", e.g. "pbp/RFC-PBP-020".
# Set by spec.materialize; leave commented for non-spec RFCs.
# specRef:
# RFC-0478: Platform versioning enforcement. Declares the SemVer delta this RFC
# produces when implemented. Required for post-cutoff implemented RFCs (V-29).
# Values: minor (Breaks-B, requires migrator), patch (safe), none (prose-only),
# major (architectural, manually reserved). Default: patch.
versionBump: minor
commands:
  proposed:
    - forge pinned.validate
    - forge pinned.init
  added: []
  changed:
    - forge docs.archive
    - forge rfc.archive
    - forge adr.archive
    - forge plan.archive
    - forge audit.archive
    - forge session.archive
    - forge mission.archive
  removed: []
appsImpacted: []
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - "@warpgogol/forge"
successSignals:
  - "forge pinned.validate exits 0 when no violations"
  - "forge docs.archive skips pinned files with a warning instead of moving them"
  - "Pre-commit hook blocks commits that delete/move/modify pinned files without --allow-pinned-override"
  - "CI check catches pinned-file violations that bypass pre-commit hook (--no-verify)"
  - ".forge/pinned.yaml is self-protected (freeze mode) and cannot be silently removed"
nonGoals:
  - "Does not protect against git force-push or history rewrite (out of scope for file-level protection)"
  - "Does not encrypt or obfuscate pinned files"
  - "Does not protect files outside the repository"
  - "Does not replace code review or AGENTS.md rules — complements them with automated enforcement"
# RFC-0268: OPTIONAL machine-checkable acceptance probes, executed on-demand
# via `pnpm exec site-kernel run rfc.acceptance.run --id <this-rfc-id>` (never
# automatically inside build pipelines). Closed probe vocabulary — see
# docs/rfcs/rfc-0268-make-rfc-acceptance-criteria-machine-checkable.md.
acceptance:
  - probe: command-registered
    name: "forge pinned.validate"
  - probe: command-registered
    name: "forge pinned.init"
  - probe: file-contains
    path: "packages/forge/os/core/core.module.ts"
    pattern: "pinned"
  - probe: file-contains
    path: "packages/forge/os/rfc/handlers/archive.ts"
    pattern: "pinned"
  - probe: file-contains
    path: "docs/architecture-dna.md"
    pattern: "DNA-62"
---

# RFC-0733: Forge pinned-files protection system

## Context

During a routine `forge docs.archive` run in a forge-consuming project, the RFC template file (`docs/rfcs/rfc-0000-template.md`) was moved into the archive directory alongside implemented RFCs. The template was an untracked file — it had never been committed to git — so `forge docs.archive` treated it as just another file to archive. The file was lost from its expected location and had to be restored manually from the forge npm package distribution.

This incident revealed a systemic gap: **no mechanism prevents forge commands or agents from moving, deleting, or modifying foundational repository files**. Templates, configuration files, and structural directories are the scaffolding that the entire workshop depends on, yet they have no more protection than any random file.

The incident was reported as RFC-0076 in the consuming project (pipelines). That RFC is a specification for the `@warpgogol/forge` npm package — it asks the forge package to implement the protection system. This RFC (RFC-0733) is the werkstatt-internal counterpart: it adapts the same specification for implementation inside `packages/forge` in this monorepo. When the improved package is published to npm, the consuming project can update and immediately receive the improvement.

## Problem

Three concrete failure modes exist today:

1. **Forge archive commands move templates.** `forge docs.archive` scans `docs/rfcs/` and moves any file with a terminal-status frontmatter into `docs/rfcs/archive/`. Template files (`rfc-0000-template.md`, `adr-0000-template.md`) match the scan pattern if they have status frontmatter. There is no pre-check to skip files that are structural necessities. The archive handlers in `packages/forge/os/rfc/handlers/archive.ts`, `packages/forge/os/adr/handlers/archive.ts`, `packages/forge/os/plan/handlers/archive.ts`, `packages/forge/os/audit/handlers/archive.ts`, `packages/forge/os/session/handlers/archive.ts`, and `packages/forge/os/mission/handlers/archive.ts` all use `fs.rename` without any pinned-file pre-check.

2. **Agents can delete or move any file.** An agent executing `trash-put docs/rfcs/rfc-0000-template.md` or `git mv docs/rfcs/ docs/archive/rfcs/` faces no automated barrier. The pre-commit hook (`hooks/pre-commit`) does not check for protected paths. CI has no pinned-file validation step.

3. **No audit trail for foundation changes.** When a foundational file is modified or moved, there is no record of who authorized the change or why. The operator works through agents (per operator preference), so "who" is always an agent — but there is no log of which agent, which session, or which operator instruction triggered the change.

## Decision

Forge gains a pinned-files protection system: a `.forge/pinned.yaml` manifest declares files and directories that must not be moved, deleted, or (optionally) modified. Forge commands that relocate files (`docs.archive`, `rfc.archive`, `adr.archive`, `plan.archive`, `audit.archive`, `session.archive`, `mission.archive`) check the manifest before operating and skip pinned entries. A pre-commit hook and CI check (both shipped by forge) enforce the manifest on all commits. An `--allow-pinned-override <path>` flag provides an audited escape hatch for operator-directed changes to frozen files. DNA-62 (Foundation File Integrity) is established by this RFC.

## Architectural fit

### Architecture DNA

- **DNA-62** (Foundation File Integrity) — established by this RFC. Foundational repository files are protected by a pinned-files manifest enforced at both the forge-command level and the git-commit level.
- **DNA-1** (Monorepo boundary) — aligned. The pinned-files system protects the structural integrity of the repository boundary — templates, configs, and structural directories that define the monorepo shape.
- **DNA-42** (Compass markup contract) — aligned. Compass source files (`MODULE_CONTRACT`, `CHANGE_SUMMARY`) are structural necessities that benefit from pin protection.
- **DNA-54** (Forge bindings contract) — aligned. `forge.yaml` is a foundational config file that should be pinned. The `.forge/` directory is introduced as a convention for forge-extension configs that are not part of forge core.

### Forge extension model

The `.forge/` directory is introduced as a convention for forge-extension configs that are not part of forge core (`forge.yaml` remains at the repo root due to forge's hardcoded path resolution). `pinned.yaml` is the first resident of `.forge/`.

### Agent governance

This RFC complements AGENTS.md rules with automated enforcement. AGENTS.md tells agents what not to do; the pinned-files system prevents them from doing it and logs the attempt.

### Cross-platform compatibility

Per `packages/forge/AGENTS.md`, `@warpgogol/forge` is published to npm and must remain cross-platform. The pinned-files system MUST NOT assume a POSIX-only environment — path matching, git diff parsing, and hook installation must work on both Linux and Windows. The pre-commit hook script is a portable shell script (`#!/bin/sh`), and the CI workflow uses GitHub Actions which runs on `ubuntu-latest`.

## Design

### Manifest format

`.forge/pinned.yaml` — a YAML file at the repository root:

```yaml
# .forge/pinned.yaml
# Pinned files and directories — protected from deletion, move, and (for freeze) modification.
# Agents MUST NOT remove or modify entries without operator approval + --allow-pinned-override.

pinned:
  - path: ".forge/pinned.yaml"
    mode: freeze
    reason: "Self-protection — manifest must not be tampered with"

  - path: "docs/rfcs/rfc-0000-template.md"
    mode: freeze
    reason: "RFC template — required for rfc.create"

  - path: "docs/adrs/adr-0000-template.md"
    mode: freeze
    reason: "ADR template — required for adr.create"

  - path: "docs/architecture-dna.md"
    mode: freeze
    reason: "Architecture DNA invariants — foundational governance document"

  - path: "forge.yaml"
    mode: protect
    reason: "Forge configuration — required for all forge commands"

  - path: "package.json"
    mode: protect
    reason: "Root package.json — workspace manifest"

  - path: "pnpm-workspace.yaml"
    mode: protect
    reason: "Workspace definition"

  - path: "tsconfig.base.json"
    mode: protect
    reason: "Base TypeScript config"

  - path: "turbo.json"
    mode: protect
    reason: "Turborepo configuration"

  - path: "PREFERENCES.md"
    mode: protect
    reason: "Operator preferences"

  - path: "AGENTS.md"
    mode: protect
    reason: "Agent rules manifest"

  - path: "docs/rfcs/"
    mode: protect
    reason: "RFC directory — structural foundation"

  - path: "docs/adrs/"
    mode: protect
    reason: "ADR directory — structural foundation"
```

**Mode semantics:**

| Mode      | Delete  | Move/Rename | Modify content                               |
| --------- | ------- | ----------- | -------------------------------------------- |
| `protect` | blocked | blocked     | allowed                                      |
| `freeze`  | blocked | blocked     | blocked (requires `--allow-pinned-override`) |

**Path matching:** Paths are relative to the repository root. Directory entries (trailing `/`) protect all files recursively within that directory from deletion and move, but do not freeze individual file contents unless explicitly listed.

**Self-protection:** `.forge/pinned.yaml` is listed as `mode: freeze`. Forge additionally enforces an integrity rule: if the manifest file itself is deleted, moved, or has entries removed without an override flag, validation fails with a dedicated error code (`PINNED_MANIFEST_TAMPERED`).

### CLI surface

```sh
# Initialize pinned.yaml with default foundation entries
forge pinned.init

# Validate working tree against pinned manifest
forge pinned.validate

# Validate with override for a specific path (audited)
forge pinned.validate --allow-pinned-override docs/rfcs/rfc-0000-template.md

# JSON output for CI integration
forge pinned.validate --json

# CI mode — checks last commit diff (not staged changes)
forge pinned.validate --mode ci --json
```

`forge pinned.init` creates `.forge/pinned.yaml` with default entries (templates, configs, structural directories). If the file already exists, it merges new defaults with existing entries (does not overwrite custom entries). It also installs the pre-commit hook into `.git/hooks/pre-commit` (or merges with an existing hook by appending the forge check). The optional `--ci` flag also generates `.github/workflows/pinned-check.yml`.

`forge pinned.validate` checks the current working tree against the manifest:

- Scans `git diff --cached --name-status` (staged changes) when run as a pre-commit hook (default mode).
- Scans `git diff --name-status HEAD~1 HEAD` (last commit) when run with `--mode ci`.
- Reports violations with file path, mode, and operation type.
- Exits non-zero on violations unless `--allow-pinned-override` covers all violations.

### Forge command integration

Archive commands (`docs.archive`, `rfc.archive`, `adr.archive`, `plan.archive`, `audit.archive`, `session.archive`, `mission.archive`) check the pinned manifest before moving files:

1. Load `.forge/pinned.yaml` (if it exists).
2. For each file about to be moved, check if its path matches a pinned entry.
3. If pinned: **skip the file** and emit a warning to stderr: `⚠ pinned: skipping <path> (mode: freeze/protect)`.
4. Continue with non-pinned files normally.

This is a **pre-check** — it prevents the file from being moved in the first place, eliminating the need for post-hoc recovery.

The pre-check is implemented as a shared utility function in `packages/forge/os/core/handlers/pinned-check.ts` (or similar location). All archive handlers call this utility before `fs.rename`. The utility loads the manifest once per invocation (cached) and provides a `isPinned(relPath: string): PinnedEntry | null` lookup.

### Pre-commit hook

Forge ships a pre-commit hook script that calls `forge pinned.validate`:

```sh
#!/bin/sh
# .git/hooks/pre-commit (installed by forge pinned.init)
forge pinned.validate || exit 1
```

`forge pinned.init` installs the hook into `.git/hooks/pre-commit`. If a pre-commit hook already exists, it appends the forge check (with a marker comment for idempotent re-installation).

### CI check

Forge ships a reusable GitHub Actions workflow snippet:

```yaml
# .github/workflows/pinned-check.yml
name: pinned-files
on: [push, pull_request]
jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 2
      - run: npm install -g @warpgogol/forge
      - run: forge pinned.validate --mode ci --json
```

The `--mode ci` flag checks the last commit diff (not staged changes), catching pushes that bypassed the pre-commit hook via `--no-verify`.

### Override and audit log

When `--allow-pinned-override <path>` is used:

1. The override is logged to `.forge/pinned-audit.log` (append-only):
   ```jsonl
   {"timestamp":"2026-08-07T12:43:00Z","path":"docs/rfcs/rfc-0000-template.md","mode":"freeze","operator":"agent","reason":"operator-directed template update"}
   ```
2. The validation passes for that path on that invocation only.
3. The audit log entry does NOT include the operator identity (agents don't have stable identities) — it records the session/commit context instead.

The audit log file (`.forge/pinned-audit.log`) is NOT pinned — it is append-only and grows indefinitely. It should be added to `.gitignore` or rotated periodically.

### TypeScript contracts

```ts
// packages/forge/os/core/handlers/pinned-types.ts

interface PinnedEntry {
  path: string;       // relative to repo root, trailing / for directory
  mode: "protect" | "freeze";
  reason: string;
}

interface PinnedManifest {
  pinned: PinnedEntry[];
}

interface PinnedViolation {
  path: string;
  mode: "protect" | "freeze";
  operation: "delete" | "move" | "modify";
  reason: string;
}

interface PinnedValidateOptions {
  allowPinnedOverride?: string[];  // paths to exempt on this invocation
  mode?: "staged" | "ci";          // staged = pre-commit, ci = last-commit diff
  json?: boolean;
}

interface PinnedValidateResult {
  command: "pinned.validate";
  status: "pass" | "fail";
  violations: PinnedViolation[];
  overrides: string[];
}
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `.forge/pinned.yaml` | Manifest of pinned files and directories (created by `pinned.init`) |
| `.forge/pinned-audit.log` | Append-only audit log of override events (NOT pinned, gitignored) |
| `.git/hooks/pre-commit` | Pre-commit hook calling `forge pinned.validate` (installed by `pinned.init`) |
| `.github/workflows/pinned-check.yml` | CI workflow (optional, installed by `pinned.init --ci`) |
| `packages/forge/os/core/handlers/pinned-init.ts` | `pinned.init` handler implementation |
| `packages/forge/os/core/handlers/pinned-validate.ts` | `pinned.validate` handler implementation |
| `packages/forge/os/core/handlers/pinned-check.ts` | Shared pre-check utility for archive commands |
| `packages/forge/os/core/core.module.ts` | Command registration for `pinned.init` and `pinned.validate` |

### Output format

```json
{
  "command": "pinned.validate",
  "status": "fail",
  "violations": [
    {
      "path": "docs/rfcs/rfc-0000-template.md",
      "mode": "freeze",
      "operation": "move",
      "reason": "RFC template — required for rfc.create"
    }
  ],
  "overrides": []
}
```

### Failure modes

- **Violation found, no override:** exit 1, print violations to stderr. Pre-commit hook blocks the commit.
- **Violation found, override matches:** exit 0, log to audit file, print warning to stderr.
- **Manifest missing:** exit 0 with info message "No .forge/pinned.yaml found — pinned-files protection inactive." Does NOT fail — protection is opt-in per repository.
- **Manifest malformed:** exit 2 with error "pinned.yaml is not valid YAML or missing required fields."
- **Manifest tampered (entries removed):** exit 1 with `PINNED_MANIFEST_TAMPERED` error — integrity check compares current manifest against last-committed version.

## Rollout

1. **Implement in forge** — this RFC specifies the `@warpgogol/forge` npm package implementation. The forge package agent implements `pinned.init`, `pinned.validate`, archive command integration, pre-commit hook installer, and CI workflow template.
2. **Publish forge update** — new forge version with pinned-files support is published to npm.
3. **Update in consuming projects** — `npm install -g @warpgogol/forge@latest` (or `pnpm update @warpgogol/forge`) in consuming repos.
4. **Initialize** — run `forge pinned.init` to create `.forge/pinned.yaml` with default entries and install the pre-commit hook.
5. **Add CI workflow** — optionally run `forge pinned.init --ci` to generate `.github/workflows/pinned-check.yml`.
6. **Commit** — commit `.forge/pinned.yaml` and the CI workflow. The pre-commit hook is installed locally (not committed, since `.git/hooks/` is not tracked).

**Backward compatibility:** Repositories without `.forge/pinned.yaml` are unaffected — forge commands behave exactly as before. Protection is opt-in per repository via `forge pinned.init`.

**No flag day:** Existing repos adopt by running `forge pinned.init` at any time. No migration, no breaking changes.

**Werkstatt self-adoption:** After implementation, the werkstatt monorepo itself can adopt the system by running `forge pinned.init` and committing `.forge/pinned.yaml`.

## Alternatives considered

1. **`.gitignore`-style protection.** Instead of a YAML manifest, use a `.forge/pinned` file with one path per line, similar to `.gitignore`. Rejected — lacks per-entry mode (`protect` vs `freeze`) and reason field. YAML manifest is more expressive and self-documenting.

2. **Git attributes-based protection.** Use `.gitattributes` with a custom filter to prevent modifications. Rejected — `.gitattributes` filters are designed for content transformation (e.g., line endings), not access control. They can be bypassed and don't provide audit logging.

3. **OS-level file permissions (chmod 444).** Make pinned files read-only on the filesystem. Rejected — doesn't work in CI (containers run as root), doesn't prevent `git mv`, and doesn't provide audit logging. Also platform-dependent (Windows behavior differs).

4. **Separate npm package (`@warpgogol/pinned-guard`).** Ship the protection system as a standalone package, not integrated into forge. Rejected — forge already owns the archive commands that need pre-checks. A separate package would need to wrap or monkey-patch forge, creating fragility. Integration into forge is cleaner.

5. **Post-hoc only (no pre-check in forge commands).** Rely solely on pre-commit hook + CI. Rejected — the root cause incident showed that forge commands can move files before any hook runs. Pre-check in archive commands prevents the damage from occurring in the first place.

## Risks

- **False positives on directory moves.** If an agent renames `docs/rfcs/` to `docs/rfc/` (a legitimate refactor), the `protect` mode on `docs/rfcs/` blocks it. Mitigation: `--allow-pinned-override docs/rfcs/` lifts the block with audit logging. The operator reviews the audit log.

- **Manifest maintenance burden.** Every new foundational file must be manually added to `.forge/pinned.yaml`. Mitigation: `forge pinned.init` merges defaults, so new foundation files added by forge upgrades are auto-pinned. Repo-specific files require manual addition.

- **Agent confusion about override.** An agent might use `--allow-pinned-override` too liberally, treating it as a blanket bypass. Mitigation: the flag requires a specific path (not a glob), is logged to the audit file, and AGENTS.md should state that overrides require explicit operator instruction.

- **Pre-commit hook bypass via `--no-verify`.** A determined agent can bypass the pre-commit hook. Mitigation: CI check catches violations on push. The combination of pre-commit + CI provides defense in depth, not absolute prevention.

- **Manifest tampering.** An agent could delete `.forge/pinned.yaml` entirely and then delete pinned files. Mitigation: the integrity rule (`PINNED_MANIFEST_TAMPERED`) compares the current manifest against the last-committed version. If the manifest is deleted, validation fails. However, if an agent deletes the manifest AND commits with `--no-verify`, only CI catches it.

- **Performance.** `pinned.validate` runs on every commit (pre-commit hook). For repos with hundreds of pinned entries, path matching could be slow. Mitigation: manifest entries are compiled to a lookup map at load time. O(n) where n = pinned entries, typically <50.

- **Cross-platform hook installation.** The pre-commit hook is a shell script (`#!/bin/sh`). On Windows, Git Bash is required for hook execution. Mitigation: Git for Windows includes Git Bash by default. The hook script avoids POSIX-only constructs (no `bash`-specific syntax).

## Acceptance criteria

- [ ] `forge pinned.init` creates `.forge/pinned.yaml` with default entries (templates, configs, structural directories) and installs pre-commit hook
- [ ] `forge pinned.validate` exits 0 when no violations, exits 1 with violation list when pinned files are deleted/moved/modified
- [ ] `forge pinned.validate --allow-pinned-override <path>` passes for the specified path and logs to `.forge/pinned-audit.log`
- [ ] `forge pinned.validate --json` produces stable JSON output with `command`, `status`, `violations`, `overrides` fields
- [ ] Archive commands (`docs.archive`, `rfc.archive`, `adr.archive`, `plan.archive`, `audit.archive`, `session.archive`, `mission.archive`) skip pinned files with a stderr warning instead of moving them
- [ ] `.forge/pinned.yaml` is self-protected: deleting or modifying it without override triggers `PINNED_MANIFEST_TAMPERED` error
- [ ] CI workflow template (`forge pinned.init --ci`) generates `.github/workflows/pinned-check.yml` that runs `forge pinned.validate --mode ci`
- [ ] Repositories without `.forge/pinned.yaml` are unaffected — forge commands behave as before
- [ ] `DNA-62` entry added to `docs/architecture-dna.md` with reference to this RFC
- [ ] Unit tests: violation detected (delete/move/modify), override passes + audit log written, manifest missing (exit 0), manifest tampered (PINNED_MANIFEST_TAMPERED), archive pre-check skips pinned files
- [ ] `rfc.validate` passes on this file with zero errors

## Implementation notes for agents

- This RFC is a **specification for the `@warpgogol/forge` npm package** (`packages/forge` in this monorepo). The forge package agent implements this RFC.
- Consuming projects adopt the feature by updating forge from npm and running `forge pinned.init`.
- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- For RFCs created on or after 2026-07-07 with acceptance probes: before stamping `implemented`, run `site-kernel run rfc.verification.emit --id <this-rfc-id>` and commit the evidence file in the same commit (RFC-0330 amended transition precondition).
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- Agents MUST NOT use `--allow-pinned-override` without explicit operator instruction. The audit log records the override event for post-hoc review.
- Agents MUST NOT delete or modify `.forge/pinned.yaml` without operator approval. The manifest is self-protected (`mode: freeze`).
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
- The `.forge/` directory is a new convention for forge-extension configs. `forge.yaml` remains at the repo root (forge hardcodes this path).
- The pre-check utility for archive commands MUST be a shared function, not duplicated across each archive handler. All archive handlers (`rfc.archive`, `adr.archive`, `plan.archive`, `audit.archive`, `session.archive`, `mission.archive`) call the same `isPinned` lookup from `packages/forge/os/core/handlers/pinned-check.ts`.
- The `docs.archive` umbrella command delegates to individual archive handlers, so the pre-check in each handler is sufficient — `docs.archive` itself does not need a separate pre-check.
- Use `writeFileIfChanged` from `@warpgogol/forge/utils` for manifest file writes (per `packages/AGENTS.md` generated file writes rule).
- The pinned-files system MUST be cross-platform (Linux + Windows) per `packages/forge/AGENTS.md` — forge is published to npm and consumers may run on either OS.
- The `forge pinned.init` and `forge pinned.validate` commands are registered in `forgeCoreModule` (`packages/forge/os/core/core.module.ts`), alongside `docs.archive` and other core commands.
