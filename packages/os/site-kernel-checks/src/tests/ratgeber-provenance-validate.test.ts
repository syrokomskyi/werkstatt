/*
<MODULE_CONTRACT>
<purpose>
RFC-0502: tests for ratgeber-provenance-validate — tests RG-PROV-01..05 rules
with in-memory filesystem fixtures.
</purpose>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0502: initial provenance validator tests.</item>
</CHANGE_SUMMARY>
*/

import { test, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { runRatgeberProvenanceValidate } from "../ratgeber-provenance-validate.ts";
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
    commandName: "ratgeber.provenance.validate",
    args: {},
    flags: {},
  } as unknown as KernelRuntimeContext;
}

const EMPTY_INPUT: KernelCommandInput = { args: {}, flags: {} } as unknown as KernelCommandInput;

let tmpDir: string;
let appDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "rg-prov-test-"));
  appDir = path.join(tmpDir, "test-site");
  await fs.mkdir(appDir, { recursive: true });
  // Minimal system.md required by loadSystemManifest
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

test("RG-PROV-01: published article with unresolvable authorId → error", async () => {
  await writeFile(
    appDir,
    "src/content/surface/articles/de/test-article.md",
    `---
slug: test-article
title: "Test Article"
status: published
articleType: entscheidungshilfe
authorId: unknown-author
categoryId: kosten
sources:
  - sourceId: src-001
    claimIds: []
---
`,
  );
  await writeFile(
    appDir,
    "src/content/surface/authors/de/andrii-syrokomskyi.md",
    `---
id: andrii-syrokomskyi
name: "Andrii Syrokomskyi"
role: "Redakteur"
bio: "Test bio"
---
`,
  );
  await writeFile(
    tmpDir,
    "integrations/truth-sources/src-001.yaml",
    `id: src-001
title: "Test Source"
kind: manual
expectedType: string
checkEvery: P3M
`,
  );

  const result = await runRatgeberProvenanceValidate(EMPTY_INPUT, makeContext(tmpDir, appDir));
  const diags = result.data?.diagnostics ?? [];
  const prov01 = diags.filter((d) => d.ruleId === "RG-PROV-01");
  expect(prov01.length).toBe(1);
  expect(prov01[0]!.severity).toBe("error");
  expect(prov01[0]!.message).toContain("unknown-author");
});

test("RG-PROV-02: sourceId that doesn't resolve → error", async () => {
  await writeFile(
    appDir,
    "src/content/surface/articles/de/test-article.md",
    `---
slug: test-article
title: "Test Article"
status: published
articleType: entscheidungshilfe
authorId: andrii-syrokomskyi
categoryId: kosten
sources:
  - sourceId: missing-source
    claimIds: []
---
`,
  );
  await writeFile(
    appDir,
    "src/content/surface/authors/de/andrii-syrokomskyi.md",
    `---
id: andrii-syrokomskyi
name: "Andrii Syrokomskyi"
role: "Redakteur"
bio: "Test bio"
---
`,
  );

  const result = await runRatgeberProvenanceValidate(EMPTY_INPUT, makeContext(tmpDir, appDir));
  const diags = result.data?.diagnostics ?? [];
  const prov02 = diags.filter((d) => d.ruleId === "RG-PROV-02");
  expect(prov02.length).toBe(1);
  expect(prov02[0]!.severity).toBe("error");
  expect(prov02[0]!.message).toContain("missing-source");
});

test("RG-PROV-03: claimId not in claim records → error", async () => {
  await writeFile(
    appDir,
    "src/content/surface/articles/de/test-article.md",
    `---
slug: test-article
title: "Test Article"
status: published
articleType: entscheidungshilfe
authorId: andrii-syrokomskyi
categoryId: kosten
sources:
  - sourceId: src-001
    claimIds:
      - missing-claim
---
`,
  );
  await writeFile(
    appDir,
    "src/content/surface/authors/de/andrii-syrokomskyi.md",
    `---
id: andrii-syrokomskyi
name: "Andrii Syrokomskyi"
role: "Redakteur"
bio: "Test bio"
---
`,
  );
  await writeFile(
    tmpDir,
    "integrations/truth-sources/src-001.yaml",
    `id: src-001
title: "Test Source"
kind: manual
expectedType: string
checkEvery: P3M
`,
  );
  // Create a claim record for a different claimId (not "missing-claim")
  await writeFile(
    appDir,
    "src/content/surface/claims/de/existing-claim.md",
    `---
claimId: existing-claim
articleId: test-article
claimText: "Existing claim"
claimType: factual
sourceRefs:
  - sourceId: src-001
    url: "https://example.com"
    title: "Test"
    retrievedAt: "2026-07-23"
verifiedAt: "2026-07-23"
reviewStatus: verified
---
`,
  );

  const result = await runRatgeberProvenanceValidate(EMPTY_INPUT, makeContext(tmpDir, appDir));
  const diags = result.data?.diagnostics ?? [];
  const prov03 = diags.filter((d) => d.ruleId === "RG-PROV-03");
  expect(prov03.length).toBe(1);
  expect(prov03[0]!.severity).toBe("error");
  expect(prov03[0]!.message).toContain("missing-claim");
});

test("RG-PROV-04: sourceId missing from Quellen section → error", async () => {
  await writeFile(
    appDir,
    "src/content/surface/articles/de/test-article.md",
    `---
slug: test-article
title: "Test Article"
status: published
articleType: entscheidungshilfe
authorId: andrii-syrokomskyi
categoryId: kosten
sources:
  - sourceId: src-001
    claimIds: []
---
`,
  );
  await writeFile(
    appDir,
    "src/content/surface/authors/de/andrii-syrokomskyi.md",
    `---
id: andrii-syrokomskyi
name: "Andrii Syrokomskyi"
role: "Redakteur"
bio: "Test bio"
---
`,
  );
  await writeFile(
    tmpDir,
    "integrations/truth-sources/src-001.yaml",
    `id: src-001
title: "Test Source"
kind: manual
expectedType: string
checkEvery: P3M
`,
  );
  await writeFile(
    appDir,
    "src/content/prose/de/ratgeber-test-article.md",
    `## Einleitung

Some content here.

## Quellen

No source IDs listed here.
`,
  );

  const result = await runRatgeberProvenanceValidate(EMPTY_INPUT, makeContext(tmpDir, appDir));
  const diags = result.data?.diagnostics ?? [];
  const prov04 = diags.filter((d) => d.ruleId === "RG-PROV-04");
  expect(prov04.length).toBe(1);
  expect(prov04[0]!.severity).toBe("error");
  expect(prov04[0]!.message).toContain("src-001");
});

test("RG-PROV-05: non-exempt article with no sources → warning", async () => {
  await writeFile(
    appDir,
    "src/content/surface/articles/de/test-article.md",
    `---
slug: test-article
title: "Test Article"
status: published
articleType: entscheidungshilfe
authorId: andrii-syrokomskyi
categoryId: kosten
---
`,
  );
  await writeFile(
    appDir,
    "src/content/surface/authors/de/andrii-syrokomskyi.md",
    `---
id: andrii-syrokomskyi
name: "Andrii Syrokomskyi"
role: "Redakteur"
bio: "Test bio"
---
`,
  );

  const result = await runRatgeberProvenanceValidate(EMPTY_INPUT, makeContext(tmpDir, appDir));
  const diags = result.data?.diagnostics ?? [];
  const prov05 = diags.filter((d) => d.ruleId === "RG-PROV-05");
  expect(prov05.length).toBe(1);
  expect(prov05[0]!.severity).toBe("warning");
});

test("RG-PROV-05: exempt type (grundlagenartikel) with no sources → no warning", async () => {
  await writeFile(
    appDir,
    "src/content/surface/articles/de/test-article.md",
    `---
slug: test-article
title: "Test Article"
status: published
articleType: grundlagenartikel
authorId: andrii-syrokomskyi
categoryId: kosten
---
`,
  );
  await writeFile(
    appDir,
    "src/content/surface/authors/de/andrii-syrokomskyi.md",
    `---
id: andrii-syrokomskyi
name: "Andrii Syrokomskyi"
role: "Redakteur"
bio: "Test bio"
---
`,
  );

  const result = await runRatgeberProvenanceValidate(EMPTY_INPUT, makeContext(tmpDir, appDir));
  const diags = result.data?.diagnostics ?? [];
  const prov05 = diags.filter((d) => d.ruleId === "RG-PROV-05");
  expect(prov05.length).toBe(0);
});

test("clean article with all provenance → pass", async () => {
  await writeFile(
    appDir,
    "src/content/surface/articles/de/test-article.md",
    `---
slug: test-article
title: "Test Article"
status: published
articleType: entscheidungshilfe
authorId: andrii-syrokomskyi
categoryId: kosten
sources:
  - sourceId: src-001
    claimIds:
      - claim-001
---
`,
  );
  await writeFile(
    appDir,
    "src/content/surface/authors/de/andrii-syrokomskyi.md",
    `---
id: andrii-syrokomskyi
name: "Andrii Syrokomskyi"
role: "Redakteur"
bio: "Test bio"
---
`,
  );
  await writeFile(
    tmpDir,
    "integrations/truth-sources/src-001.yaml",
    `id: src-001
title: "Test Source"
kind: manual
expectedType: string
checkEvery: P3M
`,
  );
  await writeFile(
    appDir,
    "src/content/surface/claims/de/claim-001.md",
    `---
claimId: claim-001
articleId: test-article
claimText: "Test claim"
claimType: factual
sourceRefs:
  - sourceId: src-001
    url: "https://example.com"
    title: "Test Source"
    retrievedAt: "2026-07-23"
verifiedAt: "2026-07-23"
reviewStatus: verified
---
`,
  );
  await writeFile(
    appDir,
    "src/content/prose/de/ratgeber-test-article.md",
    `## Einleitung

Some content here.

## Quellen

- src-001 — Test Source
`,
  );

  const result = await runRatgeberProvenanceValidate(EMPTY_INPUT, makeContext(tmpDir, appDir));
  const diags = result.data?.diagnostics ?? [];
  const errors = diags.filter((d) => d.severity === "error");
  expect(errors.map((e) => e.ruleId + ": " + e.message)).toEqual([]);
});
