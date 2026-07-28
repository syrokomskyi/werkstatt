---
id: RFC-0235
title: "Egress text normalization to strip AI-authorship typographic signals from all public output"
status: implemented
# kind options: architecture | contract | command | policy | deprecation
kind: architecture
# scope options: app | workspace
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-06-24
updatedAt: 2026-06-24
implementedAt: 2026-06-24
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy:
  - RFC-0569
related:
  - RFC-0041
  - RFC-0050
  - RFC-0051
  - RFC-0073
  - RFC-0143
  - RFC-0150
  - RFC-0162
  - RFC-0163
  - RFC-0165
  - RFC-0166
  - RFC-0185
  - RFC-0203
commands:
  proposed:
    - text.normalize.apply
    - text.normalize.report
    - text.normalize.rules.list
    - text.normalize.validate
  added:
    - text.normalize.apply
    - text.normalize.report
    - text.normalize.rules.list
    - text.normalize.validate
  changed:
    - preview.images.generate
    - system.manifest.validate
  removed: []
appsImpacted:
  - nicaragua-projekt
  - warpgogol-com
packagesImpacted:
  - "@gogol/share"
  - "@gogol/ontology"
  - "@gogol/site-kernel-checks"
successSignals:
  - "After a clean build, no enabled typographic signal (special dash, curly/guillemet quote, special space, zero-width char, typographic HTML entity, single-char ellipsis) survives anywhere in `dist/` — rendered HTML, `llms.txt`/`llms-full.txt`, per-page Markdown twins, `feed.xml`, `sitemap*.xml`, inline JSON-LD, OG preview PNG text — for `text.normalize.validate` to find."
  - "A site owner disables a single signal in `src/content/system.md` (e.g. `text.normalize.signals.spaces: false`) and the next build keeps `nbsp` while still stripping every other signal — no code change, no per-page edits."
  - "Authored source files under `src/content/` are never modified by the build: the same `.md` with an em-dash builds to a hyphen in `dist/` but stays an em-dash on disk (adapter, not source rewrite)."
  - "Adding a new public output channel later cannot silently regress coverage: `text.normalize.validate` flags any residual enabled signal in `dist/` as a warning, so an unhandled new file type is visible without reading source."
  - "`text.normalize.rules.list` enumerates every signal (id, Unicode set, replacement, default) so an AI agent can discover and configure the contract without reading source."
nonGoals:
  - "Do not rewrite, reformat, or 'clean' the authored source files under `src/content/`. This is an on-the-fly egress adapter; sources stay pristine. A one-shot global find-replace over content is explicitly rejected."
  - "Do not block the build on residual signals. The adapter transforms; the backstop check only warns (does not gate). This is an adapter, not a gate."
  - "Do not apply heuristics that try to tell 'intentional' typography from 'AI' typography. Normalization is blanket per-signal; granularity is the per-signal toggle, not a classifier."
  - "Do not touch structurally significant bytes: HTML/JSON/XML syntax, structural entities (`&amp;`, `&lt;`, `&gt;`, `&quot;`), signed artifacts (cosmic-passport JSON, keys), `_astro/*` hashed bundles, `_headers`/`_redirects`, or any binary asset."
  - "Do not introduce a new OS package or a heavy HTML/XML parser dependency; reuse the `@gogol/share` server-text seam and a tokenizer in the style of `wrapInlineNumbers` (RFC-0041)."
---

# RFC-0235: Egress text normalization to strip AI-authorship typographic signals from all public output

## Context

Texts shown to visitors across `apps/` (`nicaragua-projekt`, `warpgogol-com`) carry typographic markers that trip "written by AI" heuristics used by search engines, social platforms, and AI-content detectors. The markers are:

- **Special dashes:** U+2012 figure dash, U+2013 en dash, U+2014 em dash, U+2015 horizontal bar (the regular hyphen-minus U+002D is the desired target, not a marker).
- **Typographic quotes:** U+00AB «, U+00BB », and the U+2018–U+201F range; plus the "smart" quotes U+201C “, U+201D ”, U+2018 ‘, U+2019 ’ used in place of straight `"`/`'`.
- **Special spaces and zero-width characters:** U+00A0, U+2000–U+200A, U+202F, U+205F, U+2060, U+180E, U+200B, U+200C, U+200D, U+FEFF, U+00AD, and related invisibles.
- **HTML entities for the same characters:** `&nbsp;`, `&mdash;`, `&ndash;`, `&laquo;`, `&raquo;`, `&hellip;`, `&ldquo;`, `&rdquo;`, …
- **Single-character ellipsis:** U+2026 … in place of `...`.

These markers arrive from three independent sources, which is why no single source edit fixes them:

1. **The author** typed or pasted them (curly quotes, nbsp, em-dashes from word processors).
2. **The renderer injects them.** The apps ship no Astro `markdown` config, so Astro's default `smartypants: true` is active: it converts straight quotes → curly quotes, `--` → em-dash, and `...` → `…` at render time, **even from pristine source**.
3. **Generators inject them.** Example confirmed in this codebase: `generateBrandCardPng` in `packages/os/site-kernel-checks/src/preview-templates.ts:102` builds the OG card with a hardcoded `` ` — ${input.siteTagline}` `` em-dash separator, then rasterizes it to a PNG — baking the #1 tell into pixels.

The founder's ask: build into the ecosystem an **automatic removal/replacement** of these markers — **not** a control/lint and **not** a global search-and-replace over sources, but an **on-the-fly adapter over every source before it reaches public access**. "Public" is broader than rendered pages: it includes everything we generate into `public/` and ship in `dist/`. **All egress points must be found.**

## Problem

There is no chokepoint today where "text about to become public" is normalized. Text reaches the public through two egress classes, both of which carry the markers:

**A. Rendered HTML** (Astro SSG → `dist/`), including visible prose, `<title>`/`<meta>` content, OG/Twitter tags, `aria-*`, and inline `application/ld+json` JSON-LD.

**B. Generated artifacts** written into `public/` during `build.prepare` and copied into `dist/` by Astro:

| Artifact | Generator (build.prepare) | Channel |
| --- | --- | --- |
| `llms.txt`, `llms-full.txt` | `llms.generate` (RFC-0050) | plain text |
| `<route>/index.md` (Markdown twins) | `page.markdown.generate` (RFC-0166) | markdown |
| `feed.xml` (RSS) | `feed.generate` (RFC-0165) | XML (HTML in CDATA) |
| `sitemap*.xml` | `sitemap.generate` (RFC-0049) | XML |
| `ai.txt`, `robots.txt` | `ai.generate`, `robots.generate` | plain text |
| `og-image.png` (+ per-page OG) | `preview.images.generate` (RFC-0150) | **rasterized text** |
| `.well-known/cosmic-passport.json` | `passport.emit` (build.post, **signed**) | JSON |
| `.well-known/pseo-*.json` / `.svg` | surface (RFC-0192) | JSON / SVG text |

A correct solution must (1) intercept **both** classes, (2) leave authored sources untouched, (3) be per-signal configurable per site with everything on by default, and (4) handle the awkward cases — text rasterized into images, text inside signed JSON, and quotes that must be re-escaped when they land inside HTML attributes or JSON strings.

## Decision

Introduce **Egress Text Normalization**: one canonical, server-only normalizer in `@gogol/share`, driven by a per-site config block, applied at the **final public artifact** so that every public channel is covered while authored sources stay pristine.

> **Scope decision (founder, 2026-06-24).** The original draft proposed a three-layer hybrid that also added render-time prevention (disable Astro `smartypants` + a `rehypeNormalizeText` plugin). That layer was **dropped**: the `dist/` is the finished product, so a single pass over it is sufficient and avoids adding per-render load to every build. The post-build sweep already neutralizes whatever `smartypants` (or an author paste) introduced. The only normalization that must happen earlier is for channels the `dist/` sweep physically cannot reach.

The implemented design is therefore:

1. **Authoritative post-build adapter over `dist/` (primary).** `text.normalize.apply` walks the built `dist/client` after all generation/mutation and rewrites every text-bearing artifact through the normalizer, syntax-aware per file type. This is the catch-all that guarantees "find all of them."
2. **Generator-time normalization for rasterized text (the one unreachable channel).** `preview.images.generate` runs the normalizer over its OG/Twitter card text before building the SVG — pixels cannot be swept post-build.

A warn-only backstop (`text.normalize.validate`) re-scans `dist/` for residual enabled signals and reports them as RFC-0203 Diagnostics **without gating the build** — an adapter, not a gate (the founder's framing). `text.normalize.report` (advisory) and `text.normalize.rules.list` (registry enumeration) round out discoverability. Dev preview (`astro dev`) intentionally shows the author's raw typography.

## Architectural fit

This is **not** a new mechanism. It reuses:

- The **`@gogol/share` server-text seam** and the dependency-free tokenizer pattern from `wrapInlineNumbers` (RFC-0041) — no heavy HTML parser is added.
- The **`build.post` dist-mutation slot**: `text.normalize.apply` sits beside the existing dist mutators `dist.generated-marker.strip` (RFC-0185) and `dist.sitemap.images.generate`, which already rewrite final artifacts before the postbuild validators run.
- The **RFC-0203 Diagnostic model** for `text.normalize.validate`/`report` output (`file:line` + deterministic sort), and the `*.rules.list` discoverability convention from RFC-0233's `visual.rules.list`.
- The **`system.md` manifest** (where `ai:`, `robots:`, `growth:`, `release:` already live and are client-editable) as the per-site config home. `src/content/` _is_ the thin-site context folder.

No new OS package is introduced. A new public channel never needs new wiring — the dist adapter is file-type-driven and the backstop flags anything it misses.

## Design

### The signal registry (single source of truth)

`@gogol/share` exports `SIGNAL_REGISTRY`: six signals, each with a Unicode matcher and a replacement. It is the only place signals are defined; the adapter, the validate/report checks, and `text.normalize.rules.list` all read it.

| id | Matches | Replacement | Default |
| --- | --- | --- | --- |
| `dashes` | U+2012 figure, U+2013 en, U+2014 em, U+2015 horizontal bar, U+2011 non-breaking hyphen, U+2212 minus | `-` (U+002D); **surrounding spaces preserved** (`Wort — Wort` → `Wort - Wort`; `Süd–Nord` → `Süd-Nord`) | on |
| `quotes` | double class «»“”„‟ → `"`; single class ‘’‚‛ → `'` (covers U+00AB/U+00BB and the U+2018–U+201F range, incl. "smart" quotes) | straight `"` / `'` | on |
| `spaces` | U+00A0 nbsp, U+2000–U+200A, U+202F narrow nbsp, U+205F medium math, U+3000 ideographic, U+1680 ogham | regular space U+0020 (1:1; runs are **not** collapsed) | on |
| `zeroWidth` | U+200B ZWSP, U+200C ZWNJ, U+200D ZWJ\*, U+2060 word joiner, U+FEFF BOM/ZWNBSP, U+00AD soft hyphen, U+180E, U+061C, U+2061–U+2064 | removed (empty) | on |
| `htmlEntities` | typographic named/numeric entities (`&nbsp; &ensp; &emsp; &thinsp; &mdash; &ndash; &hellip; &laquo; &raquo; &ldquo; &rdquo; &lsquo; &rsquo; &bdquo; &#160; &#8212; &#x2014;` …) — **never** the structural `&amp; &lt; &gt; &quot; &#39;` | decode, then route the resulting char through its char-signal above | on |
| `ellipsis` | U+2026 … (and `&hellip;`) | `...` | on |

\* **ZWJ (U+200D) is preserved inside emoji ZWJ sequences** (between Extended_Pictographic components, e.g. 👩‍👩‍👦); only standalone ZWJ cruft is stripped.

`htmlEntities` is a **lens**, not an independent action: it decodes typographic entity forms so the char-signals apply. Whether `&mdash;` is neutralized depends on `dashes`; `&hellip;` on `ellipsis`; `&nbsp;` on `spaces`. This keeps composition clean — turning off `dashes` also keeps `&mdash;` intact.

### Per-site configuration (`src/content/system.md`)

```yaml
# Egress text normalization (RFC-0235). Adapter over public output; sources stay pristine.
text:
  normalize:
    enabled: true          # master switch (default true)
    signals:               # per-signal toggle; an omitted key defaults to ON
      dashes: true
      quotes: true
      spaces: true
      zeroWidth: true
      htmlEntities: true
      ellipsis: true
```

**Absent block ⇒ all signals on.** Existing sites are protected with no edit. Schema `textNormalizeSchema` is added to `packages/ontology/src/schemas/system.ts` and attached as the optional `text` field on `systemManifestSchema`; it is **client-editable** (added to the `clientEditable` surface + `client.edit.validate` partial-YAML rules) and validated by `system.manifest.validate`.

### Shared library (`@gogol/share`, server-only)

`packages/share/src/text-normalize.ts` (sibling to `wrap-inline-numbers.ts`, same server-only invariant):

- `SIGNAL_REGISTRY` — the six signals (matchers + replacers).
- `resolveNormalizeConfig(manifest)` → effective per-signal booleans (defaults applied).
- `normalizeText(input, config)` — plain-text/char normalizer (for `.txt`, `.md` non-code, OG inputs, hast text nodes).
- `normalizeHtml(html, config)` — tokenizer-based (split on tags); normalizes text segments only; **skips** `<script>` (except `type="application/ld+json"`), `<style>`, `<code>`, `<pre>`, `<kbd>`, `<samp>`; normalizes a whitelist of attributes (`alt`, `title`, `meta[content]`, `aria-label`, `aria-description`); for `application/ld+json` it JSON-parses the body, normalizes string **values**, and re-stringifies (so quotes re-escape correctly).
- `normalizeJson(value, config)` — deep-walk; normalize string **values** only (not keys); `JSON.stringify` re-escapes.
- `normalizeXml(xml, config)` — normalize text content and CDATA (running `normalizeHtml` on CDATA that contains markup, e.g. RSS descriptions); preserves tags/attributes/structural entities.
- `normalizeMarkdown(md, config)` — whole-file char normalize that **protects fenced (` ``` `) and inline (`` ` ``) code**.
- `normalizeKindForPath(path)` / `normalizeByKind(input, kind, config)` — dispatch a file path to a normalizer kind (`html`/`json`/`xml`/`svg`/`md`/`txt`) and run it.
- `detectResidual(input, kind, config)` — returns the first residual line + the responsible signal ids (used by validate/report); implemented as a re-normalize diff so it inherits the transforms' skip rules exactly.

All transforms are **idempotent** (a second pass is a no-op) and never alter structural syntax.

### Layer 1 — Post-build `dist/` adapter (authoritative, primary)

`text.normalize.apply` is inserted into `APPS_BUILD_POST_PIPELINE` **after** all dist generation/mutation (`passport.emit`, `dist.sitemap.images.generate`, `video.dist.prune`, `dist.generated-marker.strip`) and **before** `APPS_CHECK_POSTBUILD_PIPELINE`. It walks `dist/client` and dispatches by extension:

- `.html` / `.htm` → `normalizeHtml`
- `.json` → `normalizeJson`
- `.xml` → `normalizeXml`
- `.svg` → `normalizeXml` (element text incl. `<text>`/`<tspan>`)
- `.md` → `normalizeMarkdown`
- `.txt` → `normalizeText`

**Exclusion list (never touched):**

- **Signed / key artifacts:** any `.well-known/*cosmic-passport*` JSON and `*-key.json`. The cosmic passport is signed by `passport.emit` and re-checked by `passport.verify`; normalizing it post-sign would break the signature. Signed artifacts are therefore **out of scope** — left exactly as emitted (their strings come from `system.md`, which the owner keeps clean). `*.pem` is binary-ish and not a normalizable kind anyway. _(Build verified: `passport.verify` stays green.)_
- **Hashed bundles & infra:** `dist/client/_astro/*` (JS/CSS). `_headers`/`_redirects` have no normalizable extension and are skipped implicitly.
- **Binaries:** any non-text extension (png/jpg/webp/woff2/mp4/ico…) is skipped because `normalizeKindForPath` returns `null`.

### Layer 2 — Generator-time (rasterized text, the one unreachable channel)

`preview.images.generate` resolves the per-site config and passes it into `generateBrandCardPng`, which runs `normalizeText` over `pageTitle`, `pageDescription`, `siteName`, `siteTagline` **before** building the SVG. The hardcoded `` ` — ` `` separator (`preview-templates.ts`) is normalized in the assembled string, so it becomes `-` when `dashes` is on. This is the only channel a `dist/` sweep cannot reach (it's pixels).

**Existing committed cards (the stale-pixel gap).** OG PNGs are committed assets (≈60 across the two pilots), so cards rendered before this RFC keep un-normalized text — a `dist/` sweep can't OCR them, and a normal `preview.images.generate` skips existing files. To close this, `preview.images.generate` gains a `--force-normalize` flag: for an **existing** card it re-renders and overwrites **only when the card's source text actually carries a signal** (`ogSourceHasSignals` — `normalizeText(s) !== s` over title/description/siteName and the ` — tagline` separator). Clean cards are left byte-untouched (no churn from re-encoding); owner-custom images whose source is already clean are never rewritten. It is a deliberate maintenance command, **not** wired into the build pipeline (the build must not mutate committed assets). Run once per site to migrate; new cards are normalized at first generation.

### Dropped — render-time prevention

The draft's third layer (disable Astro `smartypants` + a `rehypeNormalizeText` plugin) was **removed per the founder**: the `dist/` is the finished product and a single pass over it is sufficient, so adding a transform to every page render would only duplicate build load. The dist adapter neutralizes whatever `smartypants` or an author paste introduced. Consequence: `astro dev` preview shows the author's raw typography (acceptable — only the deployed artifact is scanned by detectors).

### Backstop — `text.normalize.validate` (warn-only)

Runs in `APPS_CHECK_POSTBUILD_PIPELINE`. Re-scans `dist/` (same exclusions) for any residual **enabled** signal and emits RFC-0203 Diagnostics at **`warning`** severity — it **does not gate the build** (founder's choice: the adapter is primary; control only informs). Its real job is drift detection: a new public channel the adapter doesn't yet handle surfaces here as a warning instead of silently shipping a marker.

`text.normalize.report` (advisory, author-time, always exit 0) lists where signals appear in **source** so authors _may_ fix at source — without being forced to. `text.normalize.rules.list` (workspace) enumerates `SIGNAL_REGISTRY`.

## Rollout

1. **Phase 1 (this RFC):** `text-normalize.ts` + `SIGNAL_REGISTRY` + per-format normalizers + `rehypeNormalizeText` in `@gogol/share`; `textNormalizeSchema` in ontology; the four `text.normalize.*` commands; wire Layer 3 + backstop into `build.post`; Layer 1 (`smartypants:false` + rehype) and Layer 2 (OG) in the codegen templates. Pilot on `nicaragua-projekt`, then `warpgogol-com`.
2. **Phase 2 (deferred):** optional per-channel overrides (e.g. keep typography in rendered HTML but normalize `llms.txt`), if a site ever asks for it. Not built now (contradicts "find all" by default).
3. **Phase 3 (deferred):** an opt-in author-side `text.normalize.report --fix` to clean sources on request (still never automatic; the default remains adapter-only).

## Alternatives considered

- **Global source find-replace / pre-commit rewrite of `src/content/`.** Rejected and explicitly excluded by the founder: destructive, loses author intent, and loses the battle against re-pasted content. Sources must stay pristine.
- **A pure lint/gate (à la `content.voice.lint`) that blocks builds on signals.** Rejected as the primary mechanism: it is "control," forces manual remediation, and transforms nothing. We keep only a **warn-only** backstop.
- **Dist-sweep only (no render/generator layers).** Rejected: misses `astro dev` parity and rasterized OG text, and re-parsing serialized HTML/JSON to swap quotes is riskier (escaping) than normalizing structured text before serialization. Hybrid uses render-time prevention to shrink what the sweep must fix.
- **Source/render-level only (rehype + per-generator `normalizeText`).** Rejected as the sole mechanism: every future generator or new file type silently regresses coverage and there is no single proof of completeness. The dist adapter + backstop provide that proof.
- **Just disable `smartypants`.** Insufficient: ignores author-pasted signals, HTML entities, generator-injected separators (the OG `—`), special spaces, and zero-width cruft.

## Risks

- **Over-normalization degrades legitimate typography** (nbsp before units, en-dash number ranges, brand guillemets). Mitigated by per-signal toggles; the default reflects the stated priority — avoiding the AI tell outweighs typographic polish. Owners disable `spaces`/`dashes`/`quotes` to keep them.
- **Corrupting structured artifacts** (JSON signatures, JS bundles, routing files). Mitigated by syntax-aware per-type handling, the explicit exclusion list (signed passport + keys + `_astro/*` excluded outright), and idempotency.
- **Coverage drift** when a new public channel appears. Mitigated by the warn-only `text.normalize.validate` over `dist/`.
- **Quote re-escaping bugs** when a curly quote inside an HTML attribute or JSON string becomes a straight quote. Mitigated by parse-then-serialize (never raw string replacement) in `normalizeHtml`/`normalizeJson`, with targeted unit tests.
- **Performance** on large `dist/`. Bounded and linear; thin sites only.
- **Emoji breakage** from stripping ZWJ. Mitigated by emoji-sequence preservation in the `zeroWidth` matcher.

## Acceptance criteria

- [x] `@gogol/share/text-normalize.ts` exports `SIGNAL_REGISTRY`, `normalizeText/Html/Json/Xml/Markdown`, `normalizeByKind`, `normalizeKindForPath`, `resolveNormalizeConfig`, and `detectResidual`; 29 unit tests cover JSON-LD quote re-escaping, ZWJ-emoji preservation, code-fence protection, structural-entity protection, codepoint-exact matching, and idempotency. _(Verified: share suite 157/157 green.)_ (evidence: packages/ directory, package exists)
- [x] `text.normalize.apply` runs in `build.post` after all dist mutation and before the postbuild validators; rewrites `.html/.json/.xml/.svg/.md/.txt`; honors the exclusion list (signed passport JSON, `*-key.json`, `_astro/*`, binaries via kind=null). _(Verified: nicaragua normalized 36/63, warpgogol-com 148/199.)_ (evidence: original apps retired by RFC-0381, implemented historically)
- [x] ~~Render-time `smartypants:false` + `rehypeNormalizeText`~~ — **dropped per founder** (dist sweep is the finished product; no per-render duplication). `astro dev` shows raw author typography by design. (evidence: implemented historically)
- [x] `preview.images.generate` normalizes `pageTitle`/`pageDescription`/`siteName`/`siteTagline` and the hardcoded `—` separator before rasterization (config-aware via `resolveNormalizeConfig`). (evidence: implemented historically)
- [x] Existing committed OG cards reached via `preview.images.generate --force-normalize` (re-render only signal-bearing cards). _(Verified: regenerated 27 nicaragua + 33 warpgogol committed PNGs; valid PNG output; clean cards untouched.)_ (evidence: original apps retired by RFC-0381, implemented historically)
- [x] Signed cosmic-passport JSON + `*-key.json` are excluded from the sweep; `passport.verify` stays green after `text.normalize.apply`. _(Verified in both build:check runs.)_ (evidence: implemented historically)
- [x] `text.normalize.validate` (warn-only) reports residual enabled signals in `dist/` as RFC-0203 Diagnostics and does **not** change build exit code. _(Verified: 0 residual on both apps; runs in postbuild.)_ (evidence: implemented historically)
- [x] `text.normalize.report` (advisory, source) and `text.normalize.rules.list` (registry, lists 6 signals) exist. (evidence: implemented historically)
- [x] `text` block added to `systemManifestSchema` (optional; all signals on when absent), strict per-signal shape, validated by `system.manifest.validate`. (evidence: implemented historically)
- [x] Pilot: full `build:check` of `nicaragua-projekt` and `warpgogol-com` is green and leaves zero enabled signals across rendered HTML, `llms*.txt`, twins, `feed.xml`, `sitemap*.xml`, inline JSON-LD (9 blocks reparse), and OG source text; `rfc.validate` green. (evidence: original apps retired by RFC-0381, implemented historically)
- [x] `text.normalize.report` wired into the author pipeline (`APPS_CHECK_AUTHOR_PIPELINE`, after `content.voice.lint`) — advisory, does not gate. _(Verified: 41 nicaragua / 78 warpgogol source files reported; build:check stays green.)_ (evidence: original apps retired by RFC-0381, implemented historically)
- [x] Client toggling permitted: `src/content/system.md` is not an engineering-only path and `client.edit.validate` enforces only the surface whitelist + Change-Scope trailers, so editing the `text.normalize` block needs no engineering scope. A field-level partial-YAML gate for `system.md` does not exist in the ecosystem (the schema "client-writable" comments are aspirational); building one is out of scope for this RFC. (evidence: implemented historically)

## Implementation notes for agents

- Library: `packages/share/src/text-normalize.ts` (+ `index.ts` export); mirror the server-only `@ai-invariant` header from `wrap-inline-numbers.ts`. Reuse its tokenizer approach for `normalizeHtml` (no full HTML-parser dependency).
- Schema: `packages/ontology/src/schemas/system.ts` — add `textNormalizeSchema`, attach optional `text` to `systemManifestSchema`; update `system.manifest.validate` and `client.edit.validate` partial-YAML allow-rules.
- Commands: a new command-table `packages/os/site-kernel-checks/src/command-tables/13-text-normalize.ts` registers `text.normalize.{apply,validate,report,rules.list}`; handlers in `packages/os/site-kernel-checks/src/text-normalize.ts`.
- Pipelines: insert `{ command: "text.normalize.apply" }` into `APPS_BUILD_POST_PIPELINE` (`pipelines/build-post.ts`) after `dist.generated-marker.strip`; insert `{ command: "text.normalize.validate" }` into `APPS_CHECK_POSTBUILD_PIPELINE` (`pipelines/apps-check-postbuild.ts`).
- OG: `packages/os/site-kernel-checks/src/preview-templates.ts` (`generateBrandCardPng`) — normalize inputs + the `—` separator; `preview-images.ts` resolves the config from the manifest and passes it.
- Imports: kernel/Node consumers import from the `@gogol/share/text-normalize` subpath (not the barrel, which pulls `astro:content`).
- Validate/report output reuses the RFC-0203 Diagnostic renderer (`file:line` + deterministic sort).

## Open questions

All resolved before acceptance.

1. **Where does the normalizer run (the egress chokepoint)?** Answer (revised at acceptance): **post-build `dist/` adapter as the single authoritative pass**, plus generator-time normalization for the one channel a `dist/` sweep cannot reach (rasterized OG text), plus a warn-only backstop. The draft's render-time prevention layer (`smartypants:false` + `rehypeNormalizeText`) was **dropped** by the founder to avoid duplicating load on every render — the finished `dist/` is sufficient. Sources stay untouched.

2. **Should a backstop fail the build if any enabled signal survives in the final output?** Answer: **Warning only.** `text.normalize.validate` reports residue as RFC-0203 Diagnostics but does **not** gate. The adapter is the mechanism; control merely informs (drift detection).

3. **Cover text baked into OG/Twitter preview images?** Answer: **Yes, fully.** New cards are normalized at generation time (title/description/label + the `—` separator). Existing committed cards — which a `dist/` sweep cannot OCR and a normal generate skips — are reached by `preview.images.generate --force-normalize`, which re-renders only signal-bearing cards. (Confirmed the OG generator was itself a signal source via the hardcoded `—` separator.)

4. **Dev-preview parity?** Answer (revised): **No dev normalization.** With the render-time layer dropped, `astro dev` shows the author's raw typography. Only the deployed `dist/` is normalized — and only the deployed artifact is what detectors scan, so dev parity has no value here.

5. **Where does per-site config live, and what is the default?** Answer: A `text.normalize` block in `src/content/system.md` (the thin-site context manifest, alongside `ai:`/`robots:`/`growth:`). **Absent block or absent key ⇒ that signal is ON.** Everything on by default.

6. **Signal granularity — one toggle or split?** Answer: **Six signals**, with `spaces` and `zeroWidth` **split** so an owner can keep `nbsp` (visible, often intentional) while still stripping invisible zero-width cruft. `htmlEntities` is a lens over the char-signals, not an independent action.

7. **Zero-width joiner inside emoji?** Answer: **Preserved.** Only standalone ZWJ is stripped; ZWJ within an emoji grapheme sequence is kept.

8. **The signed cosmic-passport JSON?** Answer (revised, simpler): **excluded entirely** from the sweep (signed artifact — out of scope). Its strings originate from `system.md`, which the owner keeps clean; pre-sign normalization was deemed unnecessary complexity. `passport.verify` stays green (verified).

9. **Legitimate typography (nbsp, en-dash ranges, guillemets) lost by default?** Answer: **Normalized by default** — avoiding the AI tell is the stated priority. Owners opt out per signal (`spaces`/`dashes`/`quotes`) when a site prefers the typography.

10. **Replacement targets?** Answer: special dashes → `-` (surrounding spaces preserved); double quotes → `"`, single quotes → `'`; single-char ellipsis → `...`; special spaces → regular space (1:1, runs not collapsed); zero-width → removed; typographic entities → decoded, then routed through the matching char-signal.
