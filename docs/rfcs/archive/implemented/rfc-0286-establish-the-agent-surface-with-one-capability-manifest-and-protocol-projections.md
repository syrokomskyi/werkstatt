---
id: RFC-0286
title: "Establish the agent surface with one capability manifest and protocol projections"
status: implemented
kind: architecture
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-07-05
updatedAt: 2026-07-05
implementedAt: 2026-07-05
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0143
  - RFC-0147
  - RFC-0148
  - RFC-0166
  - RFC-0169
  - RFC-0176
  - RFC-0179
  - RFC-0195
  - RFC-0203
  - RFC-0287
  - RFC-0288
  - RFC-0289
  - RFC-0290
  - RFC-0291
  - RFC-0292
  - AP-2
  - DNA-1
commands:
  proposed: []
  added:
    - agent.manifest.generate
    - agent.surface.validate
  changed: []
  removed: []
appsImpacted:
  - apps/*
packagesImpacted:
  - "@gogol/share"
  - "@gogol/ontology"
  - "@gogol/site-kernel-checks"
successSignals:
  - "Every thin site exposes one generated, discoverable machine surface; an external AI agent can find it at /.well-known/agent.json without prior knowledge of the ecosystem."
  - "REST paths, the OpenAPI document, and MCP tools for a site are provably three projections of one generated capability manifest — no protocol surface is hand-authored anywhere in apps/*."
  - "Adding or retiring an agent protocol touches only a formatter and a generator command; content, ontology, and app code are unchanged."
  - "The agent surface never exposes a fact or an action that is absent from the human-visible site, and never exposes a business domain marked none in BUSINESS_DOMAIN_VISIBILITY."
nonGoals:
  - "Do not implement the knowledge files, the capability catalog, OpenAPI, the MCP runtime, signing, or fleet federation here — those are RFC-0287 through RFC-0292. This RFC fixes the invariants, the manifest contract, and the two spine commands."
  - "Do not introduce a runtime read API — the read tier is static files by design; the only runtime is the action tier and the MCP endpoint (RFC-0290)."
  - "Do not create a second source of truth: the manifest is derived from src/content/, the ontology, and resolved entitlements, never authored."
acceptance:
  - probe: command-registered
    name: "agent.manifest.generate"
  - probe: command-registered
    name: "agent.surface.validate"
  - probe: file-exists
    path: "packages/share/src/agent/manifest.ts"
  - probe: run
    command: "site-kernel run agent.manifest.generate --app webgogol-com"
    expect:
      exitCode: 0
  - probe: run
    command: "site-kernel run agent.surface.validate --app webgogol-com"
    expect:
      exitCode: 0
---

# RFC-0286: Establish the agent surface with one capability manifest and protocol projections

## Context

Every site in `apps/*` already has a machine-facing surface, but it is text-shaped, not tool-shaped: `llms.txt` / `llms-full.txt` (RFC-0050/0142), per-page Markdown twins (RFC-0166/0195), JSON-LD with provenance (RFC-0220/0223), and the signed cosmic passport in `.well-known/` (RFC-0028). These serve LLM crawlers that read prose. What is missing is a surface for **AI agents that call tools**: structured JSON a program can consume, a closed catalog of actions a program can invoke, and a discovery document that tells an agent what exists.

The founder's direction (2026-07-05) is explicit: thin sites are decades-scale **digital assets** that must interoperate with AI agents, with each other, and with external businesses not built by this studio. Protocols for that interop are churning (REST → GraphQL → MCP → A2A/NLWeb/agentic-commerce protocols); the only stable things on a decades horizon are the canonical content in `src/content/`, the ontology, and the Generator Contract (RFC-0143).

The ecosystem already knows how to solve exactly this class of problem: **one canonical meaning source → many projections** (`packages/os/site-kernel/docs/semantic-layer.md`). This RFC extends that principle from documents to capabilities.

## Problem

- There is no structured, machine-consumable projection of the business layer. An agent that wants the offer, the locations, or the people of a site must scrape prose (`llms-full.txt`) or HTML.
- There is no sanctioned way for an agent to **act** (submit a lead, request an appointment). The Integration Port routes exist (`/api/send-message`, RFC-0168/0176) but are undiscoverable and undocumented for machines.
- There is no discovery: nothing at a well-known URL says "this site speaks these protocols, offers these actions, publishes these knowledge files."
- Without a governing invariant, the obvious failure mode is N hand-built protocol servers — an MCP server "on top of" a REST server "on top of" content — each a new source of truth, each new legacy the moment its protocol fades. Anti-pattern AP-2 (parallel AI-only content tree) re-enters through the protocol door.

## Decision

The workspace gains the **Agent Surface**: a per-site machine surface governed by one generated artifact, the **Agent Surface Manifest**, from which every protocol projection is derived.

**The three tiers:**

1. **Knowledge (static, free).** Structured JSON projections of the business layer, generated at build time as static files under `public/api/agent/v1/` (RFC-0287). No runtime, no marginal cost, cacheable forever. Free for every site — like `llms.txt`, this is visibility, not a paid module.
2. **Actions (runtime, entitled).** A closed catalog of typed actions (`packages/ontology/capabilities/`, RFC-0288) executed through the existing Integration Port on the client's own deploy with the client's own tokens (RFC-0176/0179/0181). Gated by the new `agent.actions` entitlement (RFC-0169 catalog extension, defined in RFC-0288).
3. **Discovery.** `public/.well-known/agent.json` — a public projection of the manifest listing knowledge files, actions, and protocol interfaces (OpenAPI per RFC-0289, MCP per RFC-0290), signed with the passport key (RFC-0291).

**The Agent Surface invariants (AS-1 … AS-7).** These are workspace invariants in the spirit of Architecture DNA; `agent.surface.validate` enforces the checkable ones:

- **AS-1 — One manifest, many projections.** Every protocol surface of a site (REST paths, OpenAPI document, MCP tool list, any future protocol) is generated from that site's Agent Surface Manifest. No protocol surface is ever hand-authored in `apps/*`.
- **AS-2 — Human parity.** The agent surface may never expose a fact absent from the visible site, nor an action a human visitor cannot perform through the rendered pages. (Extends semantic-layer invariant 3 and AP-2.)
- **AS-3 — Privacy boundary.** `BUSINESS_DOMAIN_VISIBILITY` (`packages/share/src/semantic/business-projection.ts`) applies verbatim: domains marked `none` (`externalServices`, `compliance`) never reach any agent output; `pageMeta` domains never reach public files.
- **AS-4 — Visibility parity.** Entitlement gates, feature visibility, and `noindex` semantics apply to the agent surface exactly as they apply to `llms.txt` and the sitemap. A page or module absent from the human surface is absent from the agent surface.
- **AS-5 — Protocols are disposable.** A protocol adapter is a pure formatter plus a generator command. Adding or retiring one touches `@gogol/share` formatters, kernel commands, and (for runtime protocols) `@gogol/agent-gate` — never content, never the ontology records, never app code.
- **AS-6 — Static reads, minimal runtime.** The read tier is static files. The only runtime components are the action routes and the stateless MCP endpoint (RFC-0290), which run inside the site's existing Worker — zero additional Workers per site (RFC-0179 budget).
- **AS-7 — Versioned by manifest, not by protocol.** The manifest carries `surfaceVersion` (semver of the manifest schema) and a deterministic `contentHash`. Protocol documents advertise both. Protocol endpoint URLs never carry version segments; evolution happens in the manifest schema.

## Architectural fit

- **Semantic layer.** The manifest is a projection in the RFC-0143/semantic-layer sense: derived, never primary, reading `src/content/` + ontology + resolved entitlements. It is the capability-counterpart of `buildOrganizationProfile` (RFC-0147/0148).
- **Generator Contract (RFC-0143).** `agent.manifest.generate` is a standard file generator: typed site-wide `agent:` block in `system.md` (schema extension in `packages/ontology/src/schemas/system.ts`), pure formatter in `@gogol/share`, `*.generate`/`*.validate` pair, safe default, registered in `APPS_BUILD_PREPARE_PIPELINE`.
- **Integration Port (RFC-0176/0179/0181).** Actions do not add a second delivery path: an invoked action produces a normalized `IntegrationEvent` and enters the existing reliable delivery backbone. Per-client isolation is preserved: agent-triggered actions execute on the client's deploy with the client's tokens.
- **Entitlements (RFC-0169).** Read tier ungated; action tier gated by `agent.actions` (catalog extension in RFC-0288). Manifest generation runs after `entitlements.resolve` in `build.prepare`.
- **Diagnostics (RFC-0203).** All new validators emit canonical `Diagnostic` objects with registered rule IDs (prefix `AGS-*`).
- **Passport (RFC-0028) / trust.** The discovery document is signed with the existing passport keypair (RFC-0291), giving the machine surface the same cryptographic identity the passport already gives the site.

## Design

### CLI surface

```sh
pnpm exec site-kernel run agent.manifest.generate --app webgogol-com
pnpm exec site-kernel run agent.surface.validate --app webgogol-com --json
```

Both are app-scoped. `agent.manifest.generate` is registered with `mutatesState: true` and runs in `APPS_BUILD_PREPARE_PIPELINE` **after** `entitlements.resolve` and after `surface.generate` (so the final page/route set is known). `agent.surface.validate` runs in `APPS_CHECK_PIPELINE`.

### TypeScript contracts

New module family `packages/share/src/agent/` (subpath entry per RFC-0264):

```ts
// packages/share/src/agent/manifest.ts
export const AGENT_SURFACE_VERSION = "1.0.0"; // semver of THIS schema, bumped by RFC only

export interface AgentSurfaceManifest {
  surfaceVersion: string;              // AGENT_SURFACE_VERSION
  site: string;                        // system.md `app`
  baseUrl: string;                     // canonical origin, e.g. "https://webgogol.com"
  languages: { default: string; supported: string[] };
  /** Deterministic hash over the manifest body minus this field (sorted-key JSON, sha256 hex). */
  contentHash: string;
  knowledge: AgentKnowledgeRef[];      // filled by RFC-0287 logic; [] until then
  actions: AgentActionRef[];           // filled from the RFC-0288 catalog; [] until then
  interfaces: {
    llms: string;                      // "/llms.txt"
    twins: { pattern: string } | null; // "/<route>/index.md" when twins are generated
    openapi: string | null;            // "/.well-known/agent.openapi.json" (RFC-0289)
    mcp: { url: string; protocolVersion: string } | null; // (RFC-0290)
  };
  /** Ed25519 proof over canonical bytes; null until RFC-0291 is implemented or key absent. */
  proof: AgentSurfaceProof | null;
}

export interface AgentKnowledgeRef {
  domain: string;                      // BusinessDomain with visibility "public", e.g. "offer"
  url: string;                         // "/api/agent/v1/offer.json"
  schema: string;                      // "gogol.agent.knowledge/offer@1"
}

export interface AgentActionRef {
  id: string;                          // capability id, e.g. "lead.submit"
  url: string;                         // "/api/agent/actions/lead.submit"
  title: Record<string, string>;       // per-language, default-language fallback
  inputSchemaRef: string;              // JSON pointer into the OpenAPI doc / inline schema id
  entitlement: "agent.actions";
}

export interface AgentSurfaceProof {
  type: "Ed25519Signature2020";
  verificationMethod: string;          // "/.well-known/cosmic-passport-key.json"
  proofValue: string;                  // multibase, via @gogol/passport signBytes
}

/** Pure formatter: no I/O. Input is already-loaded system manifest + entitlements + catalogs. */
export function buildAgentSurfaceManifest(input: AgentSurfaceManifestInput): AgentSurfaceManifest;
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `apps/<site>/src/agent-surface.generated.json` | Full internal manifest. Per-build artifact, **gitignored** (entitlement-dependent, like `src/surface.generated.json`). |
| `apps/<site>/public/.well-known/agent.json` | Public discovery projection of the manifest. Written by `agent.manifest.generate`, **gitignored**, byte-stable per build (no wall-clock timestamps — determinism via `contentHash`). |
| `packages/ontology/src/schemas/system.ts` | Gains the closed top-level `agent:` block (site-wide policy family per RFC-0143): `{ enabled?: boolean /* default true */, actionsDisabled?: string[] }`. |
| `packages/share/src/agent/` | Manifest types + pure formatter + shared helpers for RFC-0287..0291. |
| `packages/os/site-kernel-checks/src/` | The two commands + `AGS-*` rule registration. |

### Output format

`agent.surface.validate --json` emits the canonical Diagnostic envelope (RFC-0203):

```json
{
  "command": "agent.surface.validate",
  "status": "fail",
  "diagnostics": [
    {
      "ruleId": "AGS-01",
      "severity": "error",
      "file": "apps/webgogol-com/public/.well-known/agent.json",
      "message": "knowledge ref 'compliance' violates BUSINESS_DOMAIN_VISIBILITY (visibility: none)",
      "fix": "Remove the domain from the knowledge projection; 'none' domains never reach agent outputs."
    }
  ]
}
```

Rules owned by this RFC (later RFCs extend the set):

| Rule | Severity | Meaning |
| --- | --- | --- |
| `AGS-01` | error | A manifest entry references a business domain whose visibility is not `public` (AS-3). |
| `AGS-02` | error | A referenced knowledge/action/interface URL has no corresponding generated file or registered route (AS-1: dangling projection). |
| `AGS-03` | error | A generated file or agent route exists that the manifest does not reference (AS-1: orphan projection). |
| `AGS-04` | error | An action ref exists while `agent.actions` is not in the resolved entitlements (AS-4). |
| `AGS-05` | error | `contentHash` does not match the recomputed hash (stale or hand-edited artifact). |
| `AGS-06` | warning | `agent.enabled: false` while other agent artifacts are present (surface half-disabled). |

### Failure modes

- Errors exit non-zero and fail `build.check`; warnings do not.
- Absent `agent:` block ⇒ `enabled: true` (the safe default is **on**: the read tier is free visibility, and RFC-0287..0290 degrade to empty sections until implemented). `agent: { enabled: false }` disables generation entirely; the validator then asserts no agent artifacts exist (AGS-06).
- With the child RFCs unimplemented, `agent.manifest.generate` emits a valid manifest with `knowledge: []`, `actions: []`, `openapi: null`, `mcp: null` — the spine is independently shippable and testable.

## Rollout

1. Implement the `agent:` schema block, `packages/share/src/agent/manifest.ts`, the two commands, pipeline registration, gitignore entries, and `AGS-*` rule registration.
2. Both apps regenerate on the next `pnpm build`; no app-authored files change. No flag day: the manifest is additive and empty-bodied until RFC-0287/0288 land.
3. New apps comply automatically: the generator is in `APPS_BUILD_PREPARE_PIPELINE`, and the scaffold (RFC-0029) needs no change.
4. Child RFCs extend the manifest in dependency order: 0287 (knowledge) and 0288 (actions) are independent; 0289 (OpenAPI) requires 0286+0287+0288; 0290 (MCP) requires 0288; 0291 (trust) requires 0286; 0292 (fleet) requires 0286 and reads whatever tiers exist.
5. Protocol retirement path (decades clause): when a protocol dies, delete its formatter + generator + gate handler and drop its `interfaces` entry — a single reviewed change per AS-5. No content or ontology migration may ever be required to change protocols; `agent.surface.validate` guarding manifest↔artifact bijection makes a partial retirement fail loudly.

## Alternatives considered

- **Hand-built REST + MCP servers per site.** Rejected: N sites × 2 servers of drifting hand-written surface violates thin-site DNA and becomes unmaintainable legacy at fleet scale; exactly the failure AS-1 exists to prevent.
- **MCP as a wrapper proxying a REST layer.** Rejected as an architectural statement (accepted as an implementation detail): making REST the "real" API couples the surface's lifetime to one protocol generation. Both are sibling projections; the manifest is the API.
- **Runtime read API (SSR endpoints serving business data).** Rejected: business data changes at build time; static files give identical semantics with zero runtime cost/risk across thousands of sites (AS-6, DNA-01).
- **A GraphQL surface.** Rejected: the consumers are AI agents speaking HTTP+JSON and MCP; a query language adds server runtime and schema-drift surface with no consumer demand.
- **Waiting for protocol convergence before building anything.** Rejected: the knowledge tier and discovery are protocol-neutral and valuable today; AS-5/AS-7 make later protocol churn cheap by construction.

## Risks

- **Invariant sprawl.** AS-1..AS-7 add a second numbered invariant family next to DNA/AP. Mitigation: they live in this RFC and the agent docs only; if they harden long-term, a future RFC promotes them into `architecture-dna.md` properly.
- **Empty-shell period.** Between this RFC and RFC-0287/0288, `agent.json` advertises an empty surface. Acceptable: the document is valid, and external agents treat empty arrays as "no capabilities yet".
- **Gitignored public artifacts.** Unlike committed twins, `agent.json` exists only after `build.prepare`; agents inspecting the repo (not the deploy) won't see it. Deliberate: the manifest is entitlement-dependent, and committing environment-dependent output would drift. The validator always runs post-generate, so CI still exercises it.
- **Agent misreading scope.** An implementing agent might build RFC-0287..0292 features from this document. The commands/frontmatter here are strictly the two spine commands; nonGoals and the child-RFC pointers bound the scope.

## Acceptance criteria

- [x] `agent:` block added to `systemManifestSchema` (closed, defaults documented above); `system.manifest.validate` accepts both apps unchanged. (evidence: implemented historically)
- [x] `packages/share/src/agent/manifest.ts` exists with `AGENT_SURFACE_VERSION`, the interfaces above, and pure `buildAgentSurfaceManifest` (unit-tested: determinism, contentHash stability, sorted-key serialization — 7 tests green). (evidence: packages/ directory, package exists)
- [x] `agent.manifest.generate` registered (`mutatesState: true`), wired into `APPS_BUILD_PREPARE_PIPELINE` after `entitlements.resolve` and `surface.generate`; writes both artifacts; byte-stable across repeated runs on unchanged input (verified: repeated run on webgogol-com produced byte-identical output). (evidence: implemented historically)
- [x] `agent.surface.validate` registered, wired into `APPS_CHECK_PIPELINE`, emitting `AGS-01..AGS-06` as canonical Diagnostics (inline rule ids, consistent with every other check in this codebase — there is no separate central rule-id file to update). (evidence: implemented historically)
- [x] `src/agent-surface.generated.json` and `public/.well-known/agent.json` gitignored in both apps (root `.gitignore` glob `apps/*/...`, which also covers future scaffolded apps — no dedicated scaffold `.gitignore` template exists to duplicate this in). (evidence: original apps retired by RFC-0381, implemented historically)
- [x] `--json` output stable and documented as above. (evidence: implemented historically)
- [x] Both apps pass `build:check` with the new steps; no existing check regresses (both full `build:check` runs green, exit 0). (evidence: implemented historically)
- [x] `apps/AGENTS.md` template (packages/os/site-kernel-codegen) gains an "Agent Surface (RFC-0286..0290)" section stating AS-1/AS-2/AS-3/AS-6 and the never-hand-author rule; regenerated for both apps. (evidence: AGENTS.md:1, agent guide updated)
- [x] `rfc.validate` passes on this file. (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` and stamp `implementedAt`/`updatedAt` once every acceptance criterion is satisfied and checked, validators/build pass, and the change is committed referencing this RFC (RFC-0224). Agents MUST NOT perform any other status transition.
- Implement THIS RFC before RFC-0287..0292; they extend the manifest and the validator rather than defining their own spines.
- NEVER hand-author `agent-surface.generated.json`, `agent.json`, or any protocol document; NEVER add a `src/pages/*` route that serves knowledge data (AS-6). Violations of AS-1..AS-7 require a superseding RFC, not a local exception.
- When implementing, reference RFC-0286 in commit messages.
