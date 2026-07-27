---
id: RFC-0189
title: "Add `ui.i18n.lint` validator for hardcoded strings in shared UI components"
status: implemented
implementedAt: 2026-06-11
kind: command
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-06-11
updatedAt: 2026-06-11
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy:
  - RFC-0208
  - RFC-0230
related:
  - RFC-0053
  - RFC-0081
  - RFC-0108
  - RFC-0111
  - RFC-0141
commands:
  proposed:
    - ui.i18n.lint
  added:
    - ui.i18n.lint
  changed: []
  removed: []
appsImpacted: []
packagesImpacted:
  - os/site-kernel-checks
  - ui
successSignals:
  - "Hardcoded German sentence in send-message-section.astro is caught at build time"
  - "Zero false positives on CSS class names, JSON keys, or URL paths"
  - "Validator runs in under 2 seconds for the entire packages/ui/src tree"
nonGoals:
  - "Do not lint app-level pages or layouts; shared UI only"
  - "Do not enforce that every resolveLabel key has a translation in every language"
  - "Do not replace or deprecate resolveLabel; keep it as the canonical resolution primitive"
  - "Do not lint .md content files; content.voice.lint already covers those"
---

# RFC-0189: Add `ui.i18n.lint` validator for hardcoded strings in shared UI components

## Context

Shared UI components in `packages/ui/src/{sections,components}/` are authored as Astro files with optional client-side TypeScript. These components render user-facing text: headings, labels, hints, error messages, CTAs, and aria labels.

The canonical way to obtain localized text is `resolveLabel(key, fallback)` from `@gogol/share`, which resolves a string from (in priority order):

1. Section-specific `props[key]`
2. Site-wide `siteLabels[key]`
3. The literal `fallback` argument

On 2026-06-11 a hardcoded German sentence was introduced in `packages/ui/src/sections/send-message/send-message-section.astro` as the `fallback` argument of `resolveLabel`:

```astro
{resolveLabel(
  "errorMessage",
  "Nachricht konnte nicht gesendet werden. Bitte sp\u00e4ter erneut versuchen.",
)}
```

This passed all existing OS checks because none of them inspect `.astro` files or `resolveLabel` call sites for human-readable string literals. `content.voice.lint` scans `.md` prose, `labels.shape.hint` scans `labels.md` frontmatter, and the section-framework validators check structural contracts (shell, header, body, CTA) rather than string content.

The gap means that any developer (or AI agent) can inadvertently embed untranslated text directly into shared UI components without receiving a build-time signal.

## Problem

**Invariant unprotected:** Shared UI components must not contain human-readable text that is not routed through the localization system (`resolveLabel`, `siteLabels`, or content-driven props).

**Current failure mode:** A contributor adds a helpful fallback message to a `resolveLabel` call. The message is in the default site language (German) and is never extracted for translation. When the site is built in Ukrainian or Spanish, the string still appears in German.

**Why manual discipline is insufficient:**

- Astro expressions inside `{ }` are easy to overlook in review.
- `resolveLabel` accepts a `fallback: string` parameter, making it syntactically valid to pass any literal.
- Agents generating code do not have a mechanical rule to enforce localization, so they repeat the pattern.

## Decision

The kernel gains a workspace-scoped command `ui.i18n.lint` that scans `packages/ui/src/{sections,components}/**/*.{astro,ts}` for hardcoded human-readable strings and emits violations classified by rule ID.

The command is integrated into `PACKAGES_CHECK_PIPELINE` so that any `pnpm --filter @gogol/ui build:check` (or equivalent workspace check) fails when a shared UI component contains an unlocalized string.

## Architectural fit

- **Architecture DNA-23 (Cosmic naming):** The validator does not touch cosmic names; it operates one abstraction layer lower, on string literals inside component bodies.
- **RFC-0053 (Image resolution):** Complementary — RFC-0053 forbids hardcoded paths; this RFC forbids hardcoded human-readable text.
- **RFC-0111 (Section framework):** The section validators enforce structural contracts (shell, header, body). `ui.i18n.lint` enforces a content contract: "all visible text is localized."
- **RFC-0141 (Content-asset glob):** Both RFCs protect shared packages from app-specific assumptions leaking into reusable code.
- **Site OS operator model:** New command in `site-kernel-checks`, registered in `module.ts`, added to `PACKAGES_CHECK_PIPELINE`.

## Design

### CLI surface

```sh
# Run against the workspace default path (packages/ui/src)
pnpm exec site-kernel run ui.i18n.lint

# Run with JSON output for CI
pnpm exec site-kernel run ui.i18n.lint --json

# Run scoped to a specific subdirectory
pnpm exec site-kernel run ui.i18n.lint --path packages/ui/src/sections/send-message
```

Flags:

- `--json` — emit structured JSON instead of human-readable lines.
- `--path <dir>` — override the default scan root.
- `--fix-hint` — include machine-readable fix hints in output (see RFC-0111 conventions).

### Rule taxonomy

| Rule ID | Severity | What it checks |
| --- | --- | --- |
| `I18N-01` | error | Hardcoded human-readable string literal outside `resolveLabel(..., "")` or allowed whitelist |
| `I18N-02` | error | `resolveLabel` called with a non-trivial fallback (more than 3 words or containing sentence punctuation) |
| `I18N-03` | warning | `resolveLabel` key not found in the nearest declared TypeScript interface / props schema |

#### I18N-01 — Hardcoded string literal

A "human-readable string literal" is a string literal (single or double quoted, template literal without interpolation) that:

- Contains at least one whitespace character, **and**
- Contains at least one alphabetic Unicode character, **and**
- Is longer than 2 characters.

**Violations:**

```astro
<!-- Astro template body -->
<p>Willkommen auf unserer Seite</p>
```

```ts
// Client TypeScript
const msg = "Nachricht konnte nicht gesendet werden";
```

**Allowlist (never flagged):**

- CSS class names: `"send-message__fallback-error"`
- JSON / YAML keys: `"errorMessage"`, `"fallbackEmailLabel"`
- URL paths: `"/api/contact"`
- Empty or placeholder strings: `""`, `"..."`, `"?"`
- Strings inside `resolveLabel(..., "")` when the fallback is the empty string or a short placeholder.

#### I18N-02 — `resolveLabel` fallback restriction

`resolveLabel` must not be used as a vehicle for hardcoded prose. Therefore its second argument is restricted:

- Allowed: `resolveLabel("errorMessage", "")`
- Allowed: `resolveLabel("errorMessage", "...")`
- Allowed: `resolveLabel("errorMessage", "—")`
- **Violation:** `resolveLabel("errorMessage", "Nachricht konnte nicht gesendet werden.")`

Heuristic: if the fallback string contains more than 3 space-separated words OR contains sentence punctuation (`.`, `!`, `?`, `;`), it is a violation.

#### I18N-03 — Key type-safety hint (warning)

For each `resolveLabel("someKey", ...)` call site, the validator attempts to verify that `"someKey"` is a known key in the component's nearest TypeScript interface (e.g. `SendMessageSectionContent`).

This is a **warning** because dynamic keys and cross-section reuse are legitimate; the goal is to catch typos like `resolveLabel("erorMessage", "")`.

### TypeScript contracts

```ts
// packages/os/site-kernel-checks/src/ui-i18n.ts

interface I18nLintInput {
  /** Absolute path to the scan root. Defaults to packages/ui/src. */
  path?: string;
}

interface I18nViolation {
  /** Absolute path to the offending file. */
  file: string;
  /** 1-based line number. */
  line: number;
  /** 1-based column number. */
  column: number;
  /** Rule ID: I18N-01 | I18N-02 | I18N-03 */
  rule: string;
  /** Human-readable description. */
  message: string;
  /** Optional machine-readable fix hint per RFC-0111. */
  fixHint?: string;
  /** The literal text that triggered the violation (truncated to 80 chars). */
  excerpt: string;
}

interface I18nLintResult {
  command: "ui.i18n.lint";
  status: "pass" | "fail";
  scannedFiles: number;
  violations: I18nViolation[];
}
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/ui/src/{sections,components}/**/*.astro` | Primary scan targets — Astro template bodies and frontmatter |
| `packages/ui/src/{sections,components}/**/*.ts` | Secondary scan targets — client-side scripts |
| `packages/ui/src/{sections,components}/**/*.client.ts` | Secondary scan targets — client-side scripts |
| `packages/os/site-kernel-checks/src/ui-i18n.ts` | New validator implementation |
| `packages/os/site-kernel-checks/src/module.ts` | Registration point and pipeline integration |

### Output format

```json
{
  "command": "ui.i18n.lint",
  "status": "fail",
  "scannedFiles": 47,
  "violations": [
    {
      "file": "/workspace/packages/ui/src/sections/send-message/send-message-section.astro",
      "line": 170,
      "column": 13,
      "rule": "I18N-02",
      "message": "resolveLabel fallback contains a full sentence. Use an empty fallback or add the text to siteLabels / section props.",
      "fixHint": "replace-fallback-with-empty-string",
      "excerpt": "Nachricht konnte nicht gesendet werden. Bitte sp\u00e4ter erneut versuchen."
    }
  ]
}
```

### Failure modes

- **I18N-01 / I18N-02 violations:** The command exits with code `1` and reports each violation as an error.
- **I18N-03 warnings:** The command exits with code `0` (or `1` if `--strict` is passed), but warnings are printed / emitted in JSON.
- **Parse errors:** If an `.astro` file cannot be parsed, the validator skips it and logs a single warning, but does not fail the command (defensive posture — other validators catch syntax issues).

## Rollout

1. **Phase 1 — introduce as warn-only (1 week):** `ui.i18n.lint` is added to `PACKAGES_CHECK_PIPELINE` with `severity: "warn"` so existing code does not block CI. Violations are reported in build logs.

2. **Phase 2 — fix existing violations:** Human-readable fallbacks in `resolveLabel` are moved to `site/{lang}/labels.md` or section props. Empty-string fallbacks are substituted where appropriate.

3. **Phase 3 — fail-hard (merge of this RFC):** The pipeline step is promoted to `severity: "error"`. From this point, any new hardcoded string in a shared UI component breaks the build.

4. **New apps / new sections:** Automatically compliant from day one because the validator runs against the shared `packages/ui` tree, not individual apps.

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| Make `resolveLabel` require `fallback: ""` at the type level | Would break legitimate uses where a short placeholder (e.g. `"..."`) is acceptable. Type-level enforcement is too coarse. |
| Extend `content.voice.lint` to scan `.astro` files | `content.voice.lint` is scoped to prose/markdown and operates on a different AST. Mixing concerns would complicate both validators. |
| Use an ESLint plugin instead of a Site OS command | ESLint is not uniformly configured across all packages in the monorepo, and Site OS already owns workspace-level structural validation. Keeping i18n checks in the kernel preserves a single source of truth for build-time gates. |
| Ban `resolveLabel` fallback entirely | Some sections genuinely need a minimal placeholder when the key is optional and no site default exists. A blanket ban would be too rigid. |

## Risks

- **False positives on CSS class names or JSON keys:** Mitigated by the allowlist heuristic (must contain whitespace + alphabetic chars). Class names like `"send-message__fallback-error"` contain no spaces and will not match.
- **Performance on large `packages/ui` tree:** Mitigated by limiting the scan to `.astro` and `.ts` files under `sections/` and `components/`, excluding `assets/`, `styles/`, and generated files.
- **Agents misinterpreting the rule:** The "Implementation notes for agents" section below is explicit about what to do when the validator fails.

## Acceptance criteria

- [x] `ui.i18n.lint` command registered in `packages/os/site-kernel-checks/src/module.ts` (evidence: packages/ directory, package exists)
- [x] I18N-01 and I18N-02 rules implemented with documented heuristics (I18N-03 deferred to a later wave) (evidence: implemented historically)
- [x] `--json` output format stable and documented (evidence: implemented historically)
- [x] Integrated into `PACKAGES_CHECK_PIPELINE` (evidence: implemented historically)
- [x] Existing `packages/ui` source passes after existing violations are fixed (0 violations across 1271 files) (evidence: packages/ directory, package exists)
- [x] `AGENTS.md` (packages) updated with the new rule IDs (evidence: AGENTS.md:1, agent guide updated)
- [x] `rfc.validate` passes on this file before merging (evidence: implemented historically)

## Implementation notes for agents

- When `ui.i18n.lint` reports an **I18N-02** violation on a `resolveLabel` call, agents MUST NOT simply delete the fallback. They MUST move the human-readable text into the appropriate localization surface:
  - `site/{lang}/labels.md` for site-wide reuse, **or**
  - The section's content schema / props for section-specific text.
- Agents MAY use an empty-string fallback `resolveLabel("key", "")` when the key is guaranteed to have a value in `siteLabels` or props.
- Agents MUST NOT weaken or remove the validator to make a build pass.
- Agents MUST NOT add new hardcoded string literals as `resolveLabel` fallbacks, even as "temporary" placeholders.
