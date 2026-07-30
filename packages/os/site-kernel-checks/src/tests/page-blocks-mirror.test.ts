import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runPageBlocksMirrorValidate } from "../page-blocks-mirror.ts";
import type { CheckResult, KernelCommandInput } from "@warpgogol/site-kernel";
import { makeTestSiteContext } from "./helpers.ts";

/*
<MODULE_CONTRACT>
  <purpose>
    Fixture-based tests for page.blocks.mirror.validate — compares each
    localized page with its default-language twin block-by-block.
    Catches MIRROR-01 (missing block / type mismatch), MIRROR-02 (missing prop),
    MIRROR-03 (missing labels key).
  </purpose>
</MODULE_CONTRACT>
*/

function diagnosticsOf(result: { data?: unknown }) {
  return (result.data as CheckResult).diagnostics;
}

const SYSTEM_MD = `---
title: Test
i18n:
  default: de
  supported:
    de: true
    en: true
---
# Test
`;

function pageFrontmatter(
  blocks: Array<{ id?: string; type: string; props?: Record<string, unknown> }>,
): string {
  const lines: string[] = ["---", "title: Test", "blocks:"];
  for (const b of blocks) {
    lines.push(`  - type: ${b.type}`);
    if (b.id) lines.push(`    id: ${b.id}`);
    if (b.props) {
      lines.push("    props:");
      for (const [k, v] of Object.entries(b.props)) {
        if (typeof v === "object" && v !== null) {
          lines.push(`      ${k}:`);
          for (const [subK, subV] of Object.entries(v as Record<string, unknown>)) {
            lines.push(`        ${subK}: ${subV}`);
          }
        } else {
          lines.push(`      ${k}: ${v}`);
        }
      }
    }
  }
  lines.push("---", "# Test", "");
  return lines.join("\n");
}

describe("page.blocks.mirror.validate", () => {
  let workspaceRoot: string;
  let appDir: string;
  let pagesDir: string;
  let contentDir: string;

  beforeEach(async () => {
    workspaceRoot = await mkdtemp(join(tmpdir(), "blocks-mirror-"));
    appDir = join(workspaceRoot, "apps", "test-app");
    contentDir = join(appDir, "src", "content");
    pagesDir = join(contentDir, "pages");
    await mkdir(join(pagesDir, "de"), { recursive: true });
    await mkdir(join(pagesDir, "en"), { recursive: true });
    await writeFile(join(contentDir, "system.md"), SYSTEM_MD);
  });

  afterEach(async () => {
    await rm(workspaceRoot, { recursive: true, force: true });
  });

  it("passes when localized twin has all blocks and props", async () => {
    await writeFile(
      join(pagesDir, "de", "home.md"),
      pageFrontmatter([{ type: "hero", props: { title: "Willkommen" } }]),
    );
    await writeFile(
      join(pagesDir, "en", "home.md"),
      pageFrontmatter([{ type: "hero", props: { title: "Welcome" } }]),
    );

    const input: KernelCommandInput = { flags: {}, argv: [],  };
    const result = await runPageBlocksMirrorValidate(
      input,
      makeTestSiteContext(workspaceRoot, appDir),
    );

    expect(result.exitCode).toBe(0);
    expect(diagnosticsOf(result)).toEqual([]);
  });

  it("fails with MIRROR-01 when localized is missing a block", async () => {
    await writeFile(
      join(pagesDir, "de", "home.md"),
      pageFrontmatter([
        { type: "hero", props: { title: "DE" } },
        { type: "cta", props: { label: "Kontaktieren" } },
      ]),
    );
    await writeFile(
      join(pagesDir, "en", "home.md"),
      pageFrontmatter([{ type: "hero", props: { title: "EN" } }]),
    );

    const input: KernelCommandInput = { flags: {}, argv: [],  };
    const result = await runPageBlocksMirrorValidate(
      input,
      makeTestSiteContext(workspaceRoot, appDir),
    );

    expect(result.exitCode).toBe(1);
    expect(diagnosticsOf(result).some((d) => d.ruleId === "MIRROR-01")).toBe(true);
  });

  it("fails with MIRROR-01 when block types mismatch", async () => {
    await writeFile(
      join(pagesDir, "de", "home.md"),
      pageFrontmatter([{ type: "hero", props: { title: "DE" } }]),
    );
    await writeFile(
      join(pagesDir, "en", "home.md"),
      pageFrontmatter([{ type: "cta", props: { title: "EN" } }]),
    );

    const input: KernelCommandInput = { flags: {}, argv: [],  };
    const result = await runPageBlocksMirrorValidate(
      input,
      makeTestSiteContext(workspaceRoot, appDir),
    );

    expect(result.exitCode).toBe(1);
    expect(diagnosticsOf(result).some((d) => d.ruleId === "MIRROR-01")).toBe(true);
  });

  it("fails with MIRROR-02 when localized is missing a prop", async () => {
    await writeFile(
      join(pagesDir, "de", "home.md"),
      pageFrontmatter([{ type: "hero", props: { title: "DE", subtitle: "Unter" } }]),
    );
    await writeFile(
      join(pagesDir, "en", "home.md"),
      pageFrontmatter([{ type: "hero", props: { title: "EN" } }]),
    );

    const input: KernelCommandInput = { flags: {}, argv: [],  };
    const result = await runPageBlocksMirrorValidate(
      input,
      makeTestSiteContext(workspaceRoot, appDir),
    );

    expect(result.exitCode).toBe(1);
    expect(
      diagnosticsOf(result).some(
        (d) =>
          d.ruleId === "MIRROR-02" &&
          (d as unknown as Record<string, unknown>).missingProp === "subtitle",
      ),
    ).toBe(true);
  });

  it("fails with MIRROR-03 when labels key is missing", async () => {
    await writeFile(
      join(pagesDir, "de", "home.md"),
      pageFrontmatter([{ type: "hero", props: { labels: { ok: "OK", cancel: "Abbrechen" } } }]),
    );
    await writeFile(
      join(pagesDir, "en", "home.md"),
      pageFrontmatter([{ type: "hero", props: { labels: { ok: "OK" } } }]),
    );

    const input: KernelCommandInput = { flags: {}, argv: [],  };
    const result = await runPageBlocksMirrorValidate(
      input,
      makeTestSiteContext(workspaceRoot, appDir),
    );

    expect(result.exitCode).toBe(1);
    expect(
      diagnosticsOf(result).some(
        (d) =>
          d.ruleId === "MIRROR-03" &&
          (d as unknown as Record<string, unknown>).missingLabelKey === "cancel",
      ),
    ).toBe(true);
  });

  it("passes when no localized pages exist", async () => {
    await writeFile(
      join(pagesDir, "de", "home.md"),
      pageFrontmatter([{ type: "hero", props: { title: "DE" } }]),
    );

    const input: KernelCommandInput = { flags: {}, argv: [],  };
    const result = await runPageBlocksMirrorValidate(
      input,
      makeTestSiteContext(workspaceRoot, appDir),
    );

    expect(result.exitCode).toBe(0);
    expect(diagnosticsOf(result)).toEqual([]);
  });
});
