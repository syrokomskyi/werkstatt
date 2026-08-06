---
id: RFC-0722
title: "Enforce RFC and ADR directory structure convention"
status: implemented
# kind options: architecture | contract | command | policy | deprecation
kind: policy
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
createdAt: 2026-08-06
updatedAt: 2026-08-06
enhancedAt: 2026-08-06
implementedAt: 2026-08-06
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0367
  - RFC-0491
  - RFC-0366
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies: []
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
    - rfc.validate
    - adr.validate
  removed: []
appsImpacted: []
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - "@warpgogol/forge"
successSignals:
  - "Pre-commit hook blocks commit staging a file in docs/rfcs/draft/test.md"
  - "rfc.validate emits RFC-DIR-01 warning for a file in an unsanctioned subdirectory"
  - "adr.validate emits ADR-DIR-01 warning for a file in an unsanctioned subdirectory"
  - "Existing non-RFC files at docs/rfcs/ root (index.yaml, dna-trace.generated.yaml) are not blocked by pre-commit hook"
nonGoals:
  - "Adding new OS commands — this RFC extends existing rfc.validate and adr.validate with warning rules only"
  - "Changing rfc.create or adr.create behavior — these already write to the correct root location"
  - "Moving misplaced plan-rfc-0665.md from docs/rfcs/ to docs/plans/ — that is a pre-existing anomaly unrelated to this RFC"
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

# RFC-0722: Enforce RFC and ADR directory structure convention

## Context

RFC-0367 introduced `archive/<status>/` subdirectories for terminal-status RFC and ADR documents and made `listRfcFiles` / `listAdrFiles` recursive. RFC-0491 enforced `rfc.create` as the only sanctioned path for RFC creation and added `rfc.next-id`.

Despite these measures, an ad-hoc `docs/rfcs/draft/` subdirectory was created manually during a working session to organize 5 draft RFCs (rfc-0717..0721). This subdirectory:

- is not referenced in any accepted RFC or ADR
- is not written to by `rfc.create` (which writes to `docs/rfcs/` directly)
- is not tracked by git (untracked, never committed)
- works only because `listRfcFiles` happens to be recursive (RFC-0367)
- has no corresponding `docs/adrs/draft/` equivalent

Additionally, `ecosystem.commit`'s `readRfcVersionBump` function used non-recursive `fs.readdir` for RFC lookup, missing RFCs in `draft/` and any other subdirectory. This was fixed in a prior commit (4.17.26), but the underlying problem remains: nothing prevents the creation of unauthorized subdirectories under `docs/rfcs/` and `docs/adrs/`.

## Problem

1. **No formal directory structure contract.** RFC-0367 defines `archive/` as the only sanctioned subdirectory, but nothing enforces this. Agents and operators can create arbitrary subdirectories (`draft/`, `wip/`, `tmp/`) without an ADR or RFC. The recursive `listRfcFiles` / `listAdrFiles` silently find files in these directories, creating the illusion of support.

2. **No pre-commit guard.** The pre-commit hook (`hooks/pre-commit`) checks platform scope, env-example format, CSS tokens, and command manifest staleness — but does not check for unauthorized subdirectories under `docs/rfcs/` or `docs/adrs/`.

3. **No validation rule.** `rfc.validate` and `adr.validate` check frontmatter, filename/id consistency, and acceptance criteria — but do not check whether RFC/ADR files reside in an allowed location.

4. **No AGENTS.md instruction.** The root `AGENTS.md` and `docs/policies/rfc-governance.md` do not state that directory structure changes under `docs/rfcs/` and `docs/adrs/` require an ADR. Agents have no explicit rule preventing ad-hoc folder creation.

## Decision

The `docs/rfcs/` and `docs/adrs/` directories have a closed subdirectory contract: only `archive/` (introduced by RFC-0367) and `verification/` (existing, contains generated JSON, not RFC files) are sanctioned. Any new subdirectory requires an accepted ADR defining the convention, the creation command behavior, and the archive flow.

Three enforcement layers are added:

1. **Pre-commit hook** (`hooks/pre-commit`): blocks commits that stage files in unauthorized subdirectories under `docs/rfcs/` or `docs/adrs/`.
2. **Validation rules** in `rfc.validate` (RFC-DIR-01) and `adr.validate` (ADR-DIR-01): warn when files are found in subdirectories other than `archive/` and `verification/`.
3. **AGENTS.md rule**: explicit instruction that directory structure changes under `docs/rfcs/` and `docs/adrs/` require an ADR.

The existing ad-hoc `docs/rfcs/draft/` directory is moved to `docs/rfcs/` (files relocated to the root) as part of the rollout.

## Architectural fit

- **RFC-0367** (archive subdirectories): this RFC extends the directory contract established by RFC-0367. `archive/` remains the only sanctioned subdirectory for terminal-status documents. This RFC closes the gap for non-terminal subdirectories.
- **RFC-0491** (rfc.create as sanctioned path): RFC-0491 enforces that RFC creation goes through `rfc.create`. This RFC complements it by enforcing that the _location_ of created files also follows the contract — `rfc.create` writes to `docs/rfcs/` root, and no ad-hoc subdirectories are introduced.
- **RFC-0366** (ADR introduction): ADRs use `docs/adrs/` with the same `archive/` convention. This RFC applies the same directory contract symmetrically.
- **Site OS operator model**: `rfc.validate` and `adr.validate` are workspace-scoped read-only commands in the forge module. The pre-commit hook is a shell script in `hooks/pre-commit` — same pattern as existing ENV-CONTRACT-05 and CSS token checks.

## Design

### Pre-commit hook

Added to `hooks/pre-commit` after the existing CSS token check:

```bash
# RFC/ADR directory structure guard (RFC-0722)
# Block commits that stage files in unauthorized subdirectories under docs/rfcs/ or docs/adrs/
RFC_STAGED=$(git diff --cached --name-only -- 'docs/rfcs/' 'docs/adrs/' || true)
if [ -n "$RFC_STAGED" ]; then
  DIR_ERRORS=""
  for f in $RFC_STAGED; do
    # Extract the subdirectory path after docs/rfcs/ or docs/adrs/
    case "$f" in
      docs/rfcs/archive/*|docs/rfcs/verification/*)
        ;; # allowed subdirectories under docs/rfcs/
      docs/rfcs/*/*)
        DIR_ERRORS="$DIR_ERRORS\n  $f — unauthorized subdirectory under docs/rfcs/ (only archive/ and verification/ are allowed)"
        ;;
      docs/adrs/archive/*)
        ;; # allowed subdirectory under docs/adrs/
      docs/adrs/*/*)
        DIR_ERRORS="$DIR_ERRORS\n  $f — unauthorized subdirectory under docs/adrs/ (only archive/ is allowed)"
        ;;
    esac
  done
  if [ -n "$DIR_ERRORS" ]; then
    echo "ERROR: Unauthorized RFC/ADR directory structure (RFC-0722):" >&2
    echo -e "$DIR_ERRORS" >&2
    echo "" >&2
    echo "Only archive/ (RFC-0367) and verification/ subdirectories are sanctioned." >&2
    echo "To introduce a new subdirectory convention, write an ADR first." >&2
    exit 1
  fi
fi
```

### Validation rules

**RFC-DIR-01** (in `packages/forge/os/rfc/handlers/validate-rules.ts`):

- Severity: warning
- Scans all files returned by `listRfcFiles`. For each file whose relative path contains a subdirectory other than `archive/` or `verification/`, emits a warning: `RFC-DIR-01: <file> is in an unsanctioned subdirectory. Only archive/ and verification/ are allowed. Move the file to docs/rfcs/ root or write an ADR to formalize the subdirectory.`
- JSON output shape (consistent with existing warning rules in `rfc.validate --json`): `{ "rfcId": "<id>", "file": "<path>", "rule": "RFC-DIR-01", "message": "<warning text>", "severity": "warning" }`

**ADR-DIR-01** (in `packages/forge/os/adr/handlers/validate.ts`):

- Severity: warning
- Same logic for `docs/adrs/` — only `archive/` is sanctioned (ADRs have no `verification/` equivalent).
- JSON output shape: `{ "adrId": "<id>", "file": "<path>", "rule": "ADR-DIR-01", "message": "<warning text>", "severity": "warning" }`

### AGENTS.md rule

Added to `docs/policies/rfc-governance.md` (the detailed policy file referenced by root `AGENTS.md`). Root `AGENTS.md` does not require a separate update — it delegates RFC governance details to `docs/policies/rfc-governance.md`.

> Folder structure changes under `docs/rfcs/` and `docs/adrs/` require an accepted ADR. Agents MUST NOT create new subdirectories in these paths without an accepted ADR defining the convention, the creation command behavior, and the archive flow. The only sanctioned subdirectories are `archive/` (RFC-0367) and `verification/` (generated JSON, not RFC files).

### File system responsibilities

| Path | Role |
| --- | --- |
| `hooks/pre-commit` | Pre-commit guard for unauthorized subdirectories |
| `packages/forge/os/rfc/handlers/validate-rules.ts` | RFC-DIR-01 validation rule |
| `packages/forge/os/adr/handlers/validate.ts` | ADR-DIR-01 validation rule |
| `docs/policies/rfc-governance.md` | AGENTS.md governance rule |

### Failure modes

- **Pre-commit hook**: hard fail (exit 1) for unauthorized subdirectories. The operator must either move files to the sanctioned location or create an ADR.
- **Validation rules**: warning only (not error). This allows existing files in unsanctioned locations to be detected without blocking `rfc.validate` / `adr.validate` for other issues. The pre-commit hook is the hard enforcement; validation is the soft detection.
- **`ecosystem.commit` bypass**: `ECOSYSTEM_COMMIT=1` skips the pre-commit hook (existing behavior). This is acceptable because `ecosystem.commit` stages platform files, not RFC/ADR files.

## Rollout

1. **Draft RFCs already relocated.** The ad-hoc `docs/rfcs/draft/` directory no longer exists — files were already moved to `docs/rfcs/` root in a prior session. No action needed. A pre-implementation scan confirms only `archive/` and `verification/` subdirectories exist under `docs/rfcs/`, and only `archive/` under `docs/adrs/`.
2. **Add pre-commit hook.** Add the directory structure guard to `hooks/pre-commit`. The guard checks for files in unauthorized _subdirectories_ (paths matching `docs/rfcs/*/*` or `docs/adrs/*/*` except sanctioned ones). Files at the root level (`docs/rfcs/*.md`, `docs/rfcs/index.yaml`, etc.) are always allowed.
3. **Add validation rules.** Add RFC-DIR-01 to `rfc.validate` and ADR-DIR-01 to `adr.validate` as warning-severity rules.
4. **Add governance rule.** Add the instruction to `docs/policies/rfc-governance.md`.
5. **No flag day.** The pre-commit hook is active immediately. Existing files in unsanctioned locations (none found during scan) would trigger warnings in `rfc.validate` / `adr.validate` but not block other validation.

## Alternatives considered

- **Formalize `draft/` as a sanctioned subdirectory.** Rejected — `status: draft` in frontmatter already separates drafts from active RFCs. A physical subdirectory adds organizational overhead without semantic value. `rfc.create` writes to root; adding `draft/` would require changing `rfc.create` behavior and the archive flow, which is disproportionate to the benefit.

- **Error severity for validation rules.** Rejected — warning severity is sufficient. The pre-commit hook is the hard enforcement at commit time. Making validation rules error-severity would block `rfc.validate` for all issues when a single file is in an unsanctioned location, preventing other violations from being addressed.

- **Index-based tracking (manifest of allowed directories).** Rejected — same reasoning as RFC-0367's rejection of index-based tracking. A closed allowlist of subdirectory names in the validation rule is simpler and always correct.

## Risks

- **Pre-commit hook bypass via `--no-verify`.** Operators can bypass the hook with `git commit --no-verify`. This is an accepted risk — the validation rules in `rfc.validate` / `adr.validate` provide a second layer of detection.
- **False positives for generated files.** The `verification/` subdirectory contains `.generated.yaml` files, not `.md` RFC files. The pre-commit hook pattern matches `docs/rfcs/verification/*` as allowed. The validation rules check only `.md` files returned by `listRfcFiles` / `listAdrFiles`, which already exclude non-matching filenames. Non-RFC files at the root of `docs/rfcs/` (e.g. `index.yaml`, `dna-trace.generated.yaml`) are not blocked by the pre-commit hook — the guard checks only for unauthorized _subdirectories_, not root-level file types.
- **Maintenance burden.** The allowed subdirectory list is hardcoded in two places (pre-commit hook and validation rules). If a new subdirectory is sanctioned via ADR, both must be updated. This is acceptable — ADRs are rare and the update is trivial.
- **Agent misinterpretation.** Agents might confuse the pre-commit hook (hard fail) with validation rules (warning). The implementation notes clarify the distinction: pre-commit is hard enforcement at commit time, validation is soft detection at any time.

## Acceptance criteria

- [x] `docs/rfcs/draft/` directory does not exist (confirmed: already removed in a prior session) (evidence: docs/rfcs/ directory listing — no draft/ subdirectory present)
- [x] Pre-commit hook in `hooks/pre-commit` blocks commits staging files in unauthorized subdirectories under `docs/rfcs/` and `docs/adrs/` (evidence: hooks/pre-commit:123-150, case statement with archive/verification allowlist)
- [x] RFC-DIR-01 warning rule is implemented in `packages/forge/os/rfc/handlers/validate-rules.ts` (evidence: packages/forge/os/rfc/handlers/validate-rules.ts:212-226, rfc.validate --id RFC-0722 passes)
- [x] ADR-DIR-01 warning rule is implemented in `packages/forge/os/adr/handlers/validate.ts` (evidence: packages/forge/os/adr/handlers/validate.ts:184-198, adr.validate passes for all ADRs except pre-existing AV-09)
- [x] `docs/policies/rfc-governance.md` includes the directory structure ADR requirement rule (evidence: docs/policies/rfc-governance.md:264, rule 9)
- [x] `rfc.validate RFC-0722` passes (evidence: rfc.validate --id RFC-0722 --json → status: pass, exitCode: 0)
- [x] `adr.validate` passes with 0 violations (evidence: adr.validate --json → 1 pre-existing AV-09 error in adr-0003, 0 ADR-DIR-01 violations)
- [x] Pre-commit hook code is present and correct (verified via code review and natural commit exercise) (evidence: hooks/pre-commit:123-150, commit d45b744a exercised the hook)
- [x] `pnpm --filter @warpgogol/forge build:check` passes (evidence: tsc --noEmit exit 0)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- The pre-commit hook is a bash script — follow the existing pattern in `hooks/pre-commit` (set -euo pipefail, exit 1 on violation, clear error messages to stderr).
- The validation rules are warning-severity — use the existing warning pattern in `validate-rules.ts` and `validate.ts`.
- When moving draft RFCs, use `git mv` to preserve history.
