# ONBOARDING_AI.md — WGogol Agent Surface

> **Purpose.** A one-read, ~5-minute initialization guide for an AI agent connecting to a WGogol site for the **first time**. Focus: resource **discovery** + a minimal **integration checklist**. This file is introductory and disposable — after your first successful session, the authoritative contracts are the site's own manifests and the RFCs referenced below.
>
> **Audience router.**
>
> - **External tool-calling agent** (MCP / HTTP client) integrating with a deployed site → this file.
> - **Repository contributor agent** (editing this monorepo) → read `AGENTS.md` (root) first; this file is only your map of the runtime surface.

---

## 0. Project context (read once)

- **Project:** WGogol — a Turborepo monorepo of Astro 6 sites that compose themselves from shared packages.
- **Essence:** Each site is a thin, self-composing, decades-scale **digital asset** for small businesses. Sites are explicitly designed to interoperate with AI agents, with each other, and with external businesses.
- **Reference deployment:** `webgogol.com` (`baseUrl = https://webgogol.com`). Substitute `<baseUrl>` with the origin of the site you are connecting to.
- **The network you are joining — the "Agent Surface" (RFC-0286..0292).** Every site exposes **one** generated capability manifest with three tiers:
  - **Knowledge** — static JSON facts, free and cacheable (read).
  - **Actions** — a closed catalog of typed verbs executed through the site's Integration Port (write, entitlement-gated).
  - **Discovery** — a signed well-known document that projects both tiers into MCP + OpenAPI.

### Canonical endpoints

| Purpose                         | Path (relative to `<baseUrl>`)           | Method |
| ------------------------------- | ---------------------------------------- | ------ |
| Discovery manifest              | `/.well-known/agent.json`                | `GET`  |
| OpenAPI 3.1 projection          | `/.well-known/agent.openapi.json`        | `GET`  |
| Identity public key (Ed25519)   | `/.well-known/cosmic-passport-key.json`  | `GET`  |
| **MCP endpoint** (JSON-RPC 2.0) | `/api/agent/mcp`                         | `POST` |
| Action invocation               | `/api/agent/actions/<id>`                | `POST` |
| Knowledge file                  | `/api/agent/v1/<domain>.json`            | `GET`  |
| LLM text surface                | `/llms.txt`, `/llms-full.txt`, `/ai.txt` | `GET`  |
| Markdown page twins             | `/<route>/index.md`                      | `GET`  |

**MCP protocol version is pinned:** `2025-06-18`. Transport is the **stateless** Streamable HTTP subset only (single JSON request → single JSON response). No sessions, no SSE, no batching.

---

## 1. Identity (how you introduce yourself)

The read tier is **public and unauthenticated** — no key, token, or handshake is required to fetch knowledge. Identity is **observe-first** (RFC-0291): you SHOULD identify yourself; the surface records it but does not gate on it in v1.

### 1.1 HTTP headers (every request)

```http
User-Agent: <agent-name>/<version> (+<operator-contact-url>)
Content-Type: application/json
# Optional, Web Bot Auth (observe-only in v1; attached to the event as _agentIdentity, never persisted):
Signature-Agent: "<agent-directory-url>"
Signature: <http-message-signature>
```

- Do **not** send `Mcp-Session-Id` — the endpoint is stateless and never issues or accepts one.

### 1.2 MCP handshake (`initialize`)

Your first MCP call MUST be `initialize`. Carry your identity in `clientInfo`.

**Request** → `POST <baseUrl>/api/agent/mcp`

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "initialize",
  "params": {
    "protocolVersion": "2025-06-18",
    "capabilities": {},
    "clientInfo": { "name": "acme-agent", "version": "1.2.0" }
  }
}
```

**Expected response**

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "protocolVersion": "2025-06-18",
    "capabilities": { "tools": {}, "resources": {} },
    "serverInfo": { "name": "webgogol-com agent surface", "version": "1.0.0" }
  }
}
```

### 1.3 Logging your first contact

- **Server side:** the gate reads `User-Agent` / `Signature-Agent` / `Signature`, counts them in gate logs, and (for actions) attaches them to the transient event payload as `_agentIdentity`. It **never persists** IPs, headers, or events beyond the in-flight request (privacy boundary, RFC-0177). Do not expect a durable agent registry.
- **Your side (required for reproducibility):** on first contact, record locally — `baseUrl`, `surfaceVersion`, `contentHash`, negotiated `protocolVersion`, and a UTC timestamp. Pin `surfaceVersion` + `contentHash` so you can detect surface drift on later sessions.

---

## 2. Discovery & context mapping

### 2.1 Runtime artifacts (fetch from `<baseUrl>`)

- **Start here:** `GET /.well-known/agent.json` — the manifest. It lists `surfaceVersion`, `contentHash`, `languages`, `knowledge[]`, `actions[]`, and `interfaces` (llms, twins, openapi, mcp). This is the single source; every other surface is a projection of it.
- **API schema:** `GET /.well-known/agent.openapi.json` — OpenAPI 3.1 for OpenAPI-native tooling.
- **Trust anchor:** `GET /.well-known/cosmic-passport-key.json` — the Ed25519 `publicKeyMultibase` used to verify the manifest `proof`.
- **Knowledge domains (public):** `company`, `contact`, `faq`, `legal`, `location`, `offer`, `people`, `web` (a site emits only its populated domains). Each file is an envelope:

```json
{
  "schema": "gogol.agent.knowledge/offer@1",
  "site": "webgogol-com",
  "baseUrl": "https://webgogol.com",
  "languages": { "default": "de", "supported": ["de", "uk"] },
  "contentHash": "<sha256-hex>",
  "freshness": { "lastVerified": "2026-06-18" },
  "data": { "de": { }, "uk": { } }
}
```

> `freshness.lastVerified` is present **only** when the content ledger covers those facts. If it is absent, treat the fact as unverified — never assume it is fresh.

### 2.2 Repository artifacts (only if you are inspecting the monorepo, not a deploy)

- **Manifest types + pure formatters:** `packages/share/src/agent/`
- **Closed capability catalog (the only place actions are defined):** `packages/ontology/capabilities/*.yaml`
- **Gate runtime (MCP + action handlers, framework-agnostic):** `packages/agent-gate/`
- **Generated per-site artifacts (do not hand-edit):**
  - `<site-workspace>/src/agent-surface.generated.json` (internal manifest; git-ignored, per-build)
  - `<site-workspace>/public/.well-known/agent.json` (public projection; git-ignored)
  - `<site-workspace>/src/pages/api/agent/**` (thin generated re-export routes)
- **Instruction layer for contributors:** `AGENTS.md` (root) → `docs/authoring/site-composition.md` / `packages/AGENTS.md`.
- **Governing RFCs:** `docs/rfcs/rfc-0286..rfc-0292` (surface, knowledge, catalog, OpenAPI, MCP, trust, fleet).

### 2.3 Environment variables & credentials

- **Consuming the Agent Surface:** no key or sandbox token is required. The read tier is open; the action tier is public but rate-limited (see §4). There is no per-agent API key in v1.
- **Repository / deployment secrets** live in **git-ignored** `.env` files and are injected at deploy time. Reference by **name only** — never read, echo, or commit their values:
  - Root `.env`: `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `OPENAI_API_KEY`, `PASSPORT_SIGNING_KEY` (used by dev tooling / manifest signing).
  - Per-site `<site-workspace>/.env` & `.env.production`: `UPSTASH_QSTASH_TOKEN`, `UPSTASH_*`, `STRIPE_*`, `PASSPORT_SIGNING_KEY`, `PUBLIC_IMAGE_PROVIDER`.
  - Deploy/CI: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `LLM_API_KEY`.

> **Security invariant.** Only the **public** key (`cosmic-passport-key.json`) is ever committed. Any private key or token is out of scope for an onboarding agent. Do not log, transmit, or persist secret values.

---

## 3. Step-by-step initialization checklist

Execute in order. Do not proceed to the next step until the expected result holds.

1. **Fetch discovery.** `GET <baseUrl>/.well-known/agent.json`.
   - _Expected:_ `200` JSON manifest with `surfaceVersion`, a non-empty `contentHash`, and an `interfaces.mcp` object. Cache `surfaceVersion` + `contentHash`.
2. **Verify identity (recommended).** `GET /.well-known/cosmic-passport-key.json`; if the manifest `proof` is non-null, verify the Ed25519 signature over the manifest's canonical bytes (sorted-key JSON minus `proof`).
   - _Expected:_ signature valid → surface is authentic. `proof: null` → unsigned (dev/sandbox); continue but do not treat the surface as verified.
3. **MCP handshake.** `POST /api/agent/mcp` with the `initialize` payload from §1.2.
   - _Expected:_ `result.protocolVersion === "2025-06-18"` and a `serverInfo`. If the server returns a different version, either speak it or disconnect.
4. **Enumerate capabilities.** Call `tools/list` (and, for reads, `resources/list`).
   - _Expected:_ one `knowledge.<domain>.get` tool per knowledge domain, plus one `action.<id>` tool per active action (e.g. `action.lead.submit`). Each action tool carries an `inputSchema`.
5. **Safe read + validate before writing.** Call a `knowledge.*.get` tool (idempotent read) to confirm the data path, and inspect the target `action.*` `inputSchema`. Validate any candidate payload against that schema **locally** first.
   - _Expected:_ knowledge content returned as text. You now hold a validated understanding of every write action — you are initialized. Invoke a write action only after this step.

---

## 4. Guardrails (sandbox rules)

### Forbidden until initialization (§3) completes

- **No writes before discovery + handshake + `tools/list`.** Do not `POST /api/agent/actions/*` or call `tools/call` on an `action.*` tool until you have validated its `inputSchema` (step 5).
- **No hidden-endpoint probing.** Human parity (AS-2) guarantees the surface exposes nothing that is absent from the visible site. Only use URLs published in the manifest; do not enumerate or guess routes.
- **No secrets in payloads.** Never place credentials, tokens, or unrelated PII in an action payload. Inputs are schema-validated and size-capped.

### Protocol constraints (always)

- **Stateless only.** No `Mcp-Session-Id`, no SSE/streaming, no JSON-RPC **batch** arrays (rejected with `-32600`). `GET /api/agent/mcp` → `405`.
- **Pinned method set only:** `initialize`, `ping`, `tools/list`, `tools/call`, `resources/list`, `resources/read`. Anything else → `-32601` (method not found). Do not invent methods or capabilities.
- **Respect declared limits.** Each capability declares `limits.perMinutePerIp` and `limits.maxPayloadBytes`. Over-limit → `429` (HTTP) / `-32000` with `retryAfterSeconds` (MCP); over-size → `413`. Back off; do not retry-storm.

### Error handling & escalation

- **Idempotent retries only.** On a dispatch failure — HTTP `502` or JSON-RPC `-32000` with `retryable: true` — the event was **not** accepted; retry with the **same** `eventId` (dedup makes this safe). Never blind-retry a write with a new id.
- **`503` = misbuilt deploy** (manifest missing at runtime). Abort; do not retry writes; the surface is not ready.
- **Capture the full error object.** Log the JSON-RPC `error` (`code`, `message`, `data`) or the HTTP status + body for every failed init step, to your **own operator/session log**.
- **Where to address logs:**
  - _Surface defects on a live site_ → the site's published human contact (from the `contact` knowledge file; for the reference site, `hi@webgogol.com`). The surface does not accept out-of-band log ingestion.
  - _Repository/contract issues_ (if you are a contributor agent) → follow the RFC process in `docs/rfcs/` and the rules in `AGENTS.md`; never hand-edit generated files, and reference the relevant RFC in commit messages.

---

_This document is an entry guide, not a contract. On any conflict, the live `/.well-known/agent.json` manifest and RFC-0286..0292 are authoritative._
