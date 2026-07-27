/*
<MODULE_CONTRACT>
<purpose>RFC-0186: Shared Lagebild sync worker thin wrapper.
Re-exports createLagebildSharedSyncWorker from @warpgogol/integration-adapter-supabase-crm/worker.
No business logic here — only the deploy target binding.</purpose>
<non-goals>
  <item>Do not implement tenant registry access, Pipedrive delivery, or buffer processing logic here.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0186: Initial creation of shared sync worker deploy target.</item>
</CHANGE_SUMMARY>
*/

import { createLagebildSharedSyncWorker } from "@warpgogol/integration-adapter-supabase-crm/worker";

export default createLagebildSharedSyncWorker();
