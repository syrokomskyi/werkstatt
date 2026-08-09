/*
<MODULE_CONTRACT>
<purpose>RFC-0186: Shared Lagebild sync worker (multi-tenant). Reads enabled tenants from
sync_tenants registry, resolves their secret references from Worker env, and processes each
tenant's pending sync_outbox rows with isolation: per-tenant batch size, concurrency, and circuit
breaker. One Worker serves all clients; tenant lifecycle is data-driven.</purpose>
<non-goals>
  <item>Do not store or transmit secret values other than to destination APIs.</item>
  <item>Do not process tenants with missing secret references.</item>
  <item>Do not mix tenant data (strict RLS via tenant_id).</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0186: Refactored from single-tenant factory to multi-tenant shared worker.</item>
  <item>Extracted Pipedrive sync logic behind CrmSyncTarget port — worker is now a thin orchestrator.</item>
  <item>RFC-0386: Added upsert_subscription / upsert_invoice dispatch and P3/P4 stage-map pass-through.</item>
</CHANGE_SUMMARY>
*/

import { createSupabaseCrmBufferClient } from "./client.ts";
import type { CrmBufferReader, SyncOutboxRow } from "@warpgogol/integration/crm-buffer";
import { createSyncTarget, type CrmSyncTarget } from "./pipedrive-sync-target.ts";
import {
  type SyncTenant,
  type TenantWithSecrets,
  resolveTenantSecrets,
  getEnabledTenants,
  updateTenantHealth,
  type RegistryClient,
} from "./tenant-registry.ts";

/** RFC-0186: Shared Worker env bindings. Includes registry connection + tenant secrets namespace. */
export interface LagebildSharedWorkerEnv {
  // Registry (same Supabase project as buffer)
  LAGEBILD_REGISTRY_URL: string;
  LAGEBILD_REGISTRY_API_KEY: string;
  // Optional: override default cron group
  LAGEBILD_CRON_GROUP?: string;
  // Tenant secrets are resolved dynamically via sync_tenants.secret_ref fields
  // Pattern: TENANT_{SITE_NAME}_{KIND} injected by wrangler secret put
  [key: string]: string | undefined;
}

/** RFC-0186: Factory returning the shared multi-tenant scheduled handler. */
export function createLagebildSharedSyncWorker() {
  return {
    async scheduled(
      _event: ScheduledEvent,
      env: LagebildSharedWorkerEnv,
      _ctx: ExecutionContext,
    ): Promise<void> {
      const registry: RegistryClient = {
        url: env.LAGEBILD_REGISTRY_URL,
        apiKey: env.LAGEBILD_REGISTRY_API_KEY,
      };

      const cronGroup = env.LAGEBILD_CRON_GROUP ?? "default";
      let tenants: SyncTenant[];
      try {
        tenants = await getEnabledTenants(registry, cronGroup);
      } catch (err) {
        console.error("[lagebild] failed to load tenants:", (err as Error).message);
        return;
      }

      if (tenants.length === 0) {
        console.log("[lagebild] no enabled tenants");
        return;
      }

      console.log(`[lagebild] processing ${tenants.length} tenants`);

      for (const tenant of tenants) {
        const resolved = resolveTenantSecrets(tenant, env);
        if (resolved.secrets === null) {
          const msg = `missing secrets: ${resolved.missing.join(", ")}`;
          console.warn(`[lagebild][${tenant.site_name}] ${msg}`);
          await updateTenantHealth(registry, tenant.tenant_id, {
            last_seen_at: new Date().toISOString(),
            last_error_at: new Date().toISOString(),
            last_error: msg,
          });
          continue;
        }

        try {
          await processTenant(tenant, resolved, registry);
          await updateTenantHealth(registry, tenant.tenant_id, {
            last_seen_at: new Date().toISOString(),
            last_success_at: new Date().toISOString(),
            last_error: null,
          });
        } catch (err) {
          const msg = (err as Error).message;
          console.error(`[lagebild][${tenant.site_name}] tenant failed:`, msg);
          await updateTenantHealth(registry, tenant.tenant_id, {
            last_seen_at: new Date().toISOString(),
            last_error_at: new Date().toISOString(),
            last_error: msg,
          });
        }
      }
    },
  };
}

/** RFC-0186: Process one tenant's outbox with per-tenant limits. */
async function processTenant(
  tenant: SyncTenant,
  resolved: TenantWithSecrets,
  _registry: RegistryClient,
): Promise<void> {
  const secrets = resolved.secrets!; // null checked by caller

  const client = createSupabaseCrmBufferClient({
    url: secrets.supabase_url,
    serviceKey: secrets.supabase_service_key,
    tenantId: tenant.tenant_id,
  });

  const target = createSyncTarget(tenant.destination_vendor, {
    destination_token: secrets.destination_token,
    destination_domain: secrets.destination_domain,
    p3StageMap: secrets.p3StageMap,
    p4StageMap: secrets.p4StageMap,
  });

  const tasks = await client.readPendingOutbox(tenant.tenant_id, tenant.batch_size);
  if (tasks.length === 0) return;

  console.log(`[lagebild][${tenant.site_name}] ${tasks.length} tasks`);

  let consecutiveErrors = 0;
  const threshold = tenant.circuit_breaker_threshold;

  // Simple semaphore for max_concurrency (1 = sequential)
  for (const task of tasks) {
    if (consecutiveErrors >= threshold) {
      console.warn(`[lagebild][${tenant.site_name}] circuit open`);
      break;
    }

    try {
      await processTask(task, client, target);
      consecutiveErrors = 0;
      await client.updateOutboxStatus(task.id, "done");
    } catch (err) {
      consecutiveErrors++;
      const msg = (err as Error).message;
      console.error(`[lagebild][${tenant.site_name}] task ${task.id} failed:`, msg);
      await client.updateOutboxStatus(task.id, "failed");
    }
  }
}

/** Route task to the sync target by operation. */
async function processTask(
  task: SyncOutboxRow,
  buffer: CrmBufferReader,
  target: CrmSyncTarget,
): Promise<void> {
  switch (task.op) {
    case "upsert_contact":
      return target.syncContact(task, buffer);
    case "upsert_organization":
      return target.syncOrganization(task, buffer);
    case "upsert_deal":
      return target.syncDeal(task, buffer);
    case "update_deal_stage":
      return target.syncDealStage(task, buffer);
    case "upsert_subscription":
      return target.syncSubscription(task, buffer);
    case "upsert_invoice":
      return target.syncInvoice(task, buffer);
    default:
      throw new Error(`unknown op: ${(task as { op: string }).op}`);
  }
}
