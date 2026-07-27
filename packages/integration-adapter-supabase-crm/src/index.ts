/*
<MODULE_CONTRACT>
<purpose>@gogol/integration-adapter-supabase-crm public entry point. Exports the DestinationAdapter
(supabaseBufferDestinationAdapter), the required secret names, and the Supabase client factory.
Re-exports CrmBuffer types from @gogol/integration/crm-buffer for convenience.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Lagebild MVP: initial public entry point.</item>
</CHANGE_SUMMARY>
*/

export { supabaseBufferDestinationAdapter, SUPABASE_BUFFER_SECRETS } from "./adapter.ts";
export { createSupabaseCrmBufferClient, SupabaseCrmBufferClient } from "./client.ts";
export type { SupabaseClientConfig } from "./client.ts";
export {
  createSyncTarget,
  PipedriveSyncTarget,
  resolvePipedriveStageUpdate,
  STAGE_MAP,
} from "./pipedrive-sync-target.ts";
export type {
  CrmSyncTarget,
  SyncTargetCredentials,
  PipedriveCredentials,
} from "./pipedrive-sync-target.ts";
