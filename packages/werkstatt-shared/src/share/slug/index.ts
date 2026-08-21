/*
<MODULE_CONTRACT>
<purpose>Canonical slug generation public API barrel (RFC-0915, DNA-88). Sole entry point for all slug generation in the monorepo.</purpose>
<non-goals>
  <item>Do not re-export strategy classes — consumers use slugUrl/slugId/HeadingSlugger only.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0915: created canonical slug module barrel.</item>
</CHANGE_SUMMARY>
*/

export { slugUrl } from "./slug-url.ts";
export { slugId } from "./slug-id.ts";
export { HeadingSlugger } from "./heading-slugger.ts";
