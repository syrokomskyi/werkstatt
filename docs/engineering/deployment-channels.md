# Engineering: Deployment Channels & Cloudflare Cache

> Operator runbook for dev/alt/main deployment channels, DNS setup, CDN cache configuration, and `.env` loading.
>
> **First-time setup?** See [workshop-setup.md](./workshop-setup.md) for the complete guide from clone to first deploy.

---

## Channel architecture

Each Sternsystem deploys to three channels via `leitstand.*` commands:

| Channel | Purpose | URL pattern | Worker name | Cache |
| --- | --- | --- | --- | --- |
| **dev** | Pre-release Axiom verification | `dev.<domain>` | `dev-<system-id>` | **Bypass** (no caching) |
| **alt** | Staging / promotion gate | `alt.<domain>` | `alt-<system-id>` | Aggressive (standard) |
| **main** | Production | `<domain>` | `<system-id>` | Aggressive (standard) |

### Promotion chain

```
workpiece build → leitstand.dev-deploy → leitstand.propagate (dev→alt) → leitstand.release (alt→main)
```

Each promotion step verifies `build-identity.json` freshness before proceeding (RFC-0634, RFC-0649).

---

## Cloudflare setup per channel

### 1. DNS records

Each channel needs a DNS record pointing to its Worker via the Workers custom domain feature:

| Channel        | DNS type | Content                         | Proxied |
| -------------- | -------- | ------------------------------- | ------- |
| `dev.<domain>` | AAAA     | `100::` (Workers custom domain) | Yes     |
| `alt.<domain>` | AAAA     | `100::` (Workers custom domain) | Yes     |
| `<domain>`     | AAAA     | `100::` (Workers custom domain) | Yes     |

The `100::` address is Cloudflare's reserved IPv6 for Workers custom domains. The DNS record is automatically created when you enable the Workers custom domain in the dashboard or via `wrangler` / API.

### 2. Cache configuration

#### dev channel — cache bypass (mandatory)

The dev channel must **never** be cached at the CDN edge. Stale cache on dev makes Axiom verification meaningless — the crawler sees old HTML instead of the freshly deployed build.

**Setup via Cloudflare dashboard:**

1. Go to **Cloudflare dashboard** → `<zone>` → **Caching** → **Cache Rules**
2. Create a rule:
   - **When:** Hostname equals `dev.<domain>`
   - **Then:** Cache eligibility = **Bypass**
3. Set priority to 1 (above any other cache rules)

**Setup via API (Page Rule):**

```sh
rtk curl -X POST "https://api.cloudflare.com/client/v4/zones/<zone_id>/pagerules" \
  -H "Authorization: Bearer <api_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "targets": [{"target": "url", "constraint": {"operator": "matches", "value": "*dev.<domain>/*"}}],
    "actions": [{"id": "cache_level", "value": "bypass"}],
    "priority": 1,
    "status": "active"
  }'
```

The API token needs **Page Rules: Edit** permission.

#### alt and main channels — standard caching

Alt and main use Cloudflare's default "aggressive" cache level. CDN cache is purged after each deploy via `leitstand.propagate` / `leitstand.release` (RFC-0624). The purge requires:

- `CLOUDFLARE_ZONE_ID` — the zone ID for the domain
- `CLOUDFLARE_API_TOKEN` — an API token with **Cache Purge** permission

These are read from `.env` (see below).

### 3. Workers custom domain

Each worker is deployed with `wrangler deploy --name <worker-name>`. The custom domain is enabled via:

```sh
rtk npx wrangler deployments tail --name <worker-name>
```

Or via the Cloudflare dashboard → Workers & Pages → `<worker>` → **Triggers** → **Custom Domains** → Add `dev.<domain>` / `alt.<domain>` / `<domain>`.

---

## `.env` loading

The site-kernel CLI automatically loads `.env` from the workspace root via `import "dotenv/config"` in the CLI entry point (`packages/os/site-kernel/src/cli/index.ts`). This means:

- **All kernel commands** (`leitstand.dev-deploy`, `mission.check`, `axiom.report`, etc.) have access to environment variables defined in `.env`
- No need to `source .env` manually before running commands
- The `.env` file is gitignored — it stays local to each workshop

### Required variables

| Variable | Purpose | Used by |
| --- | --- | --- |
| `CLOUDFLARE_ZONE_ID` | Zone ID for CDN cache purge | `leitstand.dev-deploy`, `leitstand.propagate`, `leitstand.promote` |
| `CLOUDFLARE_API_TOKEN` | API token (see permissions below) | Same as above + `wrangler deploy`, `subdomain.register` |
| `CLOUDFLARE_ACCOUNT_ID` | Account ID for wrangler deploy | `leitstand.dev-deploy` (wrangler) |
| `PASSPORT_SIGNING_KEY` | Ed25519 signing key for commits | `mission.git.commit`, `bordbuch.commit` |

#### `CLOUDFLARE_API_TOKEN` permissions

Create a **User API Token** (My Profile → API Tokens → Create Custom Token), NOT an Account API Token. Required permissions:

| Permission                | Scope   | Level | Purpose                         |
| ------------------------- | ------- | ----- | ------------------------------- |
| Zone → Cache Purge        | Zone    | Purge | CDN cache purge after deploy    |
| Account → Workers Scripts | Account | Edit  | `wrangler deploy`               |
| Zone → Workers Routes     | Zone    | Edit  | Workers route management        |
| Zone → DNS                | Zone    | Edit  | `subdomain.register` (RFC-0752) |
| Zone → Page Rules         | Zone    | Edit  | Dev channel cache bypass rule   |

Scope to specific account and zone only (least-privilege). Full guide: [workshop-setup.md](./workshop-setup.md).

### `.env.example`

See `.env.example` at the workspace root for the full template. Copy it to `.env` and fill in values:

```sh
rtk cp .env.example .env
# Edit .env with your values
```

---

## Troubleshooting

### dev.warpgogol.com serves stale content after deploy

1. Check if a **cache bypass Page Rule / Cache Rule** exists for `dev.<domain>` (see above)
2. If the rule exists but content is still stale, the old cache entries may persist until they expire. Purge everything:
   ```sh
   curl -X POST "https://api.cloudflare.com/client/v4/zones/<zone_id>/purge_cache" \
     -H "Authorization: Bearer <api_token>" \
     -H "Content-Type: application/json" \
     -d '{"purge_everything":true}'
   ```
3. As a fallback, run `mission.check` against the workers.dev URL (`<worker-name>.<account>.workers.dev`) which bypasses the zone cache entirely

### `CLOUDFLARE_ZONE_ID not set` during leitstand.dev-deploy

1. Verify `.env` exists at the workspace root with `CLOUDFLARE_ZONE_ID=<zone_id>`
2. Verify the API token has **Cache Purge** permission
3. The CLI loads `.env` automatically — no `source` needed

### `report.html` missing after `mission.check`

`mission.check` auto-generates `report.html` in `missions/<mission>/evidence/axiom/` after writing evidence files. If it's missing:

1. Check the `mission.check` output for a `Report generation failed` warning
2. Run `pnpm exec werkstatt run axiom.report --mission <missionId>` manually as a fallback
