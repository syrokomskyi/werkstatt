---
id: RFC-0543
title: "NPM publication and consumer upgrade contract"
status: implemented
# kind options: architecture | contract | command | policy | deprecation
kind: contract
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
createdAt: 2026-07-26
updatedAt: 2026-07-26
enhancedAt: 2026-07-26
implementedAt: 2026-07-26
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy:
  - RFC-0554
related:
  - RFC-0374
  - RFC-0391
  - RFC-0393
  - RFC-0539
  - RFC-0540
  - RFC-0542
  - DNA-54
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
    - forge.upgrade
  added: []
  changed:
    - forge.init
    - forge.doctor
  removed: []
appsImpacted: []
packagesImpacted:
  - forge
successSignals:
  - "npm publish from this monorepo produces a package with license, repository, description, and version from package.json"
  - "forge.upgrade in a consumer project syncs skills and adds new binding defaults without overwriting operator-set values"
  - "Consumer projects can upgrade across minor versions without manual forge.yaml edits"
nonGoals:
  - "Auto-upgrading operator-overridden bindings — forge.upgrade adds missing keys only"
  - "A public registry of forge-compatible projects — publication is one-way (this monorepo to npm)"
  - "Semantic-versioning enforcement inside consumer projects — consumers version their own code"
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

# RFC-0543: NPM publication and consumer upgrade contract

## Context

`@wgogol/forge` is `private: false` in `packages/forge/package.json` and already carries `publishConfig` (dist main, dist bin, dist exports). But the package is not yet published, and several fields required for a credible npm presence are missing: `license`, `repository`, `description`, `keywords`. The `VERSION` constant in `bin/cli.ts` is hardcoded `"0.1.0"` instead of reading from `package.json`.

There is no upgrade path for consumers. When a new version of forge ships new skills, new binding defaults, or bug fixes, a consumer's only option is `npm update @wgogol/forge && forge init` — which skips existing `forge.yaml` (RFC-0391 skip-with-warning) and does not refresh `.agents/skills/` copies that have drifted. The operator's requirement is explicit: this monorepo is the single publication source, and consumers receive upgrades from npm via a forge-managed command.

## Problem

- **Package metadata gaps** — `license`, `repository`, `description`, `keywords` are absent. npm will list the package, but it looks unfinished and is undiscoverable by search.
- **Hardcoded version** — `VERSION = "0.1.0"` in `bin/cli.ts:170` drifts from `package.json` `version` on every release. `forge --version` lies.
- **No upgrade command** — consumers cannot sync new skills or adopt new binding defaults without hand-editing `forge.yaml` and manually re-running `forge.init` (which skips their config anyway).
- **No publication hygiene check** — nothing in the build pipeline verifies that the package about to be published has complete metadata, a clean `dist/`, and a `README.md` that describes the create → IDE → bootstrap flow.

## Decision

This monorepo is the sole publication source for `@wgogol/forge`. A new `forge.upgrade` command gives consumers an additive sync: refresh `.agents/skills/` from the installed package version, add any new `FORGE_CLI_BINDING_DEFAULTS` keys that are missing from the consumer's `forge.yaml` (operator-set values are never overwritten), and run `forge.doctor`. Package metadata is completed; `forge --version` reads from `package.json`; a `prepublishOnly`-adjacent check verifies metadata before publish.

## Architectural fit

- **DNA-54 (Forge bindings contract)** — `forge.upgrade` is the forward-only carrier of binding-default additions (RFC-0540) into consumer configs, respecting the de-hardcoding seam.
- **RFC-0374 (forge extraction)** — publication is the extraction promise made real.
- **RFC-0391 (portable init)** — `forge.upgrade` is init's sibling: init creates, upgrade maintains.
- **RFC-0539 / RFC-0542** — upgrade syncs new portable skills and their `nextSteps` output contract into consumer projects.
- **RFC-0478 (platform versioning)** — forge's own SemVer follows npm norms; `versionBump` in forge RFCs tracks the SemVer delta consumers experience.

## Design

### Package metadata completion

`packages/forge/package.json` gains:

```json
{
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "https://github.com/syrokomskyi/warpgogol-4.git",
    "directory": "packages/forge"
  },
  "description": "Framework for documenting and implementing ideas — RFC/ADR governance, skills, and project bootstrapping.",
  "keywords": ["rfc", "adr", "governance", "skills", "ai-agent", "documentation", "framework"],
  "homepage": "https://github.com/syrokomskyi/warpgogol-4#readme",
  "bugs": { "url": "https://github.com/syrokomskyi/warpgogol-4/issues" }
}
```

### Version source

`bin/cli.ts` `VERSION` reads from `package.json` at runtime (via `fileURLToPath` + `readFileSync`), eliminating the hardcoded constant. The path is resolved relative to the module's location using `import.meta.url` → `fileURLToPath`, then walking up to the package root. This works in both source (`packages/forge/bin/cli.ts` → `packages/forge/package.json`) and compiled (`node_modules/@wgogol/forge/dist/bin/cli.js` → `node_modules/@wgogol/forge/package.json`) contexts. `forge --version` prints the real version.

### forge.upgrade command

```sh
forge upgrade [--dry-run] [--json]
```

Steps (additive, never destructive):

1. Resolve the forge package root via `resolveForgeRoot` (already in `packages/forge/src/config/forge-config.ts`) — handles both monorepo (`packages/forge`) and npm-installed (`node_modules/@wgogol/forge`) paths. Read the version from the resolved `package.json`.
2. Compare against the last-synced version recorded in `forge.yaml` (`forge.syncedVersion`). If equal, report "already up to date" and exit 0.
3. Sync `.agents/skills/` from the installed package's `skills/` directory (overwrite forge-owned skill copies; pack skills from `skillPacks` are re-synced from their source dirs).
4. For each key in `FORGE_CLI_BINDING_DEFAULTS` (RFC-0540) that is absent or `null` in the consumer's `forge.yaml`, write the default. Operator-set non-null values are never touched.
5. Update `forge.syncedVersion` to the installed version.
6. Run `forge.doctor` and include its report in the output.
7. Emit `nextSteps` per RFC-0542.

### forge.yaml field

A new optional top-level `forge` section is added to `forgeConfigSchema` (`forge/config@1` — no schema version bump needed since the field is optional):

```yaml
forge:
  syncedVersion: 0.1.0   # written by forge.init, forge.scaffold, and forge.upgrade
```

In the schema: `forge: z.object({ syncedVersion: z.string().nullable().default(null) }).optional()`. Existing configs without the `forge` section pass validation unchanged. `forge.upgrade` treats absent/null as "never synced" and proceeds with the full upgrade.

### TypeScript contracts

```ts
// packages/forge/os/core/upgrade.ts
interface UpgradeResult {
  command: "forge.upgrade";
  status: "pass" | "noop" | "fail";
  fromVersion: string;
  toVersion: string;
  skillsUpdated: string[];
  bindingsAdded: { key: string; value: string }[];
  doctorReport: ForgeDoctorResult;
  nextSteps: ForgeNextStep[];
}
```

### Publication hygiene check

The `prepublishOnly` script in `packages/forge/package.json` is enhanced to verify, before `npm publish`:

- `license`, `repository`, `description`, `keywords` present in `package.json`.
- `dist/` exists and is fresh (`tsc` ran).
- `README.md` exists and mentions `forge create`.
- `VERSION` in `bin/cli.ts` is not hardcoded (sourced from `package.json`).
- `files` array includes `skills/`, `profiles/`, `dist/`.

The check is a script, not a registered forge command — it runs only in this monorepo before publish and is not consumer-facing. The existing `prepublishOnly` (`pnpm run clean && pnpm run build`) is extended with a metadata verification step.

### File system responsibilities

| Path                                | Role                                                |
| ----------------------------------- | --------------------------------------------------- |
| `packages/forge/package.json`       | Metadata completed; version is the single source    |
| `packages/forge/bin/cli.ts`         | `VERSION` sourced from `package.json`               |
| `packages/forge/os/core/upgrade.ts` | `forge.upgrade` handler (new)                       |
| `forge.yaml` (consumer)             | `forge.syncedVersion` field; binding defaults added |
| `.agents/skills/` (consumer)        | Refreshed by upgrade                                |

### Output format

```json
{
  "command": "forge.upgrade",
  "status": "pass",
  "fromVersion": "0.1.0",
  "toVersion": "0.2.0",
  "skillsUpdated": ["fo-idea", "fo-idea-create-rfc"],
  "bindingsAdded": [{ "key": "commands.specValidate", "value": "pnpm exec forge spec.validate --spec={id} --json" }],
  "doctorReport": { "status": "pass", "notices": [] },
  "nextSteps": [{ "action": "Review updated skills in .agents/skills/", "kind": "optional" }]
}
```

### Failure modes

- `forge.yaml` missing → upgrade refuses with a pointer to `forge init`.
- `forge.syncedVersion` absent or null → upgrade treats it as "never synced" and proceeds with the full upgrade (does not exit 0).
- Forge package root unresolvable (`resolveForgeRoot` fails) → upgrade refuses with "install @wgogol/forge first".
- `--dry-run` → no files written; output describes what would change.
- Doctor reports errors after upgrade → upgrade status is `pass` but `doctorReport.status` is `fail`; the `nextSteps` include fixing the doctor errors.
- Interrupted mid-sync → re-running `forge.upgrade` completes the sync (overwrite semantics are idempotent).
- Skill files manually deleted while `forge.syncedVersion` matches installed version → upgrade is a no-op (versions match). `forge.doctor` detects the missing copies and directs the operator to re-run `forge.upgrade` after clearing `forge.syncedVersion` or reinstalling the package. No `--force` flag is added; doctor is the recovery path.

## Rollout

1. Complete `package.json` metadata; source `VERSION` from `package.json` in `bin/cli.ts`.
2. Implement `forge.upgrade` in `os/core/upgrade.ts`; register in `forgeCoreModule`.
3. Add `forge.syncedVersion` to `forgeConfigSchema`; `forge.init` and `forge.scaffold` write it on first init.
4. Enhance `prepublishOnly` script with metadata verification.
5. Publish `0.1.0` (or `0.2.0` if after the skill-pack rename) from this monorepo.
6. Document the upgrade flow in `packages/forge/README.md` and update `packages/forge/AGENTS.md` with the `forge.upgrade` command in the OS modules table. Update `docs/technology.xml` if the `pkg-forge` role description changes.

## Alternatives considered

- **No upgrade command; consumers run `npm update && forge init`** — rejected: `forge.init` skips existing `forge.yaml` (RFC-0391), so new binding defaults never reach consumers; skill copies drift silently.
- **Full `forge.yaml` rewrite on upgrade** — rejected: overwrites operator customizations; the operator chose additive sync.
- **Dedicated `@wgogol/forge-upgrade` package** — rejected: the upgrade logic is tightly coupled to `FORGE_CLI_BINDING_DEFAULTS` and the skill registry; a separate package would duplicate both.

## Risks

- **Skill copy drift** — an operator may have edited a forge skill in `.agents/skills/`. Upgrade overwrites it. Mitigation: `forge.doctor` already detects stale copies; upgrade is the intentional refresh. Document that `.agents/skills/` is forge-managed and local edits are not preserved across upgrades.
- **Binding default churn** — if forge changes a default template (e.g. adds a flag), upgrade does not update operator configs that already have a non-null value. Mitigation: accepted; the operator can run `forge.doctor` and manually adopt new defaults. A future RFC could add `forge.upgrade --rebase-bindings` if churn becomes painful.
- **Publication from the wrong branch** — Mitigation: the `prepublishOnly` script verifies metadata; CI runs the check before `npm publish`.

## Acceptance criteria

- [x] `packages/forge/package.json` includes `license`, `repository`, `description`, `keywords`, `homepage`, `bugs` (evidence: packages/forge/package.json:6-15)
- [x] `forge --version` prints the version from `package.json`, not a hardcoded constant (evidence: packages/forge/bin/cli.ts:178-193, packages/forge/src/tests/upgrade.test.ts:140-146)
- [x] `forge.upgrade` is registered in `forgeCoreModule` and syncs skills + adds missing binding defaults + updates `forge.syncedVersion` (evidence: packages/forge/os/core/core.module.ts:242-265, packages/forge/src/onboarding/upgrade.ts:193-359)
- [x] `forge.upgrade --dry-run` writes no files and reports planned changes (evidence: packages/forge/src/tests/upgrade.test.ts:80-97)
- [x] `forge.upgrade` never overwrites a non-null operator-set binding (evidence: packages/forge/src/onboarding/upgrade.ts:152-173, packages/forge/src/tests/upgrade.test.ts:120-160)
- [x] `forge.init` writes `forge.syncedVersion` on first init (evidence: packages/forge/src/onboarding/init.ts:96-106, packages/forge/src/tests/upgrade.test.ts:140-146)
- [x] `prepublishOnly` script verifies metadata (license, repository, description, keywords), dist freshness, and README presence (evidence: packages/forge/scripts/publish-check.mjs:1-82, packages/forge/package.json:123)
- [x] `packages/forge/README.md` documents the create → IDE → bootstrap → upgrade flow (evidence: packages/forge/README.md:29-44)
- [x] `packages/forge/AGENTS.md` OS modules table includes `forge.upgrade` (evidence: packages/forge/AGENTS.md:16)
- [x] `rfc.validate` passes on this file before merging (evidence: rfc.validate RFC-0543 — run after stamping)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MUST NOT overwrite operator-set non-null bindings during `forge.upgrade` — additive only.
- Agents MUST NOT publish `@wgogol/forge` from outside this monorepo — this is the sole publication source.
- Agents MUST NOT publish without the `prepublishOnly` check passing.
- Agents MUST NOT remove `forge.syncedVersion` from `forge.yaml` — it is the upgrade watermark.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id RFC-0543 --reason "..." --invariant "DNA-54"` instead of working around it (RFC-0334).
