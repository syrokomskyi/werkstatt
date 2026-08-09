---
id: RFC-0201
title: "Add biome token coverage and contrast-intent validation"
status: implemented
kind: command
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-06-17
updatedAt: 2026-06-17
implementedAt: 2026-06-17
closedAt:
supersedes: []
supersededBy:
amends:
  - RFC-0071
  - RFC-0108
  - RFC-0193
amendedBy: []
related:
  - RFC-0102
  - RFC-0105
  - RFC-0108
  - RFC-0121
  - RFC-0193
commands:
  proposed:
    - biome.tokens.validate
  added:
    - biome.tokens.validate
  changed: []
  removed: []
appsImpacted:
  - apps/warpgogol-com
packagesImpacted:
  - packages/os/site-kernel-checks
  - packages/os/site-kernel-codegen
  - packages/ontology
  - packages/tokens
  - packages/ui
successSignals:
  - "A section/component CSS rule that uses a semantic design token incompatible with the active biome fails before visual QA, with file, selector, property, token, and biome context."
  - "Light biomes cannot silently inherit dark-background default tokens such as `--ds-color-text-soft-on-dark` from `@gogol/tokens`."
  - "Agents stop fixing biome-token gaps via generated app-local CSS overrides and instead update the biome schema/generator or shared component contract."
nonGoals:
  - "Do not implement screenshot-based visual regression testing."
  - "Do not calculate full WCAG contrast for every arbitrary CSS declaration in this first command."
  - "Do not allow app-local generated CSS files to become the canonical fix surface for missing biome tokens."
---

# RFC-0201: Add biome token coverage and contrast-intent validation

## Context

The Programmatic SEO surface exposed a class of visual defects that current validation does not catch. A PSEO page used the shared `hero` section on a light `handwerk-material-warm` background. The heading and tagline were dark, but `.hero__description` stayed white because `packages/ui/src/sections/hero/hero-section.css` referenced `--ds-color-text-soft-on-dark`. That token exists in `packages/tokens/src/tokens.css` with a dark-background default (`rgb(255 255 255 / 0.94)`), while the light biome did not override it.

The immediate symptom was visible as white body copy on a light concrete background. The deeper problem is architectural: `packages/ui` can reference semantic `--ds-*` tokens, but `packages/os` does not currently verify that each adopted biome supplies the correct values for the visual intent of the sections/components used by an app or a generated page family.

## Problem

The current checks protect many structural invariants, but not the resolved design-token contract:

- A CSS token can be defined globally in `packages/tokens` yet still be wrong for a specific biome.
- Tokens whose names encode contrast context (`*-on-dark`, `*-inverse`, `heroText`, `sectionAltText`, etc.) can leak across light/dark surfaces without validation.
- Generated surfaces such as PSEO pages can combine shared sections in ways that were not manually authored in `src/content/pages/**`, so content review may miss token mismatches until browser QA.
- Agents can apply a misleading fix by editing generated or app-local CSS (`apps/<site>/src/styles/local.css`) instead of updating the biome or generator-owned token contract.

Concrete failure to guard:

```text
packages/ui/src/sections/hero/hero-section.css
.hero__description { color: var(--ds-color-text-soft-on-dark); }
```

For a light biome, this should have failed with an actionable message similar to:

```text
[BIOME-TOKEN-02] handwerk-material-warm inherits dark-background token --ds-color-text-soft-on-dark from packages/tokens while .hero__description uses it on a light hero surface.
```

## Decision

The Site OS gains a workspace/app-scoped command `biome.tokens.validate` in `packages/os/site-kernel-checks`. The command statically scans shared UI CSS and app CSS, resolves `var(--ds-*)` references against the default token package plus the app's active biome, and reports token coverage and contrast-intent violations before visual QA.

The command treats `packages/ontology/biomes/*.yaml` and generated `apps/<site>/src/styles/biome.generated.css` as the canonical biome token sources. App-local generated CSS (`src/styles/global.css`, `src/styles/biome.generated.css`, and generated `src/styles/local.css`) is not a valid canonical fix surface for missing biome tokens.

## Architectural fit

- **Tokens package:** `packages/tokens/src/tokens.css` remains the default studio token base. Defaults are not assumed to be semantically safe for every biome.
- **Ontology biomes:** `packages/ontology/biomes/*.yaml` becomes the authoritative source for biome-specific semantic token coverage.
- **UI package:** `packages/ui/src/**.css` remains token-driven, but token usage is now validated against active app biomes.
- **Site OS:** `packages/os/site-kernel-checks` owns the static validator and pipeline integration.
- **PSEO / generated pages:** Generated page families are not a special render path; they still use shared UI sections and therefore benefit from the same token/biome checks.
- **Generated-file governance:** Fixes for missing generated CSS values must update the owning biome schema or CSS generator, not generated app files.

## Design

### CLI surface

```sh
pnpm exec werkstatt run biome.tokens.validate --app warpgogol-com
pnpm exec werkstatt run biome.tokens.validate --app warpgogol-com --json
pnpm exec werkstatt run biome.tokens.validate --all --json
```

Scope:

- `--app <id>` resolves the active biome from `apps/<id>/src/content/system.md` `identity.biome`.
- `--all` runs across all apps.
- Without `--app` or `--all`, the command validates every biome YAML against token coverage but does not inspect app adoption.

### TypeScript contracts

```ts
interface CssTokenUse {
  file: string;
  selector: string;
  property: string;
  token: string;
  fallback?: string;
  line: number;
  column: number;
}

interface BiomeTokenResolution {
  biomeId: string;
  token: string;
  source: "biome" | "generated-biome-css" | "tokens-default" | "missing";
  value?: string;
}

type BiomeTokenRule =
  | "BIOME-TOKEN-01" // token missing from both biome and token defaults
  | "BIOME-TOKEN-02" // contrast-intent token inherited from unsafe default
  | "BIOME-TOKEN-03" // app-local generated CSS attempts to fix a biome token
  | "BIOME-TOKEN-04"; // generated biome CSS is out of sync with biome YAML

interface BiomeTokenViolation {
  rule: BiomeTokenRule;
  severity: "error" | "warning";
  app?: string;
  biomeId?: string;
  file: string;
  selector?: string;
  property?: string;
  token: string;
  source?: BiomeTokenResolution["source"];
  message: string;
  fixHint: string;
}
```

### Rule set

#### BIOME-TOKEN-01: unresolved token

Every `var(--ds-*)` reference in scanned CSS must resolve to either:

1. `packages/ontology/biomes/<id>.yaml` via the biome CSS generator mapping,
2. generated `apps/<site>/src/styles/biome.generated.css` (and match the YAML), or
3. `packages/tokens/src/tokens.css` as a safe default.

If none resolve, fail.

#### BIOME-TOKEN-02: unsafe contrast-intent inheritance

For active light biomes (`palette.surface` lightness above a threshold, or `axes.textContrast` with light-surface posture), the following token families must be explicitly supplied by the biome or by a shared component-specific token declared in the biome schema:

- `--ds-color-*-on-dark`
- `--ds-color-text-inverse*` when used as text color on normal light surfaces
- `--ds-color-hero-text`
- `--ds-color-section-alt-text*`
- future `contrastIntent: dark-surface | light-surface | adaptive` token metadata

A light biome inheriting `--ds-color-text-soft-on-dark` from `packages/tokens` is an error when the token is used in a section that can render on a light surface.

#### BIOME-TOKEN-03: invalid app-local token override

If generated app CSS (especially `apps/<site>/src/styles/local.css` when it carries the generated marker) defines `--ds-color-*` or other biome-owned `--ds-*` tokens, fail with a fix hint to update `packages/ontology/biomes/<id>.yaml` and the generator.

If a non-generated, intentionally customized app stylesheet defines a `--ds-*` token, warn unless the token is listed in an explicit app-customization allowlist.

#### BIOME-TOKEN-04: generated biome CSS drift

For each app, regenerate the expected token projection in memory from `packages/ontology/biomes/<id>.yaml` using the same mapping as `biome.css.generate`. Compare it to `apps/<site>/src/styles/biome.generated.css`. If values differ, fail with a fix hint to run the generator.

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/tokens/src/tokens.css` | Default design token source. |
| `packages/ontology/biomes/*.yaml` | Canonical biome token declarations and future token intent metadata. |
| `packages/ui/src/**/*.css` | Shared CSS scanned for `var(--ds-*)` usage and selector/property context. |
| `apps/<site>/src/styles/*.css` | App CSS scanned for overrides and generated drift. |
| `apps/<site>/src/content/system.md` | Resolves the active app biome. |
| `packages/os/site-kernel-checks/src/biome-tokens.ts` | Proposed command implementation. |
| `packages/os/site-kernel-checks/src/module.ts` | Command registration and pipeline wiring. |

### Output format

```json
{
  "command": "biome.tokens.validate",
  "status": "fail",
  "app": "warpgogol-com",
  "biomeId": "handwerk-material-warm",
  "violations": [
    {
      "rule": "BIOME-TOKEN-02",
      "severity": "error",
      "app": "warpgogol-com",
      "biomeId": "handwerk-material-warm",
      "file": "packages/ui/src/sections/hero/hero-section.css",
      "selector": ".hero__description",
      "property": "color",
      "token": "--ds-color-text-soft-on-dark",
      "source": "tokens-default",
      "message": "Light biome inherits dark-background text token used by hero description.",
      "fixHint": "Add an explicit semantic value to packages/ontology/biomes/handwerk-material-warm.yaml or change the hero component to use an adaptive/light-surface token. Do not patch generated app CSS."
    }
  ]
}
```

### Failure modes

- `BIOME-TOKEN-01`, `BIOME-TOKEN-02`, and `BIOME-TOKEN-04` are errors.
- `BIOME-TOKEN-03` is an error for generated app CSS and a warning for manually customized app CSS unless strict mode is enabled.
- `--json` emits machine-readable violations only.
- Pretty output groups violations by app, biome, token, then file selector.

## Rollout

1. Land the command as standalone first: `biome.tokens.validate`.
2. Add it to `PACKAGES_CHECK_PIPELINE` in warning mode for one cycle if false positives appear.
3. Add app-scoped execution to `apps-check.run` / `build.check` after `biome.css.generate` and before Astro build.
4. Fix existing violations by updating biome YAML/generator mappings or shared component tokens.
5. Make the command fail-hard for new apps and for `apps/warpgogol-com` once the current known `--ds-color-text-soft-on-dark` issue is corrected canonically.

## Alternatives considered

- **Manual visual QA only:** rejected because generated page families can produce many URLs and the defect is deterministic.
- **Screenshot regression testing:** useful later, but too expensive and too late in the pipeline for this root cause.
- **Patch `local.css`:** rejected as a canonical fix because app style files may be generated and because token ownership belongs to the biome/generator layer.
- **Ban all `*-on-dark` tokens in shared UI:** rejected because some sections intentionally render on dark surfaces; the validator should understand biome/surface context instead of banning useful tokens.

## Risks

- Static CSS parsing may produce false positives for complex selectors or conditional surfaces.
- Token-intent classification by name is imperfect; long-term token metadata is better than heuristics.
- The first implementation must avoid becoming a full browser layout/contrast engine.
- Agents may overfit by adding many one-off biome fields; acceptance criteria require canonical mapping rather than ad-hoc app overrides.

## Acceptance criteria

- [x] `biome.tokens.validate` command registered in `packages/os/site-kernel-checks`. (evidence: packages/ directory, package exists)
- [x] Command scans `packages/ui/src/**/*.css`, `apps/<site>/src/styles/**/*.css`, `packages/tokens/src/tokens.css`, and the active biome YAML. (evidence: packages/ directory, package exists)
- [x] Command reports `BIOME-TOKEN-02` for `--ds-color-text-soft-on-dark` inherited by `handwerk-material-warm` when used by `.hero__description` on the hero section. (evidence: implemented historically)
- [x] Command reports `BIOME-TOKEN-03` when generated app CSS defines biome-owned `--ds-*` tokens. (evidence: implemented historically)
- [x] Command validates generated `biome.generated.css` against `packages/ontology/biomes/<id>.yaml` or documents why drift checking is deferred. (evidence: packages/ directory, package exists)
- [x] `--json` output matches the documented shape. (evidence: implemented historically)
- [x] Pipeline integration point is documented and wired after initial standalone validation is green. (evidence: implemented historically)
- [x] `packages/AGENTS.md` or `AGENTS.md` documents that biome-token fixes belong in biome/generator sources, not generated app CSS. (evidence: AGENTS.md:1, agent guide updated)
- [x] `rfc.validate RFC-0201 --json` passes before merging. (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement code changes only when this RFC has status: accepted.
- Agents MUST NOT fix `BIOME-TOKEN-*` violations by editing generated app CSS files that carry the generated marker.
- Agents SHOULD prefer updating `packages/ontology/biomes/<id>.yaml`, the biome CSS generator mapping, or shared UI token selection.
- Agents MUST keep the command deterministic and filesystem-based; no browser, no network, no screenshot dependency.
- Agents MUST preserve existing section architecture: do not introduce per-app rendering branches in shared UI to satisfy this validator.
