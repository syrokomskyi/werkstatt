---
id: RFC-0271
title: "Declare PSEO module contexts and authoring language"
status: implemented
kind: contract
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-07-03
updatedAt: 2026-07-05
implementedAt: 2026-07-05
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0047
  - RFC-0192
  - RFC-0194
  - RFC-0207
  - RFC-0215
  - RFC-0238
commands:
  proposed:
    - surface.context.validate
  added:
    - surface.context.validate
  changed:
    - surface.generate
    - surface.enrich
    - entitlement.module.validate
  removed: []
appsImpacted:
  - webgogol-com
packagesImpacted:
  - "@gogol/surface"
  - "@gogol/ontology"
  - "@gogol/site-kernel-checks"
successSignals:
  - "Each PSEO-capable app declares one or more module contexts with a master/review locale that may be any supported site language and may differ from the site's default language."
  - "LLM-generated PSEO artifacts are created first in the module master locale, not implicitly in DEFAULT_LANGUAGE."
  - "Entitlement, budget, generation policy, tone, source boundaries, and approval policy resolve from the module context instead of scattered blueprint-specific code."
  - "webgogol-com can declare `masterLocale: uk` for its PSEO module while keeping any existing site default language unchanged."
nonGoals:
  - "Do not change language routing, hreflang, canonical URLs, or the existing site default-language contract."
  - "Do not call an LLM during normal build or request handling."
  - "Do not replace Blueprint contracts; module context supplies operating context around one or more Blueprints."
---

# RFC-0271: Declare PSEO module contexts and authoring language

## Context

The Programmatic Surface now behaves like a product module, not a single route generator. A site may run several paid modules over time: PSEO local surfaces, offer surfaces, passport pages, diagnostics, or future tenant-specific modules. Each module has different entitlement, language, generation, review, evidence, and editorial rules.

The current PSEO enrichment model assumes that generated content is scoped by Blueprint and language, but it does not declare the language in which the operator wants to write, review, and correct canonical generated artifacts. That language is not always the site's default language. For `webgogol-com`, the developer-review language for PSEO artifacts can be Ukrainian (`uk`), while the public site may still have another default language for routing or fallback.

## Problem

Without an explicit module context:

- `defaultLanguage` is overloaded as both routing fallback and generation-review language;
- `surface.enrich` cannot know which language should receive canonical generated artifacts first;
- translation readiness cannot be defined, because there is no canonical master locale per module;
- entitlement and regional-gate behavior stay split across Blueprint YAML, system.md, and hard-coded command logic;
- future modules will accumulate their own local context shapes.

## Decision

Every app that enables PSEO declares a **PSEO module context** in `src/content/system.md`. A module context is the app-level operating envelope for one or more Blueprints. It declares the canonical **master locale** for generated artifacts, the locales that may be published from it, the module entitlement, internal coverage budget, regional gating, LLM generation policy, voice policy, source boundaries, glossary references, translator-note references, and approval policy.

`masterLocale` is the locale in which AI generates the first editable artifact for the module and in which the human operator reviews and fixes it. It MUST be one of the site's supported locales. It MAY differ from `defaultLanguage`. The master locale is not automatically the SEO-canonical locale and does not imply that derived public locales can be published without target-language gates.

Blueprints continue to define axes, levels, route patterns, policy thresholds, and enriched field specs. Module context defines how the site operates the module.

## Architectural fit

- RFC-0193 remains the Blueprint contract; module context does not move axes, levels, route patterns, or substance policy out of Blueprint YAML.
- RFC-0197 remains the frozen-generation contract; module context tells generation which master locale and source boundaries to use.
- RFC-0240 productization becomes less hard-coded because entitlement and regional gates resolve from the module context.
- RFC-0047 stays intact because the declaration lives in `src/content/system.md`, the existing app manifest surface.

## Design

### system.md shape

```yaml
surface:
  modules:
    pseo:
      entitlement: pseo
      blueprints: [website-local, ratgeber]
      masterLocale: uk
      publishedLocales: [de]
      context:
        siteMode: bodenstation
        operatorLanguage: uk
        audience: "small German craft businesses"
        forbiddenClaims:
          - "Do not invent prices, legal dates, regional statistics, reviews, or certifications."
        sourceBoundaries:
          - "Use only surface records, approved claims, module context, and approved translator notes."
      indexBudget:
        publicName: managedCoverage
        maxIndexable: 120
        regionalGateDepths: [3]
      generation:
        provider: openai
        modelPolicy: default
        normalBuildCallsLlm: false
      approval:
        requireHumanApproval: true
        requireReadyForTranslation: true
      localization:
        glossaryRefs:
          de: pseo/de
        translatorNoteRefs:
          de: pseo/de
        reviewPolicy:
          de:
            firstNPerTemplateField: 30
            sampleAfterStabilization: 0.2
            claims: human
```

The exact YAML location may evolve during implementation, but the semantic contract is stable: a module context has an id, entitlement, blueprints, authoring language, translation targets, generation policy, and approval policy.

### TypeScript contracts

```ts
export interface SurfaceModuleContext {
  id: string;
  entitlement: string;
  blueprints: string[];
  masterLocale: string;
  publishedLocales: string[];
  context: {
    siteMode?: "bodenstation" | "sternsystem";
    operatorLanguage?: string;
    audience?: string;
    forbiddenClaims?: string[];
    sourceBoundaries?: string[];
    voice?: Record<string, unknown>;
  };
  indexBudget?: {
    publicName?: "managedCoverage";
    maxIndexable?: number;
    regionalGateDepths?: number[];
  };
  generation?: {
    provider?: string;
    modelPolicy?: string;
    normalBuildCallsLlm: false;
  };
  approval?: {
    requireHumanApproval: boolean;
    requireReadyForTranslation: boolean;
  };
  localization?: {
    glossaryRefs?: Record<string, string>;
    translatorNoteRefs?: Record<string, string>;
    reviewPolicy?: Record<string, {
      firstNPerTemplateField?: number;
      sampleAfterStabilization?: number;
      claims?: "human" | "sample" | "machine";
    }>;
  };
}
```

### Resolution rules

1. `surface.context.validate` resolves supported site languages from `system.md` and fails when `masterLocale` or any published locale is unsupported.
2. A Blueprint that belongs to a module inherits the module's master-locale and generation policy unless it declares a narrower override that the schema explicitly allows.
3. `surface.enrich` defaults to the module `masterLocale` when no `--lang` is passed.
4. `surface.generate` and `entitlement.module.validate` resolve entitlement per Blueprint through its owning module context instead of a single global `pseo` switch.
5. If two modules claim the same Blueprint, validation fails. A Blueprint has exactly one operating module per app.

### CLI surface

```sh
pnpm exec site-kernel run surface.context.validate --app webgogol-com --json
pnpm exec site-kernel run surface.enrich --app webgogol-com --module pseo
```

## Failure modes

- Missing module context for an enabled PSEO Blueprint: error.
- `masterLocale` not in supported languages: error.
- published locale has no glossary or translator note reference: warning until RFC-0273 is implemented, then a translation-generation blocker.
- Module entitlement disabled: the module's Blueprints are not generated or are generated only as private preview artifacts according to product policy.
- `normalBuildCallsLlm: true`: schema error. Normal build stays deterministic.

## Rollout

1. Add the module context schema and `surface.context.validate`.
2. Migrate `webgogol-com` to declare `surface.modules.pseo.authoringLanguage: uk`.
3. Refactor `surface.enrich` to read authoring language from module context.
4. Refactor entitlement checks to resolve per Blueprint through module context.
5. Keep existing Blueprint fields backward-compatible during one migration window, but warn when PSEO Blueprints are enabled without a module context.

## Alternatives considered

- **Use `defaultLanguage` as the master locale.** Rejected: routing fallback and editorial review language are different concepts.
- **Declare master locale per Blueprint only.** Rejected: the same module needs shared entitlement, budget, source boundaries, and translator notes across Blueprints.
- **One global app generation context.** Rejected: modules have different risk profiles, product promises, evidence requirements, and translation rules.

## Risks

- Module context can become a second Blueprint if it grows unchecked. Mitigation: keep route, axis, and page policy in Blueprint; keep operating context in module context.
- Misconfigured master locale can block generation. Mitigation: `surface.context.validate` fails before provider calls.
- Entitlement refactor can change generated route counts. Mitigation: compare `surface.generate` output and behavior snapshots during rollout.

## Acceptance criteria

- [x] `SurfaceModuleContext` type and schema exist in the shared surface/kernel layer. (evidence: implemented historically)
- [x] `surface.context.validate` is registered and emits RFC-0203 diagnostics. (evidence: implemented historically)
- [x] `webgogol-com` declares a PSEO module context with `masterLocale: uk`. (evidence: implemented historically)
- [x] `surface.enrich` defaults to the module master locale. (evidence: implemented historically)
- [x] `surface.generate` and `entitlement.module.validate` resolve entitlement per module/Blueprint, not through a hard-coded global PSEO gate. (evidence: implemented historically)
- [x] `rfc.validate` passes on this file. (evidence: implemented historically)

## Implementation notes for agents

- Do not rename or reinterpret `defaultLanguage`; it remains the site routing/content fallback contract.
- Do not let module context become prose-only. It must be schema-validated because generators, translators, validators, and operator pages will depend on it.
- Do not add LLM calls to normal build. Module context may configure generation, but generation stays explicit and offline.
