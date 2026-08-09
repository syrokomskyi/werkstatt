import { describe, it, expect } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runRootCanonicalValidate } from "../root-canonical.ts";
import type { KernelCommandInput, KernelRuntimeContext } from "@warpgogol/werkstatt/kernel";

/*
<MODULE_CONTRACT>
  <purpose>RFC-0261: red/green fixture coverage for root.canonical.validate (RC-00..03).</purpose>
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
  indexAstroSource: string | undefined,
): Promise<{ root: string; context: KernelRuntimeContext }> {
  const root = await mkdtemp(join(tmpdir(), "root-canonical-"));
  const appDir = join(root, "apps", "demo");
  const pagesDir = join(appDir, "src", "pages");
  await mkdir(pagesDir, { recursive: true });
  if (indexAstroSource !== undefined) {
    await writeFile(join(pagesDir, "index.astro"), indexAstroSource, "utf8");
  }
  const context = {
    workspaceRoot: root,
    site: { name: "demo", directory: appDir, toolsDirectory: join(appDir, "tools") },
    siteExplicit: true,
    logger,
    dryRun: false,
    outputFormat: "json",
  } as unknown as KernelRuntimeContext;
  return { root, context };
}

describe("root.canonical.validate (RFC-0159/RFC-0261)", () => {
  it("RC-01/RC-02: fails a redirect-stub root page with no resolvePageRoute call", async () => {
    const { root, context } = await fixtureContext(
      `<meta http-equiv="refresh" content="0; url=/de/" />`,
    );
    const result = await runRootCanonicalValidate(input, context);
    expect(result.exitCode).toBe(1);
    const ruleIds = (result.data as { diagnostics: Array<{ ruleId: string }> }).diagnostics.map(
      (d) => d.ruleId,
    );
    expect(ruleIds).toContain("RC-01");
    expect(ruleIds).toContain("RC-02");
    await rm(root, { recursive: true, force: true });
  });

  it("passes a root page that renders content via resolvePageRoute with no canonicalUrl override", async () => {
    const { root, context } = await fixtureContext(
      `---\nconst page = await resolvePageRoute(Astro, "de");\n---\n<Layout page={page} />`,
    );
    const result = await runRootCanonicalValidate(input, context);
    expect(result.exitCode ?? 0).toBe(0);
    await rm(root, { recursive: true, force: true });
  });

  it("RC-00: fails when index.astro is missing entirely", async () => {
    const { root, context } = await fixtureContext(undefined);
    const result = await runRootCanonicalValidate(input, context);
    expect(result.exitCode).toBe(1);
    const ruleIds = (result.data as { diagnostics: Array<{ ruleId: string }> }).diagnostics.map(
      (d) => d.ruleId,
    );
    expect(ruleIds).toEqual(["RC-00"]);
    await rm(root, { recursive: true, force: true });
  });
});
