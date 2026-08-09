---
id: RFC-0177
title: "Codify storage and third-party-script policy for consent-gated widgets"
status: implemented
kind: contract
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
  - RFC-0181
related:
  - RFC-0096
  - RFC-0164
  - RFC-0168
  - RFC-0170
  - RFC-0174
  - RFC-0175
  - RFC-0176
commands:
  proposed: []
  added:
    - consent.activation.validate
    - legal.processors.validate
  changed:
    - apps-check.run
  removed: []
appsImpacted:
  - apps/*
packagesImpacted:
  - packages/os/site-kernel-checks
  - packages/ui
  - packages/share
successSignals:
  - "First-party code remains cookie-free; the only third-party storage on a site comes from a widget the visitor explicitly activated."
  - "consent.activation.validate fails the build if any third-party script, iframe, or origin appears in a page's server output before user activation."
  - "A site with a chat widget or an external destination names the vendor as processor and its recipients in the Datenschutz/Privacy Policy and records the studio↔client DPA — checked by legal.processors.validate."
nonGoals:
  - "Do not introduce a cookie banner or third-party consent-management platform — activation by click is the consent gate (strict click-to-load)."
  - "Do not carve a first-party cookie exception — the first-party cookie prohibition stays absolute."
  - "Do not build a datastore of visitor/lead data — credentials may be stored, visitor PII may not (transient in-flight only)."
---

# RFC-0177: Codify storage and third-party-script policy for consent-gated widgets

## Context

Three facts must be reconciled. (1) The ecosystem **forbids cookies repository-wide** — [AGENTS.md storage policy](../../AGENTS.md): "No `document.cookie`, `Set-Cookie`, or cookie-based middleware"; analytics is cookieless (RFC-0170); fonts were self-hosted to delete a third-party hotlink (RFC-0164). (2) The chat widget (RFC-0175) is a **third-party client script** that sets its own storage and processes PII for visitors in Germany/the EU, where ePrivacy + GDPR and recent German cookie-banner case law are strict. (3) The integration hub (RFC-0176) runs **on the client's site with the client's tokens** and uses a **Cloudflare Queue** for reliable delivery — which means real, if narrow, server-side state (credentials; in-flight events) now exists.

The chosen resolution is **strict click-to-load** for the widget, plus a precise statement of what server-side storage is and is not permitted. This RFC codifies it as a checked contract so the policy is enforced, not folklore.

## Problem

- The storage policy reads as an absolute "no cookies," which appears to forbid both the chat widget and the hub's credential/queue state; teams need a precise written rule.
- Without a mechanical gate, "click-to-load" relies on discipline; a future edit could eagerly inject the vendor script and silently reintroduce pre-consent third-party storage.
- Routing PII through the client's site (with client tokens, via UChat as processor → recipients like Pipedrive) imposes GDPR duties — processor naming, legal basis, retention, DSAR, and a studio↔client DPA — currently undocumented and unchecked.

## Decision

The storage / third-party-script policy is codified with the following clauses, plus two checks in `apps-check.run`:

1. **First-party cookie prohibition — unchanged and absolute.** Code in `apps/*` and `packages/*` MUST NOT read or write `document.cookie` / `Set-Cookie` / cookie libraries. No exception.
2. **Consent-gated third-party widget storage — permitted.** A widget MAY set its own storage, only because (a) it loads solely on the visitor's explicit activation (click-to-load, RFC-0175) and (b) the storage is set by the _vendor's_ origin, never by studio code. Activation is the lawful basis; **no cookie banner / CMP is required**.
3. **Pre-activation invariant (fail-closed):** no third-party script, iframe, network request, or storage before explicit user activation. The only pre-activation artifact is a first-party launcher (pure HTML/CSS).
4. **Server-side storage — credentials yes, visitor data no.** The client's API tokens and **OAuth refresh tokens** (needed for calendar/email destinations, RFC-0176) MAY be stored server-side (encrypted, secret-scoped env/KV on the client's deploy). Visitor/lead PII and conversation history MUST NOT be persisted: the hub's delivery queue holds events **in-flight only** (transient), and dedup state is a short-TTL key, never a record of truth. The studio does not become a CRM.
5. **Processor disclosure + DPA.** Because the client's site (operated/hosted by the studio) is in the PII path, the studio is a **per-client data processor** under a **DPA** (Cloudflare a sub-processor). Any configured chat widget or external destination MUST be disclosed: vendor as processor, downstream recipients, purpose, legal basis, data categories, retention, DSAR path — in the Datenschutz/Privacy Policy.
6. **EU-resident in-flight delivery (RFC-0181, amending RFC-0179).** Reliable delivery runs on **Upstash QStash (EU region, eu-central-1)** with an Upstash Redis (EU) idempotency ledger — not a studio-operated shared queue, and **not** Cloudflare Queues/KV (which cannot be EU-pinned). Lead PII **transits QStash in-flight only** (no datastore; the Redis ledger holds short-TTL `eventId` keys, never PII), and the routing adapter executes inside the client's own site with the client's tokens (tokens never leave the site). The DPA MUST name **Upstash as a (sub-)processor** under SCC + EU-U.S. Data Privacy Framework, and state that lead data is **physically resident in the EU (Frankfurt)**. It MUST NOT overclaim sovereignty: Upstash is US-incorporated, so residual CLOUD Act exposure is closed **contractually, not structurally** — clients requiring structural sovereignty (no US parent) need the documented tier-2 (EU-incorporated/self-hosted) substrate. True EU execution additionally requires Regional Services (EU) on the site's zone.

`consent.activation.validate` (no third-party before activation) and `legal.processors.validate` (disclosure + DPA marker present when a widget/external destination is configured) join `apps-check.run`. The AGENTS.md storage-policy section gains clauses 2 and 4.

## Architectural fit

- **AGENTS.md storage policy:** clause 1 restates the existing ban verbatim; clauses 2 and 4 are additive and narrow (an activated widget's own storage; server-side credentials + transient in-flight events). The "no cookies in our code" guarantee is untouched.
- **RFC-0175:** provides the click-to-load mechanism this policy mandates; `consent.activation.validate` proves it holds.
- **RFC-0176:** the hub runs on the client's site with the client's tokens — clause 4 sanctions its credential/OAuth storage and its transient queue while forbidding a visitor-data store; clause 5 covers the resulting processor/DPA relationship.
- **RFC-0164 / RFC-0170:** same privacy posture (no third-party hotlinks, no cookies in our code), extended to an explicitly-activated widget.
- **RFC-0096 / RFC-0174:** the processor/recipient disclosure lives in the existing legal scaffold (Datenschutz/Impressum) under the binding-language rules.

## Design

### CLI surface

```sh
pnpm exec werkstatt run consent.activation.validate --all --json
pnpm exec werkstatt run legal.processors.validate --app warpgogol-com --json
```

### Policy contract

```text
Storage & third-party policy (codified):
  1. First-party code (apps/*, packages/*): NO document.cookie / Set-Cookie / cookie libs. Absolute.
  2. A third-party widget MAY set its own storage IFF loaded only by explicit user activation
     (click-to-load) AND storage is set by the vendor origin, not studio code.
  3. Before activation: zero third-party script / iframe / network / storage. First-party launcher only.
  4. Server-side: client API tokens + OAuth refresh tokens MAY be stored (encrypted, secret-scoped,
     on the client's deploy). Visitor/lead PII + conversation history MUST NOT be persisted — the
     delivery queue is in-flight only; dedup state is a short-TTL key. No CRM/datastore of leads.
  5. The studio is a per-client processor under a DPA (Cloudflare a sub-processor). Any widget /
     external destination MUST be disclosed: processor, recipients, purpose, legal basis, data
     categories, retention, DSAR path — in Datenschutz/Privacy Policy.
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `AGENTS.md` (storage policy section) | Restates clause 1; adds clauses 2 + 4 (widget storage; credentials-yes/visitor-data-no) |
| `packages/os/site-kernel-checks/src/consent.ts` | `consent.activation.validate` — scans server output for pre-activation third-party origins |
| `packages/business/src/schemas/legal.ts` | `legal.processors.validate` — disclosure + DPA marker present when a widget/external destination is configured |
| `packages/ui/src/sections/chat-widget/**` | In-widget legal line + link before contact fields (config requirement) |
| `apps/*/src/content/prose/*/datenschutz.md` | Processor (UChat) + recipient (Pipedrive) disclosure; DPA reference |

### Output format

```json
{
  "command": "consent.activation.validate",
  "status": "fail",
  "violations": [
    { "app": "warpgogol-com", "rule": "third-party-before-activation", "origin": "widget.uchat.com.au", "page": "/" }
  ]
}
```

```json
{
  "command": "legal.processors.validate",
  "status": "fail",
  "violations": [
    { "app": "warpgogol-com", "rule": "missing-processor-disclosure", "processor": "uchat" },
    { "app": "warpgogol-com", "rule": "missing-dpa-reference", "scope": "studio-client" }
  ]
}
```

### Failure modes

`consent.activation.validate` fails (non-zero) if any third-party origin, `<script src>`, or `<iframe>` for a configured widget vendor appears in a page's server-rendered HTML or in the initial CSP `connect-src`/`script-src` before activation. `legal.processors.validate` fails if a site configures a chat widget (RFC-0175) or an external destination (RFC-0176) without the corresponding processor/recipient disclosure and DPA reference in its Datenschutz. Both are fail-closed: a privacy-relevant omission blocks the build. Clause 4 (no visitor-data persistence) is a code-level invariant enforced in review and by the hub's transient-only queue design (RFC-0176).

## Rollout

- Codify clauses in AGENTS.md; add `consent.activation.validate` and `legal.processors.validate`; register both in `apps-check.run`.
- warpgogol-com pilot: update `de`/`uk` Datenschutz to name UChat (processor) and Pipedrive (recipient) — purpose, legal basis (activation), data categories, retention, DSAR path — and reference the studio↔client DPA, under RFC-0174 binding-language rules; add the in-widget legal line.
- Both reference apps build green with no widget/external destination configured (validators no-op when absent).

## Alternatives considered

- **Cookie banner / third-party CMP:** rejected — adds a third-party script and maintenance and is _weaker_ than click-to-load (a banner still implies an always-present script). Not loading until activation is the stronger control.
- **General post-consent storage exception for any module:** rejected — broadens the surface; the policy stays strict, the widget carve (clause 2) and the server-side carve (clause 4) are narrow and explicit.
- **Forbid all server-side state (pure stateless hub):** rejected — would block calendar/email (OAuth refresh tokens) and reliable delivery (queue); clause 4 permits _credentials + in-flight events_ while still forbidding a visitor-data store.
- **Ban the chat widget outright:** rejected — kills a deliberate paid product; click-to-load + disclosure + DPA make it compliant without abandoning the posture.

## Risks

- **Vendor beacons on load:** UChat may set storage/beacons the instant its script runs — acceptable because the script runs only post-activation (the visitor's consenting act); documented in the disclosure.
- **German practice expectation:** two-click / click-to-load (Shariff-style) is an accepted GDPR pattern precisely because it avoids pre-consent loading — often stronger than a banner. Re-evaluate if a client's DPO requires an explicit pre-chat opt-in checkbox.
- **Credential storage:** OAuth refresh tokens are high-value secrets — store encrypted, secret-scoped, server-only; never expose to the client; rotate on revocation.
- **DSAR / deletion:** lead/conversation data lives in the client's destinations (UChat/Pipedrive/calendar), not on the site (clause 4) — DSAR/deletion are fulfilled by the client there; document responsibility per RFC-0174.
- **Gate evasion:** a future edit could inject the vendor script eagerly — `consent.activation.validate` is the standing guard and must run in CI.

## Acceptance criteria

- [x] AGENTS.md storage policy updated: clause 1 restated; clauses 2 (widget storage) + 4 (credentials-yes/visitor-data-no) added (evidence: AGENTS.md:1, agent guide updated)
- [x] `consent.activation.validate` fails on any third-party script/iframe/origin in server output before activation; in `apps-check.run` (postbuild) (evidence: implemented historically)
- [x] `legal.processors.validate` fails when a widget/external destination is configured without a processor + recipients disclosure and a DPA reference; in `apps-check.run` (author) (evidence: implemented historically)
- [x] First-party cookie prohibition unchanged; no first-party cookie exception introduced (evidence: implemented historically)
- [x] Server-side credential/OAuth storage permitted; visitor/lead PII + conversation history not persisted (queue in-flight only — composes with RFC-0176) (evidence: implemented historically)
- [x] warpgogol-com Datenschutz names UChat (processor) + Pipedrive (recipient) + Art. 28 Auftragsverarbeitung (DPA) — pre-existing comprehensive disclosure; `legal.processors.validate` passes with chat configured (2 vendors disclosed + DPA reference) (evidence: implemented historically)
- [x] In-widget legal line + Privacy Policy link required before contact fields (chat-widget config) <!-- chat-widget section props: legalNotice + privacyPolicyPageId (semantic ref, resolved per-locale) required --> (evidence: implemented historically)
- [x] Both reference apps build green; validators no-op when nothing is configured <!-- validators verified no-op pass on warpgogol-com + nicaragua-projekt --> (evidence: original apps retired by RFC-0381, implemented historically)
- [x] `rfc.validate` passes on this file before merging (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement only when this RFC is `accepted`.
- The first-party cookie prohibition is ABSOLUTE — never add `document.cookie`/`Set-Cookie`/cookie libs to `apps/*` or `packages/*`, and never weaken it.
- A third-party widget's storage is permitted ONLY behind click-to-load (RFC-0175); never render a vendor `<script>`/iframe in server output or load it before activation.
- Server-side: client API tokens + OAuth refresh tokens MAY be stored (encrypted, secret-scoped, server-only). Visitor/lead PII and conversation history MUST NOT be persisted — the delivery queue is in-flight only; dedup is a short-TTL key.
- When a widget or external destination is configured, the processor + recipients disclosure AND the studio↔client DPA reference are mandatory (fail-closed via `legal.processors.validate`).
- Disclosure copy is authored legal content under RFC-0174 binding-language rules — do not auto-translate or alter its meaning.
- Agents MUST NOT weaken `consent.activation.validate` or `legal.processors.validate` without a superseding RFC.
