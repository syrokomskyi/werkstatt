import { describe, it, expect } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runSurfaceContextValidate } from "../pseo/pseo-module-context.ts";
import type { KernelCommandInput, KernelRuntimeContext } from "@warpgogol/site-kernel";

/*
<MODULE_CONTRACT>
  <purpose>RFC-0261 red/green fixture coverage for surface.context.validate (RFC-0271).</purpose>
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

const input = { argv: [], args: [], flags: {} } as unknown as KernelCommandInput;

function system(frontmatter: string): string {
  return `---\napp: demo\nversion: 1.0.0\ni18n:\n  default: de\n  supported:\n    de: {}\n    uk: {}\n${frontmatter}\n---\n`;
}

async function fixtureContext(
  systemMd: string,
): Promise<{ root: string; context: KernelRuntimeContext }> {
  const root = await mkdtemp(join(tmpdir(), "surface-context-"));
  const appDir = join(root, "apps", "demo");
  const contentDir = join(appDir, "src", "content");
  await mkdir(contentDir, { recursive: true });
  await writeFile(join(contentDir, "system.md"), systemMd, "utf8");
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

describe("surface.context.validate (RFC-0271/RFC-0261)", () => {
  it("PSEO-CTX-04: fails when a module locale is unsupported", async () => {
    const { root, context } = await fixtureContext(
      system(`surface:
  blueprints:
    - website-local
  modules:
    pseo:
      entitlement: pseo
      blueprints:
        - website-local
      masterLocale: fr
      publishedLocales:
        - de
      generation:
        normalBuildCallsLlm: false
      localization:
        glossaryRefs:
          de: pseo/de
        translatorNoteRefs:
          de: pseo/de
`),
    );
    const result = await runSurfaceContextValidate(input, context);
    expect(result.exitCode).toBe(1);
    const ruleIds = (result.data as { diagnostics: Array<{ ruleId: string }> }).diagnostics.map(
      (d) => d.ruleId,
    );
    expect(ruleIds).toContain("PSEO-CTX-04");
    await rm(root, { recursive: true, force: true });
  });

  it("passes a deterministic module context with glossary and translator note refs", async () => {
    const { root, context } = await fixtureContext(
      system(`surface:
  blueprints:
    - website-local
  modules:
    pseo:
      entitlement: pseo
      blueprints:
        - website-local
      masterLocale: uk
      publishedLocales:
        - de
      stage: internalCapability
      urlPolicy: nonDestruction
      generation:
        normalBuildCallsLlm: false
      localization:
        glossaryRefs:
          de: pseo/de
        translatorNoteRefs:
          de: pseo/de
`),
    );
    const result = await runSurfaceContextValidate(input, context);
    expect(result.exitCode ?? 0).toBe(0);
    await rm(root, { recursive: true, force: true });
  });
});
