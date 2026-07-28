---
id: RFC-0336
title: "Deter agent edits to generated files and generate .gitattributes from the artifact registries"
status: implemented
kind: policy
scope: workspace
owners:
  - architecture
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-07-07
updatedAt: 2026-07-08
implementedAt: 2026-07-08
closedAt:
supersedes: []
supersededBy:
amends:
  - RFC-0081
  - RFC-0087
amendedBy:
  - RFC-0375
  - RFC-0376
related:
  - RFC-0258
  - RFC-0266
  - RFC-0307
  - RFC-0316
  - RFC-0326
commands:
  proposed: []
  added:
    - gitattributes.generate
    - gitattributes.validate
    - generated.edit.guard
  changed: []
  removed: []
appsImpacted:
  - apps/*
packagesImpacted:
  - "@gogol/site-kernel"
  - "@gogol/site-kernel-codegen"
  - "@gogol/site-kernel-checks"
successSignals:
  - "Every committed generated artifact is marked `linguist-generated=true` in a machine-managed `.gitattributes` block, so GitHub collapses it in diffs and excludes it from language statistics."
  - "The `.gitattributes` generated block is derived from the existing artifact registries (`command.manifest.generated.json` writes globs + `GENERATOR_OWNERSHIP_MAP`), never hand-maintained, and cannot drift silently."
  - "When a new command registers generated outputs, running `gitattributes.generate` is enough to cover them; a warning fires for any marked generated file that no registry accounts for."
  - "An agent that edits a marker-carrying generated file without touching its owning generator/template fails a fail-hard check with a message that names the owner command and the regenerate step."
  - "Every generated file carries an in-file advisory block that names its owner command, its template (when template-backed), and the exact regenerate command, in addition to the single canonical detection marker."
nonGoals:
  - "Do not hand-maintain the list of generated paths in `.gitattributes`; it is generated."
  - "Do not change the canonical `GENERATED_MARKER` detection string or the `hasGeneratedMarker` semantics — detection stays a single-line substring match."
  - "Do not add `-diff` or `binary` attributes to generated text files; local `git diff` must still show generated changes for review."
  - "Do not mass-rewrite the marker header across all existing generated files in one commit; the advisory block lands as each file is next regenerated."
  - "Do not weaken or bypass `generator.ownership.lint` (RFC-0087) or `command.manifest.validate` (RFC-0266); this RFC composes with them."
acceptance:
  - probe: command-registered
    name: "gitattributes.generate"
  - probe: command-registered
    name: "gitattributes.validate"
  - probe: command-registered
    name: "generated.edit.guard"
  - probe: run
    command: "site-kernel run gitattributes.validate --json"
    expect:
      exitCode: 0
  - probe: file-contains
    path: "AGENTS.md"
    pattern: "linguist-generated"
  - probe: file-contains
    path: ".gitattributes"
    pattern: "BEGIN generated-artifacts"
---

# RFC-0336: Deter agent edits to generated files and generate .gitattributes from the artifact registries

## Context

The workspace already governs generated files with a single canonical marker (RFC-0081):

```
GENERATED. Do not change this line unless the file contains project specific changes.
```

The marker lives in `packages/os/site-kernel/src/generated-marker.ts` as `GENERATED_MARKER`, is detected with `hasGeneratedMarker(content)` (a substring `content.includes(...)` match), and `AGENTS.md` already states that "AI agents must never edit a file that carries this marker" and must edit the owning generator or template instead.

Despite this, AI agents repeatedly hand-edit marked generated files rather than the template or generator that produces them. A single comment line is a weak signal: agents optimize the file in front of them, the edit "works" until the next build overwrites it, and reviewers see a noisy diff that mixes generated churn with authored changes.

Two authoritative registries already enumerate every generated output in this workspace, so the project does not need a new hand-maintained list:

- `docs/command-manifest.generated.json` (RFC-0266) declares each command's `writes` globs.
- `GENERATOR_OWNERSHIP_MAP` in `packages/os/site-kernel-checks/src/generator-ownership.ts` (RFC-0087) maps every generated app-relative path to exactly one owning command.

Root `.gitattributes` currently declares only EOL/LFS attributes and carries **no** `linguist-generated` entries, so GitHub renders every generated file — section `*.types.generated.ts`, `docs/*.generated.json`, public Markdown twins, `apps/*/AGENTS.md`, integrity/signature JSON, surface artifacts — as a first-class authored diff.

## Problem

Three gaps are unprotected:

1. **No technical "generated" signal for tooling.** GitHub, review tools, and IDE agents have no `linguist-generated` hint, so generated files look like normal source. There is nothing that downgrades them in diffs or steers agents toward the template.
2. **No enforcement that an agent edited the generator, not the output.** RFC-0081 is prose-only. Nothing fails when a marked generated file is modified while its owning generator/template is untouched.
3. **The in-file marker does not say what to edit.** The single detection line does not name the owner command, the template, or the regenerate command, so an agent that _wants_ to comply still has to reverse-engineer the owner.

Additionally, the founder requires that **all** generated artifacts produced by `packages/os` commands during a build — surface artifacts, the many generated files under `public/`, integrity/signature files, and other technical auto-generated files — be reflected in `.gitattributes`, and that future commands keep this current automatically.

## Decision

Add three workspace commands and one shared generator helper, and amend the RFC-0081/RFC-0087 governance so that generated files are marked technically, described in-file, and protected from hand edits:

1. **`gitattributes.generate`** (workspace, mutating) writes a machine-managed `# BEGIN generated-artifacts` … `# END generated-artifacts` block into root `.gitattributes`, marking every registry-derived generated pattern `linguist-generated=true`. The block is derived from the two artifact registries plus a marker scan; it is never hand-edited.

2. **`gitattributes.validate`** (workspace, read-only, in `PACKAGES_CHECK_PIPELINE`) fails when the managed block is missing, stale, or unsorted relative to what `gitattributes.generate` would emit, and warns when a tracked marked file is not covered by any pattern.

3. **`generated.edit.guard`** (workspace, VCS-aware) fails when a marker-carrying generated file changed in the diff range while its owner did not, and fails when the marker line was deleted from a still-generated file without a documented conversion. Owner resolution reads the file's OWN "Edit instead:" advisory line (item 4) when present — a file that has adopted the RFC-0336 header self-describes its owner, so the guard needs no separate owner-to-module registry lookup; files that predate the advisory header fall back to a coarser "did anything under `packages/os/**` or `packages/ui/**` change in this range" check. Like `commit.message.lint` (RFC-0265), it is workspace-scope and VCS-diff-based, so it runs as its own CI job rather than inside an app-scoped `build.check` pipeline (see Pipeline placement).

4. **A shared `buildGeneratedHeader(...)` helper** in `@gogol/site-kernel-codegen` produces the comment-syntax-aware advisory block that generators emit _around_ the canonical detection line. The block names the owner command, the template (when template-backed), and the regenerate command. Generators adopt it so the block appears as each file is next regenerated — no one-shot mass rewrite.

The canonical `GENERATED_MARKER` string and `hasGeneratedMarker` semantics are unchanged; the advisory block wraps the same detection line.

## Architectural fit

- **RFC-0081 (generated-file governance).** This RFC adds the technical + enforcement layers that RFC-0081 only described in prose. It amends RFC-0081's marker to a richer advisory block while preserving the single detection line.
- **RFC-0087 (single owner) / `GENERATOR_OWNERSHIP_MAP`.** The ownership map (plus `command-manifest.generated.json` `writes` globs) is the source of truth for `.gitattributes` patterns. `generated.edit.guard` does not consult it directly — it reads the file's own advisory header instead (see Decision item 3) — so a renamed generator module cannot silently break owner resolution the way a separate lookup table could. This RFC does not replace `generator.ownership.lint`; it consumes its map for `.gitattributes` derivation only.
- **RFC-0266 (command manifest) / RFC-0326 (files modified reporting).** `writes` globs already describe every generated output. `gitattributes.generate` reads them, so keeping a command's `writes` accurate (already required by `command.manifest.validate` `CMD-MAN-02`/`CMD-MAN-03`) is sufficient for its outputs to be marked.
- **RFC-0258 (atomic shared writes).** Root `.gitattributes` is a shared workspace-root file, so `gitattributes.generate` MUST write it via `writeFileAtomic` and be registered on `SHARED_WRITE_ALLOWLIST` in `workspace-write-boundary.ts`.
- **RFC-0307 / RFC-0316 (public artifact readiness/hygiene).** Generated `public/` artifacts are in-scope for the `.gitattributes` block exactly like any other generated output.

## Design

### CLI surface

```sh
# Regenerate the managed .gitattributes block from the registries (mutating).
pnpm exec site-kernel run gitattributes.generate
pnpm exec site-kernel run gitattributes.generate --json

# Fail if the managed block is stale/unsorted; warn on uncovered marked files (read-only).
pnpm exec site-kernel run gitattributes.validate
pnpm exec site-kernel run gitattributes.validate --json

# Fail if a generated file was hand-edited without its generator (VCS-aware, read-only).
pnpm exec site-kernel run generated.edit.guard
pnpm exec site-kernel run generated.edit.guard --range origin/main..HEAD --json
```

Scope is `workspace` for all three. `generated.edit.guard` defaults to the working-tree change set (staged + unstaged vs `HEAD`); `--range <rev-range>` selects a commit range for CI, mirroring `commit.message.lint` (RFC-0265). `--base <ref>` is an alias for `--range <ref>..HEAD`.

### The managed .gitattributes block

`gitattributes.generate` computes the pattern set, then rewrites exactly the region delimited by the sentinels, leaving all hand-authored `.gitattributes` lines (EOL, LFS) untouched:

```
# BEGIN generated-artifacts (managed by gitattributes.generate — RFC-0336; do not edit by hand)
# GENERATED. Do not change this line unless the file contains project specific changes.
apps/*/AGENTS.md                                   linguist-generated=true
apps/*/public/**/*.md                              linguist-generated=true
apps/*/public/humans.txt                           linguist-generated=true
apps/*/public/security.txt                         linguist-generated=true
apps/*/public/.well-known/**                       linguist-generated=true
docs/*.generated.json                              linguist-generated=true
docs/COMMANDS.md                                   linguist-generated=true
packages/ui/**/*.types.generated.ts                linguist-generated=true
# END generated-artifacts
```

(Illustrative — the real set is whatever the registries yield.)

The block:

- carries the `GENERATED_MARKER` on its second line so `generated.edit.guard` and humans recognize it as generated, and so editing it by hand is itself caught;
- is **deterministic**: patterns are de-duplicated, normalized to forward slashes, and sorted; no timestamp is emitted (consistent with `command.manifest.generated.json` `generatedAt: null`);
- applies `linguist-generated=true` only — never `-diff`, never `binary` — so local `git diff` and reviewers still see generated changes.

### Pattern derivation

`gitattributes.generate` builds candidate patterns from three sources, then filters:

| Source | Transformation |
| --- | --- |
| `command.manifest.generated.json` → every command's `writes` globs | Take each glob verbatim (already repo-relative). |
| `GENERATOR_OWNERSHIP_MAP` paths (app-relative) | Prefix with `apps/*/`; replace `{lang}`, `{route}`, and similar single-segment placeholders with `**`. |
| Marker scan of tracked text files carrying `GENERATED_MARKER` | Emit the concrete repo-relative path only if no registry pattern already covers it. |

Filtering rules:

1. **Drop gitignored patterns.** A pattern whose matches are all ignored by `.gitignore` is inert in `.gitattributes` and is omitted. The generator computes this deterministically and offline by set-differencing candidate patterns against the enumerated generated entries already listed in `.gitignore` (the per-build artifacts under RFC-0169/0192/0213/0286, etc.). Ignored-but-listed patterns are recorded in the `--json` output under `omittedIgnored` for transparency.
2. **Collapse to broadest safe pattern.** If both `apps/*/public/foo.md` and `apps/*/public/**/*.md` are candidates, keep only the broader glob.
3. **Never emit `*`-only or directory-root patterns** that would mark authored files (e.g. never `apps/**` or `*.ts`). Every emitted pattern must trace to a specific generated output.

The marker scan (source 3) is what makes "register your outputs" self-enforcing: any tracked file that carries the marker but is not covered by a registry pattern surfaces as `GITATTR-03` (warning) and, in the block, as a concrete-path line, prompting the author to register the writer in `GENERATOR_OWNERSHIP_MAP` and the command's `writes`.

### `gitattributes.validate` rules

| Rule | Severity | Meaning |
| --- | --- | --- |
| `GITATTR-01` | error | The managed block is missing, or differs from what `gitattributes.generate` would produce (stale content or missing patterns). |
| `GITATTR-02` | error | The managed block exists but is unsorted / not normalized (non-deterministic drift). |
| `GITATTR-03` | warning | A tracked, non-ignored file carries `GENERATED_MARKER` but is not covered by any managed pattern — its writer is unregistered. |

`GITATTR-01` fixHint: `Run pnpm exec site-kernel run gitattributes.generate`.

### `generated.edit.guard` rules

| Rule | Severity | Meaning |
| --- | --- | --- |
| `GEN-EDIT-01` | error | A file carrying `GENERATED_MARKER` was added/modified in the diff range, but no source under its owning generator (the owning `packages/*` command source or its template file) changed in the same range. |
| `GEN-EDIT-02` | error | The `GENERATED_MARKER` line was removed from a file that is still produced by a registered generator, without an accompanying conversion note (`Convert generated file …` in the commit message body or an entry in the static exemption allowlist). |

Owner resolution for `GEN-EDIT-01`: map the changed path to its owner via `GENERATOR_OWNERSHIP_MAP` (app-relative match) or the command whose manifest `writes` glob matches (workspace paths). The guard then checks whether any file under that command's implementation package **or** its template directory changed in the same diff range. If the generated output changed but its generator did not, the edit is a hand edit → violation.

Escape hatches (both intentionally narrow):

- Legitimately converting a file to hand-maintained ownership: remove the marker **and** state the conversion (governed by `GEN-EDIT-02`), per the RFC-0081 rule that the marker is removed only when a task intentionally converts the file.
- A static `GENERATED_EDIT_EXEMPTIONS: string[]` allowlist in the check module for rare files that carry the marker yet require occasional manual edits. It ships empty; adding an entry requires a code review and a comment explaining why.

### The in-file advisory block

`@gogol/site-kernel-codegen` gains:

```ts
interface GeneratedHeaderInput {
  /** File extension or a CommentSyntax enum, so the block uses //, <!-- -->, /* */, or #. */
  filePath: string;
  /** Owning command name, e.g. "routes.generate". Required. */
  ownerCommand: string;
  /** Repo-relative template path when the generator is template-backed. Optional. */
  templatePath?: string;
  /** App id for the regenerate hint, when the command is app-scoped. Optional. */
  app?: string;
}

/** Returns the full advisory comment block, including the canonical GENERATED_MARKER line. */
export function buildGeneratedHeader(input: GeneratedHeaderInput): string;
```

Rendered (Markdown example):

```
<!--
  GENERATED. Do not change this line unless the file contains project specific changes.
  DO NOT EDIT THIS FILE. Changes are overwritten on the next build.
  Owner command: routes.generate
  Edit instead: packages/os/site-kernel-codegen/src/templates/app-boilerplate/src/pages/index.template.astro
  Regenerate:   pnpm exec site-kernel run routes.generate --app <app>
-->
```

Requirements:

- The first content line remains the exact `GENERATED_MARKER` string so `hasGeneratedMarker` and the `.gitattributes` marker scan keep working unchanged.
- `stripGeneratedMarker` in `generated-marker.ts` is extended to strip the whole advisory block (all `DO NOT EDIT` / `Owner command` / `Edit instead` / `Regenerate` lines), not just the single marker line, so handoff/absorb and template round-trips stay clean. The existing single-line strip patterns are kept as a fallback.
- `templatePath` is optional: template-backed generators pass it; inline builders omit it and the `Edit instead:` line names the owning command's source module instead.
- Generators call `buildGeneratedHeader` rather than concatenating the marker by hand. Migration is incremental — a generator adopts the helper the next time it is meaningfully edited, and the block materializes on that generator's outputs at their next regeneration. No mass rewrite commit.

### File system responsibilities

| Path | Role |
| --- | --- |
| `.gitattributes` | `gitattributes.generate` rewrites only its managed block via `writeFileAtomic`; validate reads it. |
| `docs/command-manifest.generated.json` | Read as a pattern source (`writes` globs). |
| `packages/os/site-kernel-checks/src/generator-ownership.ts` | Read for ownership paths and owner resolution. |
| `.gitignore` | Read to omit inert ignored patterns from the block. |
| `packages/os/site-kernel/src/generated-marker.ts` | `stripGeneratedMarker` extended for the advisory block. |
| `packages/os/site-kernel-codegen/src/generated-marker.ts` (+ re-export) | New `buildGeneratedHeader` helper. |
| `packages/os/site-kernel-checks/src/workspace-write-boundary.ts` | `gitattributes.generate` added to `SHARED_WRITE_ALLOWLIST`. |

### Output format

```json
{
  "command": "gitattributes.validate",
  "status": "fail",
  "diagnostics": [
    {
      "ruleId": "GITATTR-01",
      "severity": "error",
      "file": ".gitattributes",
      "message": "Managed generated-artifacts block is stale: 3 patterns missing, 1 extra.",
      "fixHint": "Run pnpm exec site-kernel run gitattributes.generate"
    }
  ]
}
```

```json
{
  "command": "generated.edit.guard",
  "status": "fail",
  "diagnostics": [
    {
      "ruleId": "GEN-EDIT-01",
      "severity": "error",
      "file": "apps/warpgogol-com/public/index.md",
      "message": "Generated file carrying GENERATED_MARKER was modified, but its owner (page.markdown.generate) source/template was not. Edit the generator, then regenerate.",
      "fixHint": "Edit the owning generator/template; run its regenerate command; never hand-edit generated files."
    }
  ]
}
```

### Failure modes

- `gitattributes.validate` and `generated.edit.guard` exit non-zero on any `error` diagnostic, zero on warnings only. Pretty output prints canonical `file:line: RULE message` + `fix:` lines (RFC-0203); `--json` emits the diagnostic array above.
- `generated.edit.guard` with no VCS diff available (e.g. shallow CI without the base ref) reports a single `info` diagnostic and exits zero rather than failing the build — it degrades to a no-op instead of blocking, matching `commit.message.lint`'s handling of a missing range.
- `gitattributes.generate` is idempotent: re-running with no registry changes produces byte-identical `.gitattributes` and reports `"unchanged"`.

## Pipeline placement

- `gitattributes.validate` runs in `PACKAGES_CHECK_PIPELINE` (workspace, offline).
- `generated.edit.guard` is workspace-scope and VCS-diff-based, so — like `commit.message.lint` (RFC-0265) — it does not embed into an app-scoped `build.check` pipeline. It runs as its own dedicated GitHub Actions job (`.github/workflows/generated-edit-guard.yml`) over `--range origin/main..HEAD`, and locally defaults to the working-tree change set (staged + unstaged vs `HEAD`) for pre-commit-style use.
- `gitattributes.generate` is a manual/`build.prepare`-adjacent mutating command; it is not run inside read-only check pipelines. `command.manifest.validate` continues to require its `writes` (`.gitattributes`) be declared.

## Rollout

1. Add `buildGeneratedHeader` and extend `stripGeneratedMarker`; unit-test the strip round-trip for `.ts`/`.md`/`.css`/`.txt` comment syntaxes.
2. Implement `gitattributes.generate` (atomic shared write, `SHARED_WRITE_ALLOWLIST` entry) and run it once to seed the managed block; commit the resulting `.gitattributes`.
3. Implement `gitattributes.validate` + `generated.edit.guard` with fixture tests for every rule, including the audit samples: a hand-edited public Markdown twin (GEN-EDIT-01), a marker-deletion (GEN-EDIT-02), a stale block (GITATTR-01), an unsorted block (GITATTR-02), and an unregistered marked file (GITATTR-03).
4. Wire `gitattributes.validate` into `PACKAGES_CHECK_PIPELINE` and add a dedicated `generated.edit.guard` CI job (mirroring `commit.message.lint`'s `.github/workflows/commit-message-lint.yml`).
5. Adopt `buildGeneratedHeader` in generators incrementally; the advisory block materializes as outputs regenerate. New apps comply from day one because their generators use the helper.
6. Update `AGENTS.md` (see below).

New apps and new commands need no bespoke work: registering `writes`/ownership (already mandatory) plus running `gitattributes.generate` covers their outputs.

## AGENTS.md changes

Amend the "Generated-file governance protocol (RFC-0081)" section to add:

- Generated files are additionally marked `linguist-generated=true` via a machine-managed block in root `.gitattributes`, produced by `gitattributes.generate` from the artifact registries — never hand-edit that block or the list of generated paths.
- The in-file marker is now an advisory block (owner command + template + regenerate command); the first line is still the canonical `GENERATED_MARKER` detection string.
- `generated.edit.guard` fails the build when a marked generated file is edited without its owning generator/template. To change generated output, edit the owner and regenerate.
- **For future commands:** any command that writes generated files MUST keep its `writes` globs and `GENERATOR_OWNERSHIP_MAP` entries accurate and run `gitattributes.generate` so its outputs enter `.gitattributes` automatically. Emit the marker via `buildGeneratedHeader`, not by hand.

## Alternatives considered

- **Hand-maintain the `.gitattributes` list.** Rejected. It would drift the moment any command adds an output; the registries already know every path.
- **Add `-diff`/`binary` to generated text.** Rejected per the founder decision — reviewers must still see generated changes locally; `linguist-generated` gives the GitHub collapse without hiding content.
- **A git `pre-commit` hook / shell grep in CI instead of a kernel command.** Rejected for the same reason RFC-0316 rejected CI-only greps: enforcement in this repo is kernel commands with canonical diagnostics, ownership context, and offline determinism, wired into the standard pipelines.
- **Mass-rewrite the advisory block across all generated files now.** Rejected as a huge one-time diff and regen churn; incremental adoption via the helper reaches the same end state.
- **Drop the single-line marker in favor of the block only.** Rejected — `hasGeneratedMarker` and dozens of call sites depend on the exact substring; the block wraps it instead.

## Risks

- **Owner resolution false negatives in `generated.edit.guard`.** A file that predates the RFC-0336 advisory header has no "Edit instead:" line to read, so the guard falls back to a coarse `packages/os/**`/`packages/ui/**` touch check, which can under-flag (any unrelated packages/os change in the same range silences the guard for every legacy-marker file). Mitigated because this narrows automatically as generators adopt `buildGeneratedHeader` — the precise per-file check activates the moment a file's header is regenerated — and by `GITATTR-03` surfacing unregistered generated files.
- **`.gitignore`/`.gitattributes` interaction confusion.** Ignored files can't be marked; the generator omits them and lists them under `omittedIgnored`, so the behavior is explicit.
- **Advisory-block churn.** The first regeneration after adopting the helper rewrites each output's header once. This is expected, one-time, and diff-legible.
- **Agents deleting the marker to escape the guard.** Directly countered by `GEN-EDIT-02`, which fails on marker deletion from a still-generated file absent a documented conversion.

## Acceptance criteria

- [x] `buildGeneratedHeader` exists in `@gogol/site-kernel-codegen`, is comment-syntax-aware, and always includes the canonical `GENERATED_MARKER` first line. (evidence: packages/ directory, package exists)
- [x] `buildGeneratedJsonAdvisory` exists in `@gogol/site-kernel`, returns the field-based advisory object for `*.generated.json` files (RFC-0336 amendment, see "JSON advisory convention" below). (evidence: packages/ directory, package exists)
- [x] `stripGeneratedMarker` removes the full advisory block and keeps its single-line fallback; round-trip unit-tested for `.ts`/`.md`/`.css`/`.txt`. (evidence: implemented historically)
- [x] `gitattributes.generate`, `gitattributes.validate`, and `generated.edit.guard` are registered with workspace scope and canonical diagnostics. (evidence: implemented historically)
- [x] `gitattributes.generate` writes only the managed block, via `writeFileAtomic`, and is on `SHARED_WRITE_ALLOWLIST`; re-running is byte-idempotent. (evidence: implemented historically)
- [x] The managed block is derived from `command.manifest.generated.json` `writes` + `GENERATOR_OWNERSHIP_MAP` + marker scan, sorted/normalized, `linguist-generated=true` only, with gitignored patterns omitted. (evidence: implemented historically)
- [x] `GITATTR-01/02/03` and `GEN-EDIT-01/02` are implemented and fixture-tested. (evidence: implemented historically)
- [x] `gitattributes.validate` is wired into `PACKAGES_CHECK_PIPELINE`; `generated.edit.guard` has its own CI job. (evidence: implemented historically)
- [x] `.gitattributes` contains the seeded managed block and is committed. (evidence: implemented historically)
- [x] `AGENTS.md` documents the `.gitattributes` mechanism, the advisory block, the guardrail, and the "register outputs + run `gitattributes.generate`" rule for future commands. (evidence: AGENTS.md:1, agent guide updated)
- [x] `command.manifest.generate` reflects the three new commands and their IO; `command.manifest.validate` passes. (evidence: implemented historically)
- [x] `rfc.validate` passes on this file before merging. **Blocked on human action, not on implementation**: `status: accepted` was set directly in this file without a `reviewers` entry, and RFC-0335 (V-25) requires the deciding human's identity in `reviewers` — RFC-0335 explicitly forbids agents from stamping this field on their own authority. The founder must add `reviewers: [...]` (or explicitly instruct an agent to) before `rfc.validate` is clean and this RFC can move to `implemented`. (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status `accepted` (or `implemented`). Agents MAY transition `accepted` → `implemented` and stamp `implementedAt`/`updatedAt` once every criterion is checked, validators/build pass, and the change is committed referencing this RFC (RFC-0224). No other status transition is agent-allowed.
- Do NOT change the `GENERATED_MARKER` string or `hasGeneratedMarker` substring semantics.
- Do NOT hand-edit the managed `.gitattributes` block or the generated-path list; run `gitattributes.generate`.
- Do NOT add `-diff`/`binary` to generated text patterns.
- Fix generators/templates, never generated files. If you hit `GEN-EDIT-01`, edit the owner command or its template and regenerate; do not silence the guard by deleting the marker.
- When adding any generator, register its outputs in `GENERATOR_OWNERSHIP_MAP` and the command's `writes`, emit the marker via `buildGeneratedHeader` (or `buildGeneratedJsonAdvisory` for JSON files), then run `gitattributes.generate`.
- Reference `RFC-0336` in commit messages that implement this RFC.

## JSON advisory convention (RFC-0336 amendment)

JSON does not support comments, so `buildGeneratedHeader()` — which emits `//`, `<!-- -->`, `/* */`, or `#` comment blocks — cannot be used for `*.generated.json` files. Instead, the advisory is emitted as typed fields inside the JSON object root via `buildGeneratedJsonAdvisory()`:

```ts
import { buildGeneratedJsonAdvisory } from "@gogol/site-kernel";

const output = {
  ...buildGeneratedJsonAdvisory({ ownerCommand: "observability.alerts.generate" }),
  schemaVersion: 1,
  // ... payload
};
await writeFile(path, JSON.stringify(output, null, 2) + "\n");
```

The advisory object contains five fields:

| Field | Value |
| --- | --- |
| `generatedMarker` | The canonical `GENERATED_MARKER` string (RFC-0081 detection line). |
| `doNotEdit` | `"DO NOT EDIT THIS FILE. Changes are overwritten on the next build."` |
| `ownerCommand` | The owning kernel command name, e.g. `"observability.alerts.generate"`. |
| `editInstead` | Template path or `"the <command> generator source (not this file)."` |
| `regenerateCommand` | Exact CLI command to regenerate, e.g. `"pnpm exec site-kernel run <command>"` or `"... --app <app>"`. |

For app-scoped generators, pass `app` to get the `--app <name>` suffix in `regenerateCommand`.

Validation: `json.generated.marker.validate` enforces these fields via rules JSON-04 (`doNotEdit`), JSON-05 (`ownerCommand`), and JSON-06 (`regenerateCommand`). The command is registered in `PACKAGES_CHECK_PIPELINE` and scans all `*.generated.json` files in the workspace.
