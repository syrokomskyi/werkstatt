---
id: RFC-0233
title: "A holistic, extensible visual-control system for the site build"
status: implemented
# kind options: architecture | contract | command | policy | deprecation
kind: architecture
# scope options: app | workspace
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-06-23
updatedAt: 2026-06-23
implementedAt: 2026-06-23
closedAt:
supersedes: []
supersededBy:
amends:
  - RFC-0203
amendedBy: []
related:
  - RFC-0074
  - RFC-0093
  - RFC-0101
  - RFC-0105
  - RFC-0106
  - RFC-0111
  - RFC-0122
  - RFC-0150
  - RFC-0156
  - RFC-0201
  - RFC-0203
  - RFC-0205
commands:
  proposed:
    - visual.contract.validate
    - visual.report
    - visual.rules.list
  added:
    - visual.contract.validate
    - visual.report
    - visual.rules.list
  changed:
    - app.qa.validate
  removed: []
appsImpacted:
  - nicaragua-projekt
  - warpgogol-com
packagesImpacted:
  - "@gogol/site-kernel-checks"
  - "@gogol/share"
successSignals:
  - "A `fade`/`noEndFade` background that is no longer on the last rendered section of a page fails `visual.contract.validate` with a `file:line` location and a `fix:` line, and blocks `build.check`."
  - "`visual.rules.list` enumerates every registered visual rule with id, tier, severity-class, and default gating, so an AI agent can discover the contract without reading source."
  - "Adding a new deterministic visual invariant requires only a new rule module plus a registry entry — no changes to the pipeline wiring or the Diagnostic renderer."
  - "Existing visual-adjacent checks (token lints, section contracts, placeholder lint, effects contract) are discoverable under the `visual` domain tag without being rewritten or relocated."
  - "Heuristic/perceptual findings surface as `warning` by default and only gate the build when a site opts them in via `system.yaml`."
nonGoals:
  - "Do not rewrite or relocate the existing section-framework / token / effects validators; this RFC federates them under a shared domain, it does not fork them."
  - "Do not implement Tier 2 (rendered-DOM/visual-regression) or Tier 3 (LLM perceptual audit) in this RFC; they are designed here and deferred to follow-up phases."
  - "Do not introduce a new OS package; the system lives inside `@gogol/site-kernel-checks` on top of the RFC-0203 Diagnostic model."
  - "Do not invent new background/effect schema fields; positional intent is inferred from existing authored fields and page block order."
  - "Do not gate the build on non-deterministic findings by default."
---

# RFC-0233: A holistic, extensible visual-control system for the site build

## Context

This RFC federates the existing visual-adjacent checks in `@gogol/site-kernel-checks` into a coherent, extensible subsystem on top of the RFC-0203 Diagnostic model, and adds the missing tier — deterministic visual invariants evaluated in page context — that let the 2026-06-23 fade regression ship undetected.

## Problem

On 2026-06-23 the `nicaragua-projekt` home page shipped a visual defect (fixed in commit `32b6afe1`). The "Transparenz und Struktur" section carried a `background: { kind: fade, direction: vertical, noEndFade: true }` whose authored intent was "fade the page into its bottom edge." That intent was correct **only while the section was last on the page**. When a later edit appended a new FAQ section after it, the fade was now painted into the _middle_ of the page, with a full section below it — visually broken. The fix swapped the `fade` onto the new last section and reverted the old one to `transparent`.

Nothing in the build caught this. The schema in `packages/share/src/schemas/section-background.ts` validates a section **in isolation**: a `fade` with `noEndFade` is a perfectly valid background. The defect is **positional and contextual** — it depends on the section's place in the page's block order, which no current check evaluates.

This class of bug is not a one-off. As we onboard and iterate on client sites we will keep discovering emergent visual regressions: duplicated backgrounds on adjacent sections, alternating-tone rhythm broken by an insert, a hero effect stranded after a reorder, contrast lost when a token changes. The founder's ask: stop treating each as a bespoke patch and instead stand up a **coherent, extensible visual-control subsystem** wired into the build pipeline (this turborepo), that fails the build on hard violations and tells the AI agent how to fix them.

### What already exists (the candidate founders)

The ecosystem already contains a rich but **fragmented** set of visual-adjacent checks. None of them share a "visual" identity, registry, or severity policy; they are scattered across `command-tables/` and consumed piecemeal by `build.check`:

| Existing command | What it guards | Tier |
| --- | --- | --- |
| `section.shell.contract.validate` / `section.background.contract.validate` / `section.header.contract.validate` / `section.body.contract.validate` / `section.cta.contract.validate` / `section.image.contract.validate` (RFC-0111) | Section structure renders through the canonical shells | Static |
| `tokens.colors.section-shell.lint` / `tokens.section-shell.contract.validate` (RFC-0122/0124) | No raw hex/rgb/hsl; only design-system tokens | Static |
| `biome.tokens.validate` (RFC-0201) | App CSS token usage matches the active biome | Static |
| `css.important.lint` | Cascade hygiene (`!important` ban) | Static |
| `effects.contract.validate` (RFC-0156) | Heading/surface effect assignments are admissible | Static |
| `section.motion.contract.validate` / `site.background.contract.validate` (RFC-0105/0106) | Motion within biome envelope; one site-background per page | Static |
| `section.placeholder.lint` (RFC-0093) | No scaffold-stub sections ship | Static |
| `ui.silent-defaults.lint` (RFC-0205) | No silent UI text degradation | Static |
| `preview.images.validate` (RFC-0150) | OG/Twitter preview assets present | Static |
| `lighthouse` budget/config | JS budgets, perf-affecting config | Runtime |
| `audit.llm.run` / `app.qa.validate` (RFC-0074) | Family-specific QA, host for perceptual heuristics | LLM |

These are good founding members. What's missing is (a) a **shared domain identity** so they are discoverable as "the visual contract," (b) a **rule registry** an agent can enumerate, (c) a **severity-class policy** so we know what gates the build vs what only advises, and (d) a **home for the missing tier**: deterministic checks over _authored content in page context_ — exactly the gap that let today's bug through.

### The substrate we build on

RFC-0203 already promoted a canonical `Diagnostic` model for all static checks (severity `error|warning|info`, a rule-id registry, `file:line:col` + `fix:` agent-legible rendering, deterministic sort). The visual-control system is a **domain on top of RFC-0203**, not a parallel mechanism. This RFC therefore **amends RFC-0203** by adding a `domain` facet (`visual`) and a per-rule `tier`/`severityClass` to the rule registry.

## Decision

Introduce a **Visual Control System (VCS)** as a federated domain inside `@gogol/site-kernel-checks`, layered over the RFC-0203 Diagnostic model, with a three-tier architecture. **Design all three tiers now; implement Tier 1 now.** Tiers 2 and 3 are specified here and remain `accepted`-not-implemented phases.

## Architectural fit

The VCS is **not** a new mechanism. It is a domain layered on the existing RFC-0203 Diagnostic model and the RFC-0086 agent-legible renderer, registered as one more command-table consumed by the existing `build.check` pipeline. It reuses the page-blocks loader (RFC-0205 mirror), the section-framework contracts (RFC-0111), and the LLM audit host (RFC-0074). No new OS package is introduced — the system lives in `@gogol/site-kernel-checks`. This keeps the turborepo's maintenance surface flat: a new visual invariant is a registry row + a rule module, never new wiring.

## Design

### The three tiers

- **Tier 1 — Static authored-content invariants (this RFC, implemented).** Deterministic rules over `.md` pages and section manifests, evaluated **in page context** (block order, adjacency, position). Cheap, deterministic, gating. Today's fade bug lives here.
- **Tier 2 — Rendered-DOM / visual regression (designed, deferred).** Headless render of the built page; assertions over computed styles and screenshot diffs (overflow, clipped text, contrast, z-index overlap). Requires a browser in the build; heuristic, warn-by-default.
- **Tier 3 — LLM perceptual audit (designed, deferred).** Screenshot → multimodal "does this page look broken?" scoring, hosted on `audit.llm.run`. Non-deterministic, per-page cost, warn-by-default.

### The registry: `visual` domain over RFC-0203

Every visual rule is declared in a single `VISUAL_RULES` registry with:

```ts
interface VisualRule {
  id: string;            // e.g. "VIS-BG-01"
  title: string;
  tier: 1 | 2 | 3;
  severityClass: "deterministic" | "heuristic" | "perceptual";
  defaultGate: "error" | "warning";   // derived from severityClass policy
  fix: string;           // agent-legible remediation template
}
```

Existing candidate checks are **tagged** into the `visual` domain via a thin registry entry that references their already-emitted Diagnostics (by rule-id prefix); they are **not** rewritten or moved. New Tier 1 rules are implemented as small rule modules consumed by the new `visual.contract.validate` command.

### Severity-class gating policy (federated, by rule class)

The build-gating decision is a property of the **rule class**, not the command:

- **`deterministic`** (Tier 1, and the existing static lints) → `error`, **gates `build.check`**. This is the "не давать собирать сайт" guarantee for invariants we can prove.
- **`heuristic`** (Tier 2) and **`perceptual`** (Tier 3) → `warning` by default; reported to the agent, does **not** gate. A site escalates a specific rule to `error` via `system.yaml` (`visual: { gate: { "VIS-OVR-02": error } }`).

This keeps false-positive-prone tiers from blocking client builds while still surfacing remediation to agents, and lets mature heuristics be promoted per-site.

### New commands

- **`visual.contract.validate`** (scope: `app`) — runs the Tier-1 rule set over a site's authored pages in page context, emits RFC-0203 Diagnostics, exits non-zero on any `error`-class finding. Added to the `build.check` pipeline (after `biome.tokens.validate`).
- **`visual.report`** (scope: `app`, advisory, always exit 0) — full visual posture across all tiers/severities for an agent to read.
- **`visual.rules.list`** (scope: `workspace`, advisory) — enumerates the registry (id, tier, severityClass, defaultGate, fix) so an agent discovers the contract without reading source.

### Founding Tier-1 rules (initial set)

| Rule | Invariant | Severity |
| --- | --- | --- |
| `VIS-BG-01` | A `fade` background with `noEndFade` (fade-into-end-edge) must be on the **last** rendered block of the page. _(today's bug)_ | error |
| `VIS-BG-02` | A `fade` with `noStartFade` (fade-into-start-edge) must be on the **first** rendered block. | error |
| `VIS-BG-03` | Two adjacent blocks must not declare the **same** non-transparent background `kind` + params (suspected duplicate/leftover). | warning |
| `VIS-BG-04` | `site.background.contract.validate` reuse: at most one site-background per page (federated tag). | error |

The set is deliberately small and additive — the registry is the extension point; new invariants land as new rule modules + registry rows, with **no pipeline rewiring**.

## Rollout

1. **Phase 1 (this RFC):** registry + `visual.*` commands + the four founding Tier-1 rules; `visual.contract.validate` added to `build.check`; pilot on `nicaragua-projekt` (reproduce + catch the 2026-06-23 fade bug) then `warpgogol-com`. RFC-0203 registry gains the `domain`/`tier`/`severityClass` facets.
2. **Phase 2 (deferred, `accepted`):** Tier-2 rendered-DOM/regression behind a build-time headless browser; rules ship `warning`-class.
3. **Phase 3 (deferred, `accepted`):** Tier-3 sampled LLM perceptual audit on `audit.llm.run`, changed-pages-only, opt-in per Stripe tier.
4. **Federation follow-up:** re-tag the existing static visual lints into the `visual` domain for full discoverability.

## Alternatives considered

- **A new `@gogol/site-kernel-visual` package.** Cleaner isolation, but duplicates Diagnostic/renderer/loader infrastructure and adds a turborepo package to maintain. Rejected in favor of a domain inside `site-kernel-checks`.
- **Fold everything into `app.qa.validate` (RFC-0074).** Fewer new entities, but mixes deterministic gating with non-deterministic LLM audits and gives the visual contract no enumerable registry. Rejected; instead VCS _feeds_ a subset into `app.qa.validate`.
- **Hard-fail every visual finding like `css.important.lint`.** Satisfies "block the build," but Tier-2/3 heuristics would block client builds on false positives. Rejected in favor of severity-class gating.
- **A new schema field to mark "last section" intent.** Avoids inference, but adds authoring burden and a field that can itself go stale. Rejected; position is inferred from existing fields + block order.

## Risks

- **False positives gate client builds.** Mitigated by restricting `error`-class gating to deterministic Tier-1 rules; heuristic/perceptual stay `warning`.
- **Block-order ambiguity** (authored vs rendered, visibility/entitlement gating) could mis-locate "the last section" — see Open question 1.
- **Registry drift** if rules are added ad hoc outside the registry; mitigated by `visual.rules.list` + a `diagnostic.shape.lint`-style guard that every emitted visual rule-id is registered.
- **Tier-2/3 cost and CI time** if implemented naively; mitigated by deferral and sampling (changed-pages-only).

## Acceptance criteria

- [x] `visual.contract.validate` exists, runs in `build.check`, and fails on a `fade`/`noEndFade` background that is not on the page's last rendered block, emitting an RFC-0203 Diagnostic with `file:line` and a `fix:` line. _(Verified: VIS-BG-01 fired at `de/home.md:193` on the pre-fix `transparency` block.)_ (evidence: implemented historically)
- [x] Reverting commit `32b6afe1` on `nicaragua-projekt` makes the visual check red; re-applying it makes it green. _(Verified by restoring the pre-fix `de/home.md` — 1 error — then restoring the fix — 0 errors.)_ (evidence: original apps retired by RFC-0381, implemented historically)
- [x] `visual.rules.list` enumerates the registry (id, tier, severityClass, defaultGate, fix). _(4 visual rules listed.)_ (evidence: implemented historically)
- [x] Heuristic/perceptual rules default to `warning` and only gate when escalated (`resolveSeverity` + per-site `visual.gate` override, unit-tested). _(VIS-BG-03 = warning; override → error.)_ (evidence: implemented historically)
- [x] `rfc.validate` green; `visual.contract.validate` passes standalone on both apps; checks-package suite 76/76 + `diagnostic.shape.lint` + `grace.validate` green. _(NB: the full `build.check` pipeline currently aborts earlier on a **pre-existing, unrelated** `BIOME-TOKEN-01` from the RFC-0232 credits-gallery CSS — tracked separately, not introduced by this RFC.)_ (evidence: implemented historically)

## Implementation notes for agents

- New command-table `packages/os/site-kernel-checks/src/command-tables/12-visual-control.ts` registers the three commands; `build-check.ts` gains one step (`visual.contract.validate`).
- New `src/visual/` directory: `page-context.ts` (loads a page's ordered blocks + locates the `background:` source line), `rules.ts` (pure VIS-BG-01..03 evaluation + `resolveSeverity` gating), `index.ts` (the three command handlers). The visual rule **registry** lives in `diagnostics/rules.ts` (the RFC-0203 registry, now domain-faceted) and is read via `listVisualRules()` — single source of truth, no separate `VISUAL_RULES` table. _(As-built: authored block order is the Tier-1 source of truth; the RFC-0205 rendered-mirror refinement remains Open Q1.)_
- Positional intent (`VIS-BG-01/02`) is inferred from **existing** authored fields (`background.kind`, `noEndFade`, `noStartFade`) + block order — no schema change.
- Findings reuse the RFC-0203 renderer (`file:line:col` + `fix:` + deterministic sort); RFC-0203's rule registry gains the `domain="visual"`, `tier`, `severityClass` facets.
- `app.qa.validate` (RFC-0074) gains `visual.contract.validate` in its deterministic subset so author-phase QA reflects visual posture.

## Open questions

1. **Block-order source of truth.** Should `VIS-BG-01` reason over authored frontmatter block order, or over the post-codegen mirror (RFC-0205) to account for conditionally-hidden blocks (visibility expressions, entitlement gating)? A block can be authored-last but render-hidden, or hidden-then-revealed. Leaning toward the **rendered** order via the mirror, so visibility-driven reorders are caught too.

Answer: the **rendered** order via the mirror

2. **`VIS-BG-03` false positives.** Intentional repeated backgrounds (e.g. a run of `transparent` sections) are legitimate; the rule excludes `transparent` and stays `warning`. Is an explicit per-section `// visual-ok: VIS-BG-03` escape hatch warranted, or does warning-class suffice?

Answer: Does warning-class suffice.

3. **Tier-2 browser in the build.** Which engine — reuse the Lighthouse/headless path, or Playwright? This gates the Tier-2 phase and has CI-cost implications.

Answer: Playwright.

4. **Tier-3 cost envelope.** Per-page multimodal audit cost vs. Stripe tier; likely an opt-in, sampled (changed-pages-only) audit rather than every page every build.

Answer: changed-pages-only.

5. **Federation depth.** Do we re-tag _all_ existing static visual lints into the `visual` domain now (better discoverability) or only reference them from `visual.report` (less churn)? Proposing report-level federation first, full re-tag as a follow-up.

Answer: Re-tag _all_ existing static visual lints into the `visual` domain now.
