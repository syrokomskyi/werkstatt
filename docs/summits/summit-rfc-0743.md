---
rfc: RFC-0743
createdAt: 2026-08-07
personas: [architect, security, qa, pm, dev-advocate]
consensusFindings: 2
uniqueFindings: 5
---

# Design Summit: RFC-0743

## Architect

### Findings

- **A1 (concern):** `ComponentRole` is a closed enum (DNA-19) with 15 values. RFC-0743 introduces two new components but does not mention extending `ComponentRoleValues` in `packages/ontology/src/enums.ts`. The existing values (`lang-switcher`, `header`, `breadcrumbs`, etc.) do not cover `currency-selector` or `price-display`. Without new enum values, `manifest.contract.validate` will reject the manifests. This is a blocking omission — the plan must include a step to add `currency-selector` and `price-display` to `ComponentRoleValues`.

- **A2 (concern):** Component archetypes are missing. Every component has an archetype YAML in `packages/ontology/archetypes/components/<id>.yaml` (e.g. `lang-switcher.yaml`). RFC-0743 does not mention creating archetype files for `currency-selector` and `currency-aware-price-display`. Without archetypes, `archetype.registry.build` will not register the components, and `MOON_IMPORT_PATHS` will not be populated.

- **A3 (question):** The `currency-aware-price-display` component pre-renders all currency variants in HTML with `hidden` attributes. For a pricing page with 10 offerings and 5 currencies, this means 50 price variants in the DOM. Is this acceptable for performance? Should there be a limit on the number of currency variants pre-rendered?

### No concerns

- Mirror Quintet compliance is now correctly specified after enhancement (all fields listed, `.css` included, `contentTypesPath` added).
- Data flow is clearly described: route registry → page route → sections → component props.
- Forward-only discipline is respected — no shims, no dual-paths.

## Security Engineer

### Findings

- **S1 (concern):** `localStorage` key `wg-currency` stores user-selected currency. This is benign — no sensitive data. However, the RFC should note that `localStorage` is per-origin and persists indefinitely. If a user selects a currency and the site later removes that currency from the policy, the `localStorage` value becomes stale. The RFC already handles this in Failure Modes ("Unknown currency in localStorage — ignores it and defaults"), which is good.

### No concerns

- No cookies, no `Set-Cookie`, no server-side persistence.
- No authentication or authorization changes.
- No external API calls — all data is pre-materialized at build time.
- Entitlement gate is build-time, not runtime — no client-side feature flag bypass risk.

## QA Engineer

### Findings

- **Q1 (concern):** No test strategy defined. The RFC has acceptance criteria (`tsc --noEmit`, `vitest run`) but does not describe what to test. For `currency-selector-component.client.ts`: test `getSelectedCurrency()`, `setSelectedCurrency()`, `dispatchCurrencyChange()`. For `currency-aware-price-display-component.client.ts`: test that `wg-currency-change` event toggles `hidden` on the correct variant. The plan should include specific test files and test cases.

- **Q2 (concern):** Edge case: what happens when `currency-selector` dispatches `wg-currency-change` but no `currency-aware-price-display` is on the page? The event fires into the void — harmless, but should be documented as expected behavior.

- **Q3 (concern):** Edge case: multiple `currency-selector` instances on the same page (e.g. header + footer). Both read/write the same `localStorage` key. If the user changes one, the other does not update unless it also listens to `wg-currency-change`. The RFC should specify: does `currency-selector` listen to its own event to sync with other instances?

## Product Manager

### Findings

- **P1 (concern):** The RFC says the selector is placed in the header next to `lang-switcher`. On mobile, header space is limited. The RFC says "compact dropdown matching the lang-switcher's mobile pattern" but does not specify the exact mobile UX. Should it be in the mobile menu? A separate icon? This is a design detail that may need site-specific iteration.

### No concerns

- Problem statement is grounded: no currency selector exists, no persistence, no currency-aware display.
- `nonGoals` are explicit and meaningful: no price projection definition (RFC-0742), no build pipeline (RFC-0741), no runtime conversion, no new routes.
- Rollout is straightforward: components added to `@warpgogol/ui`, warpgogol-com integrates them.
- No backward compatibility concern — `currency-aware-price-display` complements, not replaces, `price-card`.

## Developer Advocate

### Findings

- **D1 (question):** The RFC references `PbpPriceProjection` from `@warpgogol/pbp` but does not show its shape. A new agent implementing this RFC needs to know the projection's fields (`formatted`, `note`, `currency`, etc.) to build the `priceVariants` array. The plan should include reading RFC-0742's `PbpPriceProjection` interface as a prerequisite step.

- **D2 (concern):** The RFC says "Content schema in `@warpgogol/ontology` (referenced via `contentSchemaKey`)" but existing components have `contentSchemaKey` matching their slug (e.g. `lang-switcher-component`) and the schema lives in the ontology package. The plan should specify where exactly the content schema is registered in `@warpgogol/ontology` — is it a new file? Which directory?

## Consensus findings

- **A1 + D2 (2 personas):** The RFC does not address the `ComponentRole` enum extension or the content schema registration in `@warpgogol/ontology`. Both are prerequisites for manifest validation. The plan must include steps for: (1) adding `currency-selector` and `price-display` to `ComponentRoleValues`, (2) creating component archetype YAMLs, (3) registering content schemas in the ontology package.

- **A2 + D2 (2 personas):** Component archetype files are missing from the RFC's file system table. The plan must add `packages/ontology/archetypes/components/currency-selector.yaml` and `packages/ontology/archetypes/components/currency-aware-price-display.yaml` to the file system responsibilities, plus rebuilding `archetypes/index.json`.

## Unique findings

- **A3:** DOM size concern with pre-rendered variants (50 price elements for 10 offerings × 5 currencies). Consider lazy rendering or a limit.
- **Q1:** No test strategy defined. Plan should specify test files and cases.
- **Q2:** Event fired with no listeners — document as expected.
- **Q3:** Multiple selector instances — sync behavior unspecified.
- **P1:** Mobile UX for header placement needs site-specific design.

## Recommendation

**Proceed to planning with findings integrated.** The consensus findings (A1+D2, A2+D2) are plan-level additions — the plan must include steps for `ComponentRole` enum extension, archetype creation, and content schema registration. The unique findings are minor and can be addressed during implementation.

No findings block RFC acceptance. The RFC is architecturally sound after enhancement. The summit adds plan-level detail that the RFC's enhanced version does not cover.

---

_No findings does not mean no issues — it means no issues were found from these five perspectives._
