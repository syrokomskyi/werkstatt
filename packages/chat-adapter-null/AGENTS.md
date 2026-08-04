# `@warpgogol/chat-adapter-null` — Agent Guide

No-op `ChatWidgetAdapter` for development, testing, and unentitled sites (RFC-0175).

## What it does

| Method         | Behaviour                |
| -------------- | ------------------------ |
| `load(config)` | No-op — injects nothing  |
| `open()`       | No-op — no panel to open |

## When to use

- Local development — avoids loading vendor scripts
- CI/test environments
- Sites where chat is not configured (`adapter: "null"` in `system.md`)

## Rules for AI agents

- This is the **safe default**. When `system.md integrations.chat.adapter` is absent or `"null"`, this adapter is selected.
- Do NOT add any script injection, network request, or storage access here.
- The adapter id is `"null"` and is registered in `CHAT_ADAPTER_IDS` in `@warpgogol/chat/port`.

## Validation

```sh
rtk pnpm --filter @warpgogol/chat-adapter-null build:check
```
