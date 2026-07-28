---
id: RFC-0321
title: "Close warpgogol-com offer content audit decisions"
status: implemented
kind: contract
scope: app
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
  - RFC-0243
amendedBy: []
related:
  - RFC-0045
  - RFC-0165
  - RFC-0211
  - RFC-0218
  - RFC-0307
  - RFC-0316
  - RFC-0318
commands:
  proposed: []
  added: []
  changed:
    - content.business.validate
    - content.references.validate
    - page.markdown.generate
    - page.markdown.validate
    - public.surface.lint
    - redirect.map.validate
    - behavior.snapshot.validate
  removed: []
appsImpacted:
  - warpgogol-com
packagesImpacted:
  - "@gogol/business"
  - "@gogol/share"
  - "@gogol/site-kernel-checks"
successSignals:
  - "The German warpgogol-com offer surface has one response-time guarantee: 24 hours on working days."
  - "German visitor-facing copy uses the owner-approved audience register Kund:innen where the site addresses customers generically."
  - "The /leistungen/uebersicht route is retired through a 301 to /leistungen/ and no longer appears in sitemap, llms, or Markdown twin output."
  - "German public text no longer publishes unperformed accessibility tests or the former Paragraph 24 founder descriptor."
nonGoals:
  - "Do not edit generated public Markdown twins directly."
  - "Do not update Ukrainian prose copy in this RFC, except for cross-language numeric facts that are canonical business data."
  - "Do not add text-specific validator commands for one client site."
  - "Do not introduce a typography lint that replaces ASCII hyphens with long dashes."
acceptance:
  - probe: run
    command: "site-kernel run content.references.validate --app warpgogol-com --json"
    expect:
      exitCode: 0
  - probe: run
    command: "site-kernel run redirect.map.validate --app warpgogol-com --json"
    expect:
      exitCode: 0
  - probe: run
    command: "site-kernel run public.surface.lint --app warpgogol-com --json"
    expect:
      exitCode: 0
---

# RFC-0321: Close warpgogol-com offer content audit decisions

## Context

The July 5 public Markdown audit reviewed `apps/warpgogol-com/public/`, not the full source tree. It still surfaced real product defects because public twins, `llms-full.txt`, feed output, sitemap membership, and agent knowledge are projections of the source content.

The owner supplied explicit decisions for the audit items covered by this RFC:

- the response guarantee is 24 hours, not 48 hours;
- the German audience register is `Kund:innen`;
- the studio capacity number is now 3-4 sites per month, with the live counter handled by RFC-0322;
- the insurance analogy keeps the disclaimer and uses the modal phrase `kann`;
- the founder machine-facing descriptor becomes `seit 2022 in Backnang`;
- `/leistungen/uebersicht` is merged into `/leistungen` through a 301;
- unperformed accessibility tests are removed;
- ASCII hyphen typography is intentionally not normalized to long dashes.

This RFC turns those decisions into a bounded implementation contract for `warpgogol-com`. It is app-scoped because several decisions are studio-specific, but the implementation must use shared data and generator paths where the same class of defect can recur.

## Problem

The audited public surface currently allows contradictions and weak projections:

- `24 hours` and `48 hours` appear as competing response guarantees.
- German offer copy and PSEO translations address the same audience with two registers.
- The service hub has a duplicate `/leistungen/uebersicht` page with no independent role.
- Some public trust and accessibility text states facts that are either outdated, unverified, or too thin for machine-readable consumers.
- Generated artifacts can expose these defects more widely than the visible page, through llms, Markdown twins, agent knowledge, and feeds.

If this is fixed by editing generated `public/` files, the next build will reintroduce the defect. If this is fixed with app-specific grep commands, the platform will accumulate one-off validators instead of reusable surfaces.

## Decision

Implement the owner decisions in canonical source content and shared projectors.

1. `business.offer.guarantees.response` is the single source of truth for response time. Its German value is 24 hours on working days. Every German page, CTA, FAQ, llms projection, agent offer knowledge file, and Markdown twin that mentions response time reads this token or a derived localized label from it.

2. German customer-addressing copy uses `Kund:innen` for generic customer references. This applies to authored German offer pages, German surface records, German translator notes/glossaries, and generated related-link copy. Ukrainian text is explicitly out of scope for this RFC unless it consumes the cross-language numeric offer facts.

3. Canonical throughput changes from `12-15` sites per month to `3-4` sites per month wherever it is a structured business/offer number. The live wave and open-slot representation is specified by RFC-0322; this RFC only removes the old unsupported number from the offer surface.

4. The insurance analogy is rewritten in German so it remains compatible with the no-ROI guarantee: it may say `Nur kann die Seite Kunden bringen - statt erst im Schadensfall zu zahlen` and must also include the concept `arbeitet jeden Tag für Ihre Auffindbarkeit`. It must not state that customers, requests, or ROI are guaranteed.

5. Machine-facing and short public founder descriptors replace the former residence-status phrase with `seit 2022 in Backnang`. Longer human narrative may still discuss biography only when it is deliberately authored and paired with the continuity answer: ownership and exit are described by the Notausgang model, not by the founder's personal status.

6. `/leistungen/uebersicht` is retired. It receives a generated 301 redirect to `/leistungen/`, is removed from sitemap/llms/feed/Markdown twin membership, and no route generator may recreate it as a thin page.

7. Accessibility conformance text lists only tests that were actually performed and recorded in a source-backed evidence record. Manual screen-reader or keyboard tests that were not performed are removed from German public copy and public twins.

8. ASCII hyphen usage in German prose is an editorial choice. Validators must not add a generic rule replacing `-` with em dashes or en dashes.

## Architectural fit

This RFC uses existing platform boundaries:

- business facts and guarantees live in `src/content/business/{lang}/offer.md` and claim sidecars, not in generated public artifacts;
- page body copy stays in `src/content/pages/de/**` and `src/content/prose/de/**`;
- public Markdown twins and llms output are regenerated by existing projectors;
- route retirement uses RFC-0318 redirect intent and generated public infrastructure;
- generic public hygiene gaps are covered by RFC-0316, not by warpgogol-specific command names.

It amends RFC-0243 because the service hub is still the authored canonical `/leistungen/` page, and the duplicate overview page must not survive as a second service hub.

## Design

### Canonical offer guarantee

The offer business record must expose a structured response guarantee, not only display prose:

```yaml
guarantees:
  response:
    hours: 24
    businessDaysOnly: true
    label:
      de: "Antwort innerhalb von 24 Stunden an Werktagen"
      uk: "..."
```

Implementation may reuse the existing offer schema if these fields already exist. The important contract is that renderers and projectors do not duplicate the number.

Any previous literal `48 Stunden` in German source content is replaced by a reference to this guarantee or by prose derived from it. The contact page should name the same guarantee when it talks about message handling.

### German-only editorial boundary

Textual changes under this RFC apply to the German site surface:

- `src/content/pages/de/**`;
- `src/content/prose/de/**`;
- German business labels under `src/content/business/de/**`;
- German surface and translator support records that generate German text.

Do not opportunistically rewrite Ukrainian pages. Cross-language numeric facts such as `3-4` sites per month are canonical business values and therefore may flow to all languages through the business layer or derived translation lifecycle.

### Service overview retirement

The implementation must introduce redirect intent equivalent to:

```ts
{
  from: "/leistungen/uebersicht/";
  to: "/leistungen/";
  status: 301;
  reason: "manual";
  source: "authored-intent";
}
```

The source of that intent can be an existing redirect registry, route-migration list, or the generated infrastructure model from RFC-0318. It must not be hand-written directly into generated `public/_redirects`.

Validators must confirm:

- the old URL is not a live page;
- the target exists and is canonical;
- no redirect chain is introduced;
- sitemap, llms, feed, and Markdown twins do not include the old URL.

### Founder and accessibility evidence

Founder descriptors in business/team/person records, JSON-LD, agent knowledge, and public twins must use `seit 2022 in Backnang` for the short machine-facing phrase.

Accessibility text must be backed by evidence:

```yaml
accessibility:
  statementDate: "2026-06-01"
  performedTests:
    - kind: automated
      tool: "..."
      performedAt: "2026-06-01"
  omittedManualTestsReason: "not-yet-performed"
```

The exact schema can be implemented in the existing legal/compliance surface if one exists. The hard rule is that public conformance text may not claim manual tests without a performed evidence record.

### No app-specific text check commands

This RFC deliberately does not create commands such as `warpgogol.response-copy.validate`.

Reusable checks may be strengthened only when the rule is generic:

- missing headings with no following content;
- sitemap pages with too-short descriptions;
- broken redirects;
- generated public text with unresolved references or malformed Markdown.

Site-specific content facts are verified by reading the source diff and behavior snapshot, not by permanent one-client regex commands.

## Rollout

1. Update the German canonical offer/business data: response guarantee 24h, throughput 3-4 sites per month, audience register labels, and founder short descriptor.
2. Update German authored pages/prose that currently duplicate those facts.
3. Add the `/leistungen/uebersicht/` redirect intent and remove the page from route membership.
4. Remove unperformed manual accessibility tests from public conformance copy.
5. Regenerate public artifacts: routes, llms, agent knowledge, Markdown twins, sitemap, redirects, and behavior snapshot.
6. Inspect behavior snapshot changes before committing. Expected intentional changed routes: `/`, `/leistungen/`, `/leistungen/digitales-fundament/`, `/preis/`, `/notausgang/`, `/kontakt/`, `/gruender/`, `/barrierefreiheit/`, and retired `/leistungen/uebersicht/`.

## Alternatives considered

- **Patch generated public Markdown files.** Rejected. Generated files are projections and will be overwritten.
- **Add one-off grep validators for each phrase.** Rejected. The platform should not scale by adding permanent microchecks for one client.
- **Leave both audience registers.** Rejected by owner decision. `Kund:innen` is the German register for this site.
- **Normalize ASCII hyphens to long dashes.** Rejected by owner decision.

## Risks

- **German and Ukrainian drift temporarily.** Accepted. The owner explicitly asked to adjust Ukrainian prose in a separate step, while canonical numbers still flow through structured data.
- **Redirect target changes public behavior.** Mitigated by behavior snapshot review and `redirect.map.validate`.
- **Response guarantee appears in prose not wired to the token.** Mitigated by code review and generated artifact inspection; long-term prevention belongs in shared reference/interpolation surfaces, not a site-specific phrase linter.

## Acceptance criteria

- [x] German source content and generated public artifacts contain no competing `48 Stunden` (evidence: implemented historically) response guarantee for the offer/contact flow.
- [x] The canonical German response guarantee is 24 hours on working days and is sourced from the (evidence: implemented historically) offer/business record.
- [x] German generic customer-addressing copy uses `Kund:innen`. (evidence: implemented historically)
- [x] The old `12-15` monthly capacity claim is absent from source and generated public output; (evidence: implemented historically) the canonical throughput range is `3-4`.
- [x] The German insurance analogy uses modal possibility and does not contradict the no-request (evidence: implemented historically) guarantee.
- [x] Short founder descriptors use `seit 2022 in Backnang`. (evidence: implemented historically)
- [x] `/leistungen/uebersicht/` redirects 301 to `/leistungen/`, is absent from sitemap/llms/feed, (evidence: implemented historically) and has no Markdown twin.
- [x] Accessibility conformance text lists only performed tests backed by evidence records. (evidence: tests pass, vitest run exitCode=0)
- [x] Behavior snapshot diffs are reviewed and list the intentional route changes. (evidence: implemented historically)
- [x] `rfc.validate` passes. (evidence: implemented historically)

## Implementation notes for agents

- Agents may implement this RFC because its status is `accepted`.
- Edit German source content and shared projectors, not generated `public/` files.
- Do not rewrite Ukrainian prose beyond structured numeric fact propagation.
- Do not create permanent validators that only know warpgogol-com phrases.
- Do not introduce a dash typography lint while implementing public surface hygiene.
