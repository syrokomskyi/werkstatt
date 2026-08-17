import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
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

const externalImports = new Set();

for (const file of allFiles) {
  const content = readFileSync(file, "utf-8");
  const lines = content.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("//") || trimmed.startsWith("*")) continue;
    if (trimmed.startsWith("import ") || trimmed.startsWith("export ") && trimmed.includes("from ")) {
      const match = trimmed.match(/from\s+["']([^"']+)["']/);
      if (match) {
        const specifier = match[1];
        if (!specifier.startsWith(".") && !specifier.startsWith("node:") && !specifier.startsWith("@warpgogol/")) {
          // Extract package name (handle scoped packages)
          const parts = specifier.split("/");
          const pkg = parts[0].startsWith("@") ? `${parts[0]}/${parts[1]}` : parts[0];
          externalImports.add(pkg);
        }
      }
    }
  }
}

console.log("External dependencies needed:");
for (const dep of [...externalImports].sort()) {
  console.log(`  ${dep}`);
}
