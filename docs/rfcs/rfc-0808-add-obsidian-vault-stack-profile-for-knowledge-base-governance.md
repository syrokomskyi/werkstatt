---
id: RFC-0808
title: "Add obsidian-vault stack profile for knowledge-base governance"
status: draft
# kind options: architecture | contract | command | policy | deprecation
kind: architecture
# scope options: app | workspace
scope: workspace
owners:
  - architecture
# Set by the deciding human together with the status change (RFC-0335).
# Draft scaffolds must keep this empty; do not prefill a default identity.
# Format: human:<handle> (agent:<id> reserved — see RFC-0335)
# Default reviewer when none is specified by the operator: human:andrii-syrokomskyi
reviewers: []
createdAt: 2026-08-11
updatedAt: 2026-08-11
enhancedAt: 2026-08-11
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - ADR-0043
  - RFC-0770
  - RFC-0638
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-64
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
    - note.link.validate
    - note.frontmatter.validate
    - note.orphan.detect
  added: []
  changed: []
  removed: []
appsImpacted: []
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - packages/forge
successSignals:
  - obsidian-vault.yaml profile loads via profile.resolve
  - forge scaffold --profile obsidian-vault creates a valid vault structure
  - note.link.validate detects broken [[wikilinks]] in test fixtures
nonGoals:
  - Obsidian plugin development or Obsidian API integration
  - Real-time collaborative editing
  - Full-text search engine (Obsidian handles this natively)
  - Werkstatt plugin implementation (this RFC defines the Forge profile only; a future RFC may add a werkstatt-obsidian plugin)
  - Migration of existing werkstatt content to Obsidian format
  - Note management skill pack (fo-note-create, fo-note-link, fo-note-refactor) — a future RFC will create these skills
  - forge doctor integration for workspace directory existence checks — a general feature benefiting all profiles, not specific to obsidian-vault
batch: obsidian-knowledge-base
dependsOn: []
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

# RFC-0808: Add obsidian-vault stack profile for knowledge-base governance

## Context

Forge currently defines three stack profiles: `astro-typescript-turborepo` (sites), `phaser-turborepo` (games), and `editframe` (video). Each targets a code-producing domain with build pipelines, deploy adapters, and runtime artifacts.

A fourth domain is absent: **knowledge bases** — collections of interconnected notes authored by writers, researchers, and teams. Obsidian is the de facto standard for Markdown-based knowledge bases, with `[[wikilink]]` cross-references, frontmatter metadata, and a graph view. Knowledge bases can grow to hundreds of thousands of notes and have no build step, no deploy target, and no runtime — only content and its structural integrity.

DNA-64 (Engine/plugin/workshop boundary) establishes that stack-specific logic lives in profiles and plugins bound to a `profileId`. The domain-neutral profile schema (RFC-0638) already provides `register: "creative"`, `domain`, `terminology`, `artifacts`, `workspaceTypes`, and `invariants` — fields designed for exactly this kind of non-code domain. The `editframe` profile (`register: creative`, `domain: video`) demonstrates the pattern for a creative-domain profile.

ADR-0043 (Agent-generated script directory convention) establishes that agent-generated code resides in `scripts/`, not in content directories. This is critical for knowledge bases where the content directory IS the workspace and code files mixed into notes break Obsidian search and clutter the author's view.

## Problem

Knowledge bases lack governance infrastructure:

1. **No link integrity enforcement.** Broken `[[wikilinks]]` accumulate silently as notes are renamed, moved, or deleted. Obsidian warns in its UI but does not prevent commits with broken links.
2. **No frontmatter consistency.** Notes with missing or malformed metadata (tags, dates, aliases) break downstream queries and graph views.
3. **No orphan detection.** Notes that no other note links to become invisible in the graph — the author loses awareness of their existence.
4. **No version control discipline.** Authors have no structured workflow for making changes to their knowledge base — no review, no audit trail, no integrity verification.
5. **No agent code convention.** When agents process thousands of notes, they generate scripts for transformation and analysis. Without ADR-0043, these scripts scatter across the vault, polluting search and graph views.
6. **No vault location convention.** Forge profiles define `workspace.dirs` but not where the primary content (the vault itself) lives relative to the project root.

## Decision

Forge gains a fourth stack profile `obsidian-vault` with `register: creative` and `domain: knowledge-base`, defining terminology, invariants, workspace types, and path conventions for Obsidian-format knowledge bases.

- The profile YAML lives at `packages/forge/profiles/obsidian-vault.yaml`.
- Three validators are proposed: `note.link.validate`, `note.frontmatter.validate`, `note.orphan.detect`.
- The vault content directory is `vault/` at the project root.
- Agent-generated scripts reside in `scripts/` per ADR-0043.
- No Werkstatt plugin is created by this RFC — the profile is Forge-only. A future RFC may add a `werkstatt-obsidian` plugin for mission-lifecycle integration.

## Architectural fit

- **DNA-64 (Engine/plugin/workshop boundary):** This RFC adds a new stack profile to Forge, the governance layer. It does not add a Werkstatt plugin — the profile is Forge-only. A future RFC may create `packages/werkstatt-obsidian/` implementing `werkstatt/plugin@1` with `profileId: "obsidian-vault"`.
- **RFC-0638 (Domain-neutral profile schema):** The profile uses `register: creative`, `domain: knowledge-base`, `terminology`, `artifacts`, `workspaceTypes`, and `invariants` — all fields introduced by RFC-0638 for non-code domains.
- **RFC-0770 (Werkstatt plugin contract):** Not directly impacted — no plugin is created. The profile is a Forge artifact; the plugin contract is relevant only when a Werkstatt engine integration is added.
- **ADR-0043 (Agent script directory):** The profile declares `scriptDir: scripts` in its path conventions, aligning with ADR-0043's default. Agent-generated scripts for note processing go to `scripts/`, never into `vault/`.
- **editframe profile precedent:** The `editframe.yaml` profile (`register: creative`, `domain: video`) demonstrates the pattern: creative-domain profiles use the full domain-neutral schema with domain-specific terminology and invariants.

## Design

### Profile YAML

The profile is defined in `packages/forge/profiles/obsidian-vault.yaml`:

```yaml
schema: forge/stack-profile@1
id: obsidian-vault
displayName: Obsidian Knowledge Base
detect:
  anyOf:
    - .obsidian/app.json
    - vault/**/*.md
domain: knowledge-base
register: creative
terminology:
  artifact: note
  artifactPlural: notes
  module: folder
  source: markdown file
  output: export
  verify: link-check
  operator: author
scriptDir: scripts
artifacts:
  - id: note
    extensions:
      - .md
    validate:
      command: note.link.validate
  - id: canvas
    extensions:
      - .canvas
  - id: attachment
    extensions:
      - .png
      - .jpg
      - .jpeg
      - .webp
      - .svg
      - .pdf
      - .mp4
      - .webm
workspaceTypes:
  - id: vault
    detect:
      glob: "**/*.md"
      contains: "---"
    # Skills (fo-note-create, fo-note-link, fo-note-refactor) will be added
    # in a future RFC when the note management skill pack is created.
invariants:
  - id: NOTE-01
    rule: All [[wikilinks]] must resolve to an existing note file
    severity: error
    check:
      kind: link-resolution
      glob: "vault/**/*.md"
  - id: NOTE-02
    rule: Every note must have a title in frontmatter (title or first H1)
    severity: warning
    check:
      kind: frontmatter-required
      glob: "vault/**/*.md"
      fields: [title]
  - id: NOTE-03
    rule: No executable code files in vault/ (scripts go to scripts/ per ADR-0043)
    severity: error
    check:
      kind: path-exclusion
      glob: "vault/**/*.{ts,mjs,js,py,sh}"
  # NOTE-04 uses an existing check kind (filename-pattern) and needs no schema extension
  - id: NOTE-04
    rule: Note filenames must use kebab-case (lowercase letters, digits, hyphens)
    severity: warning
    check:
      kind: filename-pattern
      glob: "vault/**/*.md"
      pattern: "^[a-z0-9]+(-[a-z0-9]+)*\\.md$"
workspace:
  dirs:
    - vault
    - scripts
    - .forge
  files:
    - path: .gitignore
      content: |
        node_modules
        .obsidian/workspace
        .obsidian/workspace.json
        .cache
    - path: forge.yaml
      content: |
        schema: forge/config@1
        project:
          name: __PROJECT_NAME__
          stack:
            - obsidian-vault
          packageManager: pnpm
        paths:
          rfcsDir: docs/rfcs
          adrsDir: docs/adrs
    - path: package.json
      content: |
        {
          "name": "__PROJECT_NAME__",
          "version": "0.1.0",
          "private": true,
          "type": "module"
        }
install:
  - pnpm add -D @warpgogol/forge
```

### CLI surface

```sh
# Validate wikilink integrity across the vault
pnpm exec forge note.link.validate --json

# Validate frontmatter consistency
pnpm exec forge note.frontmatter.validate --json

# Detect orphan notes (no inbound links)
pnpm exec forge note.orphan.detect --json
```

All three commands operate at workspace scope (no `--app` flag). They scan `vault/**/*.md` and report violations.

### TypeScript contracts

```ts
interface NoteLinkViolation {
  file: string;       // source note path
  line: number;       // line of the broken wikilink
  link: string;       // the broken [[wikilink]] text
  rule: "NOTE-01";
  message: string;
}

interface FrontmatterViolation {
  file: string;
  field: string;      // missing or malformed field
  rule: "NOTE-02";
  message: string;
}

interface OrphanReport {
  file: string;       // orphan note path
  inboundLinks: 0;    // always 0 for orphans
  severity: "warning";
}
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `vault/**/*.md` | Notes — scanned by all validators |
| `vault/**/*.canvas` | Obsidian canvas files — recognized as artifacts, not scanned for links |
| `vault/**/*.{png,jpg,jpeg,webp,svg,pdf,mp4,webm}` | Attachments — recognized, not scanned |
| `scripts/` | Agent-generated scripts (ADR-0043) |
| `.obsidian/` | Obsidian app config — gitignored except `app.json` (used for detection) |
| `.forge/` | Forge governance (pinned.yaml, pinned-audit.log) |
| `docs/rfcs/` | RFCs for structural decisions about the knowledge base |
| `docs/adrs/` | ADRs for local conventions (tag taxonomy, frontmatter fields) |

### Output format

```json
{
  "command": "note.link.validate",
  "status": "fail",
  "violations": [
    {
      "file": "vault/chapters/chapter-03.md",
      "line": 42,
      "link": "[[character-list]]",
      "rule": "NOTE-01",
      "message": "Wikilink target 'character-list' not found in vault"
    }
  ]
}
```

### Schema extension: new invariant check kinds

The proposed profile YAML uses three invariant check kinds that are not in the current `profileInvariantCheckSchema` (which only supports `filename-pattern`, `file-contains`, `file-not-contains`, `attribute-pattern`):

- `link-resolution` — parses `[[wikilinks]]` from note content and resolves each against the note graph. Fundamentally different from `file-contains` (which checks for a pattern in file content, not link graph resolution).
- `frontmatter-required` — parses YAML frontmatter and checks for specific fields. `file-contains` could partially work (e.g. check for `title:`) but is fragile and doesn't validate YAML structure.
- `path-exclusion` — checks that no files matching a glob pattern exist in a directory. Different from `file-not-contains` (which checks file contents, not file existence by pattern).

Implementation MUST extend `profileInvariantCheckSchema` in `packages/forge/src/profiles/profile-schema.ts` to accept these three new check kinds. This is a schema extension, not a breaking change — existing profiles are unaffected because the new kinds are additive to the enum.

### Failure modes

- `note.link.validate` exits non-zero when broken wikilinks are found. Warnings for ambiguous links (multiple matches) are logged but do not cause non-zero exit.
- `note.frontmatter.validate` exits non-zero for missing required fields (NOTE-02 severity: error). Warnings for recommended fields (tags, aliases) do not cause non-zero exit.
- `note.orphan.detect` always exits zero — orphans are warnings, not errors. The report is informational.
- All three commands support `--json` for machine-readable output and pretty-print for human review.

## Rollout

- **New projects:** `forge scaffold --profile obsidian-vault` creates a project with `vault/`, `scripts/`, `.forge/`, `forge.yaml`, and `.gitignore` configured for Obsidian.
- **Existing Obsidian vaults:** Authors initialize Forge in an existing vault by running `forge create` and setting `stack: [obsidian-vault]` in `forge.yaml`. The `vault/` directory is the existing Obsidian vault root.
- **Validators are opt-in:** `note.link.validate`, `note.frontmatter.validate`, and `note.orphan.detect` are standalone commands — they do not run automatically in any pipeline. Authors run them on-demand or wire them into pre-commit hooks manually.
- **No migration path needed:** This is a new profile, not a change to existing profiles. Existing werkstatt projects are unaffected.
- **Profile validation:** `forge profile.validate` checks the profile YAML against the schema. `forge doctor` reports if the profile is active but the vault directory is missing.

## Alternatives considered

1. **Werkstatt plugin instead of Forge profile.** A `werkstatt-obsidian` plugin would provide mission lifecycle, workpiece-based editing, bordbuch audit trail, and integrity verification. Rejected for this RFC because it couples the knowledge base to the full Werkstatt engine — too heavy for the initial use case (single author or small team). The Forge profile provides governance (RFCs, ADRs, skills, validators) without engine coupling. A future RFC may add the plugin when mission-lifecycle integration is needed.

2. **Generic `markdown-notes` profile (not Obsidian-specific).** A profile that supports any Markdown-based knowledge base (Logseq, Foam, etc.). Rejected because `[[wikilink]]` syntax, `.canvas` files, and `.obsidian/` config are Obsidian-specific. A generic profile would need to abstract over different link syntaxes, adding complexity without near-term value. The profile can be extended or a sibling profile added if other tools need support.

3. **No profile, just skills.** Define skills for note management without a stack profile. Rejected because skills alone do not provide invariants (NOTE-01..04), terminology mapping, or workspace type detection. The profile is the structural contract; skills are the operational layer.

4. **Vault location at project root (not in `vault/` subdirectory).** Make the entire project root the vault. Rejected because Forge needs non-content directories (`docs/`, `scripts/`, `.forge/`, `node_modules/`) that should not be part of the Obsidian vault. A `vault/` subdirectory cleanly separates content from governance infrastructure.

## Risks

- **Performance at scale.** A vault with 100,000+ notes may cause `note.link.validate` to be slow (full graph traversal). Mitigation: the validator builds an in-memory link graph in a single pass, then checks resolution. O(n) in note count, O(m) in link count. For extreme scale, a `--path` flag can scope validation to a subdirectory.
- **Wikilink ambiguity.** Obsidian allows short-form links (`[[note]]`) that match by filename, not full path. Multiple notes with the same filename in different folders create ambiguity. The validator reports these as warnings, not errors.
- **Obsidian-specific features.** The profile assumes Obsidian's `[[wikilink]]` syntax and frontmatter conventions. Authors using other Markdown tools (Logseq, Foam) cannot use this profile without adaptation.
- **Agent misinterpretation.** Agents may confuse `vault/` (content) with `scripts/` (code) and place generated scripts in the vault. NOTE-03 invariant catches this, but prevention is better — skills must reference ADR-0043 explicitly.
- **False positive rate for orphans.** `note.orphan.detect` reports all notes with zero inbound links. Some notes are intentionally orphaned (index notes, daily notes). The report is informational (warnings only) — authors filter as needed.
- **Maintenance burden.** Three new validators need implementation, tests, and ongoing maintenance. The validators are simple (link graph + frontmatter parse), but they add to the Forge command surface.

## Acceptance criteria

- [ ] `packages/forge/profiles/obsidian-vault.yaml` exists and passes `forge profile.validate`
- [ ] `forge scaffold --profile obsidian-vault` creates a valid project structure with `vault/`, `scripts/`, `forge.yaml`
- [ ] `note.link.validate` detects broken `[[wikilinks]]` in test fixtures and exits non-zero
- [ ] `note.frontmatter.validate` detects missing required frontmatter fields in test fixtures
- [ ] `note.orphan.detect` reports notes with zero inbound links as warnings
- [ ] NOTE-03 invariant detects code files placed in `vault/` and reports them as errors
- [ ] Profile terminology maps `artifact: note`, `module: folder`, `operator: author` correctly
- [ ] `rfc.validate` passes on this file before merging

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT place generated scripts in `vault/` — all agent-generated code goes to `scripts/` per ADR-0043.
- Agents MUST NOT create a `werkstatt-obsidian` plugin as part of this RFC — the profile is Forge-only. A separate RFC is required for plugin creation.
- Agents MUST NOT weaken NOTE-03 (code exclusion from vault) — this is the structural invariant that keeps content and code separated.
- If implementation reveals an invariant conflict, run `rfc.supersede.propose --id RFC-0808 --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
- The `scriptDir` field was already added to `stackProfileSchema` by ADR-0043. No schema extension is needed for it.
