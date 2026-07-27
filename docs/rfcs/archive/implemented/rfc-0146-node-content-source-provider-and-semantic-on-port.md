---
id: RFC-0146
title: "Node-side Content Source Provider and semantic readers on the port"
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
  - DNA-25
  - RFC-0045
  - RFC-0050
  - RFC-0141
  - RFC-0144
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
  - "@gogol/content-source"
  - "@gogol/share"
  - "@gogol/business"
  - "@gogol/site-kernel-content"
  - "@gogol/site-kernel-checks"
successSignals:
  - "A node (non-Astro) fs ContentSourceProvider implements getEntry/listEntries/body over the filesystem."
  - "ContentEntry exposes body for body-bearing domains; both adapters populate it."
  - "Both RFC-0144 semantic readers are backed by a ContentSourceProvider — the reader seam becomes a thin provider binding."
  - "Content-reference substitution (RFC-0045) is applied consistently by both paths; the one intended byte change (JSON-LD now resolves refs) is captured by semantic.parity."
nonGoals:
  - "Do not ship a CMS adapter — fs only, this completes RFC-0141 for the node side."
  - "Do not introduce SSR or live fetch — providers stay build-time."
  - "Do not change the on-disk content format or the {lang}/{slug} id scheme."
  - "Do not move system.md into a provider — it stays engineering-owned (RFC-0141)."
  - "Do not change the SemanticPageModel shape."
---

# RFC-0146: Node-side Content Source Provider and semantic readers on the port

## Context

RFC-0144 consolidated the two per-page semantic builders (Astro JSON-LD path, disk llms path) into one framework-agnostic builder, `buildSemanticPageModelWith(reader, args)` in `@gogol/share/semantic`, parameterized by a small `SemanticContentReader` seam. It deliberately stopped short of routing those readers through the RFC-0141 Content Source Provider (CSP) because two prerequisites were missing:

1. **No node provider.** RFC-0141 Phase 0 shipped the port _types_, the Astro loader factory, the asset resolver, and an `astro:content`-bound `fsContentProvider` ([astro.ts](../../packages/content-source/src/astro.ts)). It did **not** ship a Node/filesystem `ContentSourceProvider` — and `llms.generate` runs in Node, where `astro:content` is unavailable.
2. **No body access.** `ContentEntry` exposes frontmatter `data` only; the semantic builder needs prose **body** text.
3. **Substitution divergence.** The disk reader applies RFC-0045 content-reference substitution (`{business.*}`) to prose bodies; the Astro reader returns raw body. The two AI/structured-data consumers therefore disagree on this content.

RFC-0144's reader seam is the explicit adapter point these providers were meant to back. This RFC supplies the missing node provider and body access, routes both readers through the port, and reconciles the substitution divergence — completing RFC-0141 for the semantic layer.

## Problem

The unprotected invariant is:

> "Where content comes from" must be one named port with a working adapter on every runtime the platform uses (Astro render and Node CLI), and the same content must resolve to the same bytes regardless of which consumer reads it.

Current failure modes:

1. **Port has no node implementation.** Any Node-side reader (llms, future exports, audits) must re-read the filesystem directly instead of through the CSP, defeating RFC-0141's seam exactly where a CMS swap would matter most.
2. **Body is a side-channel.** Prose body is read outside the port (fs `readFile` / astro `entry.body`), so a CMS adapter's rich-text bridge has nowhere to plug in.
3. **Two consumers, two truths.** JSON-LD shows literal `{business.legal.companyName}` where llms shows the resolved value. This is a latent correctness bug, not just a refactor smell.

## Decision

1. **`ContentEntry.body?`** — add an optional `body: string` to the port ([types.ts](../../packages/content-source/src/types.ts)). Populated for body-bearing domains (prose); undefined elsewhere. The Astro adapter fills it from `entry.body`; the node adapter from the markdown body after frontmatter.

2. **Node fs provider** — add `createNodeFsContentProvider({ contentDir, defaultLang })` to `@gogol/content-source` (a node-only entry, no `astro:content` import) that implements `ContentSourceProvider`:
   - `getEntry({ domain, id })` reads `contentDir/<domain>/<id>.md`, parses frontmatter + body, applies the `{lang}/{slug}` id scheme and default-lang fallback (the behavior `loadSemanticSiteModel` has today).
   - `listEntries(domain, lang)` globs the domain directory.
   - `resolveAsset` is a build-time no-op for now (parity with the Astro adapter, which already defers assets to the UI call site).

3. **Readers become provider bindings.** The two RFC-0144 readers (`createFsSemanticReader`, `astroSemanticReader`) are reimplemented as thin bindings over a `ContentSourceProvider`: `getPageFrontmatter` → `getEntry(...).data`, `getProseBody` → `getEntry({domain:"prose",...}).body` (+ substitution, see below), `getFaqEntries` → `listEntries("business", lang)` filtered to `faq/*`. The disk path binds the node provider; the Astro path binds `fsContentProvider`.

4. **Reconcile substitution (the one intended byte change).** Content-reference substitution (RFC-0045) is applied **consistently by both paths** — canonical behavior = _substitute_. This resolves the latent bug: JSON-LD stops emitting literal `{business.*}` tokens and shows resolved values, matching llms. The substitution step is owned by a shared helper invoked by both reader bindings (the node side already has `substituteContentReferences`; the Astro side gains an equivalent over the provider). This is the **only** intended output change; it is asserted explicitly by `semantic.parity` (llms unchanged; JSON-LD changes only where an unresolved `{business.*}` token previously leaked).

5. **`semantic.parity` validator** — snapshots llms output and per-page JSON-LD, then asserts: llms is byte-identical, and JSON-LD differs only by resolved content references. A rollout gate, retired once stable (like `content.source.parity`).

## Architectural fit

**RFC-0141 / CSP.** Completes the port: a working adapter now exists for both runtimes, and `body` closes the one capability gap a CMS rich-text bridge needs.

**RFC-0144 / reader seam.** Fulfills its stated staging — the seam's implementations become provider bindings; the builder is unchanged.

**RFC-0045 / content references.** Promotes substitution from a disk-only step to a consistent, port-level concern, fixing the JSON-LD leak.

**RFC-0050 / llms.** `loadSemanticSiteModel` keeps its signature; internally it constructs the node provider and binds the reader.

**DNA-25 / thin delivery.** The provider lives in `@gogol/content-source`; the builder stays pure in `@gogol/share`; commands/apps only wire.

## Design

### Port additions

```ts
// @gogol/content-source/types.ts
export interface ContentEntry {
  id: string;
  domain: ContentDomain;
  data: Record<string, unknown>;
  body?: string; // RFC-0146: raw body for body-bearing domains (prose).
}
```

```ts
// @gogol/content-source/adapters/fs/node-provider.ts (new, node-only — no astro:content)
export function createNodeFsContentProvider(opts: {
  contentDir: string;
  defaultLang: string;
}): ContentSourceProvider;
```

The node provider is exported from a node-safe entry (not the astro barrel) so `@gogol/site-kernel-content` can import it without pulling `astro:content`.

### Reader bindings

```ts
// shared helper (node + astro), provider-driven
function createProviderReader(
  provider: ContentSourceProvider,
  opts: { defaultLang: string; substitute: (raw: string, lang: string) => Promise<string> },
): SemanticContentReader;
```

`substitute` is the RFC-0045 step; both call-sites pass an implementation so the behavior is identical. (The node side wraps `substituteContentReferences`; the Astro side wraps an equivalent that resolves `{business.*}` from the provider's business entries.)

### File responsibilities

| Path | Role |
| --- | --- |
| `packages/content-source/src/types.ts` | Add `ContentEntry.body?`. |
| `packages/content-source/src/adapters/fs/node-provider.ts` | New node fs provider (getEntry/listEntries/body). |
| `packages/content-source/src/astro.ts` | Populate `body` from `entry.body`. |
| `packages/content-source/src/index.ts` | Export the node provider (node-safe). |
| `packages/share/src/semantic/build-page.ts` | Unchanged (already reader-driven). |
| `packages/os/site-kernel-content/src/semantic-loader.ts` | Bind node provider → reader. |
| `packages/business/src/semantic-model.ts` | Bind `fsContentProvider` → reader. |
| `packages/os/site-kernel-checks/src/semantic-parity.ts` | New `semantic.parity` validator. |

## Failure modes

- **Provider entry missing** → `getEntry` returns null → page skipped (today's behavior).
- **Body requested for a frontmatter-only domain** → `body` undefined → empty string (today's behavior for missing prose).
- **Substitution surfaces a new value in JSON-LD** → expected; `semantic.parity` classifies it as an allowed ref-resolution diff, not a regression.

## Rollout

1. **Phase 1 — body + astro provider.** Add `ContentEntry.body?`; populate it in `fsContentProvider`. No behavior change yet.
2. **Phase 2 — node provider.** Implement and unit-test `createNodeFsContentProvider` against an app's content; assert getEntry/body parity with the current disk reads.
3. **Phase 3 — bind disk reader.** Reimplement `createFsSemanticReader` over the node provider; `semantic.parity` must show llms byte-identical.
4. **Phase 4 — bind Astro reader + substitution.** Reimplement `astroSemanticReader` over `fsContentProvider` and apply substitution; `semantic.parity` shows JSON-LD differing only by resolved refs. Review and accept that diff.
5. **Phase 5 — gate + cleanup.** Add `semantic.parity` to the check pipeline; retire snapshots once stable.

## Alternatives considered

**Keep the RFC-0144 reader seam as the permanent abstraction.** Rejected. The seam works but is a second, semantic-only port; RFC-0141 already defines the canonical one. Two ports for "where content comes from" is the duplication this line of work is removing.

**Leave substitution divergent (astro raw, disk substituted).** Rejected. It is a latent correctness bug — JSON-LD can ship literal `{business.*}` tokens to search engines. Reconciling is the point.

**Substitute nowhere (drop RFC-0045 in the semantic layer).** Rejected. llms would regress to literal tokens; substitution is desired, just inconsistently applied today.

## Risks

**JSON-LD output change.** Resolving refs changes rendered JSON-LD bytes where a token previously leaked. Mitigation: `semantic.parity` makes the diff explicit and reviewable; the change is a fix, not a regression.

**Node provider divergence from disk reads.** A subtly different id scheme/fallback would break llms parity. Mitigation: Phase 2 unit parity + Phase 3 `semantic.parity` gate before the disk reader switches.

**astro:content body shape.** `entry.body` availability varies by collection config. Mitigation: narrow defensively (the disk path is the source of truth; the astro adapter falls back to empty when body is absent, as today).

## Acceptance criteria

- [x] `ContentEntry.body?` added; both adapters populate it. (evidence: implemented historically)
- [x] `createNodeFsContentProvider` implements the port over fs with the `{lang}/{slug}` scheme + default-lang fallback, exported node-safe. (evidence: implemented historically)
- [x] `createFsSemanticReader` reads page frontmatter + prose body through the node provider; the Astro reader reads body via the port (`getEntry().body`). (evidence: implemented historically)
- [x] `semantic.parity` shows llms byte-identical. JSON-LD already carried no literal `{business.*}` tokens (the Astro content layer resolves at load), so there was no substitution diff to reconcile. (evidence: implemented historically)
- [x] `pnpm build` green for both apps (24/24). (evidence: implemented historically)
- [x] `rfc.validate` passes. (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has `status: accepted`.
- Agents MUST NOT change status fields in any RFC.
- Agents MUST keep the node provider free of `astro:content`; export it from a node-safe entry so `@gogol/site-kernel-content` does not transitively import Astro.
- Agents MUST keep `buildSemanticPageModelWith` unchanged — only the reader construction moves onto the provider.
- Agents MUST gate the substitution reconciliation behind `semantic.parity` and review the JSON-LD diff before accepting.
- When implementing, agents MUST reference `RFC-0146` in commits / PRs.
