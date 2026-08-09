# Workshop Setup Guide — First Start

> Complete guide for setting up a Warpgogol workshop (development environment) from scratch. Covers: prerequisites, clone, Cloudflare token, `.env`, DNS, cache rules, and first deploy verification.

---

## 1. Prerequisites

| Requirement | Version                              | Check             |
| ----------- | ------------------------------------ | ----------------- |
| Node.js     | >= 22                                | `node --version`  |
| pnpm        | 11.10.0 (pinned in `packageManager`) | `pnpm --version`  |
| Git LFS     | latest                               | `git lfs version` |
| OS          | Linux (Ubuntu)                       | `uname -a`        |

Install pnpm if missing:

```sh
rtk corepack enable
rtk corepack prepare pnpm@11.10.0 --activate
```

Install Git LFS if missing:

```sh
rtk sudo apt install git-lfs
rtk git lfs install
```

---

## 2. Clone and install

```sh
rtk git clone <repo-url> werkstatt
cd werkstatt

# Configure git hooks (required for ecosystem.commit enforcement)
rtk git config core.hooksPath hooks/

# Install dependencies (includes Playwright Chromium)
rtk pnpm install
```

If you cloned without running onboarding, invoke the `setup-ecosystem` skill to configure hooks and verify the ecosystem automatically.

---

## 3. Cloudflare API token

The workshop needs a Cloudflare API token for:

- **CDN cache purge** after deploy (`leitstand.dev-deploy`, `leitstand.propagate`, `leitstand.promote`)
- **wrangler deploy** (deploying Workers to Cloudflare)
- **subdomain.register** (creating DNS records and Workers routes)
- **Cache bypass rule** (dev channel must not be cached)

### 3.1 Create a User API Token

> **IMPORTANT:** Create a **User API Token**, NOT an Account API Token. Account API Tokens are for account-scoped endpoints only and cannot combine zone- and account-scoped permissions. User API Tokens can carry both zone- and account-scoped permissions simultaneously.

1. Go to **Cloudflare Dashboard** → **My Profile** → **API Tokens**
2. Click **Create Token** → **Create Custom Token**
3. Name it: `ci-worker-deploy-and-cache-purge-prod`

### 3.2 Permissions

| Permission                    | Scope   | Level | Purpose                                 |
| ----------------------------- | ------- | ----- | --------------------------------------- |
| **Zone → Cache Purge**        | Zone    | Purge | CDN cache purge after deploy (RFC-0624) |
| **Account → Workers Scripts** | Account | Edit  | `wrangler deploy` (deploy Workers)      |
| **Zone → Workers Routes**     | Zone    | Edit  | Workers route management                |
| **Zone → DNS**                | Zone    | Edit  | `subdomain.register` (RFC-0752)         |
| **Zone → Page Rules**         | Zone    | Edit  | Dev channel cache bypass rule           |

### 3.3 Resource restrictions (least-privilege)

- **Account Resources:** `Include → Specific account → <your Cloudflare account>`
- **Zone Resources:** `Include → Specific zone → <your domain>`

Do NOT use `All zones` or `All accounts` — scope to exactly what the workshop needs.

### 3.4 Save the token

Cloudflare shows the secret **only once**. Copy it immediately to:

- `.env` file (local development)
- CI secrets (GitHub Actions / deployment pipeline)
- Password manager

The token value starts with a prefix indicating its type. User API Tokens work for all workshop operations.

---

## 4. `.env` setup

Copy the template and fill in values:

```sh
rtk cp .env.example .env
# Edit .env with your values
```

### Required variables for deployment

| Variable | Purpose | How to obtain |
| --- | --- | --- |
| `CLOUDFLARE_API_TOKEN` | API token (see §3) | Cloudflare Dashboard → My Profile → API Tokens → Create Custom Token |
| `CLOUDFLARE_ZONE_ID` | Zone ID for CDN cache purge | Cloudflare Dashboard → Overview → Zone ID (right sidebar) |
| `CLOUDFLARE_ACCOUNT_ID` | Account ID for wrangler deploy | Cloudflare Dashboard → Overview → Account ID (right sidebar) |
| `PASSPORT_SIGNING_KEY` | Ed25519 signing key for commits | `pnpm exec site-kernel run identity.bootstrap --operator-name "Your Name" --domain warpgogol.com --json` |

### Optional variables (depending on features)

| Variable           | Purpose                 | When needed                       |
| ------------------ | ----------------------- | --------------------------------- |
| `OPENAI_API_KEY`   | Changelog AI generation | When using AI-powered changelog   |
| `R2_AXIOM_*`       | Evidence sync to R2     | When using `evidence.sync`        |
| `R2_NACHWEIS_*`    | Nachweis ingest to R2   | When using `nachweis.ingest`      |
| `WARPGOGOL_OTLP_*` | OTLP observability      | When using observability services |

See `.env.example` for the full list with `# How to obtain:` instructions per key.

### `.env` loading

The site-kernel CLI automatically loads `.env` from the workspace root via `import "dotenv/config"` in the CLI entry point. No need to `source .env` manually before running commands.

The `.env` file is gitignored — it stays local to each workshop.

---

## 5. Cloudflare DNS and cache setup

Each Sternsystem deploys to three channels. See [deployment-channels.md](./deployment-channels.md) for the full reference.

### 5.1 DNS records

Each channel needs a DNS record pointing to its Worker via Workers custom domain:

| Channel        | DNS type | Content                         | Proxied |
| -------------- | -------- | ------------------------------- | ------- |
| `dev.<domain>` | AAAA     | `100::` (Workers custom domain) | Yes     |
| `alt.<domain>` | AAAA     | `100::` (Workers custom domain) | Yes     |
| `<domain>`     | AAAA     | `100::` (Workers custom domain) | Yes     |

The `100::` address is Cloudflare's reserved IPv6 for Workers custom domains. The DNS record is automatically created when you enable the Workers custom domain in the dashboard or via `wrangler` / API.

### 5.2 Cache bypass for dev channel (mandatory)

The dev channel must **never** be cached at the CDN edge. Stale cache on dev makes Axiom verification meaningless.

**Setup via Cloudflare dashboard:**

1. Go to **Cloudflare dashboard** → `<zone>` → **Caching** → **Cache Rules**
2. Create a rule:
   - **When:** Hostname equals `dev.<domain>`
   - **Then:** Cache eligibility = **Bypass**
3. Set priority to 1 (above any other cache rules)

This requires the **Page Rules: Edit** permission on the API token.

### 5.3 Workers custom domains

Each worker is deployed with `wrangler deploy --name <worker-name>`. Enable custom domains via:

- Cloudflare dashboard → Workers & Pages → `<worker>` → **Triggers** → **Custom Domains**
- Add `dev.<domain>` / `alt.<domain>` / `<domain>`

---

## 6. First deploy verification

After completing steps 1-5, verify the workshop can deploy:

```sh
# 1. Verify token is valid (pre-flight check runs automatically during deploy)
rtk pnpm exec site-kernel run leitstand.dev-deploy --site <system-id> --release <release-id>
```

The pre-flight check will log:

- `[leitstand] Cloudflare API token verified` — token is valid
- `[leitstand] Cloudflare API token invalid: ...` — token is invalid, update `.env`
- `[leitstand] CLOUDFLARE_API_TOKEN not set — CDN cache purge will be skipped` — `.env` not configured

If the token is invalid, the CDN cache purge will fail and health checks will report `unhealthy` due to stale cache. Update `CLOUDFLARE_API_TOKEN` in `.env` and re-deploy.

---

## 7. Troubleshooting

### `CLOUDFLARE_API_TOKEN not set` during deploy

1. Verify `.env` exists at the workspace root
2. Verify `CLOUDFLARE_API_TOKEN=<token>` is set in `.env`
3. The CLI loads `.env` automatically — no `source` needed

### CDN cache purge fails with 401 Authentication error

1. The API token is expired or invalid
2. Create a new token (see §3) and update `.env`
3. Re-run the deploy

### Health checks report `unhealthy` after deploy

1. This is typically caused by a failed CDN cache purge — stale content causes hash mismatches
2. Fix the token (see above) and re-deploy
3. If the token is valid but content is still stale, purge everything:
   ```sh
   curl -X POST "https://api.cloudflare.com/client/v4/zones/<zone_id>/purge_cache" \
     -H "Authorization: Bearer <api_token>" \
     -H "Content-Type: application/json" \
     -d '{"purge_everything":true}'
   ```

### dev.warpgogol.com serves stale content after deploy

1. Check if a cache bypass Cache Rule exists for `dev.<domain>` (see §5.2)
2. If the rule exists but content is still stale, old cache entries may persist until expiry — purge everything

---

## See also

- [deployment-channels.md](./deployment-channels.md) — detailed channel architecture and cache configuration
- [r2-evidence-setup.md](./r2-evidence-setup.md) — R2 bucket setup for evidence sync
- [AGENTS.md](../../AGENTS.md) — repository-wide agent instructions
- [README.md](../../README.md) — project overview and quick start
