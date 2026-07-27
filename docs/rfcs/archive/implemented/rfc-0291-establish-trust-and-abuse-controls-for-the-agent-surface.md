---
id: RFC-0291
title: "Establish trust and abuse controls for the agent surface"
status: implemented
kind: contract
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-07-05
updatedAt: 2026-07-14
implementedAt: 2026-07-14
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0028
  - RFC-0176
  - RFC-0177
  - RFC-0181
  - RFC-0213
  - RFC-0286
  - RFC-0287
  - RFC-0288
  - RFC-0290
commands:
  proposed:
    - agent.manifest.verify
  added:
    - agent.manifest.verify
  changed:
    - agent.manifest.generate
    - agent.surface.validate
  removed: []
appsImpacted:
  - apps/*
packagesImpacted:
  - "@gogol/agent-gate"
  - "@gogol/passport"
  - "@gogol/share"
  - "@gogol/site-kernel-checks"
successSignals:
  - "A third party can cryptographically verify that a site's agent.json was produced by the site's passport keyholder, using only the two public .well-known documents."
  - "An agent-invoked action is bounded: schema-validated, size-capped, per-IP rate-limited, and idempotent — a misbehaving or malicious agent cannot flood a client's CRM or destinations."
  - "Knowledge responses carry CKL freshness where the ledger covers them, so a consuming agent can weigh a fact by when it was last verified."
  - "Web Bot Auth signatures, when presented, are recorded — the ecosystem accumulates real data on verified agent traffic before deciding on enforcement."
nonGoals:
  - "Do not require authentication for the read tier — knowledge is public visibility by decision (RFC-0286); signing proves origin, it does not restrict access."
  - "Do not block unidentified agents in v1 — identity handling is observe-first; enforcement thresholds are a future RFC once data exists."
  - "Do not build per-agent API keys, quotas, or billing — that is a possible future entitlement tier, out of scope."
  - "Do not add a CAPTCHA to agent routes — the surface exists to be used by machines; abuse is bounded by limits, not liveness tests."
acceptance:
  - probe: command-registered
    name: "agent.manifest.verify"
  - probe: file-exists
    path: "packages/share/src/agent/proof.ts"
  - probe: run
    command: "site-kernel run agent.surface.validate --app webgogol-com"
    expect:
      exitCode: 0
  - probe: file-contains
    path: "packages/agent-gate/src/actions.ts"
    pattern: "perMinutePerIp"
---

# RFC-0291: Establish trust and abuse controls for the agent surface

## Context

RFC-0286..0290 make every site machine-consumable and machine-actionable. Two consequences need first-class treatment.

**Trust.** A decades-scale digital asset must let strangers verify what they are talking to. The ecosystem already holds the primitive: every passport-enabled site commits an Ed25519 public key at `public/.well-known/cosmic-passport-key.json` and signs its cosmic passport (RFC-0028; `@gogol/passport` exposes `signBytes`/`verifyBytes` and multibase helpers). The agent surface should inherit that identity, not invent a second one. Freshness is the other half of trust: CKL (RFC-0211/0213) records when facts were last verified; RFC-0287 already surfaces `freshness.lastVerified` in knowledge envelopes — this RFC extends it to runtime responses.

**Abuse.** The action tier is a public write path into a client's CRM/calendar. The substrate already gives idempotency and dedup (RFC-0176/0181 `eventId`), and RFC-0288 capability records already declare `limits`. What is missing is enforcement at the gate and a policy for agent identity headers (Web Bot Auth / HTTP Message Signatures are emerging but not yet universal — the correct v1 posture is observe, log, and keep the enforcement switch ready).

## Problem

- `agent.json` is unauthenticated: any MITM or typosquatted deploy could present a forged capability list; nothing ties the surface to the site's cryptographic identity.
- `limits` in capability records are declarative only; the gate accepts unlimited request volume.
- MCP/HTTP responses carry no freshness, so agents cannot distinguish verified facts from stale ones at the point of consumption.
- There is no post-deploy check that the served surface matches the built surface (the passport has `passport.verify`; the agent surface has nothing).

## Decision

Three additions, all inside existing components:

1. **Signing.** `agent.manifest.generate` (changed) signs the discovery document with the passport private key: `proof` (shape per RFC-0286 `AgentSurfaceProof`) is an Ed25519 signature over the canonical bytes of `agent.json` minus the `proof` field (sorted-key JSON, UTF-8 — same canonicalization discipline as `credentialBytes` in `@gogol/passport`). Key absent (dev/CI) ⇒ `proof: null` + build warning, never a failure. A new post-deploy command `agent.manifest.verify --url <origin>` fetches `/.well-known/agent.json` + the passport key and verifies: signature, `contentHash`, and that every referenced URL responds (HEAD/GET 200).
2. **Gate enforcement.** `@gogol/agent-gate` enforces, per action invocation (HTTP and MCP paths identically): payload size ≤ `limits.maxPayloadBytes` (`413`); schema validation (`400`/`-32602`, already in RFC-0290); per-IP fixed-window rate limit of `limits.perMinutePerIp` (`429` with `Retry-After`, JSON-RPC `-32000` with `retryAfterSeconds`), implemented as an in-isolate LRU counter — **best-effort by design** (per-isolate, resets on eviction); platform-level WAF rules are a deferred phase (nonGoal for v1, noted in Risks). `eventId` idempotency remains substrate-owned.
3. **Identity + freshness passthrough.** The gate reads `Signature-Agent` / `Signature` / `User-Agent` headers; when present, their values are attached to the `IntegrationEvent.payload._agentIdentity` (observe-only; destinations ignore unknown payload keys) and counted in gate logs. Knowledge tool/resource responses (RFC-0290) append the envelope's `freshness` into MCP `_meta["gogol.dev/freshness"]`; HTTP consumers already get it from the envelope itself.

## Architectural fit

- **One identity (RFC-0028).** Same keypair, same multibase encoding, same `.well-known` trust directory; `agent.manifest.verify` mirrors `passport.verify`'s post-deploy role. Key rotation (existing `key-rotate` flow) automatically covers the agent surface — no second rotation procedure.
- **Privacy (RFC-0177).** Nothing new is persisted: rate-limit counters are in-memory and short-lived; `_agentIdentity` rides inside the existing transient event, subject to the same in-flight-only rule. The studio still stores no leads and no agent registry.
- **RFC-0288 owns the numbers.** Limits stay in capability YAML — tightening a limit is a catalog change, not a code change. The gate only enforces.
- **AS-7.** Verification binds `surfaceVersion` + `contentHash` + signature: a consumer can pin all three.

## Design

### CLI surface

```sh
pnpm exec site-kernel run agent.manifest.verify --app webgogol-com --url https://webgogol.com --json
```

App-scoped, network-performing, **never** in `build.check` (post-deploy gate, like `passport.verify`). Local mode (`--url` omitted): verifies the signature of the freshly generated `public/.well-known/agent.json` against the committed public key — this mode IS safe for pipelines and is added to `APPS_CHECK_PIPELINE` guarded by key-material presence (skips with a note when the site has no passport key).

### TypeScript contracts

```ts
// packages/share/src/agent/proof.ts
/** Canonical bytes: sorted-key JSON of the manifest document with `proof` removed, UTF-8. */
export function agentManifestCanonicalBytes(doc: Record<string, unknown>): Uint8Array;
export async function signAgentManifest(doc, privateKeyHex): Promise<AgentSurfaceProof>;   // via @gogol/passport signBytes
export async function verifyAgentManifest(doc, publicKeyMultibase): Promise<{ ok: boolean; reason?: string }>;

// packages/agent-gate/src/limits.ts
export interface RateLimiter { check(key: string): { allowed: boolean; retryAfterSeconds: number } }
export function createFixedWindowLimiter(windowSeconds: 60, maxPerWindow: number): RateLimiter;
// key = `${capabilityId}:${clientIp}`; clientIp from CF-Connecting-IP, else "unknown" (shared bucket)
```

### Output format

`agent.manifest.verify --json`:

```json
{
  "command": "agent.manifest.verify",
  "status": "fail",
  "checks": [
    { "check": "signature", "ok": true },
    { "check": "content-hash", "ok": true },
    { "check": "ref-reachability", "ok": false, "detail": "/api/agent/v1/offer.json → 404" }
  ]
}
```

`agent.surface.validate` gains:

| Rule | Severity | Meaning |
| --- | --- | --- |
| `AGS-08` | error | Passport key present but generated `agent.json` has `proof: null` (signing silently skipped). |
| `AGS-09` | error | `proof` present but invalid against the committed public key. |
| `AGS-10` | warning | Site has no passport key material — agent surface ships unsigned (upgrade note, not a failure). |

### Failure modes

- Signing never blocks a build: no key ⇒ unsigned + `AGS-10` warning. Bad key material (present but unusable) ⇒ hard error at generate time (misconfiguration must not ship half-signed).
- Rate limiting is fail-open on limiter internals (a limiter bug must not take the action tier down) but fail-closed on the size cap and schema (those are correctness, not throttling).
- `agent.manifest.verify --url` network errors are failures of the check, reported per-ref, exit non-zero — it is a deploy gate, pessimism is correct.

## Rollout

1. Ship `proof.ts` + signing in the generator + `AGS-08..10`; webgogol-com (passport-enabled) signs immediately; sites without passports ship unsigned with the warning.
2. Ship gate enforcement (limits + identity passthrough + freshness `_meta`); fixtures extended (429 fixture, oversize fixture, identity-passthrough fixture) — `agent.gate.fixtures.run` stays the regression gate.
3. Add `agent.manifest.verify` local mode to `APPS_CHECK_PIPELINE`; document the `--url` mode next to `passport.verify` in deploy runbooks.
4. Phase 2 (separate change, same RFC scope, may trail): `site-kernel-deploy` emits a Cloudflare rate-limit rule for `/api/agent/*` into `wrangler.jsonc` as defense-in-depth under the platform limiter; until then the in-gate limiter is the only throttle and is documented as best-effort.
5. Future (new RFC, data-driven): enforcement tiers for verified agent identity (Web Bot Auth), per-agent quotas as a paid tier.

## Alternatives considered

- **A dedicated agent-surface keypair.** Rejected: two identities to rotate, publish, and explain; the passport key is already the site's public identity anchor.
- **JWS/JOSE envelope for agent.json.** Rejected: the passport already established raw Ed25519 + multibase + canonical bytes; consistency beats format plurality, and verification stays dependency-free.
- **Durable Object / KV-backed exact rate limiting.** Rejected for v1: adds bindings and cost per site for marginal gain over in-isolate limiting + platform WAF phase 2; revisit if real abuse data demands exactness.
- **Requiring signed agent identity to invoke actions.** Rejected: adoption of Web Bot Auth is early; requiring it today zeroes the action tier's utility. Observe-first, enforce when the ecosystem matures.
- **Turnstile on action routes.** Rejected: liveness tests select for humans — the opposite of this surface's purpose.

## Risks

- **Best-effort limiter honesty.** Per-isolate counting undercounts across isolates/colos; the RFC states it plainly and phase 2 adds the platform layer. The bound that matters (CRM flood) is also protected by dedup + destination-side idempotency.
- **Key compromise.** A stolen passport key now also signs agent surfaces — rotation procedure unchanged, blast radius documented in the existing key-rotation doc (update it as part of acceptance).
- **`_agentIdentity` payload growth.** Header values are capped (1 KB total, truncated) before attachment to keep events lean and avoid log-amplification.
- **Verification availability coupling.** `ref-reachability` makes the verify gate sensitive to CDN hiccups; it retries once per ref before failing.

## Acceptance criteria

- [x] `packages/share/src/agent/proof.ts` with canonicalization + sign/verify (unit-tested: stable bytes, tamper detection, key-absent path), reusing `@gogol/passport` primitives. (evidence: packages/ directory, package exists)
- [x] `agent.manifest.generate` signs when key material exists; `AGS-08..10` registered and enforced. (evidence: implemented historically)
- [x] `agent.manifest.verify` registered: local mode in `APPS_CHECK_PIPELINE` (key-gated skip), `--url` mode documented as post-deploy. (evidence: implemented historically)
- [x] Gate enforces size cap, schema, and per-IP limit on both invocation paths; fixtures extended and green; limits read exclusively from capability records. (evidence: implemented historically)
- [x] Identity headers passed through as `payload._agentIdentity` (capped), never persisted outside the transient event. (evidence: implemented historically)
- [x] Knowledge freshness present in MCP `_meta` where envelopes carry it. (evidence: implemented historically)
- [x] Key-rotation doc updated to mention the agent surface; both apps `build:check` green. (evidence: implemented historically)
- [x] `rfc.validate` passes on this file. (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented). Requires RFC-0286 (signing target) and RFC-0290 (gate) implemented; knowledge freshness parts additionally need RFC-0287.
- Agents MAY transition `accepted` → `implemented` per RFC-0224 once all criteria are checked and committed.
- NEVER log or persist client IPs, header values, or events beyond the in-flight event (RFC-0177 boundary). NEVER move limit numbers into code — they live in capability YAML only.
- Canonicalization must be byte-identical between signer and verifier — share one function, never re-implement.
- Reference RFC-0291 in commit messages.
