# @warpgogol/chat

Vendor-agnostic chat widget port for Warpgogol apps (RFC-0175).

## Purpose

Provides a consent-gated, click-to-load abstraction for chat widgets. No vendor script loads before the visitor explicitly activates the launcher. Mirrors the growth (RFC-0027) and content-source (RFC-0141) port/adapter pattern.

## Entry points

| Import | What it provides |
| --- | --- |
| `@warpgogol/chat` | Server/build-time barrel: port types, config schema, adapter catalog, adapter metadata |
| `@warpgogol/chat/port` | `ChatWidgetAdapter`, `ChatWidgetLoadResult`, `ChatWidgetOpenResult`, `ChatAdapterId`, `CHAT_ADAPTER_IDS`, `ChatWidgetConfigSchema`, `ChatWidgetConfig`, `CHAT_CONFIG_SCRIPT_ID` |
| `@warpgogol/chat/client` | `bindChatLauncher()` — client-side click-to-load bootstrap |

## Adapter metadata

Each adapter declares `requiredOptions` and `vendorOrigins` on the `ChatWidgetAdapter` interface (self-describing). A build-time metadata catalog (`CHAT_ADAPTER_METADATA` in `adapter-metadata.ts`) mirrors these values for Node-side validators (`chat.config.validate`, `consent.activation.validate`) that cannot import the adapter packages directly (DOM vs Node boundary). Use `getChatAdapterMetadata(id)` and `chatAdapterVendorOrigins(id)` to read from one source.

## Usage

```typescript
// Server-side: read config from system.md
import { ChatWidgetConfigSchema } from "@warpgogol/chat/port";

// Client-side: bind the launcher (host owns the adapter loader map)
import { bindChatLauncher } from "@warpgogol/chat/client";
bindChatLauncher(launcherEl, loaders);
```

## Adapter catalog

| Adapter | Package                                   | Required options          | Vendor origins |
| ------- | ----------------------------------------- | ------------------------- | -------------- |
| `uchat` | `@warpgogol/chat-adapter-uchat`               | `widgetId` \| `scriptUrl` | `uchat.com.au` |
| `null`  | `@warpgogol/chat-adapter-null` (safe default) | —                         | —              |

## Validation

```sh
pnpm --filter @warpgogol/chat build:check
```
