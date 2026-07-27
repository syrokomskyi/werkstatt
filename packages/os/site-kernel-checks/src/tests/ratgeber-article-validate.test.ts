/*
<MODULE_CONTRACT>
<purpose>
RFC-0501: tests for ratgeber-article-validate — tests RG-ART-01..06 rules
with in-memory filesystem fixtures.
</purpose>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0501: initial article validator tests.</item>
</CHANGE_SUMMARY>
*/

import { test, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { runRatgeberArticleValidate } from "../ratgeber-article-validate.ts";
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
    commandName: "ratgeber.article.validate",
    args: {},
    flags: {},
  } as unknown as KernelRuntimeContext;
}

const EMPTY_INPUT: KernelCommandInput = { args: {}, flags: {} } as unknown as KernelCommandInput;

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

const VALID_SECTIONS_DE = `## Einleitung

Intro text here with enough words to pass the word count floor when combined with the rest of the sections. This is a test article that needs to have at least five hundred words total across all sections so the word count check passes successfully without any issues whatsoever. We are writing more content here to ensure the total word count is well above the five hundred word floor. This introduction section provides context for the reader and sets expectations for what they will learn in this article. It should be clear and concise while still contributing enough words to the overall count. Let us add a few more sentences to make sure we have sufficient content here in this introduction section. This should be enough for now.

## Kernfrage

Kernfrage content here. More content to increase the word count. We need to make sure this article has enough words to pass the five hundred word floor. Let us add more text here to ensure we have sufficient content for the word count check to pass. This is important because the validator checks the total word count of the prose body. The Kernfrage section presents the central question that this article addresses. It should be a clear and focused question that the reader can relate to. We add more text here to ensure the total word count meets the threshold requirement of five hundred words minimum across all sections of the prose body. This should be sufficient content for this section.

## Wissensbasis

Wissensbasis content here. This section needs at least two hundred words for the grundlagenartikel type. We are adding more content to ensure we meet that threshold. Let us continue adding more text here to make sure we have enough words in this section. We need at least two hundred words here so let us keep writing more content. This should be enough words to pass the two hundred word threshold for the Wissensbasis section in the grundlagenartikel type. Let us add a few more words just to be safe and ensure we are well above the threshold. We should be good now with enough words in this section to pass the type-specific requirement check for grundlagenartikel articles. The Wissensbasis section provides the foundational knowledge that the reader needs to understand the topic. It should explain key concepts and terms in a way that is accessible to a non-expert audience. We continue adding more text here to ensure we have well over two hundred words in this section. This is important because the type-specific requirement check for grundlagenartikel articles requires at least two hundred words in the Wissensbasis section. We are now well above that threshold with this additional content. Let us add a few more sentences to be absolutely certain we pass this check. The foundational knowledge presented here builds the basis for the practical sections that follow. Readers should be able to understand the core concepts after reading this section. We are confident that this section now contains more than two hundred words and will pass the type-specific requirement check for the grundlagenartikel article type without any issues.

## Praxisbezug

Praxisbezug content here. More content to increase the total word count. We need to keep adding words to reach the five hundred word floor. Let us add more text here to ensure we have enough content. This is important for the word count check. The Praxisbezug section connects the theoretical knowledge to practical applications. It should show how the concepts from the Wissensbasis section apply in real-world scenarios. This helps the reader understand the relevance of the information. We add more text here to contribute to the overall word count.

## Häufige Missverständnisse

Missverständnisse content here. More content for word count. We are still adding words to reach the required threshold. Let us continue adding more text here. This section addresses common misconceptions about the topic. By clarifying these misunderstandings we help the reader avoid typical pitfalls and errors. This contributes to the overall word count as well.

## Kosten und Trade-offs

Kosten content here. More content for word count purposes. We need to ensure the total word count is at least five hundred words. Let us add more text. This section discusses the costs and trade-offs associated with the topic. It should provide a balanced view of the advantages and disadvantages. We add more content here to ensure the total word count is sufficient.

## Checkliste

- [ ] First item
- [ ] Second item
- [ ] Third item
- [ ] Fourth item
- [ ] Fifth item

## FAQ

FAQ content here. More text for word count. We are still adding words to reach the threshold. Let us add more text here to ensure we have enough content for the word count check to pass successfully. This section answers frequently asked questions about the topic. It should address the most common questions that readers have. We add more text here to contribute to the overall word count.

## Zusammenfassung

Zusammenfassung content here. More text for word count. We are still adding words to reach the five hundred word floor. Let us add more text here to ensure we have enough content for the word count check to pass successfully without any issues. This section summarizes the key points from the article. It should provide a concise recap of the main takeaways. We add more content here to ensure the total word count is well above the five hundred word floor.

## Quellen

- src-001 — Test Source
`;

let tmpDir: string;
let appDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "rg-art-test-"));
  appDir = path.join(tmpDir, "test-site");
  await fs.mkdir(appDir, { recursive: true });
  await writeFile(appDir, "src/content/system.md", SYSTEM_MD);
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

test("no articles → pass", async () => {
  const result = await runRatgeberArticleValidate(EMPTY_INPUT, makeContext(tmpDir, appDir));
  expect(result.exitCode).toBe(0);
  expect(result.summary).toContain("no ratgeber articles");
});

test("RG-ART-01: missing articleType → error", async () => {
  await writeFile(
    appDir,
    "src/content/surface/articles/de/test.md",
    `---
slug: test
title: "Test"
status: published
---
`,
  );
  await writeFile(appDir, "src/content/prose/de/ratgeber-test.md", VALID_SECTIONS_DE);

  const result = await runRatgeberArticleValidate(EMPTY_INPUT, makeContext(tmpDir, appDir));
  const diags = result.data?.diagnostics ?? [];
  const art01 = diags.filter((d) => d.ruleId === "RG-ART-01");
  expect(art01.length).toBe(1);
  expect(art01[0]!.severity).toBe("error");
  expect(art01[0]!.message).toContain("no articleType");
});

test("RG-ART-01: invalid articleType → error", async () => {
  await writeFile(
    appDir,
    "src/content/surface/articles/de/test.md",
    `---
slug: test
title: "Test"
status: published
articleType: invalid-type
---
`,
  );
  await writeFile(appDir, "src/content/prose/de/ratgeber-test.md", VALID_SECTIONS_DE);

  const result = await runRatgeberArticleValidate(EMPTY_INPUT, makeContext(tmpDir, appDir));
  const diags = result.data?.diagnostics ?? [];
  const art01 = diags.filter((d) => d.ruleId === "RG-ART-01");
  expect(art01.length).toBe(1);
  expect(art01[0]!.severity).toBe("error");
  expect(art01[0]!.message).toContain("invalid-type");
});

test("RG-ART-03: missing prose file → error", async () => {
  await writeFile(
    appDir,
    "src/content/surface/articles/de/test.md",
    `---
slug: test
title: "Test"
status: published
articleType: grundlagenartikel
---
`,
  );

  const result = await runRatgeberArticleValidate(EMPTY_INPUT, makeContext(tmpDir, appDir));
  const diags = result.data?.diagnostics ?? [];
  const art03 = diags.filter((d) => d.ruleId === "RG-ART-03");
  expect(art03.length).toBe(1);
  expect(art03[0]!.severity).toBe("error");
  expect(art03[0]!.message).toContain("no prose body");
});

test("RG-ART-03: published article missing mandatory sections → error", async () => {
  await writeFile(
    appDir,
    "src/content/surface/articles/de/test.md",
    `---
slug: test
title: "Test"
status: published
articleType: grundlagenartikel
---
`,
  );
  await writeFile(
    appDir,
    "src/content/prose/de/ratgeber-test.md",
    `## Einleitung

Only one section. Not enough sections to pass the mandatory section check. We need all ten sections present in the prose body for the validator to pass this check. This article is missing most of the required sections so it should fail with RG-ART-03.

## Quellen

- src-001
`,
  );

  const result = await runRatgeberArticleValidate(EMPTY_INPUT, makeContext(tmpDir, appDir));
  const diags = result.data?.diagnostics ?? [];
  const art03 = diags.filter((d) => d.ruleId === "RG-ART-03");
  expect(art03.length).toBe(1);
  expect(art03[0]!.severity).toBe("error");
  expect(art03[0]!.message).toContain("missing mandatory section");
});

test("RG-ART-05: entscheidungshilfe missing decision table → error", async () => {
  await writeFile(
    appDir,
    "src/content/surface/articles/de/test.md",
    `---
slug: test
title: "Test"
status: published
articleType: entscheidungshilfe
---
`,
  );
  await writeFile(
    appDir,
    "src/content/prose/de/ratgeber-test.md",
    `## Einleitung

Intro text here with enough words to pass the word count floor when combined with the rest of the sections. This is a test article that needs to have at least five hundred words total across all sections so the word count check passes successfully without any issues whatsoever.

## Kernfrage

No table here, just text. This section should contain a decision table with at least three data rows but it does not have any table at all. The validator should flag this as a type-specific requirement violation for the entscheidungshilfe article type. We need more words here to reach the five hundred word floor. Let us add more text to ensure we have enough content for the word count check to pass. This is important because the validator checks the total word count of the prose body and we need at least five hundred words.

## Wissensbasis

Wissensbasis content here. More content to increase the word count. We need to keep adding words to reach the five hundred word floor. Let us add more text here to ensure we have enough content. This is important for the word count check. We are still adding words to reach the required threshold. Let us continue adding more text here. More content for word count purposes.

## Praxisbezug

Praxisbezug content here. More content for word count. We are still adding words to reach the threshold. Let us add more text here to ensure we have enough content for the word count check to pass successfully without any issues. We need to keep adding words.

## Häufige Missverständnisse

Missverständnisse content here. More content for word count. We are still adding words to reach the threshold. Let us continue adding more text here. More content for word count purposes. We need to ensure the total word count is at least five hundred words.

## Kosten und Trade-offs

Kosten content here. More content for word count purposes. We need to ensure the total word count is at least five hundred words. Let us add more text. We are still adding words to reach the required threshold. Let us continue adding more text here.

## Checkliste

- [ ] First item
- [ ] Second item
- [ ] Third item
- [ ] Fourth item
- [ ] Fifth item

## FAQ

FAQ content here. More text for word count. We are still adding words to reach the threshold. Let us add more text here to ensure we have enough content for the word count check to pass successfully without any issues.

## Zusammenfassung

Zusammenfassung content here. More text for word count. We are still adding words to reach the five hundred word floor. Let us add more text here to ensure we have enough content for the word count check to pass successfully without any issues.

## Quellen

- src-001 — Test Source
`,
  );

  const result = await runRatgeberArticleValidate(EMPTY_INPUT, makeContext(tmpDir, appDir));
  const diags = result.data?.diagnostics ?? [];
  const art05 = diags.filter((d) => d.ruleId === "RG-ART-05");
  expect(art05.length).toBe(1);
  expect(art05[0]!.severity).toBe("error");
  expect(art05[0]!.message).toContain("decision table");
});

test("RG-ART-06: draft article missing sections → warning (non-blocking)", async () => {
  await writeFile(
    appDir,
    "src/content/surface/articles/de/test.md",
    `---
slug: test
title: "Test"
status: draft
articleType: grundlagenartikel
---
`,
  );
  await writeFile(
    appDir,
    "src/content/prose/de/ratgeber-test.md",
    `## Einleitung

Only one section. This is a draft article so missing sections should be a warning, not an error.

## Quellen

- src-001
`,
  );

  const result = await runRatgeberArticleValidate(EMPTY_INPUT, makeContext(tmpDir, appDir));
  const diags = result.data?.diagnostics ?? [];
  const art06 = diags.filter((d) => d.ruleId === "RG-ART-06");
  expect(art06.length).toBeGreaterThanOrEqual(1);
  expect(art06.every((d) => d.severity === "warning")).toBe(true);
});

test("clean published grundlagenartikel with all sections → pass", async () => {
  await writeFile(
    appDir,
    "src/content/surface/articles/de/test.md",
    `---
slug: test
title: "Test"
status: published
articleType: grundlagenartikel
---
`,
  );
  await writeFile(appDir, "src/content/prose/de/ratgeber-test.md", VALID_SECTIONS_DE);

  const result = await runRatgeberArticleValidate(EMPTY_INPUT, makeContext(tmpDir, appDir));
  const diags = result.data?.diagnostics ?? [];
  const errors = diags.filter((d) => d.severity === "error");
  expect(errors.map((e) => e.ruleId + ": " + e.message)).toEqual([]);
});
