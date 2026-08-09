---
id: RFC-0487
title: Remove B2C widerruf routes from warpgogol-com
status: implemented
kind: architecture
scope: workspace
owners:
- architecture
reviewers:
- human:andrii-syrokomskyi
createdAt: 2026-07-22
updatedAt: 2026-07-22
enhancedAt: 2026-07-22
implementedAt: 2026-07-22
closedAt: null
supersedes: []
supersededBy: null
amends: []
amendedBy:
- RFC-0589
related:
- RFC-0318
- RFC-0480
satisfies:
- DNA-13
breaksC: true
versionBump: minor
commands:
  proposed: []
  added:
  - b2b.model.validate
  changed:
  - public.infrastructure.generate
  removed: []
appsImpacted:
- warpgogol-com
packagesImpacted:
- '@gogol/site-kernel-codegen'
- '@gogol/site-kernel-checks'
- '@gogol/ontology'
- '@warpgogol/ontology'
successSignals:
- /widerruf/ and /widerruf-formular/ return HTTP 410 Gone (not 200, not 404)
- /vidmova/ and /forma-vidmovy/ return HTTP 410 Gone
- No widerruf or musterWiderruf entries remain in system.md, navigation, labels, or sitemap
- No internal links to /widerruf/ or /widerruf-formular/ remain in any page
- b2b.model.validate --app warpgogol-com exits 0
- redirect.map.validate --app warpgogol-com passes with 410 entries for retired routes
- content.references.validate --app warpgogol-com exits 0 (after cross-page cleanup)
nonGoals:
- Does not modify AGB content — AGB consumer provision removal is a separate content task (expert file 6 session)
- Does not modify /kontakt/ — contact page B2B clarification is a separate content task (expert file 5 session)
- Does not modify /notausgang/ — notausgang Kündigung vs Widerruf distinction is a separate content task (expert file 4 session)
- Does not modify /impressum/ — impressum widerruf link removal is a separate content task (expert file 8 session)
- Does not modify /datenschutz/ — datenschutz widerruf process removal is a separate content task (expert file 7 session)
- Does not remove Git history — historical files remain in version control, just not rendered

---

# RFC-0487: Remove B2C widerruf routes from warpgogol-com

## Context

Warpgogol operates exclusively as a **B2B platform** — the product `Digitales Fundament` is offered only to Unternehmer (§ 14 BGB) who conclude contracts in the course of their commercial or independent professional activity.

The German Widerrufsrecht (§ 312g BGB) applies to Verbraucher (consumers) in distance and off-premises contracts, **not** to entrepreneurs. The site currently publishes two B2C legal pages that are legally inapplicable to Warpgogol's actual business model:

- `/widerruf/` (UK: `/vidmova/`) — Widerrufsbelehrung (right of withdrawal notice)
- `/widerruf-formular/` (UK: `/forma-vidmovy/`) — Muster-Widerrufsformular (model withdrawal form)

These pages are linked from the footer (both DE and UK), referenced in AGB, Impressum, and Datenschutz, and indexed in sitemaps. Their continued presence:

1. Creates the impression that Warpgogol accepts B2C contracts
2. Contradicts the B2B-only positioning of the AGB
3. Confuses Widerruf (consumer right) with Kündigung (contract termination)
4. May be perceived as a voluntarily promised contractual right
5. Contains provisions that are legally incorrect for B2B (e.g. 30-day refund window vs. statutory 14-day model)

## Problem

Removing two public routes is a **Layer C external-surface change** (RFC-0480): it alters the URL schema, sitemaps, hreflang, and canonical URLs. This requires `Breaks-C: yes` and a `surface.contract.validate` check.

The removal touches multiple layers:

- **system.md**: page declarations (`pageId: widerruf`, `pageId: musterWiderruf`) and page-level rationale
- **Navigation**: footer legal entries (both DE and UK)
- **Site labels**: `legalIds` lists (both DE and UK)
- **PBP business-profile**: `widerrufCreationDate` and `widerrufFormCreationDate` date fields in `business-profile/de/documents/terms.md` (DE only; UK terms.md has no widerruf date fields)
- **Site meta**: widerruf date fields in `site/de/meta.md`
- **Page files**: 4 page declarations + 4 prose files (DE + UK)
- **Route tombstones**: HTTP 410 Gone for retired URLs (both DE and UK slugs)
- **Cross-page links**: AGB, Impressum, Datenschutz contain links to `/widerruf/` — these become broken and must be cleaned (deferred to their own expert-file sessions)

The platform already supports HTTP 410 in the `_redirects` file (RFC-0318, `redirect.map.validate`), but the `buildRetiredSurfaceRedirectBlock` generator only handles retired _generated surface_ routes. Retired _page_ routes from `system.md` need a new mechanism.

### Layer C contract impact

The declarative C-contract in `packages/ontology/src/external-surfaces/url-schema.yaml` uses generic route patterns (`/:locale?/:slug`), not enumerated routes. Removing `/widerruf/` and `/widerruf-formular/` does not change the URL pattern schema — the pattern still matches all remaining authored routes. Therefore, no changes to `url-schema.yaml`, `jsonld-types.yaml`, or `sitemap-shape.yaml` are needed. The `breaksC: true` declaration is required because the RFC removes public URLs (a Layer C surface change), but the C-contract files remain unchanged because the contract is pattern-based, not enumeration-based. `@gogol/ontology` is in `packagesImpacted` because the `systemManifestSchema` gains the `retiredRoutes` and `businessModel` fields — a schema extension, not a C-contract change.

## Decision

1. **Remove both routes entirely** from warpgogol-com — no rewrite, no redirect to `/notausgang/` (Widerruf and Kündigung are different legal mechanisms).
2. **Return HTTP 410 Gone** for all four retired URL variants:
   - `/widerruf/`
   - `/widerruf-formular/`
   - `/vidmova/`
   - `/forma-vidmovy/`
3. **Add a `retiredRoutes` field** to `system.md` so the `_redirects` generator can emit 410 entries for retired page routes (analogous to how `buildRetiredSurfaceRedirectBlock` handles retired surface routes).
4. **Add a `businessModel` field** to `system.md` as a closed enum (`b2b-only`) with a single value. Future RFCs may add values (`b2c`, `marketplace`) as needed.
5. **Add a `b2b.model.validate` command** in `@gogol/site-kernel-checks` that checks no B2C-specific page IDs (`widerruf`, `musterWiderruf`) or consumer-law references (§ 312g, § 312j, Verbraucher-Widerrufsrecht) exist when `businessModel: b2b-only` is declared in `system.md`. This is a new command, not a flag on `system.manifest.validate`, because it checks cross-cutting content semantics (prose, navigation, labels) beyond manifest structure.
6. **Remove PBP date fields** (`widerrufCreationDate`, `widerrufFormCreationDate`) from the business-profile terms document and site meta.
7. **Defer cross-page cleanups** (AGB, Impressum, Datenschutz, Kontakt, Notausgang) to their respective expert-file sessions — those pages need their own content changes beyond just link removal. **Rollout order:** cross-page cleanup sessions (expert files 4-8) must complete BEFORE route removal, because `b2b.model.validate` is fully blocking — prose checks for § 312g and Verbraucher-Widerrufsrecht will fail if AGB/Impressum/Datenschutz still contain Widerruf references.

## Design

### 1. system.md changes

Remove the two page entries from `pages[]`:

```yaml
# REMOVE these entries:
  - pageId: widerruf
    semanticType: legal
    cosmicStar: Vega
    routes:
      de: widerruf
      uk: vidmova
    planets:
      - cosmicPlanet: Hyperion
        pin: 1.0.0
      - cosmicPlanet: Dione
        pin: 1.0.0
  - pageId: musterWiderruf
    semanticType: legal
    output:
      robots:
        index: false
    cosmicStar: Vega
    routes:
      de: widerruf-formular
      uk: forma-vidmovy
    planets:
      - cosmicPlanet: Hyperion
        pin: 1.0.0
      - cosmicPlanet: Dione
        pin: 1.0.0
```

Update the page-level rationale (line 713) to remove `widerruf` and `musterWiderruf` from the legal pages list.

Add a `retiredRoutes` field and `businessModel` declaration:

```yaml
businessModel: b2b-only  # closed enum, single value; future RFCs may add b2c, marketplace
retiredRoutes:
  - slug: widerruf
    status: 410
  - slug: widerruf-formular
    status: 410
  - slug: vidmova
    status: 410
  - slug: forma-vidmovy
    status: 410
```

If a `retiredRoutes` slug is also present as an active route in `pages[]`, `b2b.model.validate` reports a conflict (B2B-CONFLICT-01): a route cannot be both active and retired.

### 2. Navigation changes

Remove `widerruf` and `musterWiderruf` entries from both:

- `navigation/de/navigation.md` (lines 80-93)
- `navigation/uk/navigation.md` (lines 80-93)

### 3. Site labels changes

Remove `widerruf` and `musterWiderruf` from `legalIds` in both:

- `site/de/labels.md` (lines 41-42)
- `site/uk/labels.md` (lines 41-42)

### 4. PBP and meta date cleanup

Remove from `business-profile/de/documents/terms.md`:

```yaml
    widerrufCreationDate: 2026/06/01
    widerrufFormCreationDate: 2026/06/01
```

Remove from `site/de/meta.md`:

```yaml
widerrufCreationDate: "2026/06/01"
widerrufFormCreationDate: "2026/06/01"
```

### 5. Page and prose file deletion

Delete the following files:

- `pages/de/widerruf.md`
- `pages/uk/widerruf.md`
- `pages/de/muster-widerruf.md`
- `pages/uk/muster-widerruf.md`
- `prose/de/widerruf.md`
- `prose/uk/widerruf.md`
- `prose/de/muster-widerruf.md`
- `prose/uk/muster-widerruf.md`

### 6. Route tombstones (410 Gone)

Extend `buildRetiredSurfaceRedirectBlock` in `packages/os/site-kernel-codegen/src/app-boilerplate-helpers.ts` (or add a parallel `buildRetiredPageRedirectBlock`) to read `retiredRoutes` from `system.md` and emit 410 entries into `_redirects`:

```text
/widerruf/* / 410
/widerruf-formular/* / 410
/vidmova/* / 410
/forma-vidmovy/* / 410
```

The existing `redirect.map.validate` (RFC-0318) already supports status 410 — no validator changes needed.

### 7. b2b.model.validate command

New command in `@gogol/site-kernel-checks`:

```sh
pnpm exec werkstatt run b2b.model.validate --app warpgogol-com --json
```

Scope: `app`, supports `--app` flag (consistent with `redirect.map.validate`, `content.references.validate`). Runs in `sites-check-author` pipeline. All checks are **blocking** (exit code 1 on any violation) — there is no advisory mode.

The command is a separate command, not a flag on `system.manifest.validate`, because it checks cross-cutting content semantics (prose references, navigation labels, footer legalIds) beyond manifest structure. `system.manifest.validate` validates schema shape; `b2b.model.validate` validates business-model compliance.

When `businessModel: b2b-only` is declared in `system.md`, the command checks:

- No `pageId: widerruf` or `pageId: musterWiderruf` in `pages[]` (B2B-PAGE-01)
- No route slugs `widerruf`, `widerruf-formular`, `vidmova`, `forma-vidmovy` in `pages[]` (B2B-ROUTE-01). `retiredRoutes` is the allowed escape hatch — slugs listed in `retiredRoutes` are tombstones, not active routes, and do not trigger this check.
- No `retiredRoutes` slug is also present as an active route in `pages[]` (B2B-CONFLICT-01)
- No footer/navigation labels containing "Widerruf" or "Відмова" as a withdrawal right (B2B-LABEL-01). Note: "Widerruf" in the context of "Widerruf ist für Unternehmer ausgeschlossen" (exclusion of withdrawal right for entrepreneurs) is a legitimate B2B usage — the check matches standalone "Widerruf" labels that link to a widerruf page, not inline prose mentions.
- No references to § 312g BGB or § 312j BGB in prose content (B2B-PROSE-01)
- No "Verbraucher-Widerrufsrecht" in prose content (B2B-PROSE-02)

**Scan scope:** prose files under `src/content/prose/**` and page files under `src/content/pages/**` for the declared locales. For warpgogol-com this is approximately 40-60 files — low cost, single-pass regex scan.

**Apps without `businessModel` field:** the command is a no-op (exit 0, no violations). The check only activates when `businessModel: b2b-only` is explicitly declared. Existing apps without the field are exempt.

**Output format (`--json`):**

```json
{
  "command": "b2b.model.validate",
  "status": "pass|fail",
  "businessModel": "b2b-only|undefined",
  "violations": [
    {
      "rule": "B2B-PAGE-01",
      "file": "src/content/system.md",
      "message": "pageId 'widerruf' is a B2C legal page but businessModel is b2b-only"
    }
  ],
  "count": 0
}
```

### 8. Cross-page dependencies (must complete before route removal)

The following pages contain links to `/widerruf/` and need cleanup in their own expert-file sessions BEFORE route removal is deployed, because `b2b.model.validate` is fully blocking:

| Page | Expert file | What to remove |
| --- | --- | --- |
| AGB (`prose/de/agb.md`, `prose/uk/agb.md`) | File 6 | § 312g references, Widerrufsrecht section, `/widerruf/` links, Verbraucher definitions |
| Impressum (`prose/de/impressum.md`, `prose/uk/impressum.md`) | File 8 | Widerrufsrecht link |
| Datenschutz (`prose/de/datenschutz.md`, `prose/uk/datenschutz.md`) | File 7 | Widerruf-specific processing references |
| Kontakt (`pages/de/contact.md`, `pages/uk/contact.md`) | File 5 | B2B-only clarification (not a link removal) |
| Notausgang (`pages/de/notausgang.md`, `pages/uk/notausgang.md`) | File 4 | Widerruf vs Kündigung distinction |

Until those sessions run, `content.references.validate --app warpgogol-com` will report broken links from those pages to the retired routes, and `b2b.model.validate --app warpgogol-com` will report B2B-PROSE-01/02 violations. This is expected and will be resolved by the respective sessions. **Rollout order:** cross-page cleanup sessions (files 4-8) must complete before the route removal mission is deployed.

## Architectural fit

- **RFC-0318 (Retired surface redirects):** Established the `_redirects` infrastructure and `redirect.map.validate` with 410 support. This RFC extends the same mechanism to retired _page_ routes (not just generated surface routes).
- **RFC-0480 (Layer C protection):** This RFC declares `breaksC: true` because it removes external URLs. `surface.contract.validate` will detect the URL schema change. The `retiredRoutes` field provides a declarative audit trail of removed routes. No changes to `packages/ontology/src/external-surfaces/` are needed because the C-contract uses generic route patterns, not enumerated routes (see §Problem → Layer C contract impact).
- **DNA-13 (Disabled content must not leak):** This RFC satisfies DNA-13 by ensuring that removed widerruf pages do not leak in navigation, labels, sitemaps, or semantic projections. The `b2b.model.validate` command enforces this by checking that no B2C page IDs, route slugs, navigation labels, or prose references remain when `businessModel: b2b-only` is declared.
- **Business model declaration:** The `businessModel: b2b-only` field is a new system.md field without an existing DNA invariant backing it. No DNA invariant currently covers business-model declaration. If the ecosystem later needs a DNA invariant for business models, a separate RFC should propose it.

## Alternatives considered

- **Keep pages, add B2B-only disclaimer.** Rejected: the expert analysis is unambiguous — keeping B2C legal pages on a B2B-only site creates legal exposure and contradicts the AGB. A disclaimer does not fix the fundamental mismatch.

- **Redirect to /notausgang/.** Rejected: Widerruf (consumer right) and Kündigung (contract termination) are different legal mechanisms. Redirecting would conflate them. 410 Gone is the correct signal — the content is permanently removed.

- **Return 404 instead of 410.** Rejected: 410 Gone is more precise than 404 — it tells search engines and clients that the resource was intentionally removed, not that there's a broken link. The expert explicitly recommends 410.

- **Remove pages but keep prose files as unlinked reference.** Rejected: the expert explicitly says not to keep them as reference materials. Unlinked prose files could still be discovered and create confusion.

## Rollout

1. **Platform changes first** (packages/*):
   - Add `retiredRoutes` field support to `systemManifestSchema` in `@gogol/ontology`
   - Add `businessModel` field (closed enum: `b2b-only`) to `systemManifestSchema` in `@gogol/ontology`
   - Extend `buildRetiredSurfaceRedirectBlock` (or add `buildRetiredPageRedirectBlock`) in `@gogol/site-kernel-codegen`
   - Add `b2b.model.validate` command in `@gogol/site-kernel-checks`
   - Add `b2b.model.validate` to `sites-check-author` pipeline

2. **Cross-page cleanup** (separate expert-file sessions, MUST complete before step 3):
   - AGB session (file 6): remove widerruf references, § 312g, Verbraucher-Widerrufsrecht
   - Impressum session (file 8): remove widerruf link
   - Datenschutz session (file 7): remove widerruf processing references
   - Kontakt session (file 5): add B2B-only clarification
   - Notausgang session (file 4): add Widerruf vs Kündigung distinction

3. **Site content changes** (via mission workpiece, after all cross-page sessions complete):
   - Remove page entries from `system.md`, add `retiredRoutes` and `businessModel` fields
   - Remove navigation entries (DE + UK)
   - Remove labels `legalIds` entries (DE + UK)
   - Remove PBP date fields and site meta date fields
   - Delete page and prose files (8 files total)
   - Regenerate routes and public infrastructure

4. **Validation** (after step 3):
   - `b2b.model.validate --app warpgogol-com` passes (all checks blocking)
   - `redirect.map.validate --app warpgogol-com` passes (410 entries valid)
   - `content.references.validate --app warpgogol-com` passes (cross-page cleanup done in step 2)
   - `surface.contract.validate --app warpgogol-com` passes (Breaks-C acknowledged)

## Risks

- **Build breakage if rollout order is not followed.** `b2b.model.validate` is fully blocking. If route removal (step 3) is deployed before cross-page cleanup (step 2), the build will fail with B2B-PROSE-01/02 violations from AGB, Impressum, and Datenschutz. The rollout order in this RFC mandates cross-page cleanup first.

- **Agent misinterpretation risk.** An agent implementing this RFC might edit AGB/Impressum/Datenschutz directly, violating the nonGoals. The implementation notes explicitly forbid this, but agents should be reminded that cross-page cleanup is a separate set of sessions with their own expert-file briefs.

- **False positives in `b2b.model.validate`.** The B2B-LABEL-01 check matches "Widerruf" in navigation labels. A legitimate B2B navigation label like "Widerruf ausschließen" (exclusion of withdrawal right) could trigger a false positive. The check targets standalone "Widerruf" labels that link to a widerruf page, not inline prose mentions. If false positives occur, the check can be refined to match only `semanticTarget.pageId: widerruf` entries in navigation, not label text.

- **Search engine indexing.** The retired URLs were indexed. Returning 410 signals permanent removal. Search engines will deindex them over time. No redirect to a replacement page is offered (intentional — there is no replacement).

- **Legal review.** The expert recommends having a German lawyer review the AGB B2B-only formulation before publication. This is noted as a dependency for the AGB session (file 6), not this RFC.

- **External backlinks.** Any external sites linking to `/widerruf/` will get 410. This is the correct behavior — the content is gone by design.

## TypeScript contracts

```ts
// @gogol/ontology — systemManifestSchema additions

const retiredRouteSchema = z.object({
  slug: z.string().min(1),
  status: z.literal(410),
});

const businessModelSchema = z.enum(["b2b-only"]); // closed enum, future RFCs may add values

// Added to systemManifestSchema:
// retiredRoutes: z.array(retiredRouteSchema).optional().default([])
// businessModel: businessModelSchema.optional()

// @gogol/site-kernel-checks — b2b.model.validate output

interface B2bModelValidateData {
  command: "b2b.model.validate";
  status: "pass" | "fail";
  businessModel: "b2b-only" | undefined;
  violations: Array<{
    rule: "B2B-PAGE-01" | "B2B-ROUTE-01" | "B2B-CONFLICT-01" | "B2B-LABEL-01" | "B2B-PROSE-01" | "B2B-PROSE-02";
    file: string;
    message: string;
  }>;
  count: number;
}
```

## File system responsibilities

| Path | Role |
| --- | --- |
| `packages/ontology/src/schemas/system/manifest.ts` | Add `retiredRoutes` and `businessModel` fields to `systemManifestSchema` |
| `packages/os/site-kernel-codegen/src/app-boilerplate-helpers.ts` | Extend `buildRetiredSurfaceRedirectBlock` to read `retiredRoutes` and emit 410 entries |
| `packages/os/site-kernel-checks/src/b2b-model.ts` | New: `b2b.model.validate` command handler |
| `packages/os/site-kernel-checks/src/command-tables/*.ts` | Register `b2b.model.validate` command |
| `packages/os/site-kernel-checks/src/pipelines/sites-check-author.ts` | Add `b2b.model.validate` to author pipeline |
| `systems/warpgogol-com/src/content/system.md` | Remove widerruf/musterWiderruf pages, add `retiredRoutes` and `businessModel` |
| `systems/warpgogol-com/src/content/navigation/de/navigation.md` | Remove widerruf/musterWiderruf nav entries |
| `systems/warpgogol-com/src/content/navigation/uk/navigation.md` | Remove widerruf/musterWiderruf nav entries |
| `systems/warpgogol-com/src/content/site/de/labels.md` | Remove widerruf/musterWiderruf from `legalIds` |
| `systems/warpgogol-com/src/content/site/uk/labels.md` | Remove widerruf/musterWiderruf from `legalIds` |
| `systems/warpgogol-com/src/content/site/de/meta.md` | Remove `widerrufCreationDate`, `widerrufFormCreationDate` |
| `systems/warpgogol-com/src/content/business-profile/de/documents/terms.md` | Remove `widerrufCreationDate`, `widerrufFormCreationDate` |
| `systems/warpgogol-com/src/content/pages/de/widerruf.md` | Delete |
| `systems/warpgogol-com/src/content/pages/uk/widerruf.md` | Delete |
| `systems/warpgogol-com/src/content/pages/de/muster-widerruf.md` | Delete |
| `systems/warpgogol-com/src/content/pages/uk/muster-widerruf.md` | Delete |
| `systems/warpgogol-com/src/content/prose/de/widerruf.md` | Delete |
| `systems/warpgogol-com/src/content/prose/uk/widerruf.md` | Delete |
| `systems/warpgogol-com/src/content/prose/de/muster-widerruf.md` | Delete |
| `systems/warpgogol-com/src/content/prose/uk/muster-widerruf.md` | Delete |
| `docs/requirements.xml` | Document `businessModel` and `retiredRoutes` fields |
| `docs/technology.xml` | Add `b2b.model.validate` to command surface |
| `packages/os/site-kernel-checks/AGENTS.md` | Document `b2b.model.validate` command |

## Failure modes

| Condition | Behavior |
| --- | --- |
| `businessModel` absent from `system.md` | `b2b.model.validate` exits 0 (no-op) |
| `businessModel: b2b-only` but `pageId: widerruf` in `pages[]` | B2B-PAGE-01 violation, exit 1 |
| B2C slug in `pages[]` routes | B2B-ROUTE-01 violation, exit 1 |
| B2C slug in both `pages[]` and `retiredRoutes` | B2B-CONFLICT-01 violation, exit 1 |
| "Widerruf" in navigation labels linking to widerruf page | B2B-LABEL-01 violation, exit 1 |
| § 312g BGB reference in prose | B2B-PROSE-01 violation, exit 1 |
| "Verbraucher-Widerrufsrecht" in prose | B2B-PROSE-02 violation, exit 1 |
| `retiredRoutes` slug not in `_redirects` output | `redirect.map.validate` REDIR-05 (existing) |

## Compass sync

This RFC adds new schema fields (`retiredRoutes`, `businessModel`) to `systemManifestSchema` in `@gogol/ontology` — a shared package contract change. The following Compass documents need synchronization:

- `docs/requirements.xml` — document `businessModel` and `retiredRoutes` fields
- `docs/technology.xml` — add `b2b.model.validate` to the command surface
- `packages/os/site-kernel-checks/AGENTS.md` — document `b2b.model.validate` in the command table

## Acceptance criteria

- [x] `pageId: widerruf` and `pageId: musterWiderruf` are absent from `system.md` (evidence: workpiece src/content/system.md — page entries removed, commit 3894)
- [x] `/widerruf/` and `/widerruf-formular/` return HTTP 410 (not 200, not 404) (evidence: workpiece public/_redirects:17-18 — `/widerruf/* / 410`, `/widerruf-formular/* / 410`)
- [x] `/vidmova/` and `/forma-vidmovy/` return HTTP 410 (evidence: workpiece public/_redirects:15-16 — `/vidmova/* / 410`, `/forma-vidmovy/* / 410`)
- [x] No `widerruf` or `musterWiderruf` entries in navigation (DE + UK) (evidence: workpiece src/content/navigation/{de,uk}/navigation.md — entries removed, commit 3894)
- [x] No `widerruf` or `musterWiderruf` entries in `legalIds` (DE + UK) (evidence: workpiece src/content/site/{de,uk}/labels.md — legalIds entries removed, commit 3894)
- [x] `widerrufCreationDate` and `widerrufFormCreationDate` absent from PBP terms and site meta (evidence: workpiece src/content/site/de/meta.md and business-profile/de/documents/terms.md — fields removed, commit 3894)
- [x] 8 page/prose files deleted (DE + UK × widerruf + muster-widerruf) (evidence: workpiece — 8 files deleted via rm, commit 3894)
- [x] `b2b.model.validate --app warpgogol-com` exits 0 (evidence: `pnpm exec werkstatt run b2b.model.validate --site warpgogol-com --root missions/warpgogol-com-m000010/workpiece --json` — status: pass, count: 0)
- [x] `redirect.map.validate --app warpgogol-com` exits 0 (evidence: `pnpm exec werkstatt run redirect.map.validate --site warpgogol-com --root missions/warpgogol-com-m000010/workpiece --json` — status: pass)
- [x] `surface.contract.validate --app warpgogol-com` exits 0 (with `breaksC: true` acknowledged) (evidence: `pnpm exec werkstatt run surface.contract.validate --site warpgogol-com --root missions/warpgogol-com-m000010/workpiece --json` — exitCode: 0, RFC frontmatter breaksC: true)
- [x] `retiredRoutes` field in `system.md` lists all four retired slugs with `status: 410` (evidence: workpiece src/content/system.md:6-14 — retiredRoutes with widerruf, widerruf-formular, vidmova, forma-vidmovy, all status: 410)
- [x] `businessModel: b2b-only` declared in `system.md` (evidence: workpiece src/content/system.md:5 — businessModel: b2b-only)
- [x] Cross-page cleanup sessions (expert files 4-8) completed before route removal deployment (evidence: commits c1ef and 3894 — widerruf references removed from AGB DE, Impressum DE, consent funnel; AGB UK and Impressum UK already clean from enhance-site-pages mission)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Platform changes (packages/*) must be implemented and tested before site content changes.
- Site content changes must be applied through a mission workpiece (RFC-0480), not direct edits to the cache clone.
- The `retiredRoutes` field is the declarative audit trail — do not hardcode 410 entries in the `_redirects` template.
- Cross-page link cleanup (AGB, Impressum, Datenschutz) is explicitly deferred — do not edit those pages in this RFC's implementation session.
- The `b2b.model.validate` command should be added to `sites-check-author` pipeline for all apps (no-op when `businessModel` is absent).
- `b2b.model.validate` is fully blocking — all checks are errors. There is no advisory mode.
- Cross-page cleanup (expert files 4-8) MUST complete before route removal is deployed, or the build will break.
- The `businessModel` field is a closed enum with a single value `b2b-only`. Future RFCs may add values (`b2c`, `marketplace`) as needed.
- The `retiredRoutes` field is the declarative audit trail — do not hardcode 410 entries in the `_redirects` template.
- `b2b.model.validate` is a new command, not a flag on `system.manifest.validate`, because it checks cross-cutting content semantics beyond manifest structure.
