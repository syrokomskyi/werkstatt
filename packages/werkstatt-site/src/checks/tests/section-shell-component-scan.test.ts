import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runSectionShellContractValidate } from "../section-framework/shell.ts";
import { walkSectionLevelComponents, UTILITY_COMPONENT_SLUGS } from "../section-framework/shared.ts";
import { makeTestContext, testInput, unwrapData } from "./helpers.ts";

/*
<MODULE_CONTRACT>
  <purpose>
    Fixture-based tests for RFC-0879: section.shell.contract.validate extended
    to scan section-level components (layer: component in archetype registry).
    Verifies that components with and without SectionShell are correctly
    flagged, and that pure sub-components and utility components are excluded.
  </purpose>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial creation: 4 tests covering component scanning (RFC-0879).</item>
</CHANGE_SUMMARY>
*/

describe("RFC-0879: section.shell.contract.validate — component scanning", () => {
  let workspaceRoot: string;
  let componentsRoot: string;
  let archetypeIndexDir: string;

  beforeEach(async () => {
    workspaceRoot = await mkdtemp(join(tmpdir(), "rfc0879-"));
    componentsRoot = join(
      workspaceRoot,
      "packages",
      "werkstatt-site",
      "src",
      "domain",
      "ui",
      "components",
    );
    archetypeIndexDir = join(
      workspaceRoot,
      "packages",
      "werkstatt-site",
      "src",
      "domain",
      "ontology",
      "archetypes",
    );

    // Minimal archetype index with a few component entries.
    const archetypeIndex = `
entries:
  - id: nachweis-list
    displayName: Nachweis List
    sourceFile: packages/werkstatt-site/src/domain/ontology/archetypes/components/nachweis-list.yaml
    layer: component
  - id: responsive-image
    displayName: Responsive image
    sourceFile: packages/werkstatt-site/src/domain/ontology/archetypes/components/responsive-image.yaml
    layer: component
  - id: layout
    displayName: Layout
    sourceFile: packages/werkstatt-site/src/domain/ontology/archetypes/components/layout.yaml
    layer: component
`;
    await mkdir(archetypeIndexDir, { recursive: true });
    await writeFile(join(archetypeIndexDir, "index.yaml"), archetypeIndex);
  });

  afterEach(async () => {
    await rm(workspaceRoot, { recursive: true, force: true });
  });

  it("component with SectionShell passes (no SHELL-01 violation)", async () => {
    const compDir = join(componentsRoot, "nachweis-list");
    await mkdir(compDir, { recursive: true });
    await writeFile(
      join(compDir, "nachweis-list-component.astro"),
      `---
import SectionShell from "@warpgogol/werkstatt-site/ui/components/section-shell.astro";
---
<SectionShell slug="nachweis-list">
  <div>Content</div>
</SectionShell>
`,
    );

    const result = await runSectionShellContractValidate(
      testInput(),
      makeTestContext(workspaceRoot),
    );

    const data = unwrapData(result);
    const shell01 = data.violations.filter((v) => v.rule === "SHELL-01");
    expect(shell01).toHaveLength(0);
  });

  it("component without SectionShell fails with SHELL-01", async () => {
    const compDir = join(componentsRoot, "nachweis-list");
    await mkdir(compDir, { recursive: true });
    await writeFile(
      join(compDir, "nachweis-list-component.astro"),
      `---
---
<section>
  <div>Content</div>
</section>
`,
    );

    const result = await runSectionShellContractValidate(
      testInput(),
      makeTestContext(workspaceRoot),
    );

    const data = unwrapData(result);
    const shell01 = data.violations.filter((v) => v.rule === "SHELL-01");
    expect(shell01.length).toBeGreaterThan(0);
    expect(shell01.some((v) => v.file.includes("nachweis-list"))).toBe(true);
  });

  it("pure sub-component not in archetype registry is not scanned", async () => {
    // Create an unregistered component directory (not in archetype index)
    const compDir = join(componentsRoot, "effect-host");
    await mkdir(compDir, { recursive: true });
    await writeFile(
      join(compDir, "effect-host.astro"),
      `---
---
<section>No shell here</section>
`,
    );

    const files = await walkSectionLevelComponents(workspaceRoot);
    expect(files.every((f) => !f.includes("effect-host"))).toBe(true);

    const result = await runSectionShellContractValidate(
      testInput(),
      makeTestContext(workspaceRoot),
    );

    const data = unwrapData(result);
    expect(data.violations.every((v) => !v.file.includes("effect-host"))).toBe(true);
  });

  it("registered sub-component in UTILITY_COMPONENT_SLUGS is not scanned", async () => {
    // responsive-image is registered with layer: component but is in UTILITY_COMPONENT_SLUGS
    expect(UTILITY_COMPONENT_SLUGS.has("responsive-image")).toBe(true);

    const compDir = join(componentsRoot, "responsive-image");
    await mkdir(compDir, { recursive: true });
    await writeFile(
      join(compDir, "responsive-image.astro"),
      `---
---
<section>No shell here</section>
`,
    );

    const files = await walkSectionLevelComponents(workspaceRoot);
    expect(files.every((f) => !f.includes("responsive-image"))).toBe(true);

    const result = await runSectionShellContractValidate(
      testInput(),
      makeTestContext(workspaceRoot),
    );

    const data = unwrapData(result);
    expect(data.violations.every((v) => !v.file.includes("responsive-image"))).toBe(true);
  });
});
