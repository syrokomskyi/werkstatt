/***************************************************************
<MODULE_CONTRACT>
<purpose>Facilitates the retrieval and management of directory paths for Astro sites within the WGogol ecosystem.</purpose>
<non-goals>
  <item>Do not handle file content parsing or manipulation.</item>
  <item>Do not manage application lifecycle or orchestration.</item>
  <item>Do not provide external API integrations or network operations.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Added Compass scaffolding to clarify module purpose, responsibilities, and boundaries.</item>
  <item>RFC-0489: Removed openSourcePagePath and openSourceProsePath — generator uses contentPagesDirectory/contentDirectory with i18n-aware per-language paths.</item>
</CHANGE_SUMMARY>
***************************************************************/

import path from "node:path";
import type { DiscoveredSiteWorkspace, KernelRuntimeContext } from "@gogol/site-kernel";
export interface AstroSitePaths {
  appDirectory: string;
  srcDirectory: string;
  publicDirectory: string;
  contentDirectory: string;
  contentPagesDirectory: string;
  fundingProgramsDirectory: string;
  stylesDirectory: string;
  iconsAssetsDirectory: string;
  generatedIconsDirectory: string;
}

export function getAstroSitePaths(appDirectory: string): AstroSitePaths {
  const srcDirectory = path.join(appDirectory, "src");
  return {
    appDirectory,
    srcDirectory,
    publicDirectory: path.join(appDirectory, "public"),
    contentDirectory: path.join(srcDirectory, "content"),
    contentPagesDirectory: path.join(srcDirectory, "content", "pages"),
    fundingProgramsDirectory: path.join(srcDirectory, "content", "collections", "funding-programs"),
    stylesDirectory: path.join(srcDirectory, "styles"),
    iconsAssetsDirectory: path.join(srcDirectory, "assets", "icons"),
    generatedIconsDirectory: path.join(srcDirectory, "components", "icons", "gen"),
  };
}

export function getAstroSitePathsFromApp(app: DiscoveredSiteWorkspace): AstroSitePaths {
  return getAstroSitePaths(app.directory);
}

export function requireAstroSitePaths(context: KernelRuntimeContext): AstroSitePaths {
  if (!context.site) {
    throw new Error("This command requires an app-scoped runtime context.");
  }

  return getAstroSitePathsFromApp(context.site);
}
