import { describe, it, expect } from "vitest";
import path from "node:path";
import {
  getAstroSitePaths,
  getAstroSitePathsFromApp,
  requireAstroSitePaths,
  type AstroSitePaths,
} from "./index.ts";
import type { DiscoveredSiteWorkspace, KernelRuntimeContext } from "@warpgogol/werkstatt/kernel";

describe("getAstroSitePaths", () => {
  it("resolves all expected paths from an app directory", () => {
    const app = "/srv/site";
    const paths = getAstroSitePaths(app);

    expect(paths.appDirectory).toBe(app);
    expect(paths.srcDirectory).toBe(path.join(app, "src"));
    expect(paths.publicDirectory).toBe(path.join(app, "public"));
    expect(paths.contentDirectory).toBe(path.join(app, "src", "content"));
    expect(paths.contentPagesDirectory).toBe(path.join(app, "src", "content", "pages"));
    expect(paths.fundingProgramsDirectory).toBe(
      path.join(app, "src", "content", "collections", "funding-programs"),
    );
    expect(paths.stylesDirectory).toBe(path.join(app, "src", "styles"));
    expect(paths.iconsAssetsDirectory).toBe(path.join(app, "src", "assets", "icons"));
    expect(paths.generatedIconsDirectory).toBe(path.join(app, "src", "components", "icons", "gen"));
  });

  it("returns a consistent object shape with all required keys", () => {
    const paths = getAstroSitePaths("/tmp");
    const keys: (keyof AstroSitePaths)[] = [
      "appDirectory",
      "srcDirectory",
      "publicDirectory",
      "contentDirectory",
      "contentPagesDirectory",
      "fundingProgramsDirectory",
      "stylesDirectory",
      "iconsAssetsDirectory",
      "generatedIconsDirectory",
    ];
    for (const key of keys) {
      expect(paths[key]).toBeDefined();
    }
  });
});

describe("getAstroSitePathsFromApp", () => {
  it("delegates to getAstroSitePaths using app.directory", () => {
    const app: DiscoveredSiteWorkspace = {
      name: "warpgogol-com",
      directory: "/srv/warpgogol-com",
      toolsDirectory: "/srv/warpgogol-com/tools",
    };
    const paths = getAstroSitePathsFromApp(app);
    expect(paths).toEqual(getAstroSitePaths(app.directory));
  });
});

describe("requireAstroSitePaths", () => {
  it("throws when context.site is undefined", () => {
    const context = {
      workspaceRoot: "/srv",
      site: undefined,
    } as unknown as KernelRuntimeContext;

    expect(() => requireAstroSitePaths(context)).toThrow(
      "This command requires an app-scoped runtime context.",
    );
  });

  it("returns paths derived from context.site", () => {
    const context = {
      workspaceRoot: "/srv",
      site: {
        name: "warpgogol-com",
        directory: "/srv/warpgogol-com",
        toolsDirectory: "/srv/warpgogol-com/tools",
      },
    } as unknown as KernelRuntimeContext;

    const paths = requireAstroSitePaths(context);
    expect(paths.appDirectory).toBe("/srv/warpgogol-com");
    expect(paths.srcDirectory).toBe(path.join("/srv/warpgogol-com", "src"));
  });
});
