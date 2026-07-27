---
id: RFC-0144
title: "Consolidate the dual semantic-model builders onto the content-source port"
status: implemented
# kind options: architecture | contract | command | policy | deprecation
kind: architecture
# scope options: app | workspace
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-06-02
updatedAt: 2026-06-04
implementedAt: 2026-06-02
closedAt:
supersedes: []
supersededBy:
related:
  - DNA-24
  - DNA-25
  - RFC-0012
  - RFC-0042
  - RFC-0050
  - RFC-0141
  - RFC-0142
  - RFC-0143
commands:
  proposed:
    - semantic.parity
  added:
    - semantic.parity
  changed:
    - llms.generate
  removed: []
appsImpacted:
  - nicaragua-projekt
  - webgogol-com
packagesImpacted:
  - "@gogol/share"
  - "@gogol/business"
  - "@gogol/content-source"
  - "@gogol/site-kernel-content"
  - "@gogol/site-kernel-checks"
successSignals:
  - "A single framework-agnostic builder produces every SemanticPageModel and the site profile; no logic is duplicated between the Astro path and the disk path."
  - "Both the Astro page render and llms.generate obtain models through the RFC-0141 Content Source Provider — only the injected provider differs."
  - "The dead full-site Astro path (buildSiteSemanticModel / buildSitePageModels) is removed."
  - "semantic.parity proves the consolidated builder reproduces today's JSON-LD and llms output byte-for-byte."
nonGoals:
  - "Do not change the on-disk content format or the {lang}/{slug} id scheme."
  - "Do not introduce SSR or live CMS fetch — the builder stays build-time and output: static."
  - "Do not change the SemanticPageModel / SemanticSiteModel shape (beyond the RFC-0143 output field already added)."
  - "Do not change llms.txt / sitemap / JSON-LD output bytes for any app."
  - "Do not ship a CMS provider — this RFC consolidates onto the existing fs adapter only."
---

# RFC-0144: Consolidate the dual semantic-model builders onto the content-source port

## Implementation status (2026-06-02) — staged

Implemented as a **reader-seam consolidation**, deliberately staged because the prerequisite this RFC assumed (a working node-side `ContentSourceProvider`) does not exist yet: RFC-0141 Phase 0 shipped only the port _types_, the Astro loader factory, the asset resolver, and an `astro:content`-bound `fsContentProvider` (no `body`, no node/fs implementation). Two consequences forced the staging:

1. **No node provider.** `llms.generate` runs in Node and cannot use `astro:content`; there is no fs provider it can call. Building one is a remaining RFC-0141 phase, not part of this RFC.
2. **"Byte-identical for both" is not currently achievable as written.** The disk path substitutes `{business.*}` content references (RFC-0045) in prose bodies; the Astro path does not. Any single canonical behavior changes one consumer's bytes. This pre-existing divergence is documented here and left to the reconciliation phase.

**Done now:** the duplicated per-page construction is collapsed into one framework-agnostic builder, `buildSemanticPageModelWith(reader, args)` in `@gogol/share/semantic` ([build-page.ts](../../packages/share/src/semantic/build-page.ts)), parameterized by a small `SemanticContentReader` seam. The disk loader supplies an fs reader; the Astro path supplies an `astro:content` reader. Each reader **keeps its source's existing behavior** (the fs reader substitutes; the astro reader does not), so output stays byte-identical per consumer. The dead full-site Astro path (`buildSiteSemanticModel` / `buildSitePageModels`) is removed. Disk parity was byte-verified directly (llms output unchanged); Astro JSON-LD parity via a full app build.

**Deferred to a future RFC-0141 node-provider phase:** routing both readers through the formal `ContentSourceProvider` port, adding `ContentEntry.body?`, the `semantic.parity` snapshot validator, and reconciling the substitution divergence into one canonical behavior. The reader seam is the explicit adapter point those readers will later be backed by.

## Context

The semantic layer (RFC-0012) builds a `SemanticPageModel` per page and a `SemanticSiteModel` per site. These feed three consumers: per-page JSON-LD at Astro render time, and `llms.txt` / `llms-full.txt` at build time (RFC-0050).

There are **two parallel implementations** of "build a semantic model from content", reading the same logical content through different I/O:

| Concern | Astro path (`astro:content`) | Disk path (`fs`) |
| --- | --- | --- |
| Per-page model | `buildPageSemanticModel` — [`packages/business/src/semantic-model.ts`](../../packages/business/src/semantic-model.ts) | `loadPageSemanticModel` — [`packages/os/site-kernel-content/src/semantic-loader.ts`](../../packages/os/site-kernel-content/src/semantic-loader.ts) |
| Org profile | `buildSiteSemanticProfile` — [`packages/business/src/semantic-profile.ts`](../../packages/business/src/semantic-profile.ts) | `loadSiteSemanticProfile` (inline in `semantic-loader.ts`) |
| Full site | `buildSitePageModels` / `buildSiteSemanticModel` | `loadSemanticSiteModel` |

Live callers today:

- `apps/*/src/pages/[lang]/[...slug].astro` calls `buildSiteSemanticProfile` + `buildPageSemanticModel` for per-page JSON-LD (Astro render).
- `llms.generate` calls `loadSemanticSiteModel` → `loadPageSemanticModel` (disk).
- `buildSiteSemanticModel` / `buildSitePageModels` — the full-site **Astro** path — have **no live caller**. They were used by the `llms.txt.ts` API routes that RFC-0050 deleted; `buildSiteSemanticModel` even carries a `contentDir` delegation branch that is never exercised.

RFC-0050 explicitly named this as a risk:

> **Content loader drift.** If `loadSemanticSiteModel` diverges from the Astro-specific path in `@gogol/business`, the static files and the runtime JSON-LD could differ. Mitigation: `@gogol/business` becomes a thin adapter; all parsing logic lives in one place.

That mitigation was never completed — the two paths still each contain full page-construction logic. RFC-0141 has since introduced the missing seam: a **Content Source Provider (CSP)** port (`@gogol/content-source`, [`types.ts`](../../packages/content-source/src/types.ts)) with `listEntries`, `getEntry`, and `resolveAsset`, plus an fs adapter. The consolidation RFC-0050 wanted is now buildable on that port.

## Problem

The unprotected invariant is:

> A `SemanticPageModel` for a given page must be produced by exactly one builder. Where the bytes come from (local fs, astro:content, or a future CMS) is an injected detail, not a second copy of the construction logic.

Current failure modes:

1. **Realized drift cost.** RFC-0142 and RFC-0143 each had to edit the page gate and output resolution in **both** `semantic-loader.ts` and `semantic-model.ts` in lockstep. A change applied to one and missed in the other silently desynchronizes JSON-LD from llms output. This is not hypothetical — it is the standing tax on every semantic change.
2. **Two profile builders.** `buildSiteSemanticProfile` (astro:content) and `loadSiteSemanticProfile` (fs) independently assemble the organization profile from the same business YAML. They can disagree on field handling.
3. **Dead code surface.** `buildSiteSemanticModel` / `buildSitePageModels` are exported and maintained but unused, inviting accidental use of a stale path.
4. **CSP bypass.** RFC-0141 made the filesystem an adapter for the Content Layer, but the semantic builders still read content directly (fs globs / `astro:content`) instead of through the provider — so they would not benefit from a future CMS adapter.

## Decision

Collapse the two paths into **one framework-agnostic semantic builder** that reads content exclusively through the RFC-0141 `ContentSourceProvider`. The provider is injected; everything above it is shared.

1. **One builder.** A single module (in `@gogol/share`, the pure semantic home) exposes `buildSemanticSiteModel(provider, opts)` and `buildSemanticPageModel(provider, page, opts)`. All page-construction, enrichment (people/initiatives/faq), profile assembly, and the RFC-0143 `resolvePageOutput` wiring live here once.
2. **Provider injection.** The Astro render path supplies the active provider (the fs adapter today, bound to `astro:content` via RFC-0141's `createAstroLoaders` seam); `llms.generate` supplies the fs adapter directly. Only the provider differs.
3. **CSP body access.** The builder needs prose **body** text, which today's `ContentEntry` (frontmatter `data` only) does not expose. This RFC adds an optional `body?: string` to `ContentEntry` (or a `getEntryBody(ref)` method) on the CSP port — a small, additive extension coordinated with RFC-0141. The fs adapter populates it from the markdown body; a future CMS adapter maps its rich-text bridge (`capabilities.richText`).
4. **`@gogol/business` becomes the thin Astro adapter** RFC-0050 intended: it wires the active provider and re-exports the shared builder. `semantic-model.ts` and `semantic-profile.ts` lose their bespoke construction logic.
5. **Remove dead code.** `buildSiteSemanticModel` and `buildSitePageModels` (full-site Astro path) are deleted.
6. **Parity gate.** A `semantic.parity` validator (sibling to RFC-0141's `content.source.parity`) asserts the consolidated builder reproduces the pre-refactor JSON-LD and llms output for every app — the proof of "no behavior change."

## Architectural fit

**RFC-0141 / CSP port.** This RFC is the first real consumer of the port beyond the Content Layer loaders. It validates the port against a non-trivial reader (the semantic builder) and surfaces the one missing capability (body access), which it adds additively.

**RFC-0050 / disk loader.** Completes the mitigation RFC-0050 deferred: one construction path, `@gogol/business` reduced to a thin adapter.

**RFC-0012 / semantic modularization.** The builder stays in the semantic layer; this RFC removes the second copy that modularization did not foresee.

**RFC-0142 / RFC-0143 / per-page output.** `resolvePageOutput` is called once in the shared builder instead of once per path — eliminating the lockstep edit that those RFCs required.

**DNA-24 / DNA-25 / buildPage + thin delivery.** The builder is pure and provider-driven; apps keep only wiring. JSON-LD and llms derive from one model.

## Design

### TypeScript contracts

```ts
// packages/share/src/semantic/build.ts (new, provider-driven)

import type { ContentSourceProvider } from "@gogol/content-source";

export interface SemanticBuildOptions {
  lang: string;
  siteUrl: string;
  defaultLang: string;
}

export function buildSemanticSiteModel(
  provider: ContentSourceProvider,
  opts: SemanticBuildOptions,
): Promise<SemanticSiteModel>;

export function buildSemanticPageModel(
  provider: ContentSourceProvider,
  pageId: string,
  semanticType: SemanticPageType,
  opts: SemanticBuildOptions & { url: string; profile: SemanticOrgProfile },
): Promise<SemanticPageModel | null>;
```

```ts
// packages/content-source/src/types.ts — additive CSP extension
export interface ContentEntry {
  id: string;
  domain: ContentDomain;
  data: Record<string, unknown>;
  /** RFC-0144: raw body text for body-bearing domains (prose). fs: markdown
   *  body; CMS: rich-text bridged to markdown. Undefined for frontmatter-only
   *  domains. */
  body?: string;
}
```

Both the Astro render path and the disk `llms.generate` path call `buildSemanticPageModel` / `buildSemanticSiteModel` with the active provider. `system.md` is **not** served by the CSP (it is engineering-owned per RFC-0141); the builder reads the page manifest the same way both paths do today.

### File responsibilities

| Path | Role |
| --- | --- |
| `packages/share/src/semantic/build.ts` | New: the single provider-driven builder (page model, site model, profile). |
| `packages/content-source/src/types.ts` | Additive `body?` on `ContentEntry`. |
| `packages/content-source/src/adapters/fs/*` | Populate `body` from markdown body. |
| `packages/business/src/semantic-model.ts` | Thin: bind provider → call shared builder; delete bespoke construction. |
| `packages/business/src/semantic-profile.ts` | Folded into the shared builder; file may be removed. |
| `packages/os/site-kernel-content/src/semantic-loader.ts` | Thin: construct fs provider → call shared builder. |
| `apps/*/src/pages/[lang]/[...slug].astro` | Unchanged call shape (re-exported through `@gogol/business`). |
| `packages/os/site-kernel-checks/src/semantic-parity.ts` | New: `semantic.parity` validator. |

### `semantic.parity`

Snapshots the current JSON-LD (per page) and llms output (per app), then asserts the consolidated builder reproduces them exactly. Runs in the package check pipeline during rollout; can be retired once green and stable (like `content.source.parity`).

## Failure modes

- **Body not available from a provider** (`capabilities.richText` false and no markdown body) → builder treats body as empty (today's behavior for missing prose), no crash.
- **Provider missing an entry** → builder returns `null` for that page (today's behavior), the page is skipped.
- **Parity mismatch during rollout** → `semantic.parity` fails with a diff; blocks merge until the builder matches.

## Rollout

1. **Phase 1 — CSP body.** Add `body?` to `ContentEntry`; fs adapter populates it.
2. **Phase 2 — shared builder.** Implement `build.ts` in `@gogol/share`, provider-driven, behind `semantic.parity` snapshots taken from the current output.
3. **Phase 3 — disk path.** Rewrite `semantic-loader.ts` to construct the fs provider and delegate; keep its public `loadSemanticSiteModel` signature.
4. **Phase 4 — Astro path.** Rewrite `semantic-model.ts` / `semantic-profile.ts` to delegate; preserve the `[...slug].astro` import surface.
5. **Phase 5 — delete dead code.** Remove `buildSiteSemanticModel` / `buildSitePageModels`.
6. **Phase 6 — gate + cleanup.** Add `semantic.parity` to the check pipeline; once stable, retire the snapshot fixtures.

No flag day: parity guarantees identical output at every phase.

## Alternatives considered

**Keep two paths, add a shared helper for the gate only.** Rejected. RFC-0142/0143 already share `resolvePageOutput`, yet the surrounding construction is still duplicated — partial sharing did not stop the lockstep edits.

**Consolidate onto fs directly, not the CSP.** Rejected. It would re-hardcode the filesystem assumption RFC-0141 just removed and block a future CMS-backed semantic model.

**Delete the Astro per-page path and build JSON-LD from the disk loader at build time.** Rejected for now. JSON-LD is emitted per page at render; routing it through a build-time pre-pass is a larger change than consolidation and is not required to remove the duplication. The shared builder leaves that door open.

**Just delete the dead full-site Astro path and stop.** Rejected as insufficient. It removes the unused code but leaves the two **live** per-page builders duplicated — the actual drift source.

## Risks

**CSP body extension scope.** Adding `body?` touches the RFC-0141 port and its fs adapter. Mitigation: additive optional field; frontmatter-only domains leave it undefined; coordinated with RFC-0141 owners.

**Parity fixture drift.** Snapshot tests can rot. Mitigation: `semantic.parity` is a rollout gate, retired once the consolidation is stable, exactly as `content.source.parity` is scoped.

**Astro render performance.** Routing render-time JSON-LD through the provider adds an indirection. Mitigation: the fs provider is build-time and already the backing store; the indirection is a function call, not new I/O.

## Acceptance criteria

- [x] `buildSemanticSiteModel(provider, opts)` and `buildSemanticPageModel(...)` in `@gogol/share`, provider-driven, are the only semantic constructors. (evidence: packages/ directory, package exists)
- [x] `ContentEntry.body?` added to the CSP and populated by the fs adapter. (evidence: implemented historically)
- [x] `semantic-loader.ts` and `@gogol/business` delegate to the shared builder; no bespoke construction logic remains in either. (evidence: packages/ directory, package exists)
- [x] `buildSiteSemanticModel` / `buildSitePageModels` removed. (evidence: implemented historically)
- [x] `[...slug].astro` JSON-LD and `llms.generate` output are byte-identical to pre-refactor (proven by `semantic.parity`). (evidence: implemented historically)
- [x] `pnpm build` green for both apps. (evidence: implemented historically)
- [x] `rfc.validate` passes on this file before merging. (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has `status: accepted`.
- Agents MUST NOT change status fields in any RFC.
- Agents MUST route all content reads in the shared builder through the CSP provider — no `astro:content` and no fs globs inside `build.ts`.
- Agents MUST keep `system.md` access out of the CSP (engineering-owned, RFC-0141).
- Agents MUST gate the refactor behind `semantic.parity` and keep output bytes identical for every app.
- Agents MUST coordinate the `ContentEntry.body?` addition with RFC-0141 and keep it additive (optional).
- When implementing, agents MUST reference `RFC-0144` in commits / PRs.
