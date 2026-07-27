# DECISION LOG — reference architecture rationale

> Key decisions extracted from the current project and rewritten as architectural rationale. Use this file to understand why the DNA is shaped this way and what tradeoffs it intentionally makes.

---

## DEC-01: Prefer static-first delivery when content is known at build time

**Decision:** The reference project uses static output in `astro.config.mjs`.

**Rationale:**

- most visitor-facing meaning is known ahead of time
- static delivery simplifies hosting and improves performance predictability
- middleware can still handle edge concerns such as language entry behavior

**Alternative considered:** hybrid or server rendering by default.

**Why rejected here:** it adds operational complexity without changing the core content architecture.

**Portability note:** another project may adopt SSR, but only as a coordinated system choice, not a page-local shortcut.

---

## DEC-02: Use one canonical content format inside `src/content/`

**Decision:** Canonical content in this architecture is stored as Markdown with YAML frontmatter.

**Rationale:**

- human-readable diffs
- native Astro content collection support
- one mental model for both short structured content and long-form content

**Alternative considered:** JSON or mixed data formats as first-class canonical content.

**Why rejected here:** mixed formats encourage parallel content systems and weaker validation boundaries.

---

## DEC-03: Resolve schemas centrally through dispatcher registries

**Decision:** Page and component schemas are resolved through dispatcher tables rather than one collection per component/page type.

**Rationale:**

- keeps schema registration explicit and centralized
- scales better than multiplying collections for every component shape
- preserves strict validation while keeping the content model manageable

**Alternative considered:** one Astro collection per component or page subtype.

**Why rejected here:** it increases registration overhead and fragments the architecture as the site grows.

---

## DEC-04: Reuse sections with override deltas instead of forking component variants

**Decision:** Reusable sections may accept `pageOverride?: Partial<T>` or equivalent normalized override data.

**Rationale:**

- most reused sections share structure and most copy
- only a minority of fields usually change per page
- override deltas preserve reuse without content duplication

**Alternative considered:** separate component variants or separate full content entries for every page/component combination.

**Why rejected here:** it creates combinatorial growth in maintenance cost.

---

## DEC-05: Keep language policy centralized

**Decision:** Language prefixes, default language behavior, and route generation strategy are coordinated through shared config and middleware.

**Rationale:**

- language handling touches routing, build generation, canonical URLs, navigation, and semantic outputs
- centralization prevents page-by-page drift

**Alternative considered:** letting individual routes decide language generation and redirect behavior.

**Why rejected here:** language policy is infrastructural, not local.

**Current reference implementation note:** only `defaultLanguageCode` is emitted at build time and middleware handles entry behavior.

---

## DEC-06: Enforce token-based styling with a stable namespace

**Decision:** Design values must use `--ds-*` custom properties.

**Rationale:**

- keeps visual decisions auditable
- prevents style drift from local one-off values
- allows global brand or theme changes without hunting through components

**Alternative considered:** unrestricted raw CSS values or utility-first sprawl as the primary design governance model.

**Why rejected here:** those approaches weaken long-term consistency in an agent-assisted codebase.

---

## DEC-07: Keep styles external to `.astro` files

**Decision:** Shared page and component styles live in `src/styles/`, not inline in route/component files.

**Rationale:**

- makes style ownership visible
- improves reuse and lintability
- keeps markup focused on structure rather than policy-heavy styling

**Alternative considered:** inline `<style>` blocks and ad hoc inline style attributes.

**Why rejected here:** they hide styling governance and weaken portability.

---

## DEC-08: Isolate client interactivity behind explicit hydration boundaries

**Decision:** Interactive UI is allowed only inside dedicated islands, and heavy browser dependencies are isolated away from the static shell.

**Rationale:**

- preserves performance budgets
- keeps server/static composition understandable
- prevents decorative or advanced effects from redefining the whole app architecture

**Alternative considered:** importing interactive stacks directly into shell-level `.astro` files.

**Why rejected here:** it leaks client complexity into parts of the system that should remain static-first.

---

## DEC-09: Centralize visibility with feature registries

**Decision:** Page and section visibility live in a central feature registry and are consumed by routes, navigation, and semantic outputs.

**Rationale:**

- one visibility decision must affect all discovery surfaces consistently
- centralization prevents stale links and contradictory states

**Alternative considered:** local booleans and route/component-specific feature checks.

**Why rejected here:** local checks create invisible architecture drift.

**Current reference implementation note:** the project supports preview overrides via `?preview=N` for controlled visibility testing.

---

## DEC-10: Make navigation content-driven but config-resolved

**Decision:** Labels belong to canonical content, while concrete href resolution and visibility rules belong to shared configuration/helpers.

**Rationale:**

- separates meaning from environment-dependent path logic
- keeps routes and components thin
- makes feature-aware navigation coherent across the site

**Alternative considered:** storing raw href strings and labels as ad hoc route/component constants.

**Why rejected here:** it duplicates policy and breaks portability.

---

## DEC-11: Build machine-readable outputs through a semantic projection layer

**Decision:** JSON-LD, `llms.txt`, `llms-full.txt`, and related outputs are projections of normalized canonical meaning.

**Rationale:**

- preserves one source of truth
- keeps cross-page entities stable
- makes AI/search/discovery outputs consistent with what visitors see
- creates a framework-light module that can be transplanted into another project more easily than UI-tied schema fragments

**Alternative considered:**

- generating schema inside UI components
- maintaining AI-only pages or hidden AI-only content trees

**Why rejected here:** both options create semantic drift and duplicated maintenance.

---

## DEC-12: Validate architecture with scripts, not memory alone

**Decision:** Important architectural assumptions should be enforced by check scripts under `scripts/check/`.

**Rationale:**

- humans and agents both forget
- architectural drift usually appears as many small local compromises
- automated checks keep the DNA enforceable as the project scales

**Alternative considered:** relying only on conventions written in documentation.

**Why rejected here:** conventions without verification degrade over time.

---

## DEC-13: Adopt CMS-friendly unified content surface (RFC-0047)

**Decision:** Replace legacy `system.yaml` + scattered content folders with a single `system.md` manifest and five semantic content domains under `src/content/`: `pages/`, `prose/`, `business/`, `navigation/`, `site/`. Each domain supports `{lang}/` subdirectories and `assets/` for owned media.

**Rationale:**

- One mental model for content authors
- Clean separation between engineering surface and client-editable surface
- Enables future headless-CMS integration without restructuring

**Alternative considered:** Keeping the legacy `system.yaml` + `components/`/`sections/`/`features/` folder structure.

**Why rejected here:** It fragmented content across too many directories and made the client-editable surface boundary ambiguous.

---

## DEC-14: Biome as category DNA, not brand identity (RFC-0071)

**Decision:** A biome is a reusable visual-DNA profile (warmth, contrast, density, typographySharpness, etc.) shared by all sites in the same category. Brand-specific values stay in per-app `@layer app` overrides. Biome YAML lives in `packages/ontology/biomes/` and is deterministically derived from axes.

**Rationale:**

- Sibling sites get visual coherence at zero cost
- Prevents brand-specific values from leaking into shared infrastructure
- Six-layer cascade order (`tokens, biome, app, base, components, pages`) enforces precedence

**Alternative considered:** Per-app brand tokens in the biome layer, or no biome abstraction at all.

**Why rejected here:** Would cause visual drift across sibling sites and make token governance impossible.

---

## DEC-15: Generated-file governance with unified marker (RFC-0081)

**Decision:** All generators write a single unified marker (`GENERATED. Do not change this line...`) as the first line of generated files. Files with the marker are overwritten on every generator run; files without it are skipped (considered customized). AI agents must never edit marked files.

**Rationale:**

- Clear ownership boundary between generated and authored code
- Prevents agents from editing generated output instead of the owning generator
- Single marker replaces multiple legacy variants (`GENERATED BY`, `AUTO-GENERATED`, etc.)

**Alternative considered:** No marker convention, or per-generator custom markers.

**Why rejected here:** Without a unified marker, agents cannot reliably distinguish generated from authored files.

---

## DEC-16: Section shell architecture (RFC-0108)

**Decision:** Every shared section is a thin dispatcher composed of canonical primitives: `<SectionShell>` → `<SectionHeader>`? → `<SectionBody.{kind}>` → `<SectionCta(Group)>`?. Composite archetypes (hero, price-card, faq-list, markdown) wrap bespoke layout inside `<SectionShell>`.

**Rationale:**

- Consistent visual contract across all sections
- Shared primitives reduce duplication and enforce token usage
- `propsSchemaCompose` in manifests eliminates duplicate JSON Schema

**Alternative considered:** Each section owning its full layout independently.

**Why rejected here:** Would lead to visual inconsistency and duplicated layout logic across 20+ sections.

---

## DEC-17: EU-resident lead delivery via QStash + Redis (RFC-0181)

**Decision:** Lead/event delivery uses Upstash QStash (EU, Frankfurt) as the in-flight queue and Upstash Redis (EU) for idempotency. Cloudflare Queues/KV are excluded from the EU delivery path because Regional Services cannot pin them to the EU.

**Rationale:**

- Physical EU residency (Frankfurt, eu-central-1) for all lead PII in transit
- DPA + SCC + EU-U.S. DPF for legal coverage
- Honest about structural sovereignty limitations (Upstash is US-incorporated)

**Alternative considered:** Cloudflare Queues + KV under Regional Services.

**Why rejected here:** Regional Services excludes non-HTTP triggers (Queues, Cron), and KV has no jurisdiction restriction — fails the firm EU-only requirement.

---

## DEC-18: Visitor sales funnel as platform-owned state machine (RFC-0188)

**Decision:** The visitor sales funnel (UChat ↔ Lagebild ↔ Pipedrive ↔ Stripe) is governed by a platform-owned state machine in `@gogol/share/integration`. UChat renders and requests transitions but never owns the graph, prices, consent of record, or CRM writes.

**Rationale:**

- Single source of truth for stage/event/transition graph
- Vendor consoles (UChat, Pipedrive, Stripe) are configuration surfaces, not logic owners
- Make.com is fully excluded — all automation flows through the platform

**Alternative considered:** UChat-owned flow logic with webhooks to external automation (Make.com).

**Why rejected here:** Would scatter business logic across vendor consoles with no single source of truth.

---

## DEC-19: Block-declarative pages with frontmatter-only .md (RFC-0026)

**Decision:** Every page is a frontmatter-only `.md` file in `pages/{lang}/` with `kind: page`, `cosmicStar`, `blocks[]`. No markdown body is permitted — prose lives in `prose/{lang}/` and is referenced via `blocks[].props.contentRef`. A single `buildPage()` pipeline resolves blocks to section components.

**Rationale:**

- Clean separation of page composition from prose content
- One pipeline for all page resolution — no route hand-assembles blocks
- Enables content reuse across pages

**Alternative considered:** Markdown bodies in page files with inline content.

**Why rejected here:** Would blur the line between page structure and prose, making content reuse impossible.

---

## DEC-20: Content Source Provider port for headless-CMS readiness (RFC-0141)

**Decision:** All content and asset access goes through the `ContentSourceProvider` interface in `@gogol/content-source`. The filesystem is one replaceable adapter. `import.meta.glob` for content assets is restricted to a single file (`packages/ui/src/content-assets.ts`).

**Rationale:**

- Swappable content backend without touching sections, components, or routes
- Opaque `AssetRef.token` prevents consumers from assuming local files
- Phase 0 ships fs adapter only; CMS adapters are future RFCs

**Alternative considered:** Direct `astro:content` imports and per-component `import.meta.glob` calls.

**Why rejected here:** Would hardcode filesystem assumptions across the entire UI surface, making CMS migration prohibitively expensive.
