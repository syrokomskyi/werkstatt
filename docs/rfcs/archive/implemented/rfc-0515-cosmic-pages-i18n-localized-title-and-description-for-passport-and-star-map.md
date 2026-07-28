---
id: RFC-0515
title: "Cosmic pages i18n — localized title and description for passport and star-map"
status: implemented
# kind options: architecture | contract | command | policy | deprecation
kind: architecture
# scope options: app | workspace
scope: workspace
owners:
  - architecture
# Set by the deciding human together with the status change (RFC-0335).
# Draft scaffolds must keep this empty; do not prefill a default identity.
# Format: human:<handle> (agent:<id> reserved — see RFC-0335).
# Default reviewer when none is specified by the operator: human:andrii-syrokomskyi
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-07-24
updatedAt: 2026-07-24
enhancedAt: 2026-07-24
implementedAt: 2026-07-24
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0025
  - RFC-0028
  - RFC-0331
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-23
# RFC-0396: Traceability to a vendored spec node: "<spec-id>/<node-id>", e.g. "pbp/RFC-PBP-020".
# Set by spec.materialize; leave commented for non-spec RFCs.
# specRef:
# RFC-0478: Platform versioning enforcement. Declares the SemVer delta this RFC
# produces when implemented. Required for post-cutoff implemented RFCs (V-29).
# Values: minor (Breaks-B, requires migrator), patch (safe), none (prose-only),
# major (architectural, manually reserved). Default: patch.
versionBump: patch
commands:
  proposed: []
  added: []
  changed: []
  removed: []
appsImpacted:
  - warpgogol-com
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - "@gogol/site-kernel-codegen"
successSignals:
  - "Cosmic passport and star-map pages render locale-appropriate title and description in non-DE locales, not the German system tagline."
  - "The overlay.pages.generate generator uses manifest.app as the brand for non-DE locales instead of the German tagline-derived brand."
  - "A generator unit test asserts that non-DE cosmic page output does not contain the German tagline string."
  - "The system tagline remains the single source of truth in system.md identity.tagline — the generator does not embed it in non-DE cosmic page metadata."
nonGoals:
  - "Does not change the cosmic page route slugs or URL schema."
  - "Does not change the cosmic page block structure or planet assignments."
  - "Does not translate the system tagline itself — the tagline is a brand asset defined in system.md."
  - "Does not add new cosmic pages or remove existing ones."
  - "Does not add a build-time validator command — the fix is in the generator, enforced by a generator unit test, not a runtime check on generated output."
# RFC-0268: OPTIONAL machine-checkable acceptance probes, executed on-demand
# via `pnpm exec site-kernel run rfc.acceptance.run --id <this-rfc-id>` (never
# automatically inside build pipelines). Closed probe vocabulary — see
# docs/rfcs/rfc-0268-make-rfc-acceptance-criteria-machine-checkable.md.
# acceptance:
#   - probe: run
#     command: "site-kernel run some.command.validate --app warpgogol-com"
#     expect:
#       exitCode: 0
#   - probe: file-exists
#     path: "packages/share/src/some-new-module.ts"
#   - probe: command-registered
#     name: "some.new.command"
#   - probe: file-contains
#     path: "AGENTS.md"
#     pattern: "Some new governance paragraph"
---

# RFC-0515: Cosmic pages i18n — localized title and description for passport and star-map

## Context

The cosmic passport and star-map pages (`pages/{de,uk}/cosmic/passport.md` and `pages/{de,uk}/cosmic/star-map.md`) are system/audit pages that expose the release manifest and section overview. They are **generated** by the `overlay.pages.generate` command (`packages/os/site-kernel-codegen/src/app-boilerplate.ts:runGenerateOverlayPages`), which produces identical `title` and `description` frontmatter for all locales.

The generator derives the brand component of the title from `brandHeadFromTagline(manifest.identity?.tagline)`. For warpgogol-com, the tagline is `"Website, die gefunden wird und Ihrem Betrieb gehört"` — it contains no em-dash, so `brandHeadFromTagline` returns the entire tagline as the brand head. This produces titles like `"Cosmic Passport · Website, die gefunden wird und Ihrem Betrieb gehört"` and descriptions like `"Release manifest for Website, die gefunden wird und Ihrem Betrieb gehört: …"` for **both** DE and UK locales.

The final integration audit (file 17, finding F-002) flagged this as a P3 issue: while these are not customer-facing pages, the German text in UK-locale metadata is inconsistent and could appear in browser tabs, search results, or shared link previews for Ukrainian-speaking visitors.

## Problem

1. **Generator embeds German tagline in all locales.** The `runGenerateOverlayPages` generator uses `brandHeadFromTagline(manifest.identity?.tagline)` as the brand for every locale (line 81 of `app-boilerplate.ts`). The tagline is a German brand asset, so non-DE cosmic pages get German text in their `title` and `description`. This is not a PBP reference or a hand-edited string — it is the generator's locale-agnostic brand resolution.

2. **No generator-level locale awareness.** The generator loops over `langs` but uses the same `passportTitle` / `passportDescription` / `starMapTitle` / `starMapDescription` for all locales (lines 82–89, 103–123). There is no mechanism to produce locale-specific metadata for non-DE locales.

3. **Brand vs. locale confusion.** The system tagline (`system.md identity.tagline`) is a brand asset in German. Non-DE cosmic pages should use a locale-neutral identifier (the app name) or a localized description of the page's purpose, not the German tagline.

## Decision

The `overlay.pages.generate` generator produces locale-appropriate `title` and `description` for non-DE cosmic pages by using `manifest.app` (the site identifier) as the brand instead of the tagline-derived brand. The default-locale (DE) cosmic pages remain unchanged — the German tagline is the master-locale brand and may appear there. A generator unit test asserts that non-DE cosmic page output does not contain the German tagline string.

No new build-time validator command is added — the fix is in the generator, enforced by a generator unit test, not a runtime check on generated output. Generated files are deterministic outputs of the generator; validating them at build time would only re-check what the generator already controls.

## Architectural fit

- **DNA-23 (Cosmic overlay):** Cosmic pages are part of the cosmic overlay system. Their metadata should respect the locale of the page, not impose the master-locale brand string on all locales. This RFC extends DNA-23 by requiring the generator to produce locale-aware metadata for cosmic pages.
- **Generated file ownership (RFC-0087):** Cosmic page `.md` files are generated by `overlay.pages.generate` and carry the `GENERATED` marker. The fix targets the generator source (`packages/os/site-kernel-codegen/src/app-boilerplate.ts`), not the generated output. This follows the single-owner and content-driven generation invariants.
- **Page contracts:** The `title` and `description` frontmatter fields are page-level metadata used in `<head>`, sitemaps, and social sharing. They must match the page's `lang` field.
- **Layer C:** No URL or sitemap shape changes — `breaksC: false`.

## Design

### Generator change

In `packages/os/site-kernel-codegen/src/app-boilerplate.ts:runGenerateOverlayPages`, the brand resolution is made locale-aware. The current code computes a single `brand` from `brandHeadFromTagline(manifest.identity?.tagline)` and reuses it for all locales. The fix moves brand resolution inside the per-locale loop and uses `manifest.app` for non-DE locales:

```ts
const defaultLang = getDefaultLanguage(manifest);
for (const lang of langs) {
  const isDefaultLang = lang === defaultLang;
  const brand = isDefaultLang
    ? (brandHeadFromTagline(manifest.identity?.tagline) ?? manifest.app)
    : manifest.app;
  const passportTitle = clampTitle(`Cosmic Passport · ${brand}`);
  const passportDescription = clampMeta(
    `Release manifest for ${brand}: signing keys, source provenance, star-map for audits.`,
  );
  const starMapTitle = clampTitle(`Cosmic Star Map · ${brand}`);
  const starMapDescription = clampMeta(
    `Section and component overview of ${brand} as a cosmic map for reviewers and auditors.`,
  );
  // … write files as before
}
```

For non-DE locales, `manifest.app` (e.g. `warpgogol-com`) is used as the brand — it is locale-neutral and does not embed the German tagline. The description template remains in English (the lingua franca for audit pages); the key fix is removing the German tagline from the brand component.

### Generator test

A unit test in `packages/os/site-kernel-codegen/src/tests/` asserts that the generator output for non-DE locales does not contain the German tagline string:

```ts
// packages/os/site-kernel-codegen/src/tests/cosmic-pages-i18n.test.ts
import { test, expect } from "vitest";

test("non-DE cosmic pages do not contain the German tagline", () => {
  const tagline = "Website, die gefunden wird und Ihrem Betrieb gehört";
  const manifest = {
    app: "warpgogol-com",
    identity: { tagline },
    i18n: { default: "de", supported: { de: {}, uk: {} } },
    release: { passport: { enabled: true } },
  };
  const files = buildOverlayFiles(manifest);
  const ukPassport = files.find((f) => f.path.endsWith("uk/cosmic/passport.md"));
  const ukStarMap = files.find((f) => f.path.endsWith("uk/cosmic/star-map.md"));
  expect(ukPassport).toBeDefined();
  expect(ukStarMap).toBeDefined();
  expect(ukPassport!.content).not.toContain(tagline);
  expect(ukStarMap!.content).not.toContain(tagline);
});

test("DE cosmic pages retain the tagline-derived brand", () => {
  const tagline = "Website, die gefunden wird und Ihrem Betrieb gehört";
  const manifest = { /* same as above */ };
  const files = buildOverlayFiles(manifest);
  const dePassport = files.find((f) => f.path.endsWith("de/cosmic/passport.md"));
  expect(dePassport!.content).toContain(tagline);
});
```

The test uses exact-match (full tagline string) to avoid false positives from common German words. The `buildOverlayFiles` helper extracts the file-generation logic from `runGenerateOverlayPages` into a pure function testable without filesystem I/O.

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/os/site-kernel-codegen/src/app-boilerplate.ts` | Make `runGenerateOverlayPages` locale-aware — use `manifest.app` for non-DE brand |
| `packages/os/site-kernel-codegen/src/tests/cosmic-pages-i18n.test.ts` | Add generator test asserting non-DE output does not contain the German tagline |
| `src/content/pages/{de,uk}/cosmic/passport.md` | Regenerated by `overlay.pages.generate` — not hand-edited |
| `src/content/pages/{de,uk}/cosmic/star-map.md` | Regenerated by `overlay.pages.generate` — not hand-edited |

### Failure modes

- The generator test fails if non-DE cosmic page output contains the full German tagline string.
- DE cosmic pages are not checked — the German tagline is the master-locale brand and may appear there.
- The tagline in `system.md` or other non-cosmic pages is not affected.

## Rollout

- **Default behavior:** The generator fix applies to all sites with cosmic pages (`release.passport.enabled`). No new build-time command is added.
- **warpgogol-com adoption:** After RFC acceptance, re-run `overlay.pages.generate --site warpgogol-com` to regenerate cosmic pages with locale-aware metadata. DE pages remain unchanged; UK pages use `manifest.app` as the brand.
- **New sites:** `overlay.pages.generate` produces locale-appropriate metadata from the start — no additional action needed.
- **No migration needed:** The fix is a generator change, not a data contract change. Regenerating cosmic pages is a build-step, not a migration.

## Alternatives considered

- **Add a `cosmic.pages.i18n.validate` build-time command.** Rejected — the cosmic page files are generated outputs. A validator on generated output re-checks what the generator deterministically controls. If the generator is correct, the validator always passes; if the generator is wrong, the validator fails on every build until the generator is fixed. A generator unit test is more effective: it catches the regression at the source, runs faster, and doesn't add a build-time command to the pipeline.
- **Use PBP reference for tagline in cosmic pages.** Rejected — the tagline is a brand string, not a business data field. PBP references are for business data (prices, policies, offerings). The tagline belongs in `system.md identity.tagline` and should not be injected into page metadata.
- **Remove title/description from cosmic pages entirely.** Rejected — pages need metadata for browser tabs, sitemaps, and social sharing. The fix is to use a locale-neutral brand, not to remove metadata.
- **Make cosmic pages DE-only (no UK version).** Rejected — the cosmic pages are part of the site's transparency layer and should be available in all published locales.
- **Full Ukrainian localization of cosmic page descriptions.** Rejected — cosmic pages are system/audit pages with low traffic. Using `manifest.app` (locale-neutral) as the brand is sufficient. Full Ukrainian prose for audit page metadata is over-engineering for a P3 cosmetic issue.

## Risks

- **Low impact.** Cosmic pages are system/audit pages with low traffic. The risk of not fixing is cosmetic (German text in Ukrainian browser tab), not functional.
- **DE page title length.** The DE cosmic page title `"Cosmic Passport · Website, die gefunden wird und Ihrem Betrieb gehört"` is already clamped to 70 chars by `clampTitle`. This RFC does not change DE pages.
- **`brandHeadFromTagline` edge case.** The tagline `"Website, die gefunden wird und Ihrem Betrieb gehört"` has no em-dash, so `brandHeadFromTagline` returns the entire tagline. This is the mechanism by which the tagline enters the title. The fix bypasses `brandHeadFromTagline` for non-DE locales entirely, using `manifest.app` instead.
- **Generator test false positives.** The test uses exact-match on the full tagline string, not individual German words. Common German words ("Website", "die", "und") that appear in legitimate English descriptions are not flagged.

## Acceptance criteria

- [x] `runGenerateOverlayPages` uses `manifest.app` as the brand for non-DE locales (evidence: packages/os/site-kernel-codegen/src/app-boilerplate-helpers.ts:375-399, buildCosmicPageMetadata)
- [x] UK cosmic passport page (generated) does not contain the German tagline in `title` or `description` (evidence: missions/warpgogol-com-m000010/workpiece/src/content/pages/uk/cosmic/passport.md:6-7, title="Cosmic Passport · warpgogol-com")
- [x] UK cosmic star-map page (generated) does not contain the German tagline in `title` or `description` (evidence: missions/warpgogol-com-m000010/workpiece/src/content/pages/uk/cosmic/star-map.md:6-7, title="Cosmic Star Map · warpgogol-com")
- [x] DE cosmic pages remain unchanged (tagline-derived brand retained) (evidence: missions/warpgogol-com-m000010/workpiece/src/content/pages/de/cosmic/passport.md:6-7, title still contains tagline)
- [x] Generator unit test asserts non-DE output does not contain the German tagline (evidence: packages/os/site-kernel-codegen/src/tests/cosmic-pages-i18n.test.ts, 5 tests pass)
- [x] `rfc.validate` passes on this file before merging (evidence: pnpm exec site-kernel run rfc.validate --json, no RFC-0515 violations)

## Implementation notes for agents

<!-- Rules that govern how AI agents interact with this RFC.
     Be explicit. Agents read this section for behavioral policy.

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- For RFCs created on or after 2026-07-07 with acceptance probes: before stamping `implemented`, run
  `site-kernel run rfc.verification.emit --id <this-rfc-id>` and commit the evidence file
  in the same commit (RFC-0330 amended transition precondition).
- Agents MUST NOT weaken or remove enforcement rules established by this RFC
  without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run
  `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N"`
  instead of working around it (RFC-0334).
-->
