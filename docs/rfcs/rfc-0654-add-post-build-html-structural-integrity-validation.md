---
id: RFC-0654
title: "Add post-build HTML structural integrity validation"
status: draft
# kind options: architecture | contract | command | policy | deprecation
kind: command
# scope options: app | workspace
scope: workspace
owners:
  - architecture
# Set by the deciding human together with the status change (RFC-0335).
# Draft scaffolds must keep this empty; do not prefill a default identity.
# Format: human:<handle> (agent:<id> reserved — see RFC-0335).
# Default reviewer when none is specified by the operator: human:andrii-syrokomskyi
reviewers: []
createdAt: 2026-08-02
updatedAt: 2026-08-02
enhancedAt: 2026-08-02
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0185
  - RFC-0235
  - DNA-8
  - DNA-35
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-8
  - DNA-35
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
    - dist.html-structure.validate
  added:
    - dist.html-structure.validate
  changed: []
  removed: []
appsImpacted: []
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - packages/os/site-kernel-checks
successSignals:
  - "dist.html-structure.validate exits 0 on a clean build"
  - "dist.html-structure.validate exits 1 when a post-build mutator removes a structural tag"
nonGoals:
  - "Does not validate accessibility landmarks (that is Axiom's job)"
  - "Does not compare pre-mutator and post-mutator state (final-state check only)"
  - "Does not validate non-HTML files (JSON, XML, CSS, SVG)"
  - "Does not parse HTML with a full parser — uses lightweight tag counting"
  - "Does not detect duplicate structural tags (e.g. two <main> elements) — targets tag imbalance from mutator damage, not tag duplication"
  - "Does not include <html> in the structural tag list — regex mutators operate within page body, not the root element"
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

# RFC-0654: Add post-build HTML structural integrity validation

## Context

The `build.post` pipeline runs multiple post-build mutators that rewrite HTML files in `dist/client/`: `dist.generated-marker.strip` (RFC-0185) and `text.normalize.apply` (RFC-0235). These mutators use regex-based string operations on HTML content. While each mutator has unit tests, there is no structural integrity check that runs **after** all mutators to verify that HTML structure was not damaged.

A real bug demonstrated this gap: the `stripGeneratedMarker` regex used `[\s\S]*?` to match content between `<!--` and `-->` containing the GENERATED marker. Because the regex did not respect comment boundaries, it matched from an unrelated `<!--` comment (the GrowthProvider injection comment) to a distant `-->` containing the marker — swallowing everything in between, including the `<main>` opening tag. This caused `landmark-one-main` accessibility violations on the `/open-source/` page and its localized versions. The bug went undetected because no post-mutator structural validation existed.

## Problem

DNA-8 (Page → section → component → content hierarchy) requires that visitor-facing page bodies inside `<main>` are composed as an ordered list of section components. DNA-35 (`app.contract.full`) is the canonical readiness signal — but neither it nor any intermediate pipeline step verifies that post-build mutators have not damaged the HTML structure of `dist/client/` artifacts.

The risk is not theoretical: a regex-based mutator can silently remove structural HTML elements (like `<main>`, `<header>`, `<nav>`) while leaving closing tags in place, producing broken HTML that passes existing validators (because they check for marker removal or text normalization, not structural integrity) but fails accessibility audits and renders incorrectly.

## Decision

The kernel gains a `dist.html-structure.validate` command that checks tag balance for structural non-void HTML elements in every `.html` file under `<app>/dist/client/`. The command runs in the `build.post` pipeline after all mutators and before the postbuild validation pipeline. If any structural tag has mismatched open/close counts, the command fails with a diagnostic per violating file.

## Architectural fit

- **DNA-8** (Page → section → component → content hierarchy): protects the structural integrity of `<main>` and other structural elements after post-build mutations.
- **DNA-35** (`app.contract.full` as canonical readiness signal): strengthens the readiness gate by adding a structural integrity check to the build pipeline.
- **RFC-0185** (strip generated markers): the mutator that caused the original bug. This RFC adds a safety net behind it.
- **RFC-0235** (egress text normalization): another regex-based mutator that could theoretically damage HTML structure. This RFC guards against that.
- **Site OS operator model**: command scope is `app`, module placement is `packages/os/site-kernel-checks` (alongside other `dist.*` validators), pipeline integration is `build.post` after mutators.

## Design

### CLI surface

```sh
pnpm exec site-kernel run dist.html-structure.validate --site warpgogol-com
pnpm exec site-kernel run dist.html-structure.validate --site warpgogol-com --json
```

Scope: `app`. Flags: `--site` (or `--app`), `--json`, `--dry-run`.

### TypeScript contracts

```ts
interface HtmlStructureViolation {
  file: string;
  rule: string;
  tag: string;
  openCount: number;
  closeCount: number;
  message: string;
}

interface HtmlStructureValidateResult {
  command: "dist.html-structure.validate";
  status: "pass" | "fail";
  filesScanned: number;
  violations?: HtmlStructureViolation[];
}
```

### Structural tags checked

The following non-void structural elements are checked for open/close balance:

`<main>`, `<header>`, `<nav>`, `<footer>`, `<section>`, `<article>`, `<aside>`, `<body>`, `<head>`, `<form>`, `<figure>`, `<details>`, `<dialog>`, `<template>`.

Void elements (`<br>`, `<img>`, `<input>`, etc.) and self-closing elements are excluded by design — they have no closing tag.

### Tag counting algorithm

For each `.html` file in `dist/client/`:

0. Strip HTML comments (`<!-- ... -->`) from the file content before counting. This prevents false positives from `<tag>`-like strings inside comments.
1. Count opening tags: `<tag` followed by optional attributes and `>` (not `</tag>`).
2. Count closing tags: `</tag>`.
3. If `openCount !== closeCount` for any structural tag, emit a violation.

The algorithm uses a regex per tag: `<tag\b[^>]*>` for openings (excluding `</tag>`), `</tag>` for closings. This is deliberately lightweight — no DOM parsing, no tree construction. Self-closing variants (`<tag ... />`) of non-void structural elements do not appear in valid HTML5 and are counted as opening tags — this is correct behavior since browsers treat `<main />` as `<main>` (opening tag).

### File system responsibilities

| Path | Role |
| --- | --- |
| `<app>/dist/client/**/*.html` | Scanned for tag balance violations |
| `packages/os/site-kernel-checks/src/dist-html-structure.ts` | Command handler |
| `packages/os/site-kernel-checks/src/command-tables/09-build-artifacts.ts` | Command registration |
| `packages/os/site-kernel-checks/src/pipelines/build-post.ts` | Pipeline integration |
| `packages/os/site-kernel-checks/AGENTS.md` | Module table entry for `src/dist-html-structure.ts` |

### Pipeline integration

The command is inserted into `SITES_BUILD_POST_PIPELINE` after all mutators and before `SITES_CHECK_POSTBUILD_PIPELINE`:

```
{ command: "dist.generated-marker.strip" },
{ command: "text.normalize.apply" },
{ command: "dist.html-structure.validate" },  // NEW — guard after mutators
...SITES_CHECK_POSTBUILD_PIPELINE,
```

### Output format

```json
{
  "command": "dist.html-structure.validate",
  "status": "fail",
  "filesScanned": 1518,
  "violations": [
    {
      "file": "dist/client/open-source/index.html",
      "rule": "HTML-STRUCT-01",
      "tag": "main",
      "openCount": 0,
      "closeCount": 1,
      "message": "Tag <main> has 0 opening and 1 closing tags — structural imbalance detected"
    }
  ]
}
```

### Failure modes

- **Tag imbalance detected**: exit code 1, one diagnostic per violating file/tag pair. Pretty mode prints `[ERROR] HTML-STRUCT-01 · <file> · <message>`.
- **No dist/client directory**: exit code 0 with a skip message (same pattern as `dist.generated-marker.validate`).
- **No violations**: exit code 0 with `filesScanned` count.
- **--dry-run**: scans and reports but does not modify files (this command never modifies files — it is read-only — but `--dry-run` suppresses the pipeline cache write).

## Rollout

- **Default behavior**: fail-hard from day one. A structural imbalance is always a bug — there is no legitimate reason for mismatched structural tags in production HTML.
- **Existing apps**: no migration needed. A correct build already produces balanced tags. If an existing build fails, it indicates a real bug that should be fixed.
- **New apps**: automatically compliant — the check is in the shared `build.post` pipeline used by all sites.
- **No deprecation path**: this is a new command, not a replacement.
- **Pipeline integration**: added to `SITES_BUILD_POST_PIPELINE` between mutators and the existing postbuild validation pipeline.

## Alternatives considered

1. **Pre/post snapshot diff**: snapshot tag counts before mutators, compare after. More precise (detects which mutator caused the damage) but requires storing intermediate state and adding a pre-mutator snapshot step. Rejected: final-state tag balance catches the same bugs with simpler implementation.

2. **Full HTML parser validation**: use parse5 to parse each HTML file and detect structural errors. More robust but significantly slower (1518 files) and adds a parser dependency to the build pipeline. Rejected: lightweight tag counting is sufficient for the specific class of bug (tag removal by regex mutators).

3. **Landmark presence check**: verify each page contains `<main>`. Catches the specific accessibility violation but requires knowledge of which landmarks each page should have (page-specific). Rejected: tag balance is more general and catches the same bug without per-page configuration.

## Risks

- **False positives**: HTML comments containing `<tag>`-like strings could be counted as opening tags. Mitigation: the tag-counting regex requires `<tag\b` (word boundary after tag name) and ignores content inside HTML comments by stripping comments before counting.
- **False positives from attribute values**: tag-like strings inside attribute values (e.g. `<div data-content="<main>">`) could be counted as opening tags. Mitigation: this is extremely unlikely in practice — attribute values rarely contain structural tag names. The regex-based approach accepts this trade-off over a full HTML parser (see Alternatives considered).
- **Performance**: scanning 1518 HTML files with regex per tag. Mitigation: the regex operations are O(n) per file and the structural tag list is small (~13 tags). Expected total time: <1s for a typical site.
- **Agent misinterpretation**: agents might think this command validates accessibility landmarks. It does not — it only checks tag balance. Accessibility validation is Axiom's responsibility.
- **Maintenance burden**: low. The structural tag list is stable (HTML5 structural elements rarely change). New void elements or structural elements would require updating the list, but this is a rare event.

## Acceptance criteria

- [ ] `dist.html-structure.validate` command registered in `packages/os/site-kernel-checks/src/command-tables/09-build-artifacts.ts` with `reads: ["<app>/dist/client/**"]` and `cacheable: true`
- [ ] Command handler implemented in `packages/os/site-kernel-checks/src/dist-html-structure.ts` with `runDistHtmlStructureValidate` function
- [ ] Command checks tag balance for structural non-void elements: `<main>`, `<header>`, `<nav>`, `<footer>`, `<section>`, `<article>`, `<aside>`, `<body>`, `<head>`, `<form>`, `<figure>`, `<details>`, `<dialog>`, `<template>`
- [ ] HTML comments are stripped before counting to avoid false positives from `<tag>`-like strings inside comments
- [ ] Command integrated into `SITES_BUILD_POST_PIPELINE` after `text.normalize.apply` and before `SITES_CHECK_POSTBUILD_PIPELINE`
- [ ] `--json` output shape matches `HtmlStructureValidateResult` interface with `violations[]` containing `file`, `rule`, `tag`, `openCount`, `closeCount`, `message`
- [ ] Unit tests in `packages/os/site-kernel-checks/src/tests/dist-html-structure.test.ts` cover: balanced HTML passes, missing opening tag fails, missing closing tag fails, void elements ignored, HTML comments with tag-like strings do not cause false positives
- [ ] Existing apps pass `dist.html-structure.validate` on a clean build without changes
- [ ] `rfc.validate` passes on this file before merging

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
- The command handler MUST be a pure function + thin kernel handler split (same pattern as `runPlaywrightChromiumEnsure` / `ensureChromium` in RFC-0647) so the tag-balance logic is testable without kernel types.
- The structural tag list is defined as a `const readonly string[]` in the handler file — agents MUST NOT add void elements to this list.
- HTML comment stripping before counting is MANDATORY — without it, `<main>` inside a `<!-- comment -->` would cause false positives.
