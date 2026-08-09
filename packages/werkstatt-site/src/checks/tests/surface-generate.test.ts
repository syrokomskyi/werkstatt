import { describe, it, expect, vi } from "vitest";
import { mkdtemp, mkdir, writeFile, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runSurfaceGenerate } from "../surface/generate.ts";
import type { KernelCommandInput, KernelRuntimeContext } from "@warpgogol/werkstatt/kernel";

/*
<MODULE_CONTRACT>
  <purpose>RFC-0582 regression coverage: depth-0 hub generation without collection directory
  and SURFACE-GEN-01 post-generation consistency check.</purpose>
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
  return { argv: [], flags } as unknown as KernelCommandInput;
}

const MINIMAL_BLUEPRINT = `id: test-hub
entitlement: pseo
dataset:
  collection: articles
  status: active
axes:
  - id: article
    universe: { collection: articles, field: slug }
    match: { recordField: slug }
levels:
  - depth: 0
    slug: { de: ratgeber }
    constellation: ratgeber-hub
    geo: twin-only
    titleTemplate: { de: Ratgeber }
    intro:
      de: "Test intro"
    semanticType: collection
    hub:
      cardFields:
        - title
      reservedSlugs:
        - redaktion
  - depth: 1
    slug: { de: "ratgeber/{article}" }
    constellation: ratgeber-article
    geo: full
    titleTemplate: { de: "{article.title}" }
    semanticType: article
policy:
  minRecordsPerDepth: { 0: 0, 1: 1 }
  noindexBelowPerDepth: { 1: 1 }
  redirectPolicy: nearest-ancestor
  trailingSlash: true
  maxStubDepth: 1
  substanceMin: 20
  maxThinShare: 0.5
  bake: lazy
  statusGate:
    allowedStatuses:
      - published
    excludedStatuses:
      - draft
      - review-required
linking:
  children: { limit: 12 }
  siblings: { limit: 8 }
`;

async function fixtureContext(blueprintYaml: string = MINIMAL_BLUEPRINT): Promise<{
  root: string;
  appDir: string;
  context: KernelRuntimeContext;
}> {
  const root = await mkdtemp(join(tmpdir(), "surface-generate-"));
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
surface:
  blueprints:
    - test-hub
  modules:
    pseo:
      entitlement: pseo
      blueprints:
        - test-hub
      masterLocale: de
      publishedLocales:
        - de
      context:
        audience: Handwerk
      generation:
        normalBuildCallsLlm: false
---
`,
    "utf8",
  );

  await mkdir(join(root, "packages", "werkstatt-site", "src", "domain", "ontology", "blueprints"), { recursive: true });
  await writeFile(
    join(root, "packages", "werkstatt-site", "src", "domain", "ontology", "blueprints", "test-hub.yaml"),
    blueprintYaml,
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

describe("surface.generate — RFC-0582", () => {
  it("generates depth-0 hub entries without collection directory", async () => {
    const { root, appDir, context } = await fixtureContext();

    const result = await runSurfaceGenerate(input(), context);
    expect(result.exitCode ?? 0).toBe(0);

    const artifactRaw = await readFile(join(appDir, "src", "surface.generated.yaml"), "utf8");
    expect(artifactRaw).toContain("test-hub");

    await rm(root, { recursive: true, force: true });
  });

  it("emits SURFACE-GEN-01 when a blueprint produces zero entries", async () => {
    const { root, context } = await fixtureContext();

    const surfaceExpand = await import("../surface-expand.ts");
    vi.spyOn(surfaceExpand, "expandBlueprint").mockResolvedValue([]);

    const result = await runSurfaceGenerate(input(), context);
    expect(result.exitCode).toBe(1);

    const diagnostics = (result.data as { diagnostics: Array<{ ruleId: string }> }).diagnostics;
    expect(diagnostics.some((d) => d.ruleId === "SURFACE-GEN-01")).toBe(true);

    vi.restoreAllMocks();
    await rm(root, { recursive: true, force: true });
  });
});
