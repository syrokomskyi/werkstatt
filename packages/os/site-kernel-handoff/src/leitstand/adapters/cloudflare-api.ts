/*
<MODULE_CONTRACT>
<purpose>
RFC-0752: Cloudflare REST API client for DNS records and Workers routes.
Provides typed functions for listing, creating, and verifying DNS CNAME records
and Workers routes via the Cloudflare API. Separate from cloudflare-workers.ts
(which wraps wrangler CLI) — this module uses the REST API directly.
</purpose>
<non-goals>
  <item>Do not log, echo, or serialize secret values or resolved secrets-file contents.</item>
  <item>Do not implement DNS propagation waiting or health checks — those are out of scope for this module.</item>
  <item>Do not implement cache purge — that lives in cache-purge.ts.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0752: initial Cloudflare REST API client — listDnsRecords, createDnsRecord, listWorkersRoutes, createWorkersRoute.</item>
</CHANGE_SUMMARY>
*/

const CLOUDFLARE_API_BASE = "https://api.cloudflare.com/client/v4";

interface CloudflareDnsRecord {
  id: string;
  type: string;
  name: string;
  content: string;
  proxied: boolean;
}

interface CloudflareWorkersRoute {
  id: string;
  pattern: string;
  script: string | null;
}

interface CloudflareListResponse<T> {
  success: boolean;
  errors: { code: number; message: string }[];
  messages: { code: number; message: string }[];
  result: T[];
}

interface CloudflareCreateResponse<T> {
  success: boolean;
  errors: { code: number; message: string }[];
  messages: { code: number; message: string }[];
  result: T;
}

function authHeaders(apiToken: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiToken}`,
    "Content-Type": "application/json",
  };
}

export async function listDnsRecords(
  zoneId: string,
  apiToken: string,
  name?: string,
): Promise<CloudflareDnsRecord[]> {
  const url = new URL(`${CLOUDFLARE_API_BASE}/zones/${zoneId}/dns_records`);
  if (name) {
    url.searchParams.set("name", name);
  }

  const response = await fetch(url.toString(), {
    headers: authHeaders(apiToken),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => `HTTP ${response.status}`);
    throw new Error(
      `[cloudflare-api] listDnsRecords failed: HTTP ${response.status}: ${errorText}`,
    );
  }

  const body = (await response.json()) as CloudflareListResponse<CloudflareDnsRecord>;
  if (!body.success) {
    const errorMessages = body.errors.map((e) => `${e.code}: ${e.message}`).join(", ");
    throw new Error(`[cloudflare-api] listDnsRecords API errors: ${errorMessages}`);
  }

  return body.result;
}

export async function createDnsRecord(
  zoneId: string,
  apiToken: string,
  record: { type: "CNAME"; name: string; content: string; proxied: boolean },
): Promise<CloudflareDnsRecord> {
  const response = await fetch(`${CLOUDFLARE_API_BASE}/zones/${zoneId}/dns_records`, {
    method: "POST",
    headers: authHeaders(apiToken),
    body: JSON.stringify(record),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => `HTTP ${response.status}`);
    throw new Error(
      `[cloudflare-api] createDnsRecord failed: HTTP ${response.status}: ${errorText}`,
    );
  }

  const body = (await response.json()) as CloudflareCreateResponse<CloudflareDnsRecord>;
  if (!body.success) {
    const errorMessages = body.errors.map((e) => `${e.code}: ${e.message}`).join(", ");
    throw new Error(`[cloudflare-api] createDnsRecord API errors: ${errorMessages}`);
  }

  return body.result;
}

export async function listWorkersRoutes(
  zoneId: string,
  apiToken: string,
): Promise<CloudflareWorkersRoute[]> {
  const response = await fetch(`${CLOUDFLARE_API_BASE}/zones/${zoneId}/workers/routes`, {
    headers: authHeaders(apiToken),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => `HTTP ${response.status}`);
    throw new Error(
      `[cloudflare-api] listWorkersRoutes failed: HTTP ${response.status}: ${errorText}`,
    );
  }

  const body = (await response.json()) as CloudflareListResponse<CloudflareWorkersRoute>;
  if (!body.success) {
    const errorMessages = body.errors.map((e) => `${e.code}: ${e.message}`).join(", ");
    throw new Error(`[cloudflare-api] listWorkersRoutes API errors: ${errorMessages}`);
  }

  return body.result;
}

export async function createWorkersRoute(
  zoneId: string,
  apiToken: string,
  route: { pattern: string; script: string },
): Promise<CloudflareWorkersRoute> {
  const response = await fetch(
    `${CLOUDFLARE_API_BASE}/zones/${zoneId}/workers/routes`,
    {
      method: "POST",
      headers: authHeaders(apiToken),
      body: JSON.stringify(route),
    },
  );

  if (!response.ok) {
    const errorText = await response.text().catch(() => `HTTP ${response.status}`);
    throw new Error(
      `[cloudflare-api] createWorkersRoute failed: HTTP ${response.status}: ${errorText}`,
    );
  }

  const body = (await response.json()) as CloudflareCreateResponse<CloudflareWorkersRoute>;
  if (!body.success) {
    const errorMessages = body.errors.map((e) => `${e.code}: ${e.message}`).join(", ");
    throw new Error(`[cloudflare-api] createWorkersRoute API errors: ${errorMessages}`);
  }

  return body.result;
}

export type { CloudflareDnsRecord, CloudflareWorkersRoute };
