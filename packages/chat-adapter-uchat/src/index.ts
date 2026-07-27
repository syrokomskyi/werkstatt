/*
<MODULE_CONTRACT>
<purpose>RFC-0175: barrel for @gogol/chat-adapter-uchat. Re-exports the browser-side widget adapter.
Server-side funnel integration (RFC-0188 UChat API client + webhook receiver) will live in a
separate funnel-client.ts module — this barrel keeps the import surface stable for callers.</purpose>
<non-goals>
  <item>Do not add logic here — this is a barrel only.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0175: initial implementation.</item>
  <item>Architecture review: split widget adapter into widget-adapter.ts; index.ts is now a barrel.</item>
</CHANGE_SUMMARY>
*/

export { default } from "./widget-adapter.ts";
