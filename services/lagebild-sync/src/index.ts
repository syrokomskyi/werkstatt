/*
<MODULE_CONTRACT>
<purpose>RFC-0186: Shared Lagebild sync worker thin wrapper.
Re-exports createLagebildSharedSyncWorker from @warpgogol/werkstatt-site/integration-adapter-supabase-crm/worker.
No business logic here — only the deploy target binding.</purpose>
<non-goals>
  <item>Do not implement tenant registry access, Pipedrive delivery, or buffer processing logic here.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0186: Initial creation of shared sync worker deploy target.</item>
</CHANGE_SUMMARY>
*/

import { createLagebildSharedSyncWorker } from "@warpgogol/werkstatt-site/integration-adapter-supabase-crm/worker";

const worker = createLagebildSharedSyncWorker();

export default {
  scheduled: worker.scheduled.bind(worker),
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/health") {
      return new Response(JSON.stringify({ status: "ok", service: "lagebild-sync" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response("Not found", { status: 404 });
  },
};
