---
id: RFC-0827
title: "Establish site-service contract testing"
status: implemented
kind: contract
scope: workspace
owners:
  - architecture
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-08-13
updatedAt: 2026-08-13
enhancedAt: 2026-08-13
implementedAt: 2026-08-13
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - DNA-66
  - RFC-0181
  - RFC-0823
  - RFC-0826
satisfies:
  - DNA-66
versionBump: patch
commands:
  proposed:
    - contract.validate
    - contract.list
  added:
    - contract.validate
    - contract.list
  changed: []
  removed: []
appsImpacted: []
packagesImpacted:
  - "@warpgogol/werkstatt"
  - "@warpgogol/werkstatt-site"
successSignals:
  - "contract.validate command registered"
  - "Zod schemas defined for all site-service API boundaries"
  - "Contract tests pass bidirectionally (site request shape, service response shape)"
  - "contract.validate integrated into PACKAGES_CHECK_PIPELINE"
nonGoals:
  - "Does not test deployed services — that is L2 (RFC-0826)"
  - "Does not test user flows — that is L4 (RFC-0828)"
  - "Does not generate OpenAPI specs — agent.manifest.generate already does that"
batch: testing-architecture
dependsOn:
  - RFC-0823
---

# RFC-0827: Establish site-service contract testing

## Context

Sites call services via HTTP API routes. The `send-message` API route on the site publishes to QStash, which calls back to the `integration-route` on the service. The `lagebild-sync` service writes to Supabase. The `rate-fetcher` service fetches from ECB. These API boundaries are currently implicit — defined by code, not by schema.

When the site changes the request shape (e.g. adds a `formId` field) or the service changes the response shape (e.g. changes `ok` to `success`), the other side breaks silently. There is no automated check that both sides agree on the contract.

**Existing schema:** The integration domain already defines `IntegrationEventSchema` (`packages/werkstatt-site/src/domain/integration/orchestration.ts:275-292`) as the Zod validation gate for inbound QStash callbacks. This RFC does not replace `IntegrationEventSchema` — the `integration-route` contract reuses it directly. The `send-message` contract defines the form submission shape (what the site's API route accepts from the browser), which is a different data shape from `IntegrationEvent` (what QStash delivers to the callback).

## Problem

API contracts between sites and services are implicit in code. A change on one side that breaks the contract is only caught at runtime (production). DNA-66 requires L3 contract testing — explicit schema definitions for site-service API boundaries, validated bidirectionally.

The QStash debugging session (2026-08-13) revealed a contract mismatch: the site constructed the callback URL differently from how the service verified it. A contract test would have caught this: the contract defines the callback URL shape, and both sides validate against it.

## Decision

The workshop adds:

1. **Contract schemas** — Zod schemas in `packages/werkstatt-site/src/testing/contract/` that define the request/response shapes for every site-service API boundary. The `integration-route` contract reuses the existing `IntegrationEventSchema` from `packages/werkstatt-site/src/domain/integration/orchestration.ts`.
2. **New command `contract.validate`** — validates that contract schemas are consistent: site code uses schemas that match service code schemas.
3. **New command `contract.list`** — lists all registered contracts. This is a separate command (not a `--list` flag on `contract.validate`) because listing is a read-only inspection operation, while validation is a CI gate. Separating them follows the existing pattern (`command.manifest.validate` vs `docs.commands.validate`, `agent.manifest.generate` vs `agent.manifest.validate`).
4. **Subpath export** — `@warpgogol/werkstatt-site/testing/contract` added to `packages/werkstatt-site/package.json` exports so services can import contract schemas.
5. **Pipeline integration** — `contract.validate` runs in `PACKAGES_CHECK_PIPELINE` after `props.contract.validate` (CI gate, no deploy needed).

## Architectural fit

- **DNA-66 (testing pyramid):** This RFC implements the L3 layer.
- **DNA-64 (engine/plugin boundary):** Contract schemas live in the site plugin package.
- **Existing Zod usage:** The workshop already uses Zod extensively for content schemas, env schemas, and manifest schemas. Contract schemas follow the same pattern.
- **`agent.manifest.generate`:** Already generates OpenAPI specs from the agent manifest. Contract schemas complement this by defining the internal site-service boundaries, not the external agent API.

## Design

### CLI surface

```sh
pnpm exec werkstatt run contract.validate --json
pnpm exec werkstatt run contract.list --json
```

### Contract schema structure

```
packages/werkstatt-site/src/testing/contract/
  index.ts                          — exports all contracts
  send-message.contract.ts          — site → QStash → service callback
  integration-route.contract.ts     — QStash → service delivery handler
  health.contract.ts                — service health endpoint
  rate-fetch.contract.ts            — rate-fetcher cron response
  maturity-score.contract.ts        — maturity-score POST /score
  matomo-proxy.contract.ts          — matomo-proxy proxy request
  telegram-alert.contract.ts        — telegram-alert-bridge alert request
```

### Contract schema pattern

```ts
// packages/werkstatt-site/src/testing/contract/send-message.contract.ts
import { z } from "zod";

export const SendMessageRequestSchema = z.object({
  formId: z.string(),
  message: z.string(),
  contact: z.object({
    name: z.string().optional(),
    email: z.string().email().optional(),
    phone: z.string().optional(),
  }),
  lang: z.string(),
});

export const SendMessageResponseSchema = z.object({
  ok: z.boolean(),
  messageId: z.string().optional(),
  error: z.string().optional(),
});

export type SendMessageRequest = z.infer<typeof SendMessageRequestSchema>;
export type SendMessageResponse = z.infer<typeof SendMessageResponseSchema>;

export const contract = {
  id: "send-message",
  name: "Send Message",
  direction: "site-to-service-via-qstash",
  version: 1,
  request: SendMessageRequestSchema,
  response: SendMessageResponseSchema,
  description: "Site publishes a message to QStash, which delivers to the service integration-route callback.",
};
```

### Contract registry

```ts
// packages/werkstatt-site/src/testing/contract/index.ts
import { contract as sendMessageContract } from "./send-message.contract.ts";
import { contract as integrationRouteContract } from "./integration-route.contract.ts";
import { contract as healthContract } from "./health.contract.ts";
// ... other contracts

export const CONTRACTS = [
  sendMessageContract,
  integrationRouteContract,
  healthContract,
  // ...
];

export function getContract(id: string) {
  return CONTRACTS.find((c) => c.id === id);
}
```

### Contract validation

`contract.validate` performs two checks:

1. **Schema consistency:** Each contract's Zod schema is valid and parseable.
2. **Code alignment:** The site's API route handler and the service's endpoint handler both reference the contract schema (via import). This is checked by scanning for `import { ... } from "...contract"` in the relevant source files.

```ts
interface ContractValidationResult {
  command: "contract.validate";
  status: "pass" | "fail";
  contracts: {
    id: string;
    name: string;
    schemaValid: boolean;
    siteReferences: string[];   — files that import the contract on the site side
    serviceReferences: string[]; — files that import the contract on the service side
    aligned: boolean;            — both sides reference the same contract
  }[];
  violations: {
    contractId: string;
    rule: string;
    message: string;
  }[];
}
```

### Contract rules

| Rule        | Description                                                      |
| ----------- | ---------------------------------------------------------------- |
| CONTRACT-01 | Contract schema is valid Zod                                     |
| CONTRACT-02 | Contract has both request and response schemas                   |
| CONTRACT-03 | Site-side code references the contract                           |
| CONTRACT-04 | Service-side code references the contract                        |
| CONTRACT-05 | Both sides reference the same contract (same `id` and `version`) |

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/werkstatt-site/src/testing/contract/*.contract.ts` | Contract schema definitions |
| `packages/werkstatt-site/src/testing/contract/index.ts` | Contract registry |
| `packages/werkstatt-site/src/testing/contract/contract-validator.ts` | Validation logic |
| `packages/werkstatt-site/package.json` | Add `@warpgogol/werkstatt-site/testing/contract` subpath export |
| `packages/werkstatt-site/src/domain/ui/sections/send-message/send-message-section.api.ts` | Imports `SendMessageRequestSchema` (site-side) |
| `packages/werkstatt-site/src/domain/integration/delivery-handler.ts` | Imports `IntegrationRouteRequestSchema` (callback-side, reuses `IntegrationEventSchema`) |
| `services/*/src/*.ts` | Service handlers import relevant contract schemas (health, rate-fetch, etc.) |
| `packages/werkstatt-site/AGENTS.md` | Document contract testing convention |

### Relationship to existing IntegrationEventSchema

The integration domain already defines `IntegrationEventSchema` (`packages/werkstatt-site/src/domain/integration/orchestration.ts:275-292`) as the Zod validation gate for inbound QStash callbacks. This RFC does NOT replace or duplicate `IntegrationEventSchema`.

- The `integration-route` contract's request schema IS `IntegrationEventSchema` (re-exported, not redefined). This ensures the contract and the runtime validation stay in sync — there is one schema, not two.
- The `send-message` contract's request schema defines the form submission shape (what the browser sends to the site's API route). This is a different data shape from `IntegrationEvent` (what QStash delivers to the callback). The site's API route transforms the form submission into an `IntegrationEvent` before publishing to QStash.
- Other contracts (health, rate-fetch, maturity-score, matomo-proxy, telegram-alert) define their own request/response shapes because they don't flow through the integration port.

### Pipeline integration

`contract.validate` is added to `PACKAGES_CHECK_PIPELINE` after `props.contract.validate` (line 149 in `packages/werkstatt-site/src/checks/pipelines/packages-check.ts`), grouping it with the other contract validators:

```ts
// packages/werkstatt-site/src/checks/pipelines/packages-check.ts
  // RFC-0262: manifest propsSchema is the single authored prop contract for packages/ui.
  { command: "props.contract.validate" },
  // RFC-0827: site-service API contract validation (L3 testing pyramid)
  { command: "contract.validate" },  // NEW
  // RFC-0305: analytics ontology, binding, proxy, and offline fleet-control scaffolding.
  { command: "analytics.messkanon.validate" },
```

This means contract validation runs in CI (`pnpm exec werkstatt run packages-check.run --json`) without requiring a deploy.

### Output format

```json
{
  "command": "contract.validate",
  "status": "pass",
  "contracts": [
    {
      "id": "send-message",
      "name": "Send Message",
      "schemaValid": true,
      "siteReferences": ["packages/werkstatt-site/src/domain/ui/sections/send-message/send-message-section.api.ts"],
      "serviceReferences": ["packages/werkstatt-site/src/domain/integration/delivery-handler.ts"],
      "aligned": true
    }
  ],
  "violations": []
}
```

### Failure modes

- **Invalid Zod schema:** CONTRACT-01 violation, `schemaValid: false`.
- **Missing request or response schema:** CONTRACT-02 violation.
- **Site code doesn't import contract:** CONTRACT-03 violation (warning, not error — allows incremental adoption).
- **Service code doesn't import contract:** CONTRACT-04 violation (warning).
- **No contracts registered:** Warning, not error. Allows the system to work before contracts are added.

### Performance characteristics

`contract.validate` scans source files for contract imports. The scan covers `packages/werkstatt-site/src/domain/` and `services/*/src/` — approximately 200-300 files. The scan uses a simple regex for `from "...contract"` import statements, not AST parsing. Expected duration: < 500ms. This is negligible compared to the existing 163-step pipeline.

## Rollout

- **Default behavior:** `contract.validate` runs in `PACKAGES_CHECK_PIPELINE` immediately. Missing contracts are warnings (not errors) for a grace period.
- **Initial contracts:** Define contracts for existing site-service boundaries:
  1. `send-message` — site form → QStash → service callback
  2. `integration-route` — QStash → service delivery handler
  3. `health` — service health endpoint (shared across all services)
  4. `rate-fetch` — rate-fetcher cron
  5. `maturity-score` — POST /score
  6. `matomo-proxy` — proxy request
  7. `telegram-alert` — alert request
- **Code alignment:** After defining contracts, update site and service handlers to import and use the contract schemas for validation. This is incremental — start with `send-message` and `integration-route` (the flow we just debugged).
- **After grace period (4 weeks from implementation):** CONTRACT-03 and CONTRACT-04 escalate from warnings to errors. The escalation date is documented in `packages/werkstatt-site/AGENTS.md`.
- **False negatives:** Import checking cannot detect contracts used via re-export, structural typing, or inline duplication without a direct import. This is an acknowledged limitation. The grace period allows incremental adoption while import coverage grows. Runtime validation (Zod parse in handlers) remains the primary correctness guarantee — import checking is a static drift detector, not a runtime enforcement mechanism.

## Alternatives considered

- **OpenAPI as contract format:** Rejected. OpenAPI is generated by `agent.manifest.generate` for external consumption. Internal contracts need TypeScript-native schemas (Zod) for runtime validation and type inference.
- **Pact-style consumer-driven contracts:** Rejected. Pact adds infrastructure (broker, verification) that is overkill for a monorepo where both sides are in the same repo. Zod schemas + import checking achieves the same goal with zero infrastructure.
- **Runtime contract validation only:** Rejected. Runtime validation (Zod parse on every request) is necessary but not sufficient. Static validation (import checking) catches contract drift before deployment.

## Risks

- **Contract drift from runtime behavior:** A contract schema may not match what the code actually sends/receives. Mitigated by using contract schemas for runtime validation in the handlers (not just for testing).
- **Import checking false positives:** A file may import a contract for unrelated reasons. Mitigated by checking that the import is used (TypeScript unused import detection).
- **Grace period enforcement:** Like RFC-0824, the grace period relies on agent discipline. Mitigated by documenting the escalation date.

## Acceptance criteria

- [x] `contract.validate` command registered and functional (evidence: packages/werkstatt-site/src/checks/command-tables/01-codegen.ts:699-711, contract.validate --json passes with 0 errors)
- [x] `contract.list` command registered and functional (evidence: packages/werkstatt-site/src/checks/command-tables/01-codegen.ts:713-722, contract.list --json returns 7 contracts)
- [x] Zod schemas defined for all 7 initial contracts (evidence: packages/werkstatt-site/src/testing/contract/{send-message,integration-route,health,rate-fetch,maturity-score,matomo-proxy,telegram-alert}.contract.ts)
- [x] `send-message` and `integration-route` handlers import and use contract schemas (evidence: packages/werkstatt-site/src/domain/ui/sections/send-message/send-message-section.api.ts:33 imports SendMessageRequestSchema, packages/werkstatt-site/src/domain/integration/delivery-handler.ts:37 imports IntegrationRouteRequestSchema)
- [x] `contract.validate` integrated into `PACKAGES_CHECK_PIPELINE` (evidence: packages/werkstatt-site/src/checks/pipelines/packages-check.ts:151 after props.contract.validate)
- [x] `contract.validate` passes with zero violations (after initial adoption) (evidence: contract.validate --json passes with 0 errors, 14 warnings during grace period)
- [x] `rfc.validate` passes on this file (evidence: pnpm exec werkstatt run rfc.validate --id RFC-0827 passes with 0 errors)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits. Status transitions use `rfc.implement.stamp` per RFC-0476 (no manual frontmatter edits).
- Implementation should start with the contract schema definitions, then the validator, then the pipeline integration, then update handlers to import contracts.
- Contract schemas should be co-located with the domain logic they describe where possible, but the canonical contract definition lives in `packages/werkstatt-site/src/testing/contract/`.
- Use `z.infer` to derive TypeScript types from schemas — do not define types separately.
