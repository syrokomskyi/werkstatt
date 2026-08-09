/*
<MODULE_CONTRACT>
<purpose>
  Shared helpers for section-owned Astro API routes. Eliminates the duplicated
  `json()` helper and `CALLBACK_PATH` constant across send-message, integration-inbound,
  and stripe-webhook API routes.
</purpose>
<non-goals>
  <item>Do not own route-specific logic — only shared response utilities.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Extracted shared json() helper and CALLBACK_PATH from 3 duplicated API route definitions.</item>
</CHANGE_SUMMARY>
*/

/** The site's own callback route QStash delivers each event back to (RFC-0181). */
export const INTEGRATION_CALLBACK_PATH = "/api/integration-route";

/** Build a JSON Response with the given status code. */
export function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
