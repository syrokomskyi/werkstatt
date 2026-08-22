/*
<MODULE_CONTRACT>
<purpose>
RFC-0909: Sitemap submission to Google Search Console API. Uses hand-rolled
JWT + fetch (no googleapis dependency) to submit the sitemap index URL via
the Search Console API. Reads credentials from GSC_SERVICE_ACCOUNT_JSON env var.
</purpose>
<non-goals>
  <item>Do not validate the verification declaration — that lives in search-verification.ts.</item>
  <item>Do not submit to IndexNow — that lives in indexnow.ts (RFC-0311).</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0909: initial sitemap submission handler with hand-rolled JWT + fetch.</item>
</CHANGE_SUMMARY>
*/

import { createSign } from "node:crypto";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/werkstatt/kernel";
import type { KernelNextStep } from "@warpgogol/werkstatt/kernel";
import { asRecord, asString, loadPublicContext } from "./shared.ts";

const GSC_SCOPE = "https://www.googleapis.com/auth/webmasters";
const GSC_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GSC_API_BASE = "https://www.googleapis.com/webmasters/v3";
const JWT_LIFETIME_SECONDS = 3600;

export interface SitemapSubmitResult {
  submitted: boolean;
  skipped: boolean;
  dryRun: boolean;
  sitemapUrl: string;
  apiResponse?: {
    status: number;
    statusText: string;
    body?: string;
  };
  error?: string;
}

interface ServiceAccount {
  client_email: string;
  private_key: string;
  token_uri: string;
}

function parseServiceAccount(raw: string): ServiceAccount {
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  const email = asString(parsed.client_email);
  const key = asString(parsed.private_key);
  const tokenUri = asString(parsed.token_uri);
  if (!email || !key || !tokenUri) {
    throw new Error(
      "GSC_SERVICE_ACCOUNT_JSON must contain client_email, private_key, and token_uri fields.",
    );
  }
  return { client_email: email, private_key: key, token_uri: tokenUri };
}

export function buildSitemapSubmitUrl(siteUrl: string, sitemapUrl: string): string {
  const encodedSite = encodeURIComponent(siteUrl);
  const encodedSitemap = encodeURIComponent(sitemapUrl);
  return `${GSC_API_BASE}/sites/${encodedSite}/sitemaps/${encodedSitemap}`;
}

function base64UrlEncode(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input) : input;
  return buf.toString("base64url");
}

function buildJwt(serviceAccount: ServiceAccount): string {
  const header = { alg: "RS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: serviceAccount.client_email,
    scope: GSC_SCOPE,
    aud: serviceAccount.token_uri,
    exp: now + JWT_LIFETIME_SECONDS,
    iat: now,
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  const sign = createSign("RSA-SHA256");
  sign.update(signingInput);
  const signature = sign.sign(serviceAccount.private_key);

  return `${signingInput}.${base64UrlEncode(signature)}`;
}

async function exchangeJwtForAccessToken(
  serviceAccount: ServiceAccount,
  jwt: string,
): Promise<string> {
  const response = await fetch(serviceAccount.token_uri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Token exchange failed (${response.status}): ${body}`);
  }

  const data = (await response.json()) as Record<string, unknown>;
  const accessToken = asString(data.access_token);
  if (!accessToken) {
    throw new Error("Token exchange response missing access_token field.");
  }
  return accessToken;
}

export async function runSearchSitemapSubmit(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<SitemapSubmitResult>> {
  const command = "search.sitemap.submit";
  const dryRun = input.flags?.["dry-run"] === true;
  const app = await loadPublicContext(context);

  if (!app.domain) {
    return {
      data: {
        submitted: false,
        skipped: true,
        dryRun,
        sitemapUrl: "",
        error: "Site domain not resolved from system.md.",
      },
      exitCode: 1,
      summary: `[${command}] skipped: site domain not resolved`,
      nextSteps: [
        {
          action: "Add identity.domain to system.md to enable sitemap submission.",
          kind: "required" as const,
        },
      ],
    };
  }

  const siteUrl = app.siteUrl ?? `https://${app.domain}`;
  const sitemapUrl = `${siteUrl}/sitemap-index.xml`;

  const credentialsRaw = process.env.GSC_SERVICE_ACCOUNT_JSON;
  if (!credentialsRaw || credentialsRaw.trim().length === 0) {
    const nextSteps: KernelNextStep[] = [
      {
        action:
          "Set GSC_SERVICE_ACCOUNT_JSON env var with the full service account JSON key. See .env.example for instructions on how to obtain it.",
        kind: "required" as const,
      },
    ];
    return {
      data: {
        submitted: false,
        skipped: true,
        dryRun,
        sitemapUrl,
        error: "GSC_SERVICE_ACCOUNT_JSON env var is not set.",
      },
      exitCode: 1,
      summary: `[${command}] skipped: GSC_SERVICE_ACCOUNT_JSON not set`,
      nextSteps,
    };
  }

  let serviceAccount: ServiceAccount;
  try {
    serviceAccount = parseServiceAccount(credentialsRaw);
  } catch (error) {
    return {
      data: {
        submitted: false,
        skipped: true,
        dryRun,
        sitemapUrl,
        error: `Failed to parse GSC_SERVICE_ACCOUNT_JSON: ${error instanceof Error ? error.message : String(error)}`,
      },
      exitCode: 1,
      summary: `[${command}] skipped: invalid service account JSON`,
      nextSteps: [
        {
          action:
            "Verify GSC_SERVICE_ACCOUNT_JSON contains valid JSON with client_email, private_key, and token_uri fields.",
          kind: "required" as const,
        },
      ],
    };
  }

  const submitUrl = buildSitemapSubmitUrl(siteUrl, sitemapUrl);

  if (dryRun) {
    return {
      data: {
        submitted: false,
        skipped: false,
        dryRun: true,
        sitemapUrl,
        apiResponse: {
          status: 0,
          statusText: "dry-run — no request sent",
          body: `PUT ${submitUrl}\nAuthorization: Bearer <jwt-exchanged-token>`,
        },
      },
      exitCode: 0,
      summary: `[${command}] dry-run: would submit ${sitemapUrl} to ${siteUrl}`,
    };
  }

  try {
    const jwt = buildJwt(serviceAccount);
    const accessToken = await exchangeJwtForAccessToken(serviceAccount, jwt);

    const response = await fetch(submitUrl, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    });

    const body = response.status === 200 ? undefined : await response.text();

    if (response.ok) {
      return {
        data: {
          submitted: true,
          skipped: false,
          dryRun: false,
          sitemapUrl,
          apiResponse: {
            status: response.status,
            statusText: response.statusText,
          },
        },
        exitCode: 0,
        summary: `[${command}] submitted ${sitemapUrl} to Google Search Console for ${siteUrl}`,
      };
    }

    return {
      data: {
        submitted: false,
        skipped: false,
        dryRun: false,
        sitemapUrl,
        apiResponse: {
          status: response.status,
          statusText: response.statusText,
          body,
        },
        error: `Search Console API returned ${response.status} ${response.statusText}`,
      },
      exitCode: 1,
      summary: `[${command}] API error: ${response.status} ${response.statusText}`,
      nextSteps: [
        {
          action: `Check the Search Console API response body for details. Ensure the service account (${serviceAccount.client_email}) is added as a user in the Search Console property for ${siteUrl}.`,
          kind: "required" as const,
        },
      ],
    };
  } catch (error) {
    return {
      data: {
        submitted: false,
        skipped: false,
        dryRun: false,
        sitemapUrl,
        error: error instanceof Error ? error.message : String(error),
      },
      exitCode: 1,
      summary: `[${command}] error: ${error instanceof Error ? error.message : String(error)}`,
      nextSteps: [
        {
          action:
            "Check network connectivity and service account credentials. See docs/runbooks/search-console-setup.md for troubleshooting.",
          kind: "required" as const,
        },
      ],
    };
  }
}
