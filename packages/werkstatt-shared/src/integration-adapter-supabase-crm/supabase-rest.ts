/*
<MODULE_CONTRACT>
<purpose>Low-level Supabase REST transport for the CRM buffer client. Keeps
PostgREST and RPC request construction in one place while preserving caller-injected
secrets and tenant-scoped RLS headers.</purpose>
<non-goals>
  <item>Do not import the Supabase SDK; transport stays raw fetch.</item>
  <item>Do not encode CRM buffer table semantics; callers own payload shape and casts.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Extracted from client.ts as the shared transport layer for Supabase CRM buffer operations.</item>
</CHANGE_SUMMARY>
*/

/** Minimal config for the Supabase REST client (secrets injected by the caller). */
export interface SupabaseClientConfig {
  /** Supabase project URL, e.g. https://xyz.supabase.co */
  url: string;
  /** Service role key (server-only; never sent to the client). */
  serviceKey: string;
  /** The tenant UUID to scope all queries with RLS. */
  tenantId: string;
}

export type FetchImpl = typeof fetch;

/** Execute a raw SQL statement via the Supabase RPC /rest/v1/rpc endpoint. */
export async function rpc(
  config: SupabaseClientConfig,
  fn: string,
  params: Record<string, unknown>,
  fetchImpl: FetchImpl,
): Promise<unknown> {
  const res = await fetchImpl(`${config.url}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      apikey: config.serviceKey,
      authorization: `Bearer ${config.serviceKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText);
    throw new Error(`supabase rpc ${fn}: ${res.status} ${err}`);
  }
  return res.json();
}

/** Generic PostgREST table request (GET / POST / PATCH). */
export async function rest(
  config: SupabaseClientConfig,
  method: "GET" | "POST" | "PATCH",
  table: string,
  opts: {
    body?: unknown;
    params?: Record<string, string>;
    prefer?: string;
  },
  fetchImpl: FetchImpl,
): Promise<unknown> {
  const url = new URL(`${config.url}/rest/v1/${table}`);
  if (opts.params) {
    for (const [k, v] of Object.entries(opts.params)) {
      url.searchParams.set(k, v);
    }
  }
  // Inject tenant RLS via x-set-config header (Supabase supports per-request set_config).
  const headers: Record<string, string> = {
    apikey: config.serviceKey,
    authorization: `Bearer ${config.serviceKey}`,
    "x-set-config": `app.current_tenant=${config.tenantId}`,
  };
  if (opts.prefer) headers["prefer"] = opts.prefer;
  if (opts.body !== undefined) headers["content-type"] = "application/json";

  const res = await fetchImpl(url.toString(), {
    method,
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText);
    throw new Error(`supabase ${method} /${table}: ${res.status} ${err}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}
