/*
<MODULE_CONTRACT>
<purpose>Deploy adapter barrel for the game plugin (RFC-0777).</purpose>
<keywords>deploy, barrel, game</keywords>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0777: initial deploy barrel.</item>
</CHANGE_SUMMARY>
*/

export { createGitHubPagesAdapter } from "./github-pages.ts";
export { createCloudflarePagesAdapter } from "./cloudflare-pages.ts";
