---
reviewId: REVIEW-CODE-2026-07-27-01
date: 2026-07-27
reviewer:
  skill: fo-review
  model: unknown
verdict: needs-revision
diffRange: a24d95a...HEAD
filesReviewed:
  - missions/warpgogol-com-m000015/workpiece/src/content/pages/uk/home.md
  - missions/warpgogol-com-m000015/workpiece/src/content/pages/uk/contact.md
  - missions/warpgogol-com-m000015/workpiece/src/content/faq/uk/home-texte-seiten.md
  - missions/warpgogol-com-m000015/workpiece/src/content/faq/uk/home-veroeffentlichung.md
  - missions/warpgogol-com-m000015/workpiece/src/content/faq/uk/home-99-verfuegbarkeit.md
  - missions/warpgogol-com-m000015/workpiece/src/content/faq/uk/home-keine-garantie.md
  - missions/warpgogol-com-m000015/workpiece/src/content/faq/uk/pricing-first-year.md
  - missions/warpgogol-com-m000015/workpiece/src/content/faq/uk/pricing-monthly-included.md
  - missions/warpgogol-com-m000015/workpiece/src/content/faq/uk/pricing-extra-change.md
  - missions/warpgogol-com-m000015/workpiece/src/content/faq/uk/df-baukasten.md
  - missions/warpgogol-com-m000015/workpiece/src/content/faq/uk/df-kuendigung.md
  - missions/warpgogol-com-m000015/workpiece/src/content/faq/uk/df-start.md
  - missions/warpgogol-com-m000015/workpiece/src/content/faq/uk/df-wer-dahinter.md
  - missions/warpgogol-com-m000015/workpiece/src/content/faq/uk/contact-domain-vorhanden.md
  - missions/warpgogol-com-m000015/workpiece/src/content/faq/uk/contact-bestehende-website.md
  - missions/warpgogol-com-m000015/workpiece/src/content/system.md
---

# Code Review: a24d95a...HEAD (mission warpgogol-com-m000015, file 1 enhance-site-pages)

### Verdict: Needs revision

The diff applies expert file 1 recommendations to the UK home page and contact page. Content is well-structured within archetype constraints. One DNA-24 violation found (missing Tethys in system.md planets list) — fixed during review. Several content-level findings remain.

### Mechanical floor

Pass — all changes are content-only (`.md` files). No TypeScript, Astro, or CSS files modified. No build:check or astro check applicable.

### Axis A — Structural correctness

- **Pass** — YAML frontmatter is valid on all modified files. No duplicate block IDs. Block types are valid archetypes.
- **Pass** — FAQ entries follow the `faqSchema` (`.loose()`): slug, question, answer, order, tags.
- **Pass** — PBP references use the canonical `business-profile.offerings/digital-foundation.presentation.price.*` path.

### Axis B — DNA alignment

- **DNA-24 (block-declarative pages)** — **FAIL (fixed)**: The home page now uses 5 `transparency` blocks (cosmicPlanet: Tethys), but `system.md` `pages[home].planets[]` did not list Tethys. Fixed by adding `Tethys pin: 1.3.0` to the home page planets list during this review.
- **DNA-4 (canonical content)** — **Pass**: All user-visible copy lives in `src/content/`. No hardcoded copy in routes.
- **DNA-6 (kebab-case)** — **Pass**: New FAQ filenames use kebab-case (`home-texte-seiten.md`, `home-veroeffentlichung.md`, `home-99-verfuegbarkeit.md`, `home-keine-garantie.md`).
- **DNA-11 (language mirroring)** — **N/A**: Only UK files modified. DE versions are not in scope for this mission (translation deferred).

### Axis C — Ecosystem fit

- **Pass** — All block types used (`hero-decision-card`, `transparency`, `video-section`, `price-card`, `comparison-cards`, `ownership-block`, `notausgang-block`, `trust-strip`, `controlled-responsibility-block`, `people`, `faq-list`, `final-cta`, `send-message`) are registered archetypes with valid cosmic names.
- **Pass** — FAQ `home` tag is a new tag value; the `faqSchema` tags array is open vocabulary.
- **Pass** — Contact page `phoneField` is supported by the send-message manifest (RFC-0514).

### Axis D — Forward-only compliance

- **Pass** — No compatibility shims or dual-paths. The `audience-cards` block was removed (not kept behind a flag). The FAQ tag was changed from `digitales-fundament` to `home` directly.

### Axis E — Agent-facing clarity

- **Pass** — New FAQ entries have clear, honest answers grounded in existing canonical content (SLA policy, pricing page, contact page).
- **Pass** — The example block is explicitly labeled as "Демонстрація, не клієнтський проєкт" — no fabricated client case.
- **Pass** — `reportLinkHref: "#example"` is a self-referencing anchor, not a broken link.

### Axis F — Pragmatism

- **Pass** — Reused existing FAQ entries by adding a `home` tag rather than duplicating content.
- **Pass** — Used `transparency` block (already registered) for first-year-cost and example blocks instead of creating new archetypes.
- **Pass** — Hero subheading used as eyebrow text — closest supported prop within the existing archetype.

### Axis G — Blind spots

- **Performance** — N/A: content-only changes, no new build-time commands.
- **Edge cases** — The `reportLinkHref: notausgang` in the composition block references a page ID. If the `notausgang` page is ever disabled, this link would break (DNA-13). Currently the notausgang page is active.
- **Security / privacy** — Contact page now requires email field. The `send-message` API endpoint already handles email/phone payload (RFC-0514). No new PII surface.

### Spec compliance

| Requirement from file 1 | Status | Evidence |
| --- | --- | --- |
| Hero: name product as Firmenwebsite | Done | `home.md:33` heading |
| Hero: eyebrow (region/audience) | Partial | `header.subheading` renders below heading, not above — archetype limitation |
| Hero: CTA "Anfrage starten" | Done | `home.md:44` primaryCta label "Почати запит" |
| Block 2: decision card with composition + price | Done | `home.md:57-66` decisionCard items |
| Block 3: наглядный пример | Done | `home.md:122-152` example block, explicitly labeled demo |
| Block 4: video | Done | `home.md:100-120` promo block (pre-existing) |
| Block 5: process 3 steps | Done | `home.md:154-178` process block |
| Block 6: price | Done | `home.md:180-205` price block |
| First-year cost calculation | Done | `home.md:207-232` first-year-cost transparency block |
| Base vs additional modules | Done | `home.md:199` item in first-year-cost block |
| Block 7: comparison | Done | `home.md:234-265` comparison block (pre-existing) |
| Block 8: auto-insurance comparison | Done | `home.md:267-292` auto-insurance block |
| Block 9: ownership | Done | `home.md:294-350` ownership block (pre-existing) |
| Block 10: Notausgang | Done | `home.md:352-385` notausgang block (pre-existing) |
| Composition block links to Notausgang | Done | `home.md:97-98` reportLinkLabel/reportLinkHref |
| Block 11: 99% availability | Done | `home.md:387-427` availability block (pre-existing) |
| Block 12: responsibility | Done | `home.md:429-498` responsibility block (pre-existing) |
| Block 13: founder | Done | `home.md:500-519` founder block (pre-existing) |
| Block 14: FAQ | Done | `home.md:521-527` faq block with tag: home |
| FAQ: 13 questions in buyer order | Partial | 13 entries tagged `home` (9 existing + 4 new), but `order` field is shared across tag groups — home page order won't perfectly match file 1's recommended sequence |
| Block 15: final CTA | Done | `home.md:529-542` cta block |
| Contact: separate email field | Done | `contact.md:105-109` emailField required |
| Contact: phone field (optional) | Done | `contact.md:110-114` phoneField |
| Contact: button "Anfrage starten" | Done | `contact.md:100` buttonLabel "Надіслати запит на перевірку" |
| Contact: post-submission clarification | Done | `contact.md:102` successMessage with no-contract clarification |
| Remove audience-cards block | Done | Block removed from home.md |

### Questions for the author

1. The FAQ `order` field is shared across all tag groups. The 13 `home`-tagged entries retain their original `order` values from their primary tag groups (pricing, digitales-fundament, contact). Should we introduce an `orderHome` field, or accept the current ordering as "good enough" for the home page?
2. The hero archetype has no eyebrow prop (text above the heading). `header.subheading` renders below the heading. Is this acceptable, or should we extend the archetype via RFC to support a true eyebrow?
3. The example block (Block 3) uses a self-referencing anchor `#example` as its `reportLinkHref`. Should this instead link to a real demo page or the digitales-fundament product page?
