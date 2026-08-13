import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { test, expect } from "vitest";
import { buildGeneratedHeader } from "../generated-marker.ts";

/*
<MODULE_CONTRACT>
<purpose>
  ADR-0039: Integration test for the middleware chain codegen templates.
  Generates all related middleware files into a temp directory and runs
  tsc --noEmit to verify they compile and typecheck together, catching
  import/export mismatches at test time rather than deploy time.
</purpose>
<responsibilities>
  <item>Generate middleware.ts, language-redirect.ts, retired-tombstones.ts, and markdown-negotiation.ts from templates into a temp directory.</item>
  <item>Provide ambient module stubs for external dependencies (astro:middleware, @warpgogol/werkstatt-site/*, node builtins).</item>
  <item>Run the TypeScript compiler in noEmit mode and assert zero diagnostics.</item>
</responsibilities>
<non-goals>
  <item>Do not test template content correctness — covered by unit tests.</item>
  <item>Do not run astro check — tsc --noEmit is sufficient for import/export mismatch detection (ADR-0039 justification).</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>ADR-0039: initial integration test for middleware chain templates.</item>
</CHANGE_SUMMARY>
*/

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_BOILERPLATE_TEMPLATES = path.join(__dirname, "..", "templates", "app-boilerplate");
const SERVICE_TEMPLATES = path.join(__dirname, "..", "templates", "service");

function readTemplate(base: string, relPath: string): string {
  return readFileSync(path.join(base, relPath), "utf8");
}

function applyTokens(template: string, tokens: Record<string, string>): string {
  return template.replace(/{{\s*(\w+)\s*}}/g, (_match, key) => tokens[key] ?? "");
}

const STUBS_DTS = `
declare module "astro:middleware" {
  export const defineMiddleware: (handler: (context: any, next: () => Promise<any>) => any) => any;
  export function sequence(...handlers: any[]): any;
}

declare module "astro" {
  export type MiddlewareHandler = (context: any, next: () => Promise<any>) => any;
}

declare module "@warpgogol/werkstatt-site/share/semantic" {
  export function markdownTwinUrlPath(pathname: string, opts: { supportedLangs: string[] }): string;
}

declare module "@warpgogol/werkstatt-site/share/middleware" {
  export function createLanguageRedirectMiddleware(opts: { supportedLangs: string[]; defaultLang: string }): any;
}

declare module "@warpgogol/werkstatt-site/share/text-normalize" {
  export function createDevNormalizeMiddleware(config: any): any;
  export function resolveNormalizeConfig(manifest: any): any;
}

declare module "@warpgogol/werkstatt-site/content" {
  export function loadSystemManifestSync(dir: string): { manifest: any };
}

declare module "node:path" {
  export function dirname(p: string): string;
  export function resolve(...paths: string[]): string;
}

declare module "node:url" {
  export function fileURLToPath(url: string | URL): string;
}

interface ImportMetaEnv {
  DEV?: boolean;
}

interface ImportMeta {
  readonly url: string;
  readonly env: ImportMetaEnv;
}
`;

function typecheck(rootDir: string): readonly ts.Diagnostic[] {
  const configPath = path.join(rootDir, "tsconfig.json");
  const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
  if (configFile.error) {
    throw new Error(
      `Failed to read tsconfig: ${ts.flattenDiagnosticMessageText(configFile.error.messageText, "\n")}`,
    );
  }
  const parsedConfig = ts.parseJsonConfigFileContent(configFile.config, ts.sys, rootDir);
  const program = ts.createProgram({
    rootNames: parsedConfig.fileNames,
    options: parsedConfig.options,
  });
  return ts.getPreEmitDiagnostics(program);
}

function formatDiagnostics(diagnostics: readonly ts.Diagnostic[]): string {
  return diagnostics
    .map((d) => {
      const msg = ts.flattenDiagnosticMessageText(d.messageText, "\n");
      if (d.file && d.start) {
        const { line, character } = d.file.getLineAndCharacterOfPosition(d.start);
        return `${d.file.fileName}:${line + 1}:${character + 1}: ${msg}`;
      }
      return msg;
    })
    .join("\n");
}

function generateMiddlewareChain(tmpDir: string): void {
  const srcDir = path.join(tmpDir, "src");
  const middlewareDir = path.join(srcDir, "middleware");
  fs.mkdirSync(middlewareDir, { recursive: true });

  const header = buildGeneratedHeader({
    ownerCommand: "test",
    filePath: "test.ts",
  }).trimEnd();
  const baseTokens = { GENERATED_HEADER: header };

  const middlewareContent = applyTokens(
    readTemplate(APP_BOILERPLATE_TEMPLATES, "src/middleware.template.ts"),
    baseTokens,
  );
  fs.writeFileSync(path.join(srcDir, "middleware.ts"), middlewareContent);

  const langRedirectContent = applyTokens(
    readTemplate(SERVICE_TEMPLATES, "src/middleware/language-redirect.ts.template"),
    { ...baseTokens, SUPPORTED_LANGS: '["de", "uk"]', DEFAULT_LANG: '"de"' },
  );
  fs.writeFileSync(path.join(middlewareDir, "language-redirect.ts"), langRedirectContent);

  const tombstonesContent = applyTokens(
    readTemplate(APP_BOILERPLATE_TEMPLATES, "src/middleware/retired-tombstones.ts.template"),
    { ...baseTokens, TOMBSTONE_PREFIXES: '["old-page"]' },
  );
  fs.writeFileSync(path.join(middlewareDir, "retired-tombstones.ts"), tombstonesContent);

  const mdNegotiationContent = applyTokens(
    readTemplate(SERVICE_TEMPLATES, "src/middleware/markdown-negotiation.ts.template"),
    { ...baseTokens, SUPPORTED_LANGS: '["de", "uk"]' },
  );
  fs.writeFileSync(path.join(middlewareDir, "markdown-negotiation.ts"), mdNegotiationContent);
}

function setupTempProject(): string {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mw-chain-it-"));
  fs.writeFileSync(path.join(tmpDir, "stubs.d.ts"), STUBS_DTS);
  const tsconfig = {
    compilerOptions: {
      strict: true,
      module: "esnext",
      moduleResolution: "bundler",
      target: "esnext",
      lib: ["esnext", "dom"],
      noEmit: true,
      skipLibCheck: true,
      types: [],
      esModuleInterop: true,
    },
    include: ["src/**/*.ts", "stubs.d.ts"],
  };
  fs.writeFileSync(path.join(tmpDir, "tsconfig.json"), JSON.stringify(tsconfig, null, 2));
  return tmpDir;
}

test("ADR-0039: middleware chain templates typecheck together", () => {
  const tmpDir = setupTempProject();
  try {
    generateMiddlewareChain(tmpDir);
    const diagnostics = typecheck(tmpDir);
    expect(formatDiagnostics(diagnostics)).toBe("");
    expect(diagnostics.length).toBe(0);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("middleware template guards fileURLToPath inside DEV check (CF Workers regression)", () => {
  const tmpDir = setupTempProject();
  try {
    generateMiddlewareChain(tmpDir);
    const middlewareContent = fs.readFileSync(path.join(tmpDir, "src", "middleware.ts"), "utf8");

    // fileURLToPath(import.meta.url) must NOT appear outside of a DEV guard.
    // In Cloudflare Workers, import.meta.url is undefined → TypeError at module load.
    const lines = middlewareContent.split("\n");
    let inDevBranch = false;
    let foundUnguardedFileURLToPath = false;
    for (const line of lines) {
      if (line.includes("import.meta.env.DEV")) inDevBranch = true;
      if (line.includes("fileURLToPath(import.meta.url)") && !inDevBranch) {
        foundUnguardedFileURLToPath = true;
        break;
      }
    }
    expect(foundUnguardedFileURLToPath).toBe(false);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("ADR-0039: integration test catches missing default export (regression guard)", () => {
  const tmpDir = setupTempProject();
  try {
    generateMiddlewareChain(tmpDir);

    const mdNegotiationPath = path.join(tmpDir, "src", "middleware", "markdown-negotiation.ts");
    let content = fs.readFileSync(mdNegotiationPath, "utf8");
    content = content.replace(/export default onRequest;\s*$/, "");
    fs.writeFileSync(mdNegotiationPath, content);

    const diagnostics = typecheck(tmpDir);
    expect(diagnostics.length).toBeGreaterThan(0);
    const messages = formatDiagnostics(diagnostics);
    expect(messages).toContain("has no default export");
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
