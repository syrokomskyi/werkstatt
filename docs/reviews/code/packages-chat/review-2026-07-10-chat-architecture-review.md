---
reviewId: REVIEW-CODE-2026-07-10-01
date: 2026-07-10
reviewer:
  skill: wg-review
  model: unknown
verdict: needs-revision
diffRange: 919679e21...HEAD
filesReviewed:
  - packages/chat/src/port.ts
  - packages/chat/src/config.ts
  - packages/chat/src/index.ts
  - packages/chat/src/client.ts
  - packages/chat/src/adapter-metadata.ts
  - packages/chat-adapter-uchat/src/index.ts
  - packages/os/site-kernel-checks/src/chat.ts
  - packages/os/site-kernel-checks/src/consent.ts
  - packages/share/src/integration/delivery-handler.ts
  - packages/share/src/integration/index.ts
  - packages/share/package.json
  - packages/ui/src/sections/chat-widget/chat-widget-section.delivery.api.ts
  - packages/chat/README.md
  - packages/AGENTS.md
  - packages/share/AGENTS.md
---

# Code Review: 919679e21...HEAD (chat architectural review — 3 candidates)

### Verdict: Needs revision

The diff implements three architectural deepening candidates for the `@gogol/chat` package and the integration delivery path. The design direction is sound — single source of truth for `ChatWidgetConfig`, self-describing adapters, and a delivery callback factory. However, the mechanical floor fails for two affected packages (`@gogol/chat` and `@gogol/chat-adapter-uchat`), and there is a metadata drift risk with no guard.

### Mechanical floor

**Fail** — two packages fail `build:check`:

1. `@gogol/chat/src/client.ts:116` — `ChatAdapterLoaders` was tightened to `Record<ChatAdapterId, ...>` but `_loadAdapter` accepts `adapterId: string`. A `string` cannot index `Record<ChatAdapterId, ...>` — TS7053.
2. `@gogol/chat-adapter-uchat/src/index.ts:17` — imports `ChatWidgetConfig` from `@gogol/chat/port`, but Candidate 3 moved the type to `@gogol/chat/config` and removed the re-export from `port.ts` — TS2459.

### Axis A — Structural correctness

- **FAIL (A-1):** `_loadAdapter` in `@/packages/chat/src/client.ts:112-116` takes `adapterId: string` but `ChatAdapterLoaders` is now `Record<ChatAdapterId, ...>`. The index access `loaders[adapterId]` is a type error. Fix: change the parameter to `ChatAdapterId`, or add a type assertion at the call site in `_loadAndInit` where `config.adapter` is already typed as `ChatAdapterId` by the Zod schema.
- **FAIL (A-2):** `@/packages/chat-adapter-uchat/src/index.ts:17` imports `ChatWidgetConfig` from `@gogol/chat/port` — but Candidate 3 moved it to `@gogol/chat/config`. The import should be `from "@gogol/chat/config"` or `from "@gogol/chat"` (barrel re-exports it).
- **Dead code (A-3):** `EmailRoutingEnv` interface in `@/packages/share/src/integration/delivery-handler.ts:60-62` is declared but never used in that file. The old `delivery.api.ts` used it to cast `cfEnv`; the new handler receives the binding via `config.email.sendBinding`. The interface remains used in `delivery.api.ts` but is dead in `delivery-handler.ts`.

### Axis B — DNA alignment

- **DNA-1 (monorepo boundary):** Pass — no `apps/* → apps/*` or `apps/* → services/*` imports.
- **DNA-6 (kebab-case):** Pass — `adapter-metadata.ts`, `delivery-handler.ts` are kebab-case.
- **DNA-42 (Compass markup):** Pass — both new files carry `MODULE_CONTRACT` and `CHANGE_SUMMARY`. `port.ts` CHANGE_SUMMARY updated. However, `config.ts` CHANGE_SUMMARY does not note the `ChatWidgetConfigParsed → ChatWidgetConfig` rename — minor.

### Axis C — Ecosystem fit

- **FAIL (C-1):** `CHAT_ADAPTER_METADATA` in `@/packages/chat/src/adapter-metadata.ts:27-33` is a second source of truth for adapter metadata. The adapter packages declare `requiredOptions` and `vendorOrigins` at runtime on the `ChatWidgetAdapter` object; this catalog mirrors them for Node-side validators. There is no validator checking that `CHAT_ADAPTER_METADATA.uchat.requiredOptions` matches `UChatAdapter.requiredOptions`. If an adapter's options change but the catalog isn't updated, validators will check stale values. This is the exact "scattered hardcoded maps" problem the refactoring set out to solve — it moved the maps but didn't eliminate the duplication.
- **Minor (C-2):** `chat.ts` and `consent.ts` CHANGE_SUMMARY blocks were not updated to note the switch from `REQUIRED_OPTIONS` / `CHAT_VENDOR_ORIGINS` to `getChatAdapterMetadata` / `chatAdapterVendorOrigins`.
- **AGENTS.md updates:** Pass — `packages/AGENTS.md`, `packages/chat/README.md`, `packages/share/AGENTS.md` all updated.

### Axis D — Forward-only compliance

- **Pass** — the old `REQUIRED_OPTIONS` map, `CHAT_VENDOR_ORIGINS` map, hand-written `ChatWidgetConfig` interface, and 202-line delivery callback were all deleted, not kept behind a flag or compatibility shim.

### Axis E — Agent-facing clarity

- **Pass** — new files carry `MODULE_CONTRACT`, `CHANGE_SUMMARY`, and `@ai-invariant` where appropriate. Comments reference real functions and modules.
- **Minor (E-1):** `config.ts` CHANGE_SUMMARY does not mention the `ChatWidgetConfigParsed → ChatWidgetConfig` rename. An agent reading the file history would not know the type was renamed as part of the architectural review.

### Axis F — Pragmatism

- **Pass** — `createDeliveryHandler` is a well-justified deep module: 236 lines of behavior behind a 1-function interface. The section route shrank from 202 to 30 lines.
- **Observation (F-1):** `CHAT_ADAPTER_METADATA` is a pragmatic bridge between the DOM adapter world and the Node validator world. The alternative (making adapters importable from Node) would require splitting each adapter into metadata + runtime, which is more complexity. The bridge is justified but needs a drift guard (see C-1).

### Axis G — Blind spots

- **Drift risk (G-1):** No mechanism prevents `CHAT_ADAPTER_METADATA` from drifting from the actual adapter declarations. A build-time check that imports the adapter package and asserts `adapter.requiredOptions === CHAT_ADAPTER_METADATA.uchat.requiredOptions` would close the gap. Without it, the metadata catalog is a silent duplicate.
- **Edge case (G-2):** `getChatAdapterMetadata` in `@/packages/chat/src/adapter-metadata.ts:36-38` casts `CHAT_ADAPTER_METADATA` to `Readonly<Record<string, ChatAdapterMetadata>>` to allow string indexing. This is safe (returns `{}` for unknown ids) but the cast bypasses the `ChatAdapterId` key constraint.
- **Security (G-3):** `delivery-handler.ts` handles secrets via injected config — never imports `astro:env`. Pass. No cookies. Pass.

### Spec compliance

| Requirement | Status | Evidence |
| --- | --- | --- |
| Candidate 3: Delete hand-written `ChatWidgetConfig`, use `z.infer` | Done | `config.ts:26` — `export type ChatWidgetConfig = z.infer<typeof ChatWidgetConfigSchema>` |
| Candidate 3: Update all imports | Partial | `chat-adapter-uchat/src/index.ts:17` still imports from `@gogol/chat/port` — broken |
| Candidate 2: Add `requiredOptions` + `vendorOrigins` to `ChatWidgetAdapter` | Done | `port.ts:46-48` |
| Candidate 2: UChatAdapter declares metadata | Done | `chat-adapter-uchat/src/index.ts:50-51` |
| Candidate 2: Validators read from adapter metadata | Done | `chat.ts:65` uses `getChatAdapterMetadata`; `consent.ts:91` uses `chatAdapterVendorOrigins` |
| Candidate 2: Eliminate hardcoded maps | Partial | `REQUIRED_OPTIONS` and `CHAT_VENDOR_ORIGINS` deleted, but `CHAT_ADAPTER_METADATA` is a new hardcoded map with drift risk |
| Candidate 1: Extract delivery callback into integration port | Done | `delivery-handler.ts` — `createDeliveryHandler` factory |
| Candidate 1: Section route is a thin adapter | Done | `delivery.api.ts` — 30 lines, delegates to `createDeliveryHandler` |
| Green root build | Partial | Root `pnpm build` passes (41/41), but per-package `build:check` fails for `@gogol/chat` and `@gogol/chat-adapter-uchat` |

### Questions for the author

1. `ChatAdapterLoaders` was tightened to `Record<ChatAdapterId, ...>` but `_loadAdapter` still takes `string`. Should `_loadAdapter` accept `ChatAdapterId`, or should the `ChatAdapterLoaders` type stay as `Record<string, ...>` for the enum-dispatch pattern?
2. `chat-adapter-uchat` imports `ChatWidgetConfig` from `@gogol/chat/port` — should it import from `@gogol/chat/config` or from the barrel `@gogol/chat`?
3. `CHAT_ADAPTER_METADATA` duplicates `UChatAdapter.requiredOptions` and `UChatAdapter.vendorOrigins`. What prevents these from drifting? Should a build-time check assert consistency between the runtime adapter and the metadata catalog?
