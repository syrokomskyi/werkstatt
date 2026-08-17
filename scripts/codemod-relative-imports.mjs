import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

function findFiles(dir, results = []) {
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === ".git" || entry.name === "dist" || entry.name === ".turbo" || entry.name === ".astro") continue;
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      findFiles(fullPath, results);
    } else if (entry.name.endsWith(".ts") || entry.name.endsWith(".mjs") || entry.name.endsWith(".js") || entry.name.endsWith(".astro")) {
      results.push(fullPath);
    }
  }
  return results;
}

const siteDir = join(root, "packages/werkstatt-site/src");
const allFiles = findFiles(siteDir);

const movedDomains = [
  "ontology",
  "share",
  "passport",
  "integration-adapter-supabase-crm",
  "observability",
  "surface",
];

let changedFiles = 0;

for (const file of allFiles) {
  let content = readFileSync(file, "utf-8");
  const original = content;

  for (const domain of movedDomains) {
    const pattern = new RegExp("(\\.\\./)+domain/" + domain + "(?=[\"'/])", "g");
    content = content.replace(pattern, "@warpgogol/werkstatt-shared/" + domain);
  }

  // Handle integration specially (not integration-adapter-stripe)
  content = content.replace(/(\.\.\/)+domain\/integration(?=["'\/])/g, "@warpgogol/werkstatt-shared/integration");

  // Replace relative imports to moved check files
  content = content.replace(/(\.\.\/)+checks\/result-helpers/g, "@warpgogol/werkstatt-shared/checks/result-helpers");
  content = content.replace(/(\.\.\/)+checks\/suppressions-config/g, "@warpgogol/werkstatt-shared/checks/suppressions-config");
  content = content.replace(/(\.\.\/)+checks\/lib\/astro-site-url/g, "@warpgogol/werkstatt-shared/checks/lib/astro-site-url");
  content = content.replace(/(\.\.\/)+checks\/lib\/i18n/g, "@warpgogol/werkstatt-shared/checks/lib/i18n");
  content = content.replace(/\.\.\/result-helpers(?=["'])/g, "@warpgogol/werkstatt-shared/checks/result-helpers");
  content = content.replace(/\.\.\/suppressions-config(?=["'])/g, "@warpgogol/werkstatt-shared/checks/suppressions-config");
  content = content.replace(/\.\/lib\/astro-site-url(?=["'])/g, "@warpgogol/werkstatt-shared/checks/lib/astro-site-url");
  content = content.replace(/\.\/lib\/i18n(?=["'])/g, "@warpgogol/werkstatt-shared/checks/lib/i18n");

  if (content !== original) {
    writeFileSync(file, content);
    changedFiles++;
  }
}

console.log(`Updated ${changedFiles} files in werkstatt-site`);
