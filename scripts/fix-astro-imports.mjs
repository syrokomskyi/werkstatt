import { readFileSync, writeFileSync, readdirSync } from "node:fs";
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
    } else if (entry.name.endsWith(".ts") || entry.name.endsWith(".mjs") || entry.name.endsWith(".js") || entry.name.endsWith(".astro")) {
      results.push(fullPath);
    }
  }
  return results;
}

const allFiles = findTsFiles(root);
let changedFiles = 0;

// Fix: url-policy and canonical-url are in share/astro/ which stayed in werkstatt-site
// The codemod incorrectly rewrote them to werkstatt-shared/share/url-policy
// They should be @warpgogol/werkstatt-site/share/astro/url-policy
// and @warpgogol/werkstatt-site/share/astro/canonical-url

for (const file of allFiles) {
  let content = readFileSync(file, "utf-8");
  const original = content;

  // url-policy was in share/astro/ — fix incorrect werkstatt-shared references
  content = content.replace(
    /@warpgogol\/werkstatt-shared\/share\/url-policy/g,
    "@warpgogol/werkstatt-site/share/astro/url-policy",
  );
  content = content.replace(
    /@warpgogol\/werkstatt-shared\/share\/canonical-url/g,
    "@warpgogol/werkstatt-site/share/astro/canonical-url",
  );

  // Also fix people-profile-defaults which is in share/astro/
  content = content.replace(
    /@warpgogol\/werkstatt-shared\/share\/people-profile-defaults/g,
    "@warpgogol/werkstatt-site/share/astro/people-profile-defaults",
  );

  if (content !== original) {
    writeFileSync(file, content);
    changedFiles++;
  }
}

console.log(`Fixed ${changedFiles} files with incorrect astro/ imports`);
