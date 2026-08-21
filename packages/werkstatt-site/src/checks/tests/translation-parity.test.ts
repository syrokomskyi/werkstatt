import { describe, expect, it } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDefaultIO } from "@warpgogol/werkstatt/kernel";
import type { KernelCommandInput, KernelRuntimeContext } from "@warpgogol/werkstatt/kernel";
import {
  runTranslationParityValidate,
  runTranslationParityReview,
  runTranslationParitySuppress,
} from "../translation-parity.ts";

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

function makeContext(root: string, app: string): KernelRuntimeContext {
  return {
    workspaceRoot: root,
    site: { name: "fixture-app", directory: app },
    siteExplicit: true,
    logger,
    dryRun: false,
    outputFormat: "json",
    io: createDefaultIO().io,
  } as unknown as KernelRuntimeContext;
}

function makeInput(flags: Record<string, unknown> = {}): KernelCommandInput {
  return { argv: [], flags } as unknown as KernelCommandInput;
}

async function writeSystemMd(contentDir: string, langs: string[]): Promise<void> {
  const supported: Record<string, { name: string; hreflang: string; rtl: boolean }> = {};
  for (const lang of langs) {
    supported[lang] = {
      name: lang.toUpperCase(),
      hreflang: `${lang}-${lang.toUpperCase()}`,
      rtl: false,
    };
  }
  await writeFile(
    join(contentDir, "system.md"),
    `---
app: fixture-app
version: 1.0.0
identity:
  systemStar: Vega
i18n:
  default: ${langs[0]}
  supported:
${langs.map((l) => `    ${l}:\n      name: ${l.toUpperCase()}\n      hreflang: ${l}-${l.toUpperCase()}\n      rtl: false`).join("\n")}
pages:
  - pageId: home
    semanticType: home
    routes:
${langs.map((l) => `      ${l}: ""`).join("\n")}
    cosmicStar: Vega
    planets: []
---
`,
    "utf8",
  );
}

async function writePage(
  contentDir: string,
  lang: string,
  pageId: string,
  blocks: Array<{ id: string; type: string; heading?: string; body?: string }>,
): Promise<void> {
  const blocksYaml = blocks
    .map(
      (b) =>
        `  - id: ${b.id}\n    type: ${b.type}${b.heading ? `\n    props:\n      header:\n        heading: ${b.heading}${b.body ? `\n      body: ${b.body}` : ""}` : b.body ? `\n    props:\n      body: ${b.body}` : ""}`,
    )
    .join("\n");
  await writeFile(
    join(contentDir, "pages", lang, `${pageId}.md`),
    `---
pageId: ${pageId}
title: ${pageId}
blocks:
${blocksYaml}
---
Body
`,
    "utf8",
  );
}

async function writeProse(
  contentDir: string,
  lang: string,
  slug: string,
  body: string,
): Promise<void> {
  await writeFile(join(contentDir, "prose", lang, `${slug}.md`), `---\n---\n${body}`, "utf8");
}

describe("translation.parity.validate", () => {
  it("passes when locales have matching section counts", async () => {
    const root = await mkdtemp(join(tmpdir(), "parity-ok-"));
    const app = join(root, "apps", "fixture-app");
    const content = join(app, "src", "content");
    await mkdir(join(content, "pages", "de"), { recursive: true });
    await mkdir(join(content, "pages", "uk"), { recursive: true });
    await writeSystemMd(content, ["de", "uk"]);
    await writePage(content, "de", "home", [
      { id: "intro", type: "markdown", heading: "Intro", body: "Hallo Welt." },
    ]);
    await writePage(content, "uk", "home", [
      { id: "intro", type: "markdown", heading: "Intro", body: "Привіт світ." },
    ]);
    try {
      const result = await runTranslationParityValidate(makeInput(), makeContext(root, app));
      expect(result.exitCode).toBe(0);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("detects section count mismatch", async () => {
    const root = await mkdtemp(join(tmpdir(), "parity-section-"));
    const app = join(root, "apps", "fixture-app");
    const content = join(app, "src", "content");
    await mkdir(join(content, "pages", "de"), { recursive: true });
    await mkdir(join(content, "pages", "uk"), { recursive: true });
    await writeSystemMd(content, ["de", "uk"]);
    await writePage(content, "de", "home", [
      { id: "intro", type: "markdown", heading: "Intro", body: "Hallo Welt." },
      { id: "details", type: "markdown", heading: "Details", body: "Mehr Details." },
    ]);
    await writePage(content, "uk", "home", [
      { id: "intro", type: "markdown", heading: "Intro", body: "Привіт світ." },
    ]);
    try {
      const result = await runTranslationParityValidate(makeInput(), makeContext(root, app));
      const diags = (result.data as { diagnostics?: Array<{ ruleId: string }> }).diagnostics ?? [];
      expect(diags.some((d) => d.ruleId === "PARITY-SECTION-COUNT")).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("detects paragraph count mismatch in matching sections", async () => {
    const root = await mkdtemp(join(tmpdir(), "parity-para-"));
    const app = join(root, "apps", "fixture-app");
    const content = join(app, "src", "content");
    await mkdir(join(content, "prose", "de"), { recursive: true });
    await mkdir(join(content, "prose", "uk"), { recursive: true });
    await writeSystemMd(content, ["de", "uk"]);
    await writeProse(content, "de", "about", "## Intro\n\nErster Absatz.\n\nZweiter Absatz.");
    await writeProse(content, "uk", "about", "## Intro\n\nПерший абзац.");
    try {
      const result = await runTranslationParityValidate(makeInput(), makeContext(root, app));
      const diags = (result.data as { diagnostics?: Array<{ ruleId: string }> }).diagnostics ?? [];
      expect(diags.some((d) => d.ruleId === "PARITY-PARAGRAPH-COUNT")).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("detects sentence count mismatch in matching paragraphs", async () => {
    const root = await mkdtemp(join(tmpdir(), "parity-sentence-"));
    const app = join(root, "apps", "fixture-app");
    const content = join(app, "src", "content");
    await mkdir(join(content, "prose", "de"), { recursive: true });
    await mkdir(join(content, "prose", "uk"), { recursive: true });
    await writeSystemMd(content, ["de", "uk"]);
    await writeProse(
      content,
      "de",
      "about",
      "## Intro\n\nErster Satz. Zweiter Satz. Dritter Satz.",
    );
    await writeProse(content, "uk", "about", "## Intro\n\nПерше речення. Друге речення.");
    try {
      const result = await runTranslationParityValidate(makeInput(), makeContext(root, app));
      const diags = (result.data as { diagnostics?: Array<{ ruleId: string }> }).diagnostics ?? [];
      expect(diags.some((d) => d.ruleId === "PARITY-SENTENCE-COUNT")).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("produces error severity for legal documents", async () => {
    const root = await mkdtemp(join(tmpdir(), "parity-legal-"));
    const app = join(root, "apps", "fixture-app");
    const content = join(app, "src", "content");
    await mkdir(join(content, "pages", "de"), { recursive: true });
    await mkdir(join(content, "pages", "uk"), { recursive: true });
    await writeSystemMd(content, ["de", "uk"]);
    await writePage(content, "de", "impressum", [
      { id: "legal-info", type: "markdown", heading: "Legal Info", body: "Impressum." },
    ]);
    await writePage(content, "uk", "impressum", [
      { id: "legal-info", type: "markdown", heading: "Legal Info", body: "Impressum." },
      { id: "extra", type: "markdown", heading: "Extra", body: "Extra." },
    ]);
    try {
      const result = await runTranslationParityValidate(makeInput(), makeContext(root, app));
      const diags =
        (result.data as { diagnostics?: Array<{ severity: string; ruleId: string }> })
          .diagnostics ?? [];
      const sectionDiag = diags.find((d) => d.ruleId === "PARITY-SECTION-COUNT");
      expect(sectionDiag).toBeDefined();
      expect(sectionDiag?.severity).toBe("error");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("produces warning severity for non-legal content", async () => {
    const root = await mkdtemp(join(tmpdir(), "parity-nonlegal-"));
    const app = join(root, "apps", "fixture-app");
    const content = join(app, "src", "content");
    await mkdir(join(content, "pages", "de"), { recursive: true });
    await mkdir(join(content, "pages", "uk"), { recursive: true });
    await writeSystemMd(content, ["de", "uk"]);
    await writePage(content, "de", "home", [
      { id: "intro", type: "markdown", heading: "Intro", body: "Hallo." },
    ]);
    await writePage(content, "uk", "home", [
      { id: "intro", type: "markdown", heading: "Intro", body: "Привіт." },
      { id: "extra", type: "markdown", heading: "Extra", body: "Extra." },
    ]);
    try {
      const result = await runTranslationParityValidate(makeInput(), makeContext(root, app));
      const diags =
        (result.data as { diagnostics?: Array<{ severity: string; ruleId: string }> })
          .diagnostics ?? [];
      const sectionDiag = diags.find((d) => d.ruleId === "PARITY-SECTION-COUNT");
      expect(sectionDiag).toBeDefined();
      expect(sectionDiag?.severity).toBe("warning");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("respects locale scoping from system.md pages[].locales", async () => {
    const root = await mkdtemp(join(tmpdir(), "parity-scoping-"));
    const app = join(root, "apps", "fixture-app");
    const content = join(app, "src", "content");
    await mkdir(join(content, "pages", "de"), { recursive: true });
    await mkdir(join(content, "pages", "uk"), { recursive: true });
    // Write system.md with locale scoping — home only in de
    await writeFile(
      join(content, "system.md"),
      `---
app: fixture-app
version: 1.0.0
identity:
  systemStar: Vega
i18n:
  default: de
  supported:
    de:
      name: DE
      hreflang: de-DE
      rtl: false
    uk:
      name: UK
      hreflang: uk-UK
      rtl: false
pages:
  - pageId: de-only-page
    semanticType: home
    routes:
      de: ""
    locales:
      - de
    cosmicStar: Vega
    planets: []
---
`,
      "utf8",
    );
    await writePage(content, "de", "de-only-page", [
      { id: "intro", type: "markdown", heading: "Intro", body: "Nur DE." },
    ]);
    // uk doesn't have the file — but since locales: [de], it should not be flagged
    try {
      const result = await runTranslationParityValidate(makeInput(), makeContext(root, app));
      expect(result.exitCode).toBe(0);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("suppresses findings when suppression file exists", async () => {
    const root = await mkdtemp(join(tmpdir(), "parity-suppressed-"));
    const app = join(root, "apps", "fixture-app");
    const content = join(app, "src", "content");
    await mkdir(join(content, "pages", "de"), { recursive: true });
    await mkdir(join(content, "pages", "uk"), { recursive: true });
    await writeSystemMd(content, ["de", "uk"]);
    await writePage(content, "de", "home", [
      { id: "intro", type: "markdown", heading: "Intro", body: "Hallo." },
      { id: "extra", type: "markdown", heading: "Extra", body: "Extra." },
    ]);
    await writePage(content, "uk", "home", [
      { id: "intro", type: "markdown", heading: "Intro", body: "Привіт." },
    ]);
    // Write suppression file
    await writeFile(
      join(root, "translation-parity.suppressions.yaml"),
      `suppressions:
  - file: pages/home.md
    ruleId: PARITY-SECTION-COUNT
    reason: Intentional difference — UK version is shorter
    approvedAt: 2026-01-01
`,
      "utf8",
    );
    try {
      const result = await runTranslationParityValidate(makeInput(), makeContext(root, app));
      expect(result.exitCode).toBe(0);
      const data = result.data as { suppressed?: unknown[] };
      expect(data.suppressed).toBeDefined();
      expect((data.suppressed ?? []).length).toBeGreaterThan(0);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("detects stale suppressions for non-existent files", async () => {
    const root = await mkdtemp(join(tmpdir(), "parity-stale-"));
    const app = join(root, "apps", "fixture-app");
    const content = join(app, "src", "content");
    await mkdir(join(content, "pages", "de"), { recursive: true });
    await mkdir(join(content, "pages", "uk"), { recursive: true });
    await writeSystemMd(content, ["de", "uk"]);
    await writePage(content, "de", "home", [
      { id: "intro", type: "markdown", heading: "Intro", body: "Hallo." },
    ]);
    await writePage(content, "uk", "home", [
      { id: "intro", type: "markdown", heading: "Intro", body: "Привіт." },
    ]);
    await writeFile(
      join(root, "translation-parity.suppressions.yaml"),
      `suppressions:
  - file: pages/nonexistent.md
    ruleId: PARITY-SECTION-COUNT
    reason: Stale suppression
    approvedAt: 2026-01-01
`,
      "utf8",
    );
    try {
      const result = await runTranslationParityValidate(makeInput(), makeContext(root, app));
      const diags = (result.data as { diagnostics?: Array<{ ruleId: string }> }).diagnostics ?? [];
      expect(diags.some((d) => d.ruleId === "PARITY-SUP-02")).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe("translation.parity.review", () => {
  it("writes review manifest with unsuppressed findings", async () => {
    const root = await mkdtemp(join(tmpdir(), "parity-review-"));
    const app = join(root, "apps", "fixture-app");
    const content = join(app, "src", "content");
    await mkdir(join(content, "pages", "de"), { recursive: true });
    await mkdir(join(content, "pages", "uk"), { recursive: true });
    await writeSystemMd(content, ["de", "uk"]);
    await writePage(content, "de", "home", [
      { id: "intro", type: "markdown", heading: "Intro", body: "Hallo." },
      { id: "extra", type: "markdown", heading: "Extra", body: "Extra." },
    ]);
    await writePage(content, "uk", "home", [
      { id: "intro", type: "markdown", heading: "Intro", body: "Привіт." },
    ]);
    try {
      const result = await runTranslationParityReview(makeInput(), makeContext(root, app));
      expect(result.exitCode).toBe(0);
      const data = result.data as { findings?: unknown[] };
      expect(data.findings).toBeDefined();
      expect((data.findings ?? []).length).toBeGreaterThan(0);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe("translation.parity.suppress", () => {
  it("requires --file flag", async () => {
    const root = await mkdtemp(join(tmpdir(), "parity-sup-nofile-"));
    try {
      const result = await runTranslationParitySuppress(
        makeInput({ ruleId: "PARITY-SECTION-COUNT", reason: "test" }),
        makeContext(root, join(root, "apps", "fixture-app")),
      );
      expect(result.exitCode).toBe(1);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("requires --ruleId flag", async () => {
    const root = await mkdtemp(join(tmpdir(), "parity-sup-norule-"));
    try {
      const result = await runTranslationParitySuppress(
        makeInput({ file: "pages/home.md", reason: "test" }),
        makeContext(root, join(root, "apps", "fixture-app")),
      );
      expect(result.exitCode).toBe(1);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("requires --reason flag", async () => {
    const root = await mkdtemp(join(tmpdir(), "parity-sup-noreason-"));
    try {
      const result = await runTranslationParitySuppress(
        makeInput({ file: "pages/home.md", ruleId: "PARITY-SECTION-COUNT" }),
        makeContext(root, join(root, "apps", "fixture-app")),
      );
      expect(result.exitCode).toBe(1);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects invalid ruleId", async () => {
    const root = await mkdtemp(join(tmpdir(), "parity-sup-badrule-"));
    try {
      const result = await runTranslationParitySuppress(
        makeInput({ file: "pages/home.md", ruleId: "INVALID", reason: "test" }),
        makeContext(root, join(root, "apps", "fixture-app")),
      );
      expect(result.exitCode).toBe(1);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("writes suppression record to file", async () => {
    const root = await mkdtemp(join(tmpdir(), "parity-sup-write-"));
    try {
      const result = await runTranslationParitySuppress(
        makeInput({
          file: "pages/home.md",
          ruleId: "PARITY-SECTION-COUNT",
          reason: "Intentional difference",
        }),
        makeContext(root, join(root, "apps", "fixture-app")),
      );
      expect(result.exitCode).toBe(0);
      // Read the suppression file
      const { readFile } = await import("node:fs/promises");
      const raw = await readFile(join(root, "translation-parity.suppressions.yaml"), "utf-8");
      expect(raw).toContain("pages/home.md");
      expect(raw).toContain("PARITY-SECTION-COUNT");
      expect(raw).toContain("Intentional difference");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects duplicate suppression", async () => {
    const root = await mkdtemp(join(tmpdir(), "parity-sup-dup-"));
    await writeFile(
      join(root, "translation-parity.suppressions.yaml"),
      `suppressions:
  - file: pages/home.md
    ruleId: PARITY-SECTION-COUNT
    reason: Existing
    approvedAt: 2026-01-01
`,
      "utf-8",
    );
    try {
      const result = await runTranslationParitySuppress(
        makeInput({
          file: "pages/home.md",
          ruleId: "PARITY-SECTION-COUNT",
          reason: "Duplicate",
        }),
        makeContext(root, join(root, "apps", "fixture-app")),
      );
      expect(result.exitCode).toBe(1);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
