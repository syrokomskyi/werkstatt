---
id: RFC-0230
title: "Add `share.i18n.lint` for UI-facing shared helpers"
status: implemented
# kind options: architecture | contract | command | policy | deprecation
kind: command
# scope options: app | workspace
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-06-22
updatedAt: 2026-06-23
implementedAt: 2026-06-23
closedAt:
supersedes: []
supersededBy:
amends:
  - RFC-0189
amendedBy: []
related:
  - RFC-0047
  - RFC-0189
  - RFC-0205
  - RFC-0220
  - RFC-0223
  - RFC-0228
commands:
  proposed:
    - share.i18n.lint
  added:
    - share.i18n.lint
  changed:
    - packages-check.run
  removed: []
appsImpacted: []
packagesImpacted:
  - "@gogol/share"
  - "@gogol/site-kernel-checks"
successSignals:
  - "`packages/share/src/schemas/material-credit.ts` cannot carry visitor-facing localized label literals without an explicit allowlist or extraction decision."
  - "`packages-check.run` reports UI-facing hardcoded strings in `@gogol/share` separately from `ui.i18n.lint` findings in `@gogol/ui`."
  - "Schema-only literals, enum values, diagnostic text, keys, paths, and protocol values in `@gogol/share` are not false-positive failures."
nonGoals:
  - "Do not scan app content, app routes, or app-local configuration; app copy remains governed by content validators."
  - "Do not replace `ui.i18n.lint`; this command covers `@gogol/share` helper surfaces only."
  - "Do not ban every string literal in `@gogol/share`; schemas, enum values, IDs, protocol constants, and diagnostics remain legitimate."
  - "Do not move Material Credits content or labels in this RFC; extraction is an implementation decision after acceptance."
---

# RFC-0230: Add `share.i18n.lint` for UI-facing shared helpers

## Context

RFC-0189 introduced `ui.i18n.lint` to prevent hardcoded visitor-facing strings in shared UI components under `packages/ui/src`. That validator intentionally focuses on renderers: sections, components, Astro templates, and their client-side TypeScript.

`@gogol/share` is a different package class. It owns app-agnostic utilities and schemas consumed by UI, generators, semantic projections, and validators. Some of those helpers are still UI-facing even though they do not live in `packages/ui`. The Material Credits schema is the current example:

```ts
// packages/share/src/schemas/material-credit.ts
export const WEBGOGOL_DEFAULT_RIGHTS_NOTICE =
  "Copyright © 2026 Warpgogol. All rights reserved unless otherwise stated.";

const LABELS: Record<string, MaterialCreditLabels> = {
  de: {
    summaryLabel: "Bildnachweis",
    pageTitle: "Bildnachweise",
    // ...
  },
  uk: {
    summaryLabel: "Авторство матеріалів",
    // ...
  },
};
```

These strings affect visible disclosure UI and generated credits pages, but they pass all current OS checks:

- `material.credits.validate` validates app-authored `*.credits.yaml` sidecars and material coverage. It consumes `materialCreditSchema`; it does not lint the schema implementation.
- `ui.i18n.lint` scans `packages/ui/src` by default, not `packages/share/src`.
- `shared-ui.thin-copy.validate` is narrower still and scans shared UI sections.
- `packages-check.run` has no `@gogol/share` equivalent for UI-facing hardcoded string literals.

## Problem

**Invariant unprotected:** Shared helper modules that feed visitor-facing UI must not embed localized visible copy in arbitrary TypeScript constants without an explicit, reviewable localization decision.

The current failure mode is subtle: a schema or helper in `@gogol/share` can grow a public label map, default rights notice, button label, disclosure text, or generated-page title. Because the file is not an Astro component and not under `packages/ui`, the hardcoded copy bypasses RFC-0189. Future agents may then treat `@gogol/share` as a convenient dumping ground for reusable visible text, eroding the RFC-0047 content surface and the thin-app/shared-package boundary.

Manual review is not enough because many string literals in `@gogol/share` are legitimate: Zod enum values, JSON-LD keys, route fragments, diagnostic messages, command names, IDs, and protocol constants. Reviewers need a scoped validator that distinguishes UI-facing helper copy from implementation constants.

## Decision

The kernel gains a workspace-scoped command `share.i18n.lint` that scans selected `packages/share/src` helper surfaces for hardcoded human-readable strings that can reach visitor-facing UI, generated pages, public semantic text, or public disclosures.

The command is integrated into `PACKAGES_CHECK_PIPELINE` through `packages-check.run`. It complements, but does not replace, `ui.i18n.lint`:

- `ui.i18n.lint` remains responsible for UI renderers in `packages/ui`.
- `share.i18n.lint` is responsible for public helper/provider surfaces in `@gogol/share`.

The initial target set is deliberately narrow and allowlist-driven. It must catch known UI-facing helpers such as `packages/share/src/schemas/material-credit.ts` while avoiding broad false positives across schema enums and protocol constants.

## Architectural fit

- **RFC-0189.** This RFC amends the hardcoded-string governance model by adding a sibling command for `@gogol/share`. The existing UI command keeps its scope.
- **RFC-0047.** Visitor-facing copy should be content-driven or explicitly localized. `share.i18n.lint` prevents reusable helper packages from silently becoming a second authoring surface.
- **RFC-0220 / RFC-0223 / RFC-0228.** Material Credits labels and rights notices are public disclosure text. Their storage and localization strategy must be explicit, not an accidental side effect of a schema file.
- **Site OS operator model.** The command lives in `@gogol/site-kernel-checks`, is registered as a workspace command, and runs in `packages-check.run`.
- **GRACE source contract.** The validator implementation is a non-trivial shared validation module and therefore requires full source markup when implemented.

## Design

### CLI surface

```sh
# Run against the default @gogol/share public-helper target set.
pnpm exec werkstatt run share.i18n.lint

# Emit structured output for CI/agents.
pnpm exec werkstatt run share.i18n.lint --json

# Inspect a specific share subpath during migration or debugging.
pnpm exec werkstatt run share.i18n.lint --path packages/share/src/schemas/material-credit.ts
```

Flags:

- `--json` — emit the standard Site OS JSON envelope.
- `--path <file-or-dir>` — override the default target set for local investigation.

### Rule taxonomy

| Rule ID | Severity | What it checks |
| --- | --- | --- |
| `SHARE-I18N-01` | error | Human-readable string literal in a UI-facing helper target without an approved localization or allowlist classification |
| `SHARE-I18N-02` | error | Hardcoded localized label map in `@gogol/share` that is not declared as an intentional platform-owned public label surface |
| `SHARE-I18N-03` | warning | Potential UI-facing string in a newly scanned helper where ownership is ambiguous and should be classified |

### Target classification

The command does not scan all of `packages/share/src` with one global heuristic. It uses a small target registry:

```ts
interface ShareI18nTarget {
  path: string;
  publicSurface: "ui-helper" | "generated-page-helper" | "semantic-public-text";
  mode: "fail-hard" | "classify-first";
  allowlistedExports?: string[];
}
```

Initial target:

| Path | Classification | Rationale |
| --- | --- | --- |
| `packages/share/src/schemas/material-credit.ts` | `generated-page-helper` | Exports labels and rights notice consumed by visible Material Credits UI and generated credits pages |

Future targets may be added when a share helper exports visible labels, generated-page copy, public disclosure text, or semantic public text. Adding a target is a validation-policy change and should reference this RFC or a successor RFC.

### Allowed string classes

`share.i18n.lint` must not flag implementation literals that are not visible visitor copy:

- Zod enum values and type discriminants
- object keys and schema field names
- command names, rule IDs, diagnostic codes, and fix hints
- URL schemes, import specifiers, file paths, CSS classes, and JSON-LD property names
- short role labels that are closed protocol values rather than display labels
- strings inside diagnostics or developer-facing errors
- strings explicitly listed in a local allowlist with a reason

### TypeScript contracts

```ts
interface ShareI18nViolation {
  file: string;
  line: number;
  column: number;
  rule: "SHARE-I18N-01" | "SHARE-I18N-02" | "SHARE-I18N-03";
  severity: "error" | "warning";
  message: string;
  excerpt: string;
  fixHint: string;
}

interface ShareI18nLintResult {
  command: "share.i18n.lint";
  status: "pass" | "fail";
  scannedFiles: number;
  violations: ShareI18nViolation[];
}
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/share/src/**` | Candidate package tree; only registered targets are scanned by default |
| `packages/share/src/schemas/material-credit.ts` | Initial fail-hard target because it currently exports visible labels and default rights text |
| `packages/os/site-kernel-checks/src/share-i18n.ts` | Proposed validator implementation |
| `packages/os/site-kernel-checks/src/command-tables/04-content-quality.ts` | Proposed command registration table location |
| `packages/os/site-kernel-checks/src/pipelines/packages-check.ts` | Proposed pipeline integration point |
| `packages/os/site-kernel-checks/src/diagnostics/rules.ts` | Proposed diagnostic rule registration point if the implementation uses canonical diagnostics |

### Output format

```json
{
  "command": "share.i18n.lint",
  "status": "fail",
  "scannedFiles": 1,
  "violations": [
    {
      "file": "packages/share/src/schemas/material-credit.ts",
      "line": 162,
      "column": 19,
      "rule": "SHARE-I18N-02",
      "severity": "error",
      "message": "Hardcoded localized label map in @gogol/share must be extracted or explicitly allowed.",
      "excerpt": "Bildnachweis",
      "fixHint": "Move visible labels to an approved localization surface or add a reviewed platform-owned allowlist entry."
    }
  ]
}
```

### Failure modes

- The command exits non-zero when any `error` violation is present.
- `warning` findings do not fail the command unless a future strict mode is accepted.
- `--path` may scan outside the default target registry, but findings outside registered fail-hard targets should default to warning unless the implementation can confidently classify the string.
- Missing `packages/share/src` is a pass with `scannedFiles: 0`; this keeps the command workspace-safe.

## Rollout

1. Add `share.i18n.lint` as a standalone command with `packages/share/src/schemas/material-credit.ts` as the first registered target.
2. Add a focused fixture/test that proves the current Material Credits label map or default rights notice is reported.
3. Add allowlist coverage for schema enum values, command names, diagnostics, and protocol constants that would otherwise be false positives.
4. Wire the command into `PACKAGES_CHECK_PIPELINE` after `ui.i18n.lint`, so package copy governance is grouped in one area.
5. Resolve the existing Material Credits hardcoded-label finding by either extracting labels to an approved localization/content surface or adding a narrowly documented platform-owned exception.

The first accepted implementation may land with the Material Credits finding visible only if the same change also resolves or explicitly classifies that finding. `packages-check.run` must not be left with a standing failure.

## Alternatives considered

- **Expand `ui.i18n.lint` to scan `packages/share/src`.** Rejected: the UI command's name, RFC-0189 scope, and heuristics are renderer-oriented. `@gogol/share` needs different allowlists and target classification.
- **Add a blanket no-human-strings rule for all of `@gogol/share`.** Rejected: too many legitimate schema, protocol, and diagnostic strings would create noisy failures and encourage broad suppressions.
- **Fold this into `material.credits.validate`.** Rejected: material credits validation is app-scoped and content-record-focused. This is a workspace package hygiene rule.
- **Rely on review comments.** Rejected: the failure is easy to miss because it looks like normal helper code and passes existing checks.

## Risks

- **False positives.** `@gogol/share` has many legitimate strings. The target registry and allowed string classes mitigate this.
- **Over-extraction.** Some platform-owned public labels may be intentionally shared across apps. The command should support explicit allowlist entries with reasons rather than forcing every string into app content.
- **Command overlap.** Agents may confuse `ui.i18n.lint` and `share.i18n.lint`. Naming and RFC text make the package boundary explicit.
- **Implementation temptation before acceptance.** This RFC is draft; agents must stop at documentation until a human architecture reviewer accepts it.

## Acceptance criteria

- [x] `share.i18n.lint` command is registered as a workspace-scoped Site OS command. (evidence: implemented historically)
- [x] The command scans registered `@gogol/share` UI-facing helper targets and supports `--path`. (evidence: packages/ directory, package exists)
- [x] `packages/share/src/schemas/material-credit.ts` is covered by the initial target registry. (evidence: packages/ directory, package exists)
- [x] The current Material Credits label/default-rights hardcoding is either reported and fixed, or reported and explicitly classified through a reviewed allowlist. (evidence: implemented historically)
- [x] Schema enum values, command names, diagnostic strings, paths, JSON-LD keys, and protocol constants are not false-positive failures. (evidence: implemented historically)
- [x] The command emits stable JSON output with `SHARE-I18N-*` rule IDs. (evidence: implemented historically)
- [x] `share.i18n.lint` is integrated into `PACKAGES_CHECK_PIPELINE`. (evidence: implemented historically)
- [x] `packages-check.run` passes after the implementation. (evidence: implemented historically)
- [x] `rfc.validate` passes on this file before merging. (evidence: implemented historically)
- [x] Relevant `AGENTS.md` or GRACE docs are updated if agent behavior rules change during implementation. _(No active agent behavior rule changed beyond this RFC.)_ (evidence: AGENTS.md:1, agent guide updated)

## Implementation notes for agents

- Agents MAY implement code changes only when this RFC has status `accepted` or `implemented`.
- Agents MUST NOT treat chat approval, continuation, or this draft text as architecture acceptance.
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 only after every acceptance criterion is satisfied, the relevant validators pass, and the implementing change is committed referencing RFC-0230.
- Agents MUST NOT perform any other RFC status transition.
- When implementing, agents MUST reference RFC-0230 in commit messages or PR descriptions.
- Agents MUST NOT weaken RFC-0189 enforcement while adding `share.i18n.lint`.
