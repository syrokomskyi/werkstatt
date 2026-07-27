# Package Dependency Graph

> Machine-readable map of every `workspace:*` dependency in the Warpgogol monorepo. Hand-maintained snapshot, last reconciled 2026-07-13 from `package.json` files. For AI agents: use this to assess blast radius before editing a shared package.

## Graph (topological: foundations → consumers)

```
@GOGOL/TOKENS (zero deps)
  |
  +-- consumed by: (CSS import only — no workspace:* deps on it)

@GOGOL/ONTOLOGY (zero workspace deps)
  |
  +-- @warpgogol/passport
  +-- @warpgogol/share
  +-- @warpgogol/star-map

@GOGOL/CHAT (zero workspace deps)
  |
  +-- @warpgogol/chat-adapter-null
  +-- @warpgogol/chat-adapter-uchat
  +-- @warpgogol/ui

@GOGOL/GROWTH (zero workspace deps)
  |
  +-- @warpgogol/growth-adapter-matomo

@GOGOL/NEBULA (zero workspace deps)
  |
  +-- @warpgogol/passport

@GOGOL/CONTENT-SOURCE (zero workspace deps)
  |
  +-- @warpgogol/share

@GOGOL/SITE-KERNEL-CONTENT (zero workspace deps)
  |
  +-- @warpgogol/passport

@GOGOL/STAR-MAP
  |
  +-- deps: @warpgogol/ontology
  +-- consumers: @warpgogol/passport

@GOGOL/INTEGRATION (zero workspace deps)
  |
  +-- consumers: @warpgogol/agent-gate, @warpgogol/integration-adapter-stripe,
  |              @warpgogol/integration-adapter-supabase-crm, @warpgogol/ui,
  |              @warpgogol/site-kernel-checks, @warpgogol/site-kernel-deploy

@GOGOL/SHARE
  |
  +-- deps: @warpgogol/content-source, @warpgogol/ontology
  +-- consumers: @warpgogol/pbp, @warpgogol/ui, @warpgogol/site-kernel-checks

@GOGOL/PASSPORT
  |
  +-- deps: @warpgogol/nebula, @warpgogol/ontology, @warpgogol/site-kernel-content, @warpgogol/star-map
  +-- consumers: @warpgogol/ui

@GOGOL/INTEGRATION-ADAPTER-STRIPE
  |
  +-- deps: @warpgogol/integration, @warpgogol/share
  +-- consumers: @warpgogol/ui (/api/stripe-webhook route)

@GOGOL/INTEGRATION-ADAPTER-SUPABASE-CRM
  |
  +-- deps: @warpgogol/integration, @warpgogol/share
  +-- consumers: @warpgogol/ui, services/lagebild-sync-worker (async Pipedrive sync)

@GOGOL/CHAT-ADAPTER-NULL
  |
  +-- deps: @warpgogol/chat

@GOGOL/CHAT-ADAPTER-UCHAT
  |
  +-- deps: @warpgogol/chat

@GOGOL/GROWTH-ADAPTER-MATOMO
  |
  +-- deps: @warpgogol/growth

@GOGOL/UI (top-level consumer)
  |
  +-- deps: @warpgogol/chat, @warpgogol/chat-adapter-null, @warpgogol/chat-adapter-uchat,
  |          @warpgogol/integration, @warpgogol/integration-adapter-stripe,
  |          @warpgogol/integration-adapter-supabase-crm, @warpgogol/passport
  +-- consumers: apps/*
```

## Dependency Matrix

| Package | Depends on (workspace) |
| --- | --- |
| `@warpgogol/tokens` | — (zero) |
| `@warpgogol/ontology` | — (zero) |
| `@warpgogol/chat` | — (zero) |
| `@warpgogol/growth` | — (zero) |
| `@warpgogol/nebula` | — (zero) |
| `@warpgogol/content-source` | — (zero) |
| `@warpgogol/faq` | `@warpgogol/content-source`, `@warpgogol/share` |
| `@warpgogol/site-kernel-content` | — (zero) |
| `@warpgogol/surface` | — (zero; only `zod`) — framework-free route-source engine. MUST NOT depend on `@warpgogol/share` (would cycle). |
| `@warpgogol/star-map` | `@warpgogol/ontology` |
| `@warpgogol/share` | `@warpgogol/content-source`, `@warpgogol/ontology`, `@warpgogol/surface` |
| `@warpgogol/passport` | `@warpgogol/nebula`, `@warpgogol/ontology`, `@warpgogol/site-kernel-content`, `@warpgogol/star-map` |
| `@warpgogol/integration` | — (zero) |
| `@warpgogol/integration-adapter-stripe` | `@warpgogol/integration`, `@warpgogol/share` |
| `@warpgogol/integration-adapter-supabase-crm` | `@warpgogol/integration`, `@warpgogol/share` |
| `@warpgogol/chat-adapter-null` | `@warpgogol/chat` |
| `@warpgogol/chat-adapter-uchat` | `@warpgogol/chat` |
| `@warpgogol/growth-adapter-matomo` | `@warpgogol/growth` |
| `@warpgogol/ui` | `@warpgogol/chat`, `@warpgogol/chat-adapter-null`, `@warpgogol/chat-adapter-uchat`, `@warpgogol/integration`, `@warpgogol/integration-adapter-stripe`, `@warpgogol/integration-adapter-supabase-crm`, `@warpgogol/passport` |

## Blast Radius Guide

| If you change... | Re-validate... |
| --- | --- |
| `@warpgogol/ontology` (enums, schemas, cosmic catalogs) | `star-map`, `share`, `passport` → `ui` → all apps |
| `@warpgogol/share` (page builder, content schemas) | `business` → `ui` → all apps |
| `@warpgogol/integration` (integration hub contracts) | `agent-gate`, `integration-adapter-stripe`, `integration-adapter-supabase-crm`, `ui`, `site-kernel-checks`, `site-kernel-deploy` |
| `@warpgogol/chat` (port contract) | `chat-adapter-null`, `chat-adapter-uchat` → `ui` → all apps |
| `@warpgogol/growth` (adapter interface, emit) | `growth-adapter-matomo` → all apps |
| `@warpgogol/passport` (signing, data) | `ui` → all apps |
| `@warpgogol/content-source` (CSP port, fs adapter) | `business`, `share` → `ui` → all apps |
| `@warpgogol/faq` (FAQ collection factory, loaders) | `content-source`, `share` → all apps with FAQ content |
| `@warpgogol/surface` (route-source engine, eligibility, blueprint, substance, geo) | `share` (registry merge) + `site-kernel-checks` (`surface.*` commands) → apps with a Programmatic Surface |
| `@warpgogol/ui` (sections, components) | all apps directly |
| `@warpgogol/tokens` (CSS only) | all apps (CSS import, no workspace dep) |

## OS Packages (separate dependency tree)

OS packages (`packages/os/*`) depend on each other and on shared packages but are NOT consumed by `apps/*` at build time — they are CLI tooling.

| Package | Depends on |
| --- | --- |
| `@warpgogol/site-kernel` | (framework-free core) |
| `@warpgogol/site-kernel-content` | (pure Node.js, no kernel dep) |
| `@warpgogol/site-kernel-astro` | `@warpgogol/site-kernel` |
| `@warpgogol/site-kernel-checks` | `@warpgogol/site-kernel`, `@warpgogol/site-kernel-astro`, `@warpgogol/site-kernel-content`, `@warpgogol/site-kernel-audit`, `@warpgogol/integration`, shared packages |
| `@warpgogol/site-kernel-codegen` | `@warpgogol/site-kernel`, `@warpgogol/site-kernel-checks` |
| `@warpgogol/site-kernel-onboarding` | `@warpgogol/site-kernel`, `@warpgogol/site-kernel-codegen`, `@warpgogol/site-kernel-checks` |
| `@warpgogol/site-kernel-integrity` | `@warpgogol/site-kernel` |
| `@warpgogol/site-kernel-changelog` | `@warpgogol/site-kernel` |
| `@warpgogol/site-kernel-deploy` | `@warpgogol/integration`, `@warpgogol/share`, `@warpgogol/site-kernel` |
| `@warpgogol/site-kernel-handoff` | `@warpgogol/fingerprint`, `@warpgogol/ontology`, `@warpgogol/share`, `@warpgogol/site-kernel`, `@warpgogol/site-kernel-astro`, `@warpgogol/site-kernel-checks`, `@warpgogol/site-kernel-codegen`, `@warpgogol/site-kernel-onboarding` |
| `@warpgogol/site-kernel-audit` | `@warpgogol/site-kernel` |
