# Package Dependency Graph

> Machine-readable map of every `workspace:*` dependency in the WGogol monorepo. Hand-maintained snapshot, last reconciled 2026-07-13 from `package.json` files. For AI agents: use this to assess blast radius before editing a shared package.

## Graph (topological: foundations → consumers)

```
@GOGOL/TOKENS (zero deps)
  |
  +-- consumed by: (CSS import only — no workspace:* deps on it)

@GOGOL/ONTOLOGY (zero workspace deps)
  |
  +-- @gogol/passport
  +-- @gogol/share
  +-- @gogol/star-map

@GOGOL/CHAT (zero workspace deps)
  |
  +-- @gogol/chat-adapter-null
  +-- @gogol/chat-adapter-uchat
  +-- @gogol/ui

@GOGOL/GROWTH (zero workspace deps)
  |
  +-- @gogol/growth-adapter-matomo

@GOGOL/NEBULA (zero workspace deps)
  |
  +-- @gogol/passport

@GOGOL/CONTENT-SOURCE (zero workspace deps)
  |
  +-- @gogol/share

@GOGOL/SITE-KERNEL-CONTENT (zero workspace deps)
  |
  +-- @gogol/passport

@GOGOL/STAR-MAP
  |
  +-- deps: @gogol/ontology
  +-- consumers: @gogol/passport

@GOGOL/INTEGRATION (zero workspace deps)
  |
  +-- consumers: @gogol/agent-gate, @gogol/integration-adapter-stripe,
  |              @gogol/integration-adapter-supabase-crm, @gogol/ui,
  |              @gogol/site-kernel-checks, @gogol/site-kernel-deploy

@GOGOL/SHARE
  |
  +-- deps: @gogol/content-source, @gogol/ontology
  +-- consumers: @gogol/pbp, @gogol/ui, @gogol/site-kernel-checks

@GOGOL/PASSPORT
  |
  +-- deps: @gogol/nebula, @gogol/ontology, @gogol/site-kernel-content, @gogol/star-map
  +-- consumers: @gogol/ui

@GOGOL/INTEGRATION-ADAPTER-STRIPE
  |
  +-- deps: @gogol/integration, @gogol/share
  +-- consumers: @gogol/ui (/api/stripe-webhook route)

@GOGOL/INTEGRATION-ADAPTER-SUPABASE-CRM
  |
  +-- deps: @gogol/integration, @gogol/share
  +-- consumers: @gogol/ui, services/lagebild-sync-worker (async Pipedrive sync)

@GOGOL/CHAT-ADAPTER-NULL
  |
  +-- deps: @gogol/chat

@GOGOL/CHAT-ADAPTER-UCHAT
  |
  +-- deps: @gogol/chat

@GOGOL/GROWTH-ADAPTER-MATOMO
  |
  +-- deps: @gogol/growth

@GOGOL/UI (top-level consumer)
  |
  +-- deps: @gogol/chat, @gogol/chat-adapter-null, @gogol/chat-adapter-uchat,
  |          @gogol/integration, @gogol/integration-adapter-stripe,
  |          @gogol/integration-adapter-supabase-crm, @gogol/passport
  +-- consumers: apps/*
```

## Dependency Matrix

| Package | Depends on (workspace) |
| --- | --- |
| `@gogol/tokens` | — (zero) |
| `@gogol/ontology` | — (zero) |
| `@gogol/chat` | — (zero) |
| `@gogol/growth` | — (zero) |
| `@gogol/nebula` | — (zero) |
| `@gogol/content-source` | — (zero) |
| `@gogol/faq` | `@gogol/content-source`, `@gogol/share` |
| `@gogol/site-kernel-content` | — (zero) |
| `@gogol/surface` | — (zero; only `zod`) — framework-free route-source engine. MUST NOT depend on `@gogol/share` (would cycle). |
| `@gogol/star-map` | `@gogol/ontology` |
| `@gogol/share` | `@gogol/content-source`, `@gogol/ontology`, `@gogol/surface` |
| `@gogol/passport` | `@gogol/nebula`, `@gogol/ontology`, `@gogol/site-kernel-content`, `@gogol/star-map` |
| `@gogol/integration` | — (zero) |
| `@gogol/integration-adapter-stripe` | `@gogol/integration`, `@gogol/share` |
| `@gogol/integration-adapter-supabase-crm` | `@gogol/integration`, `@gogol/share` |
| `@gogol/chat-adapter-null` | `@gogol/chat` |
| `@gogol/chat-adapter-uchat` | `@gogol/chat` |
| `@gogol/growth-adapter-matomo` | `@gogol/growth` |
| `@gogol/ui` | `@gogol/chat`, `@gogol/chat-adapter-null`, `@gogol/chat-adapter-uchat`, `@gogol/integration`, `@gogol/integration-adapter-stripe`, `@gogol/integration-adapter-supabase-crm`, `@gogol/passport` |

## Blast Radius Guide

| If you change... | Re-validate... |
| --- | --- |
| `@gogol/ontology` (enums, schemas, cosmic catalogs) | `star-map`, `share`, `passport` → `ui` → all apps |
| `@gogol/share` (page builder, content schemas) | `business` → `ui` → all apps |
| `@gogol/integration` (integration hub contracts) | `agent-gate`, `integration-adapter-stripe`, `integration-adapter-supabase-crm`, `ui`, `site-kernel-checks`, `site-kernel-deploy` |
| `@gogol/chat` (port contract) | `chat-adapter-null`, `chat-adapter-uchat` → `ui` → all apps |
| `@gogol/growth` (adapter interface, emit) | `growth-adapter-matomo` → all apps |
| `@gogol/passport` (signing, data) | `ui` → all apps |
| `@gogol/content-source` (CSP port, fs adapter) | `business`, `share` → `ui` → all apps |
| `@gogol/faq` (FAQ collection factory, loaders) | `content-source`, `share` → all apps with FAQ content |
| `@gogol/surface` (route-source engine, eligibility, blueprint, substance, geo) | `share` (registry merge) + `site-kernel-checks` (`surface.*` commands) → apps with a Programmatic Surface |
| `@gogol/ui` (sections, components) | all apps directly |
| `@gogol/tokens` (CSS only) | all apps (CSS import, no workspace dep) |

## OS Packages (separate dependency tree)

OS packages (`packages/os/*`) depend on each other and on shared packages but are NOT consumed by `apps/*` at build time — they are CLI tooling.

| Package | Depends on |
| --- | --- |
| `@gogol/site-kernel` | (framework-free core) |
| `@gogol/site-kernel-content` | (pure Node.js, no kernel dep) |
| `@gogol/site-kernel-astro` | `@gogol/site-kernel` |
| `@gogol/site-kernel-checks` | `@gogol/site-kernel`, `@gogol/site-kernel-astro`, `@gogol/site-kernel-content`, `@gogol/site-kernel-audit`, `@gogol/integration`, shared packages |
| `@gogol/site-kernel-codegen` | `@gogol/site-kernel`, `@gogol/site-kernel-checks` |
| `@gogol/site-kernel-onboarding` | `@gogol/site-kernel`, `@gogol/site-kernel-codegen`, `@gogol/site-kernel-checks` |
| `@gogol/site-kernel-integrity` | `@gogol/site-kernel` |
| `@gogol/site-kernel-changelog` | `@gogol/site-kernel` |
| `@gogol/site-kernel-deploy` | `@gogol/integration`, `@gogol/share`, `@gogol/site-kernel` |
| `@gogol/site-kernel-handoff` | `@gogol/fingerprint`, `@gogol/ontology`, `@gogol/share`, `@gogol/site-kernel`, `@gogol/site-kernel-astro`, `@gogol/site-kernel-checks`, `@gogol/site-kernel-codegen`, `@gogol/site-kernel-onboarding` |
| `@gogol/site-kernel-audit` | `@gogol/site-kernel` |
