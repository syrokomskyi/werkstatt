# @gogol/chat-adapter-null

No-op `ChatWidgetAdapter` for development, testing, and unentitled sites (RFC-0175).

## Purpose

The safe default chat adapter. When `system.md integrations.chat.adapter` is absent or `"null"`, this adapter is selected. It satisfies the `ChatWidgetAdapter` contract with zero side effects — no script injection, no network requests, no storage access.

## Usage

```typescript
import NullChatAdapter from "@gogol/chat-adapter-null";
// adapter.id === "null"
// adapter.load() — no-op
// adapter.open() — no-op
```

## Validation

```sh
pnpm --filter @gogol/chat-adapter-null build:check
```
