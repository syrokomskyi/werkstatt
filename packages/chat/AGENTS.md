# `@warpgogol/chat` — Agent Guide

This package owns the **vendor-agnostic chat widget port** — the consent-gated, click-to-load abstraction for chat widgets (RFC-0175).

## What lives here

| Entry point | Module | What it provides |
| --- | --- | --- |
| `@warpgogol/chat` | `src/index.ts` | Server/build-time barrel: port types, config schema, adapter catalog, adapter metadata |
| `@warpgogol/chat/port` | `src/port.ts` | `ChatWidgetAdapter` interface, `ChatWidgetLoadResult`, `ChatWidgetOpenResult`, `ChatWidgetConfig`, `ChatWidgetConfigSchema`, `CHAT_CONFIG_SCRIPT_ID`, closed `CHAT_ADAPTER_IDS` catalog |
| `@warpgogol/chat/client` | `src/client.ts` | `bindChatLauncher()` — client-side click-to-load bootstrap |

## Rules for AI agents

> **STOP. The chat widget is consent-gated. Nothing third-party loads before the visitor clicks the launcher.**

- Do NOT import a vendor chat SDK at build time or in server output. The vendor script is injected ONLY by `bindChatLauncher()` after user activation.
- Do NOT add a vendor `<script>` or `<iframe>` to any `.astro` file. The launcher is rendered by `chat-widget-section.astro` in `@warpgogol/ui`; the vendor loads lazily via the adapter.
- Do NOT read chat secrets in this package. `ChatWidgetConfig.options` carries PUBLIC values only (e.g. UChat widget id — a public client token, never a secret).
- The closed adapter catalog is `CHAT_ADAPTER_IDS = ["uchat", "null"]`. Adding a new adapter requires: (a) a new `chat-adapter-<vendor>` package, (b) adding the id here, (c) registering in the client loader's enum-dispatch.

## Architecture

```
Visitor clicks launcher
  → bindChatLauncher(launcherEl, loaders)
    → loaders[adapterId]()            // host-supplied static import()
      → adapter.load(config)          // injects vendor script
      → adapter.open()                // opens widget panel
```

The port mirrors the growth (RFC-0027) and content-source (RFC-0141) port/adapter pattern.

## Adapter contract

```typescript
type ChatWidgetLoadResult = "ready" | "error" | "cached";
type ChatWidgetOpenResult = "opened" | "not-ready" | "no-global";

interface ChatWidgetAdapter {
  readonly id: string;
  load(config: ChatWidgetConfig): Promise<ChatWidgetLoadResult>;  // inject vendor script (idempotent)
  open(): ChatWidgetOpenResult;                                    // open/focus widget panel
  readonly requiredOptions?: readonly (readonly string[])[];      // groups of alternative option keys
  readonly vendorOrigins?: readonly string[];                     // public origins for consent.activation.validate
}
```

## Related packages

| Package                               | Role                             |
| ------------------------------------- | -------------------------------- |
| `@warpgogol/chat-adapter-uchat`       | UChat implementation             |
| `@warpgogol/chat-adapter-null`        | No-op adapter (safe default)     |
| `@warpgogol/ui` (chat-widget section) | Renders the first-party launcher |

## Validation

```sh
rtk pnpm --filter @warpgogol/chat build:check
```
