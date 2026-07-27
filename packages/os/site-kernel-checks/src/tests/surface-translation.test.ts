import { describe, it, expect } from "vitest";
import { mkdtemp, mkdir, writeFile, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  runSurfaceArtifactReady,
  runSurfaceTranslationGenerate,
  runSurfaceTranslationNotesGenerate,
  runSurfaceTranslationNotesReview,
  runSurfaceTranslationValidate,
  writeApprovedGlossary,
} from "../surface-translation.ts";
import { loadSurfaceModuleContexts } from "../pseo/pseo-module-context.ts";
import type { KernelCommandInput, KernelRuntimeContext } from "@warpgogol/site-kernel";

/*
<MODULE_CONTRACT>
  <purpose>RFC-0272/RFC-0273 regression coverage for ready sourceHash and derived translation staleness.</purpose>
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

function input(flags: Record<string, unknown> = {}): KernelCommandInput {
  return { argv: [], args: [], flags } as unknown as KernelCommandInput;
}

async function fixtureContext(): Promise<{
  root: string;
  appDir: string;
  context: KernelRuntimeContext;
}> {
  const root = await mkdtemp(join(tmpdir(), "surface-translation-"));
  const appDir = join(root, "apps", "demo");
  await mkdir(join(appDir, "src", "content"), { recursive: true });
  await writeFile(
    join(appDir, "src", "content", "system.md"),
    `---
app: demo
version: 1.0.0
i18n:
  default: de
  supported:
    de: {}
    uk: {}
surface:
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
      context:
        audience: Handwerk
      generation:
        normalBuildCallsLlm: false
      localization:
        glossaryRefs:
          de: pseo/de
        translatorNoteRefs:
          de: pseo/de
---
`,
    "utf8",
  );
  return {
    root,
    appDir,
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

async function writeSourceArtifact(appDir: string): Promise<string> {
  const path = join(
    appDir,
    "src",
    "content",
    "enriched",
    "website-local",
    "uk",
    "website-local-elektriker-deu-bw-karlsruhe-solaranlage-narrative.md",
  );
  await mkdir(dirname(path), { recursive: true });
  await writeFile(
    path,
    `---
pageId: website-local:elektriker:deu:bw:karlsruhe:solaranlage
field: narrative
lang: uk
approved: true
h1: "Сонячна установка для електрика в Карлсруе"
lead: "Зрозуміла сторінка з локальним доказом і датою 2026."
---
`,
    "utf8",
  );
  return path;
}

describe("surface translation lifecycle (RFC-0272/RFC-0273)", () => {
  it("stamps ready sourceHash, writes derived draft, and detects outdated translations", async () => {
    const { root, appDir, context } = await fixtureContext();
    const modules = (await loadSurfaceModuleContexts(appDir)).modules;
    await writeApprovedGlossary(appDir, modules.pseo!, "de");
    await runSurfaceTranslationNotesGenerate(input({ module: "pseo", target: "de" }), context);
    await runSurfaceTranslationNotesReview(
      input({ module: "pseo", target: "de", approve: true }),
      context,
    );
    const sourcePath = await writeSourceArtifact(appDir);

    const ready = await runSurfaceArtifactReady(
      input({
        module: "pseo",
        "page-id": "website-local:elektriker:deu:bw:karlsruhe:solaranlage",
        field: "narrative",
      }),
      context,
    );
    expect(ready.exitCode ?? 0).toBe(0);

    const generated = await runSurfaceTranslationGenerate(input({ module: "pseo" }), context);
    expect(generated.exitCode ?? 0).toBe(0);

    const current = await runSurfaceTranslationValidate(input({ module: "pseo" }), context);
    expect(current.exitCode ?? 0).toBe(0);

    const edited = (await readFile(sourcePath, "utf8")).replace("датою 2026", "датою 2027");
    await writeFile(sourcePath, edited, "utf8");
    const stale = await runSurfaceTranslationValidate(input({ module: "pseo" }), context);
    expect(stale.exitCode ?? 0).toBe(0);
    const ruleIds = (stale.data as { diagnostics: Array<{ ruleId: string }> }).diagnostics.map(
      (d) => d.ruleId,
    );
    expect(ruleIds).toContain("PSEO-ART-03");

    await rm(root, { recursive: true, force: true });
  });
});
