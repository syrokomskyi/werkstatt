---
id: RFC-0173
title: "Close three ecosystem validator and build defects"
kind: command
scope: workspace
status: implemented
owners:
  - architecture
reviewers: []
createdAt: 2026-06-07
updatedAt: 2026-06-07
implementedAt: 2026-06-07
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy:
  - RFC-0353
related:
  - RFC-0073
  - RFC-0135
  - RFC-0154
  - RFC-0155
commands:
  proposed: []
  added: []
  changed:
    - compass.validate
    - content.coverage.validate
    - apps-check.run
  removed: []
appsImpacted:
  - apps/webgogol-com
packagesImpacted:
  - packages/share
  - packages/os/site-kernel-checks
successSignals:
  - "`grace.validate`, `content.coverage.validate`, and a clean `pnpm build` of webgogol-com all exit 0 on an untouched checkout — the three standing red checks go green."
  - "`git status` is clean after `pnpm build` (no tracked business content mutated)."
nonGoals:
  - "Do not weaken any validator's rules to make them pass — each fix addresses the underlying drift, not the gate."
  - "Do not re-architect onboarding atom coverage or the GRACE marker system — these are targeted defect fixes within the existing contracts."
---

# RFC-0173: Close three ecosystem validator and build defects

## Context

A 2026-06-07 review of the implemented initiative A–D RFCs surfaced three standing red checks that are unrelated to those features but block a clean `apps-check.run` / build on an untouched tree. They are recorded here so they are fixed under one accepted change rather than left as undocumented noise.

### Defect 1 — `grace.validate` fails: missing GRACE_BLOCK anchors

`grace.validate` reports 1 non-compliant file of 548:

```
packages/share/src/middleware/language-redirect.ts: missing GRACE_BLOCK anchors
```

The middleware file is treated as authored scaffolding subject to GRACE marker requirements (RFC-0155) but carries no `<GRACE_BLOCK id="…">` … `</GRACE_BLOCK>` anchors. Either the file legitimately owns regenerable regions that must be wrapped in anchors, or it is a hand-authored exception that belongs in the grace exclusion set. The fix must pick one and make it explicit — not relax the check.

### Defect 2 — `content.coverage.validate` fails: webgogol-com `atom-0005` unplaced

```
atom-0005 — unplaced atom with no coverage.md rationale
```

`atom-0005` text is `"Offener Preis: 70 €/Monat oder 700 €/Jahr plus 200 € Einrichtung"` (`onboarding/.output/04-author/atoms.yaml`). The validator requires the normalized atom string (NFKC + whitespace-collapse + lowercase, see `normalizeComparableText`) to match a whole frontmatter value or body of an authored page/prose/business file verbatim. The price copy has since been refactored:

- the canonical price now lives as structured fields in `apps/webgogol-com/src/content/business/de/offer.md` (`monthly: "70 € / Monat"`, `yearly: "700 € / Jahr"`, `setup: "200 €"`);
- the nearest surviving sentence (`pages/de/contact.md`) reads `"Offener Preis: 70 € / Monat oder …"` — spaces around the `/` differ from the atom's `70 €/Monat`, so normalization (which collapses runs of whitespace but does not insert/remove single spaces around `/`) no longer matches;
- `pages/de/home.md` rewords it with `+` instead of `plus`.

The atom is therefore semantically placed but no longer verbatim, and `coverage.md` still asserts "all 15 atoms appear verbatim" — a stale claim. The correct fix is to declare `atom-0005` in `coverage.md` with a closed-enum rationale (the price was consolidated into the single-source structured `business/offer.md` fields, so the verbatim trust-strip line was intentionally retired/reworded). Realigning `contact.md` back to the atom's exact punctuation is the inferior alternative — it would re-duplicate the price string the refactor deliberately centralized.

### Defect 3 — `pnpm build` mutates tracked business NEED_THIS markers (RFC-0154 violation)

A build-prepare generator rewrites the `NEED_THIS_*` placeholder markers inside tracked `apps/*/src/content/business/**` during `pnpm build`, leaving `git status` dirty after a build. This violates RFC-0154 ("build must not mutate tracked business content") and breaks build idempotency. The fix is to locate the offending generator, make it leave tracked NEED_THIS markers untouched (read-only / idempotent for already-authored business content), and cover the business directory in a build-idempotency smoke so the regression cannot return.

## Decision

The three defects are fixed under one change, each at its root cause, with no validator rule weakened:

1. **Grace anchors** — add the required `<GRACE_BLOCK>` anchors to `packages/share/src/middleware/language-redirect.ts` around its regenerable region, or register it as an explicit grace exception if it is fully hand-authored. `grace.validate` then passes with the file properly classified.
2. **Atom coverage** — declare `atom-0005` in `onboarding/.output/04-author/coverage.md` as placed-via-refactor / retired-verbatim with a closed-enum reason, and correct the now-false "all 15 atoms appear verbatim" statement. `content.coverage.validate --app webgogol-com` then passes without touching authored copy.
3. **Build mutation** — make the build-prepare generator that touches `business/**` NEED_THIS markers idempotent (do not rewrite already-tracked markers), and extend the build-idempotency smoke to assert a clean `git status` for `apps/*/src/content/business/**` after build.

## Acceptance criteria

- [x] `grace.validate` exits 0 with `language-redirect.ts` anchored (added `<GRACE_BLOCK id="language-redirect-factory">`; no rule relaxation). Also fixed an app-scoped instance of the same class: `nicaragua-projekt/src/pages/favicon.ico.ts` (now carries GRACE markers; subsequently promoted to a generated boilerplate route) (evidence: original apps retired by RFC-0381, implemented historically)
- [x] `content.coverage.validate --app webgogol-com` exits 0; `atom-0005` declared in `coverage.md` with the closed-enum reason `redundant` and the stale "all 15 verbatim" line corrected; no authored page copy changed (evidence: implemented historically)
- [x] Build no longer mutates tracked content (RFC-0154 honored): the real culprit was a wall-clock "Zuletzt generiert" timestamp in the `open-source.generate` output (prose/<lang>/open-source.md), not business NEED_THIS markers; removed it so the generator is a pure function of source. `content.idempotency.validate` passes cold-cache for both apps (evidence: implemented historically)
- [x] Build-idempotency smoke covers tracked `business/**`: the existing `content.idempotency.validate` (RFC-0154) asserts every tracked file under `src/content/**` (which includes `business/**`) is byte-identical after build.prepare — verified cold-cache for both apps (evidence: implemented historically)
- [x] `apps-check.run` is green for both reference apps (97/97 steps each) (evidence: implemented historically)
- [x] `rfc.validate` passes on this file (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement only when this RFC is `accepted`.
- Fix each defect at its source; NEVER weaken `grace.validate`, `content.coverage.validate`, or the RFC-0154 build-idempotency guarantee to make a check pass.
- Defect 2 is a coverage-ledger declaration change, not a content rewrite — do not edit `pages/de/contact.md` / `home.md` copy to chase the verbatim match; the price was deliberately consolidated into `business/de/offer.md`.
- Defect 3: confirm the mutation by `pnpm build` then `git status` before/after; locate the generator in `APPS_BUILD_PREPARE_PIPELINE`, and prefer making it skip already-authored NEED_THIS markers over post-build reverting.
- Keep the three fixes in separate commits so each defect's resolution is independently bisectable.

## Backfilled sections (RFC-0366)

The following headings were added when the RFC mini-template was retired. The original command/policy RFC used the mini form, which recorded only Context, Decision, Acceptance criteria, and Implementation notes. These sections satisfy the unified full-template contract without altering the original decision.

## Problem

See the Context section above for the problem this RFC addresses. (This section is required by the unified RFC template; the original mini-RFC recorded the problem within Context.)

## Architectural fit

This RFC aligns with the DNA invariants and related RFCs listed in the frontmatter. (Backfilled during mini-template retirement; original mini-RFC did not include a separate Architectural fit section.)

## Design

See the Decision and Acceptance criteria sections above for the design. (Backfilled during mini-template retirement; original mini-RFC recorded design within Decision and Acceptance criteria.)

## Rollout

Implemented as described in the Acceptance criteria and Implementation notes. (Backfilled during mini-template retirement.)

## Alternatives considered

No alternatives were recorded in the original mini-RFC form. (Backfilled during mini-template retirement.)

## Risks

No additional risks were recorded in the original mini-RFC form. (Backfilled during mini-template retirement.)
