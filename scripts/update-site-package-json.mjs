import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const sitePkgPath = join(root, "packages/werkstatt-site/package.json");
const pkg = JSON.parse(readFileSync(sitePkgPath, "utf-8"));

// Domains that were fully moved to werkstatt-shared
const fullyMovedPrefixes = [
  "./ontology",
  "./passport",  // most files moved; remaining files (verify, data, emit, pipeline) are imported via relative paths within werkstatt-site
  "./integration-adapter-supabase-crm",
  "./observability",
  "./surface",
];

// Domains partially moved - remove specific subpaths that no longer exist
// share: most moved, but share/astro stayed
// integration: most moved, but delivery-handler stayed

const newExports = {};
const removedKeys = [];

for (const [key, val] of Object.entries(pkg.exports)) {
  // Check if this key belongs to a fully moved domain
  const isFullyMoved = fullyMovedPrefixes.some(p => key === p || key.startsWith(p + "/"));
  
  if (isFullyMoved) {
    removedKeys.push(key);
    continue;
  }
  
  // For share: remove all except ./share/astro and its subpaths
  if (key === "./share" || (key.startsWith("./share/") && !key.startsWith("./share/astro"))) {
    removedKeys.push(key);
    continue;
  }
  
  // For integration: remove all except ./integration/delivery-handler
  if (key === "./integration" || (key.startsWith("./integration/") && key !== "./integration/delivery-handler")) {
    removedKeys.push(key);
    continue;
  }
  
  // Remove moved check files
  if (key === "./checks/result-helpers" || 
      key === "./checks/suppressions-config" ||
      key === "./checks/lib/astro-site-url" ||
      key === "./checks/lib/i18n") {
    removedKeys.push(key);
    continue;
  }
  
  newExports[key] = val;
}

pkg.exports = newExports;

// Add werkstatt-shared as a dependency
if (!pkg.dependencies) pkg.dependencies = {};
pkg.dependencies["@warpgogol/werkstatt-shared"] = "workspace:*";

writeFileSync(sitePkgPath, JSON.stringify(pkg, null, 2) + "\n");
console.log(`Removed ${removedKeys.length} export entries`);
console.log("Added @warpgogol/werkstatt-shared dependency");
