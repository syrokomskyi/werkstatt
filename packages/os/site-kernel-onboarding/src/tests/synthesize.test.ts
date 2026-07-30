/*
<MODULE_CONTRACT>
<purpose>Tests for onboarding.synthesize command (RFC-0532).</purpose>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0532 review fix: add tests for onboarding.synthesize — pass, fail (missing brief), noop (no .input/), manifest structure, file classification.</item>
</CHANGE_SUMMARY>
*/

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, mkdir, writeFile, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runOnboardingSynthesize } from "../synthesize.ts";
import type { KernelCommandInput, KernelRuntimeContext } from "@warpgogol/site-kernel";

let workspaceRoot: string;

function makeInput(flags: Record<string, unknown>): KernelCommandInput {
  return {
    flags: flags as Record<string, import("@warpgogol/site-kernel").KernelFlagValue>,
    argv: [],
  };
}

function makeContext(root: string): KernelRuntimeContext {
  return {
    workspaceRoot: root,
    logger: {
      section: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
      success: () => {},
    },
    dryRun: false,
  } as unknown as KernelRuntimeContext;
}

const VALID_BRIEF = `---
client:
  id: test-client
  domain: example.com
i18n:
  default: de
  supported:
    - de
    - en
legalJurisdiction: DE
---

# Test brief
`;

beforeEach(async () => {
  workspaceRoot = await mkdtemp(join(tmpdir(), "synthesize-test-"));
});

afterEach(async () => {
  await rm(workspaceRoot, { recursive: true, force: true });
});

describe("onboarding.synthesize", () => {
  it("returns noop when .input/ directory does not exist", async () => {
    const result = await runOnboardingSynthesize(
      makeInput({ system: "test-client" }),
      makeContext(workspaceRoot),
    );
    expect(result.data!.status).toBe("noop");
    expect(result.exitCode).toBe(0);
  });

  it("returns fail when brief is missing", async () => {
    await mkdir(join(workspaceRoot, "onboarding", "test-client", ".input"), {
      recursive: true,
    });

    const result = await runOnboardingSynthesize(
      makeInput({ system: "test-client" }),
      makeContext(workspaceRoot),
    );
    expect(result.data!.status).toBe("fail");
    expect(result.exitCode).toBe(1);
    expect(result.data!.diagnostics[0]).toContain("00-brief.md is missing");
  });

  it("returns fail when brief has invalid frontmatter", async () => {
    const inputDir = join(workspaceRoot, "onboarding", "test-client", ".input");
    await mkdir(inputDir, { recursive: true });
    await writeFile(
      join(inputDir, "00-brief.md"),
      "---\nclient:\n  id: NOT-KEBAB\n  domain: example.com\ni18n:\n  default: de\n  supported:\n    - de\nlegalJurisdiction: DE\n---\n",
      "utf8",
    );

    const result = await runOnboardingSynthesize(
      makeInput({ system: "test-client" }),
      makeContext(workspaceRoot),
    );
    expect(result.data!.status).toBe("fail");
    expect(result.exitCode).toBe(1);
  });

  it("returns pass and writes manifest for valid input", async () => {
    const inputDir = join(workspaceRoot, "onboarding", "test-client", ".input");
    await mkdir(inputDir, { recursive: true });
    await writeFile(join(inputDir, "00-brief.md"), VALID_BRIEF, "utf8");

    const result = await runOnboardingSynthesize(
      makeInput({ system: "test-client" }),
      makeContext(workspaceRoot),
    );
    expect(result.data!.status).toBe("pass");
    expect(result.exitCode).toBe(0);
    expect(result.data!.fileCount).toBe(1);
    expect(result.data!.inputHash).toMatch(/^sha256:[0-9a-f]{64}$/);

    const manifestPath = join(
      workspaceRoot,
      "onboarding",
      "test-client",
      ".output",
      "input-manifest.json",
    );
    expect(existsSync(manifestPath)).toBe(true);

    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    expect(manifest.version).toBe(1);
    expect(manifest.system).toBe("test-client");
    expect(manifest.files).toHaveLength(1);
    expect(manifest.files[0].kind).toBe("brief");
    expect(manifest.files[0].required).toBe(true);
    expect(manifest.files[0].sha256).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("classifies additional input files correctly", async () => {
    const inputDir = join(workspaceRoot, "onboarding", "test-client", ".input");
    await mkdir(inputDir, { recursive: true });
    await writeFile(join(inputDir, "00-brief.md"), VALID_BRIEF, "utf8");
    await writeFile(join(inputDir, "01-profile.md"), "# Profile", "utf8");
    await writeFile(join(inputDir, "02-research.md"), "# Research", "utf8");
    await writeFile(join(inputDir, "logo.png"), "fake-png", "utf8");

    const result = await runOnboardingSynthesize(
      makeInput({ system: "test-client" }),
      makeContext(workspaceRoot),
    );
    expect(result.data!.status).toBe("pass");
    expect(result.data!.fileCount).toBe(4);

    const manifestPath = join(
      workspaceRoot,
      "onboarding",
      "test-client",
      ".output",
      "input-manifest.json",
    );
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    const kinds = manifest.files.map((f: { kind: string }) => f.kind).sort();
    expect(kinds).toEqual(["brief", "profile", "research", "visual"]);
  });

  it("throws when --system is not provided", async () => {
    await expect(
      runOnboardingSynthesize(makeInput({}), makeContext(workspaceRoot)),
    ).rejects.toThrow(/requires --system/);
  });
});
