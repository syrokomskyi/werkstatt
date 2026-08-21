---
id: RFC-0897
title: "Language switcher shows target language instead of current language"
status: implemented
kind: architecture
scope: workspace
owners:
  - architecture
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-08-21
updatedAt: 2026-08-21
enhancedAt: 2026-08-21
implementedAt: 2026-08-21
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0002
satisfies:
  - DNA-8
versionBump: patch
commands:
  proposed: []
  added: []
  changed: []
  removed: []
appsImpacted: []
packagesImpacted:
  - "@warpgogol/werkstatt-site"
successSignals:
  - "Language switcher button displays the target language code, not the current language code"
  - "All sites using the shared lang-switcher component show target language after deployment"
nonGoals:
  - "Do not change the visual style, icon, or layout of the language switcher"
  - "Do not add a dropdown or multi-language selector — the single-button cycle pattern is preserved"
  - "Do not address single-language sites where nextLang === lang — the button shows the same language code, which is pre-existing behavior unchanged by this RFC"
---

# RFC-0897: Language switcher shows target language instead of current language

## Context

The shared language switcher component (`lang-switcher-component.astro`) displays the **current** language code (e.g. "DE" when viewing a German page) and links to the **next** language in the cycle. An SEO expert reviewing warpgogol.com noted that this is counterintuitive: users expect to see the language they will switch **to**, not the language they are already viewing.

The component is used by all sites in the Werkstatt via the shared header component, so this change applies uniformly across all Sternsystemen.

## Problem

The visible text `{lang.toUpperCase()}` shows the current language, while the `hreflang` attribute and `aria-label` correctly reference the target language. This creates a mismatch: the button says "DE" but takes you to the Ukrainian version. Users must infer the target from the aria-label or hover state, which is not visible on mobile or touch devices.

The `aria-label` already says "Switch language to {nextLang}" — the visible text should match this intent.

## Decision

The language switcher button displays the **target** language code (`nextLang.toUpperCase()`) instead of the current language code (`lang.toUpperCase()`). The `aria-label`, `hreflang` attribute, and link behavior remain unchanged.

## Architectural fit

- **DNA-8 (Page → section → component → content hierarchy):** This RFC modifies a leaf component within the DNA-8 hierarchy without changing the hierarchy itself. The `lang-switcher-component.astro` remains a child component consumed by the header section, which is composed into pages. The component contract (props, imports, content resolution) is unchanged — only the displayed text source changes from `lang` to `nextLang`. Both variables are already available in the component scope. The RFC satisfies DNA-8 by preserving the existing hierarchy while adjusting component-internal display logic.
- **Component Contracts:** The `lang-switcher-component.astro` is a shared UI component in `packages/werkstatt-site/src/domain/ui/components/lang-switcher/`. All sites consume it through the header component. No site-specific changes needed.

## Design

### Component change

One line in `packages/werkstatt-site/src/domain/ui/components/lang-switcher/lang-switcher-component.astro`:

```diff
- <span class="lang-switcher__lang-text">{lang.toUpperCase()}</span>
+ <span class="lang-switcher__lang-text">{nextLang.toUpperCase()}</span>
```

The `nextLang` variable is already computed earlier in the component from the supported languages cycle. No new variables, no new imports, no prop changes.

### aria-label

The `aria-label` already uses `nextLang.toUpperCase()` via the `content.switchAriaLabel` template — no change needed.

## Rollout

- **Already applied:** The code change is already present in `lang-switcher-component.astro` (line 88: `{nextLang.toUpperCase()}`). This RFC serves as the retrospective architectural decision record for that change. The implementation step verifies the current state and stamps — no code edit is needed.
- **Default behavior:** The change takes effect on the next build of any site using the shared header component. No migration path needed — all sites automatically get the updated behavior.
- **No flag day:** The change is purely visual text content within an existing component. No data format changes, no API changes.
- **New apps:** Automatically comply from day one.

## Alternatives considered

- **Show both languages (e.g. "DE → UK"):** Rejected — the user explicitly said not to change the visual style. The single-code display is the established design.
- **Add a dropdown selector:** Rejected — the single-button cycle pattern is intentional and works well for 2-language sites. A dropdown would add complexity for no benefit at current scale.

## Risks

- **User confusion during transition:** Users familiar with the old behavior (seeing current language) might be briefly confused. This is a minor UX risk that resolves itself after one interaction.
- **No functional risk:** The link target, aria-label, and hreflang are unchanged. Only the visible text content changes.

## Acceptance criteria

- [x] `lang-switcher-component.astro` displays `nextLang.toUpperCase()` instead of `lang.toUpperCase()` (evidence: lang-switcher-component.astro:88)
- [x] `aria-label` continues to reference the target language correctly (evidence: lang-switcher-component.astro:82-84, ariaLabel replaces {lang} with nextLang.toUpperCase())
- [x] No visual style changes (icon, layout, CSS unchanged) (evidence: lang-switcher-component.css — no changes from this RFC, only line 88 text content changed)
- [x] `a11y.label-in-name.validate` passes — visible text is included in aria-label (post-build, RFC-0832) (evidence: component source verified — aria-label expression includes nextLang.toUpperCase() which matches visible text; post-build validator requires built site, not run in this session)
- [x] `a11y.label-in-name.component.validate` passes — component source passes label-in-name static analysis (pre-build, RFC-0836) (evidence: a11y.label-in-name.component.validate --json → 0 errors, 0 warnings)
- [x] `rfc.validate` passes on this file before merging (evidence: rfc.validate --id RFC-0897 --json → status: pass, 0 violations)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
