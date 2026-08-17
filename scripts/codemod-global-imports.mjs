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

const globalReplacements = [
  [/@warpgogol\/werkstatt-site\/integration-adapter-supabase-crm/g, "@warpgogol/werkstatt-shared/integration-adapter-supabase-crm"],
  [/@warpgogol\/werkstatt-site\/integration\/port/g, "@warpgogol/werkstatt-shared/integration/port"],
  [/@warpgogol\/werkstatt-site\/integration\/crm-buffer/g, "@warpgogol/werkstatt-shared/integration/crm-buffer"],
  [/@warpgogol\/werkstatt-site\/integration(?=["'\/])/g, "@warpgogol/werkstatt-shared/integration"],
  [/@warpgogol\/werkstatt-site\/ontology/g, "@warpgogol/werkstatt-shared/ontology"],
  [/@warpgogol\/werkstatt-site\/share(?!\/astro)/g, "@warpgogol/werkstatt-shared/share"],
  [/@warpgogol\/werkstatt-site\/passport(?!\/verify|\/data|\/emit|\/pipeline)/g, "@warpgogol/werkstatt-shared/passport"],
  [/@warpgogol\/werkstatt-site\/observability/g, "@warpgogol/werkstatt-shared/observability"],
  [/@warpgogol\/werkstatt-site\/surface/g, "@warpgogol/werkstatt-shared/surface"],
  [/@warpgogol\/werkstatt-site\/checks\/result-helpers/g, "@warpgogol/werkstatt-shared/checks/result-helpers"],
  [/@warpgogol\/werkstatt-site\/checks\/suppressions-config/g, "@warpgogol/werkstatt-shared/checks/suppressions-config"],
  [/@warpgogol\/werkstatt-site\/checks\/lib\/astro-site-url/g, "@warpgogol/werkstatt-shared/checks/lib/astro-site-url"],
  [/@warpgogol\/werkstatt-site\/checks\/lib\/i18n/g, "@warpgogol/werkstatt-shared/checks/lib/i18n"],
];

// Engine-only: checks barrel
const engineReplacements = [
  [/@warpgogol\/werkstatt-site\/checks(?=["'])/g, "@warpgogol/werkstatt-shared/checks"],
];

const allFiles = findTsFiles(root);
let changedFiles = 0;

for (const file of allFiles) {
  let content = readFileSync(file, "utf-8");
  const original = content;

  for (const [pattern, replacement] of globalReplacements) {
    content = content.replace(pattern, replacement);
  }

  // Engine-only replacements
  const rel = file.replace(root + "/", "");
  if (rel.startsWith("packages/werkstatt/src/") || rel.startsWith("packages/werkstatt/os/")) {
    for (const [pattern, replacement] of engineReplacements) {
      content = content.replace(pattern, replacement);
    }
  }

  if (content !== original) {
    writeFileSync(file, content);
    changedFiles++;
  }
}

console.log(`Updated ${changedFiles} files`);
