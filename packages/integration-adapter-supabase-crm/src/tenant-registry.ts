/*
<MODULE_CONTRACT>
<purpose>RFC-0186: Tenant registry for the shared Lagebild sync worker.
Defines SyncTenant interface, secret reference contracts, and registry CRUD
operations. Secret values are never stored here — only symbolic reference names
that the Worker resolves from its environment at runtime.</purpose>
<non-goals>
  <item>Do not store or transmit secret values.</item>
  <item>Do not implement CLI commands (see cli.ts).</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0186: Initial creation of tenant registry module.</item>
  <item>RFC-0386: Added p3_stage_map / p4_stage_map to SyncTenant and TenantSecretRefs.</item>
  <item>RFC-0186: Review fixes — extract patchAndParseSingle, add x-set-config to countOutboxByStatus, use Prefer: count=exact, SecretKind union type.</item>
</CHANGE_SUMMARY>
*/

import type { P3StageMap, P4StageMap } from "./pipedrive-sync-target.ts";

/** RFC-0186: Row shape for sync_tenants. */
export interface SyncTenant {
  tenant_id: string;
  site_name: string;
  enabled: boolean;
  supabase_project_ref: string;
  supabase_url_secret_ref: string;
  supabase_service_key_secret_ref: string;
  destination_vendor: string;
  destination_token_secret_ref: string;
  destination_domain_secret_ref: string;
  /** RFC-0386: P3 pipeline stage map (JSON column from sync_tenants). */
  p3_stage_map?: P3StageMap;
  /** RFC-0386: P4 pipeline stage map (JSON column from sync_tenants). */
  p4_stage_map?: P4StageMap;
  cron_group: string;
  batch_size: number;
  max_concurrency: number;
  circuit_breaker_threshold: number;
  last_seen_at: string | null;
  last_success_at: string | null;
  last_error_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

/** RFC-0186: Resolved secrets from Worker environment (values, not refs). */
export interface TenantSecretRefs {
  supabase_url: string;
  supabase_service_key: string;
  destination_token: string;
  destination_domain: string;
  /** RFC-0386: P3 pipeline stage map (from registry JSON column). */
  p3StageMap?: P3StageMap;
  /** RFC-0386: P4 pipeline stage map (from registry JSON column). */
  p4StageMap?: P4StageMap;
}

/** RFC-0186: Tenant with resolved secrets or resolution errors. */
export interface TenantWithSecrets {
  tenant: SyncTenant;
  secrets: TenantSecretRefs | null;
  missing: string[];
}

/** Resolve secret references from Worker env. Returns nulls if any missing. */
export function resolveTenantSecrets(
  tenant: SyncTenant,
  env: Record<string, string | undefined>,
): TenantWithSecrets {
  const url = env[tenant.supabase_url_secret_ref];
  const key = env[tenant.supabase_service_key_secret_ref];
  const token = env[tenant.destination_token_secret_ref];
  const domain = env[tenant.destination_domain_secret_ref];

  const missing: string[] = [];
  if (!url) missing.push(tenant.supabase_url_secret_ref);
  if (!key) missing.push(tenant.supabase_service_key_secret_ref);
  if (!token) missing.push(tenant.destination_token_secret_ref);
  if (!domain) missing.push(tenant.destination_domain_secret_ref);

  if (missing.length > 0) {
    return { tenant, secrets: null, missing };
  }

  return {
    tenant,
    secrets: {
      supabase_url: url!,
      supabase_service_key: key!,
      destination_token: token!,
      destination_domain: domain!,
      p3StageMap: tenant.p3_stage_map,
      p4StageMap: tenant.p4_stage_map,
    },
    missing: [],
  };
}

/** Minimal REST client for sync_tenants (PostgREST-compatible). */
export interface RegistryClient {
  url: string;
  apiKey: string;
}

/** Fetch enabled tenants for a cron group (default 'default'). */
export async function getEnabledTenants(
  client: RegistryClient,
  cronGroup = "default",
): Promise<SyncTenant[]> {
  const url = `${client.url}/rest/v1/sync_tenants?enabled=eq.true&cron_group=eq.${encodeURIComponent(cronGroup)}&select=*`;
  const res = await fetch(url, {
    headers: {
      apikey: client.apiKey,
      Authorization: `Bearer ${client.apiKey}`,
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    throw new Error(`getEnabledTenants: ${res.status} ${await res.text()}`);
  }
  return res.json() as Promise<SyncTenant[]>;
}

/** Update tenant health columns after processing. */
export async function updateTenantHealth(
  client: RegistryClient,
  tenantId: string,
  patch: {
    last_seen_at?: string;
    last_success_at?: string;
    last_error_at?: string;
    last_error?: string | null;
  },
): Promise<void> {
  const url = `${client.url}/rest/v1/sync_tenants?tenant_id=eq.${encodeURIComponent(tenantId)}`;
  const res = await fetch(url, {
    method: "PATCH",
    headers: {
      apikey: client.apiKey,
      Authorization: `Bearer ${client.apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/vnd.pgrst.object+json",
    },
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    throw new Error(`updateTenantHealth: ${res.status} ${await res.text()}`);
  }
}

/** RFC-0186: Input for creating a new tenant row. */
export interface CreateTenantInput {
  tenant_id: string;
  site_name: string;
  supabase_project_ref: string;
  supabase_url_secret_ref: string;
  supabase_service_key_secret_ref: string;
  destination_vendor: string;
  destination_token_secret_ref: string;
  destination_domain_secret_ref: string;
  cron_group?: string;
  batch_size?: number;
  max_concurrency?: number;
  circuit_breaker_threshold?: number;
}

/** RFC-0186: Create a tenant row in sync_tenants (enabled defaults to false). */
export async function createTenant(
  client: RegistryClient,
  input: CreateTenantInput,
): Promise<SyncTenant> {
  const url = `${client.url}/rest/v1/sync_tenants`;
  const body = {
    tenant_id: input.tenant_id,
    site_name: input.site_name,
    enabled: false,
    supabase_project_ref: input.supabase_project_ref,
    supabase_url_secret_ref: input.supabase_url_secret_ref,
    supabase_service_key_secret_ref: input.supabase_service_key_secret_ref,
    destination_vendor: input.destination_vendor,
    destination_token_secret_ref: input.destination_token_secret_ref,
    destination_domain_secret_ref: input.destination_domain_secret_ref,
    cron_group: input.cron_group ?? "default",
    batch_size: input.batch_size ?? 100,
    max_concurrency: input.max_concurrency ?? 1,
    circuit_breaker_threshold: input.circuit_breaker_threshold ?? 5,
  };
  const res = await fetch(url, {
    method: "POST",
    headers: {
      apikey: client.apiKey,
      Authorization: `Bearer ${client.apiKey}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      Accept: "application/vnd.pgrst.object+json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => res.statusText);
    throw new Error(`createTenant: ${res.status} ${errText}`);
  }
  return (await res.json()) as SyncTenant;
}

/** RFC-0186: Get a single tenant by site_name. */
export async function getTenantBySiteName(
  client: RegistryClient,
  siteName: string,
): Promise<SyncTenant | null> {
  const url = `${client.url}/rest/v1/sync_tenants?site_name=eq.${encodeURIComponent(siteName)}&select=*`;
  const res = await fetch(url, {
    headers: {
      apikey: client.apiKey,
      Authorization: `Bearer ${client.apiKey}`,
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    throw new Error(`getTenantBySiteName: ${res.status} ${await res.text()}`);
  }
  const rows = (await res.json()) as SyncTenant[];
  return rows.length > 0 ? rows[0]! : null;
}

/** RFC-0186: Enable or disable a tenant by site_name. */
export async function setTenantEnabled(
  client: RegistryClient,
  siteName: string,
  enabled: boolean,
): Promise<SyncTenant | null> {
  const url = `${client.url}/rest/v1/sync_tenants?site_name=eq.${encodeURIComponent(siteName)}`;
  return patchAndParseSingle(client, url, { enabled }, "setTenantEnabled");
}

/** RFC-0186: Secret kind identifiers for rotate-secret. */
export type SecretKind =
  "supabase-url" | "supabase-service-key" | "pipedrive-token" | "pipedrive-domain";

/** RFC-0186: Map secret kind to sync_tenants column name. */
const SECRET_KIND_COLUMN: Record<SecretKind, string> = {
  "supabase-url": "supabase_url_secret_ref",
  "supabase-service-key": "supabase_service_key_secret_ref",
  "pipedrive-token": "destination_token_secret_ref",
  "pipedrive-domain": "destination_domain_secret_ref",
};

/** RFC-0186: Shared PATCH helper with Prefer: return=representation parsing. */
async function patchAndParseSingle(
  client: RegistryClient,
  filterUrl: string,
  body: Record<string, unknown>,
  label: string,
): Promise<SyncTenant | null> {
  const res = await fetch(filterUrl, {
    method: "PATCH",
    headers: {
      apikey: client.apiKey,
      Authorization: `Bearer ${client.apiKey}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      Accept: "application/vnd.pgrst.object+json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => res.statusText);
    throw new Error(`${label}: ${res.status} ${errText}`);
  }
  const text = await res.text();
  if (!text) return null;
  const parsed = JSON.parse(text) as SyncTenant | SyncTenant[];
  return Array.isArray(parsed) ? (parsed[0] ?? null) : parsed;
}

/** RFC-0186: Update a secret_ref column for a tenant. */
export async function updateTenantSecretRef(
  client: RegistryClient,
  siteName: string,
  secretKind: SecretKind,
  newSecretRef: string,
): Promise<SyncTenant | null> {
  const column = SECRET_KIND_COLUMN[secretKind];
  if (!column) {
    throw new Error(
      `Unknown secret kind "${secretKind}". Valid kinds: ${Object.keys(SECRET_KIND_COLUMN).join(", ")}`,
    );
  }
  const url = `${client.url}/rest/v1/sync_tenants?site_name=eq.${encodeURIComponent(siteName)}`;
  return patchAndParseSingle(client, url, { [column]: newSecretRef }, "updateTenantSecretRef");
}

/** RFC-0186: Count outbox rows by status for a tenant using PostgREST count=exact. */
export async function countOutboxByStatus(
  client: RegistryClient,
  tenantId: string,
): Promise<{ pending: number; failed: number; dead: number }> {
  const baseUrl = `${client.url}/rest/v1/sync_outbox`;
  const headers = {
    apikey: client.apiKey,
    Authorization: `Bearer ${client.apiKey}`,
    Accept: "application/json",
    "x-set-config": `app.current_tenant=${tenantId}`,
  };

  async function count(status: string): Promise<number> {
    const url = `${baseUrl}?tenant_id=eq.${encodeURIComponent(tenantId)}&status=eq.${status}&select=id`;
    const res = await fetch(url, {
      headers: { ...headers, Prefer: "count=exact", Range: "0-0" },
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => res.statusText);
      throw new Error(`countOutboxByStatus(${status}): ${res.status} ${errText}`);
    }
    const range = res.headers.get("content-range");
    if (range) {
      const slashIndex = range.lastIndexOf("/");
      if (slashIndex !== -1) {
        const total = range.slice(slashIndex + 1);
        return total === "*" ? 0 : parseInt(total, 10) || 0;
      }
    }
    return 0;
  }

  const [pending, failed, dead] = await Promise.all([
    count("pending"),
    count("failed"),
    count("dead"),
  ]);
  return { pending, failed, dead };
}
