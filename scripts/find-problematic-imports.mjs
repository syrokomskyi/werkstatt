import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

function findTsFiles(dir, results = []) {
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === ".git" || entry.name === "dist" || entry.name === ".turbo" || entry.name === ".astro") continue;
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      findTsFiles(fullPath, results);
    } else if (entry.name.endsWith(".ts")) {
      results.push(fullPath);
    }
  }
  return results;
}

const sharedSrc = join(root, "packages/werkstatt-shared/src");
const allFiles = findTsFiles(sharedSrc);

const problematicFiles = [];

for (const file of allFiles) {
  const content = readFileSync(file, "utf-8");
  // Check for actual import statements (not comments) from werkstatt-site
  const lines = content.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("<!--")) continue;
    if (trimmed.startsWith("import ") && trimmed.includes("@warpgogol/werkstatt-site/")) {
      const rel = relative(sharedSrc, file);
      problematicFiles.push({ file: rel, import: trimmed });
      break;
    }
  }
}

console.log(`Found ${problematicFiles.length} files with werkstatt-site imports:`);
for (const { file, import: imp } of problematicFiles) {
  console.log(`  ${file}`);
  console.log(`    ${imp}`);
}
