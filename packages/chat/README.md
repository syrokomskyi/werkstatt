# @gogol/chat

Vendor-agnostic chat widget port for WGogol apps (RFC-0175).

## Purpose

Provides a consent-gated, click-to-load abstraction for chat widgets. No vendor script loads before the visitor explicitly activates the launcher. Mirrors the growth (RFC-0027) and content-source (RFC-0141) port/adapter pattern.

## Entry points

| Import | What it provides |
| --- | --- |
| `@gogol/chat` | Server/build-time barrel: port types, config schema, adapter catalog, adapter metadata |
| `@gogol/chat/port` | `ChatWidgetAdapter`, `ChatWidgetLoadResult`, `ChatWidgetOpenResult`, `ChatAdapterId`, `CHAT_ADAPTER_IDS`, `ChatWidgetConfigSchema`, `ChatWidgetConfig`, `CHAT_CONFIG_SCRIPT_ID` |
| `@gogol/chat/client` | `bindChatLauncher()` — client-side click-to-load bootstrap |

## Adapter metadata

Each adapter declares `requiredOptions` and `vendorOrigins` on the `ChatWidgetAdapter` interface (self-describing). A build-time metadata catalog (`CHAT_ADAPTER_METADATA` in `adapter-metadata.ts`) mirrors these values for Node-side validators (`chat.config.validate`, `consent.activation.validate`) that cannot import the adapter packages directly (DOM vs Node boundary). Use `getChatAdapterMetadata(id)` and `chatAdapterVendorOrigins(id)` to read from one source.

## Usage

```typescript
// Server-side: read config from system.md
import { ChatWidgetConfigSchema } from "@gogol/chat/port";

// Client-side: bind the launcher (host owns the adapter loader map)
import { bindChatLauncher } from "@gogol/chat/client";
bindChatLauncher(launcherEl, loaders);
```

## Adapter catalog

| Adapter | Package                                   | Required options          | Vendor origins |
| ------- | ----------------------------------------- | ------------------------- | -------------- |
| `uchat` | `@gogol/chat-adapter-uchat`               | `widgetId` \| `scriptUrl` | `uchat.com.au` |
| `null`  | `@gogol/chat-adapter-null` (safe default) | —                         | —              |

## Validation

```sh
pnpm --filter @gogol/chat build:check
```
