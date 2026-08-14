---
workPacket: FORGE-KNOWLEDGE-04
status: ready
dependsOn: [FORGE-KNOWLEDGE-01, FORGE-KNOWLEDGE-02, FORGE-KNOWLEDGE-03]
findings: [F4, F6]
concern: code-mutation
---

# Packet 04 — Authority-aware sync and npm publication boundary

## Objective

Make `forge.upgrade` a safe convergent repair surface while preventing npm publication from leaking accumulated project knowledge. The same code must respect different authority boundaries in the Forge monorepo, npm consumers, and declared skill packs.

No network publication is authorized by this packet.

## Preconditions

- Packets 01–03 are committed and trees are clean.
- Shared source resolution is authority-aware.
- Read `docs/authoring/publication-runbook.md`, `packages/forge/AGENTS.md`, RFC-0524, RFC-0660, RFC-0663, and the root publication policy before editing.
- Inspect git history before changing sync behavior.

## Authority matrix

| Artifact | Forge monorepo authority | npm-consumer authority | Upgrade behavior |
| --- | --- | --- | --- |
| Forge `SKILL.md` | `packages/forge/skills/**` | installed package source | overwrite differing `.agents` managed copy |
| Forge cumulative knowledge | `packages/forge/skills/**` | existing `.agents/skills/**` project state | monorepo: overwrite mirror; npm: preserve existing, scaffold missing only |
| Shared cumulative knowledge | package shared source | existing `.agents/skills/shared-knowledge/**` project state | same rule as local cumulative knowledge |
| Pack `SKILL.md` | declared pack source | declared pack source | overwrite differing `.agents` mirror |
| Pack knowledge | declared pack source | declared pack source | overwrite differing `.agents` mirror |
| `forge.yaml` operator values | workspace | workspace | add missing defaults only; do not replace values |

Implement this matrix explicitly. Do not infer ownership from file contents.

## Required sync design

### Authority mode

Use the existing monorepo detection (`packages/forge/package.json` under workspace) through one named helper, for example:

```ts
type ForgeKnowledgeAuthority = "monorepo-source" | "consumer-state";
```

Keep source resolution separate from mutation policy so doctor, init, upgrade, and budget collection can share it.

### Same-version convergence

Remove the unconditional `fromVersion === toVersion` early return before sync analysis.

1. Resolve installed/bundled version as today.
2. Build a dry-run sync plan containing only byte-different or missing managed destinations.
3. Apply environment-specific policy from the matrix.
4. Add missing binding defaults using existing additive semantics.
5. Return `noop` only if the plan is empty and no other additive repair is needed.
6. `skillsUpdated` and related result arrays list only actual/planned changes, not every discovered skill.
7. Dry-run returns the same plan without filesystem writes or version mutation.

No new force flag is needed.

### Knowledge scaffolding

Add canonical structured-empty templates:

- `packages/forge/src/onboarding/templates/knowledge/qa-log.md` (L0);
- `packages/forge/src/onboarding/templates/knowledge/fix-patterns.md` (L1);
- `packages/forge/src/onboarding/templates/knowledge/learned-principles.md` (L2).

Each template contains a layer marker, short portable instructions, zero structured entries, LF endings, and one terminal newline. Templates must pass `parseKnowledgeFile` with `isKnowledgeAdjacent: false`, zero issues, and zero entries.

Create a shared helper that identifies only cumulative filenames and selects a template. Knowledge-adjacent references declared in `knowledge:` are ordinary packaged files and must never be replaced with cumulative templates.

In npm-consumer mode:

- if the cumulative destination exists, preserve its bytes;
- if missing, scaffold the matching empty template;
- if a non-cumulative declared knowledge source exists in the package, copy/update it as managed reference content;
- if a non-cumulative declared source is missing, retain the existing error behavior.

### Doctor behavior and hints

- Monorepo source/mirror knowledge drift remains a warning repaired by `forge.upgrade`.
- Npm-consumer cumulative knowledge differing from installed empty templates is healthy project state and must not be reported stale.
- Missing required cumulative destination is a warning with exact `forge.upgrade` fix hint.
- Stale managed `SKILL.md` remains repairable.
- Replace all `forge create to sync` hints for existing workspaces with `forge.upgrade`; keep `forge create` only for genuinely uninitialized-project checks.

## Required npm payload design

### Primary exclusion

Tool contract: npm's [`package.json#files` documentation](https://docs.npmjs.com/cli/v11/configuring-npm/package-json#files) states that a root ignore file cannot override an explicit `files` include, while an ignore file inside an included subdirectory filters that subtree. The payload test below is the executable guard in case npm behavior changes.

Add `packages/forge/skills/.npmignore` so npm packlist excludes only cumulative state and archive companions under the already allowlisted `skills/` directory:

```gitignore
**/qa-log.md
**/qa-log.archive.md
**/fix-patterns.md
**/fix-patterns.archive.md
**/learned-principles.md
**/learned-principles.archive.md
```

Do not exclude all markdown or every file listed under `knowledge:`. Files such as `mocking.md`, `tests-reference.md`, `pbt-guide.md`, templates, and skill instructions are portable reference content and must remain in the payload.

The empty templates live under the already packaged `src/onboarding/templates/` allowlist, outside the filtered source state paths.

### Pack inspection test

Add a dedicated test (recommended: `packages/forge/src/tests/package-knowledge-boundary.test.ts`) that:

1. runs `npm pack --json --pack-destination <mkdtemp>` against `packages/forge` with network-independent options;
2. reads the returned file manifest and actual `.tgz` using the cross-platform `tar` npm package as an explicit devDependency;
3. asserts no packaged path matches cumulative/archive source patterns;
4. asserts all three empty templates are present and parse to zero entries;
5. asserts representative knowledge-adjacent files remain present;
6. asserts known current project-only entry IDs/titles are absent from every textual tar member;
7. cleans only its validated temporary directory in `finally`.

Do not rely only on source-tree scanning: the test must inspect the payload npm would publish. Do not use a platform-specific `tar` executable in a package that supports Windows.

### Consumer smoke test

From the packed payload or a fixture representing it:

1. create a temporary npm-consumer workspace without `packages/forge`;
2. run init/create logic with the packed Forge root;
3. assert all declared cumulative destinations and shared destination exist as structured-empty files;
4. append a valid local entry, run same-version upgrade, and assert it remains byte-identical;
5. delete one cumulative file, run upgrade, and assert only that missing file is scaffolded;
6. modify a managed `SKILL.md`, run upgrade, and assert it is repaired.

### Publication documentation

Reconcile `packages/forge/AGENTS.md` with actual `package.json` scripts and canonical commit discipline. Remove claims about nonexistent `prepublishOnly`/restore scripts unless those scripts are intentionally added and tested. Do not instruct agents to use raw `git commit`.

The documented pre-publication gate must include build, full tests, pack payload inspection, consumer smoke, and a clean-tree check. It must reiterate that agents never publish without explicit operator command.

## Affected artifacts

- `packages/forge/src/onboarding/upgrade.ts`
- `packages/forge/src/onboarding/init.ts`
- `packages/forge/src/onboarding/doctor.ts`
- A shared authority/template helper under `packages/forge/src/onboarding/`
- `packages/forge/src/onboarding/templates/knowledge/*.md` (new)
- `packages/forge/skills/.npmignore` (new)
- `packages/forge/package.json` (`tar` devDependency and only actually implemented scripts)
- `pnpm-lock.yaml` through pnpm, never hand-edited
- `packages/forge/src/tests/upgrade.test.ts`
- Init/doctor tests
- `packages/forge/src/tests/package-knowledge-boundary.test.ts` (new)
- `packages/forge/AGENTS.md`
- Publication documentation if it claims to cover Forge
- Generated ecosystem/command manifests only through their generators if their source registries changed

## Implementation steps

1. Add consumer/monorepo authority characterization tests before changing sync.
2. Add empty templates and cumulative filename helper.
3. Build a pure sync plan, then move version-equality noop after plan evaluation.
4. Apply environment-specific knowledge mutation policy.
5. Fix doctor drift semantics and executable hints.
6. Add package-local npm filter and actual payload inspection test.
7. Add consumer smoke tests for preservation, scaffolding, and managed instruction repair.
8. Reconcile publication documentation with executable behavior.
9. Run pack twice and prove deterministic file list plus clean source tree.

## Mandatory sync test matrix

| Mode | Initial state | Expected |
| --- | --- | --- |
| Monorepo, same version | all mirrors equal | noop |
| Monorepo, same version | stale SKILL | repaired |
| Monorepo, same version | stale local/shared knowledge mirror | repaired from source |
| Consumer, same version | local knowledge has entries | preserved byte-identically |
| Consumer, same version | shared knowledge has entries | preserved byte-identically |
| Consumer, same version | cumulative file missing | empty template scaffolded |
| Consumer, same version | stale SKILL | repaired |
| Consumer, dry-run | any drift | plan reported; zero writes |
| Pack skill | source differs from mirror | mirror repaired, including declared knowledge |
| Any mode | operator binding differs from default | operator value preserved |

## Validation commands

```sh
rtk pnpm install --lockfile-only
rtk pnpm --filter @warpgogol/forge exec vitest run src/tests/upgrade.test.ts src/tests/package-knowledge-boundary.test.ts
rtk pnpm --filter @warpgogol/forge build:check
rtk pnpm --filter @warpgogol/forge test
rtk node packages/forge/bin/cli.js forge.doctor --json
rtk bash scripts/check-clean-trees.sh
```

Use the repository's approved install mode if lockfile-only is insufficient for the new devDependency. Never run a publish command in this packet.

## Completion criteria

- Same-version upgrade repairs managed drift and returns noop only on an empty plan.
- Consumer cumulative knowledge survives upgrade byte-identically.
- Missing consumer cumulative files are restored as valid structured-empty documents.
- Monorepo `.agents` remains a faithful mirror of canonical source.
- Actual npm tarball contains no cumulative/archive source knowledge and does contain empty templates plus reference knowledge.
- Known project-only shared/local entries are absent from the tarball payload.
- Pack/consumer smoke tests are cross-platform and network-independent after dependencies are installed.
- Two pack runs do not dirty the tree.
- Publication docs match real scripts and never authorize automatic publish or raw commit.
- Full Forge tests, `build:check`, doctor, and clean-tree check pass.
- Review has no unresolved High/Medium finding for F4/F6.

## Forbidden shortcuts

- Unconditional source → `.agents` knowledge copy in npm-consumer mode.
- Treating all `.agents` files as either wholly managed or wholly operator-owned.
- Emptying tracked source files during prepack and restoring them in postpack.
- Testing only `npm pack --dry-run` without inspecting the actual payload.
- Using `.npmignore` at package root to contradict the `files: ["skills/"]` allowlist; the filter belongs inside `skills/`.
- Excluding knowledge-adjacent reference files.
- Publishing, rotating tokens, reading `.npmrc`, or logging auth configuration.
- Repairing the outdated docs by inventing scripts that are not implemented/tested.

## Escalation trigger

Escalate if npm packlist cannot enforce the package-local filter on the supported npm version, or if consumer installation must retain accumulated source knowledge. Either changes the chosen publication boundary and requires `fo-idea`. A test implementation inconvenience is not an escalation condition.
