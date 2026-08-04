# R2 Evidence Setup Guide

**Bucket:** `axiom-evidence`
**Region:** EU Central
**S3 Endpoint:** `https://4300b51226d758c9c8aff76fc9557565.r2.cloudflarestorage.com`
**RFC:** RFC-0651 (evidence sync)

This guide explains how to create and configure Cloudflare R2 credentials for Axiom evidence archiving. Both human operators and AI agents should follow these steps when setting up a new workshop or rotating credentials.

## Prerequisites

- Cloudflare account with R2 access enabled
- `CLOUDFLARE_ACCOUNT_ID` already set in `.env` (from Cloudflare Dashboard → R2 → Overview → Account ID)

## Step 1: Create the R2 bucket

This step is done once per workshop. The bucket `axiom-evidence` is shared across the entire fleet — evidence is partitioned by key prefix (`{systemId}/{missionId}/{runTimestamp}/`).

**Via Cloudflare Dashboard:**

1. Go to **Cloudflare Dashboard → R2 → Overview**
2. Click **Create bucket**
3. Name: `axiom-evidence`
4. Location: EU Central (or closest EU region)
5. Click **Create**

**Via wrangler CLI:**

```bash
rtk pnpm dlx wrangler r2 bucket create axiom-evidence --location eu-central-1
```

**Via Cloudflare API:**

```bash
rtk curl -X POST "https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/r2/buckets" \
  -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"name":"axiom-evidence","locationHint":"eu-central-1"}'
```

## Step 2: Create R2 API Token (S3-compatible credentials)

R2 S3-compatible credentials **cannot be created via Cloudflare API** — they must be created manually in the Dashboard. This is a Cloudflare limitation, not a tooling gap.

1. Go to **Cloudflare Dashboard → R2 → Manage R2 API Tokens**
2. Click **Create API Token**
3. Configure:
   - **Token name:** `axiom-evidence-evidence-sync` (or similar descriptive name)
   - **Permissions:** **Object Read & Write**
   - **Specify bucket(s):** Select `axiom-evidence` only (least-privilege — do not use "All buckets")
4. Click **Create API Token**
5. **IMPORTANT:** The next page shows:
   - **Access Key ID** — visible anytime after creation
   - **Secret Access Key** — shown **ONCE**, never again. Copy it immediately.
   - **S3 Endpoint URL** — `https://{accountId}.r2.cloudflarestorage.com`
6. If you miss the Secret Access Key, delete the token and create a new one.

## Step 3: Fill in `.env`

```env
# R2 (RFC-0651 evidence sync) — bucket: axiom-evidence
R2_ACCOUNT_ID=<same as CLOUDFLARE_ACCOUNT_ID>
R2_ACCESS_KEY_ID=<Access Key ID from step 2>
R2_SECRET_ACCESS_KEY=<Secret Access Key from step 2>
```

## Step 4: Verify

```bash
rtk pnpm exec site-kernel run evidence.sync --mission <mission-id> --dry-run
```

If credentials are correct, the dry-run reports files that would be uploaded. If credentials are missing or invalid, the command returns `MISSING_ENV` or `R2_UPLOAD_ERROR`.

## Credential rotation

1. Create a new R2 API Token (Step 2 above)
2. Update `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY` in `.env`
3. Delete the old token in Cloudflare Dashboard → R2 → Manage R2 API Tokens
4. Run `evidence.sync --dry-run` to verify

## What NOT to do

- **Do not** use the Cloudflare Account API Token (`CLOUDFLARE_API_TOKEN`) for R2 S3 access — it uses a different authentication scheme. R2 S3 clients require the Access Key ID / Secret Access Key pair.
- **Do not** scope the R2 token to "All buckets" — use least-privilege on `axiom-evidence` only.
- **Do not** commit the Secret Access Key to git. The `.env` file is gitignored. If you accidentally commit it, rotate the token immediately.
- **Do not** create per-system R2 buckets — the single bucket with key-prefix partitioning is the approved design (see critique in session notes).

## R2 Data Catalog (optional)

Cloudflare R2 supports Iceberg-compatible Data Catalog. This is **not required** for evidence sync — `evidence.sync` uses the S3 API directly. The Data Catalog feature can be enabled independently if you want SQL query access to evidence via Spark/PyIceberg, but it is not part of the evidence pipeline.

## Environment variables reference

| Variable | Purpose | Source |
|---|---|---|
| `R2_ACCOUNT_ID` | R2 account identifier (same as `CLOUDFLARE_ACCOUNT_ID`) | Cloudflare Dashboard → R2 → Overview |
| `R2_ACCESS_KEY_ID` | S3-compatible access key | R2 API Token creation page |
| `R2_SECRET_ACCESS_KEY` | S3-compatible secret key | R2 API Token creation page (shown once) |
