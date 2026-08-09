/*
<MODULE_CONTRACT>
<purpose>
RFC-0503: tests for ratgeber-policy-validate — tests RG-POL-01..05 rules
with in-memory filesystem fixtures.
</purpose>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0503: initial policy validator tests.</item>
</CHANGE_SUMMARY>
*/

import { test, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { runRatgeberPolicyValidate } from "../ratgeber-policy-validate.ts";
import type { KernelCommandInput, KernelRuntimeContext } from "@warpgogol/site-kernel";

async function writeFile(dir: string, rel: string, content: string): Promise<void> {
  const full = path.join(dir, rel);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, content, "utf-8");
}

function makeContext(workspaceRoot: string, appDir: string): KernelRuntimeContext {
  return {
    workspaceRoot,
    site: { name: "test-site", directory: appDir },
    commandName: "ratgeber.policy.validate",
    flags: {},
  } as unknown as KernelRuntimeContext;
}

const EMPTY_INPUT: KernelCommandInput = { flags: {} } as unknown as KernelCommandInput;

const SYSTEM_MD = `---
cosmicStar: Vega
i18n:
  default: de
  supported:
    de:
      name: Deutsch
      hreflang: de-DE
    uk:
      name: Ukraїnska
      hreflang: uk-UA
---
`;

const POLICY_PROSE_DE = `## Redaktionsstandards

Wir prüfen jeden Artikel.

## Prüfrhythmus

Alle 3 Monate.

## Autoren

Unsere Autoren.

## Quellenpolitik

Wir prüfen Quellen.

## Kontakt

Kontakt hier.
`;

const POLICY_PROSE_UK = `## Редакційні стандарти

Ми перевіряємо.

## Ритм перевірки

Кожні 3 місяці.

## Автори

Наші автори.

## Політика джерел

Ми перевіряємо джерела.

## Контакти

Контакт тут.
`;

let tmpDir: string;
let appDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "rg-pol-test-"));
  appDir = path.join(tmpDir, "test-site");
  await fs.mkdir(appDir, { recursive: true });
  await writeFile(appDir, "src/content/system.md", SYSTEM_MD);
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

test("RG-POL-01: editorial policy page missing for de → error", async () => {
  const result = await runRatgeberPolicyValidate(EMPTY_INPUT, makeContext(tmpDir, appDir));
  const diags = result.data?.diagnostics ?? [];
  const pol01 = diags.filter((d) => d.ruleId === "RG-POL-01");
  expect(pol01.length).toBeGreaterThanOrEqual(1);
  expect(pol01[0]!.severity).toBe("error");
  expect(pol01[0]!.message).toContain("does not exist");
});

test("RG-POL-02: policy page missing required section → error", async () => {
  await writeFile(
    appDir,
    "src/content/prose/de/ratgeber-redaktion.md",
    `## Redaktionsstandards

Content.

## Prüfrhythmus

Content.

## Autoren

Content.

## Quellenpolitik

Content.

Kontakt is missing.
`,
  );
  await writeFile(appDir, "src/content/prose/uk/ratgeber-redaktion.md", POLICY_PROSE_UK);

  const result = await runRatgeberPolicyValidate(EMPTY_INPUT, makeContext(tmpDir, appDir));
  const diags = result.data?.diagnostics ?? [];
  const pol02 = diags.filter((d) => d.ruleId === "RG-POL-02");
  expect(pol02.length).toBeGreaterThanOrEqual(1);
  expect(pol02[0]!.severity).toBe("error");
  expect(pol02.some((d) => d.message.includes("Kontakt"))).toBe(true);
});

test("RG-POL-03: published article with stale reviewedAt → warning", async () => {
  await writeFile(appDir, "src/content/prose/de/ratgeber-redaktion.md", POLICY_PROSE_DE);
  await writeFile(appDir, "src/content/prose/uk/ratgeber-redaktion.md", POLICY_PROSE_UK);
  await writeFile(
    appDir,
    "src/content/surface/articles/de/test.md",
    `---
slug: test
title: "Test"
status: published
articleType: grundlagenartikel
question: "Test question?"
summary: "Test summary"
readTime: "5 min"
reviewedAt: "2024-01-01"
authorId: test-author
---
`,
  );

  const result = await runRatgeberPolicyValidate(EMPTY_INPUT, makeContext(tmpDir, appDir));
  const diags = result.data?.diagnostics ?? [];
  const pol03 = diags.filter((d) => d.ruleId === "RG-POL-03");
  expect(pol03.length).toBe(1);
  expect(pol03[0]!.severity).toBe("warning");
  expect(pol03[0]!.message).toContain("older than");
});

test("RG-POL-04: published article missing required field → error", async () => {
  await writeFile(appDir, "src/content/prose/de/ratgeber-redaktion.md", POLICY_PROSE_DE);
  await writeFile(appDir, "src/content/prose/uk/ratgeber-redaktion.md", POLICY_PROSE_UK);
  await writeFile(
    appDir,
    "src/content/surface/articles/de/test.md",
    `---
slug: test
title: "Test"
status: published
articleType: grundlagenartikel
question: "Test question?"
summary: "Test summary"
readTime: "5 min"
reviewedAt: "2026-07-01"
authorId: test-author
---
`,
  );
  await writeFile(
    appDir,
    "src/content/surface/articles/de/missing-fields.md",
    `---
slug: missing-fields
title: "Missing Fields"
status: published
articleType: grundlagenartikel
reviewedAt: "2026-07-01"
---
`,
  );

  const result = await runRatgeberPolicyValidate(EMPTY_INPUT, makeContext(tmpDir, appDir));
  const diags = result.data?.diagnostics ?? [];
  const pol04 = diags.filter((d) => d.ruleId === "RG-POL-04");
  expect(pol04.length).toBeGreaterThanOrEqual(1);
  expect(pol04[0]!.severity).toBe("error");
  expect(pol04.some((d) => d.message.includes("question"))).toBe(true);
});

test("RG-POL-05: review-required article in surface artifact → error", async () => {
  await writeFile(appDir, "src/content/prose/de/ratgeber-redaktion.md", POLICY_PROSE_DE);
  await writeFile(appDir, "src/content/prose/uk/ratgeber-redaktion.md", POLICY_PROSE_UK);
  await writeFile(
    appDir,
    "src/content/surface/articles/de/review-article.md",
    `---
slug: review-article
title: "Review Article"
status: review-required
articleType: grundlagenartikel
---
`,
  );
  await writeFile(
    appDir,
    "src/surface.generated.yaml",
    `generatedAt: "2026-07-23T00:00:00Z"
entries:
  - surfaceId: ratgeber
    pageId: "ratgeber:review-article"
    depth: 1
    indexable: true
    noindex: false
    semanticType: article
    axes:
      article: review-article
    routes:
      de: ratgeber/review-article
    recordCount: 1
`,
  );

  const result = await runRatgeberPolicyValidate(EMPTY_INPUT, makeContext(tmpDir, appDir));
  const diags = result.data?.diagnostics ?? [];
  const pol05 = diags.filter((d) => d.ruleId === "RG-POL-05");
  expect(pol05.length).toBe(1);
  expect(pol05[0]!.severity).toBe("error");
  expect(pol05[0]!.message).toContain("review-required");
});

test("clean policy with all sections and valid articles → pass", async () => {
  await writeFile(appDir, "src/content/prose/de/ratgeber-redaktion.md", POLICY_PROSE_DE);
  await writeFile(appDir, "src/content/prose/uk/ratgeber-redaktion.md", POLICY_PROSE_UK);
  await writeFile(
    appDir,
    "src/content/surface/articles/de/test.md",
    `---
slug: test
title: "Test"
status: published
articleType: grundlagenartikel
question: "Test question?"
summary: "Test summary"
readTime: "5 min"
reviewedAt: "2026-07-01"
authorId: test-author
---
`,
  );

  const result = await runRatgeberPolicyValidate(EMPTY_INPUT, makeContext(tmpDir, appDir));
  const diags = result.data?.diagnostics ?? [];
  const errors = diags.filter((d) => d.severity === "error");
  expect(errors.map((e) => e.ruleId + ": " + e.message)).toEqual([]);
});
