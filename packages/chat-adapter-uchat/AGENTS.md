# `@gogol/chat-adapter-uchat` — Agent Guide

UChat implementation of `ChatWidgetAdapter` (RFC-0175).

## What it does

- Injects the UChat web-widget popup script **lazily**, only when `load()` is called (after visitor clicks the launcher)
- Opens/focuses the widget panel via `open()`
- `load()` returns `ChatWidgetLoadResult` ("ready" | "error" | "cached"); `open()` returns `ChatWidgetOpenResult` ("opened" | "not-ready" | "no-global")
- The widget adapter lives in `src/widget-adapter.ts`; `src/index.ts` is a barrel that re-exports it. Server-side funnel integration (RFC-0188) will live in a separate `funnel-client.ts` module.

## Rules for AI agents

> **This is the ONLY module in the workspace where the UChat origin/script URL appears.**

- Do NOT duplicate the UChat script URL or widget injection logic anywhere else.
- Do NOT load anything at import time — all injection happens inside `load()`.
- The `widgetId` option is a **public client token**, never a secret.
- Required option: `widgetId` (the public UChat web-widget id). Optional: `scriptUrl` (override for non-default UChat deployments).
- The adapter id is `"uchat"` and is registered in `CHAT_ADAPTER_IDS` in `@gogol/chat/port`.

## Script URL resolution

Default: `https://www.uchat.com.au/js/widget/<widgetId>/popup.js`

Override via `options.scriptUrl` for custom UChat deployments.

## Validation

```sh
pnpm --filter @gogol/chat-adapter-uchat build:check
```
