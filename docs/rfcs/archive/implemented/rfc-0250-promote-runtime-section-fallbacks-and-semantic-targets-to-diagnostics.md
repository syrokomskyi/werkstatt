---
id: RFC-0250
title: "Promote runtime section fallbacks and semantic targets to diagnostics"
status: implemented
# kind options: architecture | contract | command | policy | deprecation
kind: contract
# scope options: app | workspace
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-07-01
updatedAt: 2026-07-01
implementedAt: 2026-07-01
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0053
  - RFC-0141
  - RFC-0167
  - RFC-0203
  - RFC-0247
  - RFC-0248
commands:
  proposed: []
  added:
    - runtime.warnings.lint
    - section.defaults.validate
    - semantic.targets.validate
  changed:
    - apps-check.author
    - maintenance.debt.report
  removed: []
appsImpacted:
  - webgogol-com
  - nicaragua-projekt
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - "@gogol/share"
  - "@gogol/ui"
  - "@gogol/site-kernel-checks"
  - "@gogol/content-source"
successSignals:
  - "`pnpm build` for both apps emits no `[resolveImage] Image not found: \"hero-1\"` warning from generated or authored pages."
  - "`pnpm build` emits no `[routes] PageId not found: donateContact` warning from shared section defaults."
  - "Missing section fallback assets and missing semantic targets are reported as canonical `Diagnostic[]` records before Astro render/build logs."
  - "`maintenance.debt.report --json` includes runtime-warning-equivalent findings with rule ids, file locators, and fix hints."
nonGoals:
  - "Do not remove all `console.warn` calls repository-wide; this RFC targets actionable user-facing page/render warnings."
  - "Do not require every optional CTA or optional image to become mandatory."
  - "Do not implement this contract while the RFC remains draft."
---

# RFC-0250: Promote runtime section fallbacks and semantic targets to diagnostics

## Context

The 2026-07-01 architecture audit confirmed that RFC-0247 and RFC-0248 improved static diagnostics significantly:

- `content.asset.contract.validate` and `asset.reference.validate` pass for both apps.
- `maintenance.debt.report` aggregates warning/info diagnostics.
- `pnpm build` completes successfully for the full workspace.

However, the fresh `pnpm build` output still contains actionable runtime warnings that do not travel through the canonical diagnostic model:

- `webgogol-com` Programmatic Surface pages render shared `hero-section` fallback behavior and emit `[resolveImage] Image not found: "hero-1" (lang: de, defaultLang: de)`.
- The same render path resolves default CTA targets from `hero-section` and emits `[routes] PageId not found: donateContact` when the app does not define that pageId.
- Generated surface routes also emit repeated content-entry lookup warnings such as `Entry pages -> de/website-local:... was not found` during Astro content resolution. These warnings are expected in the sense that surface pages are synthetic, but they are not represented as diagnostics, and therefore agents cannot tell whether they are benign framework noise or real content drift.

The primary source is shared UI fallback behavior:

- `packages/ui/src/sections/hero/hero-section.astro` falls back from `props.portraitImage` to `"hero-1"`.
- The same section falls back from missing `primaryCtaTarget` / `secondaryCtaTarget` to `"donateContact"`.
- `packages/share/src/astro/routes.ts` reports missing pageIds with `console.warn`.
- `packages/content-source/src/adapters/fs/assets.ts` reports unresolved image tokens with `console.warn`.

These defaults are historically valid for `nicaragua-projekt`, which defines `hero-1` and `donateContact`, but they are not app-agnostic. When reused by generated or authored pages in another app, they produce noisy render logs and can hide real broken links/assets.

## Problem

The unprotected invariant is: **a shared section default must never silently point at an app-specific asset token or semantic pageId without a static diagnostic path.**

Runtime console warnings are insufficient for autonomous agents:

- They are not surfaced in `apps-check.author --json`.
- They are not aggregated in `maintenance.debt.report`.
- They can be missed in long Astro build logs.
- They do not include a stable rule id or source locator.
- They mix benign fallback noise with real visitor-facing broken links/assets.

This weakens RFC-0203 and RFC-0247 because the repository now has a third diagnostic channel: render-time `console.warn`.

## Decision

The platform will add a static diagnostic contract for section default fallbacks and semantic targets.

Three validation surfaces are introduced:

1. `section.defaults.validate` inspects shared UI section/component fallback declarations and rejects app-specific default asset tokens or semantic targets unless they are declared as portable defaults.
2. `semantic.targets.validate` validates every authored or generated semantic target (`pageId`, CTA target, navigation target, section target) against the route registry for the relevant app/language.
3. `runtime.warnings.lint` acts as a focused guard for actionable render warnings that still bypass diagnostics. It does not ban all `console.warn`; it requires runtime warnings that indicate broken content, missing routes, or missing assets to have an equivalent static diagnostic.

The hero section default behavior must be made app-agnostic:

- A missing optional portrait/lead image should omit the portrait image rather than attempting `"hero-1"` unless the page/app explicitly opts into that token.
- A missing optional CTA target should omit that CTA unless the content supplies a target or a site-level fallback in `system.md`/site labels defines a valid semantic target.
- If a section requires a fallback, the fallback must be declared in a shared fallback registry with:
  - token kind (`asset` or `pageId`);
  - owning package or content domain;
  - portability rationale;
  - validator coverage.

## Architectural fit

This RFC extends RFC-0247 from check-command warnings into render-path warnings. It also extends RFC-0248 by ensuring runtime asset resolution warnings are mirrored by static validators.

The contract belongs across:

- `@gogol/ui`, where section defaults are authored.
- `@gogol/share`, where route and semantic target resolution lives.
- `@gogol/site-kernel-checks`, where static validation and canonical diagnostics live.

The change preserves the composition-only app rule. Apps should not patch around shared section defaults; shared defaults must be portable, or app content must explicitly provide the app-specific value.

## Design

### CLI surface

```sh
pnpm exec site-kernel run section.defaults.validate --json
pnpm exec site-kernel run semantic.targets.validate --app webgogol-com --json
pnpm exec site-kernel run runtime.warnings.lint --json
pnpm exec site-kernel run apps-check.author --app webgogol-com --json
pnpm exec site-kernel run maintenance.debt.report --json
```

`section.defaults.validate` is workspace-scoped. It scans shared UI source and optional fallback registry data.

`semantic.targets.validate` is app-scoped. It resolves semantic targets against the app route registry and supported language set.

`runtime.warnings.lint` is workspace-scoped. It scans known runtime warning producers and verifies each actionable warning class is represented by a static diagnostic rule or carries a local suppression with rationale.

### TypeScript contracts

```ts
type SectionDefaultKind = "asset" | "pageId" | "label" | "style";

interface SectionDefaultReference {
  packageName: "@gogol/ui" | "@gogol/share" | string;
  file: string;
  line?: number;
  component: string;
  propName: string;
  kind: SectionDefaultKind;
  value: string;
  portability: "portable" | "app-specific" | "unknown";
  fallbackRegistryId?: string;
}

interface SectionDefaultRegistryEntry {
  id: string;
  component: string;
  propName: string;
  kind: SectionDefaultKind;
  value: string;
  rationale: string;
  validatedBy: string[];
}

interface SemanticTargetReference {
  file: string;
  line?: number;
  source: "content" | "system" | "section-default" | "generated-surface" | "navigation";
  lang?: string;
  pageId: string;
  propPath: string;
  optional: boolean;
}
```

### Diagnostic rules

`section.defaults.validate` emits:

- `SECTION-DEFAULT-01`: shared section uses a hardcoded app-specific asset token.
- `SECTION-DEFAULT-02`: shared section uses a hardcoded app-specific pageId.
- `SECTION-DEFAULT-03`: fallback registry entry names a token that no app can validate.
- `SECTION-DEFAULT-04`: component comment describes a fallback as legacy without a migration path.

`semantic.targets.validate` emits:

- `SEM-TARGET-01`: content-authored pageId does not exist in the route registry.
- `SEM-TARGET-02`: section default pageId does not exist for this app.
- `SEM-TARGET-03`: pageId exists but has no route for the requested language.
- `SEM-TARGET-04`: generated surface page contains a CTA target that is not valid for the app.

`runtime.warnings.lint` emits:

- `RUNTIME-WARN-01`: missing asset warning has no static diagnostic equivalent.
- `RUNTIME-WARN-02`: missing route/pageId warning has no static diagnostic equivalent.
- `RUNTIME-WARN-03`: actionable runtime warning lacks rule-id documentation.

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/ui/src/sections/hero/hero-section.astro` | Remove app-specific `hero-1` and `donateContact` fallback behavior or register portable fallback policy |
| `packages/ui/src/sections/**` | Source scanned by `section.defaults.validate` |
| `packages/share/src/astro/routes.ts` | Route resolver; warning classes must be mirrored by `semantic.targets.validate` |
| `packages/content-source/src/adapters/fs/assets.ts` | Asset resolver; warning classes must be mirrored by asset/default validators |
| `packages/os/site-kernel-checks/src/section-defaults.ts` | New workspace validator |
| `packages/os/site-kernel-checks/src/semantic-targets.ts` | New app validator |
| `packages/os/site-kernel-checks/src/runtime-warnings-lint.ts` | New warning-class guard |
| `packages/os/site-kernel-checks/src/diagnostics/rules.ts` | Registers new rule ids |
| `packages/os/site-kernel-checks/src/pipelines/apps-check-author.ts` | Adds app-scoped semantic target validation |
| `packages/os/site-kernel-checks/src/pipelines/packages-check.ts` | Adds workspace-scoped fallback/warning guards |

### Output format

```json
{
  "command": "section.defaults.validate",
  "status": "fail",
  "diagnostics": [
    {
      "ruleId": "SECTION-DEFAULT-02",
      "severity": "error",
      "file": "packages/ui/src/sections/hero/hero-section.astro",
      "line": 66,
      "message": "hero-section uses app-specific pageId fallback \"donateContact\" for primaryCtaTarget.",
      "fixHint": "Omit the CTA when no target is authored, or move the fallback into an app/site-level contract that semantic.targets.validate can verify."
    }
  ],
  "summary": { "error": 1, "warning": 0, "info": 0 }
}
```

## Rollout

1. Add a temporary inventory mode to identify current shared section defaults and runtime warning classes.
2. Implement `section.defaults.validate` with diagnostics for `@gogol/ui` sections/components.
3. Implement `semantic.targets.validate` for system.md, page blocks, navigation records, generated surface records, and registered section defaults.
4. Refactor `hero-section` so `hero-1` and `donateContact` are not implicit cross-app fallbacks.
5. Implement `runtime.warnings.lint` for known actionable warning producers in `@gogol/share`, `@gogol/content-source`, and `@gogol/ui`.
6. Add the new commands to `PACKAGES_CHECK_PIPELINE`, `APPS_CHECK_AUTHOR_PIPELINE`, and `maintenance.debt.report`.
7. Run `pnpm build` and confirm the previous runtime warning classes are gone or represented as diagnostics.

## Alternatives considered

Keeping the runtime warnings and relying on humans to inspect build logs was rejected because the repository is explicitly optimized for autonomous agent maintenance.

Making `resolveImage` throw on every missing image was rejected because some images are intentionally optional. The static validator must understand optionality and authored intent rather than making the low-level resolver fail hard.

Keeping `"hero-1"` and `"donateContact"` as universal defaults was rejected because they are app-specific conventions from one site, not a package-level contract.

## Risks

Static analysis of Astro sections can be brittle if it only uses string matching. The implementation should prefer a small AST/parser or constrained extraction helpers where practical, with tests pinning the current hero defaults.

Removing defaults can change visual output if a page relied on implicit portrait/CTA behavior. The rollout must distinguish explicit content from fallback behavior and update affected content only when the page intentionally wants those CTAs/images.

`runtime.warnings.lint` can overreach if it treats operational warnings, third-party failures, or debug traces as content defects. The command should target a narrow registry of known actionable warning classes.

## Acceptance criteria

- [x] `section.defaults.validate` is registered and included in `PACKAGES_CHECK_PIPELINE`. (evidence: implemented historically)
- [x] `semantic.targets.validate` is registered and included in `APPS_CHECK_AUTHOR_PIPELINE`. (evidence: implemented historically)
- [x] `runtime.warnings.lint` is registered and included in `PACKAGES_CHECK_PIPELINE`. (evidence: implemented historically)
- [x] `hero-section` no longer implicitly falls back to `"hero-1"` or `"donateContact"` for apps that do not declare those tokens/targets. (evidence: implemented historically)
- [x] Missing section fallback assets and missing semantic targets are canonical diagnostics with registered rule ids. (evidence: implemented historically)
- [x] `maintenance.debt.report --json` aggregates non-failing warning/info findings from the new validators. (evidence: original apps retired by RFC-0381, implemented historically)
- [x] `pnpm build` emits no previous `hero-1` / `donateContact` runtime warnings for `webgogol-com`. (evidence: implemented historically)
- [x] `pnpm exec site-kernel run apps-check.author --app webgogol-com --json` passes or reports only intentional warning-mode diagnostics. (evidence: implemented historically)
- [x] `pnpm exec site-kernel run apps-check.author --app nicaragua-projekt --json` passes and preserves intentionally authored `hero-1` / `donateContact` behavior. (evidence: original apps retired by RFC-0381, implemented historically)
- [x] `pnpm exec site-kernel run packages-check.run --json`, `pnpm lint:packages`, `pnpm test`, `pnpm build`, and `rfc.validate` pass. (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement code changes only when this RFC has `status: accepted` or `status: implemented`.
- Start with `packages/ui/src/sections/hero/hero-section.astro`; it is the known reproducer.
- Do not delete `console.warn` calls merely to quiet the build. Add the static diagnostic path first, then decide whether the runtime warning remains useful.
- Preserve optional rendering semantics: optional CTA/image props should omit UI when absent unless a validated site-level fallback exists.
- When adding rule ids, register them in `packages/os/site-kernel-checks/src/diagnostics/rules.ts`.
- When changing shared UI behavior, validate both current apps because one app currently uses the legacy defaults intentionally.
