---
id: RFC-0765
title: "Document price marker syntax as component-level shorthand"
status: draft
kind: policy
scope: workspace
owners:
  - architecture
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-08-08
updatedAt: 2026-08-08
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends:
  - RFC-0529
  - RFC-0723
amendedBy: []
related:
  - RFC-0527
  - RFC-0570
  - RFC-0740
  - RFC-0743
  - ADR-0033
satisfies:
  - DNA-4
  - DNA-24
versionBump: none
commands:
  proposed: []
  added: []
  changed: []
  removed: []
appsImpacted: []
packagesImpacted:
  - "@warpgogol/ui"
successSignals:
  - "AGENTS.md (root) contains a dedicated section listing all three content-syntax mechanisms with clear examples"
  - "packages/ui/AGENTS.md documents {price:offering:chargeRef} marker syntax"
  - "AI agents correctly distinguish content references, formula expressions, and price markers without confusion"
  - "No agent attempts to migrate {price:...} markers to =(ref) syntax or vice versa"
nonGoals:
  - "Does not unify price markers with =(ref) formula syntax — they serve different layers and return different types"
  - "Does not change the price marker syntax itself — {price:offering:chargeRef} remains as-is"
  - "Does not add a validator for price markers — that is a future RFC if needed"
  - "Does not change formula-eval or content-reference resolution"
---

# RFC-0765: Document price marker syntax as component-level shorthand

## Context

The monorepo has three distinct string-embedding syntaxes that operate at different layers of the pipeline:

1. **Content references** (braceless `collection.file.field`) — resolved by `resolveReferencesInString` in `@warpgogol/share/content-reference.ts`. RFC-0529 removed brace-delimited `{collection.file.field}` syntax. RFC-0723 requires `=(ref)` formula syntax for content references inside mixed strings.

2. **Formula expressions** (`=(expression)`) — resolved by `resolveFormula` in `@warpgogol/share/formula-eval.ts`. RFC-0570 introduced `=(...)` for numeric arithmetic over content references. RFC-0723 extended it to return string values for single-reference expressions.

3. **Price markers** (`{price:offering-id:chargeRef}`) — parsed by `parsePriceMarkers` in `packages/ui/src/utils/price-marker.ts`. RFC-0743 and ADR-0033 established this syntax for embedding currency-aware price displays inside component text.

All three use different delimiters (`braceless`, `=(...)`, `{price:...}`) and operate at different pipeline stages. There is no central documentation that lists all three, explains their differences, and tells agents which to use when.

This caused real confusion during mission warpgogol-com-m000040: an agent questioned whether `{price:...}` markers should be migrated to `=(...)` formula syntax because RFC-0529 "removed curly braces." The RFCs are correct — RFC-0529 removed brace-delimited **content references**, not price markers — but the absence of a single reference point created ambiguity.

## Problem

AI agents cannot reliably distinguish the three syntaxes because:

- **No central reference:** No AGENTS.md section lists all three mechanisms side-by-side with examples and layer boundaries.
- **Visual similarity:** `{price:...}` markers use curly braces, which visually resembles the retired `{collection.file.field}` content reference syntax. Agents who know RFC-0529 may incorrectly assume all `{...}` patterns are deprecated.
- **Pipeline confusion:** `=(...)` formulas are resolved by the page handler **before** the component renders. `{price:...}` markers are parsed **inside** the component during render. Agents do not know which layer owns which syntax.
- **Wrong substitution risk:** An agent might replace `{price:referral-fee:activation}` with `=(business-profile.offerings/referral-fee.pricing.charges.activation.amount.value)`, which would return a plain string (`"70"`) and break `CurrencyAwarePriceDisplay` rendering — the currency switcher would stop working.

## Decision

The root `AGENTS.md` gains a dedicated section titled "Content syntax reference" that documents all three string-embedding mechanisms with their layer, pipeline stage, return type, and examples. The `packages/ui/AGENTS.md` gains a price marker entry in its documentation.

This is a documentation-only RFC. No code changes, no validators, no migrations.

### The three mechanisms

| Mechanism | Syntax | Layer | Pipeline stage | Return type | Owner |
| --- | --- | --- | --- | --- | --- |
| Content reference (pure) | `collection.file.field` | Content | Page handler (`resolveReferencesInString`) | String (raw field value) | `@warpgogol/share` |
| Content reference (mixed string) | `=(collection.file.field)` | Content | Page handler (`resolveFormula`) | String or number | `@warpgogol/share` |
| Formula expression | `=(ref + ref * 2)` | Content | Page handler (`resolveFormula`) | Number (string result) | `@warpgogol/share` |
| Price marker | `{price:offering-id:chargeRef}` | Presentation | Component render (`parsePriceMarkers`) | `CurrencyAwarePriceDisplay` component | `@warpgogol/ui` |

### Key distinctions

1. **`=(...)` returns a string.** The component receives a plain string value. It does not create interactive UI components.

2. **`{price:...}` returns a component.** `parsePriceMarkers` splits the text into `TextPart[]` and `PricePart[]`. Each `PricePart` carries pre-built currency variants (EUR, UAH, etc.) and renders as a `<CurrencyAwarePriceDisplay>` with `data-currency` attributes for client-side switching.

3. **They cannot substitute for each other.** Replacing `{price:...}` with `=(...)` breaks currency switching. Replacing `=(...)` with `{price:...}` is impossible because `=(...)` expressions are arbitrary arithmetic, not offering/charge references.

4. **`{price:...}` is NOT a content reference.** RFC-0529 removed brace-delimited content references (`{collection.file.field}`). Price markers are a component-level shorthand parsed by `packages/ui`, not by `@warpgogol/share`. The curly braces in `{price:...}` are a different namespace — they do not conflict with RFC-0529.

### When to use which

- **Business data (email, address, legal name):** `=(business-profile.contact/general-email.value)` in mixed strings, or bare `business-profile.contact/general-email.value` as a pure field.
- **Numeric arithmetic over content references:** `=(business-profile.offerings/digital-foundation.pricing.charges.monthlySubscription.amount.value * 12)` with `| money` pipe for formatting.
- **Structured price props (amount, currency, recurrence):** `=(business-profile.offerings/referral-fee.pricing.charges.activation.amount.value)` — the component receives the value as a prop and builds its own display.
- **Inline price in text (currency-aware):** `{price:referral-fee:activation}` — the component creates a `CurrencyAwarePriceDisplay` with EUR/UAH variants at this position in the text.

## Architectural fit

- **DNA-4 (Canonical content in `src/content/`).** All three syntaxes resolve values from `src/content/` — content references from `content-ref-index.generated.yaml`, price markers from `derived-prices.generated.json` (which is derived from PBP entity files in `src/content/business-profile/`).
- **DNA-24 (Block-declarative pages).** Page block props use `=(...)` for structured values and `{price:...}` for inline currency-aware text. Both are authored in frontmatter `props` values.
- **RFC-0529 (braceless migration).** This RFC amends RFC-0529 by clarifying that `{price:...}` markers are not content references and were never in scope of the brace removal.
- **RFC-0723 (formula syntax for mixed strings).** This RFC amends RFC-0723 by clarifying that `{price:...}` markers are not content references in mixed strings — they are component-level syntax parsed after content reference resolution.
- **RFC-0743 (currency selector UI).** This RFC documents the `{price:...}` marker syntax that RFC-0743's `CurrencyAwarePriceDisplay` component consumes.
- **ADR-0033 (competitor prices as PBP offerings).** This RFC documents the `{price:...}` marker syntax that ADR-0033 established for competitor price ranges.

## Design

### AGENTS.md section (root)

The following section is added to root `AGENTS.md`:

> **Content syntax reference**
>
> Three string-embedding mechanisms operate at different pipeline layers. Agents MUST use the correct one for each context.
>
> 1. **Content references** — `collection.file.field` (pure) or `=(collection.file.field)` (in mixed strings). Resolved by `@warpgogol/share` before the component renders. Returns a string. Use for business data (email, address, legal name) and structured props (amount, currency, recurrence). See RFC-0529, RFC-0723.
>
> 2. **Formula expressions** — `=(ref + ref * 2 | money currency=EUR)`. Resolved by `@warpgogol/share/formula-eval` before the component renders. Returns a formatted string. Use for numeric arithmetic over content references. See RFC-0570.
>
> 3. **Price markers** — `{price:offering-id:chargeRef}`. Parsed by `packages/ui/src/utils/price-marker.ts` during component render. Returns a `CurrencyAwarePriceDisplay` component with multi-currency variants. Use for inline currency-aware prices in component text. See RFC-0743, ADR-0033.
>
> **`{price:...}` is NOT a content reference.** RFC-0529 removed brace-delimited content references (`{collection.file.field}`). Price markers are a separate component-level namespace. Do not migrate `{price:...}` to `=(...)` — this breaks currency switching.
>
> **`=(...)` cannot create interactive components.** It returns a plain string. If you need currency-aware price display, use `{price:...}` markers.

### packages/ui/AGENTS.md entry

The following entry is added to `packages/ui/AGENTS.md`:

> **Price marker syntax (`{price:offering-id:chargeRef}`).** Parsed by `parsePriceMarkers` in `packages/ui/src/utils/price-marker.ts`. Resolves offering prices from `derived-prices.generated.json` and renders `CurrencyAwarePriceDisplay` with multi-currency variants. Used in `hero-decision-card` `decisionCard.items[].value` and other component text fields that support inline price display. This is a presentation-layer shorthand, not a content reference — do not migrate to `=(...)` formula syntax.

### File system responsibilities

| Path | Role |
| --- | --- |
| `AGENTS.md` (root) | New "Content syntax reference" section |
| `packages/ui/AGENTS.md` | New price marker documentation entry |

## Rollout

- **Immediate:** Upon acceptance, AGENTS.md sections are added.
- **No code changes:** No validators, no migrations, no package changes.
- **No flag day:** Documentation is additive — existing content is unaffected.
- **Agent behavior:** Agents read AGENTS.md at session start and will see the new section. No migration needed — agents simply follow the documented rules going forward.

## Alternatives considered

1. **Unify price markers with `=(...)` formula syntax** — rejected. `=(...)` returns a string; `CurrencyAwarePriceDisplay` requires structured price variants (array of `{currency, formatted, note}`). Unifying would require `resolveFormula` to return structured data instead of strings, mixing content and presentation layers. Additionally, the `=(...)` syntax for the same operation would be significantly longer: `=(business-profile.offerings/referral-fee.pricing.charges.activation.amount.value | price chargeRef=activation)` vs `{price:referral-fee:activation}`. The shorthand is a deliberate domain-specific abbreviation for a frequent operation.

2. **Change `{price:...}` to non-brace syntax (e.g. `@(price:...)`)** — rejected. The curly braces in `{price:...}` are a different namespace from content references. Changing the syntax would require migrating all existing content files and updating `parsePriceMarkers` for no functional benefit. The confusion is solved by documentation, not by syntax change.

3. **Add a validator that flags `{price:...}` as a potential deprecated brace pattern** — rejected. `{price:...}` is not deprecated. A validator would create false positives and add maintenance burden. Documentation is the correct tool here.

4. **Do nothing — agents should read the RFCs** — rejected. Three RFCs (0529, 0723, 0743) each describe one mechanism. No single document lists all three side-by-side. Agents who read RFC-0529 in isolation may incorrectly conclude that all `{...}` patterns are deprecated.

## Risks

- **Documentation drift:** If new syntaxes are added in the future without updating the AGENTS.md section, the reference becomes stale. Mitigation: the section references RFC IDs, so agents can trace back to the authoritative source.
- **Agent non-compliance:** Agents may still confuse the syntaxes despite documentation. Mitigation: the section is concise and uses a table format that is easy to scan. The key rule ("do not migrate `{price:...}` to `=(...)`") is stated explicitly.
- **No automated enforcement:** This RFC does not add a validator. If an agent incorrectly replaces `{price:...}` with `=(...)`, the build will succeed but currency switching will break silently. Mitigation: the AGENTS.md section is the primary defense. A future RFC may add a validator if the problem persists.

## Acceptance criteria

- [ ] Root `AGENTS.md` contains a "Content syntax reference" section listing all three mechanisms with syntax, layer, return type, and examples
- [ ] `packages/ui/AGENTS.md` contains a price marker documentation entry
- [ ] The section explicitly states that `{price:...}` is NOT a content reference and must not be migrated to `=(...)`
- [ ] `rfc.validate` passes on this file

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT use `=(...)` formula syntax where `{price:...}` markers are needed — `=(...)` returns a string, not a `CurrencyAwarePriceDisplay`.
- Agents MUST NOT migrate `{price:...}` markers to `=(...)` formula syntax — they are different mechanisms at different pipeline layers.
- Agents MUST NOT treat `{price:...}` as a deprecated brace-delimited content reference — it is a component-level shorthand established by RFC-0743 and ADR-0033.
