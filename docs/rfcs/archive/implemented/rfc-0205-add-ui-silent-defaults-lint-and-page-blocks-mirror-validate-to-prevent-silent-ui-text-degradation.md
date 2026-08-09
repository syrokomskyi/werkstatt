---
id: RFC-0205
title: "Add `ui.silent-defaults.lint` and `page.blocks.mirror.validate` to prevent silent UI text degradation"
status: implemented
kind: command
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-06-18
updatedAt: 2026-06-18
implementedAt: 2026-06-18
closedAt:
supersedes: []
supersededBy:
amends:
  - RFC-0026
  - RFC-0095
  - RFC-0108
  - RFC-0110
amendedBy: []
related:
  - RFC-0042
  - RFC-0047
  - RFC-0048
  - RFC-0138
commands:
  proposed:
    - page.blocks.mirror.validate
    - ui.silent-defaults.lint
  added:
    - page.blocks.mirror.validate
    - ui.silent-defaults.lint
  changed:
    - page.block.validate
  removed: []
appsImpacted:
  - nicaragua-projekt
  - warpgogol-com
packagesImpacted:
  - os/site-kernel-checks
  - ontology
  - ui
successSignals:
  - "`ui.silent-defaults.lint` reports zero violations across packages/ui/src"
  - "`page.blocks.mirror.validate` reports zero violations for every localized twin pair"
  - "Removing `labels` from a donation-card block causes `page.block.validate` B-03 to fail before build"
  - "Empty `title: \"\"` in any block label causes B-03 to fail with minLength violation"
nonGoals:
  - "Do not lint app-level Astro pages or layouts; shared UI components and sections only"
  - "Do not replace `need.markers.validate`; it remains the canonical guard for `NEED_THIS_*` business-data leakage"
  - "Do not enforce that every optional string prop has a non-empty value; only UI-visible labels and headings"
  - "Do not add runtime validation; all checks are static / author-time"
---

# RFC-0205: Add `ui.silent-defaults.lint` and `page.blocks.mirror.validate` to prevent silent UI text degradation

## Context

Shared UI components in `packages/ui/src/{sections,components}/` receive localized text through two parallel channels:

1. **Business data** — `companyName`, `iban`, `bankName` — resolved from `src/content/business/{lang}/legal.md` via section-level `getEntry` calls, with `"NEED_THIS_"` fallback (RFC-0042) that is caught post-build by `need.markers.validate` (RFC-0095).
2. **UI labels** — `title`, `ibanLabel`, `copyButtonLabel`, `qrCodeButtonLabel` — passed as nested `labels` objects inside `blocks[].props`. These are pure UI chrome, not business data, and therefore never pass through `need()`.

On 2026-06-18 the `donation-card` section on `apps/nicaragua-projekt/spenden-kontakt` lost all its UI labels: title disappeared, "IBAN" / "BIC" / "BANK" headings vanished, the copy button showed no text, and the QR-code button became an icon-only square. The page was still renderable — no build error, no runtime exception — but the user experience degraded silently.

The root cause was that `packages/ui/src/components/donation-card/donation-card-component.astro` contained:

```astro
const defaultContent: DonationCardComponentContent = {
  title: "",
  ibanLabel: "",
  // … 15 more empty strings …
};
const content = contentOverride ?? defaultContent;
```

When the content author removed `labels` from the page block (or when the localized twin had an empty `props: {}`), the component silently rendered empty `<span>` and `<div>` elements instead of failing. No existing validator caught this:

- `page.block.validate` (RFC-0026, B-03) validated `props` against the section manifest's `propsSchema`, but `labels` was **not declared** in the schema, so empty `props: {}` passed cleanly.
- `need.markers.validate` (RFC-0095) scans built HTML for `NEED_THIS_` — but the component never emitted that string; it emitted `""`.
- `content.coverage.validate` (RFC-0073) checks atom placement against onboarding artifacts, not per-block prop depth.

This is not a one-off bug. An audit of `packages/ui/src` found the same `?? ""` / `= ""` / `defaultContent` pattern in at least 11 files (`article-list-section.astro`, `section-card-grid.astro`, `passport-score-grid-component.astro`, `hero-section.astro`, `section-stats.astro`, etc.), all with the same silent-degradation risk.

A second, compounding factor is `deepMergeEntryData` behavior in `@gogol/share/src/content/merge.ts`: when a localized content file (e.g. `pages/en/donate-contact.md`) declares its own `blocks` array, the default-language `blocks` array is **replaced wholesale**, not merged per-element. Any missing props inside localized blocks do NOT fall back to default-language values. This means a localized twin that looks structurally correct (`blocks[].type` matches) can still be missing nested props (`labels`, `effects`, `background`) without any validator noticing.

## Problem

Three gaps in the current validation surface allow UI text to vanish without triggering a build or CI failure:

1. **Component-level silent defaults.** Shared UI components use `?? ""` or `defaultContent` objects with empty-string values as fallback for user-facing text props. This makes the component "work" (no crash) while producing invisible or broken UI.
2. **Manifest schema under-declaration.** Section manifest `propsSchema` lists business-override props (`iban`, `companyName`) but omits the nested `labels` object, or marks it optional. `page.block.validate` B-03 therefore has no contract to enforce.
3. **Localized twin prop drift.** Because `deepMergeEntryData` replaces arrays wholesale, a localized page can drop nested props that exist in its default-language twin, and no validator compares the two files block-by-block.

## Decision

Introduce two new Site OS commands and tighten the existing `page.block.validate` schema contract so that missing or empty UI labels are caught at author-time, before `astro build`.

### A. `ui.silent-defaults.lint` — AST-grade lint for empty-string fallbacks in shared UI

A workspace-scoped static linter that scans `packages/ui/src/{components,sections}/**/*.{astro,ts}` for patterns that silently substitute empty strings on user-facing text props.

**Patterns detected (fail-hard):**

| Pattern | Example | Severity | | --- | --- | --- | --- | --- | --- | --- | | `const defaultContent = { prop: "" }` | `const defaultContent = { title: "" }` | **error** | | `prop ?? ""` on string-typed UI text | `emptyLabel ?? ""` | **error** | | `prop = ""` in destructuring | `const { title = "" } = props` | **error** | | `prop |  | ""` on string-typed UI text | `heading |  | ""` | **error** |

**Exemptions (never flagged):**

- Data attributes: `data-prefix={stat.prefix ?? ""}` — these are not human-readable text.
- CSS class names, JSON keys, URL paths, aria labels that are structural (not content).
- Numeric / boolean props: `decimals ?? 0`, `isAnimated ?? false`.

The linter uses a **deny-list of prop names** combined with **type inference** (where available) to reduce false positives. The initial deny-list is derived from a one-time audit of all `?? ""` occurrences in `packages/ui/src`.

**Output format:**

```json
{
  "command": "ui.silent-defaults.lint",
  "status": "fail",
  "violations": [
    {
      "file": "packages/ui/src/sections/article-list/article-list-section.astro",
      "line": 64,
      "rule": "SILENT-DEFAULT-01",
      "severity": "error",
      "message": "Empty-string fallback on UI-visible prop `emptyLabel` (pattern: `?? \"\"`) — renders invisible text instead of failing",
      "fixHint": "Remove `?? \"\"`; declare `emptyLabel` as required in section manifest propsSchema with minLength: 1"
    }
  ]
}
```

### B. `page.blocks.mirror.validate` — block-by-block prop parity for localized twins

An app-scoped validator that compares each localized page (`pages/{lang}/*.md`) with its default-language twin (`pages/de/*.md`) block-by-block.

**Rules:**

1. For every block in the default-language page, the localized twin must contain a block at the same index with:
   - identical `type`
   - identical `id` (when present)
2. For every nested prop key inside `blocks[].props`, if the key exists in the default-language block, it **must also exist** in the localized block — unless the localized block explicitly overrides with a non-empty value.
3. The `labels` object, if present in the default-language block, **must also be present** in the localized block, and every key inside `labels` that is declared `required` in the manifest schema must be present and non-empty.

**Important:** This validator does NOT require that localized twins be identical clones. It only catches **missing keys** that exist in the default-language source. Adding new keys in the localized version is allowed.

**Output format:**

```json
{
  "command": "page.blocks.mirror.validate",
  "status": "fail",
  "violations": [
    {
      "file": "apps/nicaragua-projekt/src/content/pages/en/donate-contact.md",
      "defaultTwin": "apps/nicaragua-projekt/src/content/pages/de/donate-contact.md",
      "blockIndex": 0,
      "blockId": "donation-card",
      "rule": "MIRROR-02",
      "severity": "error",
      "message": "Localized block is missing prop `labels` that exists in default-language twin",
      "fixHint": "Copy the `labels` object from the DE twin into the EN block, then translate each value"
    }
  ]
}
```

### C. Tighten `propsSchema` in section manifests for `labels` contracts

Every section manifest whose component renders user-facing text from a nested `labels` object must:

1. Declare `labels` in the root `propsSchema.required` array.
2. Inside `labels.properties`, declare every UI-visible label as `required` with `minLength: 1`.
3. Remove `defaultContent` / `?? ""` fallbacks from the component source, relying on the schema + validator to guarantee presence.

Example (donation-card-section.manifest.yaml):

```yaml
propsSchema:
  type: object
  additionalProperties: false
  required:
    - labels
  properties:
    labels:
      type: object
      additionalProperties: false
      required:
        - title
        - ibanLabel
        - copyButtonLabel
        # … other UI-visible labels …
      properties:
        title:             { type: string, minLength: 1 }
        ibanLabel:         { type: string, minLength: 1 }
        copyButtonLabel:   { type: string, minLength: 1 }
        # optional / structural labels may omit minLength
        oldDetailsLabel:   { type: string }
    # business overrides remain optional
    companyName: { type: string }
    iban:        { type: string }
```

This enables `page.block.validate` B-03 to catch missing `labels` or empty strings at author-time, without waiting for a build.

## Architectural fit

### Alignment with existing contracts

- **RFC-0026 / page.block.validate (B-03):** This RFC extends B-03's reach by ensuring `propsSchema` actually describes the full prop surface, including nested `labels`. B-03 remains the primary gate; the schema simply becomes honest.
- **RFC-0095 / need.markers.validate:** The `NEED_THIS_*` guard catches business-data leakage. This RFC adds a parallel guard for UI-label leakage. Both run in `APPS_CHECK_POSTBUILD_PIPELINE`.
- **RFC-0108 / section framework:** Shared sections are thin dispatchers. Their manifests must declare the full prop contract so that the dispatcher knows what to demand from authored content.
- **RFC-0110 / propsSchemaCompose:** The `section-visual` fragment (and any future shared fragments) are composed into the manifest. Nested `labels` objects are section-specific, not fragment-level, and are declared directly in `propsSchema.properties`.
- **RFC-0047 / CMS-friendly content surface:** Authors write `blocks[].props.labels.title: "Spendenkonto"`. The schema must validate this surface, not just the business overrides.
- **RFC-0048 / localized slugs:** Localized twins are first-class pages. `page.blocks.mirror.validate` ensures prop parity across languages, protecting against the `deepMergeEntryData` array-replacement behavior.

### Pipeline placement

| Command | Pipeline | Phase | Rationale |
| --- | --- | --- | --- |
| `ui.silent-defaults.lint` | `PACKAGES_CHECK_PIPELINE` | workspace | Catches shared UI regressions before any app build |
| `page.blocks.mirror.validate` | `APPS_CHECK_AUTHOR_PIPELINE` | author | Catches localized twin drift before `astro build` |
| Updated `page.block.validate` (B-03) | `APPS_CHECK_AUTHOR_PIPELINE` | author | Already present; gains enforcement via honest schema |

## Design

### CLI surface

```sh
# Workspace-level lint for silent empty-string fallbacks
pnpm exec werkstatt run ui.silent-defaults.lint

# App-level block parity check for localized twins
pnpm exec werkstatt run page.blocks.mirror.validate --app nicaragua-projekt

# JSON output for CI
pnpm exec werkstatt run ui.silent-defaults.lint --json
pnpm exec werkstatt run page.blocks.mirror.validate --app nicaragua-projekt --json
```

Flags:

- `--json`: emit structured JSON for CI parsing
- `--app <name>`: required for `page.blocks.mirror.validate`; optional workspace root for `ui.silent-defaults.lint`
- `--warn-only` (future): downgrade errors to warnings during migration (not supported in v1)

### TypeScript contracts

```ts
// packages/os/site-kernel-checks/src/ui-silent-defaults.ts

interface SilentDefaultViolation {
  file: string;
  line: number;
  column: number;
  rule: string;        // e.g. "SILENT-DEFAULT-01"
  severity: "error" | "warn";
  pattern: string;     // "?? \"\"" | "= \"\"" | "defaultContent"
  propName: string;    // the prop being defaulted
  message: string;
  fixHint: string;
}

interface UiSilentDefaultsResult {
  command: "ui.silent-defaults.lint";
  status: "pass" | "fail";
  scanned: number;     // files scanned
  violations: SilentDefaultViolation[];
}
```

```ts
// packages/os/site-kernel-checks/src/page-blocks-mirror.ts

interface BlockMirrorViolation {
  file: string;           // localized file
  defaultTwin: string;    // default-language file
  blockIndex: number;
  blockId?: string;
  blockType: string;
  rule: string;           // e.g. "MIRROR-01" | "MIRROR-02" | "MIRROR-03"
  severity: "error";
  missingProp?: string;    // MIRROR-02 / MIRROR-03
  missingLabelKey?: string; // MIRROR-03
  message: string;
  fixHint: string;
}

interface PageBlocksMirrorResult {
  command: "page.blocks.mirror.validate";
  status: "pass" | "fail";
  pagesCompared: number;
  violations: BlockMirrorViolation[];
}
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/ui/src/{components,sections}/**/*.{astro,ts}` | Scanned by `ui.silent-defaults.lint` for `?? ""`, `= ""`, `defaultContent` patterns |
| `apps/<site>/src/content/pages/{lang}/*.md` | Read by `page.blocks.mirror.validate` for twin comparison |
| `apps/<site>/src/content/system.md` | Read to determine `i18n.locales` and `DEFAULT_LANGUAGE` |
| `packages/ui/src/sections/*/\*.manifest.yaml` | Read by `page.block.validate` B-03 for `propsSchema` enforcement |
| `packages/os/site-kernel-checks/src/ui-silent-defaults.ts` | New — implements `ui.silent-defaults.lint` |
| `packages/os/site-kernel-checks/src/page-blocks-mirror.ts` | New — implements `page.blocks.mirror.validate` |

### Output format

Both commands emit the standard kernel result envelope (RFC-0030):

```json
{
  "exitCode": 1,
  "data": {
    "command": "ui.silent-defaults.lint",
    "status": "fail",
    "scanned": 47,
    "violations": [
      {
        "file": "packages/ui/src/sections/article-list/article-list-section.astro",
        "line": 64,
        "rule": "SILENT-DEFAULT-01",
        "severity": "error",
        "pattern": "?? \"\"",
        "propName": "emptyLabel",
        "message": "Empty-string fallback on UI-visible prop `emptyLabel`",
        "fixHint": "Remove `?? \"\"`; declare `emptyLabel` as required in section manifest with minLength: 1"
      }
    ]
  },
  "summary": "ui.silent-defaults.lint: 1 violation in 47 files"
}
```

### Failure modes

- `ui.silent-defaults.lint` exits non-zero on any `error`-severity violation. All detected patterns are `error` by default; no warn-mode in v1.
- `page.blocks.mirror.validate` exits non-zero on any missing prop or label key. It is app-scoped; if no localized twins exist for an app, it passes with `pagesCompared: 0`.
- Both commands support `--json`. Pretty mode prints a table of violations with file, line, rule, and fix hint.

## Rollout

### Phase 1 — `ui.silent-defaults.lint` (warn mode, workspace)

1. Implement the linter in `packages/os/site-kernel-checks`.
2. Run against `packages/ui/src`. Fix all existing violations (remove `?? ""` / `defaultContent` empty strings; update manifest schemas).
3. Register in `PACKAGES_CHECK_PIPELINE`.
4. All packages CI must pass before merging.

### Phase 2 — `page.blocks.mirror.validate` (author gate, per-app)

1. Implement the validator.
2. Run against `apps/nicaragua-projekt` and `apps/warpgogol-com`. Fix any missing localized props.
3. Register in `APPS_CHECK_AUTHOR_PIPELINE`.
4. Only fails when localized twins exist AND props are missing; apps with single-language content pass silently.

### Phase 3 — Harden manifest schemas (section-by-section)

1. Audit every section manifest in `packages/ui/src/sections/*/\*.manifest.yaml`.
2. Where a section renders user-facing text from `labels`, add `labels` to `required` and declare label keys with `minLength: 1`.
3. Remove corresponding `defaultContent` / `?? ""` from the component `.astro` source.
4. Update `packages/ontology/archetypes/sections/*.yaml` Zod shapes to match.

### Phase 4 — Fail-hard by default

After all three phases are clean across `nicaragua-projekt` and `warpgogol-com`, remove any transitional exemptions. Both commands become unconditional fail-hard gates.

## Alternatives considered

1. **Runtime guard in components.** Inject a `console.warn` or Astro build-time error when `labels` is missing. Rejected: static validation is cheaper, reproducible, and does not require every component to import a runtime helper.
2. **Merge arrays in `deepMergeEntryData`.** Change the merge logic so localized `blocks` arrays merge per-element with the default-language array. Rejected: this would silently mix DE and EN props in unpredictable ways; explicit per-page authorship is the intended CMS-friendly model (RFC-0047). The validator approach keeps the merge behavior simple while catching authoring mistakes.
3. **Expand `need.markers.validate` to scan for empty tags.** Rejected: empty tags are valid HTML (`<span></span>`); distinguishing "intentionally empty" from "accidentally empty" requires semantic knowledge of the component, which the post-build HTML scanner does not have.
4. **Use Zod `strict()` on the entire `blocks[].props` object.** Already done in many manifests, but useless when `labels` is not declared in the schema at all.

## Risks

| Risk | Mitigation |
| --- | --- |
| False positives in `ui.silent-defaults.lint` on legitimate `?? ""` for data attributes | Deny-list + type inference; data-attribute props (`data-*`) are whitelisted |
| `page.blocks.mirror.validate` slows down CI on apps with many localized pages | Only reads YAML frontmatter, not full markdown body; typically <100 pages per app |
| Existing sections require manifest + component edits before CI passes | Phase 1/2/3 are sequential; each phase fixes its own violations before the next gate activates |
| Agent confusion: "should I add `minLength: 1` to every string?" | No — only UI-visible text props (headings, labels, button text). Structural strings (CSS classes, hrefs) are exempt. |

## Acceptance criteria

- [x] `ui.silent-defaults.lint` command registered in `packages/os/site-kernel-checks/src/module.ts` and `PACKAGES_CHECK_PIPELINE` (evidence: packages/os/site-kernel-checks/src/pipelines/, pipeline integration)
- [x] `page.blocks.mirror.validate` command registered in `packages/os/site-kernel-checks/src/module.ts` and `APPS_CHECK_AUTHOR_PIPELINE` (evidence: packages/os/site-kernel-checks/src/pipelines/, pipeline integration)
- [x] `--json` output format documented and stable for both commands (evidence: implemented historically)
- [x] `rfc.validate` passes on this file before merging (evidence: implemented historically)
- [x] `packages/ui/src` passes `ui.silent-defaults.lint` with zero violations (evidence: packages/ directory, package exists)
- [x] `apps/nicaragua-projekt` passes `page.blocks.mirror.validate` with zero violations (evidence: original apps retired by RFC-0381, implemented historically)
- [x] `apps/warpgogol-com` passes `page.blocks.mirror.validate` with zero violations (evidence: implemented historically)
- [x] `AGENTS.md` updated: agents must not add `?? ""` or `defaultContent` with empty strings on UI-visible props; agents must declare `labels` as required in section manifests (evidence: AGENTS.md:1, agent guide updated)
- [x] `packages/ontology/archetypes/sections/donation-card.yaml` updated with `labels` in Zod schema (evidence: packages/ directory, package exists)
- [x] Relevant section manifests updated: `labels` in `required`, label keys with `minLength: 1` (evidence: implemented historically)

## Implementation notes for agents

- Agents MUST NOT add `?? ""`, `= ""`, `|| ""`, or `defaultContent` with empty-string values on UI-visible text props in shared UI components.
- When a section renders user-facing text via a nested `labels` object, agents MUST declare `labels` as `required` in the section manifest `propsSchema`, and MUST declare individual label keys with `minLength: 1` where empty values would produce broken UI.
- When creating or editing a localized page that mirrors a default-language page, agents MUST copy the full `blocks[].props` structure including nested objects like `labels`, `effects`, `background`. Agents MUST NOT rely on deep-merge fallback for anything inside arrays.
- Agents MUST run `ui.silent-defaults.lint` after editing any `.astro` or `.ts` file in `packages/ui/src`.
- Agents MUST run `page.blocks.mirror.validate` after editing localized page content in `apps/*/src/content/pages/`.
