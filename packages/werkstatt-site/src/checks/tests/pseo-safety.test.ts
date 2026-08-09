import { describe, it, expect } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pageText, type PageEntry } from "@warpgogol/werkstatt-site/surface";
import { runDemandModifierLint } from "../demand-modifier.ts";
import type { KernelCommandInput, KernelRuntimeContext } from "@warpgogol/werkstatt/kernel";

/*
<MODULE_CONTRACT>
  <purpose>RFC-0274 regression coverage for PSEO safety fixes.</purpose>
</MODULE_CONTRACT>
*/

const logger = {
  section() {},
  info() {},
  warn() {},
  error() {},
  success() {},
  getEvents() {
    return [];
  },
};

const input = { argv: [], flags: {} } as unknown as KernelCommandInput;

async function fixtureContext(
  demandFile: string,
  demandSource: string,
): Promise<{ root: string; context: KernelRuntimeContext }> {
  const root = await mkdtemp(join(tmpdir(), "pseo-safety-"));
  const appDir = join(root, "apps", "demo");
  const demandDir = join(appDir, "src", "content", "surface", "demands", "de");
  await mkdir(demandDir, { recursive: true });
  await writeFile(join(demandDir, demandFile), demandSource, "utf8");
  return {
    root,
    context: {
      workspaceRoot: root,
      site: { name: "demo", directory: appDir, toolsDirectory: join(appDir, "tools") },
      siteExplicit: true,
      logger,
      dryRun: false,
      outputFormat: "json",
    } as unknown as KernelRuntimeContext,
  };
}

describe("PSEO safety fixes (RFC-0274)", () => {
  it("extracts nested visible text without counting technical image/link tokens", () => {
    const page: PageEntry = {
      kind: "page",
      cosmicStar: "Vega",
      title: "Website fuer Elektriker",
      description: "Lokale Nachfrage in Karlsruhe",
      lang: "de",
      blocks: [
        {
          type: "markdown",
          props: {
            cards: [
              {
                title: "Notdienst sichtbar machen",
                body: "Diese verschachtelte Beschreibung muss in den Substance-Text einfliessen.",
                href: "/leistungen/local-seo/",
                image: "hero-bg",
              },
            ],
          },
        },
      ],
    };
    const text = pageText(page);
    expect(text).toContain("verschachtelte Beschreibung");
    expect(text).not.toContain("hero-bg");
    expect(text).not.toContain("/leistungen/local-seo/");
  });

  it("demand.modifier.lint fails a frontmatter modifier slug on any filesystem path", async () => {
    const { root, context } = await fixtureContext("custom.md", "---\nslug: preis\n---\n");
    const result = await runDemandModifierLint(input, context);
    expect(result.exitCode).toBe(1);
    await rm(root, { recursive: true, force: true });
  });

  it("demand.modifier.lint passes a non-modifier demand slug", async () => {
    const { root, context } = await fixtureContext("website.md", "---\nslug: website\n---\n");
    const result = await runDemandModifierLint(input, context);
    expect(result.exitCode ?? 0).toBe(0);
    await rm(root, { recursive: true, force: true });
  });
});
