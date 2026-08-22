# Search Console Setup Runbook (RFC-0909)

This runbook guides operators through setting up Google Search Console verification and sitemap submission for a Werkstatt site.

## Prerequisites

- Access to Google Cloud Console and Google Search Console
- The site domain must be deployed and accessible
- `system.md` must declare the site domain in `identity.domain`

## Step 1: Enable Google Search Console API

1. Go to [Google Cloud Console](https://console.cloud.google.com/).
2. Create or select a project.
3. Navigate to **APIs & Services → Library**.
4. Search for **Google Search Console API** and click **Enable**.

## Step 2: Create a Service Account

1. Navigate to **IAM & Admin → Service Accounts**.
2. Click **Create Service Account**.
3. Name it (e.g. `warpgogol-sitemap-submitter`).
4. Click **Create and Continue**, then **Done** (no roles needed).

## Step 3: Generate a JSON Key

1. Click the service account email.
2. Go to **Keys → Add Key → Create New Key**.
3. Select **JSON** and click **Create**.
4. Save the downloaded JSON file securely.

## Step 4: Add Service Account to Search Console

1. Go to [Google Search Console](https://search.google.com/search-console).
2. Add or select the site property (Domain or URL prefix).
3. Go to **Settings → Users and permissions**.
4. Click **Add user**.
5. Enter the service account email (`xxx@project.iam.gserviceaccount.com`).
6. Select **Restricted** permission (sufficient for sitemap submission).
7. Click **Add**.

## Step 5: Choose Verification Method

### Option A: DNS TXT Record (recommended)

1. In Search Console, go to **Settings → Ownership verification**.
2. Select **TXT record** method.
3. Copy the verification token (starts with `google-site-verification=`).
4. Add a TXT record to the site's DNS zone:
   - Name: `@` (or the domain root)
   - Content: the full token value
5. Add the token to `system.md`:
   ```yaml
   verification:
     google:
       method: dns-txt
       token: google-site-verification=YOUR_TOKEN
   ```
6. Click **Verify** in Search Console (may take a few minutes for DNS propagation).

### Option B: Meta Tag

1. In Search Console, go to **Settings → Ownership verification**.
2. Select **HTML tag** method.
3. Copy the content value from the meta tag.
4. Add the token to `system.md`:
   ```yaml
   verification:
     google:
       method: meta-tag
       token: google-site-verification=YOUR_TOKEN
   ```
5. Deploy the site. The layout component will emit the meta tag in `<head>`.
6. Click **Verify** in Search Console.

## Step 6: Set the Environment Variable

Set `GSC_SERVICE_ACCOUNT_JSON` in `.env` (or GitHub Actions secret):

```sh
GSC_SERVICE_ACCOUNT_JSON='{ "client_email": "...", "private_key": "...", "token_uri": "..." }'
```

Paste the **full JSON content** from the key file downloaded in Step 3.

## Step 7: Validate and Submit

Run the verification validator (offline):

```sh
pnpm exec werkstatt run search.verification.validate --site <site-id>
```

Run the verification validator (live, after deployment):

```sh
pnpm exec werkstatt run search.verification.validate --site <site-id> --live
```

Submit the sitemap:

```sh
pnpm exec werkstatt run search.sitemap.submit --site <site-id>
```

Or dry-run to see the request without sending:

```sh
pnpm exec werkstatt run search.sitemap.submit --site <site-id> --dry-run
```

## Troubleshooting

- **SEARCH-VERIFY-01**: Missing `verification.google` block in `system.md`. Add the block as shown above.
- **SEARCH-VERIFY-02**: DNS TXT record not found. Wait for DNS propagation (up to 48h) and re-run with `--live`.
- **SEARCH-VERIFY-03**: Meta tag not found in HTML. Ensure the site is deployed and `method: meta-tag` is set.
- **SEARCH-VERIFY-04**: Token format warning. Ensure the token starts with `google-site-verification=`.
- **SEARCH-VERIFY-NETWORK**: Network/DNS lookup failure. Re-run after confirming connectivity.
- **Sitemap submission 403**: Ensure the service account email is added as a user in Search Console.
- **Sitemap submission 404**: Ensure the site property URL matches `identity.domain` in `system.md`.
