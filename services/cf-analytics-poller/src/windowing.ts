/*
<MODULE_CONTRACT>
<purpose>Compute settled polling windows for Cloudflare analytics time-range queries (RFC-0343).</purpose>
<non-goals>
  <item>Do not perform I/O or contact Cloudflare.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Extract settledWindow from loop.ts into a pure windowing module.</item>
</CHANGE_SUMMARY>
*/

const SETTLED_LAG_MS = 5 * 60 * 1000;
const WINDOW_SIZE_MS = 5 * 60 * 1000;

export function settledWindow(now: number = Date.now()): { since: string; until: string } {
  const until = new Date(now - SETTLED_LAG_MS).toISOString();
  const since = new Date(now - SETTLED_LAG_MS - WINDOW_SIZE_MS).toISOString();
  return { since, until };
}
