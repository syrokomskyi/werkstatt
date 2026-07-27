# WGogol

A Turborepo monorepo of Astro 6 sites that compose themselves out of shared packages. **Adding a new client site means writing YAML and Markdown — almost no `.astro` or `.ts`.**

## Architecture in 30 seconds

```
systems/registry.yaml                 ◄── single source of truth: registered Sternsystemen
systems/<id>/system.pin.json          ── pinned platform version per Sternsystem
missions/<missionId>/workpiece/       ◄── active mission workpiece (deployable Astro site)
├─ src/content/system.md              ── canonical declaration: pages, planets, biome, growth, passport
├─ src/content/pages/<lang>/*.md      ── frontmatter-only `blocks[]` per page
├─ src/content/prose/<lang>/*.md      ── all freeform prose
├─ src/content/business-profile/<lang>/*  ── canonical business data (consumed by @gogol/pbp)
├─ src/pages/[...slug].astro          ── thin unprefixed default-language route
├─ src/pages/[lang]/[...slug].astro   ── thin non-default-language route
└─ tools/kernel.config.ts             ── site-kernel pipelines

services/                             ◄── deployable backend runtime compositions
└─ check-webgogol-runner              ── Node/Playwright runner for Check Webgogol runs

packages/                             ◄── all logic lives here
├─ ui                                 ── Astro sections + components (cosmicName-tagged)
├─ share                              ── buildPage pipeline, content/i18n/visibility/schemas, integration hub
├─ ontology                           ── closed Star/Planet/Moon catalogs, manifest schemas
├─ content-source                     ── content/asset origin port (RFC-0141, headless-CMS seam)
├─ chat / chat-adapter-*              ── consent-gated click-to-load chat widget port (RFC-0175)
├─ integration-adapter-stripe / -supabase-crm  ── Stripe billing source + CRM-buffer destination
├─ pbp / growth / growth-adapter-* / passport / nebula / star-map / tokens
├─ agent-gate                          ── stateless MCP endpoint + action routes (RFC-0290)
└─ os/site-kernel*                    ── CLI core + content loaders + validators + scaffold + internal handoff
```

Sites are registered as Sternsystemen in `systems/registry.yaml` and materialized as mission workpieces under `missions/<missionId>/workpiece/`. Pages are declared in `src/content/system.md` (which `cosmicPlanet` sections each route uses) and authored as YAML-only `*.md` blocks in `src/content/pages/`. Thin generated routes call `buildPage()` and dispatch each block to a `@gogol/ui` section by `cosmicName`; the default language is served unprefixed, while non-default languages live under `/<lang>/`. The `apps/*` directory is retired (RFC-0381). Read the architecture diagrams and rules in [`AGENTS.md`](AGENTS.md), [`docs/authoring/site-composition.md`](docs/authoring/site-composition.md), and [`packages/AGENTS.md`](packages/AGENTS.md).

## Stack

- **Astro 6** (SSG) deployed to Cloudflare Workers via Wrangler
- **Turborepo + pnpm workspaces** — `pnpm` is the only package manager; the root `packageManager` pins the version
- **TypeScript strict** with content-declared schemas (Zod)
- **Node ≥ 22** (see `package.json` engines.node)
- **Linux (Ubuntu)** development environment — see [`docs/policies/linux-tooling.md`](docs/policies/linux-tooling.md) for the tool inventory. `@webgogol/forge` is the sole cross-platform exception (published to npm).

## Quick start

```sh
# One-time: ensure Git LFS is initialized (required for media files)
git lfs install

# One-time: configure git hooks (required for ecosystem.commit enforcement)
git config core.hooksPath hooks/

# Install
pnpm install

# Type-check + build a single site (mission workpiece)
pnpm --filter <site-name> astro:check
pnpm --filter <site-name> build

# Type-check the whole workspace
pnpm -r build:check

# Run the site-kernel CLI (validators, scaffolds, codegen)
pnpm exec site-kernel --help
```

If you cloned without running onboarding, invoke the `setup-ecosystem` skill to configure hooks and verify the ecosystem automatically.

## Check Webgogol

The Check Webgogol product surface (the web app that accepts a URL and displays check reports) is pending re-onboarding as a Sternsystem. The backend runner lives separately in `services/check-webgogol-runner` and consumes local queue files from `.check-webgogol/queue`, writing artifacts to `.check-webgogol/runs/<runId>/`.

```sh
# Backend runner
pnpm --filter check-webgogol-runner run:once
pnpm --filter check-webgogol-runner dev

# Backend workspace validators
pnpm exec site-kernel run services.check.run
```

Keep the Check Webgogol product surface and `services/check-webgogol-runner` decoupled through shared contracts in `packages/check-core`; the site never imports runner code, and the runner never imports site code.

## Onboarding a new client site

```sh
pnpm exec site-kernel run onboarding.scaffold \
  --client <id> --domain <fqdn> \
  --biome <biome-id> --constellation <constellation-id>

pnpm exec site-kernel run onboarding.checklist --client <id>
pnpm exec site-kernel run app.contract.full --site <id>
```

Then edit only the mission workpiece's `src/content/system.md` and the contents of `src/content/**`. Never copy an existing site workspace.

## Internal site handoff

RFC-0221 adds a thin internal handoff model for moving a site between developers who already have the full ecosystem checked out. It is not the external `client.export` full-fork deliverable.

Implemented commands:

```sh
pnpm exec site-kernel run handoff.validate --bundle ../handoff/<app>
pnpm exec site-kernel run migrator.registry.validate
pnpm exec site-kernel run handoff.pack --site <app>
pnpm exec site-kernel run handoff.absorb --bundle ../handoff/<app> --report-only
pnpm exec site-kernel run handoff.absorb --bundle ../handoff/<app> --regen
```

`handoff.absorb` builds the catch-up report, refuses downgrades (older recipient ecosystem → `git pull` first), then materializes: it applies the forward migrator chain, injects the authored set into the target site workspace, and delegates regeneration + validation to `build.prepare` / `build.check`. Use `--report-only` to stop before any write, `--as <name>` to materialize under a different site name, `--regen` to run regeneration immediately, and `--force` to override the red-tier manual-decision gate. The bundle carries the Compass-complete authored partition (authored code + content + assets, generated files excluded); `--regen` is reliable for in-place absorb into an existing site — a from-scratch new-site pilot (scaffold + install) is the open follow-up.

## AI / Windsurf

See [`AGENTS.md`](AGENTS.md) — the authoritative instruction layer. See [`docs/authoring/site-composition.md`](docs/authoring/site-composition.md) and [`packages/AGENTS.md`](packages/AGENTS.md) for workspace-scoped rules.

## RFC governance and verification

The project uses RFCs (`docs/rfcs/`) for structural changes. Key commands:

```sh
# Create a new RFC draft
pnpm exec site-kernel run rfc.create --title "Short title" --kind architecture

# Validate all RFCs
pnpm exec site-kernel run rfc.validate --json

# Emit verification evidence for an RFC with acceptance probes
pnpm exec site-kernel run rfc.verification.emit --id RFC-XXXX

# Generate the DNA-trace matrix (which RFCs satisfy which DNA invariants)
pnpm exec site-kernel run rfc.dna.trace.generate

# Generate the decision log (rejected/superseded RFCs + alternatives)
pnpm exec site-kernel run rfc.decision-log.generate

# Run independent black-box QA against a built app (page probes via Playwright)
pnpm exec site-kernel run qa.independent.run --site <app-name>

# Derive change impact class and recommended check profile
pnpm exec site-kernel run change.impact.derive --paths "src/foo.ts,docs/bar.md"
```

Architecture and contract RFCs must declare `satisfies: [DNA-XX]` (RFC-0331). Decided RFCs require `reviewers: [human:<handle>]` (RFC-0335).

### Design tokens (ultra-strict)

- Only `--ds-*` CSS custom properties are allowed.
- Enforced by `tokens.ds.lint` and `tokens.colors.lint` (Site OS commands).

## Translation

- Translation and managed content should live in Astro-native folders.
- Use `src/content/pages/**` for route/page shell content.
- Use `src/content/prose/**` for narrative content.
- Use `src/content/business-profile/**` for organization/offers/team data (PBP entities).
- Use `src/content/site/**` for site-level labels and configuration.
- Use `src/content/navigation/**` for navigation structures.
- Do not add `.json` files under `src/content/**`.
- Use Markdown entries with YAML frontmatter in `src/content/**`.

## Deployment

This project deploys to **Cloudflare Workers** via **Wrangler**.

### Per-site deploy scripts

Every site (mission workpiece or Sternsystem workspace) carries its own deploy scripts in `package.json`. Run them from the monorepo root with `pnpm --filter <site-name>`:

| Script              | Purpose                                                    |
| ------------------- | ---------------------------------------------------------- |
| `build:deploy:main` | Build and deploy to the **production** Worker.             |
| `deploy:main`       | Deploy the already-built `dist/` to the production Worker. |
| `build:deploy:alt`  | Build and deploy to the **alt / staging** Worker.          |
| `deploy:alt`        | Deploy the already-built `dist/` to the alt Worker.        |

```sh
# Deploy webgogol-com to production
pnpm --filter webgogol-com build:deploy:main

# Deploy webgogol-com to staging (alt)
pnpm --filter webgogol-com build:deploy:alt
```

Wrangler Worker names follow the site name:

- Production: `<site-name>` (e.g. `webgogol-com`)
- Alt: `alt-<site-name>` (e.g. `alt-webgogol-com`)

### Secret files

Deploy commands read local env files that are **not committed to git**:

- `.env` — used by `deploy:alt`
- `.env.production` — used by `deploy:main`

Create them in the site workspace root or inject them in CI.

### CI/CD pipeline (GitHub Actions)

Workflows live in `.github/workflows/`. **Neither deploys** — deployment is manual (above):

- `changelog.yml` — scheduled (Mondays 09:00 UTC) + manual `workflow_dispatch`; runs `changelog.generate` and commits the result. Needs the `LLM_API_KEY` secret.
- `scaffold-smoke.yml` — PR smoke test: scaffolds a throwaway app and asserts `app.contract.full` exits 0. No secrets.

### Requirements

- Node.js: `>= 22` (CI uses Node 24)
- pnpm (`packageManager` pins the version; currently `pnpm@11.10.0`)
- Git LFS (run `git lfs install` once per clone; tracked: `apps/**/*.mp4`, `*.webm`, `*.png`, `*.jpg`, `*.jpeg`, `*.webp`)

### Secrets

**GitHub Actions** (Repo → Settings → Secrets and variables → Actions):

- `LLM_API_KEY` — used by `changelog.yml` for AI changelog generation.

**Deploy credentials** (wrangler — needed wherever `wrangler deploy` runs; there is no committed deploy workflow):

- `CLOUDFLARE_API_TOKEN` — token with Worker deploy permissions (or `wrangler login`).
- `CLOUDFLARE_ACCOUNT_ID` — Cloudflare account id.

> Lead/event delivery does **not** use Cloudflare KV/R2/Queues — it runs on EU-resident Upstash QStash + Redis (RFC-0181); those `UPSTASH_*` + `STRIPE_*` secrets are set per app via wrangler `--secrets-file`, not in GitHub Actions. See [`docs/specs/integration-delivery.md`](docs/specs/integration-delivery.md).

### Custom Domain

Configure custom domains in Cloudflare Dashboard:

- **Workers & Pages** → your Worker → **Triggers** / **Custom Domains**

## Integration & delivery

Leads, chat messages, and Stripe payments captured on a client site become a normalized `IntegrationEvent` and are routed to the client's own destinations (Pipedrive, channels, email) using the client's own tokens — the client's site is the hub, never a studio-central service.

- [`docs/specs/integration-delivery.md`](docs/specs/integration-delivery.md) — EU-resident lead/event **delivery** substrate (Upstash QStash + Redis, RFC-0181). Authoritative.
- [`docs/engineering/integration-hub-and-chat-widget.md`](docs/engineering/integration-hub-and-chat-widget.md) — hub contracts + the consent-gated chat widget (RFC-0168/0175/0176).
- [`docs/specs/visitor-funnel/`](docs/specs/visitor-funnel/) — Visitor Sales Funnel + Stripe billing operator guide (RFC-0188/0191).

## Agent Surface

Every deployed site publishes a machine-consumable **Agent Surface** for AI agents, not just human visitors: a signed discovery document (`/.well-known/agent.json`), structured knowledge JSON for the PBP layer (`/api/agent/v1/*.json`), an OpenAPI 3.1 document (`/.well-known/agent.openapi.json`), and a stateless MCP endpoint (`/api/agent/mcp`) plus direct HTTP action routes (`/api/agent/actions/<id>`) served by the new `@gogol/agent-gate` package. One generated **capability manifest** per site is the single source every one of these is projected from — knowledge reads are free/static; invoking an action (e.g. submitting a lead as an agent) is a paid module gated by the `agent.actions` entitlement and routes through the same Integration Port delivery substrate as the human contact form.

- RFC-0286 (manifest spine) · RFC-0287 (knowledge tier) · RFC-0288 (capability catalog) · RFC-0289 (OpenAPI) · RFC-0290 (`@gogol/agent-gate` runtime + MCP) — see `docs/rfcs/`.
- Full agent-facing mechanics live in each app's generated `AGENTS.md`; workspace-wide invariants live in [`AGENTS.md`](AGENTS.md).
