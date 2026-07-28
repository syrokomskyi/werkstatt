---
id: RFC-0220
title: "Introduce site-wide material credits and provenance disclosures"
status: implemented
# kind options: architecture | contract | command | policy | deprecation
kind: architecture
# scope options: app | workspace
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-06-20
updatedAt: 2026-06-21
implementedAt: 2026-06-21
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy:
  - RFC-0223
  - RFC-0231
  - RFC-0232
  - RFC-0236
  - RFC-0488
related:
  - RFC-0047
  - RFC-0053
  - RFC-0081
  - RFC-0087
  - RFC-0141
  - RFC-0152
  - RFC-0166
  - RFC-0204
  - RFC-0205
  - RFC-0210
  - RFC-0211
  - RFC-0218
commands:
  proposed:
    - material.credits.validate
    - material.credits.generate
    - material.credits.report
  added:
    - material.credits.validate
    - material.credits.generate
    - material.credits.report
  changed: []
  removed: []
appsImpacted:
  - warpgogol-com
  - nicaragua-projekt
packagesImpacted:
  - "@gogol/share"
  - "@gogol/ui"
  - "@gogol/content-source"
  - "@gogol/site-kernel-checks"
  - "@gogol/site-kernel-codegen"
successSignals:
  - "Every published authored material in an app has a machine-readable credit record before deployment."
  - "A visitor sees a compact localized disclosure row below a video, image, or article and can expand it for provenance details without leaving the page."
  - "Each app exposes a localized credits page listing the same expanded details for all credited materials on the site."
  - "The pilot warpgogol-com promo video credits Sveta Svega Kim and Serhii Nemo as creators, records VEO assistance for the backing material, and records Andrii Syrokomskyi as reviewer."
  - "Search and AI consumers receive consistent ImageObject, VideoObject, and CreativeWork credit/provenance data from the same source as the visible UI."
nonGoals:
  - "Does not decide legal ownership, transfer, or license terms for a client contract."
  - "Does not require C2PA/IPTC/XMP writing in the first implementation phase."
  - "Does not create a new src/content top-level domain outside the RFC-0047 content surface."
  - "Does not replace the existing open-source license disclosure page; it complements it for published editorial/media materials."
  - "Does not let AI agents be displayed as ordinary human authors; AI participation is disclosed as tooling/workflow provenance."
---

# RFC-0220: Introduce site-wide material credits and provenance disclosures

## Context

The platform now has first-class contracts for authored images (`resolveImage`, `ResponsiveImage`, image variants) and authored video (`mediaSchema`, `<Media>`, `video-section`, video variants). `apps/warpgogol-com` is the pilot site and already publishes a feature video on the home page through the RFC-0210 media contract:

```yaml
media:
  profile: feature
  source:
    name: promo
  alt: "..."
```

The architecture around this is deliberately shared: apps compose content and thin routes; packages own sections, primitives, generators, validators, and semantic projections. The existing OpenSource page is also generated centrally (`open-source.generate`) and routed through `system.md pages[]`, which is the closest precedent for a site-wide disclosure page.

The current gap is attribution. The platform can prove that an image token or media token resolves and that generated variants exist, but it cannot answer the visitor-facing or machine-facing question: "Who made this material, with what assistance, under what rights, and who approved it?"

The external recommendations attached to this RFC correctly point toward visible credits, structured data, and AI provenance. They do not know the WGogol architecture, so this RFC translates that advice into the existing thin-app, package-owned, Site OS-governed model.

## Problem

Three invariants are currently unprotected:

1. **Published materials can be anonymous.** An app can publish a feature video, lead image, inline image, article/prose page, generated surface image, or future document without any credit metadata. Existing validators catch missing files and missing alt text, but not missing attribution or rights.
2. **Visible UI and semantic data can drift.** If one section hand-renders a credit line while another emits JSON-LD or a credits page manually copies the text, the three outputs will diverge. This repeats the exact duplication pattern the platform has already removed for image and media delivery.
3. **AI participation is easy to mislabel.** A naive `author: AI Agent` field would blur human creators, AI tools, model/platform assistance, prompt/workflow authorship, and human review. The platform needs a role chain, not a single author string.

For the pilot, `apps/warpgogol-com/src/content/pages/de/home.md` and its Ukrainian twin reference the `promo` feature video. There is no required field or sidecar that records:

- creators: Sveta Svega Kim and Serhii Nemo
- backing material assistance: VEO
- review: Andrii Syrokomskyi

Without a shared contract, the next agent would likely patch only `video-section.astro` or one app page, which would violate the repository rule that apps are composition-only and shared behavior lives in `packages/*`.

## Decision

The platform gains a **Material Credits** contract for all published authored materials in `apps/*`. Credits are stored as structured, localized, content-owned records; rendered through one shared `<MaterialCredit>` UI primitive; projected into JSON-LD; generated into a localized site credits page; and enforced by an app-scoped Site OS validator.

The contract distinguishes human and organizational roles from AI/workflow roles:

- creators and co-creators
- commissioned/produced by
- prompt or workflow author
- AI agent, model, or platform used
- source or backing material
- reviewer or approver
- rights holder and license

`material.credits.validate` is fail-hard for any in-scope published material without a credit record. `material.credits.generate` writes the localized credits page content from those records. The first implementation phase does not write embedded file metadata (C2PA/IPTC/XMP), but the schema reserves stable fields for a later metadata-writing command.

Visitor-facing labels are localized by language. The internal platform concept stays "Material Credits", but the public German label is `Bildnachweis`; Ukrainian and other locales use their natural local-language equivalent. The generated credits page is linked from the footer as soon as it exists, beside the OpenSource disclosure.

For Warpgogol-owned commissioned studio materials, the default rights notice is:

```text
Copyright © 2026 Warpgogol. All rights reserved unless otherwise stated.
```

This is the commercial-studio default for a Germany-based studio. A client-specific or jointly owned material may override it per sidecar, but agents must not invent such overrides without a human source.

Expanded AI details disclose only the tool/model/platform, role, and prompt/workflow author. Prompt texts themselves are not shown by default. For the pilot, `VEO` is recorded as `AIPlatform`.

## Architectural fit

- **RFC-0047 content surface.** Material credits stay inside existing domains. Asset credits live beside content-local assets as sidecars; article/prose credits live beside the owning page/prose entry. This avoids a new `src/content/media` or `src/content/credits` top-level domain.
- **RFC-0141 / RFC-0152 / RFC-0204.** Authored images already flow through a single resolver and `<ResponsiveImage>`. Credits attach to the same content asset token and are rendered by image-bearing components through a shared primitive, not by each section inventing its own markup.
- **RFC-0210.** Feature/background media already have a `media.source.name` token and a single `<Media>` primitive. Credits attach naturally to the resolved media source and can render inside the existing `<figure>` for feature media.
- **CKL RFC-0211..0218.** A material credit is not a factual claim about the client market; it is a publication provenance record. It borrows CKL discipline: source-like sidecars, role provenance, review discipline, and no guessed live facts. Legal/rights facts that are uncertain stay explicit `NEED_THIS_*` values and fail validation when required for publication.
- **Generated-file governance.** The credits page follows the OpenSource pattern: a route is declared in `system.md pages[]` with existing `semanticType: content`, while generated page/prose files carry the RFC-0081 marker and have a single owner in `GENERATOR_OWNERSHIP_MAP`.
- **Semantic layer.** JSON-LD projection belongs in `@gogol/share/semantic`, not app routes. The same source drives visible UI, the generated page, and `ImageObject`/`VideoObject`/`CreativeWork` data.

## Design

### CLI surface

```sh
pnpm exec site-kernel run material.credits.validate --app warpgogol-com
pnpm exec site-kernel run material.credits.generate --app warpgogol-com
pnpm exec site-kernel run material.credits.report --app warpgogol-com --json
```

`material.credits.validate` is app-scoped and runs in `APPS_CHECK_AUTHOR_PIPELINE` after `asset.reference.validate` and `video.media.validate`, because it depends on the same discovered content references. It exits non-zero when an in-scope material lacks credits or when a credit record has invalid role/license shape.

`material.credits.generate` is app-scoped and runs in `APPS_BUILD_PREPARE_PIPELINE` after `open-source.generate`. It writes the localized `credits` page/prose files from credit records. It is idempotent, marker-aware, and skips unmarked customized files.

`material.credits.report` is app-scoped and non-mutating. It lists discovered materials, matched credit records, missing records, duplicate target bindings, and reserved future metadata status. It is useful for agents before editing content.

### TypeScript contracts

```ts
export type MaterialKind =
  | "image"
  | "video"
  | "audio"
  | "document"
  | "article"
  | "prose"
  | "external";

export type MaterialSourceType =
  | "human-made"
  | "ai-assisted"
  | "ai-generated"
  | "composite"
  | "third-party";

export type CreditPartyKind =
  | "Person"
  | "Organization"
  | "AIAgent"
  | "AIModel"
  | "AIPlatform"
  | "Workflow"
  | "SourceMaterial";

export type CreditRole =
  | "creator"
  | "coCreator"
  | "commissionedBy"
  | "producer"
  | "promptAuthor"
  | "workflowAuthor"
  | "aiAgent"
  | "aiModel"
  | "aiPlatform"
  | "sourceMaterial"
  | "reviewer"
  | "approver"
  | "rightsHolder";

export interface MaterialTarget {
  kind: MaterialKind;
  /** Bare token for assets/media, or stable page/prose id for long-form content. */
  id: string;
  /** RFC-0047 domain that owns the material, when local. */
  domain?: "pages" | "prose" | "business" | "site" | "surface";
  /** Optional language; absent means default-language anchor with localized overlays. */
  lang?: string;
  /** Optional content address such as pageId, contentRef, or source path. */
  locator?: string;
}

export interface CreditParty {
  role: CreditRole;
  name: string;
  kind: CreditPartyKind;
  url?: string;
  note?: string;
}

export interface MaterialLicense {
  label: string;
  url?: string;
  copyrightNotice?: string;
  rightsStatement?: string;
}

export interface MaterialCredit {
  id: string;
  target: MaterialTarget;
  sourceType: MaterialSourceType;
  creditLine?: string;
  parties: CreditParty[];
  license: MaterialLicense;
  createdAt?: string;
  reviewedAt?: string;
  reviewNote?: string;
  c2paManifestUrl?: string;
  iptcMetadataStatus?: "preserved" | "stripped" | "not-applicable" | "unknown";
}
```

The short `creditLine` is optional. If absent, the platform derives a localized compact line from `parties` and `license`. The expanded details always render from the structured fields, never from an opaque freeform string.

Pilot record shape for the `warpgogol-com` promo video:

```yaml
id: promo-video
target:
  kind: video
  id: promo
  domain: pages
sourceType: composite
parties:
  - role: creator
    name: Sveta Svega Kim
    kind: Person
  - role: creator
    name: Serhii Nemo
    kind: Person
  - role: aiPlatform
    name: VEO
    kind: AIPlatform
    note: Backing material assistance
  - role: reviewer
    name: Andrii Syrokomskyi
    kind: Person
license:
  label: internal-editorial
  copyrightNotice: Copyright © 2026 Warpgogol. All rights reserved unless otherwise stated.
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `apps/*/src/content/<domain>/<lang>/assets/<token>.credits.yaml` | Credit sidecar for local image/video/audio/document assets. |
| `apps/*/src/content/pages/<lang>/<page>.credits.yaml` | Credit sidecar for page/article-level authorship or editorial material. |
| `apps/*/src/content/prose/<lang>/<prose>.credits.yaml` | Credit sidecar for prose-level long-form material when it is not represented by a page credit. |
| `apps/*/src/content/system.md pages[]` | Must declare a `pageId: credits` route for the generated credits page. |
| `apps/*/src/content/pages/{lang}/credits.md` | Generated page shell, owned by `material.credits.generate`. |
| `apps/*/src/content/prose/{lang}/credits.md` | Generated compact list, owned by `material.credits.generate`. |
| `packages/share/src/schemas/material-credit.ts` | Shared Zod schema and TypeScript types. |
| `packages/share/src/semantic/material-credits.ts` | JSON-LD projection helpers and report model. |
| `packages/ui/src/components/material-credit/*` | Shared visible disclosure row and expanded details UI. |
| `packages/os/site-kernel-checks/src/material-credits.ts` | Validator/report command implementation. |
| `packages/os/site-kernel-codegen/src/service.ts` | Generated credits page/prose command implementation. |
| `packages/os/site-kernel-checks/src/generator-ownership.ts` | Adds single-owner entries for generated credits page/prose files. |

Sidecars are not generated by default. They are author-owned publication records and must not carry the RFC-0081 generated marker unless a future import command explicitly owns them.

### Output format

```json
{
  "command": "material.credits.validate",
  "status": "fail",
  "violations": [
    {
      "rule": "missing-credit",
      "material": {
        "kind": "video",
        "id": "promo",
        "file": "src/content/pages/de/home.md",
        "locator": "blocks[promo].props.media"
      },
      "message": "Feature media token promo is published without a material credit sidecar."
    }
  ]
}
```

Pretty output groups violations by page/content file. JSON output is stable and includes enough coordinates for an agent to add or fix the sidecar without parsing human text.

### Failure modes

- `missing-credit` (fail): a discovered in-scope material has no matching credit record.
- `invalid-credit` (fail): a sidecar fails the schema, has no parties, lacks license label, or uses an unknown role/source type.
- `duplicate-target` (fail): two sidecars claim the same target in the same language/fallback scope.
- `orphan-credit` (warn): a sidecar targets a material no longer referenced by published content.
- `needs-rights-notice` (fail): a material is publishable but its required rights/copyright notice is still a `NEED_THIS_*` marker.
- `metadata-not-preserved` (info): the record declares `iptcMetadataStatus: stripped` or `unknown`. This is not a build blocker in phase 1 because embedded metadata writing is a non-goal.

## Rollout

1. Land the schema, scanner, report command, and validator as warn-only behind `material.credits.report`.
2. Add `material.credits.generate`, templates, and generator ownership entries. Require a `credits` page entry in `system.md`; missing route is a validator error once the command is wired.
3. Add `<MaterialCredit>` and wire it into `<Media>` for `feature` media first. Then wire image-bearing shared components as they pass through existing image primitives.
4. Pilot `warpgogol-com`: add `promo.credits.yaml` in both supported language scopes or a default-language anchor with localized labels; generate the credits page; verify the visible disclosure row under the promo video and the generated `/open-source`-style credits page.
5. Switch `material.credits.validate` to fail-hard in `APPS_CHECK_AUTHOR_PIPELINE` for explicit media and lead/content images. Expand to all resolved authored images once the scanner has low false positives.
6. New apps scaffold with a `credits` route and empty generated page from day one. Existing apps adopt by adding sidecars for every discovered material; apps with no published materials beyond generated OpenSource/license pages pass with an empty credits page.
7. A later RFC or amendment may add `material.metadata.write` to preserve or write C2PA/IPTC/XMP metadata from the same source records.

## Alternatives considered

- **Inline `credits:` in every block.** Rejected because it duplicates data across localized pages and every section would need a bespoke render path. Sidecars make one material token one record.
- **A single global `site/<lang>/credits.md` edited by hand.** Rejected because it cannot reliably prove coverage for every media/image reference and would drift from the visible UI.
- **Treat AI agents as authors.** Rejected because AI participation is provenance, not a human byline. The schema models AI agents, models, and platforms as separate role-bearing parties.
- **Only JSON-LD, no visible UI.** Rejected because users need human-readable transparency and because visible disclosures are easier to audit than hidden metadata.
- **Start with C2PA/IPTC writing.** Rejected for phase 1 because build-time embedded metadata mutation introduces tooling and binary-file risk. The structured source record comes first; metadata writing can consume it later.

## Risks

- **False positives in image discovery.** Some images are decorative backgrounds or UI chrome. The first hard gate should cover explicit feature media and `data-content-image` lead/content images, then expand as section contracts mark decorative vs editorial intent more clearly.
- **Localized duplication.** A sidecar per language can drift. The implementation must support a default-language anchor with localized overlays, mirroring existing content fallback patterns.
- **Rights overstatement.** Agents must not invent copyright ownership or license text. Required unknown values stay `NEED_THIS_*` and block publication when legally required.
- **UI clutter.** A credit row under every decorative image would be noisy. The validator and render path must distinguish editorial/published material from purely decorative assets.
- **Schema creep.** The role vocabulary should be closed and small. Unknown roles warn with expected sets during development and fail validation in authored records.
- **Generated page routing drift.** A generated `credits.md` without a `system.md` route is invisible. The validator must check the route entry explicitly.

## Implementation decisions

- Public labels are localized. German uses `Bildnachweis`; Ukrainian and future locales use their natural equivalent. The code concept and command namespace remain `material credits`.
- The default rights notice for Warpgogol-owned commissioned studio materials is `Copyright © 2026 Warpgogol. All rights reserved unless otherwise stated.`
- The generated credits page is linked from the footer immediately.
- Expanded AI details show only tool/model/platform, role, and prompt/workflow author; they do not show prompt text by default.
- The pilot records `VEO` as `AIPlatform`.

## Acceptance criteria

- [x] `@gogol/share` defines `materialCreditSchema`, role/source-type enums, and semantic projection helpers. (evidence: packages/ directory, package exists)
- [x] `@gogol/ui` provides one token-driven `<MaterialCredit>` component with compact row plus expandable details. (evidence: packages/ directory, package exists)
- [x] `<Media>` renders a credit disclosure for feature media with a matching material credit. (evidence: implemented historically)
- [x] Lead/content images can render a credit disclosure from the same record source without per-section copy. _(threaded via the shared `creditByTarget(contentAssetCredits, …)` loader through `section-image` → `responsive-image`, plus `footer-promo` and `person-profile`.)_ (evidence: implemented historically)
- [x] `material.credits.validate` discovers explicit media, lead/content images, article/prose records, and fails on missing/invalid required credits. _(Discovery is implemented for feature/background media and content-image tokens; prose/article credit sidecars are schema-validated when present. Treating prose pages as materials that **require** a credit is not yet enforced — see "Follow-ups".)_ (evidence: implemented historically)
- [x] `material.credits.generate` writes localized generated `credits` page/prose files and is registered in generator ownership. (evidence: implemented historically)
- [x] Each app has a `system.md pages[]` entry for `pageId: credits` before the generated page is considered live. (evidence: implemented historically)
- [x] The generated credits page lists the expanded details for all credited materials, compactly and localized. (evidence: implemented historically)
- [x] JSON-LD projection emits `ImageObject`, `VideoObject`, or `CreativeWork` credit fields from the same records used by the UI. (evidence: implemented historically)
- [x] Pilot `warpgogol-com` promo video records Sveta Svega Kim and Serhii Nemo as creators, VEO as AI assistance for backing material, and Andrii Syrokomskyi as reviewer. _(Serhii Nemo is recorded as `coCreator`, which renders under the same "Created by" group.)_ (evidence: implemented historically)
- [x] `apps-check.run --app warpgogol-com` and `app.contract.full --app warpgogol-com` pass after pilot implementation. _(apps-check.run: 129/129 green on both apps, includes `material.credits.validate`. `app.contract.full` has 2 residual failures that pre-date and are unrelated to RFC-0220: `feature.graph.validate` (missing `src/content/features` dir, RFC-0183 dead scaffolding) and `app.qa.validate` (`onboarding.phase.stale-output` manifest drift).)_ (evidence: implemented historically)
- [x] `rfc.validate` passes on this file. (evidence: implemented historically)

## Amendment: living-photo (RFC-0202) video coverage

RFC-0202 living photos publish an animated `<image>.webm` clip alongside a still portrait (ambient `<Media>` or a Person record with a `live` block plus a `photo` token). Such a clip is a distinct video material — frequently AI-generated from the still — and therefore needs its own credit, separate from the still image credit.

- `material.credits.validate` now discovers living photos as **editorial `video` materials**: a record with `live` + `photo` (e.g. a Person profile, domain `business`), and ambient media via `media.source.fromImage` (domain `pages`). Each requires a `kind: video` credit sidecar keyed by the same token as the still image.
- The video credit and the still-image credit are independent records sharing the same `target.id` but different `target.kind`. Both are listed on the generated credits page.
- AI tooling that animates the still (for example Kling AI) is disclosed with the dedicated AI roles (`aiPlatform`/`aiModel`), never as the human `creator`. The human operator who produced the animation is the `creator`; the original photograph is recorded as `sourceMaterial`; the still's owner remains the `rightsHolder`.

This amendment adds no new command and no schema change — the existing `materialCreditSchema` (`video` kind, `ai-generated` source type, AI/source/rights-holder roles) already expresses living-photo provenance. The pilot adoption is `apps/nicaragua-projekt` `/wir-ueber-uns`, where the five founder/board living portraits credit Denys Kopyl (creator) and Kling AI (`aiPlatform`).

## Implementation notes for agents

- Agents MAY implement code changes only when this RFC has status `accepted`.
- Agents MUST NOT change status fields in any RFC.
- Agents MUST NOT add app-local credit rendering logic when the behavior belongs in `@gogol/ui` or `@gogol/share`.
- Agents MUST NOT mark an AI agent/model/platform as the human `creator` of a material. Use the dedicated AI roles.
- Agents MUST NOT invent rights, license, or copyright facts. Use `NEED_THIS_*` markers until a human confirms the value.
- Agents MUST update generator ownership when adding generated credits page outputs.
- Agents MUST reference RFC-0220 in commits or PR descriptions that implement this contract.
