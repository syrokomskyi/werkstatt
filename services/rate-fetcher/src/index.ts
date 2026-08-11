/*
<MODULE_CONTRACT>
<purpose>RFC-0744: Rate Fetcher Worker. Multi-tenant scheduled worker that reads
rate_sources from Supabase, fetches rates via @warpgogol/werkstatt-site/pbp-rate-adapters, and
stores observations in rate_observations table.</purpose>
<non-goals>
  <item>Does not define adapter logic — that lives in @warpgogol/werkstatt-site/pbp-rate-adapters.</item>
  <item>Does not create RateSnapshot content files — that is rate-snapshot.resolve (RFC-0741).</item>
  <item>Does not implement tenant registry access — uses direct Supabase queries.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Established by RFC-0744 — rate fetcher worker with daily cron schedule.</item>
</CHANGE_SUMMARY>
*/

import {
  createEcbAdapter,
  createFrankfurterAdapter,
  getRateSourceAdapter,
  registerRateSourceAdapter,
  type RateSourceAdapter,
} from "@warpgogol/werkstatt-site/pbp-rate-adapters";

export interface RateFetcherWorkerEnv {
  RATE_FETCHER_SUPABASE_URL: string;
  RATE_FETCHER_SUPABASE_KEY: string;
  RATE_FETCHER_CRON_GROUP?: string;
  [key: string]: string | undefined;
}

interface RateSourceRow {
  id: string;
  tenant_id: string;
  site_name: string;
  source_name: string;
  adapter: string;
  config: Record<string, unknown>;
  enabled: boolean;
}

interface RatePolicyPair {
  source_currency: string;
  target_currency: string;
}

function ensureAdaptersRegistered(): void {
  if (!getRateSourceAdapter("ecb")) {
    registerRateSourceAdapter("ecb", createEcbAdapter({ ref: "ecb" }));
  }
  if (!getRateSourceAdapter("frankfurter")) {
    registerRateSourceAdapter("frankfurter", createFrankfurterAdapter({ ref: "frankfurter" }));
  }
}

async function fetchEnabledSources(env: RateFetcherWorkerEnv): Promise<RateSourceRow[]> {
  const url = `${env.RATE_FETCHER_SUPABASE_URL}/rest/v1/rate_sources?enabled=eq.true&select=*`;
  const response = await fetch(url, {
    headers: {
      apikey: env.RATE_FETCHER_SUPABASE_KEY,
      authorization: `Bearer ${env.RATE_FETCHER_SUPABASE_KEY}`,
    },
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch rate_sources: ${response.status}`);
  }
  return response.json() as Promise<RateSourceRow[]>;
}

async function fetchPairsForSource(
  env: RateFetcherWorkerEnv,
  source: RateSourceRow,
): Promise<RatePolicyPair[]> {
  const url = `${env.RATE_FETCHER_SUPABASE_URL}/rest/v1/rate_policies?source_id=eq.${source.id}&select=source_currency,target_currency`;
  const response = await fetch(url, {
    headers: {
      apikey: env.RATE_FETCHER_SUPABASE_KEY,
      authorization: `Bearer ${env.RATE_FETCHER_SUPABASE_KEY}`,
    },
  });
  if (!response.ok) {
    return [];
  }
  return response.json() as Promise<RatePolicyPair[]>;
}

async function insertObservation(
  env: RateFetcherWorkerEnv,
  source: RateSourceRow,
  pair: RatePolicyPair,
  value: string,
  observedAt: string,
  metadata: Record<string, unknown> | undefined,
): Promise<void> {
  const url = `${env.RATE_FETCHER_SUPABASE_URL}/rest/v1/rate_observations`;
  await fetch(url, {
    method: "POST",
    headers: {
      apikey: env.RATE_FETCHER_SUPABASE_KEY,
      authorization: `Bearer ${env.RATE_FETCHER_SUPABASE_KEY}`,
      "content-type": "application/json",
      prefer: "return=minimal",
    },
    body: JSON.stringify({
      tenant_id: source.tenant_id,
      site_name: source.site_name,
      source_id: source.id,
      source_currency: pair.source_currency,
      target_currency: pair.target_currency,
      value,
      observed_at: observedAt,
      metadata: metadata ?? null,
    }),
  });
}

async function updateHealth(
  env: RateFetcherWorkerEnv,
  tenantId: string,
  siteName: string,
  update: {
    last_seen_at?: string;
    last_success_at?: string;
    last_error_at?: string;
    last_error?: string;
  },
): Promise<void> {
  const url = `${env.RATE_FETCHER_SUPABASE_URL}/rest/v1/rate_fetcher_health?tenant_id=eq.${tenantId}&site_name=eq.${siteName}`;
  await fetch(url, {
    method: "PATCH",
    headers: {
      apikey: env.RATE_FETCHER_SUPABASE_KEY,
      authorization: `Bearer ${env.RATE_FETCHER_SUPABASE_KEY}`,
      "content-type": "application/json",
      prefer: "return=minimal",
    },
    body: JSON.stringify(update),
  });
}

export function createRateFetcherWorker() {
  return {
    async scheduled(
      _event: ScheduledEvent,
      env: RateFetcherWorkerEnv,
      _ctx: ExecutionContext,
    ): Promise<void> {
      ensureAdaptersRegistered();

      let sources: RateSourceRow[];
      try {
        sources = await fetchEnabledSources(env);
      } catch (err) {
        console.error("[rate-fetcher] failed to load sources:", (err as Error).message);
        return;
      }

      if (sources.length === 0) {
        console.log("[rate-fetcher] no enabled sources");
        return;
      }

      console.log(`[rate-fetcher] processing ${sources.length} sources`);

      for (const source of sources) {
        const adapter = getRateSourceAdapter(source.adapter) as RateSourceAdapter | undefined;
        if (!adapter) {
          const msg = `unknown adapter: ${source.adapter}`;
          console.warn(`[rate-fetcher][${source.site_name}] ${msg}`);
          await updateHealth(env, source.tenant_id, source.site_name, {
            last_seen_at: new Date().toISOString(),
            last_error_at: new Date().toISOString(),
            last_error: msg,
          });
          continue;
        }

        const pairs = await fetchPairsForSource(env, source);
        if (pairs.length === 0) {
          console.log(`[rate-fetcher][${source.site_name}] no pairs configured`);
          continue;
        }

        let successCount = 0;
        let lastError = "";

        for (const pair of pairs) {
          try {
            const result = await adapter.fetchRate({
              sourceCurrency: pair.source_currency,
              targetCurrency: pair.target_currency,
            });
            await insertObservation(
              env,
              source,
              pair,
              result.value,
              result.observedAt,
              result.metadata,
            );
            successCount++;
          } catch (err) {
            const msg = (err as Error).message;
            console.error(
              `[rate-fetcher][${source.site_name}] ${pair.source_currency}/${pair.target_currency} failed:`,
              msg,
            );
            lastError = msg;
          }
        }

        const now = new Date().toISOString();
        if (successCount > 0 && !lastError) {
          await updateHealth(env, source.tenant_id, source.site_name, {
            last_seen_at: now,
            last_success_at: now,
            last_error: null as unknown as string,
          });
        } else {
          await updateHealth(env, source.tenant_id, source.site_name, {
            last_seen_at: now,
            last_error_at: now,
            last_error: lastError || "no pairs succeeded",
          });
        }

        console.log(
          `[rate-fetcher][${source.site_name}] ${successCount}/${pairs.length} pairs fetched`,
        );
      }
    },
  };
}

const worker = createRateFetcherWorker();

export default {
  scheduled: worker.scheduled.bind(worker),
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/health") {
      return new Response(JSON.stringify({ status: "ok", service: "rate-fetcher" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response("Not found", { status: 404 });
  },
};
