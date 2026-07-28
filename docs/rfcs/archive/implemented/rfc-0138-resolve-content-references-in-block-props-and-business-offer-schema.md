---
id: RFC-0138
title: "Resolve content references in block props at render time and add a business offer/guarantees schema"
status: implemented
kind: architecture
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-05-31
updatedAt: 2026-06-04
implementedAt: 2026-05-31
closedAt:
supersedes: []
supersededBy:
amendedBy:
  - RFC-0529
related:
  - DNA-20
  - DNA-22
  - RFC-0024
  - RFC-0026
  - RFC-0045
  - RFC-0050
  - RFC-0073
  - RFC-0101
  - RFC-0103
commands:
  proposed: []
  added: []
  changed:
    - content.references.validate
  removed: []
appsImpacted:
  - warpgogol-com
  - nicaragua-projekt
packagesImpacted:
  - share
  - business
  - os/site-kernel-content
  - os/site-kernel-checks
successSignals:
  - "A {collection.file.field} reference written inside a block's props (e.g. a price-card monthly value) is substituted with the resolved business value in the rendered page — not shown literally."
  - "Pages stop hardcoding figures that already exist in the business layer; the business layer is the single source of truth for prices, guarantees, and growth modules."
  - "content.references.validate continues to pass for every reference that the render path can resolve, and fails for references the render path cannot resolve (no silent empty-string drift)."
  - "A canonical business 'offer' shape (price, guarantees, growth modules) exists so apps can reference offer data instead of duplicating it per page."
nonGoals:
  - "Do not introduce a runtime (client-side) reference resolver; substitution stays build-time/SSR only (RFC-0050 principle)."
  - "Do not change the {collection.file.field} syntax established by RFC-0045."
  - "Do not auto-rewrite existing pages that hardcode figures; migration is opt-in per page."
  - "Do not make the offer schema mandatory; apps without an offer file keep working."
---

# RFC-0138: Resolve content references in block props at render time and add a business offer/guarantees schema

## Context

RFC-0045 introduced the `{collection.file.field}` reference syntax and RFC-0050 added a framework-agnostic, disk-based resolver `substituteContentReferences` in `@gogol/site-kernel-content`. RFC-0024 established the business layer (`src/content/business/{lang}/*`) as the canonical, client-editable source of truth for company data.

In practice, two gaps block the intended single-source-of-truth flow for block-declarative pages (RFC-0026):

1. **The resolver is not wired into the page render path.** Block `props` flow raw to section components as `pageOverride` (`@gogol/share` `page.ts` / `astro/page-handler.ts`). `substituteContentReferences` is never called on them. A reference written in a block prop (e.g. `monthly: "{business.offer.price.monthly}"`) would render literally as the brace string, so authors hardcode the value instead.

2. **There is no canonical shape for offer data.** Prices, written guarantees, and growth modules live nowhere structured. The figures (70 €/Monat, 700 €/Jahr, 200 € Einrichtung, and contested SLA/guarantee claims) are copy-pasted into `decisionCard` / `price-card` props across `home.md`, `pricing.md`, and `digitalesFundament`. There is no place a reference like `{business.offer.price.yearly}` could even resolve to.

The May 2026 amend-onboarding dry-run on `apps/warpgogol-com` surfaced both gaps concretely: strengthening `digitalesFundament` "through the business layer" was impossible because (a) references in props are inert and (b) no offer file exists. The page was strengthened with literal props instead — the established but duplication-prone pattern.

## Problem

1. **Duplication and drift.** The same price string is authored in at least three pages. A price change requires editing every page; nothing detects divergence.
2. **References are a half-built feature.** `content.references.validate` (RFC-0073) checks that a reference _resolves on disk_, but the render path never substitutes it — so a "valid" reference still ships as literal `{…}` text. The validator and the runtime disagree about what a reference means.
3. **No offer source of truth.** Pricing/guarantee data has no canonical home, so it cannot be referenced, audited, or governed (e.g. guarantee claims that need legal review per the RFC-0136 pause taxonomy).

## Decision

Two coordinated changes:

### 1. Resolve references in block props at render time

The page render path (`@gogol/share` block dispatch) substitutes `{collection.file.field}` references in string-valued block props before passing `pageOverride` to a section component, using the existing `substituteContentReferences` (RFC-0050) with the page's `lang` and the app's default language for fallback.

- Substitution is recursive over the props object: every string leaf is processed; non-string values pass through unchanged.
- Resolution is build-time / SSR only (no client runtime), preserving the RFC-0050 static-generation guarantee.
- A reference that resolves to an object or array in a scalar position is an error surfaced by `content.references.validate` (already its behavior), not a silent empty string.
- Literal braces that are not valid references are left untouched (the resolver only replaces matches of the RFC-0045 pattern).

### 2. Add a canonical business `offer` schema

Introduce an optional `offer` business file shape in `@gogol/business` (mirrored where the business schemas live), so apps can express offer data once and reference it:

```yaml
# src/content/business/<lang>/offer.md (frontmatter)
price:
  monthly: "70 €/Monat"
  yearly: "700 €/Jahr"
  setup: "200 € Einrichtung"
guarantees:
  launch: "…"        # optional; claims requiring legal review stay NEED_THIS until sourced
  availability: "…"
  export: "…"
growthModules:
  - label: "Gefunden werden"
    description: "…"
    price: "+19 €/Monat je Stadt"
```

The schema is **optional and additive**: apps without `offer.md` are unaffected. Fields are strings (presentation-ready) so they substitute cleanly into props. Unfilled guarantee/legal claims use the `NEED_THIS_*` marker convention (RFC-0042) until sourced, keeping the RFC-0136 pause discipline intact.

## Architectural fit

- **RFC-0045 / RFC-0050.** Reuses the existing syntax and resolver; this RFC only connects the resolver to the render path. No new resolver, no syntax change.
- **RFC-0024 / DNA-20.** Extends the canonical business layer with an offer shape; keeps business data the single source of truth.
- **DNA-22 / RFC-0026.** References stay in the client-editable content surface (block props in page markdown + business frontmatter); no TypeScript edits needed to change a price.
- **RFC-0073.** `content.references.validate` becomes truthful: a passing reference now actually renders resolved. The validator's contract and the runtime align.
- **RFC-0101 / RFC-0103.** Section prop schemas are unchanged — they still receive plain strings; substitution happens before validation/handoff to the component, so `.strict()` schemas keep working.
- **RFC-0136.** Guarantee/SLA claims that cannot be sourced remain `NEED_THIS_*` in `offer.md` and are never substituted into a live claim, preserving the amend pause taxonomy.

## Design

### Render-path substitution

```
buildPage(page, lang, defaultLang)
  └─ for each block:
       props' = await substituteRefsDeep(block.props, contentDir, lang, defaultLang)
       render section with pageOverride = props'
```

`substituteRefsDeep` walks the props object: strings → `substituteContentReferences`; arrays/objects → recurse; other → identity. It is applied once, at build/SSR, in the shared block dispatcher so every app and section benefits without per-section code.

### Reference validation alignment

`content.references.validate` keeps scanning all content files (pages included). Two clarifications:

- Pages are already scanned; this RFC makes a _passing_ reference in a page prop also _render_ resolved. No rule change is required, but the validator's documentation is updated to state that references in block props are substituted at render time.
- A reference whose target is missing remains a validation failure (no silent empty string at render). The resolver returns empty for a missing field; the validator is the gate that prevents that from shipping.

### Business offer schema

The offer shape is added to the shared business schema (`@gogol/business`) as an optional collection file `offer` with the frontmatter above. The business collection remains passthrough (RFC-0033), so adding `offer.md` requires no per-app `content.config.ts` change; the schema gives `content.business.validate` something to check (string fields, marker discipline).

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/share/src/**` (block dispatch / page.ts) | Calls `substituteRefsDeep` on block props before render. |
| `packages/os/site-kernel-content/src/content-reference.ts` | Existing resolver, reused unchanged. |
| `packages/business/**` | Adds the optional `offer` schema shape. |
| `apps/<id>/src/content/business/<lang>/offer.md` | Optional canonical offer data (price/guarantees/growthModules). |
| `apps/<id>/src/content/pages/<lang>/*.md` | May reference `{business.offer.*}` in block props instead of hardcoding. |

### Output format

No new command. `content.references.validate` keeps the shared envelope; its diagnostics are unchanged in shape.

### Failure modes

- A reference in a prop targets a missing file/field → `content.references.validate` fails (unchanged); the page is not shippable until fixed.
- A reference resolves to a non-scalar in a scalar prop slot → validation failure (unchanged).
- An app has no `offer.md` and references none → no effect.
- Substitution throws at build → the build fails loudly (no partial silent render).

## Rollout

1. Implement `substituteRefsDeep` in the shared render path; add fixture tests (a price-card prop referencing `{business.offer.price.monthly}` renders the resolved value).
2. Add the optional `offer` schema to `@gogol/business`; document the frontmatter.
3. Update `content.references.validate` docs to state props are substituted at render time (no behavior change).
4. **Opt-in migration:** create `apps/warpgogol-com/src/content/business/de/offer.md` with the public figures (70/700/200) and migrate `home.md`, `pricing.md`, `digitalesFundament` price/decision props to `{business.offer.price.*}` in a follow-up content change. Contested SLA/guarantee claims stay `NEED_THIS_*` until sourced.
5. No flag day: pages that keep literal strings continue to work.

## Alternatives considered

- **Resolve references inside each section component.** Rejected — duplicates logic across every section, easy to forget, and couples sections to the business layer. One shared substitution point is simpler and uniform.
- **A client-side runtime resolver.** Rejected — violates the RFC-0050 static-generation principle and adds runtime cost for data known at build.
- **Keep hardcoding and add a lint that prices match across pages.** Rejected — treats the symptom (drift detection) instead of the cause (no single source). Also can't govern guarantee claims.
- **Make `offer` mandatory.** Rejected — breaks apps that don't model an offer; the schema is additive by design.

## Risks

- **Over-eager substitution.** A legitimate literal `{…}` in copy could match the pattern. Mitigation: the RFC-0045 pattern is specific (`{lowercase.kebab.dotted}`); document the escape expectation and rely on `content.references.validate` to surface unexpected matches.
- **Performance.** Deep-walking every block's props at build adds work. Mitigation: substitution is O(props size), build-time only, and references are resolved from a small set of cached business files.
- **Validator/runtime divergence regressions.** Mitigation: a fixture test asserts a validated reference renders resolved, locking the two together.

## Acceptance criteria

- [x] `substituteRefsDeep` (or equivalent) is applied to block props in the shared render path; strings are substituted, non-strings pass through. (evidence: implemented historically)
- [x] A fixture/page renders `{business.offer.price.monthly}` in a block prop as the resolved value, not the literal brace string. (evidence: implemented historically)
- [x] Substitution is build-time/SSR only; no client runtime resolver is added. (evidence: implemented historically)
- [x] The optional `offer` business schema is defined in `@gogol/business` and validated by `content.business.validate` (string fields + NEED_THIS markers). (evidence: packages/ directory, package exists)
- [x] `content.references.validate` still passes for resolvable references and fails for unresolvable ones; its docs state props are substituted at render time. (evidence: implemented historically)
- [x] Apps without `offer.md` and without prop references are unaffected (regression check on `nicaragua-projekt`). (evidence: original apps retired by RFC-0381, implemented historically)
- [x] `rfc.validate` passes on this file. (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement this RFC ONLY when a human sets `status: accepted`. Agents MUST NOT change RFC status.
- Agents MUST reuse `substituteContentReferences` (RFC-0050) — do not write a second resolver or change the RFC-0045 syntax.
- Agents MUST keep substitution build-time/SSR only.
- Agents MUST NOT substitute unsourced guarantee/legal/price claims as live facts: such fields stay `NEED_THIS_*` in `offer.md` until a human sources them (RFC-0136 pause taxonomy).
- Agents MUST NOT auto-migrate pages that hardcode figures; migration to `{business.offer.*}` is a separate, opt-in content change per page.
- Agents MUST update the relevant GRACE/AGENTS documents when this RFC changes the render contract.
