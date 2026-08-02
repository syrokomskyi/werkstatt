---
id: RFC-0641
title: "Editframe Video Stack Profile"
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
createdAt: 2026-08-01
updatedAt: 2026-08-02
enhancedAt: 2026-08-02
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - DNA-54
  - RFC-0392
  - RFC-0638
  - RFC-0639
  - RFC-0640
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
  changed: []
  removed: []
appsImpacted: []
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - packages/forge
successSignals:
  - "`packages/forge/profiles/editframe-html.yaml` exists and passes `forge.profile.validate`"
  - "`forge create --profile editframe-html` scaffolds a working Editframe video project with compositions/ directory"
  - "The profile declares domain: video, register: creative, video-specific terminology, artifacts, workspaceTypes, and invariants"
  - "`forge doctor` on an Editframe project reports domain: video and checks VIDEO-* invariants"
nonGoals:
  - Do not define the profile schema in this RFC — that is RFC-0638
  - Do not define the bindings schema in this RFC — that is RFC-0639
  - Do not change forge.create or forge.doctor behavior in this RFC — that is RFC-0640
  - Do not create Editframe-specific skills in this RFC — that is RFC-0642
  - Do not add React or Next.js Editframe profile variants — only the HTML composition profile is added in this RFC
  - Do not define Editframe CLI installation verification or runtime health checks — that is forge.doctor's responsibility (RFC-0640)
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

# RFC-0641: Editframe Video Stack Profile

## Context

Editframe is a declarative video composition platform that lets operators create videos programmatically using HTML, CSS, JS, and React. It provides a CLI (`editframe preview`, `editframe render`, `editframe cloud-render`), an API, and cloud rendering. Compositions are HTML files using Editframe's custom elements (`ef-timegroup`, `ef-video`, `ef-audio`, `ef-text`, `ef-captions`) or React components.

FORGE currently supports two profiles: `astro-typescript-turborepo` (software) and `phaser-turborepo` (game). Neither can scaffold an Editframe video project. An operator who wants to use FORGE to govern a programmatic video project — with RFCs for composition decisions, skills for render verification, DNA invariants for video quality — has no profile to start from.

RFC-0638 extends the profile schema with domain fields. RFC-0639 extends bindings with semantic keys. RFC-0640 makes forge commands domain-aware. This RFC adds the first non-software profile: `editframe-html`.

## Problem

There is no Editframe profile in `packages/forge/profiles/`. An operator who installs `@warpgogol/forge` from NPM and wants to create a programmatic video project with Editframe cannot use `forge create --profile editframe-html` — the profile does not exist. They would need to manually create the workspace structure, bindings, and terminology, defeating the purpose of forge's bootstrapping.

## Decision

A new stack profile `editframe-html` is added at `packages/forge/profiles/editframe-html.yaml`. It declares:

- **`domain: video`** — identifies this as a video domain profile.
- **`register: creative`** — creative behavioral register for generated content.
- **`terminology`** — maps universal concepts to video domain terms: artifact → composition, module → scene, operator → director, output → render.
- **`artifacts`** — declares the composition artifact: extensions `.html` and `.tsx`, produce command (`editframe render`), validate command (`editframe check`), determinism properties (hashable inputs: composition files + assets + editframe version).
- **`workspaceTypes`** — declares the `composition` workspace type: detected by `*.html` files containing `ef-timegroup`, associated skills, AGENTS.md template.
- **`invariants`** — declares video-specific quality rules: VIDEO-01 (kebab-case filenames), VIDEO-02 (scene durations use contain mode), VIDEO-03 (speech audio must have captions).
- **Workspace layout** — `compositions/` directory for composition workspaces, `packages/` for shared video utilities, `services/` for render workers.
- **Install steps** — `@editframe/cli`, `@warpgogol/forge`, `prettier`.
- **First workspace** — `compositions/my-first-video` with a sample HTML composition.

## Architectural fit

- **DNA-54 (Forge bindings contract)**: The profile is the first concrete consumer of the domain-neutral schema extensions from RFC-0638 and the semantic binding keys from RFC-0639. By providing domain-specific default values (`editframe render`, `editframe check`) that `forge.create` (RFC-0640) writes into `forge.yaml` bindings, the profile enables skills to remain domain-agnostic — they reference `ref(bindings.commands.produce)` instead of hardcoding tool-specific commands. This is how DNA-54's de-hardcoding principle extends to non-software domains: the profile supplies the values, bindings carry them, skills reference them by key.
- **RFC-0392 (Stack profiles)**: The profile follows the existing stack profile schema (`forge/stack-profile@1`) extended with domain fields from RFC-0638.
- **RFC-0640 (Domain-aware bootstrapping)**: `forge create --profile editframe-html` uses the domain fields to write appropriate forge.yaml, PREFERENCES.md, and AGENTS.md.
- **Editframe CLI**: The profile references Editframe CLI commands (`editframe render`, `editframe check`, `editframe preview`) as binding values. These are resolved at runtime — forge does not depend on Editframe.

## Design

### CLI surface

```sh
# Create a new Editframe video project
forge create --profile editframe-html

# Validate the profile itself
forge profile.validate --id editframe-html
```

Both commands are defined by RFC-0640. This RFC only adds the profile YAML that makes them usable for the Editframe domain.

### TypeScript contracts

No new TypeScript types — the profile is a YAML file consumed by the schema from RFC-0638. The profile's structure matches `StackProfileDomainFields`.

The profile YAML includes the required `detect.anyOf` field (for `detectStack` compatibility) with marker `editframe.config.*`, consistent with existing profiles (`astro.config.*`, `phaser.config.*`).

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/forge/profiles/editframe-html.yaml` | New profile file |
| `packages/forge/profiles/editframe-html-templates/composition.html` | Sample composition template |
| `packages/forge/profiles/editframe-html-templates/composition-agents.md` | AGENTS.md template for composition workspaces |
| `packages/forge/src/tests/editframe-profile.test.ts` | New test: profile parses, domain fields valid |

All paths are inside `packages/forge/profiles/` and are included in the npm package via the `files: ["profiles/"]` entry in `packages/forge/package.json`.

### Output format

No command output — this RFC adds a profile YAML file. `forge profile.validate --id editframe-html` reports validation results.

### Failure modes

- **Editframe CLI not installed**: The profile references `editframe` commands in bindings. If the operator has not installed `@editframe/cli`, `forge doctor` reports the binding as unresolved (warning, exit code 0) — the binding is `null` until the operator installs Editframe. `forge doctor --strict` elevates this to an error (exit code 1).
- **Composition workspace not detected**: If a directory has no `.html` files containing `ef-timegroup`, it is not detected as a composition workspace. `forge agents.generate` skips it with an info-level log, exit code 0.
- **Profile schema invalid**: `forge.profile.validate` exits non-zero (exit code 1) with per-profile error details when the profile YAML fails schema validation.
- **Multiple profiles with `domain: video`**: If a future `editframe-react` profile is added, `detectStack` uses `detect.anyOf` markers to disambiguate. `editframe-html` uses `editframe.config.*`; a React variant would use a different marker (e.g. `editframe.react.config.*`). No conflict — first match wins, consistent with existing `detectStack` behavior.

## Rollout

- **Implementation order**: This RFC is the fourth in a series and depends on the prior three: RFC-0638 (schema extensions) must be implemented first so the profile YAML parses; RFC-0639 (semantic bindings) must be implemented so the profile's binding defaults are valid; RFC-0640 (domain-aware commands) must be implemented so `forge create --profile editframe-html` and `forge.profile.validate` work. Implementation order: RFC-0638 → RFC-0639 → RFC-0640 → RFC-0641.
- **New profile**: The profile is added to `packages/forge/profiles/` and shipped with the npm package. Operators install `@warpgogol/forge` and run `forge create --profile editframe-html`.
- **No migration**: This is a new profile — no existing projects are affected.
- **Profile validation**: `forge.profile.validate` (RFC-0640) validates the profile on every `forge doctor` run.
- **Skill pack**: Editframe-specific skills (ef-composition-review, ef-render-verify) are added in RFC-0642 as a skill pack, not in this RFC.

## Alternatives considered

- **Editframe React profile (`editframe-react`)**: Deferred. The HTML composition profile is the simplest entry point. A React variant can be added as a separate profile later.
- **Generic video profile (`video-generic`)**: Rejected. Editframe has specific CLI commands, composition elements, and rendering workflows. A generic video profile would be too abstract to provide useful defaults.
- **Editframe profile as external npm package**: Deferred. If Editframe profiles grow to multiple variants (HTML, React, Next.js), they can be extracted to a separate `@editframe/forge-profiles` package. For now, one profile in forge core is sufficient.

## Risks

- **Editframe API changes**: Editframe's CLI commands or composition elements might change. Mitigation: the profile references commands via bindings — operators update binding values in their forge.yaml without profile changes.
- **Profile staleness**: If Editframe adds new features, the profile might not reflect them. Mitigation: the profile is a starting point, not a complete Editframe integration. Operators customize bindings and invariants per project.
- **VIDEO invariant subjectivity**: Invariants like "scene durations use contain mode by default" are domain-specific quality guidelines. Mitigation: they are warnings by default, errors with `--strict`.
- **Agent misinterpretation**: Agents unfamiliar with the video domain may misapply VIDEO invariants (e.g. checking VIDEO-02 contain mode on non-scene elements). Mitigation: invariant rule text is explicit and scoped to composition files; `forge.doctor` reports invariant id and rule in diagnostics for operator review.
- **False-positive rate**: VIDEO-01 (kebab-case filenames) may produce false positives for composition files with non-ASCII names (e.g. Ukrainian filenames). Mitigation: the invariant checks filename format only, not content; operators can suppress individual warnings via `forge.doctor` output.

## Acceptance criteria

- [ ] `packages/forge/profiles/editframe-html.yaml` exists and passes `forge.profile.validate` (requires RFC-0640 implemented)
- [ ] Profile declares `domain: video`, `register: creative`
- [ ] Profile declares terminology map with artifact → composition, module → scene, operator → director
- [ ] Profile declares artifacts with composition extensions and Editframe CLI commands
- [ ] Profile declares workspaceTypes with composition detection markers (`glob: *.html`, `contains: ef-timegroup`, `packageJsonDep: @editframe/cli`)
- [ ] Profile declares `detect.anyOf` with marker `editframe.config.*`
- [ ] Profile declares at least 3 VIDEO-* invariants
- [ ] Profile includes workspace layout with `compositions/` directory
- [ ] Profile includes first workspace template with sample HTML composition
- [ ] `forge create --profile editframe-html` scaffolds a working project structure (requires RFC-0640 implemented)
- [ ] Unit test verifies profile parses against extended schema (requires RFC-0638 implemented)
- [ ] `packages/forge/AGENTS.md` updated with Editframe profile documentation
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
