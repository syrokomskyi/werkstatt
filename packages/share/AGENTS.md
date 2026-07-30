# `@warpgogol/share` — Agent Guide

This package contains **app-agnostic shared utilities** that every app in `apps/*` MUST use instead of re-implementing locally.

## What lives here

**RFC-0264: `@warpgogol/share` is split into domain subpath entry points — import the subpath, not the root barrel.** The root barrel (`@warpgogol/share`, `src/index.ts`) is a **deprecated compatibility surface**: it re-exports each unmigrated domain's subpath module unchanged so old imports keep working, but it is capped at a 120 export-line threshold (`barrel.size.lint`, BARREL-01) and MUST NOT re-export anything from a completed-wave domain (BARREL-02). Two domains have completed their migration wave and are **root-barrel-free** — `page` and `i18n` — always import them from their subpath.

| Entry point | Module | What it provides |
| --- | --- | --- |
| `@warpgogol/share/page` | `src/page.ts` | **Migration wave complete — NOT in the root barrel.** `buildPage`, `resolveComponentPath`, `resolveComponentPathUnified`, `PLANET_IMPORT_PATHS`, `MOON_IMPORT_PATHS`, `SectionProps`, `SectionPageOverride`, `PageEntry`, `BlockEntry`, `ResolvedBlock`, `ResolvedPage`, `BuildPageOptions`, `ShellBlockConfig`, `ShellConfig` |
| `@warpgogol/share/i18n` | `src/i18n/localization.ts` | **Migration wave complete — NOT in the root barrel.** `createLocalizationHelpers` factory |
| `@warpgogol/share/content` | `src/content/index.ts` | `toDataEntryId`, `getEntryLanguage`, `stripEntryLanguage`, `createDispatcherResolver<T>` (generic, merged from `dispatch.ts`), `deepMerge` (unified), `deepMergeEntryData`, `mergeComponentContent` (thin wrappers over `deepMerge`), `resolveFieldPath` |
| `@warpgogol/share/schemas` | `src/schemas/index.ts` | Base page schema + every RFC-0101..0106/0183/0202/0210/0220/0231/0257 canonical section-visual / section-content / media / material-credit / print schema. Also exports `recordClaimsSchema`, `claimAnnotationSchema` (RFC-0212), `claimRecordSchema`, `ClaimRecord` (RFC-0505) and `PERSON_AFFILIATIONS` (RFC-0200). |
| `@warpgogol/share/semantic` | `src/semantic/index.ts` | Full semantic layer — models, extract, JSON-LD, llms projections, page builders. `SemanticPageType` includes `"collection"` (RFC-0490: maps to `CollectionPage` JSON-LD + `ItemList` node). `SemanticPageModel` has optional `collectionItems: Array<{ url: string; name: string }>` populated by `resolve-route.ts` for collection-typed surface pages. RFC-0492/RFC-0498: `SemanticPageModel` carries optional `surfaceId`/`depth` for depth-gated JSON-LD corrections; `buildServiceNodes` suppresses org-level Service nodes for all surface pages and emits a single industry-specific Service node (`industryService` field, with optional `areaServed`) for website-local depth-1, website-service depth-1, and website-local depth-5 pages; no Service nodes are emitted for depth-0/2/3/4 (prohibited); org-level services ItemList is suppressed for all surface pages. RFC-0506: `SemanticPageModel` gains optional `authorRecord?: { name: string; contactUrl?: string }`, `reviewedAt?: string`, `changelog?: Array<{ date: string; summary: string; authorId: string }>` for ratgeber depth-1 Article JSON-LD; `buildArticleNode` uses `authorRecord` for structured Person (with `url`) and emits `mainEntityOfPage` as canonical URL string for ratgeber depth-1; `buildFaqNodes` suppresses FAQPage for ratgeber depth-1 (`surfaceId === "ratgeber" && depth === 1`). |
| `@warpgogol/share/knowledge` | `src/knowledge/index.ts` | RFC-0211 Content Knowledge Lifecycle (CKL) shared model |
| `@warpgogol/share/content-discipline` | `src/content-discipline/index.ts` | RFC-0073 content discipline contracts + parsers |
| `@warpgogol/share/legal` | `src/legal/translation-policy.ts` | RFC-0174 translated-legal-document binding policy |
| `@warpgogol/share/visibility` | `src/visibility.ts` | `VisibilityExprSchema`, `evalVisibility`, `EMPTY_FEATURE_GRAPH` |
| `@warpgogol/share/runtime-context` | `src/runtime-context.ts` | `RuntimeContext`, `EMPTY_RUNTIME_CONTEXT` |
| `@warpgogol/share/middleware` | `src/middleware/language-redirect.ts` | `createLanguageRedirectMiddleware` |
| `@warpgogol/share/scripts` | `src/scripts/index.ts` | `initLordIconOnDemand`, `runStandardLayoutOrchestration` |
| `@warpgogol/share/onboarding-yaml` | `src/onboarding-yaml/index.ts` | `parseOnboardingArtifactHeader`, `parseOnboardingArtifactPayload`, `RFC_METADATA_KEYS`, `RfcMetadataHeader` (RFC-0082) |
| `@warpgogol/share/image-provider` | `src/image-provider.ts` | **Image Provider Port (RFC-0152 + RFC-0204):** `ImageProvider` / `ImageDescriptor` / `ImageRequest` / `ImageSources` contracts; `cloudflareRuntimeProvider` (default, `/cdn-cgi/image` runtime resize); `buildImageSources`, `getDefaultImageProvider` / `setDefaultImageProvider`, `resolveImageQuality`, `candidateWidths`; **RFC-0204:** `ImageVariant` / `ImageVariantEntry` / `ImageVariantManifest` types + `createBuildPortableProvider(manifest)` factory for static pre-generated `srcset` |
| `@warpgogol/share/image-utils` | **Deleted** — re-export from `@warpgogol/content-source` directly. The root barrel still re-exports for compatibility. |
| `@warpgogol/share/entitlement` | `src/entitlement.ts` | RFC-0169 subscription entitlement catalog + reader |
| `@warpgogol/share/feature-policy` | `src/feature-policy.ts` | RFC-0183 feature policy runtime resolver. `resolveFeaturePolicy` is synchronous; `resolveFeaturePolicySync` is a thin alias. |
| `@warpgogol/share/counter-utils` | `src/counter-utils.ts` | `formatNumber`, `parseNumeric`, `getStartValue`, `resolveCounterStats` |
| `@warpgogol/share/dev-props-validator` | `src/dev-props-validator.ts` | RFC-0262 dev-only fail-fast prop validation hook (powered by `ajv`) |
| `@warpgogol/share/rfc0042-utils` | `src/rfc0042-utils.ts` | `need`, `cast`, `withDefault` (`NEED_THIS_*` markers, type casting) |
| `@warpgogol/share/wrap-inline-numbers` | `src/wrap-inline-numbers.ts` | SSR inline-number pre-wrap utility |
| `@warpgogol/share/text-normalize` | `src/text-normalize.ts` | RFC-0235 egress text normalizer. RFC-0569: `createDevNormalizeMiddleware` — dev-only Astro middleware factory for dev/prod egress parity |
| `@warpgogol/share/content-reference` | `src/content-reference.ts` | RFC-0527 content reference index resolver — `ContentRefIndex`, `loadContentRefIndex`, `getContentRefIndex`, `resolveReference`, `resolveReferencesInString`, `resolveReferencesDeep`, `EMPTY_CONTENT_REF_INDEX`. RFC-0570: `resolveReferencesInString` now handles `=(...)` formula expressions |
| `@warpgogol/share/shared-context` | `src/shared-context.ts` | RFC-0099 page-driven shared context fallback helpers |
| `@warpgogol/share/formula-eval` | `src/formula-eval.ts` | RFC-0570 formula evaluation — `extractNumeric`, `scanFormulas`, `resolveFormula`, `FormulaResolution` |
| `@warpgogol/share/redirects` | `src/redirects.ts` | RFC-0588 `_redirects` file parsing — `parseRedirectRules`, `RedirectRule` (extracted from `site-kernel-checks` by RFC-0588) |
| `@warpgogol/share/material-credits` | `src/material-credits.ts` | RFC-0220 material credit parsing, JSON-LD, `creditByTarget`. RFC-0488: `labelForSourceType`, `labelForStatus`, `labelForUsageBasis` label mapping helpers and `MaterialSourceType`, `MaterialCreditStatus`, `UsageBasisType` types. |
| `@warpgogol/share/attribution-display` | `src/attribution-display.ts` | RFC-0231 attribution visibility policy |
| `@warpgogol/share/string-utils` | `src/string-utils.ts` | `toKebabCase` |
| `@warpgogol/share/css-value-normalize` | `src/css-value-normalize.ts` | `normalizeCssValue` — shared CSS value normalizer (whitespace collapse, quote/hex/decimal normalization). Consumed by `biome.css.generate` (codegen) and `biome.tokens.validate` (drift detection). |
| `@warpgogol/share/astro` | `src/astro/content.ts` | `getComponentContent`, `getLayoutContent`. Site-content handler registry lives in `src/astro/site-content-handlers.ts` — add new component paths by registering a handler in `SITE_CONTENT_HANDLERS`. |
| `@warpgogol/share/astro/feature-graph`, `/astro/page-handler`, `/astro/loaders`, `/astro/surface-routes`, `/routes`, `/url-policy` | `src/astro/*.ts` | Astro-dependent content/route infrastructure. `astro/page-handler` now resolves directly to `src/astro/page-handler/resolve-route.ts` (shim deleted). |
| `@warpgogol/share/integration` | `src/integration/index.ts` | See "Integration hub" below |
| `@warpgogol/share` | `src/index.ts` | **Deprecated compatibility barrel.** Re-exports every domain above EXCEPT `page`, `i18n`, and `dev-props-validator` (Node-only — imports `node:fs/promises`, excluded to prevent browser bundle externalization). New code MUST use the subpath. |

**New domains added to `@warpgogol/share` MUST ship as a subpath from day one** — do not add a new file's exports to the root barrel; `barrel.size.lint` (BARREL-01) enforces the 120-line ceiling so growth has nowhere to hide.

## Rules for AI agents

> **STOP. Before writing entity-ID normalization, localization helpers, base page schemas, or onboarding YAML parsing in any `apps/*` or `packages/os/*` file — check this package first.**

- Do NOT copy `toDataEntryId`, `getEntryLanguage`, `stripEntryLanguage` into any app. They live in `@warpgogol/share/content`.
- Do NOT define a new `componentOverridesSchema` in any app. It lives in `@warpgogol/share/schemas`. App files that previously defined it must be thin proxies.
- Do NOT re-implement `isLanguageCode`, `getSupportedLanguageCodes`, `getLocalizedUrl` logic from scratch. Call `createLocalizationHelpers(LANGUAGE_MAPPING)` from `@warpgogol/share/i18n` and pass the app's own `LANGUAGE_MAPPING` constant.
- Do NOT copy `lordicon.ts`, `scheduler.ts`, `external-links.ts`, or `lenis.ts` logic into any app. Use `@warpgogol/share/scripts`.
- Do NOT import `yaml` directly for RFC-0076-headed onboarding artifacts. Use `parseOnboardingArtifactHeader` / `parseOnboardingArtifactPayload` from `@warpgogol/share/onboarding-yaml` (RFC-0082). These helpers transparently handle both single-doc and two-doc files, strip metadata keys that are not part of the payload schema, and keep payload schemas strict.
- Do NOT hand-build responsive `srcset` / `/cdn-cgi/image/...` URLs in a component, and do NOT add a bespoke runtime resizer (sharp cannot run in workerd — RFC-0149). Authored images render through `<ResponsiveImage>` (`@warpgogol/ui`), which calls the **Image Provider Port** here. To change the optimization backend (Cloudflare runtime today → CMS/DAM or build-time later), implement an `ImageProvider` and register it via `setDefaultImageProvider` — never edit sections/components for this (RFC-0152). Cloudflare needs a **numeric** quality; resolve presets with `resolveImageQuality` (`"max"` → `100`) — never pass the literal `"max"` to `/cdn-cgi/image`. The provider is **safe-by-default**: it serves the raw origin asset (always 200, no resize) unless `PUBLIC_CF_IMAGE_TRANSFORM=on`, because `/cdn-cgi/image` URLs 404 on a zone where Cloudflare Image Transformations are not enabled (there is no `onerror` fallback for the feature-off case). Deployment/enable runbook: `docs/engineering/image-optimization-and-cloudflare-transformations.md`.
- **Footer handler nav-group completeness:** When adding a new nav group to the footer component (e.g. transparency links via RFC-0507), you MUST update `footerHandler` in `src/astro/site-content-handlers.ts` to process the corresponding `*Ids` field from `labels.md` and return the `*Links` array. The footer `.astro` component renders what the handler provides — a missing handler field means the group is silently empty, even if the manifest schema and component template already support it. Always check that every `*Ids` field in `labels.md` has matching processing logic in `footerHandler`.
- **RFC-0204 build-portable provider:** for apps on zones WITHOUT Cloudflare Image Transformations, opt in with `PUBLIC_IMAGE_PROVIDER=build-portable` in `.env` + `.env.production`. This activates `createBuildPortableProvider(manifest)` which emits `srcset` from pre-generated static width variants (`public/_img/<name>/<width>.webp`) instead of runtime transforms. Variants are generated by `image.variants.generate` (runs in `build.prepare`) and validated by `image.variants.validate` (runs in `build.check`). Do NOT call `setDefaultImageProvider` directly in app code — initialization is handled by `packages/ui/src/image-provider-init.ts` as a side effect of importing `content-assets.ts`. Manifest keys use content-relative paths (`/src/content/.../portrait.webp`); Astro-hashed URLs (`/_astro/<name>.<hash>.webp`) resolve via `byBasename` (strips Vite's 8-char base64url hash, not hex: `/\.[a-zA-Z0-9_-]{8}$/`).

## How to use in a new app

### 1. Add the dependency (`package.json`)

```json
"@warpgogol/share": "workspace:*"
```

### 2. Add tsconfig path aliases (`tsconfig.json`)

```json
"@warpgogol/share": ["../../packages/share/src/index.ts"],
"@warpgogol/share/*": ["../../packages/share/src/*"]
```

### 3. Use entity-ID utilities

```typescript
import { toDataEntryId, getEntryLanguage, stripEntryLanguage } from "@warpgogol/share/content";
```

### 4. Use i18n helpers

```typescript
import { createLocalizationHelpers } from "@warpgogol/share/i18n";
export const LANGUAGE_MAPPING = { de: "Deutsch", en: "English" } as const;
const { isLanguageCode, getSupportedLanguageCodes, getLocalizedUrl } =
  createLocalizationHelpers(LANGUAGE_MAPPING);
```

### 5. Use base page schemas

```typescript
import { componentOverridesSchema } from "@warpgogol/share/schemas";
import type { ComponentOverrides } from "@warpgogol/share/schemas";
```

### 6. Use browser scripts

```typescript
const { runStandardLayoutOrchestration } = await import("@warpgogol/share/scripts");
await runStandardLayoutOrchestration({ headerOffset: 80 });
```

## What does NOT belong here

- `LANGUAGE_MAPPING` constants → each app defines its own (see RFC-0038 for content-declared alternative).
- App-specific dispatcher logic (`components-dispatcher.ts`, `pages-dispatcher.ts`) → prefer `buildPage()` from `@warpgogol/share` (RFC-0026, RFC-0037).

## What belongs here (RFC-0037)

- **Astro-dependent content utilities** (`buildPage`, `getComponentContentData`, `getLayoutContentData`) live in `@warpgogol/share/astro`.
- **Content-layer infrastructure** that is app-agnostic but imports `astro:content` is legitimate in this package.

## Extending this package

Before adding a new utility here, verify it is:

1. **App-agnostic** — no imports from `apps/*` or any app-local path. `astro:content` imports are allowed per RFC-0037.
2. **Stable** — the API is unlikely to change per-app.
3. **Genuinely shared** — used or will be used by more than one app.

If those conditions are met, add the utility and update this file's table.

## Integration hub (`src/integration/`, RFC-0168/0176/0177/0181/0186/0191)

The source-agnostic destination hub. Pure — takes secrets as an injected bag; never imports `astro:env` or a vendor SDK.

- **Contracts (`port.ts`):** `IntegrationEvent` (+`eventId` dedup key), closed `DestinationKind` (`crm|calendar|email|scheduler`), `ExecutionMode` (`gogol-adapter` default | `vendor-native`), `DestinationAdapter`, plus the RFC-0168 `LeadMessage`/`Lead` (the `lead` event shape) and `eventToLead()`.
- **Registry + runtime (`orchestration.ts`):** `DESTINATION_ADAPTERS`, `routeEvent()` / `routeEventToReady()` (self-enabling fan-out; skips a destination whose secrets are absent; runs ONLY `gogol-adapter` modes), `deliverEvent()` (channels + CRM in one pass), `IntegrationEventSchema`, `authenticateInbound()` (constant-time, fail-closed). `index.ts` is a pure barrel that re-exports `orchestration.ts` + all sibling modules.
- **EU delivery substrate (`qstash.ts`, RFC-0181) — the live path:** `QSTASH_EU_BASE`, `buildQstashPublish()` (pure request builder; dedup header = `eventId`), `restRedisLedger()` / `IdempotencyLedger` (`firstSeen`, short-TTL, no PII), and the `UPSTASH_*` secret-name constants. Sources publish here; the fan-out route `/api/integration-route` verifies the QStash signature, dedups, then `deliverEvent()`s.
- **Delivery callback factory (`delivery-handler.ts`):** `createDeliveryHandler(config)` — the deep module that owns QStash signature verification, Redis idempotency, channel fan-out, CRM routing, and email notification via Cloudflare Email Routing. Section API routes (e.g. `chat-widget-section.delivery.api.ts`) are thin adapters that inject secrets + the Cloudflare email binding. Import from `@warpgogol/share/integration`.
- **Legacy (RFC-0176, superseded):** `enqueueEvent()` / `kvDedup()` / `consumeIntegrationBatch()` are the old Cloudflare-Queue producer/consumer body (`QueueBinding`/`KvDedupStore` are structural — no hard CF dependency). **Not on the EU path** — kept only for the contract + unit test; `cloudflare.residency.validate` forbids declaring queues/KV. Do not wire these into a live route.
- **Other modules:** `funnel.ts` (RFC-0188 state machine), `lifecycle.ts` (RFC-0191 billing lifecycle), `crm-buffer.ts` (RFC-0186 buffer client contracts), `sharding.ts`, `dispatch.ts`.
- **Rules:** at most one active executor per `(kind, vendor)`. The delivery substrate is in-flight only — NEVER persist event payloads (the studio must not become a CRM/datastore). Tests live in `src/integration/tests/`.
