/*
<MODULE_CONTRACT>
<purpose>
RFC-0505: tests for ratgeber-claim-validate — tests RG-CLAIM-01..09 rules
with in-memory filesystem fixtures.
</purpose>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0505: initial claim validator tests.</item>
</CHANGE_SUMMARY>
*/

import { test, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { runRatgeberClaimValidate } from "../ratgeber-claim-validate.ts";
import type { KernelCommandInput, KernelRuntimeContext } from "@gogol/site-kernel";

async function writeFile(dir: string, rel: string, content: string): Promise<void> {
  const full = path.join(dir, rel);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, content, "utf-8");
}

function makeContext(workspaceRoot: string, appDir: string): KernelRuntimeContext {
  return {
    workspaceRoot,
    site: { name: "test-site", directory: appDir },
    commandName: "ratgeber.claim.validate",
    args: {},
    flags: {},
  } as unknown as KernelRuntimeContext;
}

const EMPTY_INPUT: KernelCommandInput = { args: {}, flags: {} } as unknown as KernelCommandInput;

let tmpDir: string;
let appDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "rg-claim-test-"));
  appDir = path.join(tmpDir, "test-site");
  await fs.mkdir(appDir, { recursive: true });
  await writeFile(
    appDir,
    "src/content/system.md",
    `---
cosmicStar: Vega
i18n:
  default: de
  languages:
    - de
    - uk
---
`,
  );
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

const validClaimRecord = (overrides: Record<string, unknown> = {}): string => {
  const defaults: Record<string, unknown> = {
    claimId: "test-article-test-claim",
    articleId: "test-article",
    claimText: "This is a test claim.",
    claimType: "factual",
    sourceRefs: [
      {
        sourceId: "src-001",
        url: "https://example.com/source",
        title: "Test Source",
        retrievedAt: "2026-07-23",
      },
    ],
    calculationInputs: [],
    limitations: [],
    verifiedAt: "2026-07-23",
    reviewStatus: "verified",
  };
  const merged = { ...defaults, ...overrides };
  const frontmatter = Object.entries(merged)
    .map(([key, value]) => {
      if (Array.isArray(value)) {
        if (value.length === 0) return `${key}: []`;
        return `${key}:\n${value
          .map((v) =>
            typeof v === "object" && v !== null
              ? `  - ${Object.entries(v)
                  .map(([k, val]) => `${k}: ${JSON.stringify(val)}`)
                  .join("\n    ")}`
              : `  - ${JSON.stringify(v)}`,
          )
          .join("\n")}`;
      }
      if (typeof value === "string") return `${key}: ${JSON.stringify(value)}`;
      return `${key}: ${value}`;
    })
    .join("\n");
  return `---\n${frontmatter}\n---\n`;
};

test("no claim records → pass", async () => {
  const result = await runRatgeberClaimValidate(EMPTY_INPUT, makeContext(tmpDir, appDir));
  expect(result.data?.status).toBe("pass");
});

test("RG-CLAIM-02: duplicate claimId → error", async () => {
  await writeFile(appDir, "src/content/surface/articles/de/test-article.md", `---\nslug: test-article\n---\n`);
  await writeFile(appDir, "src/content/surface/claims/de/claim-a.md", validClaimRecord());
  await writeFile(appDir, "src/content/surface/claims/de/claim-b.md", validClaimRecord());

  const result = await runRatgeberClaimValidate(EMPTY_INPUT, makeContext(tmpDir, appDir));
  const diags = result.data?.diagnostics ?? [];
  const dup = diags.filter((d) => d.ruleId === "RG-CLAIM-02");
  expect(dup.length).toBe(1);
  expect(dup[0]!.severity).toBe("error");
});

test("RG-CLAIM-03: articleId not found → error", async () => {
  await writeFile(
    appDir,
    "src/content/surface/claims/de/test-claim.md",
    validClaimRecord({ articleId: "nonexistent-article" }),
  );

  const result = await runRatgeberClaimValidate(EMPTY_INPUT, makeContext(tmpDir, appDir));
  const diags = result.data?.diagnostics ?? [];
  const r3 = diags.filter((d) => d.ruleId === "RG-CLAIM-03");
  expect(r3.length).toBe(1);
  expect(r3[0]!.severity).toBe("error");
  expect(r3[0]!.message).toContain("nonexistent-article");
});

test("RG-CLAIM-04: factual claim with no sourceRefs → error", async () => {
  await writeFile(appDir, "src/content/surface/articles/de/test-article.md", `---\nslug: test-article\n---\n`);
  await writeFile(
    appDir,
    "src/content/surface/claims/de/test-claim.md",
    validClaimRecord({ sourceRefs: [] }),
  );

  const result = await runRatgeberClaimValidate(EMPTY_INPUT, makeContext(tmpDir, appDir));
  const diags = result.data?.diagnostics ?? [];
  const r4 = diags.filter((d) => d.ruleId === "RG-CLAIM-04");
  expect(r4.length).toBe(1);
  expect(r4[0]!.severity).toBe("error");
});

test("RG-CLAIM-05: calculation claim with no calculationInputs → error", async () => {
  await writeFile(appDir, "src/content/surface/articles/de/test-article.md", `---\nslug: test-article\n---\n`);
  await writeFile(
    appDir,
    "src/content/surface/claims/de/test-claim.md",
    validClaimRecord({
      claimType: "calculation",
      sourceRefs: [],
      calculationInputs: [],
    }),
  );

  const result = await runRatgeberClaimValidate(EMPTY_INPUT, makeContext(tmpDir, appDir));
  const diags = result.data?.diagnostics ?? [];
  const r5 = diags.filter((d) => d.ruleId === "RG-CLAIM-05");
  expect(r5.length).toBe(1);
  expect(r5[0]!.severity).toBe("error");
});

test("RG-CLAIM-07: expired claim → warning", async () => {
  await writeFile(appDir, "src/content/surface/articles/de/test-article.md", `---\nslug: test-article\n---\n`);
  await writeFile(
    appDir,
    "src/content/surface/claims/de/test-claim.md",
    validClaimRecord({ expiresAt: "2020-01-01" }),
  );

  const result = await runRatgeberClaimValidate(EMPTY_INPUT, makeContext(tmpDir, appDir));
  const diags = result.data?.diagnostics ?? [];
  const r7 = diags.filter((d) => d.ruleId === "RG-CLAIM-07");
  expect(r7.length).toBe(1);
  expect(r7[0]!.severity).toBe("warning");
});

test("RG-CLAIM-08: disputed claim → warning", async () => {
  await writeFile(appDir, "src/content/surface/articles/de/test-article.md", `---\nslug: test-article\n---\n`);
  await writeFile(
    appDir,
    "src/content/surface/claims/de/test-claim.md",
    validClaimRecord({ reviewStatus: "disputed" }),
  );

  const result = await runRatgeberClaimValidate(EMPTY_INPUT, makeContext(tmpDir, appDir));
  const diags = result.data?.diagnostics ?? [];
  const r8 = diags.filter((d) => d.ruleId === "RG-CLAIM-08");
  expect(r8.length).toBe(1);
  expect(r8[0]!.severity).toBe("warning");
});

test("valid claim record → pass", async () => {
  await writeFile(appDir, "src/content/surface/articles/de/test-article.md", `---\nslug: test-article\n---\n`);
  await writeFile(appDir, "src/content/surface/claims/de/test-claim.md", validClaimRecord());

  const result = await runRatgeberClaimValidate(EMPTY_INPUT, makeContext(tmpDir, appDir));
  expect(result.data?.status).toBe("pass");
});
