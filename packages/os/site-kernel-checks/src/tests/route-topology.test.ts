import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runRouteTopologyValidate } from "../route-topology.ts";
import type { KernelCommandInput } from "@gogol/site-kernel";
import { makeTestSiteContext } from "./helpers.ts";

/*
<MODULE_CONTRACT>
  <purpose>
    Fixture-based tests for route.topology.validate — guards the
    unprefixed-default-language routing contract (RFC-0160).
  </purpose>
</MODULE_CONTRACT>
*/

const SYSTEM_MD = (
  defaultLang: string,
  pages: Array<{ pageId: string; routes: Record<string, string> }>,
) => `---
title: Test
i18n:
  default: ${defaultLang}
  supported:
    ${defaultLang}: true
    en: true
pages:
${pages
  .map(
    (p) =>
      `  - pageId: ${p.pageId}\n    routes:\n${Object.entries(p.routes)
        .map(([lang, slug]) => `      ${lang}: ${slug}`)
        .join("\n")}`,
  )
  .join("\n")}
---
# Test
`;

const INDEX_ASTRO = `---
import { resolvePageRoute } from "@gogol/share/route";
---
<resolvePageRoute />
`;

const SLUG_ASTRO = `---
import { getStaticPathsForDefaultLang } from "@gogol/share/route";
---
<getStaticPathsForDefaultLang />
`;

const PREFIXED_ASTRO = `---
import { getStaticPathsForPrefixedLangs, getStaticPathsForDefaultLangRedirects } from "@gogol/share/route";
---
<getStaticPathsForPrefixedLangs />
<getStaticPathsForDefaultLangRedirects />
`;

describe("route.topology.validate", () => {
  let workspaceRoot: string;
  let appDir: string;
  let srcDir: string;
  let pagesDir: string;
  let contentDir: string;

  beforeEach(async () => {
    workspaceRoot = await mkdtemp(join(tmpdir(), "route-topo-"));
    appDir = join(workspaceRoot, "apps", "test-app");
    srcDir = join(appDir, "src");
    pagesDir = join(srcDir, "pages");
    contentDir = join(srcDir, "content");
    await mkdir(contentDir, { recursive: true });
    await mkdir(pagesDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(workspaceRoot, { recursive: true, force: true });
  });

  async function writeRouteFiles(): Promise<void> {
    await writeFile(join(pagesDir, "index.astro"), INDEX_ASTRO);
    await writeFile(join(pagesDir, "[...slug].astro"), SLUG_ASTRO);
    await mkdir(join(pagesDir, "[lang]"), { recursive: true });
    await writeFile(join(pagesDir, "[lang]", "[...slug].astro"), PREFIXED_ASTRO);
  }

  it("passes with valid topology and route files", async () => {
    await writeFile(
      join(contentDir, "system.md"),
      SYSTEM_MD("de", [{ pageId: "home", routes: { de: "", en: "en" } }]),
    );
    await writeRouteFiles();

    const input: KernelCommandInput = { flags: {}, argv: [], args: [] };
    const result = await runRouteTopologyValidate(
      input,
      makeTestSiteContext(workspaceRoot, appDir),
    );

    expect(result.exitCode).toBe(0);
  });

  it("fails with RT-01 when default-language slug collides with language code", async () => {
    await writeFile(
      join(contentDir, "system.md"),
      SYSTEM_MD("de", [{ pageId: "about", routes: { de: "en", en: "en/about" } }]),
    );
    await writeRouteFiles();

    const input: KernelCommandInput = { flags: {}, argv: [], args: [] };
    const result = await runRouteTopologyValidate(
      input,
      makeTestSiteContext(workspaceRoot, appDir),
    );

    expect(result.exitCode).toBe(1);
    const data = result.data as { diagnostics: Array<{ message: string }> };
    expect(data.diagnostics.some((d) => d.message.includes("RT-01"))).toBe(true);
  });

  it("fails with RT-02 when route files are missing", async () => {
    await writeFile(
      join(contentDir, "system.md"),
      SYSTEM_MD("de", [{ pageId: "home", routes: { de: "", en: "en" } }]),
    );
    // Don't write route files

    const input: KernelCommandInput = { flags: {}, argv: [], args: [] };
    const result = await runRouteTopologyValidate(
      input,
      makeTestSiteContext(workspaceRoot, appDir),
    );

    expect(result.exitCode).toBe(1);
    const data = result.data as { diagnostics: Array<{ message: string }> };
    expect(data.diagnostics.some((d) => d.message.includes("RT-02"))).toBe(true);
  });

  it("fails with RT-02 when index.astro lacks resolvePageRoute", async () => {
    await writeFile(
      join(contentDir, "system.md"),
      SYSTEM_MD("de", [{ pageId: "home", routes: { de: "", en: "en" } }]),
    );
    await writeFile(join(pagesDir, "index.astro"), "<div>no resolve</div>");
    await writeFile(join(pagesDir, "[...slug].astro"), SLUG_ASTRO);
    await mkdir(join(pagesDir, "[lang]"), { recursive: true });
    await writeFile(join(pagesDir, "[lang]", "[...slug].astro"), PREFIXED_ASTRO);

    const input: KernelCommandInput = { flags: {}, argv: [], args: [] };
    const result = await runRouteTopologyValidate(
      input,
      makeTestSiteContext(workspaceRoot, appDir),
    );

    expect(result.exitCode).toBe(1);
    const data = result.data as { diagnostics: Array<{ message: string }> };
    expect(data.diagnostics.some((d) => d.message.includes("RT-02"))).toBe(true);
  });
});
