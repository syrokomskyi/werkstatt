---
id: RFC-0911
title: "SEO metadata quality gates: cross-page title and description uniqueness plus anchor-text lint"
status: implemented
# kind options: architecture | contract | command | policy | deprecation
kind: command
# scope options: app | workspace
scope: workspace
owners:
  - architecture
# Set by the deciding human together with the status change (RFC-0335).
# Draft scaffolds must keep this empty; do not prefill a default identity.
# Format: human:<handle> (agent:<id> reserved — see RFC-0335)
# Default reviewer when none is specified by the operator: human:andrii-syrokomskyi
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-08-21
updatedAt: 2026-08-22
enhancedAt: 2026-08-22
implementedAt: 2026-08-22
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0026
  - RFC-0162
  - RFC-0206
  - RFC-0909
  - RFC-0910
  - RFC-0912
batch: seo-indexing-hardening
dependsOn: []
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies: []
# RFC-0396: Traceability to a vendored spec node: "<spec-id>/<node-id>", e.g. "pbp/RFC-PBP-020".
# Set by spec.materialize; leave commented for non-spec RFCs.
# specRef:
# RFC-0478: Platform versioning enforcement. Declares the SemVer delta this RFC
# produces when implemented. Required for post-cutoff implemented RFCs (V-29).
# Values: minor (Breaks-B, requires migrator), patch (safe), none (prose-only),
# major (architectural, manually reserved). Default: patch.
versionBump: minor
commands:
  proposed: []
  added:
    - seo.meta-uniqueness.validate
    - seo.anchor-text.validate
  changed: []
  removed: []
appsImpacted: []
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - "@warpgogol/werkstatt-site"
  - "@warpgogol/werkstatt-shared"
successSignals:
  - "seo.meta-uniqueness.validate fails when two indexable pages share an identical <title> or meta description within one language"
  - "seo.anchor-text.validate fails on generic anchor text (\"click here\", \"hier klicken\", \"тут\") in rendered HTML"
  - "warpgogol passes both validators after content greening"
nonGoals:
  - Title/description presence and OG/Twitter parity (covered by content.validate RFC-0026 and seo.meta.validate RFC-0162).
  - Internal link target integrity (covered by content.links.validate RFC-0206).
  - Keyword strategy, title copywriting quality, or snippet CTR optimization — the gates check uniqueness and anchor descriptiveness, not marketing quality.
# RFC-0268: OPTIONAL machine-checkable acceptance probes, executed on-demand
# via `pnpm exec werkstatt run rfc.acceptance.run --id <this-rfc-id>` (never
# automatically inside build pipelines). Closed probe vocabulary — see
# docs/rfcs/rfc-0268-make-rfc-acceptance-criteria-machine-checkable.md.
acceptance:
  - probe: command-registered
    name: "seo.meta-uniqueness.validate"
  - probe: command-registered
    name: "seo.anchor-text.validate"
  - probe: run
    command: "werkstatt run seo.meta-uniqueness.validate --site warpgogol"
    expect:
      exitCode: 0
---

# RFC-0911: SEO metadata quality gates: cross-page title and description uniqueness plus anchor-text lint

## Context

The 2026-08-21 SEO audit confirmed that presence-level metadata enforcement is complete: every page requires a `description` at content level (RFC-0026), and every rendered indexable page must carry OG/Twitter meta with `og:url` == canonical (RFC-0162). What is not enforced anywhere is **distinctiveness** and **link-text quality**:

- Two pages may share an identical `<title>` or meta description and pass every gate. Google deduplicates or rewrites such titles/snippets, and users cannot distinguish results.
- Anchor text may be generic ("click here", "hier klicken", "тут") — the Google SEO Starter Guide explicitly calls out descriptive link text as a comprehension signal for users and crawlers. `content.links.validate` (RFC-0206) checks that link _targets_ resolve, not that link _text_ says anything.

## Problem

1. **Uniqueness is unenforced** — `content.validate` requires the field; no validator compares values across pages. As the fleet and page count grow, collisions become likely (translated sister pages, generated surface pages, series articles).
2. **Anchor text is unenforced** — nothing scans rendered HTML for generic link text.
3. Both gaps are currently covered only by author discipline, which does not scale across sites, languages, and agents.

## Decision

The workshop gains two post-build validators: `seo.meta-uniqueness.validate`, which fails when two indexable rendered pages in the same language share an identical `<title>` or meta description, and `seo.anchor-text.validate`, which fails when rendered internal links use generic anchor text from a built-in de/uk stop-list that sites may extend via `system.md`.

## Architectural fit

- **RFC-0026 / RFC-0162 (related)** — presence gates; this RFC adds the distinctiveness layer on top, reusing the same rendered-HTML scan infrastructure (`collectRenderedHtml`, noindex/redirect filtering) as `seo.meta.validate`.
- **System manifest extension** — the `seo.anchorText.extraStopPhrases` extension point is a new typed optional field on `SystemManifest` in `@warpgogol/werkstatt-shared`, following the existing pattern of typed optional fields (`knowledge?`, `businessModel?`, `ui?`).
- **Site OS operator model** — both commands are app-scoped postbuild validators in `SITES_CHECK_POSTBUILD_PIPELINE`, consistent with the existing SEO audit family (`05-seo-audit.ts` command table).

## Design

### CLI surface

```sh
pnpm exec werkstatt run seo.meta-uniqueness.validate --site warpgogol
pnpm exec werkstatt run seo.anchor-text.validate --site warpgogol
pnpm exec werkstatt run seo.anchor-text.validate --site warpgogol --json
```

Both are app scope, read `dist/client/**/*.html`, and skip gracefully (exit 0) when `dist/` is not built — same postbuild-gate pattern as `seo.meta.validate` (RFC-0162).

### TypeScript contracts

```ts
// Comparison units, one per rendered indexable page:
interface PageMeta {
  file: string;
  lang: string;          // from <html lang> or route prefix
  title: string;         // normalized: trim + collapse whitespace
  description: string;   // normalized the same way
}

// Uniqueness is evaluated per language: a de page and its uk translation
// never collide (different language, different text by definition).

// system.md extension point (optional):
interface SeoConfig {
  anchorText?: {
    /** Added to the built-in de/uk stop-list. */
    extraStopPhrases?: Record<string, string[]>; // lang -> phrases
  };
}

// Built-in defaults (non-exhaustive example):
// de: ["hier", "hier klicken", "mehr", "mehr erfahren", "link"]
// uk: ["тут", "натисніть тут", "детальніше", "посилання"]
// en is omitted — no site in the fleet uses English as a content language.
// Add en when an English-language site is onboarded; the system.md extension
// point handles site-local needs in the meantime.
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/werkstatt-site/src/checks/audit/validators/seo-meta-uniqueness.ts` | Uniqueness validator implementation |
| `packages/werkstatt-site/src/checks/audit/validators/seo-anchor-text.ts` | Anchor-text validator implementation |
| `packages/werkstatt-site/src/checks/audit-validators.ts` | Re-export barrel — export both new validator functions |
| `packages/werkstatt-site/src/checks/command-tables/05-seo-audit.ts` | Command registration |
| `packages/werkstatt-site/src/checks/pipelines/sites-check-postbuild.ts` | Pipeline wiring |
| `packages/werkstatt-shared/src/content/system-manifest.ts` | Add `seo?` field to `SystemManifest` interface |
| `dist/client/**/*.html` (workpiece) | Read-only scan target |
| `src/content/system.md` (workpiece) | Optional `seo.anchorText.extraStopPhrases` extension |
| Site content files | Never modified by the validators — diagnostics only |

### Output format

Standard Diagnostic envelope (`{ command, status, count, findings[], ... }`). When `--json` is passed, the kernel wraps the result in the standard command JSON shape (`{ commandName, data, exitCode, ok, summary }`). Rules:

| Rule | Severity | Condition |
| --- | --- | --- |
| `SEO-UNIQ-01` | error | Two or more indexable pages in the same language share an identical `<title>`. |
| `SEO-UNIQ-02` | error | Two or more indexable pages in the same language share an identical meta description. |
| `SEO-ANCHOR-01` | error | Rendered `<a>` whose full text content matches a stop-list phrase (case-insensitive, punctuation-stripped). |
| `SEO-ANCHOR-02` | warning | Anchor text is a bare URL (`href` text equals the link text) — poor but sometimes intentional in legal pages. |

Each diagnostic names the colliding files (for uniqueness) or the file and anchor text (for the lint), so remediation is a content edit, not an investigation.

### Failure modes

- `SEO-UNIQ-01`, `SEO-UNIQ-02`, and `SEO-ANCHOR-01` exit 1 — error from day one (operator decision 2026-08-21). `SEO-ANCHOR-02` is a warning (exit 0). warpgogol content is greened inside this RFC's rollout (duplicate titles/descriptions rewritten, generic anchors replaced) before the validators join the pipeline as error.
- `noindex` pages, HTML redirect pages, and `.well-known` artifacts are excluded (same filters as `seo.meta.validate`) — utility pages may share boilerplate legitimately.
- **Performance:** each validator independently calls `collectRenderedHtml(audit.distDirectory)`, reading all HTML files into memory. For warpgogol (~124 pages) this is acceptable. The double-scan cost is consistent with the existing SEO validator family pattern (`seo.meta.validate`, `seo.structured-data.validate`, `seo.domain.validate` each scan independently).
- **Single-page sites:** uniqueness is trivially satisfied with one page — no collision is possible. The validator returns pass without special-casing.
- **`lang` extraction chain:** prefer `<html lang>` attribute; fall back to route prefix (first path segment matching a supported locale); fall back to `i18n.default` from the system manifest. Root-level pages without a language prefix (e.g. `/impressum`) are assigned the manifest's default language.
- Anchor matching is whole-text only: a descriptive sentence containing "hier" does not trigger SEO-ANCHOR-01; a link whose entire text is "hier" does.

## Rollout

1. Implement both validators with tests (collision fixtures, translation non-collision, noindex exclusion, stop-list extension).
2. Run both against warpgogol; fix the flagged content through a mission (unique titles/descriptions, descriptive anchors) before pipeline wiring.
3. Wire both into `SITES_CHECK_POSTBUILD_PIPELINE` as error.
4. New sites comply from day one: generated starter content uses unique per-page metadata already, and any generic anchor fails the pipeline at first build.

## Alternatives considered

- **Author-time validation (frontmatter scan) instead of rendered HTML** — rejected: titles and descriptions can be assembled by builders (suffixes, brand appending), so only the rendered output is the truth worth comparing.
- **Fixed stop-list in code only** — rejected (operator decision 2026-08-21): fleets span languages and domains; `system.md` extension keeps the defaults without blocking site-specific vocabulary.
- **Warning-first gated adoption (RFC-0903 precedent)** — rejected by the operator: error from day one, with warpgogol greened inside the same rollout.
- **Similarity threshold instead of exact-match uniqueness** — rejected: fuzzy matching has false positives on legitimately similar pages (de/uk legal twins); exact match after normalization is deterministic and explainable.

## Risks

- **False positives on boilerplate-heavy pages** — e.g. two legal pages sharing a title by design. Mitigation: noindex/redirect exclusions; if a real collision is intentional, the fix is distinct titles, not a suppression list.
- **Stop-list drift across languages** — the built-in lists need occasional extension as content evolves; the `system.md` extension point handles site-local cases without package releases.
- **Agent misinterpretation** — agents must not "resolve" uniqueness findings by appending page ids or dates to titles mechanically; the diagnostic calls for a content decision by the author.

## Acceptance criteria

- [x] `seo.meta-uniqueness.validate` registered (app scope, postbuild) with SEO-UNIQ-01/02 (evidence: packages/werkstatt-site/src/checks/command-tables/05-seo-audit.ts:270-277, packages/werkstatt-site/src/checks/audit/validators/seo-meta-uniqueness.ts:78-203)
- [x] `seo.anchor-text.validate` registered (app scope, postbuild) with SEO-ANCHOR-01/02 and built-in de/uk stop-lists (evidence: packages/werkstatt-site/src/checks/command-tables/05-seo-audit.ts:280-287, packages/werkstatt-site/src/checks/audit/validators/seo-anchor-text.ts:131-240)
- [x] `system.md` supports `seo.anchorText.extraStopPhrases` extension (evidence: packages/werkstatt-shared/src/content/system-manifest.ts:106-111, packages/werkstatt-site/src/checks/tests/seo-anchor-text.test.ts:176-188)
- [x] Both validators wired into `SITES_CHECK_POSTBUILD_PIPELINE` as error (evidence: packages/werkstatt-site/src/checks/pipelines/sites-check-postbuild.ts:29-30)
- [x] Unit tests: same-language collision fails, translation pair does not collide, noindex excluded, whole-text anchor matching only (evidence: packages/werkstatt-site/src/checks/tests/seo-meta-uniqueness.test.ts:1-179, packages/werkstatt-site/src/checks/tests/seo-anchor-text.test.ts:1-211)
- [x] warpgogol content greened and passes both validators — content decisions (rewriting duplicate titles, replacing generic anchors) are human authoring tasks, not mechanical agent edits (evidence: mission m000085 workpiece `astro build` + `seo.meta-uniqueness.validate` exitCode=0 + `seo.anchor-text.validate` exitCode=0, 2026-08-22)
- [x] `AGENTS.md` updated where agent behavior rules changed (evidence: packages/werkstatt-site/AGENTS.md:114-115, packages/werkstatt-shared/AGENTS.md:75-88)
- [x] `rfc.validate` passes on this file before merging (evidence: rfc.validate --id RFC-0911 0 errors after V-27 fix + evidence file pass)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Before stamping `implemented`, run `pnpm exec werkstatt run rfc.verification.emit --id RFC-0911` and commit the evidence file in the same commit (RFC-0330 amended transition precondition).
- Content fixes for uniqueness findings go through a mission workpiece, never through direct cache-clone edits (site content editing rule).
- Agents MUST NOT mechanically suffix titles/descriptions (page ids, dates, counters) to force uniqueness — findings are resolved by authorial content decisions.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0911 --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
