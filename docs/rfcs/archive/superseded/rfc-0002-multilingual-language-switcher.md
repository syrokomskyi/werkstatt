---
id: RFC-0002
title: "Add multilingual language switcher to nicaragua-projekt"
status: superseded
kind: architecture
scope: app
owners:
  - architecture
reviewers: []
createdAt: 2026-04-13
updatedAt: 2026-06-04
implementedAt:
closedAt: 2026-05-01
supersedes: []
supersededBy: RFC-0038
related:
  - "Invariant 2 — Language-prefixed URLs are first-class"
  - "Invariant 9 — Styling is token-based and file-based"
  - "Invariant 12 — Feature visibility is centralized"
commands:
  proposed: []
  added: []
  changed: []
  removed: []
appsImpacted:
  - nicaragua-projekt
packagesImpacted: []
successSignals:
  - "Language switcher renders in header top-right on all pages of nicaragua-projekt"
  - "Clicking cycles through supported languages (DE → EN → DE)"
  - "Active language is visually indicated"
  - "Component passes to another app by copying an Astro files: structure, styles, content (triada)"
  - "No language-switcher code lives in packages/"
nonGoals:
  - "Does not implement i18n translation strings: we have own structure (see AGENTS.md files)"
  - "Does not add a new language to the site — only switches between already-supported ones"
  - "Does not port the switcher to apps/main or apps/my-main in this RFC (future RFC)"
  - "Does not extract shared localization utilities into packages/ (stay per-app)"
---

# RFC-0002: Add multilingual language switcher to nicaragua-projekt

## Context

`apps/nicaragua-projekt` already routes all traffic through `src/pages/[lang]/`, and `src/utils/localization.ts` already defines `LANGUAGE_MAPPING` with `de` and `en`. The site's `defaultLanguageCode` is `de`. Routes for both languages are produced at build time.

However, there is no UI affordance for visitors to change the display language. The header (`src/components/header.astro`) has a right-side slot occupied only by a CTA button; there is room to place a compact language switcher without redesigning the layout.

The `apps/main` site has a richer `src/utils/localization.ts` with full country/language utilities, reverse mappings, and URL helpers. Those utilities are app-internal and must not be promoted to `packages/` — but agents must know to copy the relevant parts when porting this feature.

## Problem

Visitors cannot switch between DE and EN without manually editing the URL. The gap:

- Invariant 2 (lang flows from route to layout to children) is satisfied, but has no user-facing control.
- Invariant 12 (feature visibility is centralised in `features.ts`) is not yet applied to the switcher — no feature flag guards its rendering.
- Invariant 9 (styling is token-based and file-based) is already followed; this RFC maintains it.

## Decision

A self-contained Astro component `src/components/lang-switcher.astro` is added to `apps/nicaragua-projekt`. It:

1. Receives the current `lang` prop from the header.
2. Computes the full cycle of supported languages from `LANGUAGE_MAPPING`.
3. Renders each language code (alpha-2 uppercase: `DE`, `EN`) as a button/link.
4. Highlights the active language visually.
5. Each label links to the same path under the target language prefix.

The component is wired into `header.astro` in the right-side slot, conditionally rendered via a feature flag `features.header.langSwitcher`.

Localization utilities from `apps/main/src/utils/localization.ts` are the reference model for extending `apps/nicaragua-projekt/src/utils/localization.ts` — but utilities remain per-app.

## Architectural fit

- **Invariant 2** — `lang` already flows as a prop through layout → header → child components. The switcher receives it via the same channel.
- **Invariant 12** — the feature flag `features.header.langSwitcher` gates rendering from day one, matching the existing `features.ts` pattern.
- **Invariant 9** — `LANGUAGE_MAPPING` and `SupportedLanguage` stay in `src/utils/localization.ts`; no new shared package dependency is introduced.
- **Component Contracts** — `lang-switcher.astro` follows the three-way mirror rule: component, styles (`src/styles/components/lang-switcher.css`), and content (no content file needed — labels are derived from `LANGUAGE_MAPPING` programmatically).
- **Portability** — one `.astro` + one `.css` file, zero package dependencies beyond what every app already has. Porting to another app = copy both files, add the feature flag, wire into header.

## Design

### Agent note: localization utility pattern

The `apps/main/src/utils/localization.ts` is the reference for a richer localization utility set. When extending `apps/nicaragua-projekt/src/utils/localization.ts`, agents MUST copy only what is needed for this feature from the `apps/main` version. Do not move utilities to `packages/`. The pattern to follow:

```
apps/<site>/src/utils/localization.ts  ← copy and adapt from apps/main as needed
apps/<site>/src/configure/common.ts    ← defaultLanguageCode single source of truth
```

The utilities in `apps/main/src/utils/localization.ts` that are relevant to this feature:

- `getSupportedLanguageCodes()` — derive from `LANGUAGE_MAPPING` keys
- `getLocalizedUrl(path, languageCode)` — compute sibling-language URL

### CLI surface

No new kernel command. Feature is UI-only.

### TypeScript contracts

```ts
// In lang-switcher.astro Props
interface Props {
  lang: string;        // current page language code (e.g. "de")
  currentPath: string; // Astro.url.pathname — used to build sibling-language URLs
}

// Derived inside component from LANGUAGE_MAPPING:
// const langs = Object.keys(LANGUAGE_MAPPING) as SupportedLanguage[];
// const next = langs[(langs.indexOf(current) + 1) % langs.length];
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `apps/nicaragua-projekt/src/components/lang-switcher.astro` | New component — language switcher |
| `apps/nicaragua-projekt/src/styles/components/lang-switcher.css` | New stylesheet — switcher visual |
| `apps/nicaragua-projekt/src/components/header.astro` | Modified — import and wire `LangSwitcher` |
| `apps/nicaragua-projekt/src/configure/features.ts` | Modified — add `features.header.langSwitcher` flag |
| `apps/nicaragua-projekt/src/utils/localization.ts` | Modified — add `getSupportedLanguageCodes()` and `getLocalizedUrl()` helpers (adapted from `apps/main`) |

### Output format

No JSON output — UI component only.

### Failure modes

- If `lang` prop is an unsupported code, the component falls back to showing all languages unhighlighted (no crash).
- If `currentPath` cannot be parsed into a sibling URL, links fall back to `/{langCode}/`.

## Rollout

1. **Phase 1 (this RFC)**: Implement in `nicaragua-projekt` only, behind `features.header.langSwitcher` defaulting to `true`.
2. **Phase 2 (future RFC)**: Port to `apps/main` and `apps/my-main` by copying `lang-switcher.astro` + `lang-switcher.css`, adding feature flag, wiring into each app's header. Each port gets its own RFC checklist item or a lightweight follow-up RFC.

New apps automatically comply from day one by following the same copy-and-wire pattern described in the agent notes below.

## Alternatives considered

- **Extract to `packages/`**: Rejected — the component is 30 lines of Astro markup. The overhead of a shared package is not justified; portability is achieved by a documented copy pattern.
- **React island for interactivity**: Rejected — cyclic navigation via `<a>` tags requires zero JS. A pure Astro component with CSS is sufficient and aligns with the "no unnecessary JS" invariant.
- **Dropdown menu**: Rejected — with 2 languages a dropdown is over-engineered. A flat list of alpha-2 labels scales acceptably to ~5 languages without a dropdown.

## Risks

- **Style token drift**: If `--ds-*` tokens for active/inactive states are not defined, the switcher may fall back to unstyled text. Mitigation: define explicit fallback values in `lang-switcher.css`.
- **Agents porting without reading this RFC**: An agent might copy the component but forget the feature flag or the CSS. Mitigation: the Implementation notes section below is explicit.

## Acceptance criteria

- [x] `lang-switcher.astro` created in `src/components/` with correct props contract (evidence: implemented historically)
- [x] `lang-switcher.css` created in `src/styles/components/` using `--ds-*` tokens (evidence: implemented historically)
- [x] `features.header.langSwitcher` flag added to `src/configure/features.ts` (evidence: implemented historically)
- [x] `header.astro` imports and renders `LangSwitcher` in the right-side slot, guarded by feature flag (evidence: implemented historically)
- [x] `src/utils/localization.ts` extended with `getSupportedLanguageCodes()` and `getLocalizedUrl()` (evidence: implemented historically)
- [x] Active language is visually indicated (bold or underline via CSS) (evidence: implemented historically)
- [x] Clicking a non-active language navigates to the same path under that language prefix (evidence: implemented historically)
- [x] `rfc.validate` passes on this file (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has `status: accepted`.
- Agents MUST NOT change `status` in any RFC.
- When implementing, reference `RFC-0002` in commit messages or PR descriptions.
- Localization utilities (`getSupportedLanguageCodes`, `getLocalizedUrl`) MUST be added to `apps/nicaragua-projekt/src/utils/localization.ts` — adapted from `apps/main/src/utils/localization.ts`. Do NOT move them to `packages/`.
- The component MUST receive `lang` and `currentPath` as props — never read from `Astro.url` inside the component (keep it testable and portable).
- CSS MUST use `--ds-*` design tokens from `src/styles/` for all colors and spacing.
- When porting to another app, copy `lang-switcher.astro` + `lang-switcher.css`, add the feature flag in that app's `features.ts`, and wire the import in that app's `header.astro`. No other files should need to change.
- Agents MUST NOT weaken or remove the feature flag gate established by this RFC without a new RFC that supersedes it.
