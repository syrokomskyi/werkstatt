---
id: RFC-0223
title: "Search- and AI-ready material credit projection"
status: implemented
# kind options: architecture | contract | command | policy | deprecation
kind: contract
# scope options: app | workspace
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-06-21
updatedAt: 2026-06-21
implementedAt: 2026-06-21
closedAt:
supersedes: []
supersededBy:
amends:
  - RFC-0220
amendedBy: []
related:
  - RFC-0162
  - RFC-0163
  - RFC-0215
  - RFC-0218
  - RFC-0220
commands:
  proposed: []
  added: []
  changed:
    - material.credits.validate
  removed: []
appsImpacted:
  - warpgogol-com
  - nicaragua-projekt
packagesImpacted:
  - "@gogol/share"
  - "@gogol/ui"
  - "@gogol/site-kernel-checks"
successSignals:
  - "An image credit with a license URL emits Google-recognized `license` and `acquireLicensePage` on its `ImageObject`, qualifying it for the licensable-images treatment."
  - "A material credit JSON-LD node always carries a structured `copyrightHolder` and `copyrightYear`, not only a freeform notice string."
  - "AI-assisted media can record the model/platform version and generation date, and the expanded disclosure shows them without exposing prompt text."
  - "`material.credits.validate` rejects a license that declares `acquireLicensePage` without a resolvable `url`, and rejects an AI party that sets `generatedAt` to a non-date."
  - "Structured-data credit language matches the page language on every locale (closes the RFC-0220 default-language projection defect)."
nonGoals:
  - "Does not write embedded C2PA/IPTC/XMP metadata; that remains a later `material.metadata.write` phase."
  - "Does not link credit media nodes into the page WebPage/Article graph; orphan-node consolidation with RFC-0163 is a separate follow-up."
  - "Does not add a decorative-vs-editorial intent model; image discovery still uses the RFC-0220 token-key heuristic."
  - "Does not make long-form prose/article pages require a credit record; prose sidecars stay validated-when-present."
  - "Does not change the visible compact credit row layout or the credits page route."
---

# RFC-0223: Search- and AI-ready material credit projection

## Context

RFC-0220 shipped the Material Credits contract: localized sidecars, one `<MaterialCredit>` disclosure, a generated credits page, and a JSON-LD projection that emits `ImageObject` / `VideoObject` / `CreativeWork` from the same records used by the UI. Verification on 2026-06-21 (branch `develop`) confirmed both apps green: `material.credits.validate` OK, `apps-check.run` 129/129, `rfc.validate` 208/208.

That verification also surfaced gaps in how the record is projected for machine consumers:

1. **The projected `creditText` was rendered in the default language (de) on every locale.** A locale fix landed in `fix(rfc-0220): localize JSON-LD creditText per page language` (commit `727f2503`). This RFC records that fix as part of the projection contract so it cannot regress.
2. **The license is projected as a bare label string when no URL exists.** `license: credit.license.url ?? credit.license.label` emits `"commissioned-warpgogol-material"` into `ImageObject.license`, which search engines cannot use. There is no `acquireLicensePage`, so the licensable-images treatment can never trigger even when a license URL is present.
3. **Rights are only a freeform `copyrightNotice` string.** There is no structured `copyrightHolder` / `copyrightYear`, so consumers must parse English prose to learn the holder.
4. **AI provenance is name-only.** A `VEO` party carries a `note` at best — no model/platform version and no generation date, which the EU AI Act transparency direction and AI search consumers increasingly expect for synthetic media.

## Problem

The Material Credits record is the single source of truth, but its machine projection underuses the structure it already has and omits a few high-value fields. The visible UI and the generated page are already correct; the loss is concentrated in the JSON-LD node and in the absence of two optional structured fields.

This RFC does not invent a new surface. It tightens the existing `buildMaterialCreditJsonLd` projection, adds four optional fields to the existing schema, surfaces them in the existing disclosure, and extends the existing `material.credits.validate` rules. It deliberately excludes the heavier follow-ups (C2PA writing, page-graph linking, decorative intent, prose enforcement), which are named as non-goals so a later RFC owns them.

## Decision

Extend the Material Credits contract with optional, structured provenance fields and a search-ready JSON-LD projection:

- `MaterialLicense` gains optional `acquireLicensePage` (URL) and `copyrightYear` (number).
- `CreditParty` gains optional `version` (string) and `generatedAt` (ISO date string), meaningful for AI roles and source material.
- `buildMaterialCreditJsonLd`:
  - emits `license` **only** when a license URL is present (never the label string);
  - emits `acquireLicensePage` when present;
  - emits structured `copyrightHolder` (the `rightsHolder` party if present, else the studio `Organization` derived from the notice) and `copyrightYear` (explicit field, else parsed from the notice);
  - keeps `creditText` localized to the caller's labels.
- The expanded `<MaterialCredit>` details show AI `version` and `generatedAt` for AI/source parties, still without prompt text.
- `material.credits.validate` gains two failure modes:
  - `invalid-license-acquire` (fail): `acquireLicensePage` set without a resolvable `url`.
  - `invalid-ai-date` (fail): a party `generatedAt` that is not an ISO date.

## Architectural fit

- **RFC-0220.** This amends the Material Credits schema, projection, disclosure, and validator. It does not move ownership: schema/projection stay in `@gogol/share`, disclosure in `@gogol/ui`, validation in `@gogol/site-kernel-checks`.
- **RFC-0162 / RFC-0163.** Social and JSON-LD emission already own page-level structured data. This RFC enriches the per-material node only; linking that node into the page graph is left to a follow-up so this change stays self-contained and testable.
- **RFC-0215 / RFC-0218 (CKL).** `version` and `generatedAt` are provenance facts, not market claims. They stay optional and human-supplied; agents must not invent them.

## Design

### Schema additions

```ts
export interface MaterialLicense {
  label: string;
  url?: string;
  acquireLicensePage?: string; // NEW: where a license can be obtained
  copyrightNotice?: string;
  copyrightYear?: number;      // NEW: structured year
  rightsStatement?: string;
}

export interface CreditParty {
  role: CreditRole;
  name: string;
  kind: CreditPartyKind;
  url?: string;
  version?: string;     // NEW: model/platform/tool version
  generatedAt?: string; // NEW: ISO date of AI/source generation
  note?: string;
}
```

All four fields are optional; existing sidecars stay valid.

### Projection

```jsonc
{
  "@type": "ImageObject",
  "contentUrl": "…",
  "name": "…",
  "creditText": "Erstellt von: … · Rechte: …",   // localized to page language
  "creator": { "@type": "Person", "name": "…" },
  "copyrightHolder": { "@type": "Organization", "name": "Warpgogol" },
  "copyrightYear": 2026,
  "copyrightNotice": "Copyright © 2026 Warpgogol. …",
  "license": "https://…",                          // only when a URL exists
  "acquireLicensePage": "https://…"                // only when present
}
```

### Validation

`material.credits.validate` adds `invalid-license-acquire` and `invalid-ai-date` to its existing `missing-credit` / `invalid-credit` / `duplicate-target` / `needs-rights-notice` set. Both are fail-hard because they indicate a malformed authored record, not a coverage gap.

## Rollout

1. Add the four optional schema fields and the validator rules. Existing apps stay green because the fields are optional and unused.
2. Tighten `buildMaterialCreditJsonLd` to URL-only `license`, structured `copyrightHolder` / `copyrightYear`, and `acquireLicensePage`.
3. Surface `version` / `generatedAt` in the expanded disclosure.
4. Optionally enrich pilot records (e.g. VEO `version`, promo `generatedAt`) once a human supplies the values; not required for the gate.

## Alternatives considered

- **Emit the license label as `ImageObject.license`.** Rejected: search engines treat `license` as a URL; a label there is noise and never yields the licensable treatment.
- **Add a separate `provenance` block for AI fields.** Rejected: AI participants are already first-class parties; versioning them in place keeps one role chain.
- **Implement C2PA now.** Rejected again for the same reason as RFC-0220: binary metadata mutation is a heavier, separately-owned phase.

## Risks

- **Rights overstatement.** `copyrightYear` and AI `version`/`generatedAt` must come from a human. Agents must not infer them. Required unknowns stay `NEED_THIS_*`.
- **Projection regression.** The localized-`creditText` behavior must stay covered; this RFC records it as contract so a future refactor cannot silently revert it.
- **Field creep.** The four new fields are the closed set for this RFC; further provenance fields need their own amendment.

## Implementation decisions

- `license` is emitted only as a URL; the human-readable label remains in `creditText` and the expanded UI.
- `copyrightHolder` resolves to the `rightsHolder` party when present, otherwise the studio `Organization` parsed from the notice.
- AI `version` / `generatedAt` are shown in the expanded details only, never prompt text.

## Acceptance criteria

- [x] `materialLicenseSchema` accepts optional `acquireLicensePage` (URL) and `copyrightYear` (number); `creditPartySchema` accepts optional `version` and `generatedAt`. (evidence: implemented historically)
- [x] `buildMaterialCreditJsonLd` emits `license` only when a URL exists, plus `acquireLicensePage`, structured `copyrightHolder`, and `copyrightYear`. (evidence: implemented historically)
- [x] JSON-LD `creditText` is localized to the page language on every locale (RFC-0220 default-language defect stays fixed). _(Fixed in commit `727f2503`; verified in built `dist` /uk/ output.)_ (evidence: implemented historically)
- [x] `<MaterialCredit>` expanded details render AI `version` and `generatedAt` when present, without prompt text. (evidence: implemented historically)
- [x] `material.credits.validate` fails on `acquireLicensePage` without `url` and on non-date `generatedAt`. _(Negative-tested: both `invalid-license-acquire` and `invalid-ai-date` fire.)_ (evidence: implemented historically)
- [x] `apps-check.run --app warpgogol-com` and `--app nicaragua-projekt` pass after the change. (evidence: original apps retired by RFC-0381, implemented historically)
- [x] `rfc.validate` passes on this file. (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement code changes only when this RFC has status `accepted`.
- Agents MUST NOT change status fields in any RFC.
- Agents MUST NOT invent license URLs, copyright years, model versions, or generation dates. Use `NEED_THIS_*` or omit the optional field until a human supplies it.
- Agents MUST keep schema/projection in `@gogol/share`, disclosure in `@gogol/ui`, and validation in `@gogol/site-kernel-checks`.
- Agents MUST reference RFC-0223 in commits or PR descriptions that implement this contract.
