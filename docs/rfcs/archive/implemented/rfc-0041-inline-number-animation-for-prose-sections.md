---
id: RFC-0041
title: "Inline number animation for prose sections (SSR pre-wrap + GSAP)"
status: implemented
kind: architecture
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-05-04
updatedAt: 2026-05-04
implementedAt: 2026-05-04
closedAt:
supersedes: []
supersededBy:
related:
  - RFC-0040
  - RFC-0011
  - RFC-0026
  - RFC-0035
  - RFC-0103
  - RFC-0106
  - RFC-0113
commands:
  proposed: []
  added: []
  changed: []
  removed: []
appsImpacted:
  - nicaragua-projekt
packagesImpacted:
  - share
  - ui
successSignals:
  - "Numbers in prose animate on scroll entry without causing layout shift (CLS = 0)"
  - "Non-year numbers animate at 3 s by default"
  - "Year numbers, paragraph refs (§ N), registration codes (VR 1520), and list numerals are never wrapped"
  - "Text flow is not disrupted — inline spans carry `display: inline-block; vertical-align: baseline; font: inherit`"
  - "GSAP is not loaded on pages without `.js-inline-number` elements"
  - "`prefers-reduced-motion` snaps all values to their final state without tweening"
  - "Authors edit only plain Markdown — no span markup in source files"
nonGoals:
  - "Animating numbers inside heading elements (h1–h4) — only body text and list items"
  - "Animating numbers that are part of a compound token without whitespace/punctuation boundary (e.g. 1st, 14-jährig, e.V.)"
  - "Adding this feature to sections other than Hyperion (markdown-section) and Mimas (team-section) in this RFC"
  - "Client-side DOM text-node mutation — SSR pre-wrap is the only accepted approach"
  - "Replacing or duplicating the RFC-0040 stat counter mechanism"
---

# RFC-0041: Inline number animation for prose sections (SSR pre-wrap + GSAP)

## Context

> **Updated by RFC-0103 + RFC-0106 (RFC-0113, 2026-05-27).** Inline-number animation in prose remains canonical; the authoring surface moved from `markdown.animateNumbers` to the `body.kind: rich` field `body.animateNumbers` consumed by `<SectionRich>` (RFC-0103). The wrap utility (`wrapInlineNumbers`) and the script (`inline-number-animation.ts`) are unchanged; only the section-level prop path moved into the body discriminator.

RFC-0040 introduced GSAP as the shared motion library and implemented animated counters for the `Ganymede` impact section. That mechanism relies on structured props (`numericValue`) set explicitly by authors in page frontmatter.

Prose sections — rendered via the `Hyperion` (`markdown-section`) component — contain numbers embedded in unstructured Markdown body text: years, ages, counts, and quantities. The `wir-ueber-uns` page is the primary example: bios of team members contain years like `1988`, `2005`, ages like `14`, `26`, and date ranges like `1939–2019`.

Authors should not be required to mark up individual numbers in Markdown source. The component itself must detect and wrap numbers at SSR/SSG time, preserving clean source files.

RFC-0011 S-2 orchestrator pattern and RFC-0040 GSAP infrastructure are reused. No new motion library is introduced.

## Problem

1. **Numbers in prose are invisible to the GSAP counter infrastructure.** The existing `.js-stat-counter` pattern requires explicit data attributes set at build time by a component. Prose rendered via `<Content />` produces plain text nodes — no spans, no data attributes.

2. **Client-side text-node mutation causes layout shift.** Wrapping numbers in `<span>` elements after hydration can change line breaks and element widths, producing measurable CLS. SSR pre-wrapping avoids this entirely because the span is present in the initial HTML payload.

3. **Years and large numbers animate for too long** if duration scales with value. A count-up from `0` to `1988` at a typical rate looks mechanical and slow. A fixed duration (3 s default) makes all numbers feel equally deliberate regardless of magnitude.

4. **Year numbers** (`1939`, `2021`) may be semantically different from counts (`14 Brigadistas`). Animating `0 → 1939` over 3 s is intentional and cinematic. Authors need per-section control to opt years in or out independently.

## Decision

1. **SSR pre-wrap via `wrapInlineNumbers` utility** — a new server-side function in `packages/share/src/` that accepts an HTML string and returns the same string with qualifying numbers replaced by `<span class="js-inline-number" data-numeric="…" data-is-year="…">…</span>`. Called in `markdown-section.astro` after Astro renders prose to HTML, before the template outputs it.

2. **Number detection regex** — matches integers ≥ 2 digits that are bounded by whitespace, punctuation, or string start/end, and not part of compound tokens (e.g. `1st`, `14-jährig`). See Design for the exact pattern.

3. **Year exclusion** — year numbers (`num >= 1200 && num <= currentYear + 120`) are **never wrapped**. Animating `0 → 1988` is visually misleading (the year is a label, not a quantity). The `animateYears` option is reserved in the API but treated as always `false`.

4. **Additional exclusion rules** — numbers preceded by `§` or an uppercase-letter word (e.g. `VR 1520 BHV`, `§ 53`) are not wrapped. Text inside `<li>`, `<ol>`, `<h5>`, `<h6>` elements is skipped in addition to `<h1>`–`<h4>`, `<code>`, `<pre>`.

5. **Fixed animation duration** — all inline number tweens run for `duration` seconds (default `3.0`) regardless of the numeric value.

6. **`initInlineNumberAnimation` module** in `packages/share/src/scripts/` — reuses the GSAP + ScrollTrigger already loaded by RFC-0040. DOM guard: `has(".js-inline-number")`. Loaded via `scheduleTask` in `runStandardLayoutOrchestration` when `inlineNumbers: true` is passed.

7. **Zero layout shift** — inline spans carry `display: inline-block; vertical-align: baseline; font: inherit; font-variant-numeric: tabular-nums; font-feature-settings: "tnum"; text-align: right; min-width: Nch` (set inline by SSR). `inline-block` allows `min-width` to take effect; `text-align: right` keeps growing digits right-anchored so surrounding text never shifts. The global `.js-inline-number` rule lives in `apps/nicaragua-projekt/src/styles/global.css` to cover all animated contexts (prose and team bios).

8. **Opt-in per section** — `animateNumbers: boolean` (default `false`) and `numberDuration: number` (default `3.0`) are new optional props on `markdown-section` and `team-section`. `animateYears` is removed from the authoring API — years are unconditionally excluded. When `animateNumbers: false`, the component renders content unchanged.

9. **Mimas (team-section) extension** — `team-section.astro` reads `animateNumbers` from `pageOverride` and passes it to each `<PersonProfile>`. `PersonProfile` receives an `animateNumbers?: boolean` prop and calls `wrapInlineNumbers(paragraph)` on each bio paragraph, rendering via `set:html`.

## Architectural fit

- **RFC-0040 (GSAP):** `initInlineNumberAnimation` reuses the same dynamic GSAP import. Both are guarded by `scheduleTask`; GSAP is loaded once for both features on pages that use both.
- **RFC-0011 (script placement):** Server pre-wrap lives in the `.astro` component frontmatter (SSR, no JS). The runtime animation remains in the S-2 orchestrator.
- **RFC-0026 (block-declarative pages):** `animateNumbers` and `numberDuration` are `blocks[].props` fields in page frontmatter. Authors control animation per section occurrence.
- **RFC-0035 (unified props contract):** New props are added to `markdown-section.manifest.yaml` and `team-section.manifest.yaml` propsSchema as optional with defaults.
- **DNA-22 (client surface):** `animateNumbers` and `animateYears` are authoring props inside `src/content/pages/**` — within the client-editable whitelist.
- **RFC-0006 (Lighthouse budget):** GSAP is only loaded when `.js-inline-number` elements exist; CLS is prevented by `min-width` reservation; no additional HTTP requests beyond the already-deferred GSAP bundle.

## Design

### Number detection regex

```ts
// Matches integers ≥ 2 digits bounded by word-boundary-equivalent positions.
// Does NOT match:
//   - compound tokens: 1st, 14-jährig, e.V., 1.234 (decimal point or hyphen follows)
//   - single digits
// Unicode-safe: uses lookbehind/lookahead on whitespace + punctuation classes.
const NUMBER_RE = /(?<=^|[\s(\[«"–—,;:!?])(\d{2,})(?=[\s).,;:!?»"–—]|$)/gm;
```

Exclusion checks applied after regex match:

```ts
// 1. Never wrap year numbers
if (num >= 1200 && num <= currentYear + 120) return match;

// 2. Skip if preceded by uppercase-letter word or § (e.g. "VR 1520", "§ 53")
const before = str.slice(0, offset);
if (/(?:^|\s)(?:[A-ZÄÖÜ§]{1,}|[A-ZÄÖÜ][a-zäöü]*[A-ZÄÖÜ]+)\s$/.test(before)) return match;
```

Skip tags (text inside these elements is never processed):

```ts
const SKIP_TAGS = new Set(["h1","h2","h3","h4","h5","h6","code","pre","li","ol"]);
```

### `wrapInlineNumbers` utility

New file: `packages/share/src/wrap-inline-numbers.ts`

```ts
export interface WrapInlineNumbersOptions {
  animateYears?: boolean; // reserved — currently always treated as false; years are never wrapped
  duration?: number;      // default 3.0
}

/**
 * Accepts a rendered HTML string and wraps qualifying inline numbers
 * with <span class="js-inline-number" data-numeric="…" data-is-year="…">.
 * Safe to call in Astro SSR/SSG frontmatter — no DOM access.
 * Skips numbers inside <h1>–<h4>, <code>, <pre>, and elements
 * already carrying class="js-inline-number".
 */
export function wrapInlineNumbers(html: string, options?: WrapInlineNumbersOptions): string;
```

Implementation strategy: regex-replace on the raw HTML string, but only within text-node contexts — achieved by a two-pass approach:

1. Tokenize the HTML string into `[tag | text]` segments (simple tag-boundary split, no full parser needed for this use case).
2. Apply `NUMBER_RE` only to text segments not inside `<h1>`–`<h4>`, `<code>`, `<pre>` tags (tracked via a tag-depth stack).
3. Replace matched number with the span markup.

This avoids a full HTML parser dependency while being correct for Astro's output (well-formed, no attribute values containing bare numbers that would match).

Re-exported from `@gogol/share` (root index, not `scripts` sub-path — this is a server utility, not a browser script).

### `markdown-section.astro` changes

```astro
---
import { wrapInlineNumbers } from "@gogol/share";

// new props destructured from pageOverride:
const { animateNumbers = false, animateYears = true, numberDuration = 3.0, ...rest } = pageOverride;

// after rendering ProseContent to HTML string:
// Astro's render() returns a Content component; to get the HTML string
// we use Astro.slots or set:html. The cleanest approach is to render
// the entry body to HTML via marked/unified at build time.
// Since proseEntry.body is the raw markdown, we use Astro's
// compiled Content component and set:html on a wrapper div,
// then post-process via a rehype plugin or Astro's Fragment set:html.
---
```

**Implementation detail — how to get the HTML string from Astro `Content`:**

Astro does not expose a `.toHTML()` method on `Content` components. The viable SSR approach:

- Use `proseEntry.body` (raw Markdown string) + a lightweight Markdown→HTML transformer (`marked` or `micromark`, already a transitive Astro dep) to produce an HTML string, then call `wrapInlineNumbers(html)` and output via `<Fragment set:html={wrappedHtml} />`.
- This replaces the `<ProseContent />` render path when `animateNumbers: true`. When `animateNumbers: false`, `<ProseContent />` is used unchanged (zero overhead on non-animated sections).

```astro
{animateNumbers && proseEntry ? (
  <div class="markdown-section__content">
    <Fragment set:html={wrapInlineNumbers(
      await renderMarkdownToHtml(proseEntry.body),
      { animateYears, duration: numberDuration }
    )} />
  </div>
) : (
  <div class="markdown-section__content">
    {ProseContent ? <ProseContent /> : <slot />}
  </div>
)}
```

`renderMarkdownToHtml` is a thin wrapper in `packages/share/src/` around `micromark` or `marked` — both are already available as Astro transitive dependencies.

### CSS — zero layout shift guarantee

The `.js-inline-number` rule lives in `apps/nicaragua-projekt/src/styles/global.css` (not only in `markdown-section.css`) so it covers team bio spans from `PersonProfile` as well:

```css
/* apps/nicaragua-projekt/src/styles/global.css */
.js-inline-number {
  display: inline-block;      /* required: inline ignores min-width */
  vertical-align: baseline;
  font: inherit;
  font-variant-numeric: tabular-nums;
  font-feature-settings: "tnum";
  text-align: right;          /* growing digits stay right-anchored — text to the right never shifts */
  /* min-width (Nch) is set server-side as an inline style */
}
```

`wrapInlineNumbers` emits (years and §/uppercase-prefix numbers are not wrapped at all):

```html
<span
  class="js-inline-number"
  data-numeric="100"
  data-duration="3"
  style="display:inline-block;min-width:3ch"
>100</span>
```

The `min-width: 3ch` (3 digits × 1 ch) is set server-side. With `text-align: right` the counter value is right-anchored inside the reserved box — the text after the span never shifts position during count-up.

### `initInlineNumberAnimation` module

New file: `packages/share/src/scripts/inline-number-animation.ts`

```ts
export interface InlineNumberAnimationOptions {
  prefersReducedMotion?: boolean;
}

/**
 * Animates all `.js-inline-number` spans using GSAP count-up + ScrollTrigger.
 * Fixed duration per span (from data-duration attribute, default 3.0 s).
 * prefers-reduced-motion: sets final values synchronously, no GSAP tween.
 * Safe to call multiple times — guarded by data-gsap-ready.
 */
export async function initInlineNumberAnimation(
  options?: InlineNumberAnimationOptions
): Promise<void>;
```

Animation contract:

- **No card reveal tween** — inline spans must not move (`y`, `opacity` tweens on inline elements cause reflow). Only the numeric value itself is animated: `0 → numericValue` over `data-duration` seconds.
- `ease: "power2.out"` — decelerates toward the final value, giving a natural reading pace.
- `ScrollTrigger: start: "top 85%", once: true, fastScrollEnd: true`
- Lenis wiring: `lenis.on("scroll", () => ScrollTrigger.update())`. `ScrollTrigger.refresh()` is deferred to `requestAnimationFrame` so layout is settled before positions are measured.
- Number formatted with `Intl.NumberFormat` (locale from `document.documentElement.lang` or `"de-DE"` fallback).
- Starting display value: `"0"` — rendered server-side in the span content so no CLS before JS runs.

### `orchestrator.ts` changes

```ts
export interface OrchestrationOptions {
  headerOffset?: number;
  counters?: boolean;      // RFC-0040
  inlineNumbers?: boolean; // RFC-0041
}

// Inside runStandardLayoutOrchestration:
// 5. Inline number animation (RFC-0041 — opt-in via inlineNumbers: true)
if (options.inlineNumbers && has(".js-inline-number")) {
  scheduleTask(async () => {
    const { initInlineNumberAnimation } = await import("./inline-number-animation");
    await initInlineNumberAnimation({ prefersReducedMotion });
  });
}
```

Both `counters` and `inlineNumbers` can be `true` simultaneously. GSAP is dynamically imported once per page — the second import call resolves from the module cache.

### nicaragua-projekt orchestrator

```ts
await runStandardLayoutOrchestration({ counters: true, inlineNumbers: true });
```

### nicaragua-projekt `wir-ueber-uns` content update

`src/content/pages/de/wir-ueber-uns.md` and `en/wir-ueber-uns.md` — the `Hyperion` block gains:

```yaml
- id: intro-about
  use: Hyperion
  props:
    hideSectionNumber: true
    heading: "The Association and Its History"
    contentRef: "prose/intro-about-content.en"
    animateNumbers: true
    numberDuration: 3.0
```

The `Mimas` (team section) bio content is passed as `members[].bio` strings in props. This RFC extends `wrapInlineNumbers` to team bios: `team-section.astro` reads `animateNumbers` from `pageOverride` and passes it to `<PersonProfile>`; `PersonProfile` wraps each bio paragraph via `wrapInlineNumbers(paragraph)` and renders with `set:html`.

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/share/src/wrap-inline-numbers.ts` | New — SSR HTML post-processor for inline number spans |
| `packages/share/src/index.ts` | Updated — re-exports `wrapInlineNumbers` |
| `packages/share/src/scripts/inline-number-animation.ts` | New — GSAP count-up for `.js-inline-number` spans |
| `packages/share/src/scripts/index.ts` | Updated — re-exports `initInlineNumberAnimation` |
| `packages/share/src/scripts/orchestrator.ts` | Updated — gains `inlineNumbers` option |
| `packages/ui/src/sections/markdown/markdown-section.astro` | Updated — calls `wrapInlineNumbers` when `animateNumbers: true` |
| `packages/ui/src/sections/markdown/markdown-section.manifest.yaml` | Updated — new optional props `animateNumbers`, `numberDuration` |
| `packages/ui/src/sections/markdown/markdown-section.css` | Updated — `.js-inline-number` base styles (also in global.css) |
| `packages/ui/src/sections/people/people-section.astro` | Passes `animateNumbers` to `PersonProfile` (the `team` section was renamed → `people` by RFC-0200) |
| `packages/ui/src/sections/people/people-section.manifest.yaml` | Optional prop `animateNumbers` (renamed → `people` by RFC-0200) |
| `packages/ui/src/components/person-profile/person-profile-component.astro` | Updated — `animateNumbers` prop, `wrapInlineNumbers` on bio paragraphs |
| `apps/nicaragua-projekt/src/styles/global.css` | Updated — global `.js-inline-number` rule |
| `apps/nicaragua-projekt/src/scripts/layout-orchestrator.ts` | Updated — adds `inlineNumbers: true` |

## Rollout

1. **Phase 1 — shared utilities:** Add `wrapInlineNumbers` to `packages/share/src/`. Add `initInlineNumberAnimation` to `packages/share/src/scripts/`. Update orchestrator with `inlineNumbers` option. All existing apps unaffected.

2. **Phase 2 — markdown-section update:** Add `animateNumbers` / `animateYears` / `numberDuration` props. Integrate `wrapInlineNumbers` into the `contentRef` render path. CSS update for `.js-inline-number`. Backward-compatible — `animateNumbers` defaults to `false`.

3. **Phase 3 — nicaragua-projekt opt-in:** Update `layout-orchestrator.ts` (`inlineNumbers: true`) and `wir-ueber-uns.md` pages. Verify zero CLS and Lighthouse budget compliance.

4. **Team section extension:** `Mimas` bio strings are covered in the same rollout via `PersonProfile` `animateNumbers` prop.

## Alternatives considered

- **Client-side text-node walk** — simpler to implement but causes layout shift (CLS > 0) as DOM mutations happen after paint. Rejected per RFC-0006 Lighthouse invariant.
- **Custom Remark/Rehype plugin** — most elegant Markdown-native approach but requires modifying the shared Astro config, which is a cross-workspace change requiring its own RFC. The `wrapInlineNumbers` string-based approach stays inside the component boundary.
- **Scaling duration by value** — `1988 / 100 * 0.08s` per digit produces visually uneven animation (years animate slowly, small numbers flash). Fixed 3 s duration is deliberately uniform.
- **Animating headings** — numbers in `<h1>`–`<h4>` are part of structural text; count-up animation there is disorienting and reduces readability. Headings are excluded.

## Risks

- **Regex false positives** — numbers inside HTML attribute values (e.g. `width="24"`) could match. Mitigated by the two-pass tokenizer that skips content inside tags.
- **`micromark` / `marked` version drift** — using a transitive Astro dependency for Markdown rendering means the output could change between Astro versions. Mitigated by: (a) the wrapper is only active when `animateNumbers: true`, (b) the output is post-processed HTML, not trusted for security purposes.
- **`min-width: Nch` accuracy** — `ch` unit is font-dependent. In monospace fonts it is exact; in proportional fonts (as used here) `1ch` ≈ width of `0`, which slightly over-reserves for narrow digits like `1`. This is acceptable — the reserved space is a few pixels wider than the final number, invisible to users.
- **GSAP double-load** — pages with both `counters: true` and `inlineNumbers: true` import GSAP twice via dynamic import. JS module cache deduplicates this to a single evaluation; no double parse cost.

## Acceptance criteria

- [x] `wrapInlineNumbers("In 1988 she moved…")` returns the string unchanged — year numbers are never wrapped (evidence: implemented historically)
- [x] `wrapInlineNumbers("§ 53 der Abgabenordnung")` returns the string unchanged — §-prefix numbers excluded (evidence: implemented historically)
- [x] `wrapInlineNumbers("VR 1520 BHV")` returns the string unchanged — uppercase-prefix registration codes excluded (evidence: implemented historically)
- [x] `wrapInlineNumbers("Der Ring in 100 Minuten")` wraps `100` — plain count in running text is animated (evidence: implemented historically)
- [x] Numbers inside `<h1>`–`<h6>`, `<code>`, `<pre>`, `<li>`, `<ol>` are not wrapped (evidence: implemented historically)
- [x] Compound tokens `1st`, `14-jährig` are not wrapped (evidence: implemented historically)
- [x] `data-numeric` matches the number exactly; `data-is-year` is `"true"` or absent (evidence: implemented historically)
- [x] `style="display:inline-block;min-width:Nch"` is emitted with N = digit count of the number (evidence: implemented historically)
- [x] `initInlineNumberAnimation` animates count-up to `data-numeric` value over `data-duration` seconds with `ease: "power2.out"` and ScrollTrigger `once: true` (evidence: implemented historically)
- [x] `prefers-reduced-motion` causes immediate final value render, no tween (evidence: implemented historically)
- [x] CLS = 0 on `wir-ueber-uns` page — ensured by SSR pre-wrap + `display:inline-block` + `min-width: Nch` + `text-align: right` (evidence: implemented historically)
- [x] GSAP not loaded on pages without `.js-inline-number` elements (evidence: implemented historically)
- [x] `markdown-section` renders identically to today when `animateNumbers: false` (evidence: implemented historically)
- [x] `numberDuration` defaults to `3.0`; years are always excluded regardless of props (evidence: implemented historically)
- [x] Bio paragraphs in `PersonProfile` are wrapped when `animateNumbers: true` is passed from `team-section` (evidence: implemented historically)
- [x] `rfc.validate` passes on this file (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has `status: accepted`.
- Agents MUST NOT change the `status` field of this RFC.
- `wrapInlineNumbers` is a **server-only utility** — it must never be imported in browser-executed scripts.
- `initInlineNumberAnimation` must **not** apply `opacity`, `y`, or any spatial tween to `.js-inline-number` spans — only numeric value count-up. Spatial tweens on `display:inline-block` elements cause reflow.
- The `min-width` inline style combined with `display:inline-block` and `text-align:right` is the CLS prevention mechanism. Do not remove any of the three.
- The global `.js-inline-number` rule in `global.css` must stay in sync with `markdown-section.css`. Both should declare identical properties.
- `micromark` is used as an SSR fallback to render `proseEntry.body` when `DataEntry.rendered.html` is not available. The primary path is `proseEntry.rendered?.html` (Astro content layer).
- Do not extend `wrapInlineNumbers` to heading elements — the non-goal is absolute.
- Years (`1200–currentYear+120`) must never be wrapped — do not reinstate the `animateYears` authoring path.
