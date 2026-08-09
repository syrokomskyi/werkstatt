---
rfc: RFC-0767
createdAt: 2026-08-08
personas: [architect, security, qa, pm, dev-advocate]
consensusFindings: 2
uniqueFindings: 3
---

# Design Summit: RFC-0767

## Architect

### Findings

- **A1 (concern):** The RFC (section 3, line 128) states "`loadDerivedPrices` stays in `packages/ui`" and "the semantic layer loads the file once at the `buildSemanticPageModelWith` level and passes the result as a parameter." However, `build-page.ts` module contract (lines 4-8) explicitly says "Do not read files — all I/O flows through the injected reader." The plan (Step 4) resolves this by adding `getDerivedPrices()` to `SemanticContentReader` — but the RFC itself still says `loadDerivedPrices` stays in `packages/ui`, which contradicts the plan's approach of moving it to `packages/share/semantic/derived-prices-loader.ts`. The RFC should be updated to reflect the actual design: `loadDerivedPrices` moves to `packages/share` as a Node-only subpath, and derived prices are accessed via `reader.getDerivedPrices()`.

- **A2 (concern):** The RFC's `satisfies[]` lists only DNA-4, but the audit (Axis B) noted DNA-16 was originally listed and questioned. The enhanced RFC removed DNA-16 — good. However, the RFC does not mention DNA-16 in `related[]` either. Since the semantic layer is the core of DNA-16, and this RFC modifies `buildSemanticPageModelWith` (the central semantic builder), a brief note in `related[]` or `Architectural fit` explaining why DNA-16 is NOT affected would prevent future confusion.

### No concerns

- The type relocation pattern (`DerivedPriceEntry` → `packages/share`) is the correct approach for breaking the circular dependency. The plan's split into pure functions (`price-marker-resolver.ts`) and Node-only loader (`derived-prices-loader.ts`) correctly avoids pulling `node:fs` into the semantic barrel.
- The resolution point (after `extractPageHeading`, before `buildMarkdownPageSemantic`) is well-chosen — it's the narrowest seam where all three fields (heading, lead, description) are available.

## Security Engineer

### Findings

- **S1 (concern):** The RFC resolves price markers to EUR strings in JSON-LD and meta tags. Price information is public business data (not PII), so exposure is low-risk. However, the fallback behavior for unknown offerings resolves to `"0\u00A0€"` — a zero price in JSON-LD could be misinterpreted by search engines as a "free" offer. This is a data integrity issue, not a security issue, but worth noting: a malformed `derived-prices.generated.json` or a typo in an offering ID could silently produce `"0 €"` in structured data, which search engines may index as "free."

## QA Engineer

### Findings

- **Q1 (concern):** The plan's test matrix (Step 6) covers `resolvePriceMarkersForSemantic` and `formatSourcePrice` in isolation, but does not include an integration test for `buildSemanticPageModelWith` with a mock reader that returns derived prices. The acceptance criteria include "JSON-LD `headline` contains resolved EUR price string" and "Pages without price markers have unchanged JSON-LD" — these require testing through the builder, not just the resolver function. A test that constructs a mock `SemanticContentReader` with `getDerivedPrices()` returning a fixture and verifies the `SemanticPageModel.heading` contains resolved prices would close this gap.

- **Q2 (question):** The RFC says malformed JSON throws (build fails loudly). The plan's `loadDerivedPrices` in `derived-prices-loader.ts` propagates `SyntaxError` from `JSON.parse`. Is there a test for this? The test matrix (Step 6) does not include a "malformed JSON throws" test case. This acceptance criterion is checkable by a unit test — it should be added.

## Product Manager

### Findings

- **P1 (concern):** The RFC's `nonGoals` exclude "block-derived SemanticBlock content (items, body, summaries)" from price marker resolution. This is a pragmatic scope boundary. However, the audit (Axis G, line 57) noted that `extractContentBlocks` extracts text from block props into `SemanticBlock[]`, and block props with `{price:...}` markers would flow into `SemanticBlock.items[].title` and potentially into JSON-LD `ItemList` nodes. The nonGoal is explicit, but there's no mention of whether this is a known limitation to document for content authors or a future RFC concern. A brief note in `Rollout` or `Risks` saying "block-derived content with markers is a known gap, addressed by a future RFC" would set expectations.

### No concerns

- The problem statement is grounded in a real issue: JSON-LD currently contains literal `{price:...}` marker syntax, which is meaningless to search engines.
- The rollout is additive — no content migration needed, existing frontmatter without markers is unaffected.
- Scope is correctly bounded: resolve markers in heading, lead, description only.

## Developer Advocate

### Findings

- **D1 (concern):** The RFC (section 3, line 128) says `loadDerivedPrices` "stays in `packages/ui`" but the plan moves it to `packages/share/semantic/derived-prices-loader.ts`. An agent implementing this RFC by reading only the RFC (not the plan) would look for `loadDerivedPrices` in `packages/ui` and miss the relocation. The RFC's File system responsibilities table (lines 150-155) does not mention `derived-prices-loader.ts` or the `SemanticContentReader.getDerivedPrices()` method. The RFC should be updated to match the plan's design.

- **D2 (question):** The RFC's TypeScript contract (lines 207-211) shows `resolvePriceMarkersForSemantic` taking `derivedPrices?: Record<string, DerivedPriceEntry[]> | null` as a third parameter. But the example code (lines 102-104) calls it with only two arguments: `resolvePriceMarkersForSemantic(heading, lang)`. An agent following the example would omit the `derivedPrices` parameter. The example should be updated to show the third parameter, or the function should default to loading derived prices internally (which would violate the I/O contract).

## Consensus findings

- **A1 + D1 (2 personas):** RFC text contradicts plan design regarding `loadDerivedPrices` location and `SemanticContentReader.getDerivedPrices()`. The RFC still says `loadDerivedPrices` stays in `packages/ui`, but the plan (post-grilling) moves it to `packages/share/semantic/derived-prices-loader.ts` and adds `getDerivedPrices()` to the reader interface. The RFC's File system responsibilities table and section 3 need updating to match. **Recommendation:** Update the RFC to reflect the reader interface approach before implementation.

- **Q1 + Q2 (2 personas):** Test matrix is incomplete. No integration test for `buildSemanticPageModelWith` with mock reader, and no test for malformed JSON throwing behavior. **Recommendation:** Add both test cases to the plan's Step 6.

## Unique findings

- **A2 (Architect):** Consider adding a note explaining why DNA-16 is NOT affected, to prevent future confusion.
- **S1 (Security):** Zero-price fallback in JSON-LD could be misinterpreted as "free" by search engines — data integrity concern.
- **P1 (PM):** Block-derived content with markers is a known gap — document it as a future RFC concern.
- **D2 (Dev Advocate):** Example code (lines 102-104) shows 2-arg call but TypeScript contract shows 3-arg signature — inconsistency.

## Recommendation

**Revise the RFC** before implementation. Two consensus findings require RFC text updates:

1. Update section 3, File system responsibilities table, and TypeScript contracts to reflect `loadDerivedPrices` moving to `packages/share/semantic/derived-prices-loader.ts` and `SemanticContentReader.getDerivedPrices()` being the access path.
2. Fix the example code (lines 102-104) to show the `derivedPrices` parameter being passed.

Additionally, update the plan's Step 6 to add:

- Integration test for `buildSemanticPageModelWith` with mock reader returning derived prices fixture
- Unit test for malformed JSON throwing behavior

No findings require `fo-explore` — all issues have clear resolutions.

---

_No findings does not mean no issues — it means no issues were found from these five perspectives._
