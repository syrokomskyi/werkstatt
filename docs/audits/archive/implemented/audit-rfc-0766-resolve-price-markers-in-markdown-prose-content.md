---
rfcId: RFC-0766
auditId: AUDIT-RFC-0766-01
date: 2026-08-08
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0766

## Verdict: Needs revision

The RFC correctly identifies the gap (price markers in prose) and proposes a sound post-render HTML replacement approach. However, it does not address two of the three rendering paths in `prose-pipeline.ts` (`animateNumbers` and inline body), and the proposed `<div>` HTML structure creates invalid HTML when inserted inside micromark-generated `<p>` elements.

## Mechanical validation (rfc.validate)

Pass — zero violations.

## Axis A — Structural completeness

1. **`animateNumbers` path not addressed.** `prose-pipeline.ts` lines 153-177: when `animateNumbers` is true, the pipeline returns HTML early (before the `hasReferences` and `markdownHasImages` checks). If a prose file has both `animateNumbers: true` and `{price:...}` markers, the markers survive as literal text in the returned HTML because `resolvePriceMarkersInHtml` is never called on this path. The RFC's Design section only describes adding the check "after resolving content references" (step 6 in the pipeline), but the `animateNumbers` path (step 5) returns before that point. The RFC must specify that `resolvePriceMarkersInHtml` is also applied on the `animateNumbers` path, or explain why this combination is not a concern.

2. **Inline body path not addressed.** `prose-pipeline.ts` lines 110-127: when no `contentRef` is provided but a `body` string is, the pipeline renders via micromark and returns `{ kind: "html", html }`. If the inline body contains `{price:...}` markers, they would be in the HTML as literal text. The RFC's `hasPriceMarkers` detection and `resolvePriceMarkersInHtml` post-processing are not specified for this path. The RFC should either address this path or add it to `nonGoals`.

3. **HTML example omits `note` element.** The RFC's HTML example in section 3 shows `<span class="currency-aware-price-display__amount">` but does not include the `<p class="currency-aware-price-display__note">{variant.note}</p>` element that the actual `CurrencyAwarePriceDisplay` component renders when `variant.note` is present (see `currency-aware-price-display-component.astro` line 46). The `renderPriceDisplayHtml` function must handle notes to produce HTML identical to the component.

4. **`buildPriceVariants` null return not specified.** `buildPriceVariants` returns `null` when fewer than 2 variants are available (single-currency or no derived prices). The existing `parsePriceMarkers` pattern in `section-paragraphs.astro` renders nothing for null variants (`part.variants ? <CurrencyAwarePriceDisplay .../> : null`). The RFC does not specify what `renderPriceDisplayHtml` returns when `buildPriceVariants` returns `null`. This should be documented (likely return empty string or the original marker text).

## Axis B — DNA alignment

No issues. `satisfies: [DNA-4]` is correctly justified: price markers resolve from `derived-prices.generated.json` derived from PBP offering entities in `src/content/`. No new DNA invariant established. No conflicts with existing DNA.

## Axis C — Ecosystem fit

1. **AGENTS.md update not mentioned.** `packages/ui/AGENTS.md` has a "Dynamic pricing in UI components" section (lines 382-389) that lists where price markers are supported: `hero-decision-card`, `SectionHeader`, `SectionParagraphs`, `SectionCardGrid`, `SectionList`, `faq-list`. After this RFC, prose content should be added to that list. The RFC's "File system responsibilities" table does not include `packages/ui/AGENTS.md`. The RFC should mention this documentation update.

2. **Compass sync not addressed.** The RFC does not mention whether `docs/styling.xml` or other Compass documents need synchronization. Since the change is internal to `packages/ui` rendering logic and does not alter the cross-workspace contract surface, no Compass sync is likely needed — but the RFC should state this explicitly.

## Axis D — Forward-only compliance

No issues. No compatibility shim, no dual-path, no legacy code maintained. The new micromark path replaces the Astro render() path when markers are detected — this is the implementation approach, not a parallel interpretation.

## Axis E — Agent-facing policy

1. **Implementation notes lack governance RFC references.** The implementation notes say "Agents MAY implement code changes ONLY when this RFC has status: accepted" but do not reference specific governance RFC numbers for the accepted→implemented transition, supersede escalation on invariant conflict, or verification evidence. Other RFCs in this repo typically reference RFC-0476 (stamp command), RFC-0331 (satisfies), etc. The notes should cite the relevant governance RFCs.

No self-authorizing language found. No NEEDS CLARIFICATION markers. Storage policy not applicable.

## Axis F — Pragmatism

1. **"Same regex" claim is misleading.** Section 1 says `hasPriceMarkers` uses "the same regex as `parsePriceMarkers`" but defines it without the `g` flag (`/\{price:...}/` vs `/\{price:...}/g`). This is correct for `.test()` (the `g` flag would advance `lastIndex` and cause false negatives on repeated calls), but the prose claim is inaccurate. Should say "same pattern" or acknowledge the flag difference.

No other issues. No new commands proposed. TypeScript contracts are minimal. Existing `buildPriceVariants` and `loadDerivedPrices` are reused. `packagesImpacted` and `nonGoals` are accurate.

## Axis G — Blind spots

1. **`<div>` inside `<p>` HTML validity.** Micromark renders prose body as `<p>` elements. When a price marker appears inside a paragraph, the post-processing replaces it with a `<div class="currency-aware-price-display">` — creating `<p>...<div>...</div>...</p>`, which is invalid HTML (block-level element inside inline-only `<p>`). Browsers auto-close the `<p>` before the `<div>`, breaking paragraph structure. The existing `section-paragraphs.astro` has the same issue (Astro component renders `<div>` inside `<p>`), but prose content is a new surface where this is more likely to occur mid-sentence. The RFC should either: (a) use `<span>` elements with `display: inline-block` for the prose context, or (b) explicitly accept this as consistent with the existing pattern and document it. The `currency-aware-price-display-component.css` uses `display: block` for all elements, and the AGENTS.md rule about `display: inline` (line 388) appears to be unimplemented in the actual CSS.

2. **Footnotes loss not in Risks.** Prose files with price markers are forced to the micromark path, losing Astro `render()` features like footnotes and auto-generated heading IDs (though `injectHeadingIds` in the pipeline does add IDs). This is acknowledged in `nonGoals` but not in `Risks`. Since it is a user-facing impact (authors who need footnotes cannot use price markers in the same prose file), it belongs in `Risks` with a mitigation (e.g., "authors who need footnotes should not use price markers, or a future RFC can add footnote support to the micromark path").

3. **Code/pre skipping strategy under-specified.** The RFC says "skip markers inside `<code>` or `<pre>` elements" and suggests "use a negative lookbehind or split-and-skip approach" but does not specify the concrete implementation. A regex-based replacement on HTML is fragile — it could match inside attribute values, `<code>` blocks, or `<pre>` blocks. The RFC should specify the exact strategy (e.g., split HTML by `<code>...</code>` and `<pre>...</pre>` segments, only replace markers in non-code segments).

## Questions for the author

1. What happens when `animateNumbers: true` and the prose body contains `{price:...}` markers? Should `resolvePriceMarkersInHtml` be applied after `wrapInlineNumbers` on the `animateNumbers` path?
2. Should `renderPriceDisplayHtml` use `<span>` elements instead of `<div>` to avoid invalid HTML when markers appear inside `<p>` elements from micromark? Or is the existing `section-paragraphs.astro` pattern (block `<div>` inside `<p>`) considered acceptable?
3. What does `renderPriceDisplayHtml` return when `buildPriceVariants` returns `null` (single-currency or no derived prices)? Empty string? The original marker text? A fallback `<span>` with the source price?
