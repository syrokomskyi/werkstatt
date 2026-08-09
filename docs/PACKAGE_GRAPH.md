# Package Dependency Graph

> Machine-readable map of every `workspace:*` dependency in the Warpgogol monorepo. Hand-maintained snapshot, last reconciled 2026-07-13 from `package.json` files. For AI agents: use this to assess blast radius before editing a shared package.

## Graph (topological: foundations → consumers)

```
@GOGOL/TOKENS (zero deps)
  |
  +-- consumed by: (CSS import only — no workspace:* deps on it)

@GOGOL/ONTOLOGY (zero workspace deps)
  |
  +-- @warpgogol/werkstatt-site/passport
  +-- @warpgogol/share
  +-- @warpgogol/werkstatt-site/star-map

@GOGOL/CHAT (zero workspace deps)
  |
  +-- @warpgogol/werkstatt-site/chat-adapter-null
  +-- @warpgogol/werkstatt-site/chat-adapter-uchat
  +-- @warpgogol/ui

@GOGOL/GROWTH (zero workspace deps)
  |
  +-- @warpgogol/werkstatt-site/growth-adapter-matomo

@GOGOL/NEBULA (zero workspace deps)
  |
  +-- @warpgogol/werkstatt-site/passport

@GOGOL/CONTENT-SOURCE (zero workspace deps)
  |
  +-- @warpgogol/share

@GOGOL/SITE-KERNEL-CONTENT (zero workspace deps)
  |
  +-- @warpgogol/werkstatt-site/passport

@GOGOL/STAR-MAP
  |
  +-- deps: @warpgogol/ontology
  +-- consumers: @warpgogol/werkstatt-site/passport

@GOGOL/INTEGRATION (zero workspace deps)
  |
  +-- consumers: @warpgogol/werkstatt/agent-gate, @warpgogol/werkstatt-site/integration-adapter-stripe,
  |              @warpgogol/werkstatt-site/integration-adapter-supabase-crm, @warpgogol/ui,
  |              @warpgogol/werkstatt-site/checks, @warpgogol/werkstatt-site/deploy

@GOGOL/SHARE
  |
  +-- deps: @warpgogol/werkstatt-site/content-source, @warpgogol/ontology
  +-- consumers: @warpgogol/pbp, @warpgogol/ui, @warpgogol/werkstatt-site/checks

@GOGOL/PASSPORT
  |
  +-- deps: @warpgogol/werkstatt-site/nebula, @warpgogol/ontology, @warpgogol/werkstatt-site/content, @warpgogol/werkstatt-site/star-map
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
  +-- deps: @warpgogol/chat, @warpgogol/werkstatt-site/chat-adapter-null, @warpgogol/werkstatt-site/chat-adapter-uchat,
  |          @warpgogol/integration, @warpgogol/werkstatt-site/integration-adapter-stripe,
  |          @warpgogol/werkstatt-site/integration-adapter-supabase-crm, @warpgogol/werkstatt-site/passport
  +-- consumers: apps/*

@GOGOL/WERKSTATT (engine — RFC-0772 consolidated kernel, handoff, integrity, observability, fingerprint, agent-gate, changelog, schemas, plugin)
  |
  +-- deps: @warpgogol/forge, @warpgogol/ontology, @warpgogol/share, @warpgogol/werkstatt-site/passport, @warpgogol/observability,
  |          @warpgogol/integration, @warpgogol/werkstatt-site/integration-adapter-supabase-crm, @warpgogol/werkstatt-site/surface,
  |          @warpgogol/werkstatt-site/content, @warpgogol/werkstatt-site/paths, @warpgogol/werkstatt-site/checks,
  |          @warpgogol/werkstatt-site/codegen, @warpgogol/werkstatt/integrity, @warpgogol/werkstatt-site/onboarding
  +-- consumers: root workspace (tools/kernel.config.ts), re-export shims (site-kernel, site-kernel-handoff, fingerprint, agent-gate, etc.)
```

## Dependency Matrix

| Package | Depends on (workspace) |
| --- | --- |
| `@warpgogol/werkstatt-site/tokens` | — (zero) |
| `@warpgogol/ontology` | `@warpgogol/werkstatt` (operations re-export shim) |
| `@warpgogol/chat` | — (zero) |
| `@warpgogol/growth` | — (zero) |
| `@warpgogol/werkstatt-site/nebula` | — (zero) |
| `@warpgogol/werkstatt-site/content-source` | — (zero) |
| `@warpgogol/werkstatt-site/faq` | `@warpgogol/werkstatt-site/content-source`, `@warpgogol/share` |
| `@warpgogol/werkstatt-site/content` | — (zero) |
| `@warpgogol/werkstatt-site/surface` | — (zero; only `zod`) — framework-free route-source engine. MUST NOT depend on `@warpgogol/share` (would cycle). |
| `@warpgogol/werkstatt-site/star-map` | `@warpgogol/ontology` |
| `@warpgogol/share` | `@warpgogol/werkstatt-site/content-source`, `@warpgogol/ontology`, `@warpgogol/werkstatt-site/surface` |
| `@warpgogol/werkstatt-site/passport` | `@warpgogol/werkstatt-site/nebula`, `@warpgogol/ontology`, `@warpgogol/werkstatt-site/content`, `@warpgogol/werkstatt-site/star-map` |
| `@warpgogol/integration` | — (zero) |
| `@warpgogol/werkstatt-site/integration-adapter-stripe` | `@warpgogol/integration`, `@warpgogol/share` |
| `@warpgogol/werkstatt-site/integration-adapter-supabase-crm` | `@warpgogol/integration`, `@warpgogol/share` |
| `@warpgogol/werkstatt-site/chat-adapter-null` | `@warpgogol/chat` |
| `@warpgogol/werkstatt-site/chat-adapter-uchat` | `@warpgogol/chat` |
| `@warpgogol/werkstatt-site/growth-adapter-matomo` | `@warpgogol/growth` |
| `@warpgogol/ui` | `@warpgogol/chat`, `@warpgogol/werkstatt-site/chat-adapter-null`, `@warpgogol/werkstatt-site/chat-adapter-uchat`, `@warpgogol/integration`, `@warpgogol/werkstatt-site/integration-adapter-stripe`, `@warpgogol/werkstatt-site/integration-adapter-supabase-crm`, `@warpgogol/werkstatt-site/passport` |
| `@warpgogol/werkstatt` | `@warpgogol/forge`, `@warpgogol/ontology`, `@warpgogol/share`, `@warpgogol/werkstatt-site/passport`, `@warpgogol/observability`, `@warpgogol/integration`, `@warpgogol/werkstatt-site/integration-adapter-supabase-crm`, `@warpgogol/werkstatt-site/surface`, `@warpgogol/werkstatt-site/content`, `@warpgogol/werkstatt-site/paths`, `@warpgogol/werkstatt-site/checks`, `@warpgogol/werkstatt-site/codegen`, `@warpgogol/werkstatt/integrity`, `@warpgogol/werkstatt-site/onboarding` |
| `@warpgogol/site-kernel` | `@warpgogol/werkstatt` (re-export shim — RFC-0772) |
| `@warpgogol/werkstatt/handoff` | `@warpgogol/werkstatt` (re-export shim — RFC-0772) |
| `@warpgogol/werkstatt/integrity` | `@warpgogol/werkstatt` (re-export shim — RFC-0772) |
| `@warpgogol/werkstatt/observability` | `@warpgogol/werkstatt` (re-export shim — RFC-0772) |
| `@warpgogol/werkstatt-site/changelog` | `@warpgogol/werkstatt` (re-export shim — RFC-0772) |
| `@warpgogol/werkstatt/fingerprint` | `@warpgogol/werkstatt` (re-export shim — RFC-0772) |
| `@warpgogol/werkstatt/agent-gate` | `@warpgogol/werkstatt` (re-export shim — RFC-0772) |

## Blast Radius Guide

| If you change... | Re-validate... |
| --- | --- |
| `@warpgogol/ontology` (enums, schemas, cosmic catalogs) | `star-map`, `share`, `passport` → `ui` → all apps |
| `@warpgogol/share` (page builder, content schemas) | `business` → `ui` → all apps |
| `@warpgogol/integration` (integration hub contracts) | `agent-gate`, `integration-adapter-stripe`, `integration-adapter-supabase-crm`, `ui`, `site-kernel-checks`, `site-kernel-deploy` |
| `@warpgogol/chat` (port contract) | `chat-adapter-null`, `chat-adapter-uchat` → `ui` → all apps |
| `@warpgogol/growth` (adapter interface, emit) | `growth-adapter-matomo` → all apps |
| `@warpgogol/werkstatt-site/passport` (signing, data) | `ui` → all apps |
| `@warpgogol/werkstatt-site/content-source` (CSP port, fs adapter) | `business`, `share` → `ui` → all apps |
| `@warpgogol/werkstatt-site/faq` (FAQ collection factory, loaders) | `content-source`, `share` → all apps with FAQ content |
| `@warpgogol/werkstatt-site/surface` (route-source engine, eligibility, blueprint, substance, geo) | `share` (registry merge) + `site-kernel-checks` (`surface.*` commands) → apps with a Programmatic Surface |
| `@warpgogol/ui` (sections, components) | all apps directly |
| `@warpgogol/werkstatt-site/tokens` (CSS only) | all apps (CSS import, no workspace dep) |

## OS Packages (re-export shims — RFC-0772)

OS packages (`packages/os/*`) are now re-export shims pointing to `@warpgogol/werkstatt`. They preserve backward-compatible import paths during the transition period (RFC-0772 → RFC-0776).

| Package | Status | Re-exports from |
| --- | --- | --- |
| `@warpgogol/site-kernel` | Re-export shim | `@warpgogol/werkstatt/kernel` |
| `@warpgogol/werkstatt-site/content` | Active (not yet moved) | — |
| `@warpgogol/werkstatt-site/paths` | Active (not yet moved) | — |
| `@warpgogol/werkstatt-site/checks` | Active (not yet moved) | — |
| `@warpgogol/werkstatt-site/codegen` | Active (not yet moved) | — |
| `@warpgogol/werkstatt-site/onboarding` | Active (not yet moved) | — |
| `@warpgogol/werkstatt/integrity` | Re-export shim | `@warpgogol/werkstatt/integrity` |
| `@warpgogol/werkstatt/observability` | Re-export shim | `@warpgogol/werkstatt/observability` |
| `@warpgogol/werkstatt-site/changelog` | Re-export shim | `@warpgogol/werkstatt/changelog` |
| `@warpgogol/werkstatt-site/deploy` | Active (not yet moved) | — |
| `@warpgogol/werkstatt/handoff` | Re-export shim | `@warpgogol/werkstatt` (handoff modules) |
| `@warpgogol/werkstatt-site/audit` | Active (not yet moved) | — |
| `@warpgogol/werkstatt/fingerprint` | Re-export shim | `@warpgogol/werkstatt/fingerprint` |
| `@warpgogol/werkstatt/agent-gate` | Re-export shim | `@warpgogol/werkstatt/agent-gate` |
