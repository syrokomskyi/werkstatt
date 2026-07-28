/**
 * Codegen script: parse tokens.css and generate token-names.generated.ts
 * with the TOKEN_NAMES array extracted from the CSS custom property declarations.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const cssPath = join(__dirname, "..", "src", "tokens.css");
const outPath = join(__dirname, "..", "src", "token-names.generated.ts");

const css = readFileSync(cssPath, "utf8");

// Match --ds-* custom property declarations inside :root
const tokenPattern = /^\s*(--ds-[a-z0-9-]+)\s*:/gm;
const tokens: string[] = [];
let match: RegExpExecArray | null;

while ((match = tokenPattern.exec(css)) !== null) {
  const name = match[1]!;
  if (!tokens.includes(name)) {
    tokens.push(name);
  }
}

// Preserve CSS declaration order
const lines = tokens.map((t) => `  "${t}",`);

const output = `/* GENERATED — do not edit. Run \`pnpm --filter @warpgogol/tokens codegen:token-names\` to regenerate. */

export const TOKEN_NAMES = [
${lines.join("\n")}
] as const;
`;

writeFileSync(outPath, output, "utf8");
console.log(`Generated ${tokens.length} token names → ${outPath}`);
