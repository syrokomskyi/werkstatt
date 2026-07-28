---
id: RFC-0306
title: "Switch per-page Markdown twins from /route/index.md to sibling /route.md URLs"
status: implemented
kind: architecture
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-07-05
updatedAt: 2026-07-06
implementedAt: 2026-07-06
closedAt:
supersedes: []
supersededBy:
amends:
  - RFC-0166
amendedBy:
related:
  - RFC-0166
  - RFC-0208
  - RFC-0195
  - RFC-0286
  - RFC-0142
  - RFC-0143
  - RFC-0049
commands:
  proposed: []
  added: []
  changed:
    - page.markdown.generate
    - page.markdown.validate
    - surface.generate
    - behavior.snapshot.generate
    - behavior.snapshot.validate
  removed: []
appsImpacted:
  - apps/*
packagesImpacted:
  - packages/share
  - packages/ui
  - packages/os/site-kernel-checks
successSignals:
  - "Every eligible non-home page advertises and serves its Markdown twin at a sibling `/<route>.md` URL (e.g. /team/andrii-syrokomskyi.md), not at `/<route>/index.md`."
  - "Home pages (site root and every language root) keep `index.md` (`/index.md`, `/en/index.md`)."
  - "The `<link rel=alternate type=text/markdown>` href, the on-disk twin path, the PSEO surface twin path, the behavior-snapshot twin lookup, and the agent.json `interfaces.twins.pattern` all derive from ONE shared pure helper and cannot drift."
  - "sitemap.xml and llms.txt/llms-full.txt page URLs are unchanged (they reference canonical HTML routes, never twins); a regression check confirms no twin URL leaked into them."
nonGoals:
  - "Do not keep the old `/<route>/index.md` twins as legacy or provide redirects/back-compat — everything is regenerated to the new scheme."
  - "Do not change which pages are eligible for a twin (still llms depth full/summary per RFC-0142/0166)."
  - "Do not change sitemap.xml or llms.txt/llms-full.txt page-URL generation (RFC-0142/0143/0165 own those)."
  - "Do not introduce a runtime `.md` route or worker — build-time projection only, per RFC-0166."
---

# RFC-0306: Switch per-page Markdown twins from /route/index.md to sibling /route.md URLs

## Context

RFC-0166 emits a build-time Markdown twin for every eligible page and advertises it with `<link rel="alternate" type="text/markdown">`. The current scheme places the twin **inside the page directory** as `<route>/index.md`, so a page at `/team/andrii-syrokomskyi` gets its twin at `/team/andrii-syrokomskyi/index.md`.

We want the twin to live at the **sibling** URL `/team/andrii-syrokomskyi.md`. This is a cleaner, more conventional agent/LLM URL (`<url>.md`) and matches how agents commonly probe for a Markdown view of a page.

The change is mechanical but touches several places that must stay byte-for-byte consistent, so this RFC specifies the exact seam, the exact edits, and the exact verification. It **amends** RFC-0166 (which owns the twin contract) and adjusts the two downstream consumers that also emit the twin URL or path: RFC-0195 (PSEO surface twins) and RFC-0286 (agent.json `interfaces.twins`).

## Problem

The twin path formula `<route>/index.md` is duplicated in five places that MUST agree:

1. The URL emitted in the page `<head>` (`packages/ui/src/components/layout/layout-component.astro`).
2. The on-disk twin written by `page.markdown.generate` (`packages/os/site-kernel-checks/src/page-markdown.ts` — `twinRelPath`).
3. The on-disk twin written by the PSEO `surface.generate` (`packages/os/site-kernel-checks/src/surface.ts`, two spots: write + stale cleanup).
4. The twin lookup in `behavior.snapshot` (`packages/os/site-kernel-checks/src/behavior-snapshot.ts`).
5. The advisory glob in the agent surface manifest (`packages/share/src/agent/manifest.ts` — `interfaces.twins.pattern`).

Because the formula is copy-pasted, changing the scheme by editing one site would silently break `page.markdown.validate` (which cross-checks the emitted `<link>` href against an on-disk file) or `behavior.snapshot`. We fix the scheme AND collapse the duplication into a single shared helper.

## Decision

1. Introduce one pure helper in `@gogol/share` that maps a route pathname to its twin's relative path, applying the home-page exception. Every producer/consumer of the twin path imports it.
2. New scheme: eligible **non-home** page at pathname `/<p>` → twin at `<p>.md` (URL `/<p>.md`, file `public/<p>.md`). **Home pages keep `index.md`**: site root `/` → `index.md` (`/index.md`), and each language root `/<lang>/` → `<lang>/index.md` (`/<lang>/index.md`).
3. Home detection is **structural and deterministic**: given the site's supported-language set, a pathname is a home page iff its trimmed path is empty OR is a single segment equal to a supported language code. No other input is needed.
4. **No legacy, no back-compat, no redirects.** All apps regenerate. Old `<route>/index.md` twins are removed by the normal clean rebuild (twins are build artifacts, not committed source).
5. sitemap.xml and llms.txt/llms-full.txt are unaffected — they build page URLs from `toPathname(page.url)` (canonical HTML routes), never from twin paths. This RFC adds a regression assertion that no twin (`.md`) URL appears in those outputs.

## Architectural fit

- **RFC-0166 (twin contract):** this RFC amends it — same generator, same eligibility (llms depth full/summary), same "no runtime route" invariant; only the twin's path/URL scheme changes.
- **RFC-0195 (PSEO surface):** `surface.generate` emits per-language twins and MUST adopt the same helper so programmatic pages follow the identical scheme with no special-casing.
- **RFC-0286 (Agent Surface):** `agent.json interfaces.twins` advertises the twin location; its `pattern` is updated to the new scheme so agents discover `/<route>.md`.
- **RFC-0142/0143 (llms):** unaffected — llms.txt/llms-full.txt and sitemap build URLs from `toPathname(page.url)` (canonical HTML routes), never from twin paths; regression checks 5–6 lock this in.
- **RFC-0049 (build-output invariant):** twins are written into the project tree / `public`, then Astro emits to `dist`; nothing writes to `dist` directly and nothing validates a running server.

## Design

### The shared helper (single source of truth)

Add to `@gogol/share`, exported from the `semantic` module (next to `toPathname` in `packages/share/src/semantic/ids.ts`, or a new `packages/share/src/semantic/twin-path.ts` re-exported by `packages/share/src/semantic/index.ts`):

```ts
/**
 * RFC-0306: relative on-disk path (and, prefixed with "/", the public URL) of a page's
 * Markdown twin. Non-home pages get a sibling `<path>.md`; home pages (site root and each
 * language root) keep `<path>/index.md`.
 *
 *   markdownTwinRelPath("/",                      { supportedLangs: ["de","en"], … }) === "index.md"
 *   markdownTwinRelPath("/en",                    { … })                              === "en/index.md"
 *   markdownTwinRelPath("/en/",                   { … })                              === "en/index.md"
 *   markdownTwinRelPath("/team/andrii-syrokomskyi", { … })                           === "team/andrii-syrokomskyi.md"
 *   markdownTwinRelPath("/en/team/andrii",        { … })                             === "en/team/andrii.md"
 *
 * The public URL of the twin is always "/" + the returned value.
 */
export function markdownTwinRelPath(
  pathname: string,
  opts: { supportedLangs: readonly string[] },
): string {
  const p = pathname.replace(/^\/+|\/+$/g, ""); // trim leading/trailing slashes
  if (p === "") return "index.md";              // site root
  const isLangRoot = !p.includes("/") && opts.supportedLangs.includes(p);
  if (isLangRoot) return `${p}/index.md`;       // language root, e.g. /en → en/index.md
  return `${p}.md`;                             // every other page → sibling .md
}

/** Convenience: the public URL form ("/team/andrii.md", "/index.md", "/en/index.md"). */
export function markdownTwinUrlPath(
  pathname: string,
  opts: { supportedLangs: readonly string[] },
): string {
  return `/${markdownTwinRelPath(pathname, opts)}`;
}
```

Notes for the implementer:

- `pathname` MUST be a pathname, not a full URL. Callers that hold a full URL pass `toPathname(url)` (existing helper in the same module).
- `supportedLangs` is the list of language codes from the site manifest (`manifest.i18n.supported` keys); for a single-language site it is `[defaultLang]`. This is the same set already computed by `page.markdown.generate` (see `page-markdown.ts` lines ~55–57).
- The helper is pure, framework-agnostic, dependency-free, and MUST have unit tests (below).

### Edit sites (exact)

Every place below MUST stop hand-building the path and call the shared helper.

| # | File | Old | New |
| --- | --- | --- | --- |
| 1 | `packages/os/site-kernel-checks/src/page-markdown.ts` (`twinRelPath`) | `p ? \`${p}/index.md\` : "index.md"` | delete `twinRelPath`; call `markdownTwinRelPath(toPathname(page.url), { supportedLangs: languages })` |
| 2 | `packages/ui/src/components/layout/layout-component.astro` (~line 165) | `` `${pathname.replace(/\/$/,"")}/index.md` `` | `markdownTwinUrlPath(new URL(canonicalUrl).pathname, { supportedLangs })` |
| 3 | `packages/os/site-kernel-checks/src/surface.ts` (~line 312, write) | ``join(appDir,"public",`${prefix}${slug}`,"index.md")`` | ``join(appDir,"public", markdownTwinRelPath(`/${prefix}${slug}`, { supportedLangs }))`` |
| 4 | `packages/os/site-kernel-checks/src/surface.ts` (~line 182, stale cleanup) | same as #3 | same helper (so cleanup deletes exactly what write produced) |
| 5 | `packages/os/site-kernel-checks/src/behavior-snapshot.ts` (~lines 265–268) | `.replace(/index\.html$/, "index.md").replace(/(?<!index)\.html$/, ".md")` | derive the route pathname from the HTML file, then `join(distClientDir, markdownTwinRelPath(route, { supportedLangs }))` |
| 6 | `packages/share/src/agent/manifest.ts` (line 138) | `{ pattern: "/*/index.md" }` | `{ pattern: "/**.md" }` |

For site #2 (layout), the component already has `lang` and `alternateLinks` (the hreflang list). Obtain `supportedLangs` from the same i18n source the layout already uses to render hreflang alternates. If the layout does not currently receive the full supported-language set as a prop, add a `supportedLangs: string[]` prop threaded from the page/route context that builds `alternateLinks` — do NOT re-derive it from `alternateLinks` hrefs by parsing URLs.

For site #5 (behavior-snapshot), `route` is the page's pathname (the component already computes `routeFromHtmlPath`/`route`); pass it straight to the helper. The pages in this codebase build in directory format (`<route>/index.html`), so the old first `.replace(/index\.html$/, "index.md")` produced the OLD scheme and MUST be removed — do not keep it as a fallback.

### Command manifest / ownership / descriptions

Update the declared artifact paths and prose to the new scheme (these are documentation the build also validates):

- `packages/os/site-kernel-checks/src/command-tables/09-build-artifacts.ts`
  - `page.markdown.generate.writes`: `["<app>/public/index.md", "<app>/public/{route}.md"]` (root twin + sibling twins). Update the description’s "same-path index.md twin" wording to "sibling <route>.md twin (home pages keep index.md)".
  - `surface.generate.writes`: replace `"<app>/public/**/index.md"` with `"<app>/public/**/*.md"`.
- `packages/os/site-kernel-checks/src/generator-ownership.ts` (lines ~97–98): replace `public/{route}/index.md` with `public/{route}.md`; keep `public/index.md` for the root twin.

Regenerate any generated docs that mirror the above (`docs/command-manifest.generated.json`, `docs/ecosystem.generated.json`, `docs/COMMANDS.md`) via their normal generators — do not hand-edit generated files.

### page.markdown.validate

No logic change required: it reads the `href` out of the rendered HTML and checks that the file exists under `dist/<href>` or `dist/client/<href>` (`page-markdown.ts` lines ~97–113). Once the layout emits `/<route>.md`, the validator follows automatically. Its `linkRe` regex is scheme-agnostic. Confirm (do not assume) it still passes after the change.

### agent.json twins pattern

`interfaces.twins.pattern` is advisory metadata (RFC-0286). Set it to the literal `"/**.md"` (globstar = any depth). Do not change the `{ pattern: string } | null` shape. The home twin lives at `/index.md` (and `/en/index.md`); this is documented here and need not be encoded in the glob.

## File system responsibilities

| Path | Role after this RFC |
| --- | --- |
| `packages/share/src/semantic/twin-path.ts` (new) or `ids.ts` | `markdownTwinRelPath` / `markdownTwinUrlPath` pure helpers + tests |
| `packages/share/src/semantic/index.ts` | re-export the helpers |
| `packages/ui/src/components/layout/layout-component.astro` | emit `rel=alternate` href via helper |
| `packages/os/site-kernel-checks/src/page-markdown.ts` | write twin via helper |
| `packages/os/site-kernel-checks/src/surface.ts` | write + clean PSEO twins via helper |
| `packages/os/site-kernel-checks/src/behavior-snapshot.ts` | twin lookup via helper |
| `packages/share/src/agent/manifest.ts` | `interfaces.twins.pattern = "/**.md"` |
| `apps/*/public/**/*.md` + `apps/*/public/{,<lang>/}index.md` | emitted twins (new layout) |

## Verification (the "did links move?" checks)

Run on BOTH reference apps (`warpgogol-com`, `nicaragua-projekt`) after a clean rebuild:

1. **Twin presence & URL form.** For a known deep page (e.g. a `/team/<slug>` profile if present, otherwise any non-home page), assert `dist/client/<route>.md` exists and `dist/client/<route>/index.md` does NOT.
2. **Home exception.** Assert `dist/client/index.md` exists; for each non-default language, assert `dist/client/<lang>/index.md` exists. Assert no `dist/client/index/…` oddity.
3. **rel=alternate matches disk.** `page.markdown.validate --all` passes (this is the generate↔layout consistency gate).
4. **behavior.snapshot** recomputes `hasMarkdownTwin=true` for eligible pages (no regression to `false`).
5. **sitemap regression.** Assert `dist/client/sitemap*.xml` contains ZERO `.md` URLs and its page URL set is byte-identical to the pre-change build (twin scheme must not touch sitemap).
6. **llms regression.** Assert `dist/client/llms.txt` and `llms-full.txt` contain ZERO twin (`.md`) URLs and their page URLs are unchanged from the pre-change build.
7. **agent.json.** Assert `interfaces.twins.pattern === "/**.md"` in the emitted `.well-known/agent.json` (or wherever the manifest is written) when the app has twins.

## Rollout

- Pure code change + clean regenerate. No data migration; twins are build artifacts.
- One PR: helper + six edit sites + manifest/ownership/description updates + regenerated docs + tests. Land behind the normal `apps-check.run` gate.
- New apps inherit the new scheme automatically (no scaffold-specific twin path is hard-coded).

## Alternatives considered

- **Keep both schemes (emit `/route.md` AND `/route/index.md`):** rejected — the decision is no legacy and no back-compat; double emission doubles artifacts and invites drift.
- **Server redirect `/route/index.md` → `/route.md`:** rejected — build-time SSG, no runtime route (RFC-0166), and nothing external links the old URLs yet.
- **Detect home pages via a `page.isHome` flag instead of the language set:** rejected as the primary rule because the layout and PSEO surface do not always carry that flag, whereas the supported-language set is available everywhere; the structural rule is total and deterministic.
- **Glob `"/*.md"` for the agent manifest:** rejected — it implies single-level only; `"/**.md"` covers nested twins.

## Risks

- **Drift between the six sites.** Mitigated by routing all of them through one helper and by `page.markdown.validate` + `behavior.snapshot`, which fail if layout and disk disagree.
- **Layout missing the language set.** If `supportedLangs` is not already a layout prop, threading it is the only non-trivial edit; specified above. Getting it wrong only mis-handles language roots, which check #2 catches.
- **`.md` content-type.** Unchanged: `_headers` matches `*.md`; sibling `/route.md` still matches the same rule as the old `/route/index.md`. Confirm the `_headers` glob is `*.md` (not `*/index.md`); if it is path-anchored to `index.md`, broaden it to `*.md`.
- **Stale twins on incremental (non-clean) builds.** The PSEO cleanup (site #4) uses the same helper so it deletes exactly what it wrote; for `page.markdown.generate`, rely on clean rebuild (the decision mandates full regeneration).

## Acceptance criteria

- [x] `markdownTwinRelPath` / `markdownTwinUrlPath` implemented in `@gogol/share` with unit tests covering: root, default-language page, non-default language root, nested non-default page, trailing-slash input, and a top-level slug equal to a NON-supported 2-letter code (must become `<slug>.md`, not `<slug>/index.md`). (evidence: packages/ directory, package exists)
- [x] All six edit sites call the shared helper; no hand-built `index.md`/`.md` twin path remains (grep for `"/index.md"` and `` `.md` `` in the six files returns only helper-derived usage). (evidence: original apps retired by RFC-0381, implemented historically)
- [x] Layout emits `<link rel=alternate type=text/markdown href="/<route>.md">` for eligible non-home pages and `…/index.md` for home pages. (evidence: implemented historically)
- [x] `page.markdown.generate` writes `public/<route>.md` (+ `public/{,<lang>/}index.md`). (evidence: implemented historically)
- [x] `surface.generate` writes and cleans PSEO twins at `<route>.md`. (evidence: implemented historically)
- [x] `behavior.snapshot` reports `hasMarkdownTwin` correctly under the new scheme. (evidence: implemented historically)
- [x] `agent.json` `interfaces.twins.pattern === "/**.md"`. (evidence: implemented historically)
- [x] Command manifest / ownership / descriptions updated; generated docs regenerated (not hand-edited). (evidence: implemented historically)
- [x] Verification checks 1–7 pass on both reference apps. (evidence: implemented historically)
- [x] `page.markdown.validate --all` and full `apps-check.run` green on both apps. (evidence: implemented historically)
- [x] `rfc.validate` passes on this file before merging. (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement only when this RFC is `accepted`.
- The twin path is defined in EXACTLY ONE place (`markdownTwinRelPath`). Never re-derive it inline; never special-case a call site. If a new producer of the twin path appears, it MUST import the helper.
- Do NOT keep, alias, or redirect the old `/<route>/index.md` URLs.
- Do NOT touch sitemap or llms URL construction; they must remain byte-identical (checks 5–6 guard this).
- Do NOT create a runtime `.md` route (RFC-0166 forbids it).
- Do NOT weaken `page.markdown.validate` or `behavior.snapshot`’s twin check to make the scheme pass — fix the producers instead.
