---
id: RFC-0175
title: "Introduce a consent-gated vendor-agnostic chat widget port"
status: implemented
kind: architecture
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-06-07
updatedAt: 2026-06-08
implementedAt: 2026-06-08
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy:
  - RFC-0188
related:
  - RFC-0027
  - RFC-0141
  - RFC-0149
  - RFC-0161
  - RFC-0164
  - RFC-0168
  - RFC-0169
  - RFC-0176
  - RFC-0177
commands:
  proposed: []
  added:
    - chat.config.validate
  changed:
    - apps-check.run
  removed: []
appsImpacted:
  - apps/*
packagesImpacted:
  - packages/chat
  - packages/chat-adapter-uchat
  - packages/chat-adapter-null
  - packages/ui
  - packages/share
  - packages/ontology
  - packages/os/site-kernel-checks
successSignals:
  - "A client site shows a first-party chat launcher; the third-party chat vendor's script, network, and storage do not exist on the page until the visitor clicks the launcher."
  - "Switching the chat vendor (or disabling chat) is a one-line system.md change with no application or section code edits."
  - "The chat module compiles into a site only when the integrations.chat entitlement is present; otherwise it is absent from the build."
nonGoals:
  - "Do not route lead/PII through a studio-central system — destinations run on the client's own site with the client's tokens; where captured conversations go is owned by the Integration hub (RFC-0176)."
  - "Do not introduce a cookie banner or third-party CMP — activation by click is the consent gate (RFC-0177)."
  - "Do not import a chat vendor SDK in apps/* or in section code — vendor specifics live only inside the adapter package."
---

# RFC-0175: Introduce a consent-gated vendor-agnostic chat widget port

## Context

The studio wants to sell an on-site conversational widget (a popup chat) as a paid module, piloting with **UChat** on [apps/warpgogol-com](../../apps/warpgogol-com). UChat is an omni-channel chat platform with its own flow builder; it does not store conversation data long-term — it forwards captured leads onward (in the pilot, to the client's Pipedrive). Where that data goes is a _destination_ concern owned by RFC-0176; this RFC owns the _source_: getting a widget onto the page.

The widget is a **third-party client script**, which collides head-on with the ecosystem's privacy posture: cookies are forbidden repository-wide ([AGENTS.md storage policy](../../AGENTS.md)), analytics runs cookieless (RFC-0170), and fonts were self-hosted specifically to delete a third-party hotlink (RFC-0164). A naive `<script src="uchat…">` would set third-party storage and beacon on every page load, before any user action — exactly what the posture eliminates.

The platform already models vendor-agnostic client capabilities as **ports with adapters**: growth (RFC-0027, client-side `bootGrowthLayer` + adapter packages) and content-source (RFC-0141). A chat widget is the same pattern, with one hard rule layered on: it must be **click-to-load**.

## Problem

- There is no chat module, so the paid widget cannot be configured for any site.
- A vendor chat script loaded eagerly sets third-party storage/identifiers and processes PII before consent — violating the storage policy and German ePrivacy practice.
- Without a port, adding or swapping a chat vendor would mean editing section/app code and re-deriving consent handling each time.
- There is no entitlement to gate the module, so it could not be sold per-site like Blog (RFC-0167) or Integrations (RFC-0168).

## Decision

A client-side **Chat Widget Port** is introduced in a dedicated package `@gogol/chat`: a closed `ChatWidgetAdapter` contract whose `load()` injects the vendor script **only when called**, plus a `chat-widget` section in `@gogol/ui` that renders a **first-party** launcher (pure HTML/CSS, zero third-party). The vendor script, its network, and its storage come into existence **only after the visitor clicks the launcher** (click-to-load). Reference adapters ship for `uchat` and `null` (the safe default). The widget is configured from `system.md integrations.chat` and uses only **public** vendor options (e.g. a widget id) — the _widget client_ needs no server secret (captured leads are routed by the site's hub, RFC-0176, with the client's tokens). A new entitlement `integrations.chat` (RFC-0169) gates whether the module compiles. `chat.config.validate` joins `apps-check.run`. The pre-activation guarantee is enforced by RFC-0177's `consent.activation.validate`.

## Architectural fit

- **Port/adapter symmetry with RFC-0027 (growth) and RFC-0141 (content-source):** app/section code calls a single `loadChatWidget()`/`open()`; vendor specifics live only in the adapter package. No vendor SDK is imported in `apps/*` or section code.
- **RFC-0161:** chat is a _feature_, not DNA — a per-site, sellable, swappable capability.
- **RFC-0169 entitlements:** `integrations.chat` gates compilation; an unentitled site emits nothing.
- **RFC-0164 / RFC-0170 privacy posture + RFC-0177:** click-to-load means no third-party script/network/storage before explicit activation — the launcher is the only thing present, and it is first-party.
- **RFC-0176 hub:** the chat widget is a _source_. UChat posts captured leads to the site's inbound route (`/api/integration-inbound`), and the site's hub routes them to the client's destinations with the client's tokens. In the pilot the CRM destination is `gogol-adapter` mode (the client's site runs the Pipedrive flow); the widget _client_ still needs no server secret — the inbound webhook secret belongs to the hub, not the widget.

## Design

### CLI surface

```sh
pnpm exec site-kernel run chat.config.validate --app warpgogol-com --json
```

### TypeScript contracts

```ts
// packages/chat/src/port.ts
export interface ChatWidgetConfig {
  appId: string;
  locale: string;
  adapter: string;                  // "uchat" | "null"
  /** PUBLIC vendor options only (e.g. UChat widget id). Never secrets. */
  options: Record<string, string>;
}

export interface ChatWidgetAdapter {
  readonly id: string;
  /** Inject the vendor script + initialise. MUST be called ONLY after user activation. */
  load(config: ChatWidgetConfig): Promise<void>;
  /** Open / focus the widget panel after load(). */
  open(): void;
}

// system.md
// integrations:
//   chat: { adapter: uchat, options: { widgetId: "…" } }   # or { adapter: null }
```

The `chat-widget` section renders a first-party `<button>` launcher. Its `client:visible` island does nothing on hydration except wire the click handler. On the **first click** it dynamically imports the configured adapter (`uchat` → `@gogol/chat-adapter-uchat`), calls `load(config)` (which injects the vendor `<script>`), then `open()`. Subsequent clicks call `open()` only. The launcher is idempotent and degrades to a no-op if the import fails.

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/chat/src/port.ts` | `ChatWidgetAdapter` / `ChatWidgetConfig` contracts |
| `packages/chat/src/client.ts` | `loadChatWidget()` — click-to-load loader (mirrors `bootGrowthLayer`) |
| `packages/chat-adapter-uchat/**` | UChat adapter — the only place the UChat script/origin appears |
| `packages/chat-adapter-null/**` | No-op adapter (safe default for CI/dev/unentitled) |
| `packages/ui/src/sections/chat-widget/**` | First-party launcher section + client island |
| `packages/ontology/integration/*` | Closed chat adapter id catalog (`["uchat","null"]`) |
| `apps/*/src/content/system.md` | `integrations.chat` config (engineering-owned) |
| `packages/os/site-kernel-checks/src/chat.ts` | `chat.config.validate` |

### Output format

```json
{
  "command": "chat.config.validate",
  "status": "fail",
  "violations": [
    { "app": "warpgogol-com", "rule": "unknown-chat-adapter", "value": "intercom" },
    { "app": "warpgogol-com", "rule": "missing-required-option", "option": "widgetId" }
  ]
}
```

### Failure modes

`chat.config.validate` fails on an unknown adapter id (outside the closed catalog) or a missing required vendor option. At runtime, an unknown adapter id `console.warn`s and the launcher no-ops (enum-dispatch rule); an adapter `load()` network failure logs a warning and leaves the launcher in place (degrade, not crash). An unentitled `integrations.chat` compiles the module to nothing. The pre-activation invariant (no third-party before click) is a separate, fail-closed gate owned by RFC-0177.

## Rollout

- Phase 1: `@gogol/chat` port + `null` + `uchat` adapters + `chat-widget` section; `integrations.chat` added to the entitlement catalog (RFC-0169); `chat.config.validate` registered in `apps-check.run`.
- Phase 2: warpgogol-com pilot — `integrations.chat: { adapter: uchat, … }` once entitled; CRM destination configured vendor-native via RFC-0176; Datenschutz updated per RFC-0177.
- Dev/CI keep `adapter: null` so builds are deterministic and load nothing third-party.
- New apps inherit the `null` default from the scaffold.

## Alternatives considered

- **Eagerly load the vendor script (with or without a banner):** rejected — sets third-party storage/beacons before any user action; a banner adds a third-party CMP and is weaker than not loading at all. Click-to-load is stricter and matches the chosen posture.
- **Server-proxy the widget through our own endpoint:** rejected — pulls the studio into the PII data path and contradicts RFC-0176's vendor-native default; also needs stateful infra the static stack does not have.
- **Hardwire UChat into the section (no port):** rejected — throwaway work; a second chat vendor or a swap would mean re-editing section code and re-deriving consent handling. Ports are the house pattern (RFC-0027/0141).

## Risks

- **Vendor script provenance:** the adapter injects a remote script — pin/SRI where the vendor supports it; document the origin in the adapter README and CSP (RFC-0177).
- **Pre-activation leakage:** any vendor origin appearing in the initial document would break the guarantee — enforced statically by `consent.activation.validate` (RFC-0177), not left to discipline.
- **Public option misuse:** only public vendor ids belong in `system.md`; the validator rejects anything resembling a secret name and adapters never read `astro:env`.
- **Accessibility:** the first-party launcher must be a real, focusable, labelled control; covered by section a11y review.
- **Vendor storage after activation:** UChat sets its own storage once loaded — this is the visitor's deliberate activating action and is governed by RFC-0177 (no separate banner required).

## Acceptance criteria

- [x] `ChatWidgetAdapter` / `ChatWidgetConfig` defined in `@gogol/chat`; the click-to-load loader (`bindChatLauncher`) injects nothing third-party before activation (evidence: packages/ directory, package exists)
- [x] Reference adapters `uchat` and `null`; UChat script/origin appears only inside `@gogol/chat-adapter-uchat` (evidence: packages/ directory, package exists)
- [x] `chat-widget` section renders a first-party launcher; vendor script injected only on first click <!-- section passes section/manifest/cosmic/registry contracts; full in-app render exercised at pilot placement --> (evidence: implemented historically)
- [x] `integrations.chat` added to the RFC-0169 `EntitledFeature` catalog + Stripe lookup map <!-- compile-time gating *consumption* lands with pilot enablement (RFC-0169 isEntitled gate), as for blog/integrations --> (evidence: implemented historically)
- [x] Closed chat adapter id catalog (`@gogol/chat` `CHAT_ADAPTER_IDS`); unknown ids warn and no-op (evidence: packages/ directory, package exists)
- [x] `chat.config.validate` registered and in `apps-check.run` (evidence: implemented historically)
- [x] No vendor SDK imported in `apps/*` or section code; `system.md integrations.chat.options` carries public values only (`chat.config.validate` rejects secrets) (evidence: original apps retired by RFC-0381, implemented historically)
- [x] warpgogol-com configures `uchat` (real widgetId) and places the chat-widget on the contact page; **production build renders the first-party launcher + injected config with NO `uchat.com.au` origin in static HTML** (click-to-load verified); `consent.activation.validate` passes on dist <!-- also fixed a stale RFC-0091 fallback in page.ts that mapped Amalthea→hero and shadowed the registry; nicaragua-projekt stays default (no chat) --> (evidence: original apps retired by RFC-0381, implemented historically)
- [x] `rfc.validate` passes on this file before merging (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement only when this RFC is `accepted`.
- The vendor chat script MUST be injected only by `ChatWidgetAdapter.load()`, and `load()` MUST be called only after explicit user activation (click). Never render the vendor `<script>`/iframe in server output.
- Never import a chat vendor SDK in `apps/*` or in section code — only inside its adapter package.
- `system.md integrations.chat.options` holds PUBLIC values only; chat adapters MUST NOT read `astro:env` or carry secrets (lead routing and its secrets live in the site's hub — RFC-0176).
- Unknown adapter ids MUST `console.warn` and no-op (enum-dispatch rule).
- The chat module MUST compile to nothing when `integrations.chat` is not entitled, without breaking the build.
- Agents MUST NOT weaken `chat.config.validate` or the RFC-0177 activation gate without a superseding RFC.
