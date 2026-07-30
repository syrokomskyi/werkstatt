import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runMirroringValidation } from "../checks/mirroring.ts";
import type { CheckResult, KernelCommandInput } from "@warpgogol/site-kernel";
import { makeTestSiteContext } from "./helpers.ts";

/*
<MODULE_CONTRACT>
  <purpose>
    Fixture-based tests for mirroring.validate — verifies canonical Diagnostic
    output with MIRROR-MISSING ruleId, error/warning severity distinction, and
    fixHint presence (RFC-0576).
  </purpose>
</MODULE_CONTRACT>
*/

const SYSTEM_MD = `---
title: Test
i18n:
  default: de
  supported:
    de: true
    en: true
    uk: true
---
# Test
`;

function diagnosticsOf(result: { data?: unknown }) {
  return (result.data as CheckResult).diagnostics;
}

describe("mirroring.validate (RFC-0576)", () => {
  let workspaceRoot: string;
  let appDir: string;
  let pagesDir: string;
  let contentDir: string;

  beforeEach(async () => {
    workspaceRoot = await mkdtemp(join(tmpdir(), "mirroring-"));
    appDir = join(workspaceRoot, "apps", "test-app");
    contentDir = join(appDir, "src", "content");
    pagesDir = join(contentDir, "pages");
    await mkdir(join(pagesDir, "de"), { recursive: true });
    await mkdir(join(pagesDir, "en"), { recursive: true });
    await mkdir(join(pagesDir, "uk"), { recursive: true });
    await writeFile(join(contentDir, "system.md"), SYSTEM_MD);
  });

  afterEach(async () => {
    await rm(workspaceRoot, { recursive: true, force: true });
  });

  it("passes when all pages exist in all languages", async () => {
    await writeFile(join(pagesDir, "de", "home.md"), "---\ntitle: Home\n---\n# Home\n");
    await writeFile(join(pagesDir, "en", "home.md"), "---\ntitle: Home\n---\n# Home\n");
    await writeFile(join(pagesDir, "uk", "home.md"), "---\ntitle: Home\n---\n# Home\n");

    const input: KernelCommandInput = { flags: {}, argv: [],  };
    const result = await runMirroringValidation(
      input,
      makeTestSiteContext(workspaceRoot, appDir),
      "de",
    );

    expect(result.exitCode).toBe(0);
    expect(diagnosticsOf(result)).toEqual([]);
  });

  it("emits MIRROR-MISSING with warning severity for missing non-default-language page", async () => {
    await writeFile(join(pagesDir, "de", "home.md"), "---\ntitle: Home\n---\n# Home\n");
    await writeFile(join(pagesDir, "en", "home.md"), "---\ntitle: Home\n---\n# Home\n");
    // uk missing — non-default language → warning

    const input: KernelCommandInput = { flags: {}, argv: [],  };
    const result = await runMirroringValidation(
      input,
      makeTestSiteContext(workspaceRoot, appDir),
      "de",
    );

    // Only warnings (non-default missing) → exitCode 0
    expect(result.exitCode).toBe(0);
    const diags = diagnosticsOf(result);
    const missingUk = diags.filter((d) => (d.file ?? "").includes("/uk/"));
    expect(missingUk.length).toBeGreaterThan(0);
    // Non-default language missing → warning
    expect(missingUk.every((d) => d.severity === "warning")).toBe(true);
    // All diagnostics should have fixHint
    expect(diags.every((d) => d.fixHint !== undefined && d.fixHint.length > 0)).toBe(true);
  });

  it("emits MIRROR-MISSING with error severity when default language is missing", async () => {
    // Create page only in en and uk, not in de (default)
    await writeFile(join(pagesDir, "en", "about.md"), "---\ntitle: About\n---\n# About\n");
    await writeFile(join(pagesDir, "uk", "about.md"), "---\ntitle: About\n---\n# About\n");

    const input: KernelCommandInput = { flags: {}, argv: [],  };
    const result = await runMirroringValidation(
      input,
      makeTestSiteContext(workspaceRoot, appDir),
      "de",
    );

    expect(result.exitCode).toBe(1);
    const diags = diagnosticsOf(result);
    const missingDe = diags.filter((d) => (d.file ?? "").includes("/de/"));
    expect(missingDe.length).toBeGreaterThan(0);
    // Default language missing → error
    expect(missingDe.every((d) => d.severity === "error")).toBe(true);
    // All diagnostics should have ruleId MIRROR-MISSING
    expect(diags.every((d) => d.ruleId === "MIRROR-MISSING")).toBe(true);
  });

  it("emits fixHint on all MIRROR-MISSING diagnostics", async () => {
    await writeFile(join(pagesDir, "de", "home.md"), "---\ntitle: Home\n---\n# Home\n");
    // en and uk missing (non-default) → warnings, exitCode 0

    const input: KernelCommandInput = { flags: {}, argv: [],  };
    const result = await runMirroringValidation(
      input,
      makeTestSiteContext(workspaceRoot, appDir),
      "de",
    );

    // Only warnings → exitCode 0
    expect(result.exitCode).toBe(0);
    const diags = diagnosticsOf(result);
    expect(diags.length).toBeGreaterThan(0);
    expect(diags.every((d) => d.fixHint !== undefined && d.fixHint.length > 0)).toBe(true);
  });

  it("warnings-only result has exitCode 0", async () => {
    // Page exists in de (default) and en, missing only in uk (non-default)
    await writeFile(join(pagesDir, "de", "contact.md"), "---\ntitle: Contact\n---\n# Contact\n");
    await writeFile(join(pagesDir, "en", "contact.md"), "---\ntitle: Contact\n---\n# Contact\n");

    const input: KernelCommandInput = { flags: {}, argv: [],  };
    const result = await runMirroringValidation(
      input,
      makeTestSiteContext(workspaceRoot, appDir),
      "de",
    );

    // Only warnings (uk missing, non-default) → exitCode 0
    expect(result.exitCode).toBe(0);
    const diags = diagnosticsOf(result);
    expect(diags.length).toBeGreaterThan(0);
    expect(diags.every((d) => d.severity === "warning")).toBe(true);
  });
});
