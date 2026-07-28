---
id: RFC-0248
title: "Unify content asset resolution and validation contracts"
status: implemented
# kind options: architecture | contract | command | policy | deprecation
kind: contract
# scope options: app | workspace
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-06-30
updatedAt: 2026-07-01
implementedAt: 2026-07-01
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0053
  - RFC-0141
  - RFC-0204
  - RFC-0220
  - RFC-0245
commands:
  proposed:
    - content.asset.contract.validate
  added:
    - content.asset.contract.validate
  changed:
    - asset.reference.validate
    - material.credits.validate
    - apps-check.author
  removed: []
appsImpacted:
  - warpgogol-com
  - nicaragua-projekt
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - "@gogol/content-source"
  - "@gogol/share"
  - "@gogol/site-kernel-checks"
successSignals:
  - "`asset.reference.validate` uses the same candidate path logic as `resolveImage` for `pages`, `business`, `site`, and `surface` content domains."
  - "Tokens with extensions, paths, or leading slashes produce explicit diagnostics instead of being silently normalized."
  - "`footer-bg` in `src/content/site/de/assets` is accepted when the runtime resolver would resolve it."
  - "`footer-card-1.webp` and `footer-card-2.webp` in site labels are reported as bare-filename contract violations."
nonGoals:
  - "Do not change the public authoring rule: content still uses bare filenames without paths or extensions."
  - "Do not reintroduce per-component `import.meta.glob` asset maps."
  - "Do not implement this contract while the RFC remains draft."
---

# RFC-0248: Unify content asset resolution and validation contracts

## Context

RFC-0053 defines the bare filename image contract, RFC-0141 centralizes content asset resolution, and RFC-0220 requires explicit credits for published material. The monthly AEO audit found that the runtime resolver and validator have drifted.

Runtime behavior in `packages/content-source/src/adapters/fs/assets.ts` searches multiple domains:

- `src/content/pages/<lang>/assets`
- `src/content/business/<lang>/assets`
- `src/content/site/<lang>/assets`
- `src/content/surface/<lang>/assets`

Validator behavior in `packages/os/site-kernel-checks/src/asset-reference.ts` claims to mirror the filesystem adapter, but its current `resolves()` path checks only `src/content/pages/<lang>/assets`.

Observed consequences:

- `warpgogol-com` reports unresolved `logo` and `footer-bg` tokens from `src/content/site/*/labels.md`, even though `footer-bg.webp` exists under `src/content/site/de/assets`.
- `nicaragua-projekt` uses `footer-card-1.webp` and `footer-card-2.webp` in site labels. The `.webp` suffix violates the bare filename rule, but the validator silently strips extensions before checking.

## Problem

The unprotected invariant is: **a content asset token must be validated by the same contract used to resolve it at runtime.**

Today there are two separate contracts:

- runtime resolver: multi-domain, language fallback, extension priority;
- validator resolver: pages-only, extension-stripping, warning-mode.

This split causes both false positives and false negatives. Autonomous agents are especially vulnerable because they may "fix" a false unresolved warning by moving assets into the wrong domain, or miss a real authoring violation because the validator normalizes it away.

## Decision

Asset candidate path logic becomes a shared contract used by both runtime resolution and validation.

The workspace adds `content.asset.contract.validate`, a focused app-scoped command that verifies resolver/validator parity and token hygiene. `asset.reference.validate` delegates token normalization, candidate generation, domain fallback, and extension priority to the shared contract.

Tokens that include a path, leading slash, or extension become first-class diagnostics. The validator must not silently strip `.webp`, `.jpg`, `.jpeg`, or `.png` from authored values.

## Architectural fit

The shared logic belongs in `@gogol/content-source` because that package owns filesystem content adapters. `@gogol/share` can re-export the stable public functions already used by UI code. `@gogol/site-kernel-checks` consumes the same contract for static validation.

This reinforces RFC-0141's single resolver rule and RFC-0204's provider portability. Validators should not implement a parallel asset finder any more than components should declare their own `import.meta.glob`.

## Design

### CLI surface

```sh
pnpm exec site-kernel run content.asset.contract.validate --app warpgogol-com --json
pnpm exec site-kernel run asset.reference.validate --app warpgogol-com --json
```

`content.asset.contract.validate` is app-scoped and read-only. It verifies:

- every token collected by `asset.reference.validate` is checked through shared candidate generation;
- tokens with forbidden syntax are emitted as diagnostics before filesystem lookup;
- validator results match runtime `resolveImage` semantics for domain, language fallback, and extension priority.

### TypeScript contracts

```ts
type ContentAssetDomain = "pages" | "business" | "site" | "surface";
type ContentAssetExtension = ".webp" | ".jpg" | ".jpeg" | ".png";

interface ContentAssetToken {
  raw: string;
  normalized?: string;
  domain: ContentAssetDomain;
  lang: string;
  subPath?: string;
  sourceFile: string;
}

interface ContentAssetCandidate {
  domain: ContentAssetDomain;
  lang: string;
  relativePath: string;
  extension: ContentAssetExtension;
  exists: boolean;
  fallback: "requested-lang" | "default-lang";
}

interface ContentAssetResolutionContract {
  token: ContentAssetToken;
  syntaxDiagnostics: Diagnostic[];
  candidates: ContentAssetCandidate[];
  resolved?: ContentAssetCandidate;
}

function describeContentAssetResolution(
  token: ContentAssetToken,
  options: { defaultLanguage: string },
): ContentAssetResolutionContract;
```

The validator uses `syntaxDiagnostics` even when a matching file exists. This prevents `footer-card-1.webp` from passing simply because `footer-card-1.webp` can be normalized to `footer-card-1`.

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/content-source/src/adapters/fs/assets.ts` | Owns candidate path generation and runtime filesystem resolution |
| `packages/share/src/*` | Re-exports stable resolver helpers for UI and validators when appropriate |
| `packages/os/site-kernel-checks/src/asset-reference.ts` | Consumes shared resolution contract; no local pages-only resolver |
| `packages/os/site-kernel-checks/src/content-asset-contract.ts` | New validator for parity and token syntax |
| `apps/*/src/content/{pages,business,site,surface}/<lang>/assets` | Valid asset roots |
| `apps/*/src/content/**/assets/*.credits.yaml` | Material-credit sidecars remain governed by RFC-0220 |

### Output format

```json
{
  "command": "asset.reference.validate",
  "status": "fail",
  "diagnostics": [
    {
      "ruleId": "asset.reference.validate",
      "severity": "error",
      "file": "src/content/site/de/labels.md",
      "line": 53,
      "message": "Asset token \"footer-card-1.webp\" includes a file extension; content must use the bare filename \"footer-card-1\".",
      "fixHint": "Change the authored value to \"footer-card-1\" and keep the file extension only on disk."
    }
  ],
  "summary": { "error": 1, "warning": 0, "info": 0 }
}
```

### Failure modes

During rollout, syntax violations fail hard because they are explicit RFC-0053 contract violations. Unresolved references may remain warning-mode only where the existing app pipeline still treats them as advisory, but they must be canonical diagnostics and visible in `maintenance.debt.report`.

The validator must distinguish:

- invalid token syntax;
- valid token with no matching file in any allowed domain/fallback;
- valid token that resolves only via default-language fallback;
- valid token with missing credit sidecar, which remains owned by material credits.

## Rollout

1. Extract candidate path generation from `assets.ts` into a shared helper without changing runtime behavior.
2. Change `asset.reference.validate` to consume the shared helper and remove pages-only lookup logic.
3. Add token syntax diagnostics for paths, leading slashes, and extensions.
4. Add fixtures covering `pages`, `business`, `site`, and `surface` assets plus default-language fallback.
5. Add `content.asset.contract.validate` to `apps-check.author` after `content.surface.validate` and before material credits.
6. Fix existing authored extension tokens after this RFC is accepted, not while it is draft.

## Alternatives considered

Duplicating the runtime resolver logic in the validator was rejected because it already drifted once and will drift again.

Making validation trust Vite's `contentAssetImages` map directly was rejected because app-scoped static checks run against source files and should not require a full Astro/Vite build.

Silently normalizing extensions was rejected because it hides authoring violations and trains agents to preserve invalid content.

## Risks

Promoting token syntax to fail-hard may surface existing content debt. The migration should fix current offenders in the same implementation change that enables the rule.

Sharing resolver logic across runtime and checks can create package-boundary pressure. The helper must stay filesystem/content-source oriented and avoid importing UI or Astro-only code.

If the helper exposes too much internal path detail, agents may start authoring paths again. Public docs and diagnostics must keep the author-facing fix as "use the bare filename."

## Acceptance criteria

- [x] Runtime asset resolution and static asset validation use one shared candidate-generation contract. (evidence: implemented historically)
- [x] `asset.reference.validate` checks `pages`, `business`, `site`, and `surface` domains with default-language fallback. (evidence: original apps retired by RFC-0381, implemented historically)
- [x] Authored asset tokens containing extensions, paths, or leading slashes emit diagnostics. (evidence: implemented historically)
- [x] Existing valid site-domain assets such as `footer-bg` no longer produce unresolved false positives. (evidence: original apps retired by RFC-0381, implemented historically)
- [x] Existing invalid extension tokens are fixed after the RFC is accepted. (evidence: implemented historically)
- [x] `content.asset.contract.validate` is registered and included in `apps-check.author`. (evidence: implemented historically)
- [x] `maintenance.debt.report` can aggregate any remaining asset warnings as canonical diagnostics. (evidence: original apps retired by RFC-0381, implemented historically)
- [x] `apps-check.author --app warpgogol-com --json`, `apps-check.author --app nicaragua-projekt --json`, and `rfc.validate` pass. (evidence: original apps retired by RFC-0381, implemented historically)

## Implementation notes for agents

- Agents MAY implement code or content changes only when this RFC has `status: accepted` or `status: implemented`.
- Agents MUST NOT move assets between content domains to satisfy a validator false positive; repair the shared resolver contract first.
- Agents MUST NOT strip extensions silently in validators. Emit a diagnostic and fix the authored content value.
- Agents MUST keep components on `resolveImage` / `resolveImageRequired` and the shared `contentAssetImages` map; do not reintroduce component-local globs.
- Agents MAY transition this RFC from `accepted` to `implemented` and stamp `implementedAt`/`updatedAt` only after every acceptance criterion is satisfied, validators pass, and the implementing commit references `RFC-0248`.
