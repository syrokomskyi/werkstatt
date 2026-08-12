# Agent Surface, Telemetry, Env-and-Deploy, Testing Policy

Extracted from root `AGENTS.md` during the decomposition refactoring.

## Agent Surface (RFC-0286..0290)

Every app in `apps/*` publishes a machine-consumable **Agent Surface**: one generated capability manifest per site (`src/agent-surface.generated.json` + its public mirror `/.well-known/agent.json`), from which every protocol projection is derived — static knowledge JSON (`public/api/agent/v1/`, RFC-0287), a closed action catalog (`packages/ontology/capabilities/*.yaml`, RFC-0288), an OpenAPI 3.1 document (RFC-0289), and a stateless MCP endpoint + HTTP action routes served by the new `@warpgogol/agent-gate` package (RFC-0290). Full mechanics live in the generated `apps/<site>/AGENTS.md` (template: `packages/os/site-kernel-codegen/src/templates/app-boilerplate/AGENTS.template.md`); this section states the workspace-wide invariants.

Agent discipline:

- **AS-1 — one manifest, many projections.** Every protocol surface (knowledge files, OpenAPI, MCP, any future protocol) is generated FROM the manifest. Never hand-author a protocol document or a route under `src/pages/api/agent/**` in any app — regenerate via `agent.manifest.generate` / `agent.knowledge.generate` / `agent.openapi.generate` / `agent.routes.generate` instead.
- **AS-2 — human parity.** The agent surface may never expose a fact or an action absent from the visible site. A capability's `humanEquivalent.sectionType` must actually render — `agent.capability.validate` (`AGC-03`) enforces this.
- **AS-3 — privacy boundary.** `BUSINESS_DOMAIN_VISIBILITY` (`@warpgogol/share/semantic`) applies verbatim to every agent output; `none`/`pageMeta` domains never reach `public/api/agent/v1/**` — `agent.knowledge.validate` (`AGK-01`) enforces this with the same no-leak technique.
- **Capabilities are workspace-owned.** Add a new agent-invocable action as one YAML record in `packages/ontology/capabilities/`, never inside an app. The capability's `input`/`output` use a deliberately closed JSON-Schema subset (RFC-0288) — do not widen it without an RFC amending RFC-0288.
- **The MCP endpoint speaks a pinned protocol** (`PINNED_MCP_PROTOCOL_VERSION` in `@warpgogol/agent-gate`). `agent.gate.fixtures.run` (in `PACKAGES_CHECK_PIPELINE`) is the regression gate for any change to the gate's protocol handling — never touch `packages/agent-gate/src/mcp/**` without keeping its fixture suite green.
- Action invocation (HTTP and MCP `tools/call` alike) dispatches through the **same** Integration Port delivery substrate the human `send-message` form uses (RFC-0176/0181/0290) — never build a second delivery path for agent-originated leads.
- RFC-0291 (trust/rate-limiting/signing) and RFC-0292 (fleet federation) remain **draft** — do not implement code against them until they are `accepted`.

## Telemetry-read lane (RFC-0344)

Agents have read-only access to the fleet telemetry backend (SigNoz) through the `signoz` MCP server configured in `.mcp.json` (env-referenced token `WARPGOGOL_SIGNOZ_MCP_TOKEN`, viewer role only).

- **MAY** query metrics, traces, logs, alert states, and service views; correlate across `warpgogol_probe_*`, `warpgogol_factory_*`, `warpgogol_delivery_*`, and worker traces by `site_id`.
- **MUST NOT** create, modify, or delete alert rules, channels, retention, users, or persistent dashboards through MCP or the SigNoz UI. The only alert mutation lane is `observability.alerts.*` (RFC-0342), and only when the founder asked.
- Every telemetry-grounded incident investigation MUST end in a committed incident note at `docs/observability/incidents/YYYY-MM-DD-<slug>.md` (template: `docs/observability/incidents/README.md`). Cite queries and values inline — no screenshots.
- `observability.mcp.validate` (OBS-MCP-01..03) enforces the entry, secret-leak backstop, and incidents template.

## Env-and-deploy contract (RFC-0761 / DNA-40)

Every `systems/*`, `services/*`, and root project that reads environment variables from `process.env`, `astro:env/server`, `astro:env/client`, a `getEnv()` helper, or a Cloudflare Worker `Env` interface MUST ship a `.env.example` file in its project root.

- Every variable in `.env.example` MUST be documented by a preceding `#` comment.
- Every variable MUST include a `# How to obtain:` instruction line with concrete steps for acquiring its value.
- Values in `.env.example` MUST stay empty — never commit real secrets.
- In `.env` files, variables that are listed in `.env.example` but not required for a specific deployment MAY be set to `null` (the literal string) to signal intentional non-configuration. `deploy.preflight` accepts `null` as a valid non-empty value. Services that read a variable marked `null` should treat it as a configuration error, not as an absent value (RFC-0819).
- `README.md` files MUST NOT duplicate env-variable tables — they reference `.env.example` instead.
- `systems/*` and `services/*` projects with `.env.example` MUST have `.env` on disk (local development + deploy). It is gitignored.
- `systems/*/package.json` MUST contain the six canonical deploy scripts: `build:main`, `build:alt`, `deploy:main`, `deploy:alt`, `build:deploy:main`, `build:deploy:alt`.
- `deploy:main` and `deploy:alt` MUST use `--secrets-file .env`.
- `services/*/package.json` deploy scripts MUST use `--secrets-file .env`.
- All deploy scripts MUST be prefixed with `deploy.preflight` to validate env file presence, key completeness, no extra keys, and no empty values.
- Enforced by `env.contract.validate`, `env.local.check`, `deploy.scripts.validate`, and `deploy.preflight`. `env.contract.validate` runs in both `sites-check.author` and `services.check.run`. `deploy.scripts.validate` runs in `sites-check.author`.

## Testing policy (RFC-0347)

All packages with tests use **vitest** as the sole test runner and **fast-check** for property-based testing (PBT). No `node:test` imports remain.

- **Test runner**: `vitest` — every package with tests has `"test": "vitest run"` and `"test:watch": "vitest"` in its `package.json` scripts. A `vitest.config.ts` at each package root configures the Node environment and test file glob.
- **Assertions**: `import { test, expect } from "vitest"` — do not import from `node:test` or `node:assert/strict`. Use `expect()` matchers (`toBe`, `toEqual`, `toBeTruthy`, `toThrow`, `toMatch`, `toBeInstanceOf`, etc.).
- **Property-based tests**: PBT files use the `.pbt.test.ts` suffix and import `fc from "fast-check"`. Use `fc.assert(fc.property(arb, fn))` to define properties. PBT tests are **additive** — never replace existing example-based tests with PBT.
- **Test file location**: Tests live in `src/tests/**/*.test.ts` (or `src/**/tests/**/*.test.ts` for nested source). PBT files follow the same pattern with `.pbt.test.ts` suffix.
- **Timeouts**: Packages with IO-heavy tests (git, filesystem) should set `testTimeout` in their `vitest.config.ts`. Default vitest timeout is 5s; `node:test` had no default timeout.
- **No backward compatibility**: Do not add `node:test` shims or legacy assertion wrappers. The migration is forward-only.
