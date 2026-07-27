import { readdir, rm } from "node:fs/promises";
import { join, basename } from "node:path";
import { fileURLToPath } from "node:url";

const TARGETS = new Set(["node_modules", ".turbo", "dist", ".astro", ".cache", ".wrangler"]);

const repoRoot = join(fileURLToPath(import.meta.url), "..", "..");

async function walk(dir, toDelete) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const name = entry.name;
    const fullPath = join(dir, name);
    if (TARGETS.has(name)) {
      toDelete.push(fullPath);
      continue;
    }
    await walk(fullPath, toDelete);
  }
}

const toDelete = [];
await walk(repoRoot, toDelete);

if (toDelete.length === 0) {
  console.log("Nothing to clean.");
  process.exit(0);
}

await Promise.all(toDelete.map((p) => rm(p, { recursive: true, force: true })));

for (const p of toDelete) {
  console.log("deleted", p.replace(repoRoot + "\\", "").replace(repoRoot + "/", ""));
}

console.log(`Cleaned ${toDelete.length} directories.`);
