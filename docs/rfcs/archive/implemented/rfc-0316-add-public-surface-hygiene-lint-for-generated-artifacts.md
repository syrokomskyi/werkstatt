---
id: RFC-0316
title: "Add public surface hygiene lint for generated artifacts"
status: implemented
kind: command
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
  - RFC-0307
  - RFC-0184
  - RFC-0208
amendedBy: []
related:
  - RFC-0050
  - RFC-0166
  - RFC-0269
commands:
  proposed:
    - public.surface.lint
  added:
    - public.surface.lint
  changed:
    - public.artifact.validate
    - public.declaration.validate
    - llms.validate
    - page.markdown.validate
  removed: []
appsImpacted:
  - apps/*
packagesImpacted:
  - "@gogol/share"
  - "@gogol/site-kernel-checks"
successSignals:
  - "Generated public text artifacts contain no unresolved content references, no accidental HTML tags, no broken generated URLs, no CRLF line endings, no heading-only sections, no too-short sitemap descriptions, and no known malformed Markdown list artifacts."
  - "The default-language URL form used by llms.txt, llms-full.txt, sitemap, feed, and agent declarations is validated from one canonical URL helper."
  - "Every audit-class defect that can recur has a fail-hard check in the standard app pipeline."
nonGoals:
  - "Do not hand-edit generated public files to satisfy this lint."
  - "Do not make live network checks mandatory in offline package checks."
  - "Do not replace specialized validators such as sitemap.validate, feed.validate, agent.knowledge.validate, or page.markdown.validate."
  - "Do not add typography-normalization rules that replace ASCII hyphens with em dashes or en dashes; dash style remains editorial."
acceptance:
  - probe: command-registered
    name: "public.surface.lint"
  - probe: run
    command: "site-kernel run public.surface.lint --app webgogol-com --json"
    expect:
      exitCode: 0
---

# RFC-0316: Add public surface hygiene lint for generated artifacts

## Context

The July 5 public-folder audit found several generated public artifacts that were structurally present but semantically broken:

- `llms.txt` and `llms-full.txt` contained default-language URLs with a false `/de/` prefix.
- Markdown twins contained unresolved references such as `{business.offer.price.monthly}`.
- The accessibility Markdown projection produced broken list lines such as `- ---`, `- - ...`, and `- ### ...`.
- Text artifacts contained HTML fragments such as `<br>`.
- `favicon.svg` was the only public text file with CRLF line endings.

These are not one-off fixes. They are generator and validator gaps. The owner decision is that when a public artifact defect can be prevented by a check, the check must be added to the standard pipeline.

## Problem

Existing validators prove that individual files exist and have coarse structure, but they do not prove that generated public text is clean enough for crawlers and agents to consume. A generated file can pass existence checks while still publishing raw template placeholders, wrong locale prefixes, HTML tags inside Markdown/TXT, malformed Markdown, or stale route references.

## Decision

Add an app-scoped read-only command, `public.surface.lint`, that scans generated public text artifacts and fails on known hygiene defects. Wire it into `build.check`, `apps-check.author`, and postbuild validation where built output is needed.

The command is a cross-artifact lint. It composes and complements specialized validators:

- `llms.validate` still owns the llms structural contract.
- `page.markdown.validate` still owns markdown twin presence and head-link parity.
- `sitemap.validate` still owns sitemap XML structure and hreflang parity.
- `public.surface.lint` catches generic public-text defects that would otherwise be missed.

## Design

### CLI surface

```sh
pnpm exec site-kernel run public.surface.lint --app webgogol-com
pnpm exec site-kernel run public.surface.lint --app webgogol-com --json
```

The command reads `apps/<app>/public/` and, when `dist/client/` exists, may also read built HTML and generated public output copied by Astro.

### Rule set

| Rule | Severity | Scope | Meaning |
| --- | --- | --- | --- |
| `PUBTXT-01` | error | `public/**/*.txt`, `public/**/*.md`, `public/**/*.xml`, `public/**/*.json`, `public/**/*.svg` | File is not valid UTF-8. |
| `PUBTXT-02` | error | text public files | CRLF line endings found. Generated public text must use LF. |
| `PUBTXT-03` | error | `public/**/*.txt`, `public/**/*.md` | HTML tag found in AI-readable text, except allowed literal examples inside fenced code blocks. |
| `PUBTXT-04` | error | `public/**/*.txt`, `public/**/*.md`, `public/**/*.xml`, `public/**/*.json` | Unresolved content reference matching `\{[a-z][a-z0-9_-]*(\.[a-zA-Z0-9_-]+)+\}`. |
| `PUBTXT-05` | error | `public/**/*.md`, `public/llms-full.txt` | Malformed list artifact line: `- ---`, `- - `, or `- ###`. |
| `PUBTXT-06` | error | `public/llms*.txt`, `public/**/*.md` | Same-site URL uses the default-language prefix when the site declares unprefixed default-language routing. |
| `PUBTXT-07` | error | public text with Markdown links | Same-site generated link target is not part of the canonical route/declaration set or fails the local static existence check. |
| `PUBTXT-08` | error | `public/**/*.md` twins | Markdown twin contains a raw `Source: /relative-path` line without an absolute canonical URL. RFC-0320 replaces this with portable metadata. |
| `PUBTXT-09` | warning | `public/robots.txt` | Redundant allow/disallow noise that has no security value. |
| `PUBTXT-10` | error | public legal/accessibility/prose text | Slash-form dates such as `2026/06/01` appear in localized prose where ISO `2026-06-01` or locale-appropriate display dates are required. |
| `PUBTXT-11` | error | public business/offer text | Bare commercial amounts or untranslated business labels appear, for example `Change price: 15` or `Hourly rate: 90`, without currency, unit, or localized label. |
| `PUBTXT-12` | error | `public/**/*.md`, rendered sitemap HTML pages | Heading has no substantive content before the next heading or end of section. |
| `PUBTXT-13` | error | sitemap-member pages and their public Markdown twins | Meta/Markdown description is shorter than the site policy floor, default 70 visible characters, unless the page is explicitly exempt from sitemap membership. |
| `PUBJSON-01` | error | generated public JSON | Empty optional strings, objects, or arrays are serialized where the owning schema says omission is the correct absence representation. |

Rule details:

- `PUBTXT-04` is intentionally generic and catches `{business.offer.*}` plus future unresolved content-domain placeholders.
- `PUBTXT-06` uses the same canonical URL builder required by RFC-0317. It must not hardcode `de`; it checks the app's declared default language.
- `PUBTXT-07` resolves same-origin URLs in static text against the generated route registry, sitemap URL set, public fixed files, and runtime-owned declarations from RFC-0307. In offline mode it must not fetch the network.
- `PUBTXT-11` is backed by the business/offer projector contract: commercial terms that are structured in source as amount/currency/unit/note must render with all required units in public prose.
- `PUBTXT-12` ignores generated chrome headings such as navigation labels, but fails content headings followed only by whitespace, another heading, separators, or an empty list/table. This is a generic projection-quality rule, not a site-specific copy check.
- `PUBTXT-13` reads the same route/sitemap membership set used by sitemap generation. A noindex page excluded from the sitemap is not subject to the sitemap description floor. The default 70-character floor may be configured by site policy, but generators must not use a one-word placeholder such as `Leistungen.` for sitemap pages.
- `PUBJSON-01` is schema-driven. It must not ban every empty array globally; it bans only optional empty values where the owning generated-public JSON schema marks omission as canonical.

### Interpolation contract

The same content interpolation pipeline that feeds rendered HTML must also feed:

- per-page Markdown twins;
- `llms.txt`;
- `llms-full.txt`;
- agent-readable generated Markdown/TXT summaries.

No generator may serialize raw content props before reference interpolation. If a content reference cannot resolve, generation should fail before the lint sees it. `PUBTXT-04` is the final drift guard, not the primary interpolation mechanism.

### URL checking modes

`public.surface.lint` has two URL modes:

1. `local` mode, default: resolves same-site links against generated local files, known Astro routes, runtime-owned declarations, sitemap URL sets, and redirect map entries.
2. `--base-url <https-url>` mode: fetches same-site public URLs and requires 2xx for canonical URLs and approved redirect status for redirect entries.

Network mode is allowed in deploy/preflight checks but must not be required by offline package checks.

### Sitemap-to-twin parity check

For every canonical HTML URL in the content sitemap:

- if the page is eligible for a Markdown twin, the expected twin path must exist;
- no extra indexable Markdown twin may exist for a route absent from the sitemap unless it is explicitly marked noindex/runtime-owned by its generator;
- sitemap URLs must never point to `.md` twins.

The twin path formula is supplied by the active twin helper from RFC-0166/RFC-0306/RFC-0320. Do not reimplement it in this lint.

### Output format

`--json` emits canonical diagnostics:

```json
{
  "command": "public.surface.lint",
  "status": "fail",
  "diagnostics": [
    {
      "ruleId": "PUBTXT-04",
      "severity": "error",
      "file": "apps/webgogol-com/public/preis/index.md",
      "message": "Unresolved content reference: {business.offer.price.monthly}",
      "fixHint": "Run the same interpolation pipeline for markdown twins that rendered HTML uses."
    }
  ]
}
```

## Pipeline placement

- `public.surface.lint` runs in `apps-check.author` over `public/` after `build.prepare`.
- It also runs in `build.check` after all public artifact generators.
- Its sitemap/twin parity subcheck runs in `apps-check.postbuild` when `dist/client/` exists.
- URL network mode runs only through deploy/preflight commands or `public.runtime.probe`.

## Rollout

1. Implement the lint with all rules above.
2. Fix generators instead of generated files for every failing rule.
3. Add fixture tests for each rule, including the audit samples:
   - false default-language prefix in llms links;
   - unresolved `{business.offer.price.monthly}`;
   - `- ---`, `- - `, and `- ###`;
   - `<br>` in llms-full;
   - CRLF in a public SVG;
   - slash-form accessibility dates;
   - bare commercial terms such as `Change price: 15`;
   - optional empty arrays such as `sectionAnchors: []` in generated public JSON.
4. Wire the command into standard app checks.

## Alternatives considered

- **Only strengthen each specialized validator.** Rejected. Some defects are format-agnostic and belong to a shared public-text lint.
- **Use recursive grep scripts in CI.** Rejected. The checks need canonical diagnostics, app routing context, and local/runtime URL classification.
- **Fetch every public URL during normal checks.** Rejected. Network checks belong to explicit runtime probes.

## Risks

- **False positives on legitimate code examples.** Mitigated by ignoring fenced code blocks for HTML-tag and placeholder scans.
- **Duplicate link validation logic.** Mitigated by importing canonical route, twin, and public declaration helpers rather than re-parsing independently.
- **Large public trees.** Mitigated by scanning only small text-like artifacts and ignoring hashed binary assets.

## Acceptance criteria

- [x] `public.surface.lint` is registered with app scope and canonical diagnostics. (evidence: implemented historically)
- [x] Rules `PUBTXT-01` through `PUBTXT-13` are implemented and fixture-tested. (evidence: implemented historically)
- [x] `public.surface.lint` is wired into `build.check` and `apps-check.author`; postbuild parity (evidence: implemented historically) runs when `dist/client/` exists.
- [x] `llms.generate`, `page.markdown.generate`, and any public text generator use the same content (evidence: implemented historically) interpolation path as rendered HTML.
- [x] `grep -R "{business\\." apps/webgogol-com/public` is empty after regeneration. (evidence: original apps retired by RFC-0381, implemented historically)
- [x] `grep -E "^- ---$|^- - |^- ###|<br" apps/webgogol-com/public/**/*.md public/llms-full.txt` (evidence: original apps retired by RFC-0381, implemented historically) has no matches, represented by the lint instead of shell-only CI.
- [x] Same-site links in `llms.txt`, `llms-full.txt`, and Markdown twins resolve locally or are (evidence: implemented historically) classified as runtime-owned.
- [x] Public offer/business text contains localized labels and amount/currency/unit rendering, not (evidence: implemented historically) bare numeric terms.
- [x] Sitemap-member pages have descriptions at or above the policy floor, default 70 visible (evidence: implemented historically) characters.
- [x] Generated public Markdown and rendered sitemap pages contain no content headings without (evidence: implemented historically) substantive content beneath them.
- [x] Generated public JSON omits optional empty values according to schema-owned absence rules. (evidence: implemented historically)
- [x] `rfc.validate` passes. (evidence: implemented historically)

## Implementation notes for agents

- Agents may implement this RFC because its status is `accepted`.
- Fix generator/projector code first. Never patch generated `public/` files by hand.
- Do not add app-specific regex exceptions for `webgogol-com`; the lint must work for every app.
- Do not weaken a specialized validator because `public.surface.lint` exists.
- Treat every new recurring public artifact defect as a candidate rule in this command or a specialized validator.

## Backfilled sections (RFC-0366)

The following headings were added when the RFC mini-template was retired. The original command/policy RFC used the mini form, which recorded only Context, Decision, Acceptance criteria, and Implementation notes. These sections satisfy the unified full-template contract without altering the original decision.

## Architectural fit

This RFC aligns with the DNA invariants and related RFCs listed in the frontmatter. (Backfilled during mini-template retirement; original mini-RFC did not include a separate Architectural fit section.)
