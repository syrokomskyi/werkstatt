/*
<MODULE_CONTRACT>
<purpose>Maintains packages/os/site-kernel-checks/src/pipelines/index.ts as an authored site-kernel-checks authored module so agents can evolve it without rediscovering local boundaries.</purpose>
<non-goals>
  <item>Do not define pipeline steps here — only re-export from domain-specific pipeline modules.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0348: updated header to v2 two-block contract.</item>
</CHANGE_SUMMARY>
*/

export { SITES_CHECK_AUTHOR_PIPELINE } from "./sites-check-author.ts";
export { SITES_CHECK_POSTBUILD_PIPELINE } from "./sites-check-postbuild.ts";
export { SITES_CHECK_PIPELINE } from "./sites-check.ts";
export { PACKAGES_CHECK_PIPELINE } from "./packages-check.ts";
export { STANDARD_COMPASS_PIPELINE } from "./standard-compass.ts";
export { SITES_BUILD_PREPARE_PIPELINE, SITES_BUILD_PREPARE_DEV_PIPELINE } from "./build-prepare.ts";
export { SITES_BUILD_CHECK_PIPELINE } from "./build-check.ts";
export { SITES_BUILD_POST_PIPELINE } from "./build-post.ts";
export { MISSION_PREFLIGHT_CRITICAL, MISSION_PREFLIGHT_WARNING } from "./mission-preflight.ts";
