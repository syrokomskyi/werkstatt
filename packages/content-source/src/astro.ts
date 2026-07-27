/*
<MODULE_CONTRACT>
<purpose>
  [RFC-0141] The Astro-bound surface of the Content Source Provider port. This is the single
  named seam through which all package-level content reads flow: it owns the dependency on the
  Astro virtual `astro:content` module and re-exports getEntry/getCollection so no other
  @gogol/* module imports astro:content directly.
</purpose>
<non-goals>
  <item>Do not resolve assets here — import.meta.glob is call-site-bound; UI uses createFsAssetResolver(images).</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0141: introduced the Astro content seam (getEntry/getCollection re-exports).</item>
</CHANGE_SUMMARY>
*/

import { getEntry, getCollection } from "astro:content";

// Re-export the Astro Content Layer accessors. Package-level content readers import these
// from here (not from astro:content directly) so the source dependency stays in one place.
export { getEntry, getCollection };
