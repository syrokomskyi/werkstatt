# @warpgogol/chat-adapter-uchat

UChat implementation of `ChatWidgetAdapter` (RFC-0175).

## Purpose

The ONLY module in the workspace where the UChat origin/script URL appears. Injects the UChat web-widget popup script lazily — only after the visitor clicks the launcher (click-to-load). This keeps the pre-activation guarantee (RFC-0177): nothing UChat loads in server output.

## Configuration

In `system.md`:

```yaml
integrations:
  chat:
    adapter: uchat
    options:
      widgetId: "your-public-widget-id"
```

## Usage

```typescript
import UChatAdapter from "@warpgogol/chat-adapter-uchat";
// adapter.id === "uchat"
// adapter.load(config) — injects UChat popup script
// adapter.open() — opens widget panel
```

## Validation

```sh
pnpm --filter @warpgogol/chat-adapter-uchat build:check
```
