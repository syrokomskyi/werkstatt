---
reviewId: REVIEW-CODE-2026-07-27-01
date: 2026-07-27
reviewer:
  skill: fo-review
  model: claude-sonnet-4-20250514
verdict: needs-revision
diffRange: "15c1938...HEAD (werkstatt) + a24d95a...HEAD (workpiece)"
filesReviewed:
  - packages/ui/src/sections/send-message/send-message-section.manifest.yaml
  - packages/ui/src/sections/send-message/send-message-section.astro
  - packages/ui/src/sections/send-message/send-message-section.types.generated.ts
  - packages/ui/src/sections/send-message/send-message-section.client.ts
  - packages/ui/src/sections/send-message/send-message-section.api.ts
  - missions/warpgogol-com-m000015/workpiece/src/content/pages/uk/home.md
  - missions/warpgogol-com-m000015/workpiece/src/content/pages/uk/pricing.md
  - missions/warpgogol-com-m000015/workpiece/src/content/pages/uk/digitales-fundament.md
  - missions/warpgogol-com-m000015/workpiece/src/content/pages/uk/notausgang.md
  - missions/warpgogol-com-m000015/workpiece/src/content/pages/uk/contact.md
  - missions/warpgogol-com-m000015/workpiece/src/content/pages/uk/agb.md
  - missions/warpgogol-com-m000015/workpiece/src/content/pages/uk/datenschutz.md
  - missions/warpgogol-com-m000015/workpiece/src/content/pages/uk/impressum.md
  - missions/warpgogol-com-m000015/workpiece/src/content/pages/uk/barrierefreiheit.md
  - missions/warpgogol-com-m000015/workpiece/src/content/pages/uk/open-source.md
  - missions/warpgogol-com-m000015/workpiece/src/content/pages/uk/services.md
  - missions/warpgogol-com-m000015/workpiece/src/content/pages/uk/team.md
  - missions/warpgogol-com-m000015/workpiece/src/content/prose/uk/agb.md
  - missions/warpgogol-com-m000015/workpiece/src/content/people/uk/andrii-syrokomskyi.md
  - missions/warpgogol-com-m000015/workpiece/src/content/faq/uk/*.md
  - missions/warpgogol-com-m000015/workpiece/src/content/system.md
---

# Code Review: enhance-site-pages session (files 1–16.1)

### Verdict: Needs revision

The session produced extensive content improvements across 119 workpiece files and 3 package files. The content changes are structurally sound and follow RFC-0567 patterns. However, the `referrerField` addition to `send-message` is a **half-implemented feature** — the manifest, Astro template, and types are updated, but the client-side script and server-side API endpoint do not handle the new field. The referrer value is rendered in the DOM but never collected, validated, or transmitted.

## Mechanical floor

**Pass** — `pnpm --filter @warpgogol/ui build:check` (tsc --noEmit) exits 0.

**Note:** `props.types.generate` regenerated 42 type files with an updated header format. These dirty files are in the werkstatt working tree and need to be committed.

## Axis A — Structural correctness

**FAIL — referrerField client-side handling missing.**

The `referrerField` is added to the manifest (`send-message-section.manifest.yaml:164-180`), the Astro template (`send-message-section.astro:109-112, 148-163`), and the generated types (`send-message-section.types.generated.ts:122`). However:

1. **`send-message-section.client.ts:17-22`** — `SendMessagePayload` interface does not include `referrer?: string`. The payload type cannot carry the referrer value.

2. **`send-message-section.client.ts:62`** — `bindForm()` queries `[data-send-message-email]` and `[data-send-message-phone]` but does NOT query `[data-send-message-referrer]`. The referrer input element is never accessed.

3. **`send-message-section.client.ts:85-88`** — reads `emailFieldEnabled`, `emailFieldRequired`, `phoneFieldEnabled`, `phoneFieldRequired` from the form dataset but does NOT read `referrerFieldEnabled` or `referrerFieldRequired`.

4. **`send-message-section.client.ts:115-119`** — validates `phoneField` required but has no equivalent validation for `referrerField`.

5. **`send-message-section.client.ts:126-128`** — adds `email` and `phone` to the payload but does NOT add `referrer`.

6. **`send-message-section.api.ts:32`** — `SendMessageBody` type does not include `referrer?: unknown`.

7. **`send-message-section.api.ts:53`** — normalizes `email` and `phone` but not `referrer`.

8. **`send-message-section.api.ts:61-69`** — `IntegrationEvent` includes `contact: { email, phone }` but not `referrer`. The referrer value is never passed to the integration pipeline.

**Impact:** The referrer input appears in the form, but the value is silently discarded. The `required` validation is not enforced. The server never receives the referrer. The feature is non-functional.

## Axis B — DNA alignment

**No issues** for the package change (DNA-5/17 mirror quintet maintained — manifest, .astro, .css, .types all present).

**DNA-24 (block declarative pages):** The workpiece content changes add `transparency` blocks to multiple pages. The `system.md` planets list was updated for `home` (Tethys added) and `digitalesFundament` (Tethys added). Other pages (pricing, notausgang, contact, services) also use `transparency` blocks — their planets lists were not checked for Tethys registration during this session. A `page.block.validate` run is recommended to confirm all block types are registered.

## Axis C — Ecosystem fit

**No issues.** The `referrerField` follows the exact same pattern as `phoneField` in the manifest, which is the correct approach for extending a shared section archetype. The package boundary is respected — the change is in `packages/ui` and consumed by the workpiece.

## Axis D — Forward-only compliance

**No issues.** The `referrerField` is an optional prop (`referrerField?: { ... }`). Existing content without `referrerField` continues to work — the `.astro` template guards with `props.referrerField?.enabled`. No backward compatibility shim is needed.

## Axis E — Agent-facing clarity

**FAIL — generated file manually edited instead of regenerated.**

The `send-message-section.types.generated.ts` was manually edited to add `referrerField` (line 118-123). The file header says `// GENERATED. Do not change this line unless the file contains project specific changes.` — the manual edit violated this contract. Subsequently, `props.types.generate` was run and regenerated the file with a different header format and sourceHash, superseding the manual edit.

**42 generated type files are now dirty** in the werkstatt working tree because the generator updated the header format for all files, not just `send-message`. These need to be committed.

**Recommendation:** Always run `props.types.generate` after changing a manifest's `propsSchema` — never hand-edit `.types.generated.ts` files.

## Axis F — Pragmatism

**MINOR — audience-cards → transparency conversions may reduce visual structure.**

The session converted `audience-cards` blocks to `transparency` blocks on the services page (`services.md:64-78, 178-192`). The `audience-cards` archetype still exists in `packages/ontology/archetypes/sections/audience-cards.yaml` and is a valid block type. The conversion flattened structured card data (title, description, number) into single text strings in a list.

The expert file (file 13) described the content structure but did not explicitly recommend changing the block type. The conversion was based on a pattern from the home page where `audience-cards` was removed for different reasons.

**Impact:** The visual presentation changes from cards to a flat list. The information is preserved but the visual hierarchy is reduced. This may or may not be the intended design outcome.

## Axis G — Blind spots

**No issues** for security/privacy — the referrerField is a simple text input with no PII concerns beyond what the form already collects.

**Edge case:** If `referrerField.required` is set to `true` in content but the client script doesn't validate it, the form will submit without the referrer value. The server also doesn't check for it. This is a silent failure.

## Spec compliance

Expert files 1–16.1 from `/home/syrokomskyi/projects/obsidian/WGogolDocObsidian/Tech/Site/!Research/2026-07-20 Страницы сайта - Улучшения/output/enhance-site-pages`.

| Requirement | Status | Evidence |
|---|---|---|
| RFC-0567 eyebrow prop on all hero blocks | Done | All page hero blocks updated with `header.eyebrow` |
| RFC-0567 ctaNote on hero-decision-card | Done | All hero-decision-card blocks updated with `ctaNote` |
| RFC-0567 orderTags on FAQ entries | Done | All FAQ entries tagged with per-page orderTags |
| Expert file 1 (home): commercial flow restructure | Done | home.md restructured with 13 blocks |
| Expert file 2 (preis): pricing page restructure | Done | pricing.md with first-year comparison, payment terms |
| Expert file 3 (digitales-fundament): product page | Done | digitales-fundament.md with 7 block type fixes |
| Expert file 4 (notausgang): exit page | Done | notausgang.md with checksums, beispiel-paket |
| Expert file 5 (kontakt): contact page | Done | contact.md with referrerField, chat-widget removed |
| Expert file 6 (agb): legal text fixes | Done | agb.md §9 domain fix, §13 Notausgang clarification |
| Expert files 7-9 (datenschutz/impressum/barrierefreiheit) | Done | Eyebrows added; prose already restructured (v3.0) |
| Expert file 10 (widerruf): remove B2C routes | Done | Already removed per RFC-0487 |
| Expert files 11-12 (bildnachweise/open-source) | Done | Generators run (RFC-0488/0489 already implemented) |
| Expert file 13 (leistungen): services page | Done | services.md restructured, 4 blocks converted |
| Expert files 14-15 (surface/ratgeber) | Done | Generators run (RFC-0490/0500 already implemented) |
| Expert file 16.1 (team persona) | Done | Team page eyebrow, Andrii bio updated, published |
| referrerField client-side handling | **Missing** | client.ts and api.ts not updated |
| Generated types regeneration | **Partial** | Manually edited, then regenerated; 42 files dirty |

## Questions for the author

1. **referrerField client-side handling:** The `send-message-section.client.ts` does not query, validate, or transmit the referrer value. The `send-message-section.api.ts` does not normalize or pass it to the IntegrationEvent. Is this an intentional deferral, or was it missed? If intentional, should the field be disabled in content until the client/server handling is implemented?

2. **42 dirty generated type files:** `props.types.generate` updated the header format for all generated type files in `packages/ui/`. Should these be committed as a separate "chore: regenerate types" commit, or are they expected to be committed with the referrerField change?

3. **audience-cards → transparency conversions:** On the services page, `audience-cards` blocks were converted to `transparency` lists, flattening structured card data (title + description + number) into single text strings. Was this conversion explicitly intended, or should the original `audience-cards` block type have been preserved?
