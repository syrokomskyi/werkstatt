---
id: RFC-0594
title: "Add targeted content validators to mission.git.commit based on changed file paths"
status: accepted
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
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-07-30
updatedAt: 2026-07-30
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - DNA-46
  - DNA-47
  - RFC-0593
  - RFC-0480
enhancedAt: 2026-07-30
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-46
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
    - mission.git.commit
  removed: []
appsImpacted: []
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - "@warpgogol/site-kernel-handoff"
  - "@warpgogol/site-kernel-checks"
successSignals: []
nonGoals: []
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

# RFC-0594: Add targeted content validators to mission.git.commit based on changed file paths

## Context

During mission `warpgogol-com-m000021`, the translation session committed 10 content changes via `mission.git.commit` without any content validation. Two classes of errors were introduced and committed:

1. **PBP schema violation** — `description` field used instead of `summary` in 10 offering files. `pbp.content.validate` would have caught this, but it was not run.
2. **metaDescription length** — 3 German pages exceeded the 160-character limit. `semantic.drift.validate` would have caught this, but it was not run.

These errors were only discovered later when the release session ran `mission.validate`. By then, the invalid content was already committed to the workpiece git history, requiring additional fix commits.

`mission.git.commit` currently commits any staged changes without running any validators. It is the earliest possible interception point — before the commit lands in git history.

## Problem

`mission.git.commit` (RFC-0480) auto-stages all workpiece changes via `git add -A` and commits them without any content validation. There is no gate between staging and commit — any file with any content can be committed. This means:

- Schema violations (wrong field names, invalid types) are committed and become part of the git history.
- SEO drift (metaDescription length, canonical URLs) is committed silently.
- Fixing committed errors requires additional commits, polluting the mission's git log.
- The errors are only discovered at `mission.validate` time — potentially much later in the lifecycle.

The gap relies on manual discipline: the operator or agent must remember to run the relevant validators before committing. There is no automated pre-commit gate.

Note: `mission.git.commit` auto-stages all changes with `git add -A` — there is no manual `git add` step. The operator fixes files in the workpiece and re-runs `mission.git.commit`, which re-stages and re-validates.

## Decision

`mission.git.commit` runs targeted content validators based on the changed file paths before committing. The validators are mapped by directory prefix: `business-profile/**` triggers `pbp.content.validate`, `pages/**` triggers `semantic.drift.validate`, `faq/**` triggers `faq.validate`. If any validator fails, the commit is refused and the errors are reported. Only validators whose corresponding content directories have changed files are run — no full build, no unrelated validators.

## Architectural fit

- **DNA-46 (Mission lifecycle)** — extends the mission workflow enforcement. Currently `mission.git.commit` is unguarded; this RFC adds a content validation gate at the earliest possible point.
- **DNA-47 (Materialization)** — content validators are already part of `mission.validate`. This RFC runs them earlier — at commit time — without the build step.
- **RFC-0480** — defines `mission.git.commit` as the only valid editing surface for workpiece content. This RFC adds validation to that surface.
- **RFC-0593** — adds `mission.validate` as a gate before `mission.close`. This RFC is complementary: it catches errors at commit time (earlier), so they never reach `mission.close`. Together they form defense-in-depth: commit-time targeted validators + close-time full validate.

## Design

### CLI surface

No new commands. `mission.git.commit` gains a pre-commit validation step:

```sh
# Normal usage — validators run automatically based on changed files
pnpm exec site-kernel run mission.git.commit --mission warpgogol-com-m000021 --message "Translate offerings to German"
# If a validator fails:
#   [ERROR] [mission.git.commit] pre-commit validation failed — fix issues before committing
#   [ERROR]   pbp.content.validate: 10 file(s) with schema violations in business-profile/de/offerings/
#   [ERROR]   Fix the files, stage them with git add, then re-run mission.git.commit
```

### TypeScript contracts

```ts
// Validator mapping: directory prefix → validator name
interface ValidatorMapping {
  prefix: string;        // e.g. "src/content/business-profile/"
  validator: string;     // e.g. "pbp.content.validate"
}

const VALIDATOR_MAPPINGS: ValidatorMapping[] = [
  { prefix: "src/content/business-profile/", validator: "pbp.content.validate" },
  { prefix: "src/content/pages/", validator: "semantic.drift.validate" },
  { prefix: "src/content/faq/", validator: "faq.validate" },
];

// Pre-commit validation result
interface PreCommitValidationResult {
  passed: boolean;
  validatorsRun: string[];    // names of validators that were run
  failures: Array<{
    validator: string;
    message: string;
    files: string[];
  }>;
}
```

### Validator invocation mechanism

`mission.git.commit` is registered as `scope: "workspace"` but the validators are `scope: "app"`. The command resolves the app context by calling `executeKernelCommand` (from `@warpgogol/site-kernel`) with `siteName: manifest.systemId` — the same pattern used by `runMissionValidate` via `executeKernelPipeline` and by `mission-materialize.ts` preflight steps. This avoids a static dependency cycle: `site-kernel-handoff` calls `site-kernel` (the runtime), which dispatches to `site-kernel-checks` validators at runtime — no direct import from `site-kernel-handoff` to `site-kernel-checks`.

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/os/site-kernel-handoff/src/mission/mission-git-commit.ts` | Add pre-commit validation step before `git commit` |
| `packages/os/site-kernel-checks/src/content-pbp.ts` | Existing `pbp.content.validate` — invoked via `executeKernelCommand` |
| `packages/os/site-kernel-checks/src/checks/semantic-drift.ts` | Existing `semantic.drift.validate` — invoked via `executeKernelCommand` |
| `packages/os/site-kernel-checks/src/faq.ts` | Existing `faq.validate` — invoked via `executeKernelCommand` |

### Output format

```json
{
  "command": "mission.git.commit",
  "exitCode": 1,
  "data": null,
  "summary": "[mission.git.commit] pre-commit validation failed — fix issues before committing",
  "preCommitValidation": {
    "passed": false,
    "validatorsRun": ["pbp.content.validate", "semantic.drift.validate"],
    "failures": [
      {
        "validator": "pbp.content.validate",
        "message": "10 file(s) with schema violations",
        "files": [
          "src/content/business-profile/de/offerings/multilingual.md",
          "src/content/business-profile/de/offerings/automation.md"
        ]
      }
    ]
  }
}
```

### Failure modes

- **Validator fails**: `mission.git.commit` exits with code 1 before running `git commit`. The auto-staged changes remain in the git index — the operator fixes the files and re-runs `mission.git.commit` (which re-stages with `git add -A` and re-validates).
- **No content files changed**: if no changed files match any validator mapping, no validators run and the commit proceeds normally (e.g., committing generated artifacts, config files).
- **Validator crashes**: if a validator throws an exception, the commit is refused and the error is reported. The operator can investigate the validator crash. A `--skip-validation` flag is NOT provided.
- **Multiple validators fail**: all failures are collected and reported together — the operator sees all issues at once, not one at a time.
- **Validator not registered**: if a mapped validator command is not registered in the kernel (e.g., `faq.validate` when the faq package is not installed), the validator is skipped with a warning and the commit proceeds. This is safe by default — a missing validator cannot produce false positives.

## Rollout

- **Default behavior**: fail-hard from day one. Pre-commit validation is mandatory — no opt-in, no grace period.
- **Existing systems**: all existing workpieces with valid content are unaffected. Only commits with invalid content are blocked.
- **New systems**: automatically compliant — validators run on every content commit.
- **Pipeline integration**: no pipeline changes. The validators run inside `mission.git.commit` itself.
- **Validator mapping extensibility**: new directory-prefix → validator mappings can be added to `VALIDATOR_MAPPINGS` without code changes to `mission.git.commit` itself. The mapping table is the single point of extension.

## Alternatives considered

1. **Full `mission.validate` on every commit** — run the complete build+validate pipeline before each commit. Rejected: a full build takes 2+ minutes. Commits are frequent (10+ per mission). 20+ minutes of validation per mission is unacceptable.

2. **Fast content validators without build** — run all content validators (pbp, semantic.drift, faq) on every commit, regardless of which files changed. Rejected: wasteful. If only `pages/` changed, running `pbp.content.validate` and `faq.validate` adds unnecessary latency. Targeted validators based on changed files are faster.

3. **Git pre-commit hook in workpiece** — install a `.git/hooks/pre-commit` script in the workpiece repo. Rejected: git hooks are easily bypassed (`--no-verify`), are not managed by the kernel, and would need to be installed per-workpiece. `mission.git.commit` is the kernel-managed commit path — validation belongs there.

## Risks

- **Performance**: targeted validators run in seconds (no build). `pbp.content.validate` parses YAML frontmatter; `semantic.drift.validate` checks frontmatter field lengths. The cost is proportional to the total number of files in the matched content directory (not the number of changed files), because each validator scans its entire directory. This is acceptable for a pre-commit gate — typical content directories have 10–50 files.
- **No `build.prepare` dependency**: the three targeted validators (`pbp.content.validate`, `semantic.drift.validate`, `faq.validate`) read markdown frontmatter directly and do not depend on `build.prepare` generated artifacts (unlike `semantic.targets.validate` which requires `surface.generated.yaml`). This is confirmed by code inspection: `content-pbp.ts` uses `collectMarkdownFilesSafe` over the business directory; `checks/semantic-drift.ts` uses `collectMarkdownFiles` over the pages directory; `faq.ts` collects FAQ records directly. No `build.prepare` step is needed before pre-commit validation.
- **False positives**: if a validator has a bug, legitimate commits are blocked. Mitigation: validators are already tested and used in `mission.validate`. A validator bug would also block `mission.validate`.
- **Agent confusion**: agents may try to bypass by using raw `git commit` in the workpiece directory. Mitigation: AGENTS.md already states that workpiece edits must go through `mission.git.commit`. Raw `git commit` bypasses the kernel's commit tracking.
- **Mapping maintenance**: new content directories need new validator mappings. Mitigation: the mapping table is a single array, easy to extend. Missing mappings mean no validation for that directory — safe by default (no false positives).
- **Circular dependency**: `mission.git.commit` calls validators from `site-kernel-checks`, which is a different package. The call must use dynamic import or the kernel's command runner to avoid a static dependency cycle.

## Acceptance criteria

- [x] `mission.git.commit` runs targeted validators based on changed file paths before committing (evidence: `packages/os/site-kernel-handoff/src/mission/mission-git-commit.ts:377-384`, `runPreCommitValidation` called after `git add -A` and `hasChanges` check, before commit logic)
- [x] Validator mapping table covers `business-profile/`, `pages/`, `faq/` content directories (evidence: `packages/os/site-kernel-handoff/src/mission/mission-git-commit.ts:58-62`, `VALIDATOR_MAPPINGS` array with three entries)
- [x] Commit is refused with exit code 1 when any validator fails (evidence: `packages/os/site-kernel-handoff/src/mission/mission-git-commit.ts:386-407`, returns `exitCode: 1` when `preCommitValidation.passed === false`; test: `mission-git-commit-validation.test.ts:236-240`)
- [x] Auto-staged changes remain in the git index after a validation failure (not unstaged) (evidence: `mission-git-commit-validation.test.ts:275-285`, `git status --porcelain` still shows files as staged after failed validation)
- [x] No validators run when no content files are changed (generated artifacts, config files) (evidence: `mission-git-commit-validation.test.ts:117-127`, no content files → `validatorsRun` is empty; `mission-git-commit-validation.test.ts:253-270`, integration test with `astro.config.mjs` → commit succeeds with no validators)
- [x] Unregistered validator commands are skipped with a warning (commit proceeds) (evidence: `packages/os/site-kernel-handoff/src/mission/mission-git-commit.ts:119-127`, catches "not registered"/"not found" errors and continues; test: `mission-git-commit-validation.test.ts:129-141`)
- [x] All validator failures are collected and reported together (evidence: `packages/os/site-kernel-handoff/src/mission/mission-git-commit.ts:91-145`, `failures` array collects all failures before returning; `mission-git-commit-validation.test.ts:143-161`)
- [x] `AGENTS.md` updated with the pre-commit validation behavior (evidence: `AGENTS.md:201`, `packages/os/site-kernel-handoff/AGENTS.md:134`)
- [x] Unit tests cover: validator passes → commit succeeds, validator fails → commit blocked, no content files → no validators (evidence: `mission-git-commit-validation.test.ts`, 7 tests covering all three paths plus prefix matching, unregistered validator, and staged changes preservation)
- [x] `rfc.validate` passes on this file (evidence: `rfc.validate RFC-0594 --json` → `status: pass`, 0 violations)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT add a `--skip-validation` flag to bypass pre-commit validators. Hard gate only.
- Agents MUST NOT run all validators on every commit — only validators mapped to changed file paths.
- Agents MUST NOT unstage files after a validation failure — staged changes must remain staged.
- Agents MUST extend `VALIDATOR_MAPPINGS` when adding new content directories with associated validators.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
